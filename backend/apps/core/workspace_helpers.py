"""Shared workspace utility functions for views.

Provides common helpers for resolving workspaces and checking
user membership roles, eliminating duplication across view modules.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from django.shortcuts import get_object_or_404

from apps.workspaces.models import Membership, Workspace


def get_workspace_or_404(workspace_id: UUID) -> Workspace:
    """Return the workspace or raise Http404."""
    return get_object_or_404(Workspace, id=workspace_id)


def get_user_role(workspace: Workspace, user: Any) -> str | None:
    """Return the user's role in the workspace, or ``None`` if not a member."""
    try:
        return Membership.objects.get(workspace=workspace, user=user).role
    except Membership.DoesNotExist:
        return None


def is_admin(workspace: Workspace, user: Any) -> bool:
    """Check whether the user is an admin of the workspace."""
    return get_user_role(workspace, user) == Membership.Role.ADMIN


def can_write(workspace: Workspace, user: Any) -> bool:
    """Check whether the user has write permissions (ADMIN or MEMBER)."""
    role = get_user_role(workspace, user)
    return role in (Membership.Role.ADMIN, Membership.Role.MEMBER)
