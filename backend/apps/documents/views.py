from __future__ import annotations

import base64
from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsWorkspaceMemberOrAdmin
from apps.documents.models import Document
from apps.documents.serializers import DocumentSerializer
from apps.documents.tasks import ingest_document
from apps.workspaces.models import Membership, Workspace


def _get_workspace_or_404(workspace_id: UUID) -> Workspace:
    return get_object_or_404(Workspace, id=workspace_id)


def _get_user_role(workspace: Workspace, user: Any) -> str | None:
    try:
        return Membership.objects.get(workspace=workspace, user=user).role
    except Membership.DoesNotExist:
        return None


def _is_admin(workspace: Workspace, user: Any) -> bool:
    return _get_user_role(workspace, user) == Membership.Role.ADMIN


def _can_write(workspace: Workspace, user: Any) -> bool:
    role = _get_user_role(workspace, user)
    return role in (Membership.Role.ADMIN, Membership.Role.MEMBER)


class DocumentListCreateView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        qs = (
            Document.objects.filter(workspace=workspace)
            .select_related("uploaded_by")
            .order_by("-created_at")
        )
        if not _is_admin(workspace, request.user):
            qs = qs.filter(uploaded_by=request.user)
        return Response(DocumentSerializer(qs, many=True).data)

    def post(self, request: Request, workspace_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        if not _can_write(workspace, request.user):
            return Response(
                {"error": {"code": "insufficient_role", "message": "VIEWER role cannot upload documents."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        doc = Document.objects.create(
            workspace=workspace,
            uploaded_by=request.user,
            filename=file.name,
            file_size_bytes=file.size,
            mime_type=file.content_type or "",
            status=Document.Status.PENDING,
        )
        ingest_document.delay(str(doc.id), base64.b64encode(file.read()).decode())
        return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID, document_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        doc = get_object_or_404(Document, id=document_id, workspace=workspace)
        return Response(DocumentSerializer(doc).data)

    def delete(self, request: Request, workspace_id: UUID, document_id: UUID) -> Response:
        workspace = _get_workspace_or_404(workspace_id)
        doc = get_object_or_404(Document, id=document_id, workspace=workspace)
        if not _is_admin(workspace, request.user) and doc.uploaded_by != request.user:
            return Response(status=status.HTTP_403_FORBIDDEN)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
