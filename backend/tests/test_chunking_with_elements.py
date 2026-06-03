"""Tests for the element-aware document chunker."""
from __future__ import annotations

import pytest

tiktoken = pytest.importorskip("tiktoken", reason="tiktoken not installed (Docker-only dep)")

from apps.documents.chunking import Chunk, chunk_elements
from apps.documents.parsing.base import ParsedElement


def _el(content: str, etype: str = "NarrativeText", page: int | None = 1) -> ParsedElement:
    return ParsedElement(content=content, element_type=etype, page_number=page)


def test_empty_elements_returns_empty_list():
    assert chunk_elements([]) == []


def test_single_short_narrative_produces_one_chunk():
    elements = [_el("This is a short sentence about remote work policy.")]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].element_type == "NarrativeText"
    assert "remote work" in chunks[0].content


def test_table_element_stays_as_single_chunk():
    table_html = "<table><tr><td>Day</td><td>Hours</td></tr><tr><td>Mon</td><td>8</td></tr></table>"
    elements = [_el(table_html, "Table")]
    chunks = chunk_elements(elements)
    assert len(chunks) == 1
    assert chunks[0].element_type == "Table"
    assert "<table>" in chunks[0].content


def test_title_flushes_pending_prose_and_starts_new_chunk():
    elements = [
        _el("Introduction content here.", "NarrativeText"),
        _el("Section Two Title", "Title"),
        _el("Section Two content here.", "NarrativeText"),
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) >= 2
    title_chunks = [c for c in chunks if c.element_type == "Title"]
    assert len(title_chunks) >= 1


def test_header_acts_as_boundary():
    elements = [
        _el("Before header.", "NarrativeText"),
        _el("Chapter Header", "Header"),
        _el("After header.", "NarrativeText"),
    ]
    chunks = chunk_elements(elements)
    assert len(chunks) >= 2
    header_chunks = [c for c in chunks if c.element_type == "Header"]
    assert len(header_chunks) >= 1


def test_mixed_elements_all_have_element_type():
    elements = [
        _el("Overview", "Title"),
        _el("Employees can work remotely.", "NarrativeText"),
        _el("<table><tr><td>Day</td><td>Count</td></tr></table>", "Table"),
    ]
    chunks = chunk_elements(elements)
    for chunk in chunks:
        assert chunk.element_type != ""
    types = {c.element_type for c in chunks}
    assert "Table" in types


def test_long_text_splits_into_multiple_chunks():
    # ~600 tokens of text (over the 512 limit)
    long_text = "The quick brown fox jumps over the lazy dog. " * 60
    elements = [_el(long_text, "NarrativeText")]
    chunks = chunk_elements(elements)
    assert len(chunks) >= 2
    for chunk in chunks:
        assert len(chunk.content) > 0


def test_page_break_flushes_without_producing_chunk():
    elements = [
        _el("Before break.", "NarrativeText", page=1),
        _el("", "PageBreak", page=None),
        _el("After break.", "NarrativeText", page=2),
    ]
    chunks = chunk_elements(elements)
    # PageBreak itself should not appear as a chunk element_type
    assert all(c.element_type != "PageBreak" for c in chunks)
    assert any("Before break" in c.content for c in chunks)
    assert any("After break" in c.content for c in chunks)


def test_table_and_prose_interleaved():
    elements = [
        _el("Introduction.", "NarrativeText"),
        _el("<table><tr><td>A</td></tr></table>", "Table"),
        _el("Conclusion.", "NarrativeText"),
    ]
    chunks = chunk_elements(elements)
    table_chunks = [c for c in chunks if c.element_type == "Table"]
    assert len(table_chunks) == 1
    assert len(chunks) >= 2


def test_chunk_page_number_propagates():
    elements = [_el("Content on page 5.", "NarrativeText", page=5)]
    chunks = chunk_elements(elements)
    assert chunks[0].page_number == 5
