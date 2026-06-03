"""Abstract LLM provider interface and shared request/response types."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

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
    """Provider adapter for non-streaming completion, streaming, and connectivity tests."""

    provider_name: str
    supports_streaming: bool = False

    def __init__(self, config: ProviderConfig | None) -> None:
        self.config = config

    @abstractmethod
    def test_connection(self) -> ProviderTestResult:
        """Verify credentials and model access with a minimal request."""

    @abstractmethod
    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult:
        """Return a single completion for the message list."""

    @abstractmethod
    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]:
        """Yield incremental text deltas for the message list."""
