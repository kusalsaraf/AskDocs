from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.providers.models import ProviderConfig

_PROVIDERS_REQUIRING_KEY = {"openai", "anthropic", "gemini", "azure", "mistral", "groq"}
_PROVIDERS_REQUIRING_BASE_URL = {"azure", "ollama"}
_PROVIDERS_REQUIRING_REGION = {"azure"}


class ProviderConfigSerializer(serializers.ModelSerializer[ProviderConfig]):
    api_key_masked = serializers.SerializerMethodField()
    is_default = serializers.SerializerMethodField()

    class Meta:
        model = ProviderConfig
        fields = [
            "id",
            "provider_name",
            "api_key_masked",
            "api_key_last_4",
            "base_url",
            "azure_region",
            "model_name",
            "temperature",
            "max_tokens",
            "last_tested_at",
            "last_test_status",
            "last_test_error",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_api_key_masked(self, obj: ProviderConfig) -> str | None:
        if not obj.api_key_last_4:
            return None
        return f"••••••••{obj.api_key_last_4}"

    def get_is_default(self, obj: ProviderConfig) -> bool:
        return False


class ProviderDefaultResponseSerializer(serializers.Serializer[Any]):
    """Returned when the workspace has no ProviderConfig (falls back to platform default)."""

    is_default = serializers.BooleanField(default=True)
    provider_name = serializers.CharField(default="gemini")
    model_name = serializers.CharField(default="gemini-1.5-flash")
    description = serializers.CharField(
        default=(
            "This workspace uses the AskDocs platform-default Gemini model. "
            "Configure a custom provider in Settings to use your own API key."
        )
    )


class ProviderConfigWriteSerializer(serializers.Serializer[ProviderConfig]):
    provider_name = serializers.ChoiceField(choices=ProviderConfig.Provider.choices)
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    base_url = serializers.URLField(required=False, allow_null=True, default=None)
    azure_region = serializers.CharField(required=False, allow_blank=True, default="")
    model_name = serializers.CharField(max_length=255)
    temperature = serializers.FloatField(default=0.7)
    max_tokens = serializers.IntegerField(default=2048, min_value=1)

    def validate(self, data: dict[str, Any]) -> dict[str, Any]:
        provider = data["provider_name"]

        if provider in _PROVIDERS_REQUIRING_KEY and not data.get("api_key"):
            raise serializers.ValidationError(
                {"api_key": f"api_key is required for {provider}."}
            )
        if provider in _PROVIDERS_REQUIRING_BASE_URL and not data.get("base_url"):
            raise serializers.ValidationError(
                {"base_url": f"base_url is required for {provider}."}
            )
        if provider in _PROVIDERS_REQUIRING_REGION and not data.get("azure_region"):
            raise serializers.ValidationError(
                {"azure_region": "azure_region is required for Azure."}
            )

        temp = data.get("temperature", 0.7)
        if not (0.0 <= temp <= 1.0):
            raise serializers.ValidationError(
                {"temperature": "temperature must be between 0.0 and 1.0."}
            )

        return data


class ProviderTestRequestSerializer(serializers.Serializer[Any]):
    """Like ProviderConfigWriteSerializer but api_key is optional — falls back to the saved key."""
    provider_name = serializers.ChoiceField(choices=ProviderConfig.Provider.choices)
    api_key       = serializers.CharField(write_only=True, required=False, allow_blank=True, default="")
    base_url      = serializers.URLField(required=False, allow_null=True, default=None)
    azure_region  = serializers.CharField(required=False, allow_blank=True, default="")
    model_name    = serializers.CharField(max_length=255)
    temperature   = serializers.FloatField(default=0.7)
    max_tokens    = serializers.IntegerField(default=2048, min_value=1)


class ProviderTestResponseSerializer(serializers.Serializer[Any]):
    success = serializers.BooleanField()
    latency_ms = serializers.IntegerField()
    model_echo = serializers.CharField(allow_blank=True)
    error = serializers.CharField(allow_null=True)
