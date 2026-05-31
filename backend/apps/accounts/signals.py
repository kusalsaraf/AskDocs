import logging
from typing import Any

logger = logging.getLogger(__name__)


def handle_user_created(sender: Any, instance: Any, created: bool, **kwargs: Any) -> None:
    if not created:
        return
    from apps.workspaces.services import create_personal_workspace

    create_personal_workspace(instance)
