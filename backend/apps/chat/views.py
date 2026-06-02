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


class _SSERenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "txt"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

from apps.chat.exceptions import ConversationNotFound
from apps.chat.limits import get_remaining_global_budget, get_user_messages_used_today
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
from apps.core.logging import get_logger
from apps.core.pagination import StandardResultsPagination
from apps.core.permissions import IsWorkspaceMemberOrAdmin
from apps.workspaces.models import Membership, Workspace

logger = get_logger(__name__)


def _get_workspace_or_404(workspace_id: UUID) -> Workspace:
    return get_object_or_404(Workspace, id=workspace_id)


def _get_user_role(workspace: Workspace, user: Any) -> str | None:
    try:
        return Membership.objects.get(workspace=workspace, user=user).role
    except Membership.DoesNotExist:
        return None


def _can_write(workspace: Workspace, user: Any) -> bool:
    role = _get_user_role(workspace, user)
    return role in (Membership.Role.ADMIN, Membership.Role.MEMBER)


def _is_admin(workspace: Workspace, user: Any) -> bool:
    return _get_user_role(workspace, user) == Membership.Role.ADMIN


def _is_using_platform_default(workspace: Workspace) -> bool:
    from apps.providers.models import ProviderConfig

    return not ProviderConfig.objects.filter(workspace=workspace).exists()


class ConversationListCreateView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        is_admin = _is_admin(workspace, request.user)

        qs = Conversation.objects.filter(workspace=workspace).order_by(
            "-last_message_at", "-created_at"
        )
        if not is_admin:
            qs = qs.filter(created_by=request.user)

        paginator = StandardResultsPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = ConversationListSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request: Request, workspace_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        if not _can_write(workspace, request.user):
            return Response(
                {
                    "error": {
                        "code": "insufficient_role",
                        "message": "VIEWER role cannot create conversations.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ConversationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        title = serializer.validated_data.get("title", "New conversation")
        conversation = Conversation.objects.create(
            workspace=workspace,
            created_by=request.user,
            title=title,
        )
        return Response(
            ConversationListSerializer(conversation).data, status=status.HTTP_201_CREATED
        )


class ConversationDetailView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def _get_conversation(self, workspace: Workspace, conv_id: UUID, user: Any) -> Conversation:
        try:
            conv = Conversation.objects.get(id=conv_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None
        is_admin = _is_admin(workspace, user)
        if not is_admin and conv.created_by != user:
            raise ConversationNotFound()
        return conv

    def get(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        conv = self._get_conversation(workspace, conversation_id, request.user)
        return Response(ConversationSerializer(conv).data)

    def patch(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        conv = self._get_conversation(workspace, conversation_id, request.user)
        serializer = ConversationUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        for attr, value in serializer.validated_data.items():
            setattr(conv, attr, value)
        conv.save(update_fields=list(serializer.validated_data.keys()))
        return Response(ConversationSerializer(conv).data)

    def delete(self, request: Request, workspace_id: UUID, conversation_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        conv = self._get_conversation(workspace, conversation_id, request.user)
        conv.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MessageStreamView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]
    renderer_classes = [_SSERenderer]

    def post(
        self, request: Request, workspace_id: UUID, conversation_id: UUID
    ) -> StreamingHttpResponse:
        workspace = _get_workspace_or_404(workspace_id)
        if not _can_write(workspace, request.user):
            return Response(
                {
                    "error": {
                        "code": "insufficient_role",
                        "message": "VIEWER role cannot send messages.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            conv = Conversation.objects.get(id=conversation_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None
        is_admin = _is_admin(workspace, request.user)
        if not is_admin and conv.created_by != request.user:
            raise ConversationNotFound()

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
            except Exception as exc:
                logger.error("Stream error", extra={"error": str(exc)})
                yield (
                    f"event: error\ndata: "
                    f"{json.dumps({'code': 'internal_error', 'message': str(exc)})}\n\n"
                )

        response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class MessageSourcesView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(
        self,
        request: Request,
        workspace_id: UUID,
        conversation_id: UUID,
        message_id: UUID,
    ) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        try:
            conv = Conversation.objects.get(id=conversation_id, workspace=workspace)
        except Conversation.DoesNotExist:
            raise ConversationNotFound() from None
        is_admin = _is_admin(workspace, request.user)
        if not is_admin and conv.created_by != request.user:
            raise ConversationNotFound()

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
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        from django.conf import settings

        workspace = _get_workspace_or_404(workspace_id)
        using_platform_default = _is_using_platform_default(workspace)
        used_today = get_user_messages_used_today(request.user.id)
        limit = settings.USER_DAILY_MESSAGE_LIMIT

        global_remaining = None
        if using_platform_default:
            global_remaining = get_remaining_global_budget()

        data = {
            "user_messages_used_today": used_today,
            "user_messages_limit": limit,
            "using_platform_default": using_platform_default,
            "global_budget_remaining": global_remaining,
        }
        return Response(QuotaSerializer(data).data)
