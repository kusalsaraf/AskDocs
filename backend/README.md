# AskDocs Backend

Django REST API for multi-tenant document intelligence with RAG.

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Django + Django REST Framework | 5.0.6 / 3.15.1 |
| Database | PostgreSQL + pgvector | 15+ / 0.3.0 |
| Cache / Queue | Redis + Celery | 7 / 5.4.0 |
| Auth | allauth + dj-rest-auth + SimpleJWT | 0.63.3 / 6.0.0 / 5.3.1 |
| API docs | drf-spectacular (OpenAPI 3) | 0.27.2 |
| Linting | ruff | latest |
| Type checking | mypy (strict) | latest |
| Testing | pytest-django | latest |
| Container | Docker + Docker Compose | - |

## Getting Started

```bash
cp .env.example .env
# Fill in GOOGLE_OAUTH_CLIENT_ID, DEFAULT_PLATFORM_OPENAI_API_KEY, PROVIDER_ENCRYPTION_KEY
docker compose up --build
# API: http://localhost:8000
# Swagger UI: http://localhost:8000/api/docs/
```

See [docs/setup.md](docs/setup.md) for the full local setup guide.

## Documentation

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Layered design, multi-tenancy, async pipeline, provider abstraction, request lifecycle |
| [docs/data-model.md](docs/data-model.md) | Every database model with field tables, indexes, and an ER diagram |
| [docs/api-reference.md](docs/api-reference.md) | Every endpoint with curl examples, request/response schemas, and error codes |
| [docs/auth-and-multi-tenancy.md](docs/auth-and-multi-tenancy.md) | Google OAuth flow, JWT lifecycle, workspace isolation, role matrix |
| [docs/document-pipeline.md](docs/document-pipeline.md) | File → chunks → vectors: parsing, chunking, embedding, failure modes |
| [docs/chat-and-rag.md](docs/chat-and-rag.md) | Retrieval, prompt construction, streaming SSE, citation linking, caching |
| [docs/byok-providers.md](docs/byok-providers.md) | BYOK system: encryption, provider abstraction, how to add a new provider |
| [docs/setup.md](docs/setup.md) | Get the project running locally in 10 minutes |
| [docs/testing.md](docs/testing.md) | Test suite, smoke-test script, manual checklists |
| [docs/deployment.md](docs/deployment.md) | Target infra (Vercel + Fly.io + Supabase + Upstash) — draft for Phase 6 |
| [docs/operations.md](docs/operations.md) | Runbook: common tasks, diagnostics, useful Django shell snippets |

## Running Tests

```bash
docker compose exec web pytest -v
docker compose exec web pytest --cov=apps --cov-report=term-missing
```

## Linting & Type Checking

```bash
docker compose exec web ruff check .
docker compose exec web mypy apps/
```

## API Docs

- Swagger UI: `http://localhost:8000/api/docs/`
- OpenAPI schema: `http://localhost:8000/api/schema/`

## Project Status

Phase 5 complete (Chat + RAG). Phase 6 adds document REST API and production deployment.
