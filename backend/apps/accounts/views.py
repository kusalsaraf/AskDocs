"""Authentication views for the AskDocs API.

Provides Google OAuth2 login (token exchange) and a ``/me`` endpoint
that returns the authenticated user's profile and workspace memberships.
"""
from __future__ import annotations

from typing import Any

import requests as http_requests
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import MeSerializer
from apps.core.logging import get_logger

logger = get_logger(__name__)

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class AuthLoginThrottle(AnonRateThrottle):
    """Rate-limit login attempts to 20 per minute per IP."""

    rate = "20/minute"
    scope = "auth_login"


class MeView(APIView):
    """Return the authenticated user's profile with workspace memberships."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, **kwargs: Any) -> Response:
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


class GoogleLoginView(APIView):
    """Exchange a Google OAuth2 access_token for app JWT tokens.

    Fetches user info directly from Google, creates or updates the local
    user record, and returns a JWT access/refresh token pair.
    """

    authentication_classes: list[type] = []
    permission_classes: list[type] = []
    throttle_classes = [AuthLoginThrottle]

    def post(self, request: Request, **kwargs: Any) -> Response:
        access_token = request.data.get("access_token")
        if not access_token:
            return Response(
                {"detail": "access_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            resp = http_requests.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=10,
            )
        except http_requests.RequestException:
            logger.exception("Google userinfo request failed (network error)")
            return Response(
                {"detail": "Unable to reach Google. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if resp.status_code != 200:
            logger.warning(
                "Google userinfo returned non-200",
                extra={"status": resp.status_code},
            )
            return Response(
                {"detail": "Invalid or expired Google token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        try:
            profile = resp.json()
        except ValueError:
            logger.error("Google userinfo returned invalid JSON")
            return Response(
                {"detail": "Unexpected response from Google."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        email = profile.get("email", "").lower().strip()
        if not email:
            return Response(
                {"detail": "Google account has no email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not profile.get("email_verified", False):
            return Response(
                {"detail": "Google account email is not verified."},
                status=status.HTTP_403_FORBIDDEN,
            )

        first_name = profile.get("given_name", "")
        last_name = profile.get("family_name", "")
        avatar_url = profile.get("picture", "")

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "avatar_url": avatar_url,
                "is_active": True,
            },
        )

        if created:
            logger.info("New user registered via Google", extra={"user_id": str(user.id), "email": email})
        else:
            update_fields: list[str] = []
            if user.first_name != first_name:
                user.first_name = first_name
                update_fields.append("first_name")
            if user.last_name != last_name:
                user.last_name = last_name
                update_fields.append("last_name")
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                update_fields.append("avatar_url")
            if update_fields:
                user.save(update_fields=update_fields)

        refresh = RefreshToken.for_user(user)
        logger.info("User login successful", extra={"user_id": str(user.id)})
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )
