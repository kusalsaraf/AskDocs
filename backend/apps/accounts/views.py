import logging
from typing import Any

import requests as http_requests
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import MeSerializer

logger = logging.getLogger(__name__)

GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, **kwargs: Any) -> Response:
        serializer = MeSerializer(request.user)
        return Response(serializer.data)


class GoogleLoginView(APIView):
    """
    Exchange a Google OAuth2 access_token for app JWT tokens.
    Fetches user info directly from Google — no allauth signup redirect.
    """
    authentication_classes = []
    permission_classes = []

    def post(self, request: Request, **kwargs: Any) -> Response:
        access_token = request.data.get("access_token")
        if not access_token:
            return Response(
                {"detail": "access_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch user profile from Google
        resp = http_requests.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning("Google userinfo failed: %s %s", resp.status_code, resp.text)
            return Response(
                {"detail": "Invalid or expired Google token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        profile = resp.json()
        email = profile.get("email", "").lower().strip()
        if not email:
            return Response(
                {"detail": "Google account has no email address."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        first_name = profile.get("given_name", "")
        last_name = profile.get("family_name", "")

        # Create or retrieve the user
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first_name,
                "last_name": last_name,
                "is_active": True,
            },
        )
        if not created and (user.first_name != first_name or user.last_name != last_name):
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=["first_name", "last_name"])

        # Issue JWT tokens
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )
