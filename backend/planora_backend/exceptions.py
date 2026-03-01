"""Global DRF exception handler — returns consistent error envelope."""
from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def global_exception_handler(exc, context):
    """
    Wrap every API error in a uniform shape:

        {
          "error": {
            "code": "validation_error",
            "message": "human-readable summary",
            "details": { ... }     # optional, present for validation errors
          }
        }
    """
    # Let DRF do its default processing first (handles Auth, Throttle, etc.)
    response = exception_handler(exc, context)

    if response is None:
        # Unhandled exception — log and return 500
        logger.exception(
            "unhandled_exception view=%s",
            _view_name(context),
        )
        return Response(
            {
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                }
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Normalise into the envelope
    code = _error_code(exc, response)
    message = _error_message(exc, response)
    details = _error_details(exc, response)

    body: dict = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details

    response.data = body
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _view_name(context) -> str:
    view = context.get("view")
    if view is None:
        return "unknown"
    cls = getattr(view, "__class__", None)
    return f"{cls.__module__}.{cls.__qualname__}" if cls else str(view)


def _error_code(exc, response) -> str:
    if isinstance(exc, ValidationError):
        return "validation_error"
    code = getattr(exc, "default_code", None)
    if code:
        return str(code)
    return {
        400: "bad_request",
        401: "not_authenticated",
        403: "permission_denied",
        404: "not_found",
        405: "method_not_allowed",
        429: "throttled",
    }.get(response.status_code, f"error_{response.status_code}")


def _error_message(exc, response) -> str:
    if isinstance(exc, ValidationError):
        return "Validation failed."
    detail = getattr(exc, "detail", None)
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list) and detail:
        return str(detail[0])
    return str(exc) if exc else "Unknown error"


def _error_details(exc, response) -> dict | list | None:
    if isinstance(exc, ValidationError):
        return exc.detail  # field-level errors dict or list
    return None
