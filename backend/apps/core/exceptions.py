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


def custom_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    if isinstance(exc, AskDocsError):
        logger.error(
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
