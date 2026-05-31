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
