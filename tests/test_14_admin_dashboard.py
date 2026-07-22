"""
Regression: Admin Dashboard
Finance summary, order management, bookings list, announcements, banners.
"""
import pytest
from unittest.mock import patch
from tests.conftest import TEST_PASSCODE


@pytest.mark.dashboard
class TestAdminDashboard:

    # ── Store Admin (original digital product store) ─────────────────────────

    def test_store_admin_finance_summary(self, client, db):
        """Store admin finance summary endpoint is accessible."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.get(
            "/api/admin/finance/summary",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text

    def test_store_admin_orders_list(self, client, db):
        """Store admin orders list is accessible."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.get(
            "/api/admin/orders",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text

    def test_store_admin_products_list(self, client, db):
        """Store admin products list is accessible."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.get(
            "/api/admin/products",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text

    def test_store_admin_logs(self, client, db):
        """Admin action logs endpoint is accessible."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.get(
            "/api/admin/logs",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200, r.text

    def test_store_admin_no_auth_rejected(self, client):
        """Store admin endpoints without auth return 401/403."""
        r = client.get("/api/admin/orders")
        assert r.status_code in (401, 403), r.text

    # ── Nail Shop Admin ───────────────────────────────────────────────────────

    def test_nail_admin_dashboard(self, client, nail_admin_headers, test_shop):
        """Nail shop admin dashboard stats are accessible."""
        r = client.get("/api/nail/admin/dashboard", headers=nail_admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        # Should include some stats
        assert isinstance(body, dict)

    def test_nail_admin_bookings_list(self, client, nail_admin_headers, test_shop):
        """Admin can list all bookings for their shop."""
        r = client.get("/api/nail/admin/bookings", headers=nail_admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_nail_admin_customers_list(self, client, nail_admin_headers, test_shop):
        """Admin can list customers for their shop."""
        r = client.get("/api/nail/admin/customers", headers=nail_admin_headers)
        assert r.status_code == 200, r.text

    def test_nail_admin_settings_get(self, client, nail_admin_headers, test_shop):
        """Admin can retrieve shop settings."""
        r = client.get("/api/nail/admin/settings", headers=nail_admin_headers)
        assert r.status_code == 200, r.text

    def test_nail_admin_settings_update(self, client, nail_admin_headers, test_shop):
        """Admin can update shop settings."""
        r = client.put(
            "/api/nail/admin/settings",
            headers=nail_admin_headers,
            json={"shop_name": "Updated Test Shop"},
        )
        assert r.status_code == 200, r.text

    # ── Announcements ─────────────────────────────────────────────────────────

    def test_public_announcements(self, client):
        """Public announcements endpoint returns a list."""
        r = client.get("/api/announcements")
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)

    def test_admin_create_announcement(self, client, db):
        """Store admin can create an announcement."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.post(
            "/api/admin/announcements",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Test Announcement",
                "content": "This is a test announcement.",
                "is_active": True,
            },
        )
        assert r.status_code in (200, 201), r.text

    # ── Banners ───────────────────────────────────────────────────────────────

    def test_public_banners(self, client):
        """Public banners endpoint returns a list."""
        r = client.get("/api/banners")
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)

    def test_admin_create_banner(self, client, db):
        """Store admin can create a banner."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.post(
            "/api/admin/banners",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Test Banner",
                "subtitle": "QA regression",
                "image_url": "https://example.com/banner.jpg",
                "is_active": True,
            },
        )
        assert r.status_code in (200, 201), r.text

    # ── Healthcheck ───────────────────────────────────────────────────────────

    def test_healthz_returns_ok(self, client):
        """Health check endpoint returns 200."""
        r = client.get("/api/healthz")
        assert r.status_code == 200, r.text

    # ── Finance entries ───────────────────────────────────────────────────────

    def test_admin_add_finance_entry(self, client, db):
        """Admin can add a finance entry."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.post(
            "/api/admin/finance/entries",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "amount": 500.0,
                "description": "Test income",
                "entry_type": "income",
                "admin_name": "QA Bot",
            },
        )
        assert r.status_code in (200, 201), r.text

    def test_admin_set_finance_goal(self, client, db):
        """Admin can set a monthly profit goal."""
        from backend.auth import create_admin_token
        token = create_admin_token(telegram_id=1, shop_id=1)
        r = client.put(
            "/api/admin/finance/goal",
            headers={"Authorization": f"Bearer {token}"},
            json={"goal": 50000.0},
        )
        assert r.status_code == 200, r.text
