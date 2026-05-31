# Phase 4: BYOK LLM Provider System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-workspace LLM provider configuration with Fernet-encrypted API key storage, seven production-ready provider implementations, and a unified `BaseLLMProvider` interface for Phase 5 Chat + RAG to consume.

**Architecture:** A `ProviderConfig` model (OneToOneField to Workspace) stores encrypted credentials. Seven concrete `BaseLLMProvider` subclasses wrap each SDK. A factory resolves the active provider at call time, falling back to a `PlatformDefaultProvider` (Gemini Flash with the platform key) when no config exists. Workspace isolation is enforced via `IsWorkspaceAdmin` permission + direct service-layer lookup.

**Tech Stack:** Django ORM, Fernet (`cryptography`), `openai`, `anthropic`, `google-generativeai`, `mistralai`, `groq`, `httpx` (Ollama), DRF, Django cache (Redis in prod, LocMemCache in tests) for rate limiting, `pytest-mock`.

---

## File Structure

### New files to create

```
apps/providers/
  models.py                    — ProviderConfig (OneToOne to Workspace)
  admin.py                     — Admin registration; hides encrypted_api_key
  crypto.py                    — encrypt_api_key / decrypt_api_key / get_last_4
  rate_limit.py                — check_test_rate_limit() via Django cache
  serializers.py               — ProviderConfigSerializer / ProviderConfigWriteSerializer / ProviderTestResponseSerializer
  services.py                  — get_or_replace_config / delete_config / test_provider / get_active_provider
  views.py                     — ProviderConfigView / ProviderTestView / SupportedProvidersView
  migrations/
    __init__.py
    0001_initial.py            — auto-generated
  llm/
    __init__.py
    base.py                    — BaseLLMProvider ABC + Message / CompletionResult / StreamChunk / ProviderTestResult dataclasses
    exceptions.py              — 7 domain exception classes
    gemini.py                  — GeminiProvider (google-generativeai)
    openai_provider.py         — OpenAIProvider (named to avoid shadowing `openai` package)
    anthropic_provider.py      — AnthropicProvider
    azure.py                   — AzureProvider (openai SDK, custom endpoint)
    mistral.py                 — MistralProvider
    groq_provider.py           — GroqProvider (named to avoid shadowing `groq` package)
    ollama.py                  — OllamaProvider (httpx, no SDK)
    default.py                 — PlatformDefaultProvider (wraps GeminiProvider with platform key)
    factory.py                 — get_llm_provider_for_workspace()
    registry.py                — PROVIDER_REGISTRY dict + SUPPORTED_PROVIDERS metadata list

tests/
  test_provider_crypto.py            — 4 tests
  test_providers_llm.py              — provider unit tests (mocked SDKs), one per provider
  test_provider_factory.py           — 5 tests (factory + registry)
  test_provider_config_endpoints.py  — 14 tests (GET/PUT/DELETE)
  test_provider_test_endpoint.py     — 4 tests (POST /test/ + rate limit)
  test_provider_supported_endpoint.py — 3 tests (public metadata)
```

### Files to modify

```
requirements.txt                — add 6 packages
config/settings/base.py         — add PROVIDER_* settings + CACHES
config/settings/testing.py      — PROVIDER_ENCRYPTION_KEY + LocMemCache
backend/.env                    — add 4 new env vars (generated key)
.env.example                    — document the 4 new vars
config/api_v1_urls.py           — 3 new URL patterns
tests/conftest.py               — member_auth_client / viewer_auth_client / autouse cache.clear()
```

---

### Task 1: New Dependencies, Settings, and Env Vars

**Files:**
- Modify: `requirements.txt`
- Modify: `config/settings/base.py`
- Modify: `config/settings/testing.py`
- Modify: `backend/.env`
- Modify: `.env.example`

- [ ] **Step 1: Add packages to requirements.txt**

Append after `cryptography==42.0.8`:
```
google-generativeai==0.7.0
openai==1.30.5
anthropic==0.30.0
mistralai==0.4.2
groq==0.9.0
httpx==0.27.0
```

- [ ] **Step 2: Add provider settings to config/settings/base.py**

Append after the existing `LOG_LEVEL` line:
```python
# Provider system
PROVIDER_ENCRYPTION_KEY = env("PROVIDER_ENCRYPTION_KEY")  # no default — raises at startup if missing
DEFAULT_PLATFORM_GEMINI_API_KEY = env("DEFAULT_PLATFORM_GEMINI_API_KEY", default="")
PROVIDER_TEST_RATE_LIMIT_PER_HOUR = env.int("PROVIDER_TEST_RATE_LIMIT_PER_HOUR", default=10)
PROVIDER_REQUEST_TIMEOUT_SECONDS = env.int("PROVIDER_REQUEST_TIMEOUT_SECONDS", default=30)

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}
```

- [ ] **Step 3: Override settings in config/settings/testing.py**

Replace the entire file:
```python
from .development import *  # noqa: F401, F403

# Valid Fernet key for tests — DO NOT use in production
# URL-safe base64 of 32 zero-bytes; structurally valid for Fernet
PROVIDER_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

# LocMemCache (not DummyCache) so rate-limit counter actually increments in tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}
```

- [ ] **Step 4: Generate a Fernet key and add to backend/.env**

```bash
docker compose exec web python -c \
  "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the output (e.g. `xK8mP...=`). Append to `backend/.env`:
```
PROVIDER_ENCRYPTION_KEY=<paste-generated-key-here>
DEFAULT_PLATFORM_GEMINI_API_KEY=
PROVIDER_TEST_RATE_LIMIT_PER_HOUR=10
PROVIDER_REQUEST_TIMEOUT_SECONDS=30
```

- [ ] **Step 5: Update .env.example**

Append to `.env.example`:
```
# Encryption key for stored API keys. Generate with:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
PROVIDER_ENCRYPTION_KEY=

# Platform-default Gemini key for workspaces with no BYOK config
DEFAULT_PLATFORM_GEMINI_API_KEY=

# Per-workspace rate limit for POST /provider/test/
PROVIDER_TEST_RATE_LIMIT_PER_HOUR=10

# Provider HTTP request timeout (seconds)
PROVIDER_REQUEST_TIMEOUT_SECONDS=30
```

- [ ] **Step 6: Verify Django starts cleanly**

```bash
docker compose exec web python manage.py check
```

Expected: `System check identified no issues (0 silenced).`

If it raises `ImproperlyConfigured: PROVIDER_ENCRYPTION_KEY not found`, the `.env` file is missing the key from Step 4.

---

### Task 2: ProviderConfig Model, Migration, and Admin

**Files:**
- Modify: `apps/providers/models.py`
- Create: `apps/providers/migrations/__init__.py`
- Create: `apps/providers/migrations/0001_initial.py` (auto-generated)
- Create: `apps/providers/admin.py`

- [ ] **Step 1: Write apps/providers/models.py**

```python
from django.db import models

from apps.core.models import BaseModel


class ProviderConfig(BaseModel):
    class Provider(models.TextChoices):
        OPENAI = "openai", "OpenAI"
        ANTHROPIC = "anthropic", "Anthropic"
        GEMINI = "gemini", "Gemini"
        AZURE = "azure", "Azure OpenAI"
        MISTRAL = "mistral", "Mistral"
        GROQ = "groq", "Groq"
        OLLAMA = "ollama", "Ollama"

    class TestStatus(models.TextChoices):
        UNTESTED = "untested", "Untested"
        OK = "ok", "OK"
        FAILED = "failed", "Failed"

    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="provider_config",
    )
    provider_name = models.CharField(max_length=20, choices=Provider.choices)
    encrypted_api_key = models.BinaryField(null=True, blank=True)
    api_key_last_4 = models.CharField(max_length=4, blank=True)
    base_url = models.URLField(null=True, blank=True)
    azure_region = models.CharField(max_length=100, null=True, blank=True)
    model_name = models.CharField(max_length=255)
    temperature = models.FloatField(default=0.7)
    max_tokens = models.PositiveIntegerField(default=2048)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_status = models.CharField(
        max_length=10,
        choices=TestStatus.choices,
        default=TestStatus.UNTESTED,
    )
    last_test_error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_provider_configs",
    )

    def __str__(self) -> str:
        return f"{self.workspace.name} — {self.provider_name}"
```

- [ ] **Step 2: Generate the migration**

```bash
docker compose exec web python manage.py makemigrations providers
```

Expected: `Migrations for 'providers': apps/providers/migrations/0001_initial.py`

- [ ] **Step 3: Run the migration**

```bash
docker compose exec web python manage.py migrate
```

Expected: `Applying providers.0001_initial... OK`

- [ ] **Step 4: Create apps/providers/admin.py**

```python
from django.contrib import admin

from apps.providers.models import ProviderConfig


@admin.register(ProviderConfig)
class ProviderConfigAdmin(admin.ModelAdmin):
    list_display = [
        "workspace",
        "provider_name",
        "model_name",
        "api_key_last_4",
        "last_test_status",
        "last_tested_at",
        "created_at",
    ]
    list_filter = ["provider_name", "last_test_status"]
    readonly_fields = [
        "api_key_last_4",
        "last_tested_at",
        "last_test_status",
        "last_test_error",
        "created_at",
        "updated_at",
    ]
    exclude = ["encrypted_api_key"]

    def get_queryset(self, request):  # type: ignore[override]
        return super().get_queryset(request).select_related("workspace")
```

- [ ] **Step 5: Commit**

```bash
git add apps/providers/ requirements.txt config/settings/ .env.example
git commit -m "feat(providers): ProviderConfig model + migration + settings"
```

---

### Task 3: Crypto Utilities (TDD)

**Files:**
- Create: `tests/test_provider_crypto.py`
- Create: `apps/providers/crypto.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_provider_crypto.py`:

```python
def test_encrypt_decrypt_roundtrip() -> None:
    from apps.providers.crypto import decrypt_api_key, encrypt_api_key

    plaintext = "sk-proj-abc123xyz789"
    ciphertext = encrypt_api_key(plaintext)
    assert isinstance(ciphertext, bytes)
    assert decrypt_api_key(ciphertext) == plaintext


def test_encrypt_is_nondeterministic() -> None:
    from apps.providers.crypto import encrypt_api_key

    key = "sk-test"
    assert encrypt_api_key(key) != encrypt_api_key(key)


def test_get_last_4_returns_last_four_chars() -> None:
    from apps.providers.crypto import get_last_4

    assert get_last_4("sk-abcd1234") == "1234"
    assert get_last_4("abc-xyz-cb3d") == "cb3d"


def test_get_last_4_handles_short_key() -> None:
    from apps.providers.crypto import get_last_4

    assert get_last_4("ab") == "ab"
    assert get_last_4("") == ""
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_provider_crypto.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `crypto` does not exist yet.

- [ ] **Step 3: Implement apps/providers/crypto.py**

```python
from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = getattr(settings, "PROVIDER_ENCRYPTION_KEY", None)
        if not key:
            raise ImproperlyConfigured(
                "PROVIDER_ENCRYPTION_KEY is not set. "
                'Generate one with: python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        raw = key.encode() if isinstance(key, str) else key
        _fernet = Fernet(raw)
    return _fernet


def encrypt_api_key(plaintext: str) -> bytes:
    return _get_fernet().encrypt(plaintext.encode())


def decrypt_api_key(ciphertext: bytes) -> str:
    # bytes() cast handles memoryview returned by Django's BinaryField on PostgreSQL
    return _get_fernet().decrypt(bytes(ciphertext)).decode()


def get_last_4(plaintext: str) -> str:
    return plaintext[-4:] if len(plaintext) >= 4 else plaintext
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_provider_crypto.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/crypto.py tests/test_provider_crypto.py
git commit -m "feat(providers): Fernet crypto utilities"
```

---

### Task 4: LLM Exception Classes and BaseLLMProvider Abstract Types

**Files:**
- Create: `apps/providers/llm/__init__.py`
- Create: `apps/providers/llm/exceptions.py`
- Create: `apps/providers/llm/base.py`

No dedicated unit tests — these types are tested through concrete providers.

- [ ] **Step 1: Create apps/providers/llm/__init__.py**

```python
```
(empty file)

- [ ] **Step 2: Create apps/providers/llm/exceptions.py**

```python
from apps.core.exceptions import AskDocsError


class ProviderConfigInvalid(AskDocsError):
    status_code = 400
    default_code = "provider_config_invalid"
    default_detail = "Provider configuration is invalid."


class ProviderConfigMissing(AskDocsError):
    status_code = 404
    default_code = "provider_config_missing"
    default_detail = "No provider configuration found for this workspace."


class ProviderAuthError(AskDocsError):
    status_code = 401
    default_code = "provider_auth_error"
    default_detail = "Provider authentication failed. Check your API key."


class ProviderRateLimitError(AskDocsError):
    status_code = 429
    default_code = "provider_rate_limit"
    default_detail = "Provider rate limit exceeded."


class ProviderUnavailableError(AskDocsError):
    status_code = 503
    default_code = "provider_unavailable"
    default_detail = "Provider service is currently unavailable."


class ProviderInvalidResponseError(AskDocsError):
    status_code = 502
    default_code = "provider_invalid_response"
    default_detail = "Provider returned an unexpected response."


class ProviderTimeoutError(AskDocsError):
    status_code = 504
    default_code = "provider_timeout"
    default_detail = "Provider request timed out."
```

- [ ] **Step 3: Create apps/providers/llm/base.py**

```python
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Iterator

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig


@dataclass
class Message:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class CompletionResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    model: str
    finish_reason: str


@dataclass
class StreamChunk:
    delta: str
    finish_reason: str | None = None


@dataclass
class ProviderTestResult:
    success: bool
    latency_ms: int
    model_echo: str
    error: str | None = None


class BaseLLMProvider(ABC):
    provider_name: str
    supports_streaming: bool = False

    def __init__(self, config: ProviderConfig | None) -> None:
        self.config = config

    @abstractmethod
    def test_connection(self) -> ProviderTestResult: ...

    @abstractmethod
    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult: ...

    @abstractmethod
    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]: ...
```

- [ ] **Step 4: Verify imports**

```bash
docker compose exec web python -c \
  "from apps.providers.llm.base import BaseLLMProvider, ProviderTestResult; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/
git commit -m "feat(providers): LLM base types and exception classes"
```

---

### Task 5: GeminiProvider (TDD)

**Files:**
- Create: `tests/test_providers_llm.py` (start the file; each subsequent provider task appends to it)
- Create: `apps/providers/llm/gemini.py`

- [ ] **Step 1: Create tests/test_providers_llm.py with the Gemini test**

```python
"""Unit tests for concrete LLM provider implementations.
All SDK calls are mocked — no real network requests.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from apps.providers.crypto import encrypt_api_key
from apps.providers.llm.base import CompletionResult, Message, ProviderTestResult


def _make_config(workspace: Any, provider_name: str, model_name: str = "test-model", **kwargs: Any) -> Any:
    from apps.providers.models import ProviderConfig

    return ProviderConfig.objects.create(
        workspace=workspace,
        provider_name=provider_name,
        encrypted_api_key=encrypt_api_key("sk-test1234"),
        api_key_last_4="1234",
        model_name=model_name,
        **kwargs,
    )


# ── Gemini ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_gemini_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "gemini", model_name="gemini-1.5-flash")

    with patch("google.generativeai.configure"), \
         patch("google.generativeai.GenerativeModel") as mock_model_cls:
        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_model.generate_content.return_value = mock_response

        from apps.providers.llm.gemini import GeminiProvider
        result = GeminiProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    assert result.error is None
    assert result.latency_ms >= 0


@pytest.mark.django_db
def test_gemini_test_connection_failure_returns_result_not_exception(workspace: Any) -> None:
    config = _make_config(workspace, "gemini", model_name="gemini-1.5-flash")

    with patch("google.generativeai.configure"), \
         patch("google.generativeai.GenerativeModel") as mock_model_cls:
        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model
        mock_model.generate_content.side_effect = Exception("invalid api key")

        from apps.providers.llm.gemini import GeminiProvider
        result = GeminiProvider(config).test_connection()

    assert result.success is False
    assert "invalid api key" in result.error
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `ImportError` — `apps.providers.llm.gemini` does not exist yet.

- [ ] **Step 3: Implement apps/providers/llm/gemini.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import google.generativeai as genai
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)


class GeminiProvider(BaseLLMProvider):
    provider_name = "gemini"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        if config is not None:
            api_key = decrypt_api_key(bytes(config.encrypted_api_key))
            self._model_name = config.model_name
        else:
            api_key = settings.DEFAULT_PLATFORM_GEMINI_API_KEY
            self._model_name = "gemini-1.5-flash"
        genai.configure(api_key=api_key)

    def _model(self) -> genai.GenerativeModel:
        return genai.GenerativeModel(self._model_name)

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        workspace_id = str(self.config.workspace_id) if self.config else "platform-default"
        logger.info(
            "Gemini test_connection start",
            extra={"provider": "gemini", "workspace_id": workspace_id, "model": self._model_name},
        )
        try:
            response = self._model().generate_content(
                "Reply with ok",
                generation_config=genai.GenerationConfig(max_output_tokens=5),
                request_options={"timeout": settings.PROVIDER_REQUEST_TIMEOUT_SECONDS},
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.info("Gemini test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(
                success=True, latency_ms=latency_ms, model_echo=response.text.strip()
            )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Gemini test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(
                success=False, latency_ms=latency_ms, model_echo="", error=str(exc)
            )

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        timeout = settings.PROVIDER_REQUEST_TIMEOUT_SECONDS
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        temperature = kwargs.get("temperature", self.config.temperature if self.config else 0.7)

        history = [
            {"role": "user" if m.role == "user" else "model", "parts": [m.content]}
            for m in messages[:-1]
        ]
        chat = self._model().start_chat(history=history)
        response = chat.send_message(
            messages[-1].content,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens, temperature=temperature
            ),
            request_options={"timeout": timeout},
        )
        usage = response.usage_metadata
        return CompletionResult(
            text=response.text,
            prompt_tokens=usage.prompt_token_count,
            completion_tokens=usage.candidates_token_count,
            total_tokens=usage.total_token_count,
            model=self._model_name,
            finish_reason="stop",
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/gemini.py tests/test_providers_llm.py
git commit -m "feat(providers): GeminiProvider"
```

---

### Task 6: OpenAIProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/openai_provider.py`

- [ ] **Step 1: Append OpenAI tests to tests/test_providers_llm.py**

```python
# ── OpenAI ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_openai_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "openai", model_name="gpt-4o")

    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "gpt-4o"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.openai_provider import OpenAIProvider
        result = OpenAIProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"


@pytest.mark.django_db
def test_openai_complete(workspace: Any) -> None:
    config = _make_config(workspace, "openai", model_name="gpt-4o")

    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "Hello!"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 10
        mock_resp.usage.completion_tokens = 3
        mock_resp.usage.total_tokens = 13
        mock_resp.model = "gpt-4o"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.openai_provider import OpenAIProvider
        result = OpenAIProvider(config).complete(
            [Message(role="user", content="Say hello")]
        )

    assert result.text == "Hello!"
    assert result.total_tokens == 13
    assert result.finish_reason == "stop"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_openai_test_connection_success -v
```

Expected: `ImportError` — module missing.

- [ ] **Step 3: Implement apps/providers/llm/openai_provider.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import openai
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)
from apps.providers.llm.exceptions import (
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)

_TEST_MESSAGES = [{"role": "user", "content": "Reply with ok"}]


class OpenAIProvider(BaseLLMProvider):
    provider_name = "openai"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None, "OpenAIProvider requires a ProviderConfig"
        api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        self._client = openai.OpenAI(
            api_key=api_key,
            timeout=settings.PROVIDER_REQUEST_TIMEOUT_SECONDS,
        )
        self._model_name = config.model_name

    def _call(self, messages: list[dict[str, str]], max_tokens: int) -> Any:
        return self._client.chat.completions.create(
            model=self._model_name,
            messages=messages,
            max_tokens=max_tokens,
        )

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        workspace_id = str(self.config.workspace_id) if self.config else ""
        logger.info(
            "OpenAI test_connection start",
            extra={"provider": "openai", "workspace_id": workspace_id, "model": self._model_name},
        )
        try:
            resp = self._call(_TEST_MESSAGES, max_tokens=5)
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.choices[0].message.content or ""
            logger.info("OpenAI test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except openai.AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except openai.RateLimitError as exc:
            raise ProviderRateLimitError(str(exc)) from exc
        except openai.APITimeoutError as exc:
            raise ProviderTimeoutError(str(exc)) from exc
        except openai.APIStatusError as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("OpenAI test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("OpenAI test_connection unexpected error", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        openai_messages = [{"role": m.role, "content": m.content} for m in messages]
        resp = self._call(openai_messages, max_tokens=max_tokens)
        return CompletionResult(
            text=resp.choices[0].message.content or "",
            prompt_tokens=resp.usage.prompt_tokens,
            completion_tokens=resp.usage.completion_tokens,
            total_tokens=resp.usage.total_tokens,
            model=resp.model,
            finish_reason=resp.choices[0].finish_reason,
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/openai_provider.py tests/test_providers_llm.py
git commit -m "feat(providers): OpenAIProvider"
```

---

### Task 7: AnthropicProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/anthropic_provider.py`

- [ ] **Step 1: Append Anthropic test to tests/test_providers_llm.py**

```python
# ── Anthropic ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_anthropic_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "anthropic", model_name="claude-3-haiku-20240307")

    with patch("anthropic.Anthropic") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock()]
        mock_resp.content[0].text = "ok"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 5
        mock_resp.usage.output_tokens = 1
        mock_resp.model = "claude-3-haiku-20240307"
        mock_client.messages.create.return_value = mock_resp

        from apps.providers.llm.anthropic_provider import AnthropicProvider
        result = AnthropicProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_anthropic_test_connection_success -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement apps/providers/llm/anthropic_provider.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import anthropic as anthropic_sdk
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)
from apps.providers.llm.exceptions import (
    ProviderAuthError,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)


class AnthropicProvider(BaseLLMProvider):
    provider_name = "anthropic"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None
        api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        self._client = anthropic_sdk.Anthropic(
            api_key=api_key,
            timeout=settings.PROVIDER_REQUEST_TIMEOUT_SECONDS,
        )
        self._model_name = config.model_name

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        logger.info(
            "Anthropic test_connection start",
            extra={"provider": "anthropic", "workspace_id": str(self.config.workspace_id), "model": self._model_name},
        )
        try:
            resp = self._client.messages.create(
                model=self._model_name,
                max_tokens=5,
                messages=[{"role": "user", "content": "Reply with ok"}],
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.content[0].text if resp.content else ""
            logger.info("Anthropic test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except anthropic_sdk.AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except anthropic_sdk.RateLimitError as exc:
            raise ProviderRateLimitError(str(exc)) from exc
        except anthropic_sdk.APITimeoutError as exc:
            raise ProviderTimeoutError(str(exc)) from exc
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Anthropic test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        # Anthropic requires system messages to be passed separately
        system = next((m.content for m in messages if m.role == "system"), "")
        user_messages = [
            {"role": m.role, "content": m.content}
            for m in messages if m.role != "system"
        ]
        create_kwargs: dict[str, Any] = {
            "model": self._model_name,
            "max_tokens": max_tokens,
            "messages": user_messages,
        }
        if system:
            create_kwargs["system"] = system
        resp = self._client.messages.create(**create_kwargs)
        text = resp.content[0].text if resp.content else ""
        return CompletionResult(
            text=text,
            prompt_tokens=resp.usage.input_tokens,
            completion_tokens=resp.usage.output_tokens,
            total_tokens=resp.usage.input_tokens + resp.usage.output_tokens,
            model=resp.model,
            finish_reason=resp.stop_reason or "stop",
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/anthropic_provider.py tests/test_providers_llm.py
git commit -m "feat(providers): AnthropicProvider"
```

---

### Task 8: AzureProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/azure.py`

- [ ] **Step 1: Append Azure test to tests/test_providers_llm.py**

```python
# ── Azure OpenAI ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_azure_test_connection_success(workspace: Any) -> None:
    config = _make_config(
        workspace,
        "azure",
        model_name="gpt-4o-deployment",
        base_url="https://my-resource.openai.azure.com",
        azure_region="eastus",
    )

    with patch("openai.AzureOpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "gpt-4o-deployment"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.azure import AzureProvider
        result = AzureProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    # Verify AzureOpenAI was instantiated with the correct endpoint
    mock_cls.assert_called_once()
    call_kwargs = mock_cls.call_args.kwargs
    assert call_kwargs["azure_endpoint"] == "https://my-resource.openai.azure.com"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_azure_test_connection_success -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement apps/providers/llm/azure.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import openai
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)
from apps.providers.llm.exceptions import (
    ProviderAuthError,
    ProviderConfigInvalid,
    ProviderRateLimitError,
    ProviderTimeoutError,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)

_TEST_MESSAGES = [{"role": "user", "content": "Reply with ok"}]


class AzureProvider(BaseLLMProvider):
    provider_name = "azure"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None
        if not config.base_url:
            raise ProviderConfigInvalid("Azure provider requires base_url (the Azure endpoint).")
        api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        self._client = openai.AzureOpenAI(
            api_key=api_key,
            azure_endpoint=config.base_url,
            api_version="2024-02-01",
            timeout=settings.PROVIDER_REQUEST_TIMEOUT_SECONDS,
        )
        self._model_name = config.model_name  # deployment name in Azure

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        logger.info(
            "Azure test_connection start",
            extra={"provider": "azure", "workspace_id": str(self.config.workspace_id), "model": self._model_name},
        )
        try:
            resp = self._client.chat.completions.create(
                model=self._model_name,
                messages=_TEST_MESSAGES,
                max_tokens=5,
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.choices[0].message.content or ""
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except openai.AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except openai.RateLimitError as exc:
            raise ProviderRateLimitError(str(exc)) from exc
        except openai.APITimeoutError as exc:
            raise ProviderTimeoutError(str(exc)) from exc
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Azure test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        openai_messages = [{"role": m.role, "content": m.content} for m in messages]
        resp = self._client.chat.completions.create(
            model=self._model_name, messages=openai_messages, max_tokens=max_tokens
        )
        return CompletionResult(
            text=resp.choices[0].message.content or "",
            prompt_tokens=resp.usage.prompt_tokens,
            completion_tokens=resp.usage.completion_tokens,
            total_tokens=resp.usage.total_tokens,
            model=resp.model,
            finish_reason=resp.choices[0].finish_reason,
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/azure.py tests/test_providers_llm.py
git commit -m "feat(providers): AzureProvider"
```

---

### Task 9: MistralProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/mistral.py`

- [ ] **Step 1: Append Mistral test to tests/test_providers_llm.py**

```python
# ── Mistral ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_mistral_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "mistral", model_name="mistral-large-latest")

    with patch("mistralai.client.MistralClient") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_client.chat.return_value = mock_resp

        from apps.providers.llm.mistral import MistralProvider
        result = MistralProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_mistral_test_connection_success -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement apps/providers/llm/mistral.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)


class MistralProvider(BaseLLMProvider):
    provider_name = "mistral"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None
        api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        self._client = MistralClient(api_key=api_key)
        self._model_name = config.model_name

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        logger.info(
            "Mistral test_connection start",
            extra={"provider": "mistral", "workspace_id": str(self.config.workspace_id), "model": self._model_name},
        )
        try:
            resp = self._client.chat(
                model=self._model_name,
                messages=[ChatMessage(role="user", content="Reply with ok")],
                max_tokens=5,
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.choices[0].message.content or ""
            logger.info("Mistral test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Mistral test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        chat_messages = [ChatMessage(role=m.role, content=m.content) for m in messages]
        resp = self._client.chat(
            model=self._model_name, messages=chat_messages, max_tokens=max_tokens
        )
        return CompletionResult(
            text=resp.choices[0].message.content or "",
            prompt_tokens=resp.usage.prompt_tokens,
            completion_tokens=resp.usage.completion_tokens,
            total_tokens=resp.usage.total_tokens,
            model=self._model_name,
            finish_reason=resp.choices[0].finish_reason or "stop",
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/mistral.py tests/test_providers_llm.py
git commit -m "feat(providers): MistralProvider"
```

---

### Task 10: GroqProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/groq_provider.py`

- [ ] **Step 1: Append Groq test to tests/test_providers_llm.py**

```python
# ── Groq ──────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_groq_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "groq", model_name="llama3-8b-8192")

    with patch("groq.Groq") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "llama3-8b-8192"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.groq_provider import GroqProvider
        result = GroqProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_groq_test_connection_success -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement apps/providers/llm/groq_provider.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import groq as groq_sdk
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.crypto import decrypt_api_key
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)
from apps.providers.llm.exceptions import ProviderAuthError, ProviderRateLimitError, ProviderTimeoutError

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)

_TEST_MESSAGES = [{"role": "user", "content": "Reply with ok"}]


class GroqProvider(BaseLLMProvider):
    provider_name = "groq"
    supports_streaming = True

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None
        api_key = decrypt_api_key(bytes(config.encrypted_api_key))
        self._client = groq_sdk.Groq(
            api_key=api_key,
            timeout=settings.PROVIDER_REQUEST_TIMEOUT_SECONDS,
        )
        self._model_name = config.model_name

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        logger.info(
            "Groq test_connection start",
            extra={"provider": "groq", "workspace_id": str(self.config.workspace_id), "model": self._model_name},
        )
        try:
            resp = self._client.chat.completions.create(
                model=self._model_name, messages=_TEST_MESSAGES, max_tokens=5
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.choices[0].message.content or ""
            logger.info("Groq test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except groq_sdk.AuthenticationError as exc:
            raise ProviderAuthError(str(exc)) from exc
        except groq_sdk.RateLimitError as exc:
            raise ProviderRateLimitError(str(exc)) from exc
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Groq test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        groq_messages = [{"role": m.role, "content": m.content} for m in messages]
        resp = self._client.chat.completions.create(
            model=self._model_name, messages=groq_messages, max_tokens=max_tokens
        )
        return CompletionResult(
            text=resp.choices[0].message.content or "",
            prompt_tokens=resp.usage.prompt_tokens,
            completion_tokens=resp.usage.completion_tokens,
            total_tokens=resp.usage.total_tokens,
            model=resp.model,
            finish_reason=resp.choices[0].finish_reason,
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/groq_provider.py tests/test_providers_llm.py
git commit -m "feat(providers): GroqProvider"
```

---

### Task 11: OllamaProvider (TDD)

**Files:**
- Modify: `tests/test_providers_llm.py` (append)
- Create: `apps/providers/llm/ollama.py`

- [ ] **Step 1: Append Ollama test to tests/test_providers_llm.py**

```python
# ── Ollama ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ollama_test_connection_success(workspace: Any) -> None:
    config = ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="ollama",
        encrypted_api_key=None,   # Ollama has no API key
        api_key_last_4="",
        model_name="llama3",
        base_url="http://localhost:11434",
    )

    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "message": {"content": "ok"},
            "done": True,
            "eval_count": 1,
            "prompt_eval_count": 5,
            "model": "llama3",
        }
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        from apps.providers.llm.ollama import OllamaProvider
        result = OllamaProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert "http://localhost:11434/api/chat" in str(call_args)
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_providers_llm.py::test_ollama_test_connection_success -v
```

Expected: `ImportError`

- [ ] **Step 3: Implement apps/providers/llm/ollama.py**

```python
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

import httpx
from django.conf import settings

from apps.core.logging import get_logger
from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)
from apps.providers.llm.exceptions import (
    ProviderConfigInvalid,
    ProviderTimeoutError,
    ProviderUnavailableError,
)

if TYPE_CHECKING:
    from apps.providers.models import ProviderConfig

logger = get_logger(__name__)


class OllamaProvider(BaseLLMProvider):
    provider_name = "ollama"
    supports_streaming = False

    def __init__(self, config: ProviderConfig | None) -> None:
        super().__init__(config)
        assert config is not None
        if not config.base_url:
            raise ProviderConfigInvalid("Ollama provider requires base_url (e.g. http://localhost:11434).")
        self._base_url = config.base_url.rstrip("/")
        self._model_name = config.model_name
        self._timeout = settings.PROVIDER_REQUEST_TIMEOUT_SECONDS

    def _chat(self, messages: list[dict[str, str]], num_predict: int = 5) -> dict[str, Any]:
        url = f"{self._base_url}/api/chat"
        response = httpx.post(
            url,
            json={
                "model": self._model_name,
                "messages": messages,
                "options": {"num_predict": num_predict},
                "stream": False,
            },
            timeout=self._timeout,
        )
        response.raise_for_status()
        return response.json()  # type: ignore[no-any-return]

    def test_connection(self) -> ProviderTestResult:
        start = time.monotonic()
        logger.info(
            "Ollama test_connection start",
            extra={"provider": "ollama", "workspace_id": str(self.config.workspace_id), "model": self._model_name},
        )
        try:
            data = self._chat([{"role": "user", "content": "Reply with ok"}])
            latency_ms = int((time.monotonic() - start) * 1000)
            text = data.get("message", {}).get("content", "")
            logger.info("Ollama test_connection ok", extra={"latency_ms": latency_ms})
            return ProviderTestResult(success=True, latency_ms=latency_ms, model_echo=text.strip())
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(str(exc)) from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (502, 503, 504):
                raise ProviderUnavailableError(str(exc)) from exc
            latency_ms = int((time.monotonic() - start) * 1000)
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Ollama test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(success=False, latency_ms=latency_ms, model_echo="", error=str(exc))

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
        ollama_messages = [{"role": m.role, "content": m.content} for m in messages]
        data = self._chat(ollama_messages, num_predict=max_tokens)
        text = data.get("message", {}).get("content", "")
        return CompletionResult(
            text=text,
            prompt_tokens=data.get("prompt_eval_count", 0),
            completion_tokens=data.get("eval_count", 0),
            total_tokens=data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
            model=data.get("model", self._model_name),
            finish_reason="stop" if data.get("done") else "length",
        )

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_providers_llm.py -v
```

Expected: `9 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/llm/ollama.py tests/test_providers_llm.py
git commit -m "feat(providers): OllamaProvider"
```

---

### Task 12: PlatformDefaultProvider, Registry, and Factory (TDD)

**Files:**
- Create: `tests/test_provider_factory.py`
- Create: `apps/providers/llm/default.py`
- Create: `apps/providers/llm/registry.py`
- Create: `apps/providers/llm/factory.py`

- [ ] **Step 1: Write tests/test_provider_factory.py**

```python
import pytest

from apps.providers.llm.base import BaseLLMProvider


@pytest.mark.django_db
def test_factory_returns_platform_default_when_no_config(workspace):
    from apps.providers.llm.default import PlatformDefaultProvider
    from apps.providers.llm.factory import get_llm_provider_for_workspace

    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, PlatformDefaultProvider)


@pytest.mark.django_db
def test_factory_returns_openai_provider_for_openai_config(workspace):
    from apps.providers.crypto import encrypt_api_key
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.openai_provider import OpenAIProvider
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="openai",
        encrypted_api_key=encrypt_api_key("sk-test"),
        api_key_last_4="test",
        model_name="gpt-4o",
    )
    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, OpenAIProvider)


@pytest.mark.django_db
def test_factory_returns_gemini_provider_for_gemini_config(workspace):
    from apps.providers.crypto import encrypt_api_key
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.gemini import GeminiProvider
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="gemini",
        encrypted_api_key=encrypt_api_key("AIza-test"),
        api_key_last_4="test",
        model_name="gemini-1.5-flash",
    )
    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, GeminiProvider)


@pytest.mark.django_db
def test_factory_returns_ollama_provider_for_ollama_config(workspace):
    from apps.providers.llm.factory import get_llm_provider_for_workspace
    from apps.providers.llm.ollama import OllamaProvider
    from apps.providers.models import ProviderConfig

    ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="ollama",
        encrypted_api_key=None,
        api_key_last_4="",
        model_name="llama3",
        base_url="http://localhost:11434",
    )
    provider = get_llm_provider_for_workspace(workspace)
    assert isinstance(provider, OllamaProvider)


def test_supported_providers_list_contains_all_seven():
    from apps.providers.llm.registry import SUPPORTED_PROVIDERS

    names = {p["name"] for p in SUPPORTED_PROVIDERS}
    assert names == {"openai", "anthropic", "gemini", "azure", "mistral", "groq", "ollama"}


def test_supported_providers_have_required_fields():
    from apps.providers.llm.registry import SUPPORTED_PROVIDERS

    required = {"name", "display_name", "requires_api_key", "requires_base_url", "requires_region", "suggested_models", "description"}
    for provider in SUPPORTED_PROVIDERS:
        assert required.issubset(provider.keys()), f"Missing keys in {provider['name']}"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_provider_factory.py -v
```

Expected: `ImportError` — modules missing.

- [ ] **Step 3: Implement apps/providers/llm/default.py**

```python
from __future__ import annotations

from typing import Any, Iterator

from django.conf import settings

from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)


class PlatformDefaultProvider(BaseLLMProvider):
    """Wraps GeminiProvider using the platform's shared API key.

    Used when a workspace has no BYOK ProviderConfig.
    """

    provider_name = "gemini"
    supports_streaming = True

    def __init__(self, config: None = None) -> None:
        super().__init__(config=None)

    def _get_gemini(self) -> BaseLLMProvider:
        from apps.providers.llm.gemini import GeminiProvider
        return GeminiProvider(config=None)  # GeminiProvider handles None → uses platform key

    def test_connection(self) -> ProviderTestResult:
        if not settings.DEFAULT_PLATFORM_GEMINI_API_KEY:
            return ProviderTestResult(
                success=False,
                latency_ms=0,
                model_echo="",
                error="DEFAULT_PLATFORM_GEMINI_API_KEY is not configured on this server.",
            )
        return self._get_gemini().test_connection()

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        return self._get_gemini().complete(messages, **kwargs)

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        raise NotImplementedError("Streaming will be implemented in Phase 5")
```

- [ ] **Step 4: Implement apps/providers/llm/registry.py**

```python
from typing import Any

from apps.providers.llm.anthropic_provider import AnthropicProvider
from apps.providers.llm.azure import AzureProvider
from apps.providers.llm.base import BaseLLMProvider
from apps.providers.llm.gemini import GeminiProvider
from apps.providers.llm.groq_provider import GroqProvider
from apps.providers.llm.mistral import MistralProvider
from apps.providers.llm.ollama import OllamaProvider
from apps.providers.llm.openai_provider import OpenAIProvider

PROVIDER_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "azure": AzureProvider,
    "mistral": MistralProvider,
    "groq": GroqProvider,
    "ollama": OllamaProvider,
}

SUPPORTED_PROVIDERS: list[dict[str, Any]] = [
    {
        "name": "openai",
        "display_name": "OpenAI",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview"],
        "description": "GPT-4o, GPT-4-turbo, o1-preview and more.",
    },
    {
        "name": "anthropic",
        "display_name": "Anthropic",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307", "claude-3-opus-20240229"],
        "description": "Claude 3.5 Sonnet, Claude 3 Haiku, Claude 3 Opus.",
    },
    {
        "name": "gemini",
        "display_name": "Google Gemini",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
        "description": "Gemini 1.5 Pro, Gemini 1.5 Flash.",
    },
    {
        "name": "azure",
        "display_name": "Azure OpenAI",
        "requires_api_key": True,
        "requires_base_url": True,
        "requires_region": True,
        "suggested_models": [],
        "description": "Azure-hosted OpenAI models. Provide your endpoint URL and deployment name.",
    },
    {
        "name": "mistral",
        "display_name": "Mistral",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x7b"],
        "description": "Mistral Large, Mistral Small, Mixtral.",
    },
    {
        "name": "groq",
        "display_name": "Groq",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768"],
        "description": "Ultra-fast inference on Llama 3, Mixtral.",
    },
    {
        "name": "ollama",
        "display_name": "Ollama (self-hosted)",
        "requires_api_key": False,
        "requires_base_url": True,
        "requires_region": False,
        "suggested_models": ["llama3", "mistral", "phi3"],
        "description": "Self-hosted Ollama instance. Provide the base URL (e.g. http://localhost:11434).",
    },
]
```

- [ ] **Step 5: Implement apps/providers/llm/factory.py**

```python
from apps.providers.llm.base import BaseLLMProvider
from apps.providers.llm.default import PlatformDefaultProvider
from apps.providers.llm.exceptions import ProviderConfigInvalid
from apps.providers.llm.registry import PROVIDER_REGISTRY
from apps.workspaces.models import Workspace


def get_llm_provider_for_workspace(workspace: Workspace) -> BaseLLMProvider:
    from apps.providers.models import ProviderConfig

    try:
        config = ProviderConfig.objects.get(workspace=workspace)
    except ProviderConfig.DoesNotExist:
        return PlatformDefaultProvider()

    provider_class = PROVIDER_REGISTRY.get(config.provider_name)
    if provider_class is None:
        raise ProviderConfigInvalid(
            f"Unknown provider '{config.provider_name}'. "
            f"Valid options: {', '.join(PROVIDER_REGISTRY.keys())}"
        )
    return provider_class(config)
```

- [ ] **Step 6: Run — must pass**

```bash
docker compose exec web pytest tests/test_provider_factory.py tests/test_providers_llm.py -v
```

Expected: `15 passed`

- [ ] **Step 7: Commit**

```bash
git add apps/providers/llm/default.py apps/providers/llm/registry.py apps/providers/llm/factory.py \
        tests/test_provider_factory.py
git commit -m "feat(providers): PlatformDefaultProvider + registry + factory"
```

---

### Task 13: Rate Limiting Utility (TDD)

**Files:**
- Create: `tests/test_provider_rate_limit.py`
- Create: `apps/providers/rate_limit.py`

- [ ] **Step 1: Write tests/test_provider_rate_limit.py**

```python
from unittest.mock import patch

import pytest
from django.core.cache import cache

from apps.core.exceptions import RateLimitExceeded


def test_rate_limit_allows_up_to_limit() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-001")  # must not raise


def test_rate_limit_blocks_on_eleventh_call() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-002")

    with pytest.raises(RateLimitExceeded):
        check_test_rate_limit("ws-002")


def test_rate_limit_is_per_workspace() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-003")

    # Different workspace — should not be affected
    check_test_rate_limit("ws-004")  # must not raise
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_provider_rate_limit.py -v
```

Expected: `ImportError` — module missing.

- [ ] **Step 3: Implement apps/providers/rate_limit.py**

```python
from datetime import datetime, timezone

from django.conf import settings
from django.core.cache import cache

from apps.core.exceptions import RateLimitExceeded


def check_test_rate_limit(workspace_id: str) -> None:
    """Increment the per-workspace hourly counter; raise RateLimitExceeded if over limit."""
    hour = datetime.now(tz=timezone.utc).strftime("%Y%m%d%H")
    key = f"provider_test:{workspace_id}:{hour}"
    limit: int = getattr(settings, "PROVIDER_TEST_RATE_LIMIT_PER_HOUR", 10)

    count: int = cache.get(key, 0)
    if count >= limit:
        raise RateLimitExceeded(
            detail=f"Maximum {limit} connection tests per hour per workspace.",
            code="provider_test_rate_limit",
        )
    cache.set(key, count + 1, timeout=3600)
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_provider_rate_limit.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/rate_limit.py tests/test_provider_rate_limit.py
git commit -m "feat(providers): Redis-backed per-workspace rate limiting"
```

---

### Task 14: Services (TDD)

**Files:**
- Create: `tests/test_provider_services.py`
- Create: `apps/providers/services.py`

- [ ] **Step 1: Write tests/test_provider_services.py**

```python
from unittest.mock import MagicMock, patch

import pytest

from apps.providers.llm.base import ProviderTestResult


@pytest.mark.django_db
def test_get_or_replace_config_creates_new_config(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config

    data = {
        "provider_name": "openai",
        "api_key": "sk-abc1234xyz",
        "model_name": "gpt-4o",
        "temperature": 0.5,
        "max_tokens": 1024,
    }
    config = get_or_replace_config(workspace, data, created_by=user)

    assert config.provider_name == "openai"
    assert config.model_name == "gpt-4o"
    assert config.api_key_last_4 == "4xyz"
    assert config.encrypted_api_key is not None
    assert config.last_test_status == "untested"
    assert ProviderConfig.objects.filter(workspace=workspace).count() == 1


@pytest.mark.django_db
def test_get_or_replace_config_replaces_existing(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import get_or_replace_config

    get_or_replace_config(workspace, {"provider_name": "openai", "api_key": "sk-first", "model_name": "gpt-4o"}, created_by=user)
    get_or_replace_config(workspace, {"provider_name": "gemini", "api_key": "AIza-second", "model_name": "gemini-1.5-pro"}, created_by=user)

    assert ProviderConfig.objects.filter(workspace=workspace).count() == 1
    config = ProviderConfig.objects.get(workspace=workspace)
    assert config.provider_name == "gemini"


@pytest.mark.django_db
def test_delete_config_removes_record(workspace, user):
    from apps.providers.models import ProviderConfig
    from apps.providers.services import delete_config, get_or_replace_config

    get_or_replace_config(workspace, {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"}, created_by=user)
    delete_config(workspace)
    assert not ProviderConfig.objects.filter(workspace=workspace).exists()


@pytest.mark.django_db
def test_test_provider_updates_db_on_success(workspace, user):
    from apps.providers.services import get_or_replace_config, test_provider
    from apps.providers.models import ProviderConfig

    get_or_replace_config(workspace, {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"}, created_by=user)

    mock_result = ProviderTestResult(success=True, latency_ms=100, model_echo="ok")
    with patch("apps.providers.services.get_active_provider") as mock_factory:
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = mock_result
        mock_factory.return_value = mock_provider

        result = test_provider(workspace)

    config = ProviderConfig.objects.get(workspace=workspace)
    assert result.success is True
    assert config.last_test_status == "ok"
    assert config.last_tested_at is not None
    assert config.last_test_error == ""


@pytest.mark.django_db
def test_test_provider_updates_db_on_failure(workspace, user):
    from apps.providers.services import get_or_replace_config, test_provider
    from apps.providers.models import ProviderConfig

    get_or_replace_config(workspace, {"provider_name": "openai", "api_key": "sk-bad", "model_name": "gpt-4o"}, created_by=user)

    mock_result = ProviderTestResult(success=False, latency_ms=50, model_echo="", error="invalid key")
    with patch("apps.providers.services.get_active_provider") as mock_factory:
        mock_provider = MagicMock()
        mock_provider.test_connection.return_value = mock_result
        mock_factory.return_value = mock_provider

        result = test_provider(workspace)

    config = ProviderConfig.objects.get(workspace=workspace)
    assert result.success is False
    assert config.last_test_status == "failed"
    assert config.last_test_error == "invalid key"
```

- [ ] **Step 2: Run — must fail**

```bash
docker compose exec web pytest tests/test_provider_services.py -v
```

Expected: `ImportError` — `services` module missing.

- [ ] **Step 3: Implement apps/providers/services.py**

```python
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.utils import timezone

from apps.core.logging import get_logger
from apps.providers.crypto import encrypt_api_key, get_last_4
from apps.providers.llm.base import BaseLLMProvider, ProviderTestResult
from apps.providers.llm.factory import get_llm_provider_for_workspace
from apps.providers.models import ProviderConfig

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.workspaces.models import Workspace

logger = get_logger(__name__)

_PROVIDERS_REQUIRING_KEY = {"openai", "anthropic", "gemini", "azure", "mistral", "groq"}


def get_or_replace_config(
    workspace: Workspace,
    data: dict[str, Any],
    created_by: User,
) -> ProviderConfig:
    """Create or replace the workspace's ProviderConfig. Resets test status."""
    api_key: str = data.get("api_key", "")
    defaults: dict[str, Any] = {
        "provider_name": data["provider_name"],
        "model_name": data.get("model_name", ""),
        "temperature": data.get("temperature", 0.7),
        "max_tokens": data.get("max_tokens", 2048),
        "base_url": data.get("base_url"),
        "azure_region": data.get("azure_region"),
        "created_by": created_by,
        "last_test_status": ProviderConfig.TestStatus.UNTESTED,
        "last_test_error": "",
        "last_tested_at": None,
    }
    if api_key:
        defaults["encrypted_api_key"] = encrypt_api_key(api_key)
        defaults["api_key_last_4"] = get_last_4(api_key)
    else:
        defaults["encrypted_api_key"] = None
        defaults["api_key_last_4"] = ""

    config, created = ProviderConfig.objects.update_or_create(
        workspace=workspace,
        defaults=defaults,
    )
    action = "created" if created else "replaced"
    logger.info(
        f"ProviderConfig {action}",
        extra={"workspace_id": str(workspace.id), "provider": config.provider_name},
    )
    return config


def delete_config(workspace: Workspace) -> None:
    deleted, _ = ProviderConfig.objects.filter(workspace=workspace).delete()
    logger.info("ProviderConfig deleted", extra={"workspace_id": str(workspace.id), "deleted": deleted})


def get_active_provider(workspace: Workspace) -> BaseLLMProvider:
    """Phase 5's single entry point for resolving the active LLM provider."""
    return get_llm_provider_for_workspace(workspace)


def test_provider(workspace: Workspace) -> ProviderTestResult:
    """Run test_connection against the workspace's provider; persist result to DB."""
    provider = get_active_provider(workspace)
    result = provider.test_connection()

    ProviderConfig.objects.filter(workspace=workspace).update(
        last_tested_at=timezone.now(),
        last_test_status=ProviderConfig.TestStatus.OK if result.success else ProviderConfig.TestStatus.FAILED,
        last_test_error="" if result.success else (result.error or ""),
    )
    logger.info(
        "Provider test complete",
        extra={
            "workspace_id": str(workspace.id),
            "success": result.success,
            "latency_ms": result.latency_ms,
        },
    )
    return result
```

- [ ] **Step 4: Run — must pass**

```bash
docker compose exec web pytest tests/test_provider_services.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add apps/providers/services.py tests/test_provider_services.py
git commit -m "feat(providers): services layer (get_or_replace_config / delete_config / test_provider / get_active_provider)"
```

---

### Task 15: Serializers

**Files:**
- Create: `apps/providers/serializers.py`

No dedicated serializer unit tests — serializer behaviour is covered by endpoint tests in Task 17.

- [ ] **Step 1: Create apps/providers/serializers.py**

```python
from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.providers.llm.registry import SUPPORTED_PROVIDERS
from apps.providers.models import ProviderConfig

_PROVIDERS_REQUIRING_KEY = {"openai", "anthropic", "gemini", "azure", "mistral", "groq"}
_PROVIDERS_REQUIRING_BASE_URL = {"azure", "ollama"}
_PROVIDERS_REQUIRING_REGION = {"azure"}


class ProviderConfigSerializer(serializers.ModelSerializer[ProviderConfig]):
    api_key_masked = serializers.SerializerMethodField()
    is_default = serializers.SerializerMethodField()

    class Meta:
        model = ProviderConfig
        fields = [
            "id",
            "provider_name",
            "api_key_masked",
            "api_key_last_4",
            "base_url",
            "azure_region",
            "model_name",
            "temperature",
            "max_tokens",
            "last_tested_at",
            "last_test_status",
            "last_test_error",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_api_key_masked(self, obj: ProviderConfig) -> str | None:
        if not obj.api_key_last_4:
            return None
        return f"••••••••{obj.api_key_last_4}"

    def get_is_default(self, obj: ProviderConfig) -> bool:
        return False


class ProviderDefaultResponseSerializer(serializers.Serializer[Any]):
    """Returned by GET when the workspace has no ProviderConfig (falls back to platform default)."""
    is_default = serializers.BooleanField(default=True)
    provider_name = serializers.CharField(default="gemini")
    model_name = serializers.CharField(default="gemini-1.5-flash")
    description = serializers.CharField(
        default="This workspace uses the AskDocs platform-default Gemini model. "
                "Configure a custom provider in Settings to use your own API key."
    )


class ProviderConfigWriteSerializer(serializers.Serializer[ProviderConfig]):
    provider_name = serializers.ChoiceField(choices=ProviderConfig.Provider.choices)
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    base_url = serializers.URLField(required=False, allow_null=True, default=None)
    azure_region = serializers.CharField(required=False, allow_blank=True, default="")
    model_name = serializers.CharField(max_length=255)
    temperature = serializers.FloatField(default=0.7)
    max_tokens = serializers.IntegerField(default=2048, min_value=1)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        provider = data["provider_name"]

        if provider in _PROVIDERS_REQUIRING_KEY and not data.get("api_key"):
            raise serializers.ValidationError(
                {"api_key": f"api_key is required for {provider}."}
            )
        if provider in _PROVIDERS_REQUIRING_BASE_URL and not data.get("base_url"):
            raise serializers.ValidationError(
                {"base_url": f"base_url is required for {provider}."}
            )
        if provider in _PROVIDERS_REQUIRING_REGION and not data.get("azure_region"):
            raise serializers.ValidationError(
                {"azure_region": "azure_region is required for Azure."}
            )
        temp = data.get("temperature", 0.7)
        if not (0.0 <= temp <= 1.0):
            raise serializers.ValidationError(
                {"temperature": "temperature must be between 0.0 and 1.0."}
            )
        return data


class ProviderTestResponseSerializer(serializers.Serializer[Any]):
    success = serializers.BooleanField()
    latency_ms = serializers.IntegerField()
    model_echo = serializers.CharField(allow_blank=True)
    error = serializers.CharField(allow_null=True)
```

- [ ] **Step 2: Verify import**

```bash
docker compose exec web python -c \
  "from apps.providers.serializers import ProviderConfigWriteSerializer; print('OK')"
```

Expected: `OK`

---

### Task 16: Test Fixtures — conftest.py Updates

**Files:**
- Modify: `tests/conftest.py`

These fixtures are needed by the endpoint tests in Task 17.

- [ ] **Step 1: Append to tests/conftest.py**

```python
@pytest.fixture(autouse=True)
def clear_cache() -> Any:
    """Clear Django cache before and after every test.
    Required for deterministic rate-limit tests with LocMemCache.
    """
    from django.core.cache import cache
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def member_auth_client(db: Any, workspace: Any, other_user: Any) -> APIClient:
    """Authenticated client whose user is a MEMBER of `workspace`."""
    from apps.workspaces.models import Membership
    Membership.objects.create(
        workspace=workspace, user=other_user, role=Membership.Role.MEMBER
    )
    client = APIClient()
    refresh = RefreshToken.for_user(other_user)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client


@pytest.fixture
def viewer_auth_client(db: Any, workspace: Any) -> APIClient:
    """Authenticated client whose user is a VIEWER of `workspace`."""
    from apps.accounts.models import User
    from apps.workspaces.models import Membership

    viewer = User.objects.create_user(email="viewer@example.com", first_name="Viewer")
    Membership.objects.create(
        workspace=workspace, user=viewer, role=Membership.Role.VIEWER
    )
    client = APIClient()
    refresh = RefreshToken.for_user(viewer)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {str(refresh.access_token)}")
    return client
```

- [ ] **Step 2: Verify conftest parses cleanly**

```bash
docker compose exec web pytest tests/ --collect-only -q 2>&1 | head -20
```

Expected: no import errors, test count shown.

---

### Task 17: Views, URL Routing, and Endpoint Tests (TDD)

**Files:**
- Create: `tests/test_provider_config_endpoints.py`
- Create: `tests/test_provider_test_endpoint.py`
- Create: `tests/test_provider_supported_endpoint.py`
- Create: `apps/providers/views.py`
- Modify: `config/api_v1_urls.py`

- [ ] **Step 1: Write tests/test_provider_config_endpoints.py**

```python
import pytest
from rest_framework.test import APIClient

from apps.providers.crypto import encrypt_api_key


def _url(workspace_id: object) -> str:
    return f"/api/v1/workspaces/{workspace_id}/provider/"


@pytest.mark.django_db
def test_get_returns_default_response_when_no_config(auth_client, workspace):
    response = auth_client.get(_url(workspace.id))
    assert response.status_code == 200
    data = response.json()
    assert data["is_default"] is True
    assert data["provider_name"] == "gemini"


@pytest.mark.django_db
def test_put_creates_config_and_returns_masked_key(auth_client, workspace):
    payload = {
        "provider_name": "openai",
        "api_key": "sk-abcdefgh1234",
        "model_name": "gpt-4o",
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    response = auth_client.put(_url(workspace.id), payload, format="json")
    assert response.status_code == 200
    data = response.json()
    assert data["provider_name"] == "openai"
    assert data["api_key_masked"] == "••••••••1234"
    assert "api_key" not in data
    assert "encrypted_api_key" not in data


@pytest.mark.django_db
def test_put_replaces_existing_config(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-first", "model_name": "gpt-4o"},
        format="json",
    )
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "gemini", "api_key": "AIza-second", "model_name": "gemini-1.5-pro"},
        format="json",
    )
    response = auth_client.get(_url(workspace.id))
    assert response.json()["provider_name"] == "gemini"
    assert response.json()["is_default"] is False


@pytest.mark.django_db
def test_get_after_put_shows_masked_key_not_plaintext(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-supersecret9999", "model_name": "gpt-4o"},
        format="json",
    )
    response = auth_client.get(_url(workspace.id))
    data = response.json()
    assert "supersecret" not in str(data)
    assert data["api_key_masked"] == "••••••••9999"


@pytest.mark.django_db
def test_delete_removes_config(auth_client, workspace):
    auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        format="json",
    )
    response = auth_client.delete(_url(workspace.id))
    assert response.status_code == 204

    get_response = auth_client.get(_url(workspace.id))
    assert get_response.json()["is_default"] is True


@pytest.mark.django_db
def test_member_cannot_put(member_auth_client, workspace):
    response = member_auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_member_cannot_get(member_auth_client, workspace):
    response = member_auth_client.get(_url(workspace.id))
    assert response.status_code == 403


@pytest.mark.django_db
def test_viewer_cannot_put(viewer_auth_client, workspace):
    response = viewer_auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 403


@pytest.mark.django_db
def test_azure_put_without_base_url_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "azure", "api_key": "key", "model_name": "my-deployment"},
        format="json",
    )
    assert response.status_code == 400
    assert "base_url" in str(response.json())


@pytest.mark.django_db
def test_azure_put_without_region_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {
            "provider_name": "azure",
            "api_key": "key",
            "model_name": "my-deployment",
            "base_url": "https://my.openai.azure.com",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "azure_region" in str(response.json())


@pytest.mark.django_db
def test_openai_put_without_api_key_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "model_name": "gpt-4o"},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_put_invalid_temperature_returns_400(auth_client, workspace):
    response = auth_client.put(
        _url(workspace.id),
        {"provider_name": "openai", "api_key": "sk-x", "model_name": "gpt-4o", "temperature": 1.5},
        format="json",
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_cross_workspace_admin_cannot_access_other_workspace(auth_client, workspace, other_user):
    from apps.workspaces.services import create_workspace

    other_workspace = create_workspace(name="Other WS", user=other_user)
    response = auth_client.get(_url(other_workspace.id))
    assert response.status_code == 403


@pytest.mark.django_db
def test_unauthenticated_cannot_get(api_client, workspace):
    response = api_client.get(_url(workspace.id))
    assert response.status_code == 401
```

- [ ] **Step 2: Write tests/test_provider_test_endpoint.py**

```python
from unittest.mock import MagicMock, patch

import pytest

from apps.providers.llm.base import ProviderTestResult


def _test_url(workspace_id: object) -> str:
    return f"/api/v1/workspaces/{workspace_id}/provider/test/"


def _create_config(workspace, user):
    from apps.providers.services import get_or_replace_config
    return get_or_replace_config(
        workspace,
        {"provider_name": "openai", "api_key": "sk-test", "model_name": "gpt-4o"},
        created_by=user,
    )


@pytest.mark.django_db
def test_test_endpoint_returns_success_on_mocked_ok(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(success=True, latency_ms=123, model_echo="ok")
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        response = auth_client.post(_test_url(workspace.id))

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["latency_ms"] == 123
    assert data["model_echo"] == "ok"
    assert data["error"] is None


@pytest.mark.django_db
def test_test_endpoint_returns_failure_on_mocked_error(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(success=False, latency_ms=50, model_echo="", error="invalid api key")
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        response = auth_client.post(_test_url(workspace.id))

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["error"] == "invalid api key"


@pytest.mark.django_db
def test_test_endpoint_rate_limited_after_10_calls(auth_client, workspace, user):
    _create_config(workspace, user)

    mock_result = ProviderTestResult(success=True, latency_ms=10, model_echo="ok")
    with patch("apps.providers.views.test_provider", return_value=mock_result):
        for _ in range(10):
            resp = auth_client.post(_test_url(workspace.id))
            assert resp.status_code == 200

        # 11th call must be rate-limited
        resp = auth_client.post(_test_url(workspace.id))
    assert resp.status_code == 429


@pytest.mark.django_db
def test_test_endpoint_requires_admin(member_auth_client, workspace):
    response = member_auth_client.post(_test_url(workspace.id))
    assert response.status_code == 403
```

- [ ] **Step 3: Write tests/test_provider_supported_endpoint.py**

```python
import pytest


@pytest.mark.django_db
def test_supported_providers_no_auth_required(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    assert response.status_code == 200


def test_supported_providers_returns_all_seven(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    data = response.json()
    assert len(data) == 7
    names = {p["name"] for p in data}
    assert names == {"openai", "anthropic", "gemini", "azure", "mistral", "groq", "ollama"}


def test_supported_providers_have_correct_flags(api_client):
    response = api_client.get("/api/v1/providers/supported/")
    by_name = {p["name"]: p for p in response.json()}

    assert by_name["ollama"]["requires_api_key"] is False
    assert by_name["ollama"]["requires_base_url"] is True
    assert by_name["azure"]["requires_api_key"] is True
    assert by_name["azure"]["requires_base_url"] is True
    assert by_name["azure"]["requires_region"] is True
    assert by_name["openai"]["requires_base_url"] is False
    assert by_name["openai"]["requires_region"] is False
```

- [ ] **Step 4: Run all endpoint tests — must fail (views don't exist)**

```bash
docker compose exec web pytest tests/test_provider_config_endpoints.py \
  tests/test_provider_test_endpoint.py tests/test_provider_supported_endpoint.py -v 2>&1 | head -30
```

Expected: `ImportError` or URL 404s.

- [ ] **Step 5: Implement apps/providers/views.py**

```python
from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import RateLimitExceeded
from apps.core.permissions import IsWorkspaceAdmin
from apps.providers.llm.registry import SUPPORTED_PROVIDERS
from apps.providers.models import ProviderConfig
from apps.providers.rate_limit import check_test_rate_limit
from apps.providers.serializers import (
    ProviderConfigSerializer,
    ProviderConfigWriteSerializer,
    ProviderDefaultResponseSerializer,
    ProviderTestResponseSerializer,
)
from apps.providers.services import delete_config, get_or_replace_config, test_provider
from apps.workspaces.models import Workspace


def _get_workspace_or_403(workspace_id: str, user: Any) -> Workspace:
    from apps.workspaces.models import Membership
    from apps.core.exceptions import WorkspaceAccessDenied

    try:
        workspace = Workspace.objects.get(id=workspace_id)
    except Workspace.DoesNotExist:
        from apps.core.exceptions import NotFound
        raise NotFound("Workspace not found.")
    if not Membership.objects.filter(
        workspace=workspace, user=user, role=Membership.Role.ADMIN
    ).exists():
        raise WorkspaceAccessDenied()
    return workspace


class ProviderConfigView(APIView):
    permission_classes = [IsWorkspaceAdmin]

    def get(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_workspace_or_403(workspace_id, request.user)
        try:
            config = ProviderConfig.objects.get(workspace=workspace)
            return Response(ProviderConfigSerializer(config).data)
        except ProviderConfig.DoesNotExist:
            return Response(ProviderDefaultResponseSerializer({}).data)

    def put(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_workspace_or_403(workspace_id, request.user)
        serializer = ProviderConfigWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = get_or_replace_config(
            workspace, serializer.validated_data, created_by=request.user
        )
        return Response(ProviderConfigSerializer(config).data)

    def delete(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_workspace_or_403(workspace_id, request.user)
        delete_config(workspace)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProviderTestView(APIView):
    permission_classes = [IsWorkspaceAdmin]

    def post(self, request: Request, workspace_id: str) -> Response:
        workspace = _get_workspace_or_403(workspace_id, request.user)
        check_test_rate_limit(str(workspace.id))
        result = test_provider(workspace)
        return Response(
            ProviderTestResponseSerializer({
                "success": result.success,
                "latency_ms": result.latency_ms,
                "model_echo": result.model_echo,
                "error": result.error,
            }).data
        )


class SupportedProvidersView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request: Request) -> Response:
        return Response(SUPPORTED_PROVIDERS)
```

- [ ] **Step 6: Add URL patterns to config/api_v1_urls.py**

Add these imports at the top:
```python
from apps.providers.views import ProviderConfigView, ProviderTestView, SupportedProvidersView
```

Add these paths before the closing bracket of `urlpatterns`:
```python
    # Provider config (singleton per workspace — admin only)
    path(
        "workspaces/<uuid:workspace_id>/provider/",
        ProviderConfigView.as_view(),
        name="provider-config",
    ),
    path(
        "workspaces/<uuid:workspace_id>/provider/test/",
        ProviderTestView.as_view(),
        name="provider-test",
    ),
    # Public metadata (no auth required)
    path(
        "providers/supported/",
        SupportedProvidersView.as_view(),
        name="providers-supported",
    ),
```

- [ ] **Step 7: Run all endpoint tests — must pass**

```bash
docker compose exec web pytest \
  tests/test_provider_config_endpoints.py \
  tests/test_provider_test_endpoint.py \
  tests/test_provider_supported_endpoint.py -v
```

Expected: `21 passed`

- [ ] **Step 8: Commit**

```bash
git add apps/providers/views.py apps/providers/serializers.py \
        config/api_v1_urls.py tests/conftest.py \
        tests/test_provider_config_endpoints.py \
        tests/test_provider_test_endpoint.py \
        tests/test_provider_supported_endpoint.py
git commit -m "feat(providers): serializers + views + URL routing + endpoint tests"
```

---

### Task 18: Full Suite, Linting, and Final Commit

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

```bash
docker compose exec web pytest -v
```

Expected: all tests pass (`test_provider_crypto`, `test_providers_llm`, `test_provider_factory`, `test_provider_rate_limit`, `test_provider_services`, `test_provider_config_endpoints`, `test_provider_test_endpoint`, `test_provider_supported_endpoint`, plus all Phase 1–2 tests). If any fail, fix before proceeding.

- [ ] **Step 2: Run ruff**

```bash
docker compose exec web ruff check .
```

Expected: no output (clean). Common fixes:
- `F401` unused import — remove it
- `E501` line too long — wrap the line
- `N818` exception not ending in Error — rename or add `# noqa: N818`

- [ ] **Step 3: Verify Swagger shows new endpoints**

```bash
curl -s http://localhost:8000/api/docs/ | grep -c "provider" || true
```

Open http://localhost:8000/api/docs/ in a browser and confirm:
- `GET /api/v1/workspaces/{workspace_id}/provider/`
- `PUT /api/v1/workspaces/{workspace_id}/provider/`
- `DELETE /api/v1/workspaces/{workspace_id}/provider/`
- `POST /api/v1/workspaces/{workspace_id}/provider/test/`
- `GET /api/v1/providers/supported/`

- [ ] **Step 4: Verify Celery worker still registers correctly**

```bash
docker compose logs worker | grep "\[tasks\]" -A 5
```

Expected: the existing task list unchanged (Phase 4 adds no Celery tasks).

- [ ] **Step 5: Manual smoke test with real OpenAI key**

```bash
# 1. Get a JWT for a test user
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/google/ ... | jq -r .access)

# 2. Get your workspace ID
WS_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/workspaces/ | jq -r '.results[0].id')

# 3. Configure OpenAI provider with your real key
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider_name":"openai","api_key":"sk-...","model_name":"gpt-4o"}' \
  "http://localhost:8000/api/v1/workspaces/$WS_ID/provider/" | jq

# 4. Test the connection
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/workspaces/$WS_ID/provider/test/" | jq

# Expected: {"success": true, "latency_ms": <N>, "model_echo": "ok", "error": null}

# 5. GET and verify the key is masked
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/workspaces/$WS_ID/provider/" | jq '.api_key_masked'
# Expected: "••••••••<last4chars>"
```

Repeat Step 5 with a real Gemini key via the platform-default path (no ProviderConfig needed — just call `/test/` on a fresh workspace).

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(backend): phase 4 - BYOK LLM provider system

- ProviderConfig model (OneToOne per workspace) with Fernet-encrypted API keys
- 7 provider implementations: Gemini, OpenAI, Anthropic, Azure, Mistral, Groq, Ollama
- PlatformDefaultProvider fallback using shared Gemini Flash key
- get_active_provider() service for Phase 5 Chat to consume
- Redis-backed rate limiting on /test/ endpoint (10 req/hr/workspace)
- ~30 tests covering crypto, providers, factory, services, and endpoints
- GET /providers/supported/ public metadata endpoint

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push to origin**

```bash
git push origin main
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ ProviderConfig model (OneToOneField, all fields including binary encrypted key) — Task 2
- ✅ Fernet encryption utilities — Task 3
- ✅ BaseLLMProvider ABC + dataclasses — Task 4
- ✅ All 7 providers (gemini, openai, anthropic, azure, mistral, groq, ollama) — Tasks 5–11
- ✅ PlatformDefaultProvider (wraps Gemini with platform key) — Task 12
- ✅ Factory resolves provider for workspace — Task 12
- ✅ Registry with SUPPORTED_PROVIDERS metadata — Task 12
- ✅ 7 exception classes — Task 4
- ✅ Rate limiting (10/hr, Redis/LocMemCache) — Task 13
- ✅ Services (get_or_replace_config, delete_config, test_provider, get_active_provider) — Task 14
- ✅ Read/Write/TestResponse serializers with key masking + validation — Task 15
- ✅ GET/PUT/DELETE /provider/ (admin only) — Task 17
- ✅ POST /provider/test/ with rate limiting (admin only) — Task 17
- ✅ GET /providers/supported/ (public, no auth) — Task 17
- ✅ Settings (PROVIDER_ENCRYPTION_KEY required, 3 optional vars, CACHES) — Task 1
- ✅ ImproperlyConfigured if PROVIDER_ENCRYPTION_KEY missing — Task 3 (crypto.py)
- ✅ .env.example updated — Task 1
- ✅ Generated key added to backend/.env — Task 1
- ✅ ~30 tests (4 crypto + 9 provider + 6 factory/registry + 3 rate_limit + 5 services + 14 config + 4 test endpoint + 3 supported) — Tasks 3, 5–12, 13, 14, 16, 17
- ✅ No real API calls in tests (all mocked) — per-task mock patterns shown
- ✅ Spec note: OpenAI/Gemini implementations are production-ready; user verifies manually with real keys

**Type consistency check:**
- `ProviderTestResult` defined in `base.py` and used consistently in all providers, services, views, and serializers ✅
- `get_or_replace_config` signature in services matches test fixture calls ✅
- `_get_workspace_or_403` raises `WorkspaceAccessDenied` which the existing exception handler covers ✅
- `check_test_rate_limit` raises `RateLimitExceeded` from `apps.core.exceptions` ✅
