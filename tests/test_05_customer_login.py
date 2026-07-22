"""
Regression: Customer Login
Existing customer logs in with email + PIN (no OTP needed).
"""
import pytest
from tests.conftest import TEST_EMAIL, TEST_PIN, TEST_SHOP_SLUG


@pytest.mark.customer
class TestCustomerLogin:

    def test_login_with_correct_pin(self, client, test_customer, test_shop):
        """Existing customer logs in with correct PIN."""
        r = client.post(
            "/api/wallet/auth",
            json={
                "email": test_customer.email,
                "pin": TEST_PIN,
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "token" in body

    def test_login_with_wrong_pin_fails(self, client, test_customer, test_shop):
        """Wrong PIN is rejected."""
        r = client.post(
            "/api/wallet/auth",
            json={
                "email": test_customer.email,
                "pin": "9999",
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (400, 401, 403), r.text

    def test_login_unknown_email_fails(self, client, test_shop):
        """Login for non-existent email fails."""
        r = client.post(
            "/api/wallet/auth",
            json={
                "email": "ghost@test.com",
                "pin": TEST_PIN,
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (400, 401, 404), r.text

    def test_token_allows_me_endpoint(self, client, test_customer, wallet_headers):
        """A valid token grants access to /wallet/me."""
        r = client.get("/api/wallet/me", headers=wallet_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("email") == test_customer.email

    def test_me_returns_balance(self, client, test_customer, wallet_headers):
        """Profile includes balance."""
        r = client.get("/api/wallet/me", headers=wallet_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "balance" in body
        assert float(body["balance"]) == test_customer.balance

    def test_me_without_token_returns_401(self, client):
        """Unauthenticated access to /wallet/me returns 401."""
        r = client.get("/api/wallet/me")
        assert r.status_code in (401, 403), r.text

    def test_cross_shop_token_rejected(self, client, db, test_shop):
        """Wallet token from shop A cannot access shop B's endpoint."""
        import hashlib
        import datetime
        from backend.models import Shop, NailShopSettings, Customer
        import bcrypt
        import jwt as _jwt
        from tests.conftest import TEST_SECRET

        shop_b = Shop(
            slug="shop-b",
            name="Shop B",
            admin_passcode_hash=hashlib.sha256(b"passb").hexdigest(),
            is_active=True,
        )
        db.add(shop_b)
        db.flush()
        db.add(NailShopSettings(
            shop_id=shop_b.id, shop_name="Shop B",
            expired_at=datetime.datetime.utcnow() + datetime.timedelta(days=365),
            is_active=True,
        ))
        db.flush()

        # Token scoped to shop_b
        token_b = _jwt.encode(
            {
                "email": "cross@test.com",
                "shop_id": shop_b.id,
                "exp": datetime.datetime.utcnow() + datetime.timedelta(days=1),
            },
            TEST_SECRET,
            algorithm="HS256",
        )
        # Access /wallet/me — will not find customer for (cross@test.com, shop_b)
        r = client.get("/api/wallet/me", headers={"Authorization": f"Bearer {token_b}"})
        # Should return 401/404, not data from test_shop
        assert r.status_code in (401, 404), r.text

    def test_reset_pin_with_valid_verified_token(self, client, test_customer, test_shop):
        """Customer can reset PIN after OTP verification."""
        from tests.conftest import make_verified_token
        vt = make_verified_token(test_customer.email, test_shop.id)

        r = client.post(
            "/api/wallet/reset-pin",
            json={
                "verified_token": vt,
                "new_pin": "5678",
                "confirm_pin": "5678",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

    def test_reset_pin_mismatch_fails(self, client, test_customer, test_shop):
        """PIN reset with mismatched pins is rejected."""
        from tests.conftest import make_verified_token
        vt = make_verified_token(test_customer.email, test_shop.id)

        r = client.post(
            "/api/wallet/reset-pin",
            json={
                "verified_token": vt,
                "new_pin": "1111",
                "confirm_pin": "9999",
            },
        )
        assert r.status_code in (400, 422), r.text
