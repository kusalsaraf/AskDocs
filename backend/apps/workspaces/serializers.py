from rest_framework import serializers

from apps.core.serializers import BaseModelSerializer
from apps.workspaces.models import Membership, Workspace, WorkspaceInvitation


class WorkspaceSerializer(BaseModelSerializer):
    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "is_personal", "avatar_url", "created_at", "updated_at"]
        read_only_fields = ["id", "slug", "is_personal", "created_at", "updated_at"]


class WorkspaceCreateSerializer(serializers.Serializer[Workspace]):
    name = serializers.CharField(max_length=255)


class WorkspaceUpdateSerializer(serializers.Serializer[Workspace]):
    name = serializers.CharField(max_length=255, required=False)
    avatar_url = serializers.URLField(required=False, allow_blank=True)


class MembershipSerializer(serializers.ModelSerializer[Membership]):
    user_id = serializers.UUIDField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    avatar_url = serializers.CharField(source="user.avatar_url", read_only=True)

    class Meta:
        model = Membership
        fields = [
            "id",
            "user_id",
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
            "email",
            "first_name",
            "last_name",
            "avatar_url",
            "joined_at",
        ]


class MemberRoleUpdateSerializer(serializers.Serializer[Membership]):
    role = serializers.ChoiceField(choices=Membership.Role.choices)


class InvitationSerializer(serializers.ModelSerializer[WorkspaceInvitation]):
    class Meta:
        model = WorkspaceInvitation
        fields = ["id", "email", "role", "token", "invited_at", "accepted_at"]
        read_only_fields = ["id", "token", "invited_at", "accepted_at"]


class InvitationCreateSerializer(serializers.Serializer[WorkspaceInvitation]):
    email = serializers.EmailField()
    role = serializers.ChoiceField(
        choices=Membership.Role.choices, default=Membership.Role.MEMBER
    )
