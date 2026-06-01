from .development import *  # noqa: F401, F403

# Use in-memory SQLite so tests run without a running Postgres instance.
# The health check degrades gracefully when Redis is unreachable; test
# assertions cover both "ok" and "degraded" to handle this.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Documents migrations use pgvector (PostgreSQL-only). Redirect to SQLite-compatible
# test migrations that use TextField instead of VectorField and omit the HNSW index.
MIGRATION_MODULES = {
    "documents": "apps.documents.test_migrations",
}

# Valid Fernet key for tests — DO NOT use in production
# URL-safe base64 of 32 zero-bytes; structurally valid for Fernet
PROVIDER_ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

# LocMemCache (not DummyCache) so rate-limit counter actually increments in tests
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}
