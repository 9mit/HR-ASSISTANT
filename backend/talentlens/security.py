"""Security middleware, validation helpers, and optional API-key auth."""
from __future__ import annotations

import logging
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .settings import settings
from .utils import sanitize_filename

logger = logging.getLogger(__name__)

ALLOWED_UPLOAD_EXTENSIONS = frozenset({".pdf", ".docx", ".txt"})
GITHUB_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,38})$")
VALID_DECISIONS = frozenset({
    "shortlist",
    "review",
    "rejected",
    "needs_clarification",
    "salary_mismatch",
    "invalid",
    "under_consideration",
})


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory per-IP rate limiting for API routes."""

    def __init__(self, app, max_requests: int, window_seconds: int):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next: Callable):
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        window_start = now - self.window_seconds
        hits = [t for t in self._hits[client_ip] if t > window_start]
        if len(hits) >= self.max_requests:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": "Too many requests. Please try again later."},
            )
        hits.append(now)
        self._hits[client_ip] = hits
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply production security headers on every response."""

    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "0"
        if settings.ENABLE_HSTS:
            response.headers["Strict-Transport-Security"] = (
                f"max-age={settings.HSTS_MAX_AGE}; includeSubDomains"
            )
        csp = settings.CONTENT_SECURITY_POLICY
        if csp:
            response.headers["Content-Security-Policy"] = csp
        return response


def require_api_key(request: Request) -> None:
    """Optional API-key gate when API_KEY is configured."""
    if not settings.API_KEY:
        return
    provided = request.headers.get("X-API-Key") or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not provided or not _constant_time_equals(provided, settings.API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )


def api_key_dependency(request: Request) -> None:
    require_api_key(request)


ApiKeyDep = Depends(api_key_dependency)


def _constant_time_equals(a: str, b: str) -> bool:
    if len(a) != len(b):
        return False
    result = 0
    for x, y in zip(a.encode(), b.encode()):
        result |= x ^ y
    return result == 0


def safe_upload_path(uploads_dir: Path, stored_name: str) -> Path:
    """Resolve an upload path and reject directory traversal."""
    safe_name = sanitize_filename(stored_name)
    base = uploads_dir.resolve()
    target = (base / safe_name).resolve()
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=400, detail="Invalid file reference")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return target


def validate_github_username(username: str | None) -> str | None:
    if not username:
        return None
    if not GITHUB_USERNAME_RE.fullmatch(username):
        return None
    reserved = {"settings", "features", "about", "explore", "trending", "pricing", "topics"}
    if username.lower() in reserved:
        return None
    return username


def validate_upload_file(filename: str | None, size: int) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Missing filename")
    if size <= 0:
        raise HTTPException(status_code=400, detail="Empty file upload")
    if size > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {settings.MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
        )
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_UPLOAD_EXTENSIONS))}",
        )
    return sanitize_filename(filename)


def validate_decision(decision: str) -> str:
    normalized = (decision or "").strip().lower()
    if normalized not in VALID_DECISIONS:
        raise HTTPException(status_code=400, detail="Invalid decision value")
    return normalized


def validate_role(role: str) -> str:
    cleaned = (role or "").strip()
    if not cleaned or len(cleaned) > 200:
        raise HTTPException(status_code=400, detail="Role must be 1-200 characters")
    return cleaned


def validate_salary_range(salary_min: float, salary_max: float) -> tuple[float, float]:
    if salary_min < 0 or salary_max < 0:
        raise HTTPException(status_code=400, detail="Salary values cannot be negative")
    if salary_max < salary_min:
        raise HTTPException(status_code=400, detail="salary_max must be >= salary_min")
    if salary_max > 1_000_000_000:
        raise HTTPException(status_code=400, detail="Salary range exceeds allowed maximum")
    return salary_min, salary_max


def validate_note_content(notes: str) -> str:
    cleaned = (notes or "").strip()
    if len(cleaned) > 10_000:
        raise HTTPException(status_code=400, detail="Notes exceed maximum length")
    return cleaned


def public_error_detail(exc: Exception) -> str:
    """Avoid leaking stack traces or internal paths in production."""
    if settings.DEBUG:
        return str(exc)
    return "An internal error occurred. Please try again or contact support."


def register_exception_handlers(app) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": public_error_detail(exc)},
        )
