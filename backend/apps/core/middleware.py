"""HTTP middleware for AskDocs.

* ``RequestIDMiddleware`` — assigns a UUID to every request and stores it in
  the thread-local logging context for correlation.
* ``SecurityHeadersMiddleware`` — adds CSP, Referrer-Policy, and
  Permissions-Policy to all responses.
"""
from __future__ import annotations

import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from apps.core.logging import set_request_id


class RequestIDMiddleware:
    """Assign a unique request ID and propagate it via logging + response header."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request_id = str(uuid.uuid4())
        request.META["REQUEST_ID"] = request_id
        set_request_id(request_id)
        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware:
    """Inject browser security headers if not already set by the application."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if "Content-Security-Policy" not in response:
            response["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com; "
                "style-src 'self' 'unsafe-inline' https://accounts.google.com; "
                "frame-src https://accounts.google.com; "
                "connect-src 'self' https://accounts.google.com https://www.googleapis.com; "
                "img-src 'self' data: https: blob:; "
                "font-src 'self' data:; "
                "object-src 'none'; "
                "base-uri 'self'"
            )
        if "Referrer-Policy" not in response:
            response["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if "Permissions-Policy" not in response:
            response["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response
