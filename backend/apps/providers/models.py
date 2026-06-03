"""Per-workspace LLM provider configuration and credentials."""

from django.db import models

from apps.core.constants import DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE
from apps.core.models import BaseModel


class ProviderConfig(BaseModel):
    """Workspace-scoped LLM provider settings and encrypted API key."""

    class Provider(models.TextChoices):
        OPENAI = "openai", "OpenAI"
        ANTHROPIC = "anthropic", "Anthropic"
        GEMINI = "gemini", "Gemini"
        AZURE = "azure", "Azure OpenAI"
        MISTRAL = "mistral", "Mistral"
        GROQ = "groq", "Groq"
        OLLAMA = "ollama", "Ollama"

    class TestStatus(models.TextChoices):
        UNTESTED = "untested", "Untested"
        OK = "ok", "OK"
        FAILED = "failed", "Failed"

    workspace = models.OneToOneField(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="provider_config",
    )
    provider_name = models.CharField(max_length=20, choices=Provider.choices)
    encrypted_api_key = models.BinaryField(null=True, blank=True)
    api_key_last_4 = models.CharField(max_length=4, blank=True)
    base_url = models.URLField(null=True, blank=True)
    azure_region = models.CharField(max_length=100, null=True, blank=True)
    model_name = models.CharField(max_length=255)
    temperature = models.FloatField(default=DEFAULT_TEMPERATURE)
    max_tokens = models.PositiveIntegerField(default=DEFAULT_MAX_TOKENS)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_status = models.CharField(
        max_length=10,
        choices=TestStatus.choices,
        default=TestStatus.UNTESTED,
    )
    last_test_error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_provider_configs",
    )

    def __str__(self) -> str:
        return f"{self.workspace.name} — {self.provider_name}"
