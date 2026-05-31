from __future__ import annotations

import time
from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

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
            extra={
                "provider": "azure",
                "workspace_id": str(self.config.workspace_id),
                "model": self._model_name,
            },
        )
        try:
            resp = self._client.chat.completions.create(
                model=self._model_name,
                messages=_TEST_MESSAGES,
                max_tokens=5,
            )
            latency_ms = int((time.monotonic() - start) * 1000)
            text = resp.choices[0].message.content or ""
            logger.info("Azure test_connection ok", extra={"latency_ms": latency_ms})
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
            return ProviderTestResult(
                success=False, latency_ms=latency_ms, model_echo="", error=str(exc)
            )

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
