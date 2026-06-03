"""Unit tests for document task safety: reap_stuck_documents, NUL byte handling."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from django.utils import timezone

from apps.documents.models import Document


@pytest.mark.django_db
def test_reap_stuck_documents_marks_pending_as_failed(workspace: Any, user: Any) -> None:
    """Documents stuck in PENDING for >30 min should be marked FAILED."""
    from apps.documents.tasks import reap_stuck_documents

    doc = Document.objects.create(
        workspace=workspace,
        uploaded_by=user,
        filename="stuck.pdf",
        file_size_bytes=100,
        mime_type="application/pdf",
        status=Document.Status.PENDING,
    )
    Document.objects.filter(id=doc.id).update(
        updated_at=timezone.now() - timedelta(minutes=45)
    )

    count = reap_stuck_documents()
    assert count == 1

    doc.refresh_from_db()
    assert doc.status == Document.Status.FAILED
    assert "timed out" in doc.error_message


@pytest.mark.django_db
def test_reap_stuck_documents_skips_recent(workspace: Any, user: Any) -> None:
    """Documents updated within 30 min should NOT be reaped."""
    from apps.documents.tasks import reap_stuck_documents

    Document.objects.create(
        workspace=workspace,
        uploaded_by=user,
        filename="recent.pdf",
        file_size_bytes=100,
        mime_type="application/pdf",
        status=Document.Status.PROCESSING,
    )

    count = reap_stuck_documents()
    assert count == 0


@pytest.mark.django_db
def test_reap_stuck_documents_skips_ready(workspace: Any, user: Any) -> None:
    """Documents in READY status should never be reaped regardless of age."""
    from apps.documents.tasks import reap_stuck_documents

    doc = Document.objects.create(
        workspace=workspace,
        uploaded_by=user,
        filename="done.pdf",
        file_size_bytes=100,
        mime_type="application/pdf",
        status=Document.Status.READY,
    )
    Document.objects.filter(id=doc.id).update(
        updated_at=timezone.now() - timedelta(hours=2)
    )

    count = reap_stuck_documents()
    assert count == 0
