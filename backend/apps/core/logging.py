"""Structured logging utilities for the AskDocs backend.

Provides a centralized logger factory and a filter that attaches
the current HTTP request ID (set by ``RequestIDMiddleware``) to
every log record for end-to-end traceability.
"""
from __future__ import annotations

import logging
import threading

_request_id_store = threading.local()


def set_request_id(request_id: str) -> None:
    """Store the current request ID for the active thread."""
    _request_id_store.request_id = request_id


class RequestIDFilter(logging.Filter):
    """Logging filter that injects ``request_id`` into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = getattr(_request_id_store, "request_id", "-")  # type: ignore[attr-defined]
        return True


def get_logger(name: str) -> logging.Logger:
    """Return a logger with the ``RequestIDFilter`` attached."""
    logger = logging.getLogger(name)
    if not any(isinstance(f, RequestIDFilter) for f in logger.filters):
        logger.addFilter(RequestIDFilter())
    return logger
