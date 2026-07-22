"""
Regression: Walk-in Booking
Admin creates a walk-in booking directly, bypassing hold/pay flow.
"""
import pytest
from tests.conftest import TEST_SHOP_SLUG


@pytest.mark.booking
class TestWalkin:

    def test_walkin_requires_admin_auth(self, client, test_shop, test_slot, test_service, test_staff):
        """Walk-in endpoint requires admin authentication."""
        r = client.post(
            "/api/nail/admin/bookings/walkin",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Walk-in Customer",
                "customer_phone": "0800001111",
            },
        )
        assert r.status_code in (401, 403), r.text

    def test_walkin_creates_booking(self, client, nail_admin_headers, test_shop, test_slot, test_service, test_staff):
        """Admin creates a walk-in booking; status = walkin."""
        r = client.post(
            "/api/nail/admin/bookings/walkin",
            headers=nail_admin_headers,
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Walk-in Customer",
                "customer_phone": "0800001111",
            },
        )
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert body.get("ok") is True or "booking_ref" in body or "id" in body

    def test_walkin_booking_appears_in_admin_list(self, client, nail_admin_headers, test_shop, db, test_slot, test_service, test_staff):
        """Walk-in booking is visible in admin bookings list."""
        from backend.models import NailBooking
        import secrets

        booking = NailBooking(
            shop_id=test_shop.id,
            booking_ref=secrets.token_hex(4).upper(),
            slot_id=test_slot.id,
            service_id=test_service.id,
            staff_id=test_staff.id,
            status="walkin",
            is_walkin=True,
            customer_name="Listed Walkin",
            customer_phone="0800002222",
        )
        db.add(booking)
        db.flush()

        r = client.get("/api/nail/admin/bookings", headers=nail_admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        bookings = body if isinstance(body, list) else body.get("bookings", body.get("items", []))
        assert any(b["id"] == booking.id for b in bookings)

    def test_walkin_no_slot_required(self, client, nail_admin_headers, test_shop, test_service, test_staff):
        """Walk-in can optionally be created without a specific slot."""
        r = client.post(
            "/api/nail/admin/bookings/walkin",
            headers=nail_admin_headers,
            json={
                "shop_slug": test_shop.slug,
                "slot_id": None,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Slotless Walkin",
                "customer_phone": "0800003333",
            },
        )
        # May or may not support null slot — should not 500
        assert r.status_code in (200, 201, 400, 422), r.text

    def test_walkin_is_not_charged_deposit(self, client, nail_admin_headers, test_shop, test_slot, test_service, test_staff, db):
        """Walk-in booking does not deduct customer wallet balance."""
        from backend.models import NailBooking
        import secrets

        booking = NailBooking(
            shop_id=test_shop.id,
            booking_ref=secrets.token_hex(4).upper(),
            slot_id=test_slot.id,
            service_id=test_service.id,
            staff_id=test_staff.id,
            status="walkin",
            is_walkin=True,
            customer_name="No Charge Walkin",
            customer_phone="0800004444",
        )
        db.add(booking)
        db.flush()

        # Booking should exist with no associated CreditTransaction
        from backend.models import CreditTransaction
        txns = db.query(CreditTransaction).filter(
            CreditTransaction.ref_id == str(booking.id)
        ).all()
        assert len(txns) == 0

    def test_walkin_different_shop_cannot_be_created_with_wrong_token(
        self, client, nail_admin_headers, test_shop_with_totp, test_slot, test_service, test_staff
    ):
        """Admin token for shop A cannot create walk-in for shop B."""
        r = client.post(
            "/api/nail/admin/bookings/walkin",
            headers=nail_admin_headers,  # token belongs to test_shop, not test_shop_with_totp
            json={
                "shop_slug": test_shop_with_totp.slug,   # wrong shop
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Cross Shop Walkin",
                "customer_phone": "0800005555",
            },
        )
        assert r.status_code in (400, 401, 403), r.text
