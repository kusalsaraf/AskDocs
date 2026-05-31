import logging

import redis
from django.conf import settings
from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

logger = logging.getLogger(__name__)

VERSION = "0.1.0"


def _check_database() -> str:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return "ok"
    except Exception as exc:
        logger.error("Database health check failed: %s", exc)
        return "error"


def _check_redis() -> str:
    try:
        client = redis.from_url(settings.REDIS_URL)  # type: ignore[no-untyped-call]
        client.ping()
        return "ok"
    except Exception as exc:
        logger.error("Redis health check failed: %s", exc)
        return "error"


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request: Request) -> Response:
    db_status = _check_database()
    redis_status = _check_redis()
    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"
    return Response(
        {
            "status": overall,
            "version": VERSION,
            "checks": {
                "database": db_status,
                "redis": redis_status,
            },
        }
    )
