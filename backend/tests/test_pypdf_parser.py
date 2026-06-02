"""Unit tests for PypdfParserProvider."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from apps.documents.exceptions import ParserStrategyUnavailable
from apps.documents.parsing.pypdf_provider import PypdfParserProvider


def _make_page(text: str) -> MagicMock:
    page = MagicMock()
    page.extract_text.return_value = text
    return page


@pytest.mark.django_db
def test_pypdf_parses_pages_returns_narrative_text():
    mock_reader = MagicMock()
    mock_reader.pages = [_make_page("Page one text."), _make_page("Page two text.")]
    with patch("pypdf.PdfReader", return_value=mock_reader):
        result = PypdfParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert len(result.elements) == 2
    assert result.elements[0].element_type == "NarrativeText"
    assert result.elements[0].page_number == 1
    assert result.elements[1].page_number == 2
    assert result.metadata["page_count"] == 2


@pytest.mark.django_db
def test_pypdf_skips_blank_pages():
    mock_reader = MagicMock()
    mock_reader.pages = [_make_page(""), _make_page("   "), _make_page("Real content.")]
    with patch("pypdf.PdfReader", return_value=mock_reader):
        result = PypdfParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert len(result.elements) == 1
    assert result.elements[0].page_number == 3


@pytest.mark.django_db
def test_pypdf_rejects_hi_res_strategy():
    with pytest.raises(ParserStrategyUnavailable) as exc_info:
        PypdfParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="hi_res")
    assert "pypdf" in str(exc_info.value).lower() or "fast" in str(exc_info.value)


@pytest.mark.django_db
def test_pypdf_rejects_non_pdf_file_type():
    with pytest.raises(ParserStrategyUnavailable):
        PypdfParserProvider().parse(b"docx bytes", file_type="docx", strategy="fast")
