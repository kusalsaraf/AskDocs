# Phase 3 Design — Documents and Async Ingestion

**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** `backend/` only

---

## 1. Context

Phase 1 established auth and workspace CRUD. Phase 2 added membership roles and workspace isolation via `WorkspaceScopedQuerysetMixin`. Phase 3 adds the document upload + async ingestion pipeline: the core capability that everything in Phases 4–6 builds on.

## 2. What We're Building

A pipeline that accepts uploaded files, stores them, and asynchronously parses → chunks → embeds them, storing vector embeddings in pgvector for later RAG retrieval.

---

## 3. Architecture Overview

```
POST /documents/
    │
    ├─ Validate (size ≤50MB, type ∈ {pdf, docx, txt})
    ├─ Save file → FileStorageProvider
    ├─ Create Document row (status=UPLOADED)
    └─ Queue ingest_document.delay(doc_id)

Celery worker: ingest_document(doc_id)
    │
    ├─ Set status=PROCESSING
    ├─ Load bytes ← FileStorageProvider
    ├─ DocumentParser → ParsedDocument (pages, metadata)
    ├─ chunk_document() → list[Chunk]
    ├─ DELETE existing chunks (idempotency)
    ├─ EmbeddingProvider.embed_batch() → vectors
    ├─ DocumentChunk.objects.bulk_create()
    └─ Set status=READY  (or FAILED on exception)
```

---

## 4. Data Models

### Document (`apps/documents/models.py`)

Inherits `BaseModel` (UUID pk, created_at, updated_at).

| Field | Type | Notes |
|-------|------|-------|
| workspace | FK(Workspace, CASCADE) | workspace isolation |
| uploaded_by | FK(User, SET_NULL, null) | |
| original_filename | CharField | |
| storage_path | CharField | relative path inside provider |
| file_type | CharField choices(PDF, DOCX, TXT) | |
| file_size_bytes | PositiveIntegerField | |
| page_count | PositiveIntegerField, null | set after parse |
| status | CharField choices(UPLOADED, PROCESSING, READY, FAILED) | |
| error_message | TextField, null/blank | set on FAILED |
| metadata | JSONField(default=dict) | PDF title/author etc. |
| embedding_provider | CharField | e.g. "gemini" |
| embedding_model | CharField | e.g. "models/gemini-embedding-001" |
| embedding_dimensions | PositiveIntegerField | 768 for Gemini |
| ingestion_started_at | DateTimeField, null | |
| ingestion_completed_at | DateTimeField, null | |

Index: `workspace_id`.

### DocumentChunk (`apps/documents/models.py`)

| Field | Type | Notes |
|-------|------|-------|
| id | UUIDField pk | |
| document | FK(Document, CASCADE) | |
| workspace | FK(Workspace, CASCADE) | denormalized for fast filtering |
| chunk_index | PositiveIntegerField | 0-based ordering |
| content | TextField | raw chunk text |
| content_hash | CharField | sha256 hex, for deduplication |
| page_number | PositiveIntegerField, null | source page |
| embedding | VectorField(dimensions=768) | pgvector |
| token_count | PositiveIntegerField, null | |
| created_at | DateTimeField(auto_now_add) | |

Indexes: composite `(workspace_id, document_id)`, plus HNSW index on `embedding` (separate migration using `RunSQL`).

**HNSW index:**
```sql
CREATE INDEX documents_chunk_embedding_hnsw
ON documents_documentchunk
USING hnsw (embedding vector_cosine_ops);
```

---

## 5. Storage Abstraction

**`apps/documents/storage/base.py`** — `FileStorageProvider` ABC:
- `save(file: UploadedFile, path: str) -> str`
- `load(path: str) -> bytes`
- `delete(path: str) -> None`
- `exists(path: str) -> bool`

**`apps/documents/storage/local.py`** — `LocalFileStorageProvider`:
- Root: `MEDIA_ROOT` (env-configured, default `/app/media/`)
- Path scheme: `workspaces/{workspace_id}/documents/{document_id}/{filename}`

**`apps/documents/storage/factory.py`** — `get_storage_provider()`:
- `FILE_STORAGE_PROVIDER=local` → `LocalFileStorageProvider`
- `FILE_STORAGE_PROVIDER=supabase` → `raise NotImplementedError("Supabase storage will be implemented in Phase 6")`

---

## 6. Embedding Abstraction

**`apps/documents/embeddings/base.py`** — `EmbeddingProvider` ABC:
- `model_name: str`, `dimensions: int`
- `embed_text(text: str) -> list[float]`
- `embed_batch(texts: list[str]) -> list[list[float]]`

**`apps/documents/embeddings/gemini.py`** — `GeminiEmbeddingProvider`:
- Model: `"models/gemini-embedding-001"`, 768 dimensions
- Batch size ≤ 100 inputs per request
- Exponential backoff on rate-limit errors (google-generativeai RateLimitError)
- API key from `GEMINI_API_KEY` env var

**`apps/documents/embeddings/factory.py`** — `get_embedding_provider()`:
- `EMBEDDING_PROVIDER=gemini` → `GeminiEmbeddingProvider` (only Phase 3 impl)
- Other values raise `NotImplementedError`

---

## 7. Parsing Abstraction

**`apps/documents/parsing/base.py`**:
```python
@dataclass
class ParsedDocument:
    pages: list[dict]   # [{page_number: int, text: str}]
    metadata: dict

class DocumentParser(ABC):
    def parse(self, file_bytes: bytes) -> ParsedDocument: ...
```

**Implementations:**
- `pdf.py` — pypdf: per-page text extraction, metadata (title, author)
- `docx.py` — python-docx: full text as page 1
- `txt.py` — UTF-8 decode, full text as page 1

**`apps/documents/parsing/factory.py`** — `get_parser_for_file_type(file_type: str)`:
- Raises `UnsupportedFileType` if file_type unknown

---

## 8. Chunking

**`apps/documents/chunking.py`** — single function:
```python
@dataclass
class Chunk:
    content: str
    chunk_index: int
    page_number: int
    content_hash: str  # sha256 hex of content

def chunk_document(
    parsed: ParsedDocument,
    chunk_size: int = 512,
    overlap: int = 50,
) -> list[Chunk]: ...
```

Uses LlamaIndex `TokenTextSplitter`. Preserves `page_number` from source page. Computes sha256 hash per chunk.

---

## 9. Celery Task

**`apps/documents/tasks.py`:**
```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def ingest_document(self, document_id: str) -> None: ...
```

Step sequence:
1. Load Document by id → set `PROCESSING`, `ingestion_started_at=now()`
2. Load file bytes via `get_storage_provider().load(doc.storage_path)`
3. Parse → update `page_count`, `metadata`
4. Chunk via `chunk_document()`
5. `DocumentChunk.objects.filter(document=doc).delete()` (idempotency)
6. Embed in batches (≤100), `bulk_create` DocumentChunk rows
7. Set `READY`, `ingestion_completed_at=now()`
8. On any exception: set `FAILED`, `error_message=str(exc)`, re-raise

Structured logging at every step with `document_id` and `workspace_id` in `extra={}`.

---

## 10. Custom Exceptions

**`apps/documents/exceptions.py`** — all subclass `AskDocsError`:

| Class | HTTP | Code |
|-------|------|------|
| `UnsupportedFileType` | 400 | `unsupported_file_type` |
| `FileTooLarge` | 400 | `file_too_large` |
| `DocumentParsingError` | 500 | `document_parsing_error` |
| `EmbeddingProviderError` | 500 | `embedding_provider_error` |
| `IngestionFailedError` | 500 | `ingestion_failed` |

---

## 11. API Endpoints

Base URL: `/api/v1/workspaces/{workspace_id}/documents/`

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| POST | `/` | IsWorkspaceMemberOrAdmin | Upload document |
| GET | `/` | IsWorkspaceMember | List documents (filterable by `?status=`) |
| GET | `/{doc_id}/` | IsWorkspaceMember | Document detail + chunk count |
| GET | `/{doc_id}/status/` | IsWorkspaceMember | Lightweight polling: `{status, error_message, progress_percentage}` where progress_percentage: UPLOADED=0, PROCESSING=50, READY=100, FAILED=0 |
| DELETE | `/{doc_id}/` | IsWorkspaceMemberOrAdmin | Delete document + chunks + file |
| GET | `/{doc_id}/chunks/` | IsWorkspaceAdmin | Debug: list chunks (paginated) |

All viewsets use `WorkspaceScopedQuerysetMixin`. All input via DRF serializers. Business logic in `apps/documents/services.py`.

---

## 12. Settings Changes

**`config/settings/base.py`** additions:
```python
FILE_STORAGE_PROVIDER = env("FILE_STORAGE_PROVIDER", default="local")
MEDIA_ROOT = "/app/media"
EMBEDDING_PROVIDER = env("EMBEDDING_PROVIDER", default="gemini")
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
MAX_DOCUMENT_SIZE_MB = env.int("MAX_DOCUMENT_SIZE_MB", default=50)
SUPPORTED_FILE_TYPES = ["pdf", "docx", "txt"]
```

**`config/settings/testing.py`** additions:
```python
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
```

---

## 13. Docker Volume

Named volume `media_data` → `/app/media/` on both `web` and `worker`. Both need access: `web` writes uploaded files, `worker` reads them during ingestion.

---

## 14. New Dependencies

**`requirements.txt`** additions:
```
llama-index==0.10.43
llama-index-vector-stores-postgres==0.1.7
llama-index-embeddings-gemini==0.1.10
llama-index-llms-gemini==0.1.10
pypdf==4.2.0
python-docx==1.1.2
google-generativeai==0.7.0
```

Note: `pgvector==0.3.0` is already present. `django-storages` is NOT added (scope change).

**`requirements-dev.txt`** additions:
```
pytest-mock==3.14.0
```

---

## 15. Tests (~20 tests)

### `tests/test_documents.py`
1. Upload valid PDF → 201, document created with `status=UPLOADED`
2. Upload oversized file → 400, `FileTooLarge` error code
3. Upload unsupported type (`.xlsx`) → 400, `UnsupportedFileType` error code
4. Cross-tenant: User A cannot GET User B's document
5. Cross-tenant: User A cannot DELETE User B's document
6. VIEWER role cannot upload (POST) a document
7. VIEWER role cannot delete a document

### `tests/test_ingestion.py`
8. Happy path: status transitions UPLOADED → PROCESSING → READY
9. Happy path: chunks are created after task completes
10. Happy path: chunk count > 0 and embeddings are populated
11. Idempotency: running task twice → same chunk count (not doubled)
12. Failure path: parser raises → document status=FAILED with error_message set

### `tests/test_chunking.py`
13. Known input → expected chunk count
14. Page numbers preserved across chunks
15. Content hashes are deterministic (same input → same hash)
16. Chunk overlap produces expected token boundaries

### `tests/test_storage.py`
17. LocalFileStorageProvider.save() creates file at correct path
18. LocalFileStorageProvider.load() returns correct bytes
19. LocalFileStorageProvider.exists() returns True/False correctly
20. LocalFileStorageProvider.delete() removes the file
21. Path structure is workspace-scoped (`workspaces/{ws_id}/...`)

---

## 16. Scope Exclusions (Phase 3)

- No LLM chat / RAG retrieval (Phase 5)
- No BYOK provider system (Phase 4)
- No OpenAI or local embedding implementations (interface only documented)
- No streaming or progress callbacks during ingestion
- No re-embedding on provider change
- No document preview or rendering
- No hybrid search
- No per-document permissions (workspace-level only)
- No file deduplication
- No `django-storages` / S3 / boto3
