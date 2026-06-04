from datetime import timedelta
from pathlib import Path

import environ

env = environ.Env()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="django-insecure-change-me-in-production")

DEBUG = env.bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.sites",
    # Third party
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "dj_rest_auth",
    "dj_rest_auth.registration",
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    # Internal apps
    "apps.core.apps.CoreConfig",
    "apps.accounts.apps.AccountsConfig",
    "apps.workspaces.apps.WorkspacesConfig",
    "apps.documents.apps.DocumentsConfig",
    "apps.chat.apps.ChatConfig",
    "apps.providers.apps.ProvidersConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.SecurityHeadersMiddleware",
    "apps.core.middleware.RequestIDMiddleware",
    "allauth.account.middleware.AccountMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://askdocs:askdocs@localhost:5432/askdocs",
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
SITE_ID = 1

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.custom_exception_handler",
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "auth_login": "20/minute",
        "auth_refresh": "30/minute",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "AskDocs API",
    "DESCRIPTION": (
        "Multi-tenant document intelligence API. "
        "Upload documents, query them with AI, get inline source citations."
    ),
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:6379/1")
CELERY_RESULT_BACKEND = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

LOG_LEVEL = env("LOG_LEVEL", default="INFO")

# ── Chat / RAG ────────────────────────────────────────────────────────────────
USER_DAILY_MESSAGE_LIMIT = env.int("USER_DAILY_MESSAGE_LIMIT", default=100)
GLOBAL_DAILY_PLATFORM_LLM_BUDGET = env.int("GLOBAL_DAILY_PLATFORM_LLM_BUDGET", default=5000)
CHAT_RESPONSE_CACHE_TTL_SECONDS = env.int("CHAT_RESPONSE_CACHE_TTL_SECONDS", default=86400)
CHAT_DEFAULT_TOP_K = env.int("CHAT_DEFAULT_TOP_K", default=5)
CHAT_MAX_HISTORY_TURNS = env.int("CHAT_MAX_HISTORY_TURNS", default=10)

MAX_DOCUMENTS_PER_WORKSPACE = env.int("MAX_DOCUMENTS_PER_WORKSPACE", default=50)

# ── Email (Resend) ─────────────────────────────────────────────────────────────
RESEND_API_KEY = env("RESEND_API_KEY", default="")
RESEND_FROM_EMAIL = env("RESEND_FROM_EMAIL", default="onboarding@resend.dev")
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

# ── Provider system ───────────────────────────────────────────────────────────
# No default — raises ImproperlyConfigured at startup if missing
PROVIDER_ENCRYPTION_KEY = env("PROVIDER_ENCRYPTION_KEY")
PROVIDER_TEST_RATE_LIMIT_PER_HOUR = env.int("PROVIDER_TEST_RATE_LIMIT_PER_HOUR", default=10)
PROVIDER_REQUEST_TIMEOUT_SECONDS = env.int("PROVIDER_REQUEST_TIMEOUT_SECONDS", default=30)

# Platform-default LLM provider (used when a workspace has no BYOK ProviderConfig).
# Set DEFAULT_PLATFORM_PROVIDER to "openai" or "gemini" and supply the matching key.
DEFAULT_PLATFORM_PROVIDER = env("DEFAULT_PLATFORM_PROVIDER", default="gemini")
DEFAULT_PLATFORM_OPENAI_API_KEY = env("DEFAULT_PLATFORM_OPENAI_API_KEY", default="")
DEFAULT_PLATFORM_OPENAI_MODEL = env("DEFAULT_PLATFORM_OPENAI_MODEL", default="gpt-4o-mini")
DEFAULT_PLATFORM_GEMINI_API_KEY = env("DEFAULT_PLATFORM_GEMINI_API_KEY", default="")
DEFAULT_PLATFORM_GEMINI_MODEL = env("DEFAULT_PLATFORM_GEMINI_MODEL", default="gemini-1.5-flash")

# Embedding provider for document ingestion and query embedding.
# "openai" uses text-embedding-3-small at 768 dims (Matryoshka truncation).
# "gemini" uses text-embedding-004 at 768 dims.
EMBEDDING_PROVIDER = env("EMBEDDING_PROVIDER", default="gemini")

# ── Document parser ───────────────────────────────────────────────────────────
PARSER_PROVIDER = env("PARSER_PROVIDER", default="unstructured")
UNSTRUCTURED_DEFAULT_STRATEGY = env("UNSTRUCTURED_DEFAULT_STRATEGY", default="fast")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL", default="redis://localhost:6379/0"),
    }
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "SIGNING_KEY": env("JWT_SIGNING_KEY", default=SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ── dj-rest-auth ──────────────────────────────────────────────────────────────
REST_AUTH = {
    "USE_JWT": True,
    "JWT_AUTH_HTTPONLY": False,
    "JWT_AUTH_RETURN_EXPIRATION": True,
    "USER_DETAILS_SERIALIZER": "apps.accounts.serializers.UserSerializer",
    "TOKEN_MODEL": None,
}

# ── allauth ───────────────────────────────────────────────────────────────────
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_AUTHENTICATION_METHOD = "email"
ACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_AUTO_SIGNUP = True              # skip signup confirmation for new social users
SOCIALACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_LOGIN_ON_GET = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True     # connect Google to existing account with same email
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "APP": {
            "client_id": env("GOOGLE_OAUTH_CLIENT_ID", default=""),
            "secret": env("GOOGLE_OAUTH_CLIENT_SECRET", default=""),
            "key": "",
        },
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
    }
}
