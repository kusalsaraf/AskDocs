from __future__ import annotations

from datetime import date
from uuid import UUID

from django.conf import settings
from django.core.cache import cache

from apps.chat.exceptions import BudgetExceeded, RateLimitExceeded
from apps.core.logging import get_logger

logger = get_logger(__name__)

_USER_TTL = 86400  # 24 hours


def _user_key(user_id: UUID) -> str:
    return f"chat:user:{user_id}:{date.today().isoformat()}"


def _global_key() -> str:
    return f"chat:global_budget:{date.today().isoformat()}"


def check_and_increment_user_limit(user_id: UUID) -> None:
    limit = settings.USER_DAILY_MESSAGE_LIMIT
    key = _user_key(user_id)
    current = cache.get(key, 0)
    if current >= limit:
        logger.warning("User rate limit hit", extra={"user_id": str(user_id), "count": current})
        raise RateLimitExceeded(
            detail=f"Daily message limit of {limit} reached. Please try again tomorrow."
        )
    # Atomic increment: set to current+1 with TTL if new, otherwise add 1
    new_val = current + 1
    cache.set(key, new_val, timeout=_USER_TTL)


def check_and_increment_global_budget() -> None:
    budget = settings.GLOBAL_DAILY_PLATFORM_LLM_BUDGET
    key = _global_key()
    current = cache.get(key, 0)
    if current >= budget:
        logger.warning("Global budget hit", extra={"count": current})
        raise BudgetExceeded(
            detail=(
                f"Platform daily budget of {budget} messages has been reached. "
                "Please try again tomorrow."
            )
        )
    new_val = current + 1
    cache.set(key, new_val, timeout=_USER_TTL)


def get_remaining_user_quota(user_id: UUID) -> int:
    limit = settings.USER_DAILY_MESSAGE_LIMIT
    used = cache.get(_user_key(user_id), 0)
    return max(0, limit - used)


def get_remaining_global_budget() -> int:
    budget = settings.GLOBAL_DAILY_PLATFORM_LLM_BUDGET
    used = cache.get(_global_key(), 0)
    return max(0, budget - used)


def get_user_messages_used_today(user_id: UUID) -> int:
    return cache.get(_user_key(user_id), 0)
