from __future__ import annotations

import time
from collections.abc import Iterator
from typing import TYPE_CHECKING, Any

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
            request_options={"timeout": settings.PROVIDER_REQUEST_TIMEOUT_SECONDS},
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
