from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
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
    return _get_fernet().encrypt(plaintext.encode())


def decrypt_api_key(ciphertext: bytes) -> str:
    # bytes() cast handles memoryview returned by Django's BinaryField on PostgreSQL
    return _get_fernet().decrypt(bytes(ciphertext)).decode()


def get_last_4(plaintext: str) -> str:
    return plaintext[-4:] if len(plaintext) >= 4 else plaintext
