from django.contrib import admin

from apps.workspaces.models import Membership, Workspace, WorkspaceInvitation


class MembershipInline(admin.TabularInline):  # type: ignore[type-arg]
    model = Membership
    extra = 0
    readonly_fields = ["joined_at"]


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["name", "slug", "is_personal", "created_by", "created_at"]
    list_filter = ["is_personal"]
    search_fields = ["name", "slug"]
    readonly_fields = ["slug", "created_at", "updated_at"]
    inlines = [MembershipInline]


@admin.register(WorkspaceInvitation)
class WorkspaceInvitationAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["email", "workspace", "role", "invited_by", "invited_at", "accepted_at"]
    list_filter = ["role"]
    search_fields = ["email"]
