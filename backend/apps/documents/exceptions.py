from __future__ import annotations


class ParserStrategyUnavailable(Exception):
    """Raised when the requested parsing strategy cannot run in this environment."""

    def __init__(self, strategy: str, message: str | None = None) -> None:
        self.strategy = strategy
        default = (
            f"Strategy '{strategy}' is not available. "
            "For hi_res mode, install unstructured[local-inference] "
            "(adds detectron2 + PyTorch, ~2GB). "
            "Falling back to strategy='fast' is recommended on constrained hardware."
        )
        super().__init__(message or default)


class ParserProviderError(Exception):
    """Wraps unexpected lower-level parser failures."""


class UnsupportedFileType(Exception):
    """Raised when no parser supports the requested file type."""

    def __init__(self, file_type: str) -> None:
        super().__init__(f"No parser supports file type: '{file_type}'")
