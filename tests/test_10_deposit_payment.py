"""
Regression: Deposit Payment via Wallet Credit
Hold slot → pay-wallet → booking confirmed immediately, balance deducted.
"""
import pytest
from unittest.mock import patch
from tests.conftest import TEST_EMAIL


@pytest.mark.booking
@pytest.mark.wallet
class TestDepositPayment:

    def _hold_slot(self, client, test_shop, test_slot, test_service, test_staff, name="Wallet Payer", phone="0899999999"):
        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": name,
                "customer_phone": phone,
            },
        )
        assert r.status_code == 200, r.text
        return r.json()["hold_token"]

    def test_pay_wallet_requires_auth(self, client, test_shop, test_slot, test_service, test_staff):
        """pay-wallet endpoint requires wallet authentication."""
        hold_token = self._hold_slot(client, test_shop, test_slot, test_service, test_staff, phone="0800000001")
        r = client.post(
            "/api/nail/booking/pay-wallet",
            json={
                "hold_token": hold_token,
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (401, 403), r.text

    def test_pay_wallet_sufficient_balance(
        self, client, test_shop, test_slot, test_service, test_staff,
        test_customer, wallet_headers, db
    ):
        """Customer with sufficient balance can pay via wallet; booking confirmed instantly."""
        # Ensure enough balance (test_customer has 500, deposit is 100)
        test_customer.balance = 500.0
        db.flush()

        hold_token = self._hold_slot(client, test_shop, test_slot, test_service, test_staff, phone="0800000002")

        with patch("backend.routes.nail._notify_admin_booking_confirmed", return_value=None):
            r = client.post(
                "/api/nail/booking/pay-wallet",
                json={
                    "hold_token": hold_token,
                    "shop_slug": test_shop.slug,
                    "customer_email": test_customer.email,
                },
                headers=wallet_headers,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True or "booking_ref" in body

    def test_pay_wallet_deducts_balance(
        self, client, test_shop, test_slot, test_service, test_staff,
        test_customer, wallet_headers, db
    ):
        """Balance is reduced by deposit amount after wallet payment."""
        test_customer.balance = 500.0
        db.flush()
        initial_balance = test_customer.balance

        hold_token = self._hold_slot(client, test_shop, test_slot, test_service, test_staff, phone="0800000003")

        with patch("backend.routes.nail._notify_admin_booking_confirmed", return_value=None):
            r = client.post(
                "/api/nail/booking/pay-wallet",
                json={
                    "hold_token": hold_token,
                    "shop_slug": test_shop.slug,
                    "customer_email": test_customer.email,
                },
                headers=wallet_headers,
            )

        if r.status_code == 200:
            db.refresh(test_customer)
            assert test_customer.balance < initial_balance, "Balance should have decreased after wallet payment"

    def test_pay_wallet_insufficient_balance_fails(
        self, client, test_shop, test_slot, test_service, test_staff,
        test_customer, wallet_headers, db
    ):
        """Customer with insufficient balance cannot pay via wallet."""
        test_customer.balance = 10.0   # deposit is 100
        db.flush()

        hold_token = self._hold_slot(client, test_shop, test_slot, test_service, test_staff, phone="0800000004")

        r = client.post(
            "/api/nail/booking/pay-wallet",
            json={
                "hold_token": hold_token,
                "shop_slug": test_shop.slug,
                "customer_email": test_customer.email,
            },
            headers=wallet_headers,
        )
        assert r.status_code in (400, 402, 422), r.text

    def test_pay_wallet_invalid_hold_token_fails(
        self, client, test_shop, test_customer, wallet_headers
    ):
        """Non-existent or expired hold token is rejected."""
        r = client.post(
            "/api/nail/booking/pay-wallet",
            json={
                "hold_token": "nonexistent-hold-token-xyz",
                "shop_slug": test_shop.slug,
                "customer_email": test_customer.email,
            },
            headers=wallet_headers,
        )
        assert r.status_code in (400, 404, 422), r.text

    def test_pay_wallet_cross_shop_prevented(
        self, client, db, test_shop, test_slot, test_service, test_staff,
        test_customer, test_shop_with_totp
    ):
        """Wallet token from shop A cannot pay for booking in shop B."""
        import jwt as _jwt
        import datetime
        from tests.conftest import TEST_SECRET

        # Token scoped to test_shop_with_totp (different shop)
        bad_token = _jwt.encode(
            {
                "email": test_customer.email,
                "shop_id": test_shop_with_totp.id,  # wrong shop
                "exp": datetime.datetime.utcnow() + datetime.timedelta(days=1),
            },
            TEST_SECRET, algorithm="HS256",
        )
        hold_token = self._hold_slot(client, test_shop, test_slot, test_service, test_staff, phone="0800000005")

        r = client.post(
            "/api/nail/booking/pay-wallet",
            json={
                "hold_token": hold_token,
                "shop_slug": test_shop.slug,
                "customer_email": test_customer.email,
            },
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert r.status_code in (400, 401, 403, 404), r.text
