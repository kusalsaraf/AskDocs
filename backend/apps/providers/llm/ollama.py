from __future__ import annotations

import time
from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

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
            extra={
                "provider": "ollama",
                "workspace_id": str(self.config.workspace_id),
                "model": self._model_name,
            },
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
            return ProviderTestResult(
                success=False, latency_ms=latency_ms, model_echo="", error=str(exc)
            )
        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Ollama test_connection failed", extra={"error": str(exc)})
            return ProviderTestResult(
                success=False, latency_ms=latency_ms, model_echo="", error=str(exc)
            )

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
