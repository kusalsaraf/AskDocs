"""Business logic for workspace lifecycle, membership, and invitations."""

import logging
import random
import string
from typing import TYPE_CHECKING, Any
from uuid import UUID

from django.db import IntegrityError
from django.utils import timezone
from django.utils.text import slugify

from apps.core.constants import INVITATION_EXPIRY_HOURS
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
    """Create the default personal workspace and admin membership for a new user."""
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
    """Create a shared team workspace with the creator as admin."""
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
    """Update workspace display fields and return the saved instance."""
    if name is not None:
        workspace.name = name
    if avatar_url is not None:
        workspace.avatar_url = avatar_url
    workspace.save(update_fields=["name", "avatar_url", "updated_at"])
    return workspace


def delete_workspace(workspace: Any) -> None:
    """Delete a team workspace; raises if the workspace is personal."""
    if workspace.is_personal:
        raise CannotDeletePersonalWorkspace()
    workspace.delete()


def change_member_role(
    workspace: Any,
    target_user: Any,
    new_role: str,
    acting_user: Any,
) -> "Membership":
    """Change a member's role, preventing removal of the sole admin."""
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
    """Remove a member from the workspace, preserving at least one admin."""
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
) -> tuple["WorkspaceInvitation", bool]:
    """Create or refresh an invitation and send the acceptance email."""
    from django.conf import settings

    from apps.core.email import send_invitation_email
    from apps.workspaces.models import Membership, WorkspaceInvitation

    if role not in [r.value for r in Membership.Role]:
        raise InsufficientWorkspaceRole(detail=f"Invalid role: {role}")

    invitation, created = WorkspaceInvitation.objects.get_or_create(
        workspace=workspace,
        email=email,
        defaults={"role": role, "invited_by": invited_by},
    )

    if not created:
        if invitation.accepted_at is not None:
            raise InvitationAlreadyAccepted()
        invitation.role = role
        invitation.invited_by = invited_by
        invitation.invited_at = timezone.now()
        invitation.save(update_fields=["role", "invited_by", "invited_at"])

    inviter_name = getattr(invited_by, "display_name", None) or invited_by.email
    accept_url = (
        f"{settings.FRONTEND_URL}/invite/{invitation.token}"
        f"?workspace={workspace.name}&inviter={inviter_name}&email={email}"
    )
    send_invitation_email(
        to=email,
        workspace_name=workspace.name,
        inviter_name=inviter_name,
        accept_url=accept_url,
    )

    return invitation, created


def accept_invitation(token: UUID, user: Any) -> "Membership":
    """Accept a valid invitation and create workspace membership."""
    from datetime import timedelta

    from apps.core.exceptions import InvitationExpired, PermissionDenied
    from apps.workspaces.models import Membership, WorkspaceInvitation

    try:
        invitation = WorkspaceInvitation.objects.select_related("workspace").get(
            token=token
        )
    except WorkspaceInvitation.DoesNotExist as exc:
        raise NotFound(detail="Invitation not found.") from exc

    if invitation.accepted_at is not None:
        raise InvitationAlreadyAccepted()

    # Invitations expire after INVITATION_EXPIRY_HOURS
    if timezone.now() > invitation.invited_at + timedelta(hours=INVITATION_EXPIRY_HOURS):
        raise InvitationExpired()

    if user.email.lower() != invitation.email.lower():
        raise PermissionDenied(
            detail="This invitation was sent to a different email address.",
            code="invitation_email_mismatch",
        )

    existing = Membership.objects.filter(
        workspace=invitation.workspace, user=user
    ).first()
    if existing:
        if user.email.lower() == invitation.email.lower():
            invitation.accepted_at = timezone.now()
            invitation.save(update_fields=["accepted_at"])
        raise InvitationAlreadyAccepted()

    invitation.accepted_at = timezone.now()
    invitation.save(update_fields=["accepted_at"])

    membership = Membership.objects.create(
        workspace=invitation.workspace,
        user=user,
        role=invitation.role,
    )
    logger.info(
        "User %s accepted invitation to workspace %s", user.id, invitation.workspace.id
    )
    return membership


def resend_invitation(invitation_id: UUID, workspace: Any, acting_user: Any) -> None:
    """Resend a pending invitation email and reset the 24-hour expiry window."""
    from django.conf import settings

    from apps.core.email import send_invitation_email
    from apps.workspaces.models import WorkspaceInvitation

    try:
        invitation = WorkspaceInvitation.objects.get(
            id=invitation_id, workspace=workspace, accepted_at__isnull=True
        )
    except WorkspaceInvitation.DoesNotExist as exc:
        raise NotFound(detail="Invitation not found.") from exc

    # Reset invited_at so the 24h window restarts from now
    invitation.invited_at = timezone.now()
    invitation.save(update_fields=["invited_at"])

    inviter_name = getattr(acting_user, "display_name", None) or acting_user.email
    accept_url = (
        f"{settings.FRONTEND_URL}/invite/{invitation.token}"
        f"?workspace={workspace.name}&inviter={inviter_name}&email={invitation.email}"
    )
    send_invitation_email(
        to=invitation.email,
        workspace_name=workspace.name,
        inviter_name=inviter_name,
        accept_url=accept_url,
    )
