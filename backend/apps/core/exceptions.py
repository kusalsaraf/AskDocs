import logging
from typing import Any

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class AskDocsError(Exception):
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


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Handle ``AskDocsError`` subclasses with structured JSON responses.

    Uses WARNING for client errors (4xx) and ERROR for server errors (5xx)
    to avoid alert fatigue from expected user-facing failures.
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
    return drf_exception_handler(exc, context)
