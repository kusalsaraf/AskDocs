"""Django signals for the accounts app.

Handles post-save actions on the User model, such as automatic
personal workspace creation.
"""
from __future__ import annotations

from typing import Any

from apps.core.logging import get_logger

logger = get_logger(__name__)


def handle_user_created(sender: Any, instance: Any, created: bool, **kwargs: Any) -> None:
    """Create a personal workspace for newly registered users.

    Called via ``post_save`` signal on the User model.  Logs success or
    failure to aid debugging of onboarding issues.
    """
    if not created:
        return
    from apps.workspaces.services import create_personal_workspace

    try:
        create_personal_workspace(instance)
    except Exception:
        logger.exception(
            "Failed to create personal workspace for new user",
            extra={"user_id": str(instance.id), "email": instance.email},
        )
        raise
