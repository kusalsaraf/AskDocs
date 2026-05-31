import pytest
from django.core.cache import cache

from apps.core.exceptions import RateLimitExceeded


def test_rate_limit_allows_up_to_limit() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-001")  # must not raise


def test_rate_limit_blocks_on_eleventh_call() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-002")

    with pytest.raises(RateLimitExceeded):
        check_test_rate_limit("ws-002")


def test_rate_limit_is_per_workspace() -> None:
    from apps.providers.rate_limit import check_test_rate_limit

    cache.clear()
    for _ in range(10):
        check_test_rate_limit("ws-003")

    # A different workspace must not be affected
    check_test_rate_limit("ws-004")  # must not raise
