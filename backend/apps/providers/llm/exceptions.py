"""Exceptions raised when LLM provider configuration or API calls fail."""

from apps.core.exceptions import AskDocsError


class ProviderConfigInvalid(AskDocsError):
    """Provider name or settings are invalid."""
    status_code = 400
    default_code = "provider_config_invalid"
    default_detail = "Provider configuration is invalid."


class ProviderConfigMissing(AskDocsError):
    """No provider config exists for the workspace."""

    status_code = 404
    default_code = "provider_config_missing"
    default_detail = "No provider configuration found for this workspace."


class ProviderAuthError(AskDocsError):
    """API key or authentication rejected by the provider."""

    status_code = 401
    default_code = "provider_auth_error"
    default_detail = "Provider authentication failed. Check your API key."


class ProviderRateLimitError(AskDocsError):
    """Provider rate limit exceeded."""

    status_code = 429
    default_code = "provider_rate_limit"
    default_detail = "Provider rate limit exceeded."


class ProviderUnavailableError(AskDocsError):
    """Provider service is temporarily unavailable."""

    status_code = 503
    default_code = "provider_unavailable"
    default_detail = "Provider service is currently unavailable."


class ProviderInvalidResponseError(AskDocsError):
    """Provider returned an unexpected or unparseable response."""

    status_code = 502
    default_code = "provider_invalid_response"
    default_detail = "Provider returned an unexpected response."


class ProviderTimeoutError(AskDocsError):
    """Provider request timed out."""

    status_code = 504
    default_code = "provider_timeout"
    default_detail = "Provider request timed out."
