"""
Regression: Shop Renewal
Admin submits a renewal request → Superadmin approves → expiry extended.
"""
import pytest
import datetime
from unittest.mock import patch
from tests.conftest import SUPER_ADMIN_HEADERS


@pytest.mark.superadmin
class TestShopRenewal:

    def test_admin_can_view_renewal_plans(self, client, nail_admin_headers):
        """Admin can view available renewal plans."""
        r = client.get("/api/nail/admin/renewal-plans", headers=nail_admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list) or "plans" in body

    def test_admin_submits_renewal_request(self, client, nail_admin_headers, test_shop, test_plan, db):
        """Admin submits a slip for shop renewal."""
        # Set shop to expire soon
        from backend.models import NailShopSettings
        settings = db.query(NailShopSettings).filter_by(shop_id=test_shop.id).first()
        if settings:
            settings.expired_at = datetime.datetime.utcnow() + datetime.timedelta(days=5)
            db.flush()

        r = client.post(
            "/api/nail/admin/renewal-request",
            headers=nail_admin_headers,
            json={
                "plan_id": test_plan.id,
                "duration_months": 1,
                "amount": test_plan.price,
                "slip_image": "https://example.com/renewal-slip.jpg",
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (200, 201), r.text

    def test_renewal_requires_admin_auth(self, client, test_shop, test_plan):
        """Renewal request without auth is rejected."""
        r = client.post(
            "/api/nail/admin/renewal-request",
            json={
                "plan_id": test_plan.id,
                "duration_months": 1,
                "amount": test_plan.price,
                "slip_image": "https://example.com/slip.jpg",
                "shop_slug": test_shop.slug,
            },
        )
        assert r.status_code in (401, 403), r.text

    def test_superadmin_sees_renewal_queue(self, client):
        """Superadmin can view the renewal queue."""
        r = client.get("/api/nail/superadmin/renewals", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text

    def test_superadmin_approves_renewal_extends_expiry(self, client, db, test_shop):
        """Approving a renewal extends the shop's expiry date."""
        from backend.models import NailRenewalRequest, NailShopSettings

        # Set a known expiry
        settings = db.query(NailShopSettings).filter_by(shop_id=test_shop.id).first()
        original_expiry = datetime.datetime.utcnow() + datetime.timedelta(days=5)
        if settings:
            settings.expired_at = original_expiry
            db.flush()

        # Create renewal request manually
        renewal = NailRenewalRequest(
            shop_id=test_shop.id,
            duration_months=1,
            amount=990.0,
            slip_image="https://example.com/renewal.jpg",
            status="pending",
        )
        db.add(renewal)
        db.flush()

        r = client.post(
            f"/api/nail/superadmin/renewals/{renewal.id}/approve",
            headers=SUPER_ADMIN_HEADERS,
            json={"note": "Approved by QA test"},
        )
        assert r.status_code in (200, 204), r.text

        if r.status_code == 200:
            db.refresh(settings)
            if settings and settings.expired_at:
                assert settings.expired_at > original_expiry, (
                    "Expiry should be extended after approval"
                )

    def test_superadmin_rejects_renewal(self, client, db, test_shop):
        """Superadmin can reject a renewal request."""
        from backend.models import NailRenewalRequest

        renewal = NailRenewalRequest(
            shop_id=test_shop.id,
            duration_months=1,
            amount=990.0,
            slip_image="https://example.com/reject-renewal.jpg",
            status="pending",
        )
        db.add(renewal)
        db.flush()

        r = client.post(
            f"/api/nail/superadmin/renewals/{renewal.id}/reject",
            headers=SUPER_ADMIN_HEADERS,
            json={"reason": "Slip unclear"},
        )
        assert r.status_code in (200, 204), r.text

    def test_superadmin_can_manually_set_expiry(self, client, test_shop):
        """Superadmin can directly set expiry days for a shop."""
        r = client.put(
            f"/api/nail/superadmin/shops/{test_shop.id}/expiry-days",
            headers=SUPER_ADMIN_HEADERS,
            json={"days": 90},
        )
        assert r.status_code == 200, r.text

    def test_expired_shop_blocks_new_bookings(self, client, db, test_slot, test_service, test_staff):
        """An expired shop returns 403/400 on new booking attempts."""
        from backend.models import Shop, NailShopSettings
        import hashlib

        expired_shop = Shop(
            slug="expired-shop-slug",
            name="Expired Shop",
            admin_passcode_hash=hashlib.sha256(b"pass").hexdigest(),
            is_active=True,
        )
        db.add(expired_shop)
        db.flush()
        db.add(NailShopSettings(
            shop_id=expired_shop.id,
            shop_name="Expired Shop",
            expired_at=datetime.datetime.utcnow() - datetime.timedelta(days=1),  # expired
            is_active=True,
        ))
        db.flush()

        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": "expired-shop-slug",
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Blocked",
                "customer_phone": "0800006666",
            },
        )
        assert r.status_code in (400, 403, 404), r.text
