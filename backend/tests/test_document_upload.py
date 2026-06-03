"""Unit tests for document upload security: magic-byte validation, filename sanitization, size limits, workspace limits."""
from __future__ import annotations

from io import BytesIO
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.documents.models import Document


def _url(workspace_id: object) -> str:
    return f"/api/v1/workspaces/{workspace_id}/documents/"


# ── File size limit ───────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_upload_rejects_file_over_5mb(auth_client: APIClient, workspace: Any) -> None:
    big_content = b"x" * (5 * 1024 * 1024 + 1)  # 5MB + 1 byte
    f = SimpleUploadedFile("big.pdf", big_content, content_type="application/pdf")

    resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")
    assert resp.status_code == 400
    assert "5MB" in resp.json()["error"]


@pytest.mark.django_db
def test_upload_accepts_file_under_5mb(auth_client: APIClient, workspace: Any) -> None:
    pdf_content = b"%PDF-1.4 small file content"
    f = SimpleUploadedFile("small.pdf", pdf_content, content_type="application/pdf")

    mock_magic = MagicMock()
    mock_magic.from_buffer.return_value = "application/pdf"

    with patch.dict("sys.modules", {"magic": mock_magic}), \
         patch("apps.documents.tasks.ingest_document.delay"):
        resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")

    assert resp.status_code == 201


# ── Unsupported file type ─────────────────────────────────────────────────────


@pytest.mark.django_db
def test_upload_rejects_unsupported_mime_type(auth_client: APIClient, workspace: Any) -> None:
    f = SimpleUploadedFile("script.js", b"alert(1)", content_type="application/javascript")
    resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")
    assert resp.status_code == 400
    assert "Unsupported" in resp.json()["error"]


# ── Magic-byte MIME validation ────────────────────────────────────────────────


@pytest.mark.django_db
def test_upload_rejects_spoofed_content_type(auth_client: APIClient, workspace: Any) -> None:
    """File declares PDF content_type but bytes are HTML."""
    html_content = b"<html><body>Not a PDF</body></html>"
    f = SimpleUploadedFile("fake.pdf", html_content, content_type="application/pdf")

    mock_magic = MagicMock()
    mock_magic.from_buffer.return_value = "text/html"

    with patch.dict("sys.modules", {"magic": mock_magic}):
        resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")

    assert resp.status_code == 400
    assert "does not match" in resp.json()["error"]


# ── Filename sanitization ────────────────────────────────────────────────────


@pytest.mark.django_db
def test_upload_sanitizes_path_traversal_filename(auth_client: APIClient, workspace: Any) -> None:
    """Path traversal in filename should be stripped to basename."""
    content = b"%PDF-1.4 content"
    f = SimpleUploadedFile("../../etc/passwd", content, content_type="application/pdf")

    mock_magic = MagicMock()
    mock_magic.from_buffer.return_value = "application/pdf"

    with patch.dict("sys.modules", {"magic": mock_magic}), \
         patch("apps.documents.tasks.ingest_document.delay"):
        resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")

    assert resp.status_code == 201
    doc = Document.objects.get(id=resp.json()["id"])
    assert "/" not in doc.filename
    assert ".." not in doc.filename
    assert doc.filename == "passwd"


# ── Per-workspace document count limit ────────────────────────────────────────


@pytest.mark.django_db
def test_upload_rejects_when_workspace_at_limit(auth_client: APIClient, workspace: Any, user: Any) -> None:
    for i in range(2):
        Document.objects.create(
            workspace=workspace,
            uploaded_by=user,
            filename=f"doc{i}.pdf",
            file_size_bytes=100,
            mime_type="application/pdf",
            status=Document.Status.READY,
        )

    content = b"%PDF-1.4 content"
    f = SimpleUploadedFile("extra.pdf", content, content_type="application/pdf")

    mock_magic = MagicMock()
    mock_magic.from_buffer.return_value = "application/pdf"

    from django.test import override_settings

    with patch.dict("sys.modules", {"magic": mock_magic}), \
         override_settings(MAX_DOCUMENTS_PER_WORKSPACE=2):
        resp = auth_client.post(_url(workspace.id), {"file": f}, format="multipart")

    assert resp.status_code == 400
    assert "limit" in resp.json()["error"].lower()


# ── VIEWER cannot upload ──────────────────────────────────────────────────────


@pytest.mark.django_db
def test_viewer_cannot_upload(viewer_auth_client: APIClient, workspace: Any) -> None:
    content = b"%PDF-1.4 content"
    f = SimpleUploadedFile("test.pdf", content, content_type="application/pdf")
    resp = viewer_auth_client.post(_url(workspace.id), {"file": f}, format="multipart")
    assert resp.status_code == 403


# ── Member delete restrictions ────────────────────────────────────────────────


@pytest.mark.django_db
def test_member_cannot_delete_others_document(
    workspace: Any, user: Any, other_user: Any
) -> None:
    """A MEMBER should not be able to delete a doc uploaded by another user."""
    from apps.workspaces.models import Membership
    from rest_framework_simplejwt.tokens import RefreshToken

    Membership.objects.get_or_create(
        workspace=workspace, user=other_user,
        defaults={"role": Membership.Role.MEMBER},
    )

    doc = Document.objects.create(
        workspace=workspace,
        uploaded_by=user,
        filename="admin_doc.pdf",
        file_size_bytes=100,
        mime_type="application/pdf",
        status=Document.Status.READY,
    )

    member_client = APIClient()
    member_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {str(RefreshToken.for_user(other_user).access_token)}"
    )

    resp = member_client.delete(f"/api/v1/workspaces/{workspace.id}/documents/{doc.id}/")
    assert resp.status_code == 403


@pytest.mark.django_db
def test_member_can_delete_own_document(
    workspace: Any, other_user: Any
) -> None:
    """A MEMBER should be able to delete their own documents."""
    from apps.workspaces.models import Membership
    from rest_framework_simplejwt.tokens import RefreshToken

    Membership.objects.get_or_create(
        workspace=workspace, user=other_user,
        defaults={"role": Membership.Role.MEMBER},
    )

    doc = Document.objects.create(
        workspace=workspace,
        uploaded_by=other_user,
        filename="my_doc.pdf",
        file_size_bytes=100,
        mime_type="application/pdf",
        status=Document.Status.READY,
    )

    member_client = APIClient()
    member_client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {str(RefreshToken.for_user(other_user).access_token)}"
    )

    resp = member_client.delete(f"/api/v1/workspaces/{workspace.id}/documents/{doc.id}/")
    assert resp.status_code == 204
