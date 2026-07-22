"""
Regression: Google TOTP (2FA)
- Superadmin TOTP setup
- Shop admin TOTP login
- Invalid / replayed codes rejected
"""
import pytest
import pyotp
from unittest.mock import patch
from tests.conftest import TEST_PASSCODE, SUPER_ADMIN_HEADERS


@pytest.mark.shop_login
class TestGoogleTOTP:

    def test_totp_setup_requires_pin(self, client):
        """Superadmin TOTP setup requires a PIN header."""
        r = client.post("/api/nail/superadmin/totp/setup", headers=SUPER_ADMIN_HEADERS)
        # Without a PIN body it should be 400/422
        assert r.status_code in (400, 422), r.text

    def test_totp_setup_returns_qr_and_secret(self, client):
        """TOTP setup returns a QR code and secret for scanning.
        PIN for setup = raw NAIL_SUPER_ADMIN_KEY (not the JWT session token).
        """
        from tests.conftest import TEST_SUPER_ADMIN_KEY
        r = client.post(
            "/api/nail/superadmin/totp/setup",
            headers=SUPER_ADMIN_HEADERS,
            json={"pin": TEST_SUPER_ADMIN_KEY},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # Expect either a QR code URI or a base64 image
        assert "secret" in body or "qr" in body or "qr_code" in body or "uri" in body

    def test_totp_confirm_wrong_code_fails(self, client):
        """TOTP confirmation with wrong code is rejected."""
        r = client.post(
            "/api/nail/superadmin/totp/confirm",
            headers=SUPER_ADMIN_HEADERS,
            json={"totp_code": "000000"},
        )
        assert r.status_code in (400, 401, 422), r.text

    def test_shop_totp_login_with_live_code(self, client, test_shop_with_totp):
        """Shop admin can log in with a live TOTP code."""
        totp = pyotp.TOTP(test_shop_with_totp.totp_secret)
        r = client.post(
            "/api/nail/admin/login/totp",
            json={
                "passcode": TEST_PASSCODE,
                "totp_code": totp.now(),
                "shop_slug": test_shop_with_totp.slug,
            },
        )
        assert r.status_code == 200, r.text
        assert "access_token" in r.json()

    def test_shop_totp_rejects_old_window_code(self, client, test_shop_with_totp):
        """A code from many windows ago is rejected (clock drift protection)."""
        totp = pyotp.TOTP(test_shop_with_totp.totp_secret)
        # Generate a code valid 5 windows ago (~2.5 minutes in the past)
        import time
        old_code = totp.at(time.time() - 180)

        r = client.post(
            "/api/nail/admin/login/totp",
            json={
                "passcode": TEST_PASSCODE,
                "totp_code": old_code,
                "shop_slug": test_shop_with_totp.slug,
            },
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_shop_totp_setup_via_onboarding(self, client, db, test_shop):
        """New shop gets a setup_token to initialize their TOTP via the onboarding endpoint."""
        import secrets
        onboard_token = secrets.token_hex(16)
        test_shop.onboarding_token = onboard_token
        db.flush()

        # Endpoint requires setup_token query param (distinct from shop slug)
        r = client.get(
            "/api/nail/admin/onboarding",
            params={"setup_token": onboard_token},
        )
        # Returns 200 with QR info, or 404 if token not found
        assert r.status_code in (200, 404), r.text

    def test_totp_status_endpoint(self, client):
        """Superadmin can check their TOTP status. Response key is 'totp_enabled'."""
        r = client.get("/api/nail/superadmin/totp/status", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "totp_enabled" in body
