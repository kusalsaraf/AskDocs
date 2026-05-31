from typing import Any

from apps.providers.llm.anthropic_provider import AnthropicProvider
from apps.providers.llm.azure import AzureProvider
from apps.providers.llm.base import BaseLLMProvider
from apps.providers.llm.gemini import GeminiProvider
from apps.providers.llm.groq_provider import GroqProvider
from apps.providers.llm.mistral import MistralProvider
from apps.providers.llm.ollama import OllamaProvider
from apps.providers.llm.openai_provider import OpenAIProvider

PROVIDER_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "azure": AzureProvider,
    "mistral": MistralProvider,
    "groq": GroqProvider,
    "ollama": OllamaProvider,
}

SUPPORTED_PROVIDERS: list[dict[str, Any]] = [
    {
        "name": "openai",
        "display_name": "OpenAI",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-preview"],
        "description": "GPT-4o, GPT-4-turbo, o1-preview and more.",
    },
    {
        "name": "anthropic",
        "display_name": "Anthropic",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": [
            "claude-3-5-sonnet-20241022",
            "claude-3-haiku-20240307",
            "claude-3-opus-20240229",
        ],
        "description": "Claude 3.5 Sonnet, Claude 3 Haiku, Claude 3 Opus.",
    },
    {
        "name": "gemini",
        "display_name": "Google Gemini",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
        "description": "Gemini 1.5 Pro, Gemini 1.5 Flash.",
    },
    {
        "name": "azure",
        "display_name": "Azure OpenAI",
        "requires_api_key": True,
        "requires_base_url": True,
        "requires_region": True,
        "suggested_models": [],
        "description": "Azure-hosted OpenAI models. Provide your endpoint URL and deployment name.",
    },
    {
        "name": "mistral",
        "display_name": "Mistral",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["mistral-large-latest", "mistral-small-latest", "open-mixtral-8x7b"],
        "description": "Mistral Large, Mistral Small, Mixtral.",
    },
    {
        "name": "groq",
        "display_name": "Groq",
        "requires_api_key": True,
        "requires_base_url": False,
        "requires_region": False,
        "suggested_models": ["llama3-70b-8192", "llama3-8b-8192", "mixtral-8x7b-32768"],
        "description": "Ultra-fast inference on Llama 3, Mixtral.",
    },
    {
        "name": "ollama",
        "display_name": "Ollama (self-hosted)",
        "requires_api_key": False,
        "requires_base_url": True,
        "requires_region": False,
        "suggested_models": ["llama3", "mistral", "phi3"],
        "description": "Self-hosted Ollama instance. Provide the base URL (e.g. http://localhost:11434).",
    },
]
