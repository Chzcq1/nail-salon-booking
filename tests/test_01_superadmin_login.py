"""
Regression: Superadmin Login & Authentication
Tests that superadmin endpoints reject wrong keys and accept the correct one.
"""
import pytest
from tests.conftest import SUPER_ADMIN_HEADERS, TEST_SUPER_ADMIN_KEY


@pytest.mark.superadmin
class TestSuperadminAuth:
    def test_superadmin_no_key_returns_403(self, client):
        """Without x-super-admin-key header, all superadmin endpoints return 403."""
        r = client.get("/api/nail/superadmin/shops")
        assert r.status_code == 403, r.text

    def test_superadmin_wrong_key_returns_403(self, client):
        """Wrong superadmin key returns 403."""
        r = client.get(
            "/api/nail/superadmin/shops",
            headers={"x-super-admin-key": "wrong-key-here"},
        )
        assert r.status_code == 403, r.text

    def test_superadmin_correct_key_returns_200(self, client):
        """Correct superadmin key allows access."""
        r = client.get("/api/nail/superadmin/shops", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text

    def test_superadmin_shops_list_is_list(self, client):
        """Shop list endpoint returns a list."""
        r = client.get("/api/nail/superadmin/shops", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list) or "shops" in body or "items" in body

    def test_superadmin_registrations_accessible(self, client):
        """Registration queue is accessible with correct key."""
        r = client.get("/api/nail/superadmin/registrations", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text

    def test_superadmin_renewals_accessible(self, client):
        """Renewal queue is accessible with correct key."""
        r = client.get("/api/nail/superadmin/renewals", headers=SUPER_ADMIN_HEADERS)
        assert r.status_code == 200, r.text

    def test_superadmin_cannot_access_nail_admin_endpoints(self, client, test_shop):
        """Superadmin key does NOT grant access to shop-admin endpoints."""
        r = client.get(
            "/api/nail/admin/bookings",
            headers=SUPER_ADMIN_HEADERS,
        )
        # Should require a proper admin JWT, not superadmin key
        assert r.status_code in (401, 403, 422), (
            f"Expected auth failure, got {r.status_code}: {r.text}"
        )
