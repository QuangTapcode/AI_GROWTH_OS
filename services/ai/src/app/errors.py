"""Uniform error envelope from contracts/README.md §1.

Every non-2xx response has a stable ``code``/``message``/``request_id``. The
optional ``details`` member is present only when there are safe validation or
conflict details to return; auth errors must not disclose schema information.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


REQUEST_ID_HEADER = "X-Request-ID"
_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,120}$")

_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "INVALID_REQUEST",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}


class APIError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details


def request_id_of(request: Request) -> str:
    return getattr(request.state, "request_id", None) or str(uuid4())


def error_response(request: Request, status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    request_id = request_id_of(request)
    error: dict[str, Any] = {"code": code, "message": message, "request_id": request_id}
    if details is not None:
        error["details"] = details
    return JSONResponse(
        status_code=status_code,
        content={"error": error},
        headers={REQUEST_ID_HEADER: request_id},
    )


def _field_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    # Echo location/type/message only; never echo the submitted value back.
    return [
        {
            "field": ".".join(str(part) for part in error.get("loc", ()) if part != "body"),
            "type": error.get("type"),
            "message": error.get("msg"),
        }
        for error in exc.errors()
    ]


def install_error_handling(app: FastAPI, *, max_request_bytes: int, logger: logging.Logger) -> None:
    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        supplied = request.headers.get(REQUEST_ID_HEADER, "")
        request.state.request_id = supplied if _REQUEST_ID_PATTERN.match(supplied) else str(uuid4())
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > max_request_bytes:
            return error_response(request, 413, "PAYLOAD_TOO_LARGE", f"Request body exceeds {max_request_bytes} bytes")
        response = await call_next(request)
        response.headers.setdefault(REQUEST_ID_HEADER, request.state.request_id)
        return response

    @app.exception_handler(APIError)
    async def api_error(request: Request, exc: APIError) -> JSONResponse:
        return error_response(request, exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = _field_errors(exc)
        if any(item["type"] == "json_invalid" for item in details):
            return error_response(request, 422, "INVALID_JSON", "Request body is not valid JSON", details)
        return error_response(request, 422, "INVALID_REQUEST", "Request does not match the schema", details)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else code
        return error_response(request, exc.status_code, code, message)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled AI service error")
        return error_response(request, 500, "INTERNAL_ERROR", "AI service failed to handle the request")
