"""DRF serializers for workspaces, members, and invitations."""

from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer
from apps.workspaces.models import Membership, Workspace, WorkspaceInvitation


class WorkspaceSerializer(BaseModelSerializer):
    """Read representation of a workspace."""

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "is_personal", "avatar_url", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "is_personal", "created_at", "updated_at"]


class WorkspaceCreateSerializer(serializers.Serializer[Workspace]):
    """Input for creating a new team workspace."""

    name = serializers.CharField(max_length=255)


class WorkspaceUpdateSerializer(serializers.Serializer[Workspace]):
    """Partial update payload for workspace name and avatar."""

    name = serializers.CharField(max_length=255, required=False)
    avatar_url = serializers.URLField(required=False, allow_blank=True)


class MembershipSerializer(serializers.ModelSerializer[Membership]):
    """Workspace member with denormalized user profile fields."""

    user_id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)
    workspace_id = serializers.UUIDField(source="workspace.id", read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id",
            "user_id",
            "workspace_id",
            "email",
            "first_name",
            "last_name",
            "avatar_url",
            "role",
            "joined_at",
        ]
        read_only_fields = [
            "id",
            "user_id",
            "workspace_id",
            "email",
            "first_name",
            "last_name",
            "avatar_url",
            "joined_at",
        ]


class MemberRoleUpdateSerializer(serializers.Serializer[Membership]):
    """Input for changing a member's role."""

    role = serializers.ChoiceField(choices=Membership.Role.choices)


class InvitationSerializer(serializers.ModelSerializer[WorkspaceInvitation]):
    """Read representation of a workspace invitation."""

    class Meta:
        model = WorkspaceInvitation
        fields = ["id", "email", "role", "token", "invited_at", "accepted_at"]
        read_only_fields = ["id", "token", "invited_at", "accepted_at"]


class InvitationCreateSerializer(serializers.Serializer[WorkspaceInvitation]):
    """Input for inviting a user by email."""

    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=[(Membership.Role.ADMIN, "Admin"), (Membership.Role.MEMBER, "Member")],
        default=Membership.Role.MEMBER,
    )
