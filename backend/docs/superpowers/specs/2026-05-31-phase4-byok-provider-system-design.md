# Phase 4 Design — BYOK LLM Provider System

**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** `backend/` only

---

## 1. Context

Phase 3 built the document ingestion pipeline with a pluggable `EmbeddingProvider` abstraction (Gemini Embeddings only). Phase 4 builds the complementary LLM provider system: each workspace can configure its own LLM (BYOK), with encrypted key storage and a unified `BaseLLMProvider` interface that Phase 5 Chat + RAG will consume.

The two provider systems are independent. Phase 4 does not modify any Phase 3 embedding code.

---

## 2. Locked Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config cardinality | One ProviderConfig per workspace (OneToOneField) | YAGNI; add multi-config later if needed |
| Encryption | Fernet symmetric, key from env | Industry standard; frontend never sees plaintext after save |
| Validation | On-demand only (POST /test/) | No background jobs; avoids rate-limit headaches |
| Default fallback | Platform-key Gemini Flash when no config | Enables zero-setup trial experience |
| Embedding isolation | Phase 3 embedding code untouched | Different concern, different abstraction |
| Workspace isolation | IsWorkspaceAdmin permission + direct service lookup | Singleton resource; WorkspaceScopedQuerysetMixin not applicable |

---

## 3. Data Model

### `ProviderConfig` (`apps/providers/models.py`)

Inherits `BaseModel` (UUID pk, `created_at`, `updated_at`).

| Field | Type | Notes |
|-------|------|-------|
| workspace | OneToOneField(Workspace, CASCADE, related_name='provider_config') | One config per workspace |
| provider_name | CharField choices(openai, anthropic, gemini, azure, mistral, groq, ollama) | |
| encrypted_api_key | BinaryField, nullable | Fernet-encrypted; null for Ollama |
| api_key_last_4 | CharField(4), blank | UI display only; set on write |
| base_url | URLField, nullable | Required for Azure and Ollama |
| azure_region | CharField, nullable | Azure only |
| model_name | CharField | Freeform; deployment name for Azure |
| temperature | FloatField(default=0.7) | Validated 0.0–1.0 |
| max_tokens | PositiveIntegerField(default=2048) | |
| last_tested_at | DateTimeField, nullable | Set by test endpoint |
| last_test_status | CharField choices(untested, ok, failed), default=untested | |
| last_test_error | TextField, blank | Last error message from test |
| created_by | FK(User, SET_NULL, null) | |

**Admin:** Show all fields except `encrypted_api_key`; `api_key_last_4` read-only.

No extra DB indexes needed beyond the auto index on the OneToOne FK.

---

## 4. Crypto (`apps/providers/crypto.py`)

```python
def encrypt_api_key(plaintext: str) -> bytes: ...
def decrypt_api_key(ciphertext: bytes) -> str: ...
def get_last_4(plaintext: str) -> str: ...
```

- Uses `cryptography.fernet.Fernet` with key from `settings.PROVIDER_ENCRYPTION_KEY`
- **Module-level validation:** if `PROVIDER_ENCRYPTION_KEY` is missing or malformed, raises `django.core.exceptions.ImproperlyConfigured` with message:
  > "PROVIDER_ENCRYPTION_KEY is not set. Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
- `get_last_4(plaintext)` returns `plaintext[-4:]` or `""` if key is shorter than 4 chars
- `decrypt_api_key` is only called inside provider client instantiation — never in serializers or views

---

## 5. LLM Provider Abstraction (`apps/providers/llm/`)

### File structure

```
apps/providers/llm/
  __init__.py
  base.py           # BaseLLMProvider + Message, CompletionResult, StreamChunk, ProviderTestResult
  gemini.py         # google-generativeai
  openai.py         # openai SDK
  anthropic.py      # anthropic SDK
  azure.py          # openai SDK with custom base_url + api_version
  mistral.py        # mistralai SDK
  groq.py           # groq SDK
  ollama.py         # raw httpx against {base_url}/api/chat
  default.py        # PlatformDefaultProvider — wraps GeminiProvider with platform key
  factory.py        # get_llm_provider_for_workspace()
  registry.py       # PROVIDER_REGISTRY + SUPPORTED_PROVIDERS metadata
  exceptions.py     # 7 domain exception classes
```

### `BaseLLMProvider` (abstract)

```python
@dataclass
class Message:
    role: str   # "system" | "user" | "assistant"
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
    finish_reason: str | None

@dataclass
class ProviderTestResult:
    success: bool
    latency_ms: int
    model_echo: str
    error: str | None

class BaseLLMProvider(ABC):
    provider_name: str
    supports_streaming: bool

    def __init__(self, config: ProviderConfig | None) -> None: ...

    @abstractmethod
    def test_connection(self) -> ProviderTestResult: ...

    @abstractmethod
    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult: ...

    @abstractmethod
    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]: ...
```

### Per-provider rules

- Catch SDK exceptions → translate to domain exceptions (see §6)
- `test_connection()`: send prompt `"Reply with ok"`, `max_tokens=5`; measure latency; return `ProviderTestResult`
- Log at INFO: start + completion with `provider_name`, `workspace_id`, `model` in `extra={}`. Log at ERROR on failure
- Timeout: `settings.PROVIDER_REQUEST_TIMEOUT_SECONDS`

**Azure specifics:** `openai.AzureOpenAI(api_key=..., azure_endpoint=base_url, api_version="2024-02-01")`. Deployment name = `model_name`.

**Ollama specifics:** `httpx.post(f"{base_url}/api/chat", json={...}, timeout=timeout)`. No SDK.

**`PlatformDefaultProvider`:** Wraps `GeminiProvider` using `settings.DEFAULT_PLATFORM_GEMINI_API_KEY` as a synthetic `ProviderConfig`. If that setting is empty, `test_connection()` returns `ProviderTestResult(success=False, latency_ms=0, model_echo="", error="No platform key configured")`. Used by `get_active_provider()` when a workspace has no config.

### `factory.py`

```python
def get_llm_provider_for_workspace(workspace: Workspace) -> BaseLLMProvider:
    config = ProviderConfig.objects.filter(workspace=workspace).first()
    if config is None:
        return PlatformDefaultProvider()
    return PROVIDER_REGISTRY[config.provider_name](config)
```

### `registry.py`

`PROVIDER_REGISTRY: dict[str, type[BaseLLMProvider]]` — maps provider_name → class.

`SUPPORTED_PROVIDERS: list[dict]` — static metadata consumed by `GET /providers/supported/`:
```python
[
  {
    "name": "openai",
    "display_name": "OpenAI",
    "requires_api_key": True,
    "requires_base_url": False,
    "requires_region": False,
    "suggested_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview"],
    "description": "GPT-4o, GPT-4-turbo, GPT-3.5",
  },
  # ... anthropic, gemini, azure, mistral, groq, ollama
]
```

Ollama entry: `requires_api_key=False`, `requires_base_url=True`.
Azure entry: `requires_api_key=True`, `requires_base_url=True`, `requires_region=True`.

---

## 6. Exceptions (`apps/providers/llm/exceptions.py`)

All subclass `AskDocsError`:

| Class | HTTP | Code |
|-------|------|------|
| `ProviderConfigInvalid` | 400 | `provider_config_invalid` |
| `ProviderConfigMissing` | 404 | `provider_config_missing` |
| `ProviderAuthError` | 401 | `provider_auth_error` |
| `ProviderRateLimitError` | 429 | `provider_rate_limit` |
| `ProviderUnavailableError` | 503 | `provider_unavailable` |
| `ProviderInvalidResponseError` | 502 | `provider_invalid_response` |
| `ProviderTimeoutError` | 504 | `provider_timeout` |

---

## 7. Services (`apps/providers/services.py`)

```python
def get_or_replace_config(
    workspace: Workspace,
    data: dict[str, Any],
    created_by: User,
) -> ProviderConfig:
    # Uses update_or_create(workspace=workspace, ...)
    # Encrypts api_key via encrypt_api_key(), stores api_key_last_4
    # Resets last_test_status="untested", clears last_test_error
    ...

def delete_config(workspace: Workspace) -> None:
    # ProviderConfig.objects.filter(workspace=workspace).delete()
    ...

def test_provider(workspace: Workspace) -> ProviderTestResult:
    # Gets provider via get_active_provider()
    # Calls provider.test_connection()
    # Writes last_tested_at, last_test_status, last_test_error to DB
    # Returns ProviderTestResult
    ...

def get_active_provider(workspace: Workspace) -> BaseLLMProvider:
    # Phase 5's single entry point
    # Delegates to factory.get_llm_provider_for_workspace(workspace)
    ...
```

---

## 8. Serializers (`apps/providers/serializers.py`)

### `ProviderConfigSerializer` (read)

- All fields except `encrypted_api_key`
- Computed `api_key_masked`: `"••••••••" + last_4` if key exists, else `None`
- Computed `is_default`: `True` if config doesn't exist (placeholder response only)

### `ProviderConfigWriteSerializer` (write)

- Accepts: `provider_name`, `api_key` (write-only plaintext), `base_url`, `azure_region`, `model_name`, `temperature`, `max_tokens`
- Validates:
  - `api_key` required for all providers except Ollama
  - `base_url` required for Azure and Ollama
  - `azure_region` required for Azure
  - `temperature` in [0.0, 1.0]
  - `model_name` non-empty

### `ProviderTestResponseSerializer` (read)

- Fields: `success` (bool), `latency_ms` (int), `model_echo` (str), `error` (str or null)

---

## 9. API Endpoints

All workspace-scoped endpoints require authentication + `IsWorkspaceAdmin`. Workspace isolation is enforced by the permission check + direct `workspace_id` lookup in the service.

| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/api/v1/workspaces/{ws_id}/provider/` | Admin | Current config or `{"is_default": true, "provider_name": "gemini", "model_name": "gemini-1.5-flash"}` |
| PUT | `/api/v1/workspaces/{ws_id}/provider/` | Admin | Create or replace config |
| DELETE | `/api/v1/workspaces/{ws_id}/provider/` | Admin | Remove config; 204 No Content |
| POST | `/api/v1/workspaces/{ws_id}/provider/test/` | Admin | Test connection; rate-limited 10/hr/workspace |
| GET | `/api/v1/providers/supported/` | Public | Static provider metadata list |

**Rate limiting implementation (`apps/providers/rate_limit.py`):**
```python
def check_test_rate_limit(workspace_id: str) -> None:
    # Redis key: f"provider_test:{workspace_id}:{current_hour}"
    # INCR; set EXPIRE(3600) on first call
    # If count > settings.PROVIDER_TEST_RATE_LIMIT_PER_HOUR: raise RateLimitExceeded
```

Uses `django.core.cache` (Redis-backed). Raises `RateLimitExceeded` from `apps.core.exceptions`.

---

## 10. Settings Changes

**`config/settings/base.py`** additions:

```python
PROVIDER_ENCRYPTION_KEY = env("PROVIDER_ENCRYPTION_KEY")  # no default — raises at startup
DEFAULT_PLATFORM_GEMINI_API_KEY = env("DEFAULT_PLATFORM_GEMINI_API_KEY", default="")
PROVIDER_TEST_RATE_LIMIT_PER_HOUR = env.int("PROVIDER_TEST_RATE_LIMIT_PER_HOUR", default=10)
PROVIDER_REQUEST_TIMEOUT_SECONDS = env.int("PROVIDER_REQUEST_TIMEOUT_SECONDS", default=30)
```

Add Django cache backend (uses existing Redis):
```python
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}
```

**`config/settings/testing.py`** additions:
```python
# Deterministic Fernet key for tests — DO NOT use in production
# Valid Fernet key: URL-safe base64 of exactly 32 bytes
PROVIDER_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
CACHES = {"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}}
```

(`AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=` is the URL-safe base64 of 32 zero-bytes — a valid Fernet key structure, safe for test isolation.)

---

## 11. New Dependencies

**`requirements.txt`** additions (7 packages):
```
google-generativeai==0.7.0
openai==1.30.5
anthropic==0.30.0
mistralai==0.4.2
groq==0.9.0
httpx==0.27.0
```

`cryptography==42.0.8` already present.

---

## 12. URL Routing

**`config/api_v1_urls.py`** additions:
```python
from apps.providers.views import (
    ProviderConfigView,
    ProviderTestView,
    SupportedProvidersView,
)

# Workspace provider config (singleton)
path("workspaces/<uuid:workspace_id>/provider/", ProviderConfigView.as_view(), name="provider-config"),
path("workspaces/<uuid:workspace_id>/provider/test/", ProviderTestView.as_view(), name="provider-test"),
# Public metadata
path("providers/supported/", SupportedProvidersView.as_view(), name="providers-supported"),
```

---

## 13. Tests (~25-30)

### `tests/test_provider_crypto.py`
1. `encrypt_api_key` + `decrypt_api_key` round-trips to original plaintext
2. Same plaintext produces different ciphertext each call (Fernet is non-deterministic)
3. `get_last_4("sk-...abcd1234")` returns `"1234"`
4. `get_last_4("ab")` returns `"ab"` (short key graceful)

### `tests/test_provider_config_endpoints.py`
5. Admin GET with no config → `is_default: true`, platform default info
6. Admin PUT creates config → 200, `api_key_masked` in response (not plaintext)
7. Admin PUT then GET → key is masked, not reversed
8. Admin PUT replaces existing config (idempotent)
9. Admin DELETE removes config → 204; subsequent GET returns `is_default: true`
10. MEMBER role PUT → 403
11. VIEWER role PUT → 403
12. MEMBER role GET → 403 (only admin sees provider config)
13. Azure PUT without `base_url` → 400 validation error
14. Azure PUT without `azure_region` → 400 validation error
15. Ollama PUT without `base_url` → 400 validation error
16. OpenAI PUT without `api_key` → 400 validation error
17. PUT with `temperature=1.5` → 400 validation error
18. Cross-workspace: Admin of workspace A cannot GET config of workspace B

### `tests/test_provider_test_endpoint.py`
19. Mocked provider success → `{"success": true, "latency_ms": ..., "model_echo": "ok", "error": null}`
20. Mocked provider failure → `{"success": false, "error": "..."}`
21. 10 test calls succeed; 11th returns 429
22. Rate limit resets after hour boundary (mock Redis TTL)

### `tests/test_provider_factory.py`
23. No config → returns `PlatformDefaultProvider` instance
24. `provider_name="openai"` → returns `OpenAIProvider` instance
25. `provider_name="gemini"` → returns `GeminiProvider` instance
26. `provider_name="ollama"` → returns `OllamaProvider` instance
27. Unknown provider_name → raises `ProviderConfigInvalid`

### `tests/test_provider_supported_endpoint.py`
28. GET without auth → 200 (public endpoint)
29. Response contains all 7 providers
30. Each provider entry has correct `requires_api_key`, `requires_base_url`, `requires_region` flags

---

## 14. Scope Exclusions (Phase 4)

- No chat/RAG endpoints (Phase 5)
- No streaming response handling (Phase 5)
- No per-user provider overrides
- No provider failover
- No cost/usage tracking
- No multi-region routing
- No custom prompt templates
- No key rotation automation
- No changes to Phase 3 embedding code
