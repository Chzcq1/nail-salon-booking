import hashlib
import hmac
import time
from typing import Optional

import jwt as _jwt
from jwt.exceptions import ExpiredSignatureError as _JWTExpired, InvalidTokenError as _JWTInvalid
import bcrypt as _bcrypt

from backend.config import get_settings

# ── Admin JWT constants ───────────────────────────────────────────────────────
_ADMIN_TOKEN_ALG = "HS256"
_ADMIN_TOKEN_EXPIRE_SECONDS = 86400 * 7   # 7 days
_ADMIN_TOKEN_ISSUER = "csc-admin"


def verify_telegram_login(data: dict) -> bool:
    """Verify Telegram login widget payload.

    Uses HMAC-SHA256 with SHA256(bot_token) as the key — per Telegram Bot API spec.
    Returns False immediately if bot_token is not configured.
    """
    settings = get_settings()
    if not settings.bot_token:
        return False

    check_hash = data.pop("hash", None)
    if not check_hash:
        return False

    auth_date = int(data.get("auth_date", 0))
    if time.time() - auth_date > 86400:
        return False

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(data.items())
    )

    secret_key = hashlib.sha256(settings.bot_token.encode()).digest()
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    return hmac.compare_digest(computed_hash, check_hash)


def create_admin_token(telegram_id: int, shop_id: int = 1) -> str:
    """Issue a signed admin JWT (HS256, 7-day expiry, iss=csc-admin).

    Replaces the old itsdangerous URLSafeTimedSerializer approach.
    Callers: admin.py verify-otp, nail.py verify-otp / totp-login.
    """
    s = get_settings()
    if not s.secret_key:
        raise RuntimeError("SECRET_KEY ไม่ได้ตั้งค่า — ไม่สามารถออก admin token ได้")
    now = int(time.time())
    payload = {
        "telegram_id": telegram_id,
        "role": "admin",
        "shop_id": shop_id,
        "iss": _ADMIN_TOKEN_ISSUER,
        "iat": now,
        "exp": now + _ADMIN_TOKEN_EXPIRE_SECONDS,
    }
    return _jwt.encode(payload, s.secret_key, algorithm=_ADMIN_TOKEN_ALG)


def verify_admin_token(token: str) -> Optional[dict]:
    """Verify a signed admin JWT.

    Returns the decoded payload dict on success, or None on any failure
    (expired, invalid signature, missing required claims, wrong issuer).

    Required claims: exp, iat, iss (issuer must be 'csc-admin').
    Algorithm pinned to HS256 — rejects tokens signed with other algorithms.
    """
    s = get_settings()
    if not s.secret_key or not token:
        return None
    try:
        data = _jwt.decode(
            token,
            s.secret_key,
            algorithms=[_ADMIN_TOKEN_ALG],
            options={"require": ["exp", "iat", "iss"]},
            issuer=_ADMIN_TOKEN_ISSUER,
        )
        return data
    except _JWTExpired:
        # Token expired — caller raises 401 "กรุณาล็อกอินใหม่"
        return None
    except _JWTInvalid:
        # Bad signature, wrong algorithm, missing/wrong claims, wrong issuer
        return None
    except Exception:
        return None


def generate_otp() -> str:
    import secrets
    return str(secrets.randbelow(900000) + 100000)


def hash_passcode(passcode: str) -> str:
    """bcrypt hash of a passcode.  New hashes always use bcrypt."""
    return _bcrypt.hashpw(passcode.encode(), _bcrypt.gensalt()).decode()


def verify_passcode(plain: str, hashed: str) -> bool:
    """Verify plain passcode against stored hash.

    Supports both:
    - Legacy SHA-256 hashes (64 lowercase hex chars, no $ prefix) — backward compat
    - bcrypt hashes (start with $2b$ / $2a$ / $2y$) — new default

    Existing shops with SHA-256 hashes continue to work.  When their passcode is
    next set via the admin UI, it will automatically be stored as bcrypt.
    """
    if not plain or not hashed:
        return False
    # Detect legacy SHA-256: exactly 64 lowercase hex chars, no dollar-sign prefix
    if len(hashed) == 64 and hashed.isalnum() and not hashed.startswith("$"):
        computed = hashlib.sha256(plain.encode()).hexdigest()
        return hmac.compare_digest(computed, hashed)
    # bcrypt path
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False
