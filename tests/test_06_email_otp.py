"""
Regression: Email OTP Flow
send-otp → verify-otp → verified_token
"""
import pytest
from unittest.mock import patch, MagicMock
from tests.conftest import TEST_EMAIL, TEST_SHOP_SLUG


@pytest.mark.customer
class TestEmailOTP:

    def test_send_otp_creates_session(self, client, test_shop):
        """send-otp for a valid email creates an OTP session and returns session_token."""
        with patch("backend.email_service.send_otp_email", new_callable=AsyncMock):
            r = client.post(
                "/api/wallet/send-otp",
                json={"email": "otp-test@test.com", "mode": "login", "shop_slug": test_shop.slug},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "session_token" in body

    def test_send_otp_invalid_email_rejected(self, client, test_shop):
        """Malformed email is rejected by input validation."""
        r = client.post(
            "/api/wallet/send-otp",
            json={"email": "not-an-email", "mode": "login", "shop_slug": test_shop.slug},
        )
        assert r.status_code in (400, 422), r.text

    def test_send_otp_cooldown_enforced(self, client, test_shop):
        """Sending OTP twice within the cooldown window is rate-limited."""
        with patch("backend.email_service.send_otp_email", new_callable=AsyncMock):
            r1 = client.post(
                "/api/wallet/send-otp",
                json={"email": "cooldown@test.com", "mode": "login", "shop_slug": test_shop.slug},
            )
            assert r1.status_code == 200

            r2 = client.post(
                "/api/wallet/send-otp",
                json={"email": "cooldown@test.com", "mode": "login", "shop_slug": test_shop.slug},
            )
            # Second request within 60s should be rate-limited
            assert r2.status_code in (429, 400), (
                f"Expected rate-limit, got {r2.status_code}: {r2.text}"
            )

    def test_verify_otp_wrong_code_fails(self, client, test_shop):
        """Wrong OTP code returns an error."""
        with patch("backend.email_service.send_otp_email", new_callable=AsyncMock):
            send_r = client.post(
                "/api/wallet/send-otp",
                json={"email": "verify-test@test.com", "mode": "login", "shop_slug": test_shop.slug},
            )
        session_token = send_r.json().get("session_token", "fake-session")

        # wallet.py uses "otp" field, not "otp_code"
        r = client.post(
            "/api/wallet/verify-otp",
            json={"session_token": session_token, "otp": "000000"},
        )
        assert r.status_code in (400, 401), r.text

    def test_verify_otp_correct_code_returns_verified_token(self, client, db, test_shop):
        """Correct OTP code returns a verified_token."""
        import datetime
        import secrets
        from backend.models import EmailOTPSession

        otp_code = "654321"
        session_token = secrets.token_hex(16)
        session = EmailOTPSession(
            session_token=session_token,
            email="direct@test.com",
            otp_code=otp_code,
            is_used=False,
            created_at=datetime.datetime.utcnow(),
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
        )
        db.add(session)
        db.flush()

        # wallet.py uses "otp" field, not "otp_code"
        r = client.post(
            "/api/wallet/verify-otp",
            json={
                "session_token": session_token,
                "otp": otp_code,
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "verified_token" in body

    def test_otp_cannot_be_reused(self, client, db, test_shop):
        """Used OTP session cannot be verified again."""
        import datetime
        import secrets
        from backend.models import EmailOTPSession

        otp_code = "111222"
        session_token = secrets.token_hex(16)
        session = EmailOTPSession(
            session_token=session_token,
            email="reuse@test.com",
            otp_code=otp_code,
            is_used=True,  # already used
            created_at=datetime.datetime.utcnow(),
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
        )
        db.add(session)
        db.flush()

        r = client.post(
            "/api/wallet/verify-otp",
            json={"session_token": session_token, "otp": otp_code, "shop_slug": test_shop.slug},
        )
        assert r.status_code in (400, 401), r.text

    def test_expired_otp_rejected(self, client, db, test_shop):
        """Expired OTP session is rejected."""
        import datetime
        import secrets
        from backend.models import EmailOTPSession

        otp_code = "999888"
        session_token = secrets.token_hex(16)
        session = EmailOTPSession(
            session_token=session_token,
            email="expired@test.com",
            otp_code=otp_code,
            is_used=False,
            created_at=datetime.datetime.utcnow() - datetime.timedelta(hours=2),
            expires_at=datetime.datetime.utcnow() - datetime.timedelta(hours=1),  # expired
        )
        db.add(session)
        db.flush()

        r = client.post(
            "/api/wallet/verify-otp",
            json={"session_token": session_token, "otp": otp_code, "shop_slug": test_shop.slug},
        )
        assert r.status_code in (400, 401), r.text
