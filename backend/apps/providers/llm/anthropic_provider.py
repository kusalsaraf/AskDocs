from __future__ import annotations

import time
from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

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
            extra={
                "provider": "anthropic",
                "workspace_id": str(self.config.workspace_id),
                "model": self._model_name,
            },
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
            return ProviderTestResult(
                success=False, latency_ms=latency_ms, model_echo="", error=str(exc)
            )

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        max_tokens = kwargs.get("max_tokens", self.config.max_tokens if self.config else 2048)
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
