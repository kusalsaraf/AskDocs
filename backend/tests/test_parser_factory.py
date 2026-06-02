"""Tests for the parser factory and registry."""
from __future__ import annotations

import pytest
from django.test import override_settings

from apps.documents.exceptions import UnsupportedFileType
from apps.documents.parsing.pypdf_provider import PypdfParserProvider
from apps.documents.parsing.simple_provider import SimpleParserProvider
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider


def test_get_parser_provider_returns_unstructured_by_default():
    with override_settings(PARSER_PROVIDER="unstructured"):
        from apps.documents.parsing.factory import get_parser_provider
        provider = get_parser_provider()
    assert isinstance(provider, UnstructuredParserProvider)


def test_get_parser_provider_returns_pypdf():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_provider
        provider = get_parser_provider()
    assert isinstance(provider, PypdfParserProvider)


def test_get_parser_provider_raises_on_unknown_name():
    with override_settings(PARSER_PROVIDER="unknown_parser"):
        from apps.documents.parsing.factory import get_parser_provider
        with pytest.raises(ValueError, match="Unknown PARSER_PROVIDER"):
            get_parser_provider()


def test_get_parser_for_pdf_returns_unstructured_when_active():
    with override_settings(PARSER_PROVIDER="unstructured"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        provider = get_parser_for_file_type("pdf")
    assert isinstance(provider, UnstructuredParserProvider)


def test_get_parser_for_pdf_returns_pypdf_when_pypdf_active():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        provider = get_parser_for_file_type("pdf")
    assert isinstance(provider, PypdfParserProvider)


def test_get_parser_for_docx_falls_back_to_simple_when_pypdf_active():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        provider = get_parser_for_file_type("docx")
    assert isinstance(provider, SimpleParserProvider)


def test_get_parser_for_txt_falls_back_to_simple_when_pypdf_active():
    with override_settings(PARSER_PROVIDER="pypdf"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        provider = get_parser_for_file_type("txt")
    assert isinstance(provider, SimpleParserProvider)


def test_get_parser_for_unsupported_type_raises():
    with override_settings(PARSER_PROVIDER="unstructured"):
        from apps.documents.parsing.factory import get_parser_for_file_type
        with pytest.raises(UnsupportedFileType):
            get_parser_for_file_type("xlsx")
