"""Unit tests for concrete LLM provider implementations.
All SDK calls are mocked — no real network requests.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from apps.providers.crypto import encrypt_api_key
from apps.providers.llm.base import Message, ProviderTestResult


def _make_config(workspace: Any, provider_name: str, model_name: str = "test-model", **kwargs: Any) -> Any:
    from apps.providers.models import ProviderConfig

    return ProviderConfig.objects.create(
        workspace=workspace,
        provider_name=provider_name,
        encrypted_api_key=encrypt_api_key("sk-test1234"),
        api_key_last_4="1234",
        model_name=model_name,
        **kwargs,
    )


# ── Gemini ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_gemini_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "gemini", model_name="gemini-1.5-flash")

    with patch("google.generativeai.configure"), \
         patch("google.generativeai.GenerativeModel") as mock_model_cls:
        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model
        mock_response = MagicMock()
        mock_response.text = "ok"
        mock_model.generate_content.return_value = mock_response

        from apps.providers.llm.gemini import GeminiProvider
        result = GeminiProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    assert result.error is None
    assert result.latency_ms >= 0


@pytest.mark.django_db
def test_gemini_test_connection_failure_returns_result_not_exception(workspace: Any) -> None:
    config = _make_config(workspace, "gemini", model_name="gemini-1.5-flash")

    with patch("google.generativeai.configure"), \
         patch("google.generativeai.GenerativeModel") as mock_model_cls:
        mock_model = MagicMock()
        mock_model_cls.return_value = mock_model
        mock_model.generate_content.side_effect = Exception("invalid api key")

        from apps.providers.llm.gemini import GeminiProvider
        result = GeminiProvider(config).test_connection()

    assert result.success is False
    assert "invalid api key" in (result.error or "")


# ── OpenAI ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_openai_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "openai", model_name="gpt-4o")

    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "gpt-4o"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.openai_provider import OpenAIProvider
        result = OpenAIProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"


@pytest.mark.django_db
def test_openai_complete(workspace: Any) -> None:
    config = _make_config(workspace, "openai", model_name="gpt-4o")

    with patch("openai.OpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "Hello!"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 10
        mock_resp.usage.completion_tokens = 3
        mock_resp.usage.total_tokens = 13
        mock_resp.model = "gpt-4o"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.openai_provider import OpenAIProvider
        result = OpenAIProvider(config).complete([Message(role="user", content="Say hello")])

    assert result.text == "Hello!"
    assert result.total_tokens == 13
    assert result.finish_reason == "stop"


# ── Anthropic ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_anthropic_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "anthropic", model_name="claude-3-haiku-20240307")

    with patch("anthropic.Anthropic") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.content = [MagicMock()]
        mock_resp.content[0].text = "ok"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 5
        mock_resp.usage.output_tokens = 1
        mock_resp.model = "claude-3-haiku-20240307"
        mock_client.messages.create.return_value = mock_resp

        from apps.providers.llm.anthropic_provider import AnthropicProvider
        result = AnthropicProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"


# ── Azure OpenAI ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_azure_test_connection_success(workspace: Any) -> None:
    config = _make_config(
        workspace,
        "azure",
        model_name="gpt-4o-deployment",
        base_url="https://my-resource.openai.azure.com",
        azure_region="eastus",
    )

    with patch("openai.AzureOpenAI") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "gpt-4o-deployment"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.azure import AzureProvider
        result = AzureProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    mock_cls.assert_called_once()
    call_kwargs = mock_cls.call_args.kwargs
    assert call_kwargs["azure_endpoint"] == "https://my-resource.openai.azure.com"


# ── Mistral ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_mistral_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "mistral", model_name="mistral-large-latest")

    with patch("apps.providers.llm.mistral.MistralClient") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_client.chat.return_value = mock_resp

        from apps.providers.llm.mistral import MistralProvider
        result = MistralProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"


# ── Groq ──────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_groq_test_connection_success(workspace: Any) -> None:
    config = _make_config(workspace, "groq", model_name="llama3-8b-8192")

    with patch("groq.Groq") as mock_cls:
        mock_client = MagicMock()
        mock_cls.return_value = mock_client
        mock_resp = MagicMock()
        mock_resp.choices[0].message.content = "ok"
        mock_resp.choices[0].finish_reason = "stop"
        mock_resp.usage.prompt_tokens = 5
        mock_resp.usage.completion_tokens = 1
        mock_resp.usage.total_tokens = 6
        mock_resp.model = "llama3-8b-8192"
        mock_client.chat.completions.create.return_value = mock_resp

        from apps.providers.llm.groq_provider import GroqProvider
        result = GroqProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"


# ── Ollama ────────────────────────────────────────────────────────────────────

@pytest.mark.django_db
def test_ollama_test_connection_success(workspace: Any) -> None:
    from apps.providers.models import ProviderConfig

    config = ProviderConfig.objects.create(
        workspace=workspace,
        provider_name="ollama",
        encrypted_api_key=None,
        api_key_last_4="",
        model_name="llama3",
        base_url="http://localhost:11434",
    )

    with patch("httpx.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "message": {"content": "ok"},
            "done": True,
            "eval_count": 1,
            "prompt_eval_count": 5,
            "model": "llama3",
        }
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        from apps.providers.llm.ollama import OllamaProvider
        result = OllamaProvider(config).test_connection()

    assert result.success is True
    assert result.model_echo == "ok"
    mock_post.assert_called_once()
    assert "http://localhost:11434/api/chat" in str(mock_post.call_args)
