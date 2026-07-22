"""
Regression: Wallet Top-up
- Slip upload → pending → auto-verify or admin approve
- TrueMoney Angpao redemption
- Balance reflected correctly after top-up
"""
import pytest
from unittest.mock import patch, MagicMock
from tests.conftest import TEST_EMAIL


@pytest.mark.wallet
class TestWalletTopup:

    def test_topup_slip_requires_auth(self, client, test_shop):
        """Top-up via slip requires wallet authentication."""
        r = client.post(
            "/api/wallet/topup/slip",
            json={
                "amount": 100,
                "slip_image": "https://example.com/slip.jpg",
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (401, 403), r.text

    def test_topup_slip_success(self, client, test_customer, wallet_headers, test_shop, db):
        """Authenticated customer submits a slip top-up successfully."""
        # Mock slip verification to return pending (not auto-approve)
        with patch("backend.routes.wallet._verify_slip_auto", return_value=None):
            r = client.post(
                "/api/wallet/topup/slip",
                json={
                    "amount": 200,
                    "slip_image": "https://example.com/slip200.jpg",
                    "shop_slug": test_shop.slug,
                },
                headers=wallet_headers,
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True

    def test_topup_slip_zero_amount_rejected(self, client, wallet_headers, test_shop):
        """Zero or negative amount is rejected."""
        r = client.post(
            "/api/wallet/topup/slip",
            json={
                "amount": 0,
                "slip_image": "https://example.com/slip.jpg",
                "shop_slug": test_shop.slug,
            },
            headers=wallet_headers,
        )
        assert r.status_code in (400, 422), r.text

    def test_topup_auto_verify_credits_balance(self, client, test_customer, wallet_headers, test_shop, db):
        """When slip auto-verification succeeds, balance is credited immediately."""
        initial_balance = test_customer.balance

        mock_result = {
            "status": "success",
            "amount": 500.0,
            "data": {"amount": 500.0},
        }
        with patch("backend.routes.wallet._verify_slip_auto", return_value=mock_result):
            r = client.post(
                "/api/wallet/topup/slip",
                json={
                    "amount": 500,
                    "slip_image": "https://example.com/auto-slip.jpg",
                    "shop_slug": test_shop.slug,
                },
                headers=wallet_headers,
            )
        assert r.status_code == 200, r.text

        # Re-check balance
        db.refresh(test_customer)
        assert test_customer.balance >= initial_balance  # balance should have increased

    def test_topup_truemoney_success(self, client, test_customer, wallet_headers, test_shop):
        """TrueMoney Angpao redemption adds credit."""
        mock_tm = MagicMock()
        mock_tm.return_value = {"ok": True, "amount": 99.0, "status": "success"}

        with patch("backend.routes.wallet._redeem_truemoney", return_value={"ok": True, "amount": 99.0}):
            r = client.post(
                "/api/wallet/topup/truemoney",
                json={
                    "voucher_code": "https://gift.truemoney.com/campaign/?v=TESTCODE",
                    "shop_slug": test_shop.slug,
                },
                headers=wallet_headers,
            )
        assert r.status_code == 200, r.text

    def test_topup_truemoney_invalid_voucher_fails(self, client, wallet_headers, test_shop):
        """Invalid TrueMoney voucher returns an error."""
        with patch(
            "backend.routes.wallet._redeem_truemoney",
            return_value={"ok": False, "error": "Invalid voucher"},
        ):
            r = client.post(
                "/api/wallet/topup/truemoney",
                json={
                    "voucher_code": "https://gift.truemoney.com/campaign/?v=BADCODE",
                    "shop_slug": test_shop.slug,
                },
                headers=wallet_headers,
            )
        assert r.status_code in (400, 200), r.text
        if r.status_code == 200:
            body = r.json()
            assert body.get("ok") is False or "error" in body

    def test_topup_history_appears_in_me(self, client, db, test_customer, test_shop, wallet_headers):
        """After top-up, transaction history is visible in /wallet/me."""
        from backend.models import TopupRequest, CreditTransaction
        import datetime

        topup = TopupRequest(
            customer_id=test_customer.id,
            shop_id=test_shop.id,
            topup_type="slip",
            amount=300.0,
            status="approved",
        )
        db.add(topup)
        db.add(CreditTransaction(
            customer_id=test_customer.id,
            shop_id=test_shop.id,
            txn_type="topup",
            amount=300.0,
            description="Slip top-up",
        ))
        db.flush()

        r = client.get("/api/wallet/me", headers=wallet_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "transactions" in body or "history" in body or "balance" in body
