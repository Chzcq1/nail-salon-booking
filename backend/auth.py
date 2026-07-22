import hashlib
import hmac
import time
from typing import Optional
from itsdangerous import URLSafeTimedSerializer
import bcrypt as _bcrypt
from backend.config import get_settings

settings = get_settings()


def verify_telegram_login(data: dict) -> bool:
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
    s = URLSafeTimedSerializer(settings.secret_key)
    return s.dumps({"telegram_id": telegram_id, "role": "admin", "shop_id": shop_id})


def verify_admin_token(token: str) -> Optional[dict]:
    s = URLSafeTimedSerializer(settings.secret_key)
    try:
        data = s.loads(token, max_age=86400 * 7)
        return data
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
