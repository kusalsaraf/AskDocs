"""Custom exception classes and a unified DRF exception handler.

All API error responses use a consistent JSON envelope::

    {"error": {"code": "...", "message": "...", "details": {}}}

The ``custom_exception_handler`` normalizes both ``AskDocsError``
subclasses and standard DRF exceptions into this format.
"""
import logging
from typing import Any

from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class AskDocsError(Exception):
    """Base class for all application-specific errors."""

    status_code = 500
    default_detail = "Something went wrong."
    default_code = "internal_error"

    def __init__(self, detail: str | None = None, code: str | None = None) -> None:
        self.detail = detail or self.default_detail
        self.code = code or self.default_code
        super().__init__(self.detail)


class ValidationError(AskDocsError):
    status_code = 400
    default_code = "validation_error"
    default_detail = "Validation failed."


class AuthenticationError(AskDocsError):
    status_code = 401
    default_code = "authentication_required"
    default_detail = "Authentication is required."


class PermissionDenied(AskDocsError):
    status_code = 403
    default_code = "permission_denied"
    default_detail = "You do not have permission to perform this action."


class NotFound(AskDocsError):
    status_code = 404
    default_code = "not_found"
    default_detail = "The requested resource was not found."


class RateLimitExceeded(AskDocsError):
    status_code = 429
    default_code = "rate_limit_exceeded"
    default_detail = "Rate limit exceeded. Please try again later."


class WorkspaceAccessDenied(AskDocsError):
    status_code = 403
    default_code = "workspace_access_denied"
    default_detail = "You do not have access to this workspace."


class InsufficientWorkspaceRole(AskDocsError):
    status_code = 403
    default_code = "insufficient_workspace_role"
    default_detail = "Your role in this workspace does not allow this action."


class CannotRemoveSoleAdmin(AskDocsError):
    status_code = 400
    default_code = "cannot_remove_sole_admin"
    default_detail = "Cannot remove or demote the sole admin of a workspace."


class CannotDeletePersonalWorkspace(AskDocsError):
    status_code = 400
    default_code = "cannot_delete_personal_workspace"
    default_detail = "Personal workspaces cannot be deleted."


class InvitationExpired(AskDocsError):
    status_code = 400
    default_code = "invitation_expired"
    default_detail = "This invitation has expired."


class InvitationAlreadyAccepted(AskDocsError):
    status_code = 400
    default_code = "invitation_already_accepted"
    default_detail = "This invitation has already been accepted."


# Maps DRF exception types to structured error codes
_DRF_CODE_MAP: dict[type, str] = {
    drf_exceptions.ValidationError: "validation_error",
    drf_exceptions.AuthenticationFailed: "authentication_failed",
    drf_exceptions.NotAuthenticated: "authentication_required",
    drf_exceptions.PermissionDenied: "permission_denied",
    drf_exceptions.NotFound: "not_found",
    drf_exceptions.Throttled: "rate_limit_exceeded",
    drf_exceptions.MethodNotAllowed: "method_not_allowed",
    drf_exceptions.UnsupportedMediaType: "unsupported_media_type",
}


def _flatten_drf_detail(detail: Any) -> str:
    """Convert DRF's nested error detail into a single user-facing string."""
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        return "; ".join(str(item) for item in detail)
    if isinstance(detail, dict):
        parts = []
        for field, messages in detail.items():
            if isinstance(messages, list):
                msg = ", ".join(str(m) for m in messages)
            else:
                msg = str(messages)
            parts.append(f"{field}: {msg}" if field != "non_field_errors" else msg)
        return "; ".join(parts)
    return str(detail)


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Normalize all API exceptions into a consistent JSON error envelope.

    Handles both ``AskDocsError`` subclasses and standard DRF exceptions
    (validation, permission, auth, throttling, not-found). Uses WARNING
    for 4xx and ERROR for 5xx to reduce alert fatigue.
    """
    if isinstance(exc, AskDocsError):
        log_level = logging.WARNING if exc.status_code < 500 else logging.ERROR
        logger.log(
            log_level,
            "Application error: %s",
            exc.detail,
            extra={"code": exc.code, "status_code": exc.status_code},
        )
        return Response(
            {
                "error": {
                    "code": exc.code,
                    "message": exc.detail,
                    "details": {},
                }
            },
            status=exc.status_code,
        )

    response = drf_exception_handler(exc, context)
    if response is not None:
        code = _DRF_CODE_MAP.get(type(exc), "error")
        detail = getattr(exc, "detail", str(exc))
        message = _flatten_drf_detail(detail)

        field_details = {}
        if isinstance(detail, dict) and isinstance(exc, drf_exceptions.ValidationError):
            field_details = detail

        logger.warning(
            "DRF error: %s",
            message,
            extra={"code": code, "status_code": response.status_code},
        )
        response.data = {
            "error": {
                "code": code,
                "message": message,
                "details": field_details,
            }
        }
    return response
