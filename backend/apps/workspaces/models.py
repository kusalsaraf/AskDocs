"""Multi-tenant workspaces, memberships, and email invitations."""

import uuid

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel


class Workspace(BaseModel):
    """Collaboration container for documents, chat, and provider settings."""

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=255)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_workspaces",
    )
    is_personal = models.BooleanField(default=False)
    avatar_url = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    """Links a user to a workspace with a role."""

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        "accounts.User", on_delete=models.CASCADE, related_name="memberships"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("workspace", "user")]

    def __str__(self) -> str:
        return f"{self.user} - {self.workspace} ({self.role})"


class WorkspaceInvitation(models.Model):
    """Pending email invite to join a workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invitations"
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=10,
        choices=Membership.Role.choices,
        default=Membership.Role.MEMBER,
    )
    invited_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="sent_invitations",
    )
    invited_at = models.DateTimeField(default=timezone.now)
    accepted_at = models.DateTimeField(null=True, blank=True)
    token = models.UUIDField(default=uuid.uuid4, unique=True)

    class Meta:
        unique_together = [("workspace", "email")]

    def __str__(self) -> str:
        return f"Invitation: {self.email} -> {self.workspace}"
