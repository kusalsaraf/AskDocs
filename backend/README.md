# AskDocs — Backend

Django 5 REST API powering multi-tenant document intelligence with RAG, async ingestion, and BYOK LLM provider management.

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Django + Django REST Framework | 5.0.6 / 3.15.1 |
| Database | PostgreSQL + pgvector | 16 / 0.3.0 |
| Task Queue | Celery + Redis | 5.4.0 / 7 |
| Auth | SimpleJWT + django-allauth (Google OAuth) | 5.3.1 / 0.63.3 |
| Document Parsing | Unstructured.io, PyPDF, python-docx | 0.14.4 / 4.2.0 / 1.1.2 |
| LLM Providers | OpenAI, Anthropic, Gemini, Mistral, Groq | see requirements.txt |
| Encryption | cryptography (Fernet) | 42.0.8 |
| API Docs | drf-spectacular (Swagger/OpenAPI) | 0.27.2 |
| Linting | ruff | 0.4.8 |

## Project Structure

```
backend/
├── apps/
│   ├── accounts/       → Custom user model, Google OAuth token verification
│   ├── workspaces/     → Multi-tenant workspaces, memberships, email invitations
│   ├── documents/      → Upload validation, Celery ingestion (parse → chunk → embed)
│   │   ├── parsing/    → Pluggable parsers (Unstructured.io, PyPDF)
│   │   └── embeddings/ → Embedding providers (OpenAI, Gemini)
│   ├── chat/           → RAG retrieval, streaming responses, citation extraction
│   ├── providers/      → BYOK provider config, encrypted key storage, connection testing
│   └── core/           → Permissions, exceptions, constants, middleware, logging
├── config/
│   └── settings/       → Split settings: base.py, development.py, production.py, testing.py
├── tests/              → 166 tests across 25 modules
└── docker-compose.yml  → Full dev stack: Postgres+pgvector, Redis, API server, Celery worker
```

## Getting Started

```bash
cp .env.example .env          # configure environment variables (see table below)
docker compose up --build      # starts all services on http://localhost:8000
```

The first run automatically applies migrations and creates the database schema.

Swagger UI: [http://localhost:8000/api/docs/](http://localhost:8000/api/docs/)

## Running Tests

```bash
docker compose exec web pytest -v                              # full suite
docker compose exec web pytest --cov=apps --cov-report=term-missing  # with coverage
docker compose exec web ruff check .                           # lint
docker compose exec web ruff format --check .                  # format check
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| **Django** | | | |
| `DJANGO_SETTINGS_MODULE` | No | `config.settings.development` | Settings module path |
| `DJANGO_SECRET_KEY` | Yes | `change-me` | Django secret key — **change in production** |
| `DJANGO_DEBUG` | No | `True` | Debug mode — set `False` in production |
| `DJANGO_ALLOWED_HOSTS` | No | `localhost,127.0.0.1` | Comma-separated allowed hosts |
| **Database** | | | |
| `DATABASE_URL` | Yes | `postgres://askdocs:askdocs@db:5432/askdocs` | PostgreSQL connection URL |
| **Redis** | | | |
| `REDIS_URL` | Yes | `redis://redis:6379/0` | Redis URL for caching and rate limits |
| `CELERY_BROKER_URL` | Yes | `redis://redis:6379/1` | Redis URL for Celery task broker |
| **CORS** | | | |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:3000` | Allowed CORS origins |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for invitation links |
| **Auth** | | | |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | — | Google OAuth 2.0 Client ID ([console.cloud.google.com](https://console.cloud.google.com/apis/credentials)) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | — | Google OAuth Client Secret (for server-side flows) |
| `JWT_SIGNING_KEY` | Yes | — | JWT signing key — use a strong random 256-bit string |
| **Encryption** | | | |
| `PROVIDER_ENCRYPTION_KEY` | Yes | — | Fernet key for encrypting stored API keys. Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| **Platform LLM** | | | |
| `DEFAULT_PLATFORM_PROVIDER` | No | `openai` | Default LLM provider (`openai` or `gemini`) |
| `DEFAULT_PLATFORM_OPENAI_API_KEY` | Conditional | — | OpenAI API key (required if provider is `openai`) |
| `DEFAULT_PLATFORM_OPENAI_MODEL` | No | `gpt-4o-mini` | Default OpenAI model |
| `DEFAULT_PLATFORM_GEMINI_API_KEY` | Conditional | — | Gemini API key (required if provider is `gemini`) |
| `DEFAULT_PLATFORM_GEMINI_MODEL` | No | `gemini-1.5-flash` | Default Gemini model |
| **Embeddings** | | | |
| `EMBEDDING_PROVIDER` | No | `openai` | Embedding provider (`openai` or `gemini`), 768 dimensions |
| **Document Parsing** | | | |
| `PARSER_PROVIDER` | No | `unstructured` | Parser backend (`unstructured` or `pypdf`) |
| `UNSTRUCTURED_DEFAULT_STRATEGY` | No | `fast` | Unstructured.io strategy (`fast` or `hi_res`) |
| **Chat / RAG** | | | |
| `USER_DAILY_MESSAGE_LIMIT` | No | `100` | Per-user daily message limit |
| `GLOBAL_DAILY_PLATFORM_LLM_BUDGET` | No | `5000` | Global daily message budget for platform-default provider |
| `CHAT_RESPONSE_CACHE_TTL_SECONDS` | No | `86400` | Cache TTL for identical RAG responses (seconds) |
| `CHAT_DEFAULT_TOP_K` | No | `5` | Number of document chunks retrieved per query |
| `CHAT_MAX_HISTORY_TURNS` | No | `10` | Conversation history turns included in LLM context |
| **Rate Limits** | | | |
| `PROVIDER_TEST_RATE_LIMIT_PER_HOUR` | No | `10` | Rate limit for provider connection test endpoint |
| `PROVIDER_REQUEST_TIMEOUT_SECONDS` | No | `30` | HTTP timeout for LLM provider requests |
| **Email (optional)** | | | |
| `RESEND_API_KEY` | No | — | Resend API key for sending invitation emails |
| `RESEND_FROM_EMAIL` | No | — | Sender email address for invitations |
| **Limits** | | | |
| `MAX_DOCUMENTS_PER_WORKSPACE` | No | `50` | Maximum documents per workspace |
| **Logging** | | | |
| `LOG_LEVEL` | No | `INFO` | Application log level |

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design, layered architecture, data flow |
| [Data Model](docs/data-model.md) | Database schema, model relationships |
| [API Reference](docs/api-reference.md) | Complete endpoint documentation |
| [Auth & Multi-tenancy](docs/auth-and-multi-tenancy.md) | OAuth, JWT, workspace isolation |
| [Document Pipeline](docs/document-pipeline.md) | Ingestion: parse → chunk → embed → store |
| [Chat & RAG](docs/chat-and-rag.md) | Retrieval, streaming, citations |
| [BYOK Providers](docs/byok-providers.md) | Multi-provider system, encryption |
| [Setup](docs/setup.md) | Detailed local setup guide |
| [Testing](docs/testing.md) | Test organization and coverage |
| [Deployment](docs/deployment.md) | Production deployment |
| [Operations](docs/operations.md) | Monitoring, logging, maintenance |

For the full project overview, see the [root README](../README.md).
