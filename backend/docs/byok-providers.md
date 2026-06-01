# BYOK Providers

BYOK (Bring Your Own Key) lets each workspace connect its own LLM provider API key. The workspace owner pays their own AI usage directly, bypasses the platform rate limits, and can choose any of the seven supported providers.

## Why BYOK Matters

**For the portfolio:** BYOK is a real enterprise requirement. Companies won't send their documents through a platform that routes queries through someone else's API key. Enterprise SaaS almost always requires BYOK or private deployment. Having a working BYOK implementation signals that the project is architected for real-world use cases, not just demos.

**For cost:** Platform default providers charge the SaaS operator (you) for every query. BYOK shifts that cost to the workspace owner — they pay their own OpenAI/Anthropic/Gemini bill directly.

**For flexibility:** Workspaces with Ollama config can run entirely locally with no external API calls. This is important for regulated industries or air-gapped environments.

## Supported Providers

| Provider | `provider_name` | API Key | Base URL | Region | Suggested Models |
|---|---|:---:|:---:|:---:|---|
| OpenAI | `openai` | ✅ | — | — | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `o1-preview` |
| Anthropic | `anthropic` | ✅ | — | — | `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229` |
| Google Gemini | `gemini` | ✅ | — | — | `gemini-1.5-pro`, `gemini-1.5-flash` |
| Azure OpenAI | `azure` | ✅ | ✅ | ✅ | *(deployment-specific)* |
| Mistral | `mistral` | ✅ | — | — | `mistral-large-latest`, `mistral-small-latest` |
| Groq | `groq` | ✅ | — | — | `llama-3.1-70b-versatile`, `mixtral-8x7b-32768` |
| Ollama | `ollama` | — | ✅ | — | `llama3`, `phi3`, `mistral` |

`Base URL` is required for Azure (your deployment endpoint) and Ollama (your local or hosted instance URL). `Region` is required for Azure.

## The Encryption Pipeline

API keys are sensitive credentials. AskDocs never stores them in plaintext.

**At write time** (`PUT /api/v1/workspaces/{id}/provider/`):
1. The API receives the plaintext API key in the request body.
2. `encrypt_api_key(key)` in `apps/providers/crypto.py` calls `Fernet.encrypt(key.encode())`.
3. The ciphertext (bytes) is stored in `ProviderConfig.encrypted_api_key`.
4. The last 4 characters of the plaintext key are stored in `ProviderConfig.api_key_last_4` for display only.
5. The plaintext key is never logged, never stored, and never returned by the API.

**At read time** (when the provider is instantiated):
1. `decrypt_api_key(config.encrypted_api_key)` calls `Fernet.decrypt(ciphertext).decode()`.
2. The decrypted key is passed directly to the provider SDK client.
3. The key exists in memory only for the duration of the HTTP request or task.

**The Fernet key** lives in `PROVIDER_ENCRYPTION_KEY` environment variable:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# → mP8dQ7X2k9bN...  (a base64-encoded 32-byte key)
```

If `PROVIDER_ENCRYPTION_KEY` is not set, the application raises `ImproperlyConfigured` at startup — there is no fallback that would silently store keys in plaintext.

## Provider Abstraction Architecture

All providers implement `BaseLLMProvider`:

```python
# apps/providers/llm/base.py
class BaseLLMProvider(ABC):
    provider_name: str
    supports_streaming: bool = False

    @abstractmethod
    def test_connection(self) -> ProviderTestResult: ...

    @abstractmethod
    def complete(self, messages: list[Message], **kwargs) -> CompletionResult: ...

    @abstractmethod
    def stream(self, messages: list[Message], **kwargs) -> Iterator[StreamChunk]: ...
```

Key data types:
```python
@dataclass
class Message:
    role: str          # "system" | "user" | "assistant"
    content: str

@dataclass
class StreamChunk:
    delta: str
    finish_reason: str | None = None

@dataclass
class CompletionResult:
    content: str
    prompt_tokens: int | None
    completion_tokens: int | None

@dataclass
class ProviderTestResult:
    success: bool
    latency_ms: int
    model_echo: str
    error: str | None = None
```

Provider implementations live in `apps/providers/llm/`:
- `openai_provider.py` → `OpenAIProvider`
- `anthropic_provider.py` → `AnthropicProvider`
- `gemini.py` → `GeminiProvider`
- `azure.py` → `AzureProvider`
- `mistral.py` → `MistralProvider`
- `groq_provider.py` → `GroqProvider`
- `ollama.py` → `OllamaProvider`
- `default.py` → `PlatformDefaultProvider` (wraps GeminiProvider with platform key)

The `PROVIDER_REGISTRY` dict maps provider name strings to classes:

```python
PROVIDER_REGISTRY = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "azure": AzureProvider,
    "mistral": MistralProvider,
    "groq": GroqProvider,
    "ollama": OllamaProvider,
}
```

`get_llm_provider_for_workspace(workspace)` in `apps/providers/llm/factory.py` looks up the workspace's `ProviderConfig`, finds the class in the registry, and returns an instance initialized with the config.

## Test Connection Endpoint

`POST /api/v1/workspaces/{workspace_id}/provider/test/` sends a minimal 5-token ping to verify the API key works.

Each provider's `test_connection()` method sends the smallest possible completion request (`max_tokens=5`) and measures the round-trip latency. The result is stored in `ProviderConfig.last_test_status` (`ok` or `failed`) and `last_tested_at`.

This endpoint is **rate-limited to 10 tests per hour per workspace** (configurable via `PROVIDER_TEST_RATE_LIMIT_PER_HOUR`) to prevent key-enumeration attacks.

## The Platform Default Fallback

When a workspace has no `ProviderConfig`, `PlatformDefaultProvider` is used:

```python
class PlatformDefaultProvider(BaseLLMProvider):
    provider_name = "gemini"
    supports_streaming = True

    def _get_gemini(self) -> BaseLLMProvider:
        return GeminiProvider(config=None)

    def complete(self, messages, **kwargs):
        return self._get_gemini().complete(messages, **kwargs)

    def stream(self, messages, **kwargs):
        return self._get_gemini().stream(messages, **kwargs)
```

The platform default uses `DEFAULT_PLATFORM_GEMINI_API_KEY` from the environment. To switch the platform default to OpenAI, set `DEFAULT_PLATFORM_PROVIDER=openai` and provide `DEFAULT_PLATFORM_OPENAI_API_KEY`.

Platform default users are subject to:
- Per-user daily message limit (`USER_DAILY_MESSAGE_LIMIT`)
- Global daily platform budget (`GLOBAL_DAILY_PLATFORM_LLM_BUDGET`)

BYOK workspaces bypass both limits.

## How to Add a New Provider

1. **Create the provider class** in `apps/providers/llm/{provider_name}.py`:

```python
from apps.providers.llm.base import BaseLLMProvider, CompletionResult, Message, ProviderTestResult, StreamChunk

class MyProvider(BaseLLMProvider):
    provider_name = "myprovider"
    supports_streaming = True

    def __init__(self, config):
        super().__init__(config)
        from mylib import Client
        from apps.providers.crypto import decrypt_api_key
        api_key = decrypt_api_key(config.encrypted_api_key)
        self._client = Client(api_key=api_key)
        self._model_name = config.model_name or "my-default-model"

    def test_connection(self) -> ProviderTestResult:
        import time
        start = time.monotonic()
        try:
            resp = self._client.complete(model=self._model_name, messages=[...], max_tokens=5)
            return ProviderTestResult(success=True, latency_ms=int((time.monotonic()-start)*1000), model_echo=resp.text)
        except Exception as exc:
            return ProviderTestResult(success=False, latency_ms=0, model_echo="", error=str(exc))

    def complete(self, messages, **kwargs) -> CompletionResult:
        ...

    def stream(self, messages, **kwargs):
        for chunk in self._client.stream(...):
            yield StreamChunk(delta=chunk.text)
```

2. **Register in `PROVIDER_REGISTRY`** (`apps/providers/llm/registry.py`):

```python
from apps.providers.llm.myprovider import MyProvider

PROVIDER_REGISTRY = {
    ...,
    "myprovider": MyProvider,
}
```

3. **Add to `SUPPORTED_PROVIDERS`** (`apps/providers/llm/registry.py`):

```python
SUPPORTED_PROVIDERS.append({
    "name": "myprovider",
    "display_name": "My Provider",
    "requires_api_key": True,
    "requires_base_url": False,
    "requires_region": False,
    "suggested_models": ["my-model-v1"],
    "description": "My Provider — description for the UI.",
})
```

4. **Add to `ProviderConfig.Provider` choices** (`apps/providers/models.py`):

```python
class Provider(models.TextChoices):
    ...,
    MYPROVIDER = "myprovider", "My Provider"
```

5. **Create and run a migration:**

```bash
docker compose exec web python manage.py makemigrations providers
docker compose exec web python manage.py migrate
```

6. **Write tests** in `tests/test_provider_factory.py`:
   - Test that the factory returns the right class for the new provider name
   - Test `test_connection()` with a mock client (success and auth error cases)
   - Test `stream()` yields the expected `StreamChunk` objects

---

**What's next:** [setup.md](setup.md) — get the project running locally.
