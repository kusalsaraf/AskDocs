"""Fernet symmetric encryption for provider API keys.

Keys are encrypted at rest using the ``PROVIDER_ENCRYPTION_KEY``
Django setting and decrypted only when needed to make provider
API calls.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from apps.core.logging import get_logger

logger = get_logger(__name__)

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    """Return the cached Fernet instance, initialising on first call.

    Raises:
        ImproperlyConfigured: If ``PROVIDER_ENCRYPTION_KEY`` is not set.
    """
    global _fernet
    if _fernet is None:
        key = getattr(settings, "PROVIDER_ENCRYPTION_KEY", None)
        if not key:
            raise ImproperlyConfigured(
                "PROVIDER_ENCRYPTION_KEY is not set. "
                'Generate one with: python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        raw = key.encode() if isinstance(key, str) else key
        _fernet = Fernet(raw)
    return _fernet


def encrypt_api_key(plaintext: str) -> bytes:
    """Encrypt an API key for safe database storage."""
    return _get_fernet().encrypt(plaintext.encode())


def decrypt_api_key(ciphertext: bytes) -> str:
    """Decrypt a stored API key, returning the plaintext.

    Raises:
        cryptography.fernet.InvalidToken: If the ciphertext is corrupt
            or the encryption key has changed.
    """
    try:
        return _get_fernet().decrypt(bytes(ciphertext)).decode()
    except InvalidToken:
        logger.error("Failed to decrypt API key — encryption key may have changed")
        raise


def get_last_4(plaintext: str) -> str:
    """Return the last 4 characters of a key for safe display."""
    return plaintext[-4:] if len(plaintext) >= 4 else plaintext
