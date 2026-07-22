"""
Regression: Shop Admin Login
Flow A: Passcode → Telegram OTP → JWT
Flow B: Passcode → TOTP (Google Authenticator) → JWT
"""
import pytest
import pyotp
from unittest.mock import patch
from tests.conftest import TEST_PASSCODE, TEST_SHOP_SLUG


@pytest.mark.shop_login
class TestShopLoginOTP:
    """Admin login via Passcode + Telegram OTP."""

    def test_request_otp_wrong_passcode_fails(self, client, test_shop):
        """Wrong passcode must not send OTP."""
        r = client.post(
            "/api/nail/admin/request-otp",
            json={"passcode": "wrong-passcode", "shop_slug": test_shop.slug},
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_request_otp_correct_passcode(self, client, test_shop, db):
        """Correct passcode triggers OTP creation and returns method info."""
        with patch("backend.routes.nail._send_otp_via_telegram", return_value=None):
            r = client.post(
                "/api/nail/admin/request-otp",
                json={"passcode": TEST_PASSCODE, "shop_slug": test_shop.slug},
            )
        assert r.status_code == 200, r.text

    def test_verify_otp_wrong_code_fails(self, client, test_shop, db):
        """Wrong OTP code returns 401/400."""
        # First request OTP to create a session
        with patch("backend.routes.nail._send_otp_via_telegram", return_value=None):
            client.post(
                "/api/nail/admin/request-otp",
                json={"passcode": TEST_PASSCODE, "shop_slug": test_shop.slug},
            )

        r = client.post(
            "/api/nail/admin/verify-otp",
            json={"otp_code": "000000", "shop_slug": test_shop.slug},
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_verify_otp_correct_code_returns_token(self, client, test_shop, db):
        """Correct OTP returns a valid access_token."""
        from backend.models import OTPSession
        import secrets

        # Manually create an OTP session in the test DB
        otp_code = "123456"
        import datetime
        NAIL_ADMIN_SESSION_ID = 1000 + test_shop.id
        session = OTPSession(
            session_id=NAIL_ADMIN_SESSION_ID,
            telegram_id=999,
            otp_code=otp_code,
            is_used=False,
            created_at=datetime.datetime.utcnow(),
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
        )
        db.add(session)
        db.flush()

        r = client.post(
            "/api/nail/admin/verify-otp",
            json={"otp_code": otp_code, "shop_slug": test_shop.slug},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body

    def test_admin_token_grants_access(self, client, nail_admin_headers):
        """A valid admin JWT grants access to protected endpoints."""
        r = client.get("/api/nail/admin/bookings", headers=nail_admin_headers)
        assert r.status_code == 200, r.text

    def test_expired_token_returns_401(self, client, test_shop):
        """An expired or invalid token is rejected."""
        r = client.get(
            "/api/nail/admin/bookings",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert r.status_code in (401, 403), r.text

    def test_shop_inactive_blocks_login(self, client, db):
        """Inactive shop cannot obtain an OTP."""
        import hashlib
        from backend.models import Shop, NailShopSettings
        passcode_hash = hashlib.sha256(TEST_PASSCODE.encode()).hexdigest()
        inactive = Shop(
            slug="inactive-shop",
            name="Inactive Shop",
            admin_passcode_hash=passcode_hash,
            is_active=False,
        )
        db.add(inactive)
        db.flush()
        settings = NailShopSettings(
            shop_id=inactive.id,
            shop_name="Inactive Shop",
            is_active=False,
        )
        db.add(settings)
        db.flush()

        with patch("backend.routes.nail._send_otp_via_telegram", return_value=None):
            r = client.post(
                "/api/nail/admin/request-otp",
                json={"passcode": TEST_PASSCODE, "shop_slug": "inactive-shop"},
            )
        assert r.status_code in (400, 403, 404), r.text


@pytest.mark.shop_login
class TestShopLoginTOTP:
    """Admin login via Passcode + Google Authenticator TOTP."""

    def test_totp_login_wrong_passcode_fails(self, client, test_shop_with_totp):
        """Wrong passcode rejected even with correct TOTP."""
        r = client.post(
            "/api/nail/admin/login/totp",
            json={
                "passcode": "wrong",
                "totp_code": "000000",
                "shop_slug": test_shop_with_totp.slug,
            },
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_totp_login_wrong_code_fails(self, client, test_shop_with_totp):
        """Wrong TOTP code rejected."""
        r = client.post(
            "/api/nail/admin/login/totp",
            json={
                "passcode": TEST_PASSCODE,
                "totp_code": "000000",
                "shop_slug": test_shop_with_totp.slug,
            },
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_totp_login_correct_code_returns_token(self, client, test_shop_with_totp):
        """Correct passcode + valid TOTP returns access_token."""
        totp = pyotp.TOTP(test_shop_with_totp.totp_secret)
        current_code = totp.now()

        r = client.post(
            "/api/nail/admin/login/totp",
            json={
                "passcode": TEST_PASSCODE,
                "totp_code": current_code,
                "shop_slug": test_shop_with_totp.slug,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body

    def test_request_otp_on_totp_shop_returns_method_totp(self, client, test_shop_with_totp):
        """request-otp on a TOTP shop tells the client to use TOTP method."""
        r = client.post(
            "/api/nail/admin/request-otp",
            json={"passcode": TEST_PASSCODE, "shop_slug": test_shop_with_totp.slug},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("method") == "totp"
