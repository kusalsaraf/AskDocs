from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.providers.llm.base import (
    BaseLLMProvider,
    CompletionResult,
    Message,
    ProviderTestResult,
    StreamChunk,
)


class PlatformDefaultProvider(BaseLLMProvider):
    """Wraps the configured platform-default LLM provider.

    Reads DEFAULT_PLATFORM_PROVIDER from settings to decide which underlying
    provider to use. Raises ImproperlyConfigured if the required API key is absent.
    """

    supports_streaming = True

    def __init__(self, config: None = None) -> None:
        super().__init__(config=None)
        platform = getattr(settings, "DEFAULT_PLATFORM_PROVIDER", "openai")

        if platform == "openai":
            if not settings.DEFAULT_PLATFORM_OPENAI_API_KEY:
                raise ImproperlyConfigured(
                    "DEFAULT_PLATFORM_PROVIDER is 'openai' but DEFAULT_PLATFORM_OPENAI_API_KEY "
                    "is not set. Add it to your .env file."
                )
            from apps.providers.llm.openai_provider import OpenAIProvider
            self._delegate = OpenAIProvider(config=None)
            self.provider_name = "openai"

        elif platform == "gemini":
            if not settings.DEFAULT_PLATFORM_GEMINI_API_KEY:
                raise ImproperlyConfigured(
                    "DEFAULT_PLATFORM_PROVIDER is 'gemini' but DEFAULT_PLATFORM_GEMINI_API_KEY "
                    "is not set. Add it to your .env file."
                )
            from apps.providers.llm.gemini import GeminiProvider
            self._delegate = GeminiProvider(config=None)
            self.provider_name = "gemini"

        else:
            raise ImproperlyConfigured(
                f"DEFAULT_PLATFORM_PROVIDER is '{platform}'. "
                "Valid values: 'openai', 'gemini'."
            )

    def test_connection(self) -> ProviderTestResult:
        return self._delegate.test_connection()

    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        return self._delegate.complete(messages, **kwargs)

    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        return self._delegate.stream(messages, **kwargs)
