# AskDocs Documentation

Technical documentation for the AskDocs backend and related guides. For project overview, features, and quick start, see the [root README](../README.md).

## Backend guides

| Document | Description |
|---|---|
| [architecture.md](../backend/docs/architecture.md) | Layered design, multi-tenancy, async pipeline, provider abstraction |
| [data-model.md](../backend/docs/data-model.md) | Database models, fields, indexes, and ER diagram |
| [api-reference.md](../backend/docs/api-reference.md) | REST endpoints with request/response shapes and examples |
| [auth-and-multi-tenancy.md](../backend/docs/auth-and-multi-tenancy.md) | Google OAuth, JWT lifecycle, workspace isolation, roles |
| [document-pipeline.md](../backend/docs/document-pipeline.md) | Parse → chunk → embed ingestion pipeline |
| [parsers.md](../backend/docs/parsers.md) | Pluggable parser providers (Unstructured, PyPDF, and extensions) |
| [chat-and-rag.md](../backend/docs/chat-and-rag.md) | Retrieval, prompts, SSE streaming, citations, caching |
| [byok-providers.md](../backend/docs/byok-providers.md) | BYOK config, Fernet encryption, LLM provider registry |
| [setup.md](../backend/docs/setup.md) | Local development setup with Docker Compose |
| [testing.md](../backend/docs/testing.md) | pytest suite (166 tests across 25 modules), smoke tests, checklists |
| [deployment.md](../backend/docs/deployment.md) | Planned production deployment (Vercel, Fly.io, Supabase, Upstash) |
| [operations.md](../backend/docs/operations.md) | Runbook: diagnostics and Django shell snippets |

## Other

- [freelance-pitch.md](freelance-pitch.md) — Interview prep: elevator pitch, talking points, tough Q&A
