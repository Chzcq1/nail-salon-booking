"""
Central rate-limiter instance for the CSC API.

All route modules import `limiter` from here and decorate their endpoints:

    from backend.limiter import limiter
    from fastapi import Request

    @router.post("/some/auth/endpoint")
    @limiter.limit("5/minute")
    async def handler(request: Request, ...):
        ...

SlowAPI requires the decorated function to accept `request: Request` as a
parameter so it can extract the client IP.  FastAPI automatically injects
the current request when it sees the `Request` type hint — no change to
the caller is needed.

The limiter is attached to `app.state.limiter` in main.py, and a custom
exception handler returns a JSON 429 body with a `Retry-After` header
(instead of SlowAPI's default plain-text response).
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded


def _get_real_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For for Render/proxy deployments.

    Render.com (and most reverse proxies) appends the true client IP as the
    *first* value in X-Forwarded-For.  Falling back to request.client.host
    handles direct connections (local dev, tests).
    """
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Singleton limiter — imported by all route modules ────────────────────────
limiter = Limiter(key_func=_get_real_ip)


# ── Custom 429 handler ────────────────────────────────────────────────────────
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a JSON 429 with a Retry-After header instead of SlowAPI's plain-text default."""
    response = JSONResponse(
        status_code=429,
        content={"detail": "คำขอเยอะเกินไป กรุณารอสักครู่แล้วลองใหม่"},
    )
    # Let SlowAPI inject the standard Retry-After (and X-RateLimit-*) headers
    response = request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
    return response
