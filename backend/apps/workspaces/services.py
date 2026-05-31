import logging
import random
import string
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.db import IntegrityError
from django.utils import timezone
from django.utils.text import slugify

from apps.core.exceptions import (
    CannotDeletePersonalWorkspace,
    CannotRemoveSoleAdmin,
    InsufficientWorkspaceRole,
    InvitationAlreadyAccepted,
    NotFound,
)

if TYPE_CHECKING:
    from apps.workspaces.models import Membership, Workspace, WorkspaceInvitation

logger = logging.getLogger(__name__)


def _generate_slug(name: str) -> str:
    base = slugify(name) or "workspace"
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{base}-{suffix}"


def _create_workspace_with_slug(name: str, **kwargs: Any) -> "Workspace":
    from apps.workspaces.models import Workspace

    for _ in range(5):
        slug = _generate_slug(name)
        try:
            return Workspace.objects.create(name=name, slug=slug, **kwargs)
        except IntegrityError:
            continue
    raise IntegrityError("Could not generate unique slug after 5 attempts")


def create_personal_workspace(user: Any) -> "Workspace":
    from apps.workspaces.models import Membership

    name = (
        f"{user.first_name}'s Workspace"
        if user.first_name
        else f"{user.email.split('@')[0]}'s Workspace"
    )
    workspace = _create_workspace_with_slug(name, created_by=user, is_personal=True)
    Membership.objects.create(workspace=workspace, user=user, role=Membership.Role.ADMIN)
    logger.info("Created personal workspace %s for user %s", workspace.id, user.id)
    return workspace


def create_workspace(name: str, user: Any) -> "Workspace":
    from apps.workspaces.models import Membership

    workspace = _create_workspace_with_slug(name, created_by=user, is_personal=False)
    Membership.objects.create(workspace=workspace, user=user, role=Membership.Role.ADMIN)
    logger.info("Created workspace %s by user %s", workspace.id, user.id)
    return workspace


def update_workspace(
    workspace: Any,
    name: str | None = None,
    avatar_url: str | None = None,
) -> "Workspace":
    if name is not None:
        workspace.name = name
    if avatar_url is not None:
        workspace.avatar_url = avatar_url
    workspace.save(update_fields=["name", "avatar_url", "updated_at"])
    return workspace


def delete_workspace(workspace: Any) -> None:
    if workspace.is_personal:
        raise CannotDeletePersonalWorkspace()
    workspace.delete()


def change_member_role(
    workspace: Any,
    target_user: Any,
    new_role: str,
    acting_user: Any,
) -> "Membership":
    from apps.workspaces.models import Membership

    membership = Membership.objects.get(workspace=workspace, user=target_user)
    if membership.role == Membership.Role.ADMIN and new_role != Membership.Role.ADMIN:
        admin_count = Membership.objects.filter(
            workspace=workspace, role=Membership.Role.ADMIN
        ).count()
        if admin_count <= 1:
            raise CannotRemoveSoleAdmin()
    membership.role = new_role
    membership.save(update_fields=["role"])
    return membership


def remove_member(workspace: Any, target_user: Any) -> None:
    from apps.workspaces.models import Membership

    membership = Membership.objects.get(workspace=workspace, user=target_user)
    if membership.role == Membership.Role.ADMIN:
        admin_count = Membership.objects.filter(
            workspace=workspace, role=Membership.Role.ADMIN
        ).count()
        if admin_count <= 1:
            raise CannotRemoveSoleAdmin()
    membership.delete()


def create_invitation(
    workspace: Any,
    email: str,
    role: str,
    invited_by: Any,
) -> "WorkspaceInvitation":
    from apps.workspaces.models import Membership, WorkspaceInvitation

    if role not in [r.value for r in Membership.Role]:
        raise InsufficientWorkspaceRole(detail=f"Invalid role: {role}")
    invitation, _ = WorkspaceInvitation.objects.get_or_create(
        workspace=workspace,
        email=email,
        defaults={"role": role, "invited_by": invited_by},
    )
    return invitation


def accept_invitation(token: UUID, user: Any) -> "Membership":
    from apps.workspaces.models import Membership, WorkspaceInvitation

    try:
        invitation = WorkspaceInvitation.objects.select_related("workspace").get(
            token=token
        )
    except WorkspaceInvitation.DoesNotExist as exc:
        raise NotFound(detail="Invitation not found.") from exc

    if invitation.accepted_at is not None:
        raise InvitationAlreadyAccepted()

    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at"])

    membership, _ = Membership.objects.get_or_create(
        workspace=invitation.workspace,
        user=user,
        defaults={"role": invitation.role},
    )
    logger.info(
        "User %s accepted invitation to workspace %s", user.id, invitation.workspace.id
    )
    return membership
