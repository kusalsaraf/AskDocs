def test_encrypt_decrypt_roundtrip() -> None:
    from apps.providers.crypto import decrypt_api_key, encrypt_api_key

    plaintext = "sk-proj-abc123xyz789"
    ciphertext = encrypt_api_key(plaintext)
    assert isinstance(ciphertext, bytes)
    assert decrypt_api_key(ciphertext) == plaintext


def test_encrypt_is_nondeterministic() -> None:
    from apps.providers.crypto import encrypt_api_key

    key = "sk-test"
    assert encrypt_api_key(key) != encrypt_api_key(key)


def test_get_last_4_returns_last_four_chars() -> None:
    from apps.providers.crypto import get_last_4

    assert get_last_4("sk-abcd1234") == "1234"
    assert get_last_4("abc-xyz-cb3d") == "cb3d"


def test_get_last_4_handles_short_key() -> None:
    from apps.providers.crypto import get_last_4

    assert get_last_4("ab") == "ab"
    assert get_last_4("") == ""
