# AskDocs Backend

Django REST API for multi-tenant document intelligence with RAG.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Django 5.0, Django REST Framework 3.15 |
| Database | PostgreSQL 16 + pgvector |
| Cache / Queue | Redis 7, Celery 5.4 |
| API docs | drf-spectacular (OpenAPI 3) |
| Linting | ruff |
| Type checking | mypy (strict) |
| Testing | pytest-django |
| Container | Docker, Docker Compose |

## Project structure

```
backend/
├── config/             # Django project: settings, URLs, ASGI/WSGI, Celery
│   └── settings/       # base / development / production / testing split
├── apps/
│   ├── core/           # BaseModel, exceptions, logging, middleware, health endpoint
│   ├── accounts/       # Phase 2 — user model
│   ├── workspaces/     # Phase 2 — workspace + membership
│   ├── documents/      # Phase 3 — document + chunk models
│   ├── chat/           # Phase 4 — conversation + message models
│   └── providers/      # Phase 4 — BYOK AI provider config
└── tests/              # Integration tests
```

## Getting started

```bash
cp .env.example .env
docker compose up --build
```

App is at `http://localhost:8000`.

## Running tests

Without Docker (uses SQLite in-memory):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

With Docker:

```bash
docker compose exec web pytest
```

## Linting

```bash
ruff check .
ruff format .
```

## Type checking

```bash
mypy .
```

## API docs

Swagger UI: `http://localhost:8000/api/docs/`
OpenAPI schema: `http://localhost:8000/api/schema/`

## Status

Phase 1: Foundation complete. Auth + multi-tenancy coming in Phase 2.
