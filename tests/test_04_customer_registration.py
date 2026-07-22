"""
Regression: Customer Registration
Flow: send-otp → verify-otp → wallet/auth (new account with verified_token + pin)
"""
import pytest
from unittest.mock import patch, AsyncMock
from tests.conftest import TEST_EMAIL, TEST_PIN, TEST_SHOP_SLUG, make_verified_token


@pytest.mark.customer
class TestCustomerRegistration:

    def test_check_new_email_returns_no_account(self, client, test_shop):
        """Checking a new email shows the account doesn't exist yet."""
        r = client.get(
            "/api/wallet/check",
            params={"email": "brand-new@test.com", "shop_slug": test_shop.slug},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("exists") is False or body.get("has_account") is False

    def test_register_without_verified_token_fails(self, client, test_shop):
        """Registering without an OTP verified_token is rejected."""
        r = client.post(
            "/api/wallet/auth",
            json={
                "email": "newcustomer@test.com",
                "pin": TEST_PIN,
                "shop_slug": test_shop.slug,
            },
        )
        # Must not succeed without OTP verification
        assert r.status_code in (400, 401, 422), r.text

    def test_register_with_valid_verified_token(self, client, test_shop):
        """New account created when a valid verified_token is provided."""
        verified_token = make_verified_token("newreg@test.com", test_shop.id)

        r = client.post(
            "/api/wallet/auth",
            json={
                "email": "newreg@test.com",
                "verified_token": verified_token,
                "pin": TEST_PIN,
                "confirm_pin": TEST_PIN,
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "token" in body

    def test_register_pin_mismatch_fails(self, client, test_shop):
        """PIN and confirm_pin must match."""
        verified_token = make_verified_token("pinmismatch@test.com", test_shop.id)

        r = client.post(
            "/api/wallet/auth",
            json={
                "email": "pinmismatch@test.com",
                "verified_token": verified_token,
                "pin": "1234",
                "confirm_pin": "9999",
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (400, 422), r.text

    def test_register_creates_separate_account_per_shop(self, client, db, test_shop):
        """Same email in different shops creates separate isolated accounts."""
        import hashlib
        import datetime
        from backend.models import Shop, NailShopSettings

        # Create second shop
        shop2 = Shop(
            slug="shop2-slug",
            name="Shop 2",
            admin_passcode_hash=hashlib.sha256(b"pass2").hexdigest(),
            is_active=True,
        )
        db.add(shop2)
        db.flush()
        db.add(NailShopSettings(
            shop_id=shop2.id,
            shop_name="Shop 2",
            expired_at=datetime.datetime.utcnow() + datetime.timedelta(days=365),
            is_active=True,
        ))
        db.flush()

        # Register same email in shop2
        vt2 = make_verified_token("shared@test.com", shop2.id)
        r2 = client.post(
            "/api/wallet/auth",
            json={
                "email": "shared@test.com",
                "verified_token": vt2,
                "pin": TEST_PIN,
                "confirm_pin": TEST_PIN,
                "shop_slug": "shop2-slug",
            },
        )
        assert r2.status_code == 200, r2.text

        # Register same email in test_shop (shop1)
        vt1 = make_verified_token("shared@test.com", test_shop.id)
        r1 = client.post(
            "/api/wallet/auth",
            json={
                "email": "shared@test.com",
                "verified_token": vt1,
                "pin": TEST_PIN,
                "confirm_pin": TEST_PIN,
                "shop_slug": test_shop.slug,
            },
        )
        assert r1.status_code == 200, r1.text
        # Both succeed — they are isolated accounts
        assert r1.json()["token"] != r2.json()["token"]

    def test_registered_customer_shows_in_check(self, client, test_customer, test_shop):
        """After registration, check endpoint shows account exists."""
        r = client.get(
            "/api/wallet/check",
            params={"email": test_customer.email, "shop_slug": test_shop.slug},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("exists") is True or body.get("has_account") is True
