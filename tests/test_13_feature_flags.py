"""
Regression: Feature Flags
- allow_ref_image: shows ref_image field in hold response when enabled
- Superadmin can enable/disable flags per shop
"""
import pytest
from tests.conftest import SUPER_ADMIN_HEADERS


@pytest.mark.feature_flags
class TestFeatureFlags:

    def test_get_features_returns_flags(self, client, test_shop):
        """Superadmin can fetch feature flags for a shop."""
        r = client.get(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "allow_ref_image" in body

    def test_allow_ref_image_default_is_false(self, client, test_shop):
        """allow_ref_image is False by default for new shops."""
        r = client.get(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("allow_ref_image") is False

    def test_enable_allow_ref_image(self, client, test_shop, db):
        """Superadmin can enable allow_ref_image for a shop."""
        r = client.put(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
            json={"allow_ref_image": True},
        )
        assert r.status_code == 200, r.text

        # Verify it persisted
        get_r = client.get(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
        )
        assert get_r.json().get("allow_ref_image") is True

    def test_disable_allow_ref_image(self, client, test_shop, db):
        """Superadmin can disable allow_ref_image."""
        # Enable first
        client.put(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
            json={"allow_ref_image": True},
        )

        # Then disable
        r = client.put(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
            json={"allow_ref_image": False},
        )
        assert r.status_code == 200, r.text

        get_r = client.get(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
        )
        assert get_r.json().get("allow_ref_image") is False

    def test_features_require_superadmin_key(self, client, test_shop):
        """Feature flag endpoints require superadmin key."""
        r = client.get(f"/api/nail/superadmin/shops/{test_shop.id}/features")
        assert r.status_code == 403, r.text

    def test_features_nonexistent_shop_returns_404(self, client):
        """Feature flag for non-existent shop returns 404."""
        r = client.get(
            "/api/nail/superadmin/shops/99999/features",
            headers=SUPER_ADMIN_HEADERS,
        )
        assert r.status_code == 404, r.text

    def test_hold_response_includes_flag_when_enabled(
        self, client, test_shop, test_slot, test_service, test_staff, db
    ):
        """When allow_ref_image=True, booking hold response includes the flag."""
        from backend.models import NailShopSettings

        settings = db.query(NailShopSettings).filter_by(shop_id=test_shop.id).first()
        if settings:
            settings.allow_ref_image = True
            db.flush()

        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Flag Tester",
                "customer_phone": "0800007777",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("allow_ref_image") is True

    def test_hold_response_no_flag_when_disabled(
        self, client, test_shop, test_slot, test_service, test_staff, db
    ):
        """When allow_ref_image=False, flag is absent or False in hold response."""
        from backend.models import NailShopSettings

        settings = db.query(NailShopSettings).filter_by(shop_id=test_shop.id).first()
        if settings:
            settings.allow_ref_image = False
            db.flush()

        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Flag Off Tester",
                "customer_phone": "0800008888",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("allow_ref_image") in (False, None)

    def test_invalid_feature_key_rejected(self, client, test_shop):
        """Unknown feature keys are ignored or rejected gracefully."""
        r = client.put(
            f"/api/nail/superadmin/shops/{test_shop.id}/features",
            headers=SUPER_ADMIN_HEADERS,
            json={"totally_fake_feature": True},
        )
        # Should not 500 — either 200 (ignored) or 422 (rejected)
        assert r.status_code in (200, 400, 422), r.text
