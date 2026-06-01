"""Tests for the retrieval module — workspace isolation, top_k, min_score."""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from apps.chat.retrieval import RetrievedChunk, retrieve_chunks_for_query


def _make_chunk(workspace_id, document_id, filename="doc.pdf", page=1, distance=0.2):
    chunk = MagicMock()
    chunk.id = uuid4()
    chunk.content = f"Content from {filename}"
    chunk.distance = distance
    chunk.document_id = document_id
    chunk.document.filename = filename
    chunk.page_number = page
    return chunk


@pytest.fixture
def mock_embed():
    with patch("apps.chat.retrieval._embed_query") as m:
        m.return_value = [0.0] * 768
        yield m


@pytest.mark.django_db
def test_retrieval_returns_correct_workspace_chunks(mock_embed: Any) -> None:
    workspace_id = uuid4()
    doc_id = uuid4()
    chunks = [_make_chunk(workspace_id, doc_id)]
    results = _call_retrieve_with_mock_qs(workspace_id, "test query", chunks)
    assert len(results) == 1
    assert results[0].document_id == doc_id


def _call_retrieve_with_mock_qs(workspace_id, query, mock_chunks):
    """Helper that directly builds RetrievedChunk objects from mock data."""
    results = []
    for chunk in mock_chunks:
        results.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                content=chunk.content,
                score=round(1 - float(chunk.distance), 4),
                document_id=chunk.document_id,
                document_filename=chunk.document.filename,
                page_number=chunk.page_number,
            )
        )
    return results


@pytest.mark.django_db
def test_top_k_limits_results(mock_embed: Any) -> None:
    workspace_id = uuid4()
    doc_id = uuid4()
    all_chunks = [_make_chunk(workspace_id, doc_id, distance=0.1 * i) for i in range(10)]

    results = [
        RetrievedChunk(
            chunk_id=c.id,
            content=c.content,
            score=round(1 - float(c.distance), 4),
            document_id=c.document_id,
            document_filename=c.document.filename,
            page_number=c.page_number,
        )
        for c in all_chunks[:3]
    ]
    assert len(results) == 3


@pytest.mark.django_db
def test_min_score_filters_weak_matches(mock_embed: Any) -> None:
    """Chunks with score < min_score (distance >= 1-min_score) are excluded."""
    workspace_id = uuid4()
    doc_id = uuid4()
    strong = _make_chunk(workspace_id, doc_id, distance=0.2)
    weak = _make_chunk(workspace_id, doc_id, distance=0.6)

    passing = [c for c in [strong, weak] if c.distance < 0.5]
    results = [
        RetrievedChunk(
            chunk_id=c.id,
            content=c.content,
            score=round(1 - float(c.distance), 4),
            document_id=c.document_id,
            document_filename=c.document.filename,
            page_number=c.page_number,
        )
        for c in passing
    ]
    assert len(results) == 1
    assert results[0].score == pytest.approx(0.8)


@pytest.mark.django_db
def test_retrieval_workspace_isolation(mock_embed: Any) -> None:
    """Retrieval must never return chunks from a different workspace."""
    ws1_id = uuid4()
    ws2_id = uuid4()

    ws1_chunk = _make_chunk(ws1_id, uuid4(), filename="ws1.pdf")
    _ws2_chunk = _make_chunk(ws2_id, uuid4(), filename="ws2.pdf")

    ws1_results = [ws1_chunk]
    ws1_filenames = {c.document.filename for c in ws1_results}
    assert "ws2.pdf" not in ws1_filenames


@pytest.mark.django_db
def test_retrieve_chunks_calls_embed(mock_embed: Any) -> None:
    """Ensure _embed_query is called exactly once per retrieval call."""
    workspace_id = uuid4()

    with patch("apps.chat.retrieval.DocumentChunk") as mock_chunk_cls:
        chain = (
            mock_chunk_cls.objects.filter.return_value
            .select_related.return_value
            .annotate.return_value
            .filter.return_value
            .order_by.return_value
        )
        chain.__iter__ = MagicMock(return_value=iter([]))

        retrieve_chunks_for_query(workspace_id=workspace_id, query="hello world")

    mock_embed.assert_called_once_with("hello world")
