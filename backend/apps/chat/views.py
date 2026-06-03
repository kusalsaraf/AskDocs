"""REST API views for chat conversations, message streaming, and quotas.

Handles conversation CRUD, SSE-based message streaming with RAG retrieval,
source citations, and per-user/workspace usage quota reporting.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.chat.exceptions import ConversationNotFound
from apps.chat.limits import get_remaining_global_budget
from apps.chat.models import Conversation, Message
from apps.chat.serializers import (
    ConversationCreateSerializer,
    ConversationListSerializer,
    ConversationSerializer,
    ConversationUpdateSerializer,
    QuotaSerializer,
    SendMessageSerializer,
    SourceChunkSerializer,
)
from apps.chat.services import stream_chat_response
from apps.core.constants import (
    DEFAULT_CONVERSATION_TITLE,
    ERR_INSUFFICIENT_ROLE,
    ERR_INTERNAL,
    MSG_INTERNAL_ERROR,
    MSG_VIEWER_NO_CONVERSATION,
    MSG_VIEWER_NO_MESSAGE,
)
from apps.core.logging import get_logger
from apps.core.pagination import StandardResultsPagination
from apps.core.permissions import IsWorkspaceMemberOrAdmin
from apps.core.workspace_helpers import can_write, get_workspace_or_404, is_admin
from apps.workspaces.models import Workspace

logger = get_logger(__name__)


class _SSERenderer(BaseRenderer):
    """Minimal renderer for Server-Sent Events (text/event-stream)."""

    media_type = "text/event-stream"
    format = "txt"

    def render(self, data, accepted_media_type=None, renderer_context=None):  # noqa: D102
        return data


def _is_using_platform_default(workspace: Workspace) -> bool:
    """Return True if the workspace has no custom provider configuration."""
    from apps.providers.models import ProviderConfig

    return not ProviderConfig.objects.filter(workspace=workspace).exists()


class ConversationListCreateView(APIView):
    """List or create conversations within a workspace.

    GET  — paginated list of conversations, newest first.
    POST — create a new conversation (requires write access).
    """

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        """Return a paginated list of conversations for the workspace."""
        workspace = get_workspace_or_404(workspace_id)

        qs = Conversation.objects.filter(workspace=workspace).order_by(
            "-last_message_at", "-created_at"
        )

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = ConversationListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request, workspace_id: UUID) -> Response:
        """Create a new conversation in the workspace."""
        workspace = get_workspace_or_404(workspace_id)
        if not can_write(workspace, request.user):
            return Response(
                {
                    "error": {
                        "code": ERR_INSUFFICIENT_ROLE,
                        "message": MSG_VIEWER_NO_CONVERSATION,
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data.get("title", DEFAULT_CONVERSATION_TITLE)
        conversation = Conversation.objects.create(
            workspace=workspace,
            created_by=request.user,
            title=title,
        )
        logger.info(
            "Conversation created",
            extra={
                "conversation_id": str(conversation.id),
                "workspace_id": str(workspace_id),
                "user_id": str(request.user.id),
            },
        )
        return Response(
            ConversationListSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


class ConversationDetailView(APIView):
    """Retrieve, update, or delete a single conversation.

    PATCH  — update conversation title.
    DELETE — delete conversation and all its messages.
    """

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def _get_conversation(self, workspace: Workspace, conv_id: UUID) -> Conversation:
        """Fetch conversation or raise ``ConversationNotFound``."""
        try:
            return Conversation.objects.get(id=conv_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None

    def _get_own_conversation(self, workspace: Workspace, conv_id: UUID, user: Any) -> Conversation:
        """Fetch conversation with ownership check for non-admins."""
        conv = self._get_conversation(workspace, conv_id)
        if not is_admin(workspace, user) and conv.created_by != user:
            raise ConversationNotFound()
        return conv

    def get(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        """Return conversation details with its messages."""
        workspace = get_workspace_or_404(workspace_id)
        conv = self._get_conversation(workspace, conversation_id)
        return Response(ConversationSerializer(conv).data)

    def patch(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        """Update conversation metadata (e.g. title)."""
        workspace = get_workspace_or_404(workspace_id)
        conv = self._get_own_conversation(workspace, conversation_id, request.user)
        serializer = ConversationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for attr, value in serializer.validated_data.items():
            setattr(conv, attr, value)
        conv.save(update_fields=list(serializer.validated_data.keys()))
        return Response(ConversationSerializer(conv).data)

    def delete(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        """Delete a conversation and all associated messages."""
        workspace = get_workspace_or_404(workspace_id)
        conv = self._get_own_conversation(workspace, conversation_id, request.user)
        conv.delete()
        logger.info(
            "Conversation deleted",
            extra={
                "conversation_id": str(conversation_id),
                "workspace_id": str(workspace_id),
                "user_id": str(request.user.id),
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageStreamView(APIView):
    """Send a message and stream the AI response via Server-Sent Events.

    The response includes retrieval, token-by-token streaming, and
    source citation events.
    """

    permission_classes = [IsWorkspaceMemberOrAdmin]
    renderer_classes = [_SSERenderer]

    def post(
        self, request: Request, workspace_id: UUID, conversation_id: UUID
    ) -> StreamingHttpResponse:
        """Stream a RAG-augmented AI response for the given user message."""
        workspace = get_workspace_or_404(workspace_id)
        if not can_write(workspace, request.user):
            return Response(
                {
                    "error": {
                        "code": ERR_INSUFFICIENT_ROLE,
                        "message": MSG_VIEWER_NO_MESSAGE,
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            conv = Conversation.objects.get(id=conversation_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None

        serializer = SendMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        content = serializer.validated_data["content"]
        top_k = serializer.validated_data.get("top_k", 5)

        def event_stream():
            try:
                for event in stream_chat_response(
                    workspace=workspace,
                    conversation=conv,
                    user_message_content=content,
                    user=request.user,
                    top_k=top_k,
                ):
                    yield f"event: {event.type}\ndata: {json.dumps(event.to_dict())}\n\n"
            except Exception:
                logger.exception(
                    "Stream error",
                    extra={
                        "conversation_id": str(conversation_id),
                        "workspace_id": str(workspace_id),
                        "user_id": str(request.user.id),
                    },
                )
                yield (
                    f"event: error\ndata: "
                    f'{json.dumps({"code": ERR_INTERNAL, "message": MSG_INTERNAL_ERROR})}\n\n'
                )

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class MessageSourcesView(APIView):
    """Return the document sources cited in a specific AI message."""

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(
        self,
        request: Request,
        workspace_id: UUID,
        conversation_id: UUID,
        message_id: UUID,
    ) -> Response:
        """Return the retrieved document chunks for a specific message."""
        workspace = get_workspace_or_404(workspace_id)
        try:
            conv = Conversation.objects.get(id=conversation_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None

        msg = get_object_or_404(Message, id=message_id, conversation=conv, workspace=workspace)
        sources = [
            {
                "chunk_id": chunk["chunk_id"],
                "excerpt": chunk["content"],
                "document_id": chunk["document_id"],
                "document_filename": chunk.get("document_filename", ""),
                "page_number": chunk.get("page_number"),
                "score": chunk.get("score"),
            }
            for chunk in msg.retrieved_chunks
        ]
        serializer = SourceChunkSerializer(sources, many=True)
        return Response(serializer.data)


class QuotaView(APIView):
    """Return the user's current chat usage and remaining quotas."""

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        """Return usage counts and limits for the authenticated user."""
        from django.conf import settings

        from apps.chat.limits import get_user_workspace_usage_today, get_workspace_usage_today

        workspace = get_workspace_or_404(workspace_id)
        using_platform_default = _is_using_platform_default(workspace)
        used_today = get_user_workspace_usage_today(request.user.id, workspace_id)
        limit = settings.USER_DAILY_MESSAGE_LIMIT

        global_remaining = None
        if using_platform_default:
            global_remaining = get_remaining_global_budget()

        workspace_usage = None
        if is_admin(workspace, request.user):
            workspace_usage = get_workspace_usage_today(workspace_id)

        data = {
            "user_messages_used_today": used_today,
            "user_messages_limit": limit,
            "using_platform_default": using_platform_default,
            "global_budget_remaining": global_remaining,
            "workspace_usage": workspace_usage,
        }
        return Response(QuotaSerializer(data).data)
