from dj_rest_auth.views import LogoutView
from django.urls import URLPattern, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.views import GoogleLoginView, MeView
from apps.providers.views import ProviderConfigView, ProviderTestView, SupportedProvidersView
from apps.workspaces.views import (
    InvitationAcceptView,
    InvitationViewSet,
    MemberViewSet,
    WorkspaceViewSet,
)

router = DefaultRouter()
router.register(r"workspaces", WorkspaceViewSet, basename="workspace")

urlpatterns: list[URLPattern] = [
    # Auth
    path("auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    # Me
    path("me/", MeView.as_view(), name="me"),
    # Workspaces (router handles /workspaces/ and /workspaces/{pk}/)
    *router.urls,
    # Workspace members (nested)
    path(
        "workspaces/<uuid:workspace_id>/members/",
        MemberViewSet.as_view({"get": "list"}),
        name="workspace-members-list",
    ),
    path(
        "workspaces/<uuid:workspace_id>/members/<uuid:user_id>/",
        MemberViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="workspace-members-detail",
    ),
    # Workspace invitations (nested)
    path(
        "workspaces/<uuid:workspace_id>/invitations/",
        InvitationViewSet.as_view({"post": "create"}),
        name="workspace-invitations",
    ),
    # Accept invitation (token already UUID from converter)
    path(
        "invitations/<uuid:token>/accept/",
        InvitationAcceptView.as_view(),
        name="invitation-accept",
    ),
    # Provider config (singleton per workspace — admin only)
    path(
        "workspaces/<uuid:workspace_id>/provider/",
        ProviderConfigView.as_view(),
        name="provider-config",
    ),
    path(
        "workspaces/<uuid:workspace_id>/provider/test/",
        ProviderTestView.as_view(),
        name="provider-test",
    ),
    # Public provider metadata (no auth required)
    path(
        "providers/supported/",
        SupportedProvidersView.as_view(),
        name="providers-supported",
    ),
]
