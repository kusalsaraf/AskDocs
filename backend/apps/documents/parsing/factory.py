from __future__ import annotations

from django.conf import settings

from apps.documents.exceptions import UnsupportedFileType
from apps.documents.parsing.base import ParserProvider
from apps.documents.parsing.pypdf_provider import PypdfParserProvider
from apps.documents.parsing.unstructured_provider import UnstructuredParserProvider

PARSER_PROVIDER_REGISTRY: dict[str, type[ParserProvider]] = {
    "unstructured": UnstructuredParserProvider,
    "pypdf": PypdfParserProvider,
}

_SUPPORTED_FILE_TYPES = {"pdf", "docx", "txt"}


def get_parser_provider() -> ParserProvider:
    """Returns the active parser provider based on PARSER_PROVIDER setting (default: unstructured)."""
    name = getattr(settings, "PARSER_PROVIDER", "unstructured")
    cls = PARSER_PROVIDER_REGISTRY.get(name)
    if cls is None:
        valid = ", ".join(PARSER_PROVIDER_REGISTRY)
        raise ValueError(f"Unknown PARSER_PROVIDER: '{name}'. Valid values: {valid}")
    return cls()


def get_parser_for_file_type(file_type: str) -> ParserProvider:
    """Returns the active provider if it supports file_type; falls back to SimpleParserProvider for docx/txt."""
    if file_type not in _SUPPORTED_FILE_TYPES:
        raise UnsupportedFileType(file_type)

    provider = get_parser_provider()
    if file_type in provider.supported_file_types:
        return provider

    # Active provider doesn't handle this type — fall back to SimpleParserProvider
    if file_type in {"docx", "txt"}:
        from apps.documents.parsing.simple_provider import SimpleParserProvider
        return SimpleParserProvider()

    raise UnsupportedFileType(file_type)
