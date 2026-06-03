"""Centralized constants for the AskDocs backend.

All magic numbers and repeated string literals should be defined here
and imported by the modules that use them. Django settings (env-driven)
remain in ``config/settings/``; this module holds compile-time defaults
and cross-cutting literals that don't belong in settings.
"""
from __future__ import annotations

# ── File upload & document processing ─────────────────────────────────────────
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
MAGIC_BYTE_READ_SIZE = 2048
MAX_FILENAME_LENGTH = 255

ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
})

MIME_TO_FILE_TYPE: dict[str, str] = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
}

SUPPORTED_FILE_TYPES: frozenset[str] = frozenset(MIME_TO_FILE_TYPE.values())

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNK_MAX_TOKENS = 512
CHUNK_OVERLAP_TOKENS = 50
TABLE_MAX_TOKENS = 2000
TIKTOKEN_ENCODING = "cl100k_base"

# ── Embedding ─────────────────────────────────────────────────────────────────
EMBEDDING_DIMENSIONS = 768
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
GEMINI_EMBEDDING_MODEL = "models/text-embedding-004"

# ── LLM provider defaults ────────────────────────────────────────────────────
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_TOKENS = 2048
PROVIDER_TEST_MAX_TOKENS = 5
PROVIDER_TEST_PROMPT = "Reply with ok"

# ── Chat / RAG ────────────────────────────────────────────────────────────────
DEFAULT_CONVERSATION_TITLE = "New conversation"
DAILY_CACHE_TTL_SECONDS = 86400  # 24 hours
MIN_RETRIEVAL_SCORE = 0.45
CACHED_STREAM_CHUNK_SIZE = 80
MAX_MESSAGE_LENGTH = 10000

# ── Invitations ───────────────────────────────────────────────────────────────
INVITATION_EXPIRY_HOURS = 24

# ── Document ingestion tasks ─────────────────────────────────────────────────
INGEST_MAX_RETRIES = 3
INGEST_RETRY_COUNTDOWN_PARSER = 30   # seconds
INGEST_RETRY_COUNTDOWN_GENERAL = 60  # seconds
STUCK_DOCUMENT_TIMEOUT_MINUTES = 30

# ── Error codes (consistent across chat SSE and exception classes) ────────────
ERR_INSUFFICIENT_ROLE = "insufficient_role"
ERR_PROVIDER_AUTH = "provider_auth_failed"
ERR_PROVIDER_RATE_LIMIT = "provider_rate_limited"
ERR_PROVIDER_TIMEOUT = "provider_timeout"
ERR_PROVIDER_ERROR = "provider_error"
ERR_INTERNAL = "internal_error"

# ── User-facing error messages ────────────────────────────────────────────────
MSG_PROVIDER_AUTH_FAILED = (
    "Authentication with the AI provider failed. "
    "Please check your API key in settings."
)
MSG_PROVIDER_RATE_LIMITED = (
    "The AI provider's rate limit was exceeded. "
    "Please wait a moment and try again."
)
MSG_PROVIDER_TIMEOUT = (
    "The AI provider took too long to respond. "
    "Please try again."
)
MSG_PROVIDER_ERROR = (
    "An error occurred while communicating with the AI provider. "
    "Please try again later."
)
MSG_INTERNAL_ERROR = "An unexpected error occurred. Please try again."
MSG_VIEWER_NO_UPLOAD = "VIEWER role cannot upload documents."
MSG_VIEWER_NO_CONVERSATION = "VIEWER role cannot create conversations."
MSG_VIEWER_NO_MESSAGE = "VIEWER role cannot send messages."
