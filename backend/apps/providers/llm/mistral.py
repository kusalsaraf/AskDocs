from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any, Iterator

from mistralai.client import MistralClient
from mistralai.models.chat_completion import ChatMessage

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
