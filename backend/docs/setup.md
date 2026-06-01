# Setup

This guide gets AskDocs running on your local machine. Estimated time: 10–20 minutes (plus first-build time).

## Prerequisites

- **Docker Desktop** with at least 3 GB RAM allocated (Settings → Resources → Memory). The default 2 GB will cause the database container to OOM during heavy queries.
- **Git**
- A Google Cloud project with OAuth 2.0 credentials (see below)
- An OpenAI or Gemini API key for the platform default LLM

## First-Time Setup

```bash
git clone <repo-url>
cd AskDocs/backend

# Copy the environment template
cp .env.example .env
```

Open `.env` in your editor and fill in the required values (see the table below). Then:

```bash
docker compose up --build
```

**First build time:** 3–8 minutes. Docker pulls the Python 3.12 image and installs ~50 packages including the unstructured library. Subsequent startups take 5–15 seconds.

**Healthy startup output** — you should see all four services reach steady state:
```
db        | database system is ready to accept connections
redis     | Ready to accept connections
web       | Starting development server at http://0.0.0.0:8000/
worker    | celery@worker ready.
```

Verify with:
```bash
curl http://localhost:8000/api/health/
# → {"status": "ok"}
```

## Required Environment Variables

| Variable | Example | Source |
|---|---|---|
| `DJANGO_SECRET_KEY` | `change-me-use-50-random-chars` | Generate: `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_DEBUG` | `True` | Set `False` in production |
| `DATABASE_URL` | `postgres://askdocs:askdocs@db:5432/askdocs` | Docker Compose sets up this DB automatically |
| `REDIS_URL` | `redis://redis:6379/0` | Docker Compose starts Redis |
| `CELERY_BROKER_URL` | `redis://redis:6379/1` | Separate Redis DB from cache |
| `GOOGLE_OAUTH_CLIENT_ID` | `123456789-xxx.apps.googleusercontent.com` | Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-xxx...` | Google Cloud Console |
| `JWT_SIGNING_KEY` | `change-me-use-a-strong-random-string-256-bit` | Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `PROVIDER_ENCRYPTION_KEY` | `mP8dQ7X2k9bN...` | Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DEFAULT_PLATFORM_OPENAI_API_KEY` | `sk-proj-abc123...` | [platform.openai.com](https://platform.openai.com) |
| `DEFAULT_PLATFORM_GEMINI_API_KEY` | `AIzaSy...` | Google AI Studio |
| `EMBEDDING_PROVIDER` | `openai` | `openai` or `gemini` |
| `PARSER_PROVIDER` | `unstructured` | `unstructured` or `pypdf` |

Optional (have sensible defaults):

| Variable | Default | Purpose |
|---|---|---|
| `USER_DAILY_MESSAGE_LIMIT` | `100` | Per-user daily message cap |
| `GLOBAL_DAILY_PLATFORM_LLM_BUDGET` | `5000` | Global daily request cap (platform default only) |
| `CHAT_RESPONSE_CACHE_TTL_SECONDS` | `86400` | Response cache TTL (24h) |
| `UNSTRUCTURED_DEFAULT_STRATEGY` | `fast` | `fast` or `hi_res` |
| `PROVIDER_TEST_RATE_LIMIT_PER_HOUR` | `10` | Max provider test calls per workspace per hour |
| `PROVIDER_REQUEST_TIMEOUT_SECONDS` | `30` | LLM request timeout |
| `LOG_LEVEL` | `INFO` | Python logging level |

## Getting Google OAuth Credentials

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project.
2. Navigate to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**.
3. Set **Application type** to **Web application**.
4. Under **Authorized JavaScript origins**, add `http://localhost:3000`.
5. Under **Authorized redirect URIs**, add `http://localhost:3000` (the frontend handles the OAuth popup; `callback_url="postmessage"` is used in the backend adapter).
6. Copy the **Client ID** → `GOOGLE_OAUTH_CLIENT_ID`.
7. Copy the **Client Secret** → `GOOGLE_OAUTH_CLIENT_SECRET`.
8. Under **APIs & Services → OAuth consent screen**, add your email as a test user.

## Daily Workflow

**Start:**
```bash
cd AskDocs/backend
docker compose up -d        # detached mode; logs in background
```

**Stop:**
```bash
docker compose down         # stops containers, keeps volumes
```

**Nuclear reset** (drops the database, removes all data):
```bash
docker compose down -v      # -v removes named volumes including the Postgres data volume
docker compose up --build   # rebuilds from scratch
```

## Running Tests

```bash
# Run the full test suite
docker compose exec web pytest -v

# Run tests with coverage report
docker compose exec web pytest --cov=apps --cov-report=term-missing -v

# Run a specific test file
docker compose exec web pytest tests/test_multi_tenancy.py -v

# Run only tests matching a keyword
docker compose exec web pytest -k "workspace_isolation" -v

# Stop on first failure
docker compose exec web pytest -x
```

## Linting and Type Checking

```bash
# Lint + format check (ruff)
docker compose exec web ruff check .

# Auto-fix lint issues
docker compose exec web ruff check --fix .

# Type check (mypy)
docker compose exec web mypy apps/
```

## Database Access

```bash
# Open a psql shell
docker compose exec db psql -U askdocs

# Useful queries
\dt                          -- list all tables
SELECT count(*) FROM apps_documents_documentchunk;
SELECT id, status, error_message FROM apps_documents_document;
```

## Django Shell

```bash
docker compose exec web python manage.py shell
```

Useful shell snippets:
```python
# Check a user
from apps.accounts.models import User
User.objects.get(email="you@example.com")

# Check workspace memberships
from apps.workspaces.models import Membership
Membership.objects.filter(user__email="you@example.com").select_related("workspace")

# Reset a stuck document
from apps.documents.models import Document
doc = Document.objects.get(id="<uuid>")
doc.status = "pending"
doc.error_message = ""
doc.save()
```

## Tailing Logs

```bash
# All services
docker compose logs -f

# Just the Celery worker
docker compose logs -f worker

# Just the Django API
docker compose logs -f web
```

## Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `port is already allocated` | Another process is using port 8000 or 5432 | `lsof -i :8000` to find the process; kill it, or change `ports` in docker-compose.yml |
| `Container unhealthy` on `db` | PostgreSQL is taking longer to start | Wait 30s and retry; or `docker compose restart db` |
| `No module named 'cryptography'` | Venv not installed in container | `docker compose build --no-cache` |
| `PROVIDER_ENCRYPTION_KEY is not set` | Missing from `.env` | Generate and add the key (see Required Variables table above) |
| Migration conflict | Two branches created conflicting migrations | `docker compose exec web python manage.py migrate --merge` |
| `relation does not exist` | Migrations haven't run | `docker compose exec web python manage.py migrate` |
| `google-auth` error on OAuth | `GOOGLE_OAUTH_CLIENT_ID` is wrong | Verify in Google Cloud Console; ensure the redirect URI matches |

---

**What's next:** [testing.md](testing.md) — running and understanding the test suite.
