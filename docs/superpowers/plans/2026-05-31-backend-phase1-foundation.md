# Backend Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the entire Django 5 + DRF backend inside `backend/` — project structure, settings, core app (logging, exceptions, BaseModel, health endpoint), placeholder apps, Docker stack, tests, and tooling config.

**Architecture:** Django project `config` sits at `backend/config/`; all apps live under `backend/apps/`. Settings use a base/development/production split via `django-environ`. The only live endpoint in this phase is `GET /api/health/` — everything else is scaffolding.

**Tech Stack:** Django 5.0.6, DRF 3.15.1, PostgreSQL 16 + pgvector, Redis 7, Celery 5.4, drf-spectacular, ruff, mypy, pytest-django, Docker Compose.

---

## File Map

| File | Purpose |
|---|---|
| `backend/pyproject.toml` | ruff, mypy, pytest config |
| `backend/requirements.txt` | Production dependencies (pinned) |
| `backend/requirements-dev.txt` | Dev/test dependencies |
| `backend/Dockerfile` | python:3.11-slim image |
| `backend/docker-compose.yml` | db, redis, web, worker services |
| `backend/.env.example` | All env vars with placeholders |
| `backend/.dockerignore` | Docker build exclusions |
| `backend/manage.py` | Django management CLI |
| `backend/config/__init__.py` | Imports Celery app for autodiscovery |
| `backend/config/settings/base.py` | All shared settings |
| `backend/config/settings/development.py` | DEBUG=True, human-readable logging |
| `backend/config/settings/production.py` | DEBUG=False, JSON logging, secure cookies |
| `backend/config/urls.py` | Root URL conf + health + docs + v1 prefix |
| `backend/config/api_v1_urls.py` | Empty v1 URL registry (Phase 2+) |
| `backend/config/wsgi.py` | WSGI entry point |
| `backend/config/asgi.py` | ASGI entry point |
| `backend/config/celery.py` | Celery app init |
| `backend/apps/core/apps.py` | CoreConfig |
| `backend/apps/core/exceptions.py` | AskDocsError hierarchy + custom handler |
| `backend/apps/core/logging.py` | `get_logger()` helper |
| `backend/apps/core/middleware.py` | RequestIDMiddleware |
| `backend/apps/core/models.py` | BaseModel (UUID pk, timestamps) |
| `backend/apps/core/pagination.py` | StandardResultsPagination |
| `backend/apps/core/permissions.py` | IsWorkspaceMember stub |
| `backend/apps/core/serializers.py` | BaseModelSerializer |
| `backend/apps/core/health.py` | `health_check` FBV |
| `backend/apps/{accounts,workspaces,documents,chat,providers}/apps.py` | AppConfig stubs |
| `backend/apps/{accounts,workspaces,documents,chat,providers}/models.py` | Empty with phase comment |
| `backend/tests/conftest.py` | pytest fixtures |
| `backend/tests/test_health.py` | Health check integration test |
| `backend/README.md` | Backend-specific README |
| `.pre-commit-config.yaml` | ruff + mypy + whitespace hooks (monorepo root) |
| `README.md` | Update root README backend section |

---

## Task 1: Directory scaffold

**Files:** Create directory tree only (no content yet)

- [ ] **Step 1: Create all directories**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/backend
mkdir -p config/settings
mkdir -p apps/core apps/accounts apps/workspaces apps/documents apps/chat apps/providers
mkdir -p tests
```

- [ ] **Step 2: Remove .gitkeep**

```bash
rm /Users/kusalsaraf/Desktop/AskDocs/backend/.gitkeep
```

- [ ] **Step 3: Create all `__init__.py` files**

```bash
touch config/__init__.py config/settings/__init__.py
touch apps/__init__.py
touch apps/core/__init__.py apps/accounts/__init__.py apps/workspaces/__init__.py
touch apps/documents/__init__.py apps/chat/__init__.py apps/providers/__init__.py
touch tests/__init__.py
```

---

## Task 2: pyproject.toml

**Files:**
- Create: `backend/pyproject.toml`

- [ ] **Step 1: Write pyproject.toml**

```toml
[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
select = ["E", "W", "F", "I", "N", "B", "UP", "SIM"]
ignore = ["B008"]

[tool.ruff.lint.isort]
known-first-party = ["apps", "config"]

[tool.mypy]
strict = true
python_version = "3.11"
plugins = ["mypy_django_plugin.main", "mypy_drf_plugin.main"]

[tool.django-stubs]
django_settings_module = "config.settings.development"

[[tool.mypy.overrides]]
module = [
    "celery.*",
    "kombu.*",
    "redis.*",
    "pgvector.*",
    "pythonjsonlogger.*",
]
ignore_missing_imports = true

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.development"
testpaths = ["tests"]
addopts = "--cov=. --cov-report=term-missing --cov-fail-under=0"

[tool.coverage.run]
source = ["."]
omit = [
    "*/migrations/*",
    "*/tests/*",
    "manage.py",
    "config/wsgi.py",
    "config/asgi.py",
]
```

---

## Task 3: Requirements files

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`

- [ ] **Step 1: Write requirements.txt**

```
Django==5.0.6
djangorestframework==3.15.1
django-cors-headers==4.3.1
django-environ==0.11.2
psycopg[binary]==3.1.19
pgvector==0.3.0
celery==5.4.0
redis==5.0.4
drf-spectacular==0.27.2
gunicorn==22.0.0
uvicorn[standard]==0.30.1
python-json-logger==2.0.7
```

- [ ] **Step 2: Write requirements-dev.txt**

```
-r requirements.txt
ruff==0.4.8
mypy==1.10.0
pytest==8.2.2
pytest-django==4.8.0
pytest-cov==5.0.0
django-stubs==5.0.2
djangorestframework-stubs==3.15.0
pre-commit==3.7.1
```

---

## Task 4: Docker + env files

**Files:**
- Create: `backend/.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/docker-compose.yml`
- Create: `backend/.dockerignore`

- [ ] **Step 1: Write .env.example**

```
DJANGO_SETTINGS_MODULE=config.settings.development
DJANGO_SECRET_KEY=change-me
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
DATABASE_URL=postgres://askdocs:askdocs@db:5432/askdocs
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CORS_ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=INFO
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2"]
```

- [ ] **Step 3: Write docker-compose.yml**

```yaml
version: "3.9"

services:
  db:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: askdocs
      POSTGRES_PASSWORD: askdocs
      POSTGRES_DB: askdocs
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U askdocs"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build: .
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - .:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/api/health/ || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3

  worker:
    build: .
    command: celery -A config worker --loglevel=info
    volumes:
      - .:/app
    env_file:
      - .env
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

volumes:
  postgres_data:
```

- [ ] **Step 4: Write .dockerignore**

```
.git
.gitignore
__pycache__
*.pyc
*.pyo
*.pyd
.Python
env
venv
.env
.venv
*.egg-info
dist
build
.pytest_cache
.mypy_cache
.ruff_cache
*.sqlite3
```

---

## Task 5: Write failing health check test (TDD — write test before implementation)

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write conftest.py**

```python
import pytest
from django.test import Client


@pytest.fixture
def client() -> Client:
    return Client()
```

- [ ] **Step 2: Write test_health.py**

```python
import pytest
from django.test import Client


@pytest.mark.django_db
def test_health_check_returns_200(client: Client) -> None:
    response = client.get("/api/health/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_health_check_body(client: Client) -> None:
    response = client.get("/api/health/")
    data = response.json()
    assert data["status"] in ("ok", "degraded")
    assert data["version"] == "0.1.0"
    assert "database" in data["checks"]
    assert "redis" in data["checks"]
```

*(The test will fail until Task 9 wires up the URL. That is expected — TDD.)*

---

## Task 6: Django settings

**Files:**
- Create: `backend/config/settings/base.py`
- Create: `backend/config/settings/development.py`
- Create: `backend/config/settings/production.py`

- [ ] **Step 1: Write base.py**

```python
from pathlib import Path

import environ

env = environ.Env()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-change-me-in-production")

DEBUG = env.bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    # Internal apps
    "apps.core.apps.CoreConfig",
    "apps.accounts.apps.AccountsConfig",
    "apps.workspaces.apps.WorkspacesConfig",
    "apps.documents.apps.DocumentsConfig",
    "apps.chat.apps.ChatConfig",
    "apps.providers.apps.ProvidersConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.RequestIDMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://askdocs:askdocs@localhost:5432/askdocs",
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsPagination",
    "PAGE_SIZE": 20,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "AskDocs API",
    "DESCRIPTION": (
        "Multi-tenant document intelligence API. "
        "Upload documents, query them with AI, get inline source citations."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

LOG_LEVEL = env("LOG_LEVEL", default="INFO")
```

- [ ] **Step 2: Write development.py**

```python
from .base import *  # noqa: F401, F403
from .base import LOG_LEVEL

DEBUG = True
ALLOWED_HOSTS = ["*"]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{levelname}] {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}
```

- [ ] **Step 3: Write production.py**

```python
import environ

from .base import *  # noqa: F401, F403
from .base import LOG_LEVEL

env = environ.Env()

DEBUG = False
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_HSTS_SECONDS = 31536000

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}
```

---

## Task 7: Core app — logging + exceptions

**Files:**
- Create: `backend/apps/core/logging.py`
- Create: `backend/apps/core/exceptions.py`

- [ ] **Step 1: Write logging.py**

```python
import logging


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
```

- [ ] **Step 2: Write exceptions.py**

```python
import logging
from typing import Any

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class AskDocsError(Exception):
    status_code = 500
    default_detail = "Something went wrong."
    default_code = "internal_error"

    def __init__(self, detail: str | None = None, code: str | None = None) -> None:
        self.detail = detail or self.default_detail
        self.code = code or self.default_code
        super().__init__(self.detail)


class ValidationError(AskDocsError):
    status_code = 400
    default_code = "validation_error"
    default_detail = "Validation failed."


class AuthenticationError(AskDocsError):
    status_code = 401
    default_code = "authentication_required"
    default_detail = "Authentication is required."


class PermissionDenied(AskDocsError):
    status_code = 403
    default_code = "permission_denied"
    default_detail = "You do not have permission to perform this action."


class NotFound(AskDocsError):
    status_code = 404
    default_code = "not_found"
    default_detail = "The requested resource was not found."


class RateLimitExceeded(AskDocsError):
    status_code = 429
    default_code = "rate_limit_exceeded"
    default_detail = "Rate limit exceeded. Please try again later."


def custom_exception_handler(
    exc: Exception, context: dict[str, Any]
) -> Response | None:
    if isinstance(exc, AskDocsError):
        logger.error(
            "Application error: %s",
            exc.detail,
            extra={"code": exc.code, "status_code": exc.status_code},
        )
        return Response(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.detail,
                    "details": {},
                }
            },
            status=exc.status_code,
        )
    return drf_exception_handler(exc, context)
```

---

## Task 8: Core app — models + supporting files

**Files:**
- Create: `backend/apps/core/models.py`
- Create: `backend/apps/core/middleware.py`
- Create: `backend/apps/core/pagination.py`
- Create: `backend/apps/core/permissions.py`
- Create: `backend/apps/core/serializers.py`
- Create: `backend/apps/core/apps.py`

- [ ] **Step 1: Write models.py**

```python
import uuid

from django.db import models


class BaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
```

- [ ] **Step 2: Write middleware.py**

```python
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse


class RequestIDMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = str(uuid.uuid4())
        request.META["REQUEST_ID"] = request_id
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response
```

- [ ] **Step 3: Write pagination.py**

```python
from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
```

- [ ] **Step 4: Write permissions.py**

```python
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class IsWorkspaceMember(BasePermission):
    """Phase 2: will verify workspace membership from JWT claims."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated)
```

- [ ] **Step 5: Write serializers.py**

```python
from rest_framework import serializers


class BaseModelSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
```

- [ ] **Step 6: Write apps.py**

```python
from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.core"
```

---

## Task 9: Health endpoint + URL config + Django entry points

**Files:**
- Create: `backend/apps/core/health.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/api_v1_urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/config/asgi.py`
- Create: `backend/config/celery.py`
- Modify: `backend/config/__init__.py`
- Create: `backend/manage.py`

- [ ] **Step 1: Write health.py** (this makes the tests from Task 5 pass)

```python
import logging

import redis
from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

logger = logging.getLogger(__name__)

VERSION = "0.1.0"


def _check_database() -> str:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return "ok"
    except Exception as exc:
        logger.error("Database health check failed: %s", exc)
        return "error"


def _check_redis() -> str:
    try:
        client = redis.from_url(settings.REDIS_URL)
        client.ping()
        return "ok"
    except Exception as exc:
        logger.error("Redis health check failed: %s", exc)
        return "error"


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request: Request) -> Response:
    db_status = _check_database()
    redis_status = _check_redis()
    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"
    return Response(
        {
            "status": overall,
            "version": VERSION,
            "checks": {
                "database": db_status,
                "redis": redis_status,
            },
        }
    )
```

- [ ] **Step 2: Write config/urls.py**

```python
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.health import health_check

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check, name="health-check"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path("api/v1/", include("config.api_v1_urls")),
]
```

- [ ] **Step 3: Write config/api_v1_urls.py**

```python
from django.urls import URLPattern

# Phase 2+ routes will be registered here
urlpatterns: list[URLPattern] = []
```

- [ ] **Step 4: Write config/wsgi.py**

```python
import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

application = get_wsgi_application()
```

- [ ] **Step 5: Write config/asgi.py**

```python
import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

application = get_asgi_application()
```

- [ ] **Step 6: Write config/celery.py**

```python
import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
```

- [ ] **Step 7: Write config/__init__.py**

```python
from .celery import app as celery_app

__all__ = ["celery_app"]
```

- [ ] **Step 8: Write manage.py**

```python
#!/usr/bin/env python
import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and on your PYTHONPATH?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

- [ ] **Step 9: Make manage.py executable**

```bash
chmod +x backend/manage.py
```

---

## Task 10: Placeholder apps

**Files:** For each of `accounts`, `workspaces`, `documents`, `chat`, `providers`:
- `backend/apps/<name>/apps.py`
- `backend/apps/<name>/models.py`

- [ ] **Step 1: Write apps/accounts/apps.py**

```python
from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
```

- [ ] **Step 2: Write apps/accounts/models.py**

```python
# Phase 2 — models coming in that phase
```

- [ ] **Step 3: Write apps/workspaces/apps.py**

```python
from django.apps import AppConfig


class WorkspacesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.workspaces"
```

- [ ] **Step 4: Write apps/workspaces/models.py**

```python
# Phase 2 — models coming in that phase
```

- [ ] **Step 5: Write apps/documents/apps.py**

```python
from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.documents"
```

- [ ] **Step 6: Write apps/documents/models.py**

```python
# Phase 3 — models coming in that phase
```

- [ ] **Step 7: Write apps/chat/apps.py**

```python
from django.apps import AppConfig


class ChatConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.chat"
```

- [ ] **Step 8: Write apps/chat/models.py**

```python
# Phase 4 — models coming in that phase
```

- [ ] **Step 9: Write apps/providers/apps.py**

```python
from django.apps import AppConfig


class ProvidersConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.providers"
```

- [ ] **Step 10: Write apps/providers/models.py**

```python
# Phase 4 — models coming in that phase
```

---

## Task 11: Run the tests (verify health check passes)

- [ ] **Step 1: Install dev dependencies locally**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/backend
pip install -r requirements-dev.txt
```

- [ ] **Step 2: Run pytest**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/backend
pytest tests/test_health.py -v
```

Expected output:
```
tests/test_health.py::test_health_check_returns_200 PASSED
tests/test_health.py::test_health_check_body PASSED
```

*(pytest-django uses a test database, so the database check may return "error" in CI without a running Postgres — the test asserts `in ("ok", "degraded")` to handle that correctly.)*

- [ ] **Step 3: Commit**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs
git add backend/
git commit -m "feat(backend): phase 1 scaffold — settings, core app, health endpoint, tests pass"
```

---

## Task 12: Pre-commit config

**Files:**
- Create: `.pre-commit-config.yaml` (monorepo root)

- [ ] **Step 1: Write .pre-commit-config.yaml**

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.8
    hooks:
      - id: ruff
        args: [--fix]
        files: ^backend/
      - id: ruff-format
        files: ^backend/

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.6.0
    hooks:
      - id: end-of-file-fixer
      - id: trailing-whitespace

  - repo: local
    hooks:
      - id: mypy
        name: mypy (backend)
        entry: bash -c 'cd backend && mypy .'
        language: system
        types: [python]
        files: ^backend/
        pass_filenames: false
```

---

## Task 13: READMEs

**Files:**
- Create: `backend/README.md`
- Modify: `README.md` (monorepo root)

- [ ] **Step 1: Write backend/README.md**

```markdown
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
│   └── settings/       # base / development / production split
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
```

- [ ] **Step 2: Update monorepo root README.md** — replace the backend "coming next" block with:

```markdown
### Backend

```bash
cd backend
cp .env.example .env
docker compose up --build
```

See `backend/README.md` for full setup, test, and lint instructions.
```

---

## Task 14: Lint + format pass

- [ ] **Step 1: Run ruff fix + format**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/backend
ruff check . --fix
ruff format .
```

Expected: zero errors. If there are remaining errors after `--fix`, fix them manually.

- [ ] **Step 2: Run mypy**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs/backend
mypy .
```

Expected: `Success: no issues found`. Address any type errors before continuing.

---

## Task 15: Final commit

- [ ] **Step 1: Stage and commit everything**

```bash
cd /Users/kusalsaraf/Desktop/AskDocs
git add backend/ .pre-commit-config.yaml README.md
git commit -m "feat(backend): phase 1 - project foundation"
```

- [ ] **Step 2: Push**

```bash
git push origin main
```

---

## Self-review checklist

Spec coverage:
- [x] Directory structure matching spec exactly
- [x] All 12 pinned deps in requirements.txt
- [x] All 7 dev deps in requirements-dev.txt
- [x] ruff rules E, W, F, I, N, B, UP, SIM + line-length 100 + py311 target
- [x] mypy strict + django-stubs plugin
- [x] pytest DJANGO_SETTINGS_MODULE + testpaths + cov-fail-under=0
- [x] base/development/production settings split
- [x] LOG_LEVEL env var, default INFO
- [x] human-readable dev logging, JSON prod logging
- [x] All 6 AskDocsError subclasses with exact status codes
- [x] custom_exception_handler with `{"error": {"code", "message", "details"}}` shape
- [x] BaseModel with UUID pk + created_at + updated_at abstract
- [x] `GET /api/health/` pings DB and Redis, returns `{"status", "version", "checks"}`
- [x] drf-spectacular at /api/schema/ and /api/docs/
- [x] /api/v1/ prefix registered (empty for now)
- [x] CORS dev: localhost:3000, prod: from env
- [x] Celery: reads CELERY_BROKER_URL, autodiscovers tasks
- [x] Dockerfile: python:3.11-slim, build-essential + libpq-dev
- [x] docker-compose: db (pgvector), redis, web, worker with healthchecks
- [x] .env.example with all 9 vars
- [x] .pre-commit-config.yaml: ruff lint+format, mypy, end-of-file-fixer, trailing-whitespace
- [x] tests/test_health.py asserts 200 + status in ("ok", "degraded") + version + checks
- [x] backend/README.md with all required sections
- [x] Root README.md updated

Type consistency: `get_logger` returns `logging.Logger` and is imported as `logging.getLogger(name)` — consistent. `custom_exception_handler` signature matches DRF's `EXCEPTION_HANDLER` contract (`exc, context`) — consistent. `VERSION = "0.1.0"` in health.py matches `SPECTACULAR_SETTINGS["VERSION"]` — consistent.
