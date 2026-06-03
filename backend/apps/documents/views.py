"""REST API views for document management (upload, list, detail, delete).

Handles file validation (size, MIME type, magic-byte verification),
filename sanitization, per-workspace document limits, and role-based
access control.
"""
from __future__ import annotations

import base64
import os
from uuid import UUID

from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.constants import (
    ALLOWED_MIME_TYPES,
    ERR_INSUFFICIENT_ROLE,
    MAGIC_BYTE_READ_SIZE,
    MAX_FILENAME_LENGTH,
    MAX_UPLOAD_BYTES,
    MSG_VIEWER_NO_UPLOAD,
)
from apps.core.logging import get_logger
from apps.core.permissions import IsWorkspaceMemberOrAdmin
from apps.core.workspace_helpers import can_write, get_workspace_or_404, is_admin
from apps.documents.models import Document
from apps.documents.serializers import DocumentSerializer
from apps.documents.tasks import ingest_document

logger = get_logger(__name__)


class DocumentListCreateView(APIView):
    """List workspace documents or upload a new one.

    GET  — returns all documents in the workspace.
    POST — validates and uploads a document, then queues async ingestion.
    """

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID) -> Response:
        """Return all documents in the workspace, newest first."""
        workspace = get_workspace_or_404(workspace_id)
        qs = (
            Document.objects.filter(workspace=workspace)
            .select_related("uploaded_by")
            .order_by("-created_at")
        )
        return Response(DocumentSerializer(qs, many=True).data)

    def post(self, request: Request, workspace_id: UUID) -> Response:
        """Upload a document after validation checks.

        Validates: role, file presence, size (5 MB), declared MIME type,
        magic-byte MIME match, and per-workspace document limit.
        """
        workspace = get_workspace_or_404(workspace_id)

        if not can_write(workspace, request.user):
            logger.warning(
                "Upload denied — insufficient role",
                extra={"workspace_id": str(workspace_id), "user_id": str(request.user.id)},
            )
            return Response(
                {"error": {"code": ERR_INSUFFICIENT_ROLE, "message": MSG_VIEWER_NO_UPLOAD}},
                status=status.HTTP_403_FORBIDDEN,
            )

        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        if file.size > MAX_UPLOAD_BYTES:
            return Response(
                {"error": "File exceeds 5MB size limit."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if file.content_type not in ALLOWED_MIME_TYPES:
            return Response(
                {"error": "Unsupported file type. Allowed: PDF, DOCX, TXT."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        import magic

        detected_mime = magic.from_buffer(file.read(MAGIC_BYTE_READ_SIZE), mime=True)
        file.seek(0)
        if detected_mime not in ALLOWED_MIME_TYPES:
            logger.warning(
                "Upload rejected — MIME mismatch",
                extra={
                    "workspace_id": str(workspace_id),
                    "declared": file.content_type,
                    "detected": detected_mime,
                    "doc_filename": file.name,
                },
            )
            return Response(
                {"error": f"File content does not match declared type. Detected: {detected_mime}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        max_docs = getattr(django_settings, "MAX_DOCUMENTS_PER_WORKSPACE", 50)
        current_count = Document.objects.filter(workspace=workspace).exclude(
            status=Document.Status.FAILED
        ).count()
        if current_count >= max_docs:
            return Response(
                {
                    "error": (
                        f"Workspace document limit of {max_docs} reached. "
                        "Delete unused documents to upload new ones."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        safe_filename = os.path.basename(file.name)[:MAX_FILENAME_LENGTH]

        doc = Document.objects.create(
            workspace=workspace,
            uploaded_by=request.user,
            filename=safe_filename,
            file_size_bytes=file.size,
            mime_type=file.content_type or "",
            status=Document.Status.PENDING,
        )
        try:
            ingest_document.delay(str(doc.id), base64.b64encode(file.read()).decode())
        except Exception:
            doc.status = Document.Status.FAILED
            doc.error_message = "Upload saved but processing could not be started. Please try again."
            doc.save(update_fields=["status", "error_message"])
            logger.exception("Failed to enqueue document ingestion", extra={"document_id": str(doc.id)})

        logger.info(
            "Document uploaded",
            extra={
                "document_id": str(doc.id),
                "workspace_id": str(workspace_id),
                "doc_filename": safe_filename,
                "size_bytes": file.size,
                "user_id": str(request.user.id),
            },
        )
        return Response(DocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    """Retrieve or delete a single document.

    Deletion is restricted: admins can delete any document, members
    can only delete their own uploads, and viewers cannot delete.
    """

    permission_classes = [IsWorkspaceMemberOrAdmin]

    def get(self, request: Request, workspace_id: UUID, document_id: UUID) -> Response:
        """Return a single document's metadata."""
        workspace = get_workspace_or_404(workspace_id)
        doc = get_object_or_404(Document, id=document_id, workspace=workspace)
        return Response(DocumentSerializer(doc).data)

    def delete(self, request: Request, workspace_id: UUID, document_id: UUID) -> Response:
        """Delete a document and its associated chunks.

        Admins can delete any document; members can only delete their own.
        """
        workspace = get_workspace_or_404(workspace_id)
        doc = get_object_or_404(Document, id=document_id, workspace=workspace)
        if not is_admin(workspace, request.user) and doc.uploaded_by != request.user:
            return Response(
                {"error": {"code": "permission_denied", "message": "You can only delete documents you uploaded."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        doc.delete()
        logger.info(
            "Document deleted",
            extra={
                "document_id": str(document_id),
                "workspace_id": str(workspace_id),
                "user_id": str(request.user.id),
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
