from typing import Any

from rest_framework import serializers

from apps.accounts.models import User
from apps.workspaces.models import Membership


class UserSerializer(serializers.ModelSerializer[User]):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "avatar_url"]
        read_only_fields = ["id", "email"]


class MeSerializer(serializers.ModelSerializer[User]):
    workspaces = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name", "avatar_url", "workspaces"]

    def get_workspaces(self, obj: User) -> list[dict[str, Any]]:
        memberships = (
            Membership.objects.filter(user=obj)
            .select_related("workspace")
            .order_by("-workspace__created_at")
        )
        return [
            {
                "id": str(m.workspace.id),
                "name": m.workspace.name,
                "slug": m.workspace.slug,
                "is_personal": m.workspace.is_personal,
                "role": m.role,
            }
            for m in memberships
        ]
