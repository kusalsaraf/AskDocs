from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Iterator

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
    provider_name: str
    supports_streaming: bool = False

    def __init__(self, config: ProviderConfig | None) -> None:
        self.config = config

    @abstractmethod
    def test_connection(self) -> ProviderTestResult: ...

    @abstractmethod
    def complete(self, messages: list[Message], **kwargs: Any) -> CompletionResult: ...

    @abstractmethod
    def stream(self, messages: list[Message], **kwargs: Any) -> Iterator[StreamChunk]: ...
