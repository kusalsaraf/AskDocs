"""Per-user and global chat rate limits plus daily usage tracking in cache and DB."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from django.conf import settings
from django.core.cache import cache
from django.db.models import F

from apps.chat.exceptions import BudgetExceeded, RateLimitExceeded
from apps.core.constants import DAILY_CACHE_TTL_SECONDS
from apps.core.logging import get_logger

logger = get_logger(__name__)


def _user_workspace_key(user_id: UUID, workspace_id: UUID) -> str:
    return f"chat:uw:{user_id}:{workspace_id}:{date.today().isoformat()}"


def _global_key() -> str:
    return f"chat:global_budget:{date.today().isoformat()}"


def _atomic_incr(key: str, limit: int) -> int:
    try:
        val = cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=DAILY_CACHE_TTL_SECONDS)
        val = 1
    return val


def check_and_increment_user_limit(user_id: UUID, workspace_id: UUID) -> None:
    """Increment today's per-user-per-workspace message count or raise RateLimitExceeded."""
    limit = settings.USER_DAILY_MESSAGE_LIMIT
    key = _user_workspace_key(user_id, workspace_id)

    current = cache.get(key, 0)
    if current >= limit:
        logger.warning(
            "User rate limit hit",
            extra={"user_id": str(user_id), "workspace_id": str(workspace_id), "count": current},
        )
        raise RateLimitExceeded(
            detail=f"Daily message limit of {limit} reached. Please try again tomorrow."
        )
    _atomic_incr(key, limit)


def check_and_increment_global_budget() -> None:
    """Increment today's platform-default LLM budget or raise BudgetExceeded."""
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
    _atomic_incr(key, budget)


def record_failed_attempt(
    workspace_id: UUID,
    user_id: UUID,
) -> None:
    """Record a failed LLM attempt in the DB for admin visibility. Does NOT count toward message_count."""
    from apps.chat.models import UsageRecord

    today = date.today()
    UsageRecord.objects.get_or_create(
        workspace_id=workspace_id,
        user_id=user_id,
        date=today,
        defaults={
            "message_count": 0,
            "token_input_count": 0,
            "token_output_count": 0,
        },
    )


def record_usage(
    workspace_id: UUID,
    user_id: UUID,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
) -> None:
    from apps.chat.models import UsageRecord

    today = date.today()
    record, created = UsageRecord.objects.get_or_create(
        workspace_id=workspace_id,
        user_id=user_id,
        date=today,
        defaults={
            "message_count": 1,
            "token_input_count": prompt_tokens,
            "token_output_count": completion_tokens,
        },
    )
    if not created:
        UsageRecord.objects.filter(id=record.id).update(
            message_count=F("message_count") + 1,
            token_input_count=F("token_input_count") + prompt_tokens,
            token_output_count=F("token_output_count") + completion_tokens,
        )


def get_user_workspace_usage_today(user_id: UUID, workspace_id: UUID) -> int:
    """Return today's cached message count for a user in a workspace."""
    return cache.get(_user_workspace_key(user_id, workspace_id), 0)


def get_remaining_global_budget() -> int:
    """Return remaining platform-default LLM messages for today."""
    budget = settings.GLOBAL_DAILY_PLATFORM_LLM_BUDGET
    used = cache.get(_global_key(), 0)
    return max(0, budget - used)


def decrement_user_limit(user_id: UUID, workspace_id: UUID) -> None:
    """Roll back one user-workspace message after a failed provider call."""
    key = _user_workspace_key(user_id, workspace_id)
    try:
        cache.decr(key)
    except ValueError:
        logger.debug(
            "Could not decrement user limit (key missing or zero)",
            extra={"user_id": str(user_id), "workspace_id": str(workspace_id)},
        )


def decrement_global_budget() -> None:
    """Roll back one platform-default budget unit after a failed provider call."""
    key = _global_key()
    try:
        cache.decr(key)
    except ValueError:
        logger.debug("Could not decrement global budget (key missing or zero)")


def get_workspace_usage_today(workspace_id: UUID) -> dict:
    """Aggregate today's per-member usage records for a workspace."""
    from apps.chat.models import UsageRecord

    today = date.today()
    records = UsageRecord.objects.filter(
        workspace_id=workspace_id, date=today
    ).select_related("user")

    total_messages = 0
    total_input_tokens = 0
    total_output_tokens = 0
    members: list[dict] = []

    for r in records:
        total_messages += r.message_count
        total_input_tokens += r.token_input_count
        total_output_tokens += r.token_output_count
        members.append({
            "user_id": str(r.user_id),
            "email": r.user.email,
            "first_name": r.user.first_name,
            "last_name": r.user.last_name,
            "message_count": r.message_count,
            "token_input_count": r.token_input_count,
            "token_output_count": r.token_output_count,
        })

    return {
        "total_messages": total_messages,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "members": members,
    }
