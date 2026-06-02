"""Unit tests for UnstructuredParserProvider — all SDK calls are mocked."""
from __future__ import annotations

import sys
from types import ModuleType
from unittest.mock import MagicMock, patch

import pytest

from apps.documents.exceptions import ParserStrategyUnavailable
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider


def _make_element(type_name: str, text: str, page: int | None = 1, html: str | None = None):
    el = MagicMock()
    el.__class__.__name__ = type_name
    el.__str__ = lambda self: text
    el.metadata.page_number = page
    el.metadata.text_as_html = html
    el.metadata.filename = "test.pdf"
    return el


def _patch_partition(mock_elements):
    """Context manager: inject a fake unstructured.partition.auto module."""
    fake_module = ModuleType("unstructured.partition.auto")
    fake_module.partition = MagicMock(return_value=mock_elements)
    return patch.dict(sys.modules, {"unstructured.partition.auto": fake_module})


@pytest.mark.django_db
def test_parse_pdf_fast_returns_elements():
    mock_elements = [
        _make_element("Title", "Acme Corp Policy", 1),
        _make_element("NarrativeText", "Employees may work 3 days remotely.", 1),
    ]
    with _patch_partition(mock_elements):
        result = UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert len(result.elements) == 2
    assert result.elements[0].element_type == "Title"
    assert result.elements[0].content == "Acme Corp Policy"
    assert result.elements[1].element_type == "NarrativeText"
    assert result.metadata["strategy_used"] == "fast"


@pytest.mark.django_db
def test_parse_table_uses_html_content():
    html = "<table><tr><td>Day</td><td>Hours</td></tr></table>"
    mock_elements = [_make_element("Table", "Day Hours", page=2, html=html)]
    with _patch_partition(mock_elements):
        result = UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert result.elements[0].element_type == "Table"
    assert "<table>" in result.elements[0].content


@pytest.mark.django_db
def test_parse_table_falls_back_to_str_when_no_html():
    mock_elements = [_make_element("Table", "Row1 Row2", page=1, html=None)]
    with _patch_partition(mock_elements):
        result = UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert result.elements[0].content == "Row1 Row2"


@pytest.mark.django_db
def test_parse_returns_page_numbers():
    mock_elements = [
        _make_element("NarrativeText", "Page one.", 1),
        _make_element("NarrativeText", "Page two.", 2),
    ]
    with _patch_partition(mock_elements):
        result = UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="fast")

    assert result.elements[0].page_number == 1
    assert result.elements[1].page_number == 2
    assert result.metadata["page_count"] == 2


@pytest.mark.django_db
def test_txt_parsed_as_narrative():
    mock_elements = [_make_element("NarrativeText", "Hello world.", None)]
    with _patch_partition(mock_elements):
        result = UnstructuredParserProvider().parse(b"Hello world.", file_type="txt", strategy="fast")

    assert len(result.elements) == 1
    assert result.elements[0].element_type == "NarrativeText"


@pytest.mark.django_db
def test_hi_res_raises_strategy_unavailable_when_deps_missing():
    provider = UnstructuredParserProvider()
    with patch(
        "apps.documents.parsing.unstructured_provider._check_hi_res_deps",
        side_effect=ParserStrategyUnavailable(strategy="hi_res"),
    ):
        with pytest.raises(ParserStrategyUnavailable) as exc_info:
            provider.parse(b"%PDF fake", file_type="pdf", strategy="hi_res")

    assert exc_info.value.strategy == "hi_res"


@pytest.mark.django_db
def test_ocr_only_raises_not_implemented():
    with pytest.raises(NotImplementedError):
        UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="ocr_only")


@pytest.mark.django_db
def test_unknown_strategy_raises_strategy_unavailable():
    with pytest.raises(ParserStrategyUnavailable):
        UnstructuredParserProvider().parse(b"%PDF fake", file_type="pdf", strategy="magic")
