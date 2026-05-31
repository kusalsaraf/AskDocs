from datetime import UTC, datetime

from django.conf import settings
from django.core.cache import cache

from apps.core.exceptions import RateLimitExceeded


def check_test_rate_limit(workspace_id: str) -> None:
    """Increment the per-workspace hourly test counter; raise RateLimitExceeded if over limit."""
    hour = datetime.now(tz=UTC).strftime("%Y%m%d%H")
    key = f"provider_test:{workspace_id}:{hour}"
    limit: int = getattr(settings, "PROVIDER_TEST_RATE_LIMIT_PER_HOUR", 10)

    count: int = cache.get(key, 0)
    if count >= limit:
        raise RateLimitExceeded(
            detail=f"Maximum {limit} connection tests per hour per workspace.",
            code="provider_test_rate_limit",
        )
    cache.set(key, count + 1, timeout=3600)
