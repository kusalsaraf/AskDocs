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

    Used when a workspace has no BYOK ProviderConfig configured.
    """

    provider_name = "gemini"
    supports_streaming = True

    def __init__(self, config: None = None) -> None:
        super().__init__(config=None)

    def _get_gemini(self) -> BaseLLMProvider:
        from apps.providers.llm.gemini import GeminiProvider
        return GeminiProvider(config=None)

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
