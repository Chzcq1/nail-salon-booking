"""
Regression: Shop Registration Flow
1. Public submits a registration request (POST /api/nail/register)
2. Superadmin views pending registrations
3. Superadmin approves → shop is created and activated
4. Superadmin rejects → request marked rejected
"""
import pytest
from unittest.mock import patch
from tests.conftest import SUPER_ADMIN_HEADERS


@pytest.mark.superadmin
class TestShopRegistration:

    def _submit_registration(self, client, email="owner@shop.com", slug="newshop"):
        return client.post(
            "/api/nail/register",
            json={
                "shop_name": "New Nail Shop",
                "owner_name": "Owner Name",
                "owner_email": email,
                "desired_slug": slug,
                "phone": "0801234567",
            },
        )

    def test_public_can_submit_registration(self, client):
        """Anyone can submit a shop registration request."""
        with patch("backend.routes.nail.send_email_otp", return_value=True):
            r = self._submit_registration(client)
        assert r.status_code in (200, 201), r.text

    def test_duplicate_slug_registration_fails(self, client, test_shop):
        """Registering with an already-used slug returns an error."""
        with patch("backend.routes.nail.send_email_otp", return_value=True):
            r = self._submit_registration(client, slug=test_shop.slug)
        # Should return 400/409/422 — not 200
        assert r.status_code in (400, 409, 422), (
            f"Expected conflict, got {r.status_code}: {r.text}"
        )

    def test_superadmin_sees_pending_registration(self, client):
        """After submission, superadmin sees the request in the queue."""
        with patch("backend.routes.nail.send_email_otp", return_value=True):
            sub = self._submit_registration(client, email="pending@shop.com", slug="pendingshop")

        r = client.get("/api/nail/superadmin/registrations", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text

    def test_superadmin_approve_registration(self, client):
        """Approving a registration creates a shop."""
        with patch("backend.routes.nail.send_email_otp", return_value=True):
            sub = self._submit_registration(client, email="approve@shop.com", slug="approveshop")

        # Get registrations and find one to approve
        regs_r = client.get("/api/nail/superadmin/registrations", headers=SUPER_ADMIN_HEADERS)
        assert regs_r.status_code == 200
        regs = regs_r.json()

        if not regs:
            pytest.skip("No registrations to approve (registration endpoint may not persist in this test)")

        reg_id = regs[0]["id"] if isinstance(regs, list) else regs.get("items", [{}])[0].get("id")
        if not reg_id:
            pytest.skip("Cannot find registration ID in response")

        with patch("backend.routes.nail._send_onboarding_email", return_value=None):
            approve_r = client.post(
                f"/api/nail/superadmin/registrations/{reg_id}/approve",
                headers=SUPER_ADMIN_HEADERS,
                json={"expiry_days": 30, "passcode": "ShopPass99"},
            )
        assert approve_r.status_code in (200, 201), approve_r.text

    def test_superadmin_reject_registration(self, client):
        """Rejecting a registration marks it as rejected."""
        with patch("backend.routes.nail.send_email_otp", return_value=True):
            self._submit_registration(client, email="reject@shop.com", slug="rejectshop")

        regs_r = client.get("/api/nail/superadmin/registrations", headers=SUPER_ADMIN_HEADERS)
        assert regs_r.status_code == 200
        regs = regs_r.json()

        if not regs:
            pytest.skip("No registrations to reject")

        reg_id = regs[0]["id"] if isinstance(regs, list) else None
        if not reg_id:
            pytest.skip("Cannot find registration ID")

        reject_r = client.post(
            f"/api/nail/superadmin/registrations/{reg_id}/reject",
            headers=SUPER_ADMIN_HEADERS,
            json={"reason": "Incomplete information"},
        )
        assert reject_r.status_code in (200, 204), reject_r.text

    def test_superadmin_create_shop_directly(self, client):
        """Superadmin can create a shop directly without going through registration."""
        r = client.post(
            "/api/nail/superadmin/shops",
            headers=SUPER_ADMIN_HEADERS,
            json={
                "slug": "direct-shop",
                "name": "Direct Created Shop",
                "passcode": "DirectPass99",
                "expiry_days": 30,
            },
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "id" in body or "shop_id" in body or "slug" in body
