from .base import *  # noqa: F401, F403
from .base import LOG_LEVEL  # noqa: F401

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Run Celery tasks synchronously so document ingestion works without a separate worker process.
# Remove these two lines if you want to test the async worker flow (requires Redis + celery worker).
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{levelname}] {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": LOG_LEVEL,
    },
}
