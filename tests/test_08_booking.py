"""
Regression: Booking Flow
Hold → Pay Deposit (slip) → Admin Confirm
Also tests: slot listing, status check, hold release.
"""
import pytest
from unittest.mock import patch
from tests.conftest import TEST_EMAIL, TEST_SHOP_SLUG


@pytest.mark.booking
class TestBookingFlow:

    def test_get_available_slots(self, client, test_shop, test_slot):
        """Public can list available slots for a shop."""
        import datetime
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        r = client.get(
            "/api/nail/slots",
            params={"shop_slug": test_shop.slug, "date": tomorrow},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list) or "slots" in body

    def test_get_services(self, client, test_shop, test_service):
        """Public can list services for a shop."""
        r = client.get("/api/nail/services", params={"shop_slug": test_shop.slug})
        assert r.status_code == 200, r.text
        services = r.json()
        assert isinstance(services, list)
        assert any(s["id"] == test_service.id for s in services)

    def test_hold_slot_success(self, client, test_shop, test_slot, test_service, test_staff):
        """Customer can hold an available slot."""
        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Test Customer",
                "customer_phone": "0801234567",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "hold_token" in body

    def test_hold_unavailable_slot_fails(self, client, test_shop, test_slot, test_service, test_staff, db):
        """Holding a slot that's already fully booked fails."""
        test_slot.max_bookings = 1
        test_slot.is_available = False
        db.flush()

        r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Test Customer",
                "customer_phone": "0801234567",
            },
        )
        assert r.status_code in (400, 409, 422), r.text

    def test_pay_deposit_with_slip_url(self, client, test_shop, test_slot, test_service, test_staff, db):
        """Customer can submit payment proof after holding a slot."""
        # First hold the slot
        hold_r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Pay Customer",
                "customer_phone": "0809999999",
            },
        )
        assert hold_r.status_code == 200, hold_r.text
        hold_token = hold_r.json()["hold_token"]

        with patch("backend.routes.nail._notify_admin_new_booking", return_value=None):
            pay_r = client.post(
                "/api/nail/booking/pay",
                json={
                    "hold_token": hold_token,
                    "payment_type": "transfer",
                    "slip_image": "https://example.com/slip.jpg",
                    "shop_slug": test_shop.slug,
                },
            )
        assert pay_r.status_code == 200, pay_r.text
        body = pay_r.json()
        assert body.get("ok") is True or "booking_ref" in body

    def test_check_booking_status(self, client, test_shop, test_slot, test_service, test_staff, db):
        """Customer can check booking status using hold_token."""
        hold_r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Status Check",
                "customer_phone": "0811111111",
            },
        )
        assert hold_r.status_code == 200
        hold_token = hold_r.json()["hold_token"]

        r = client.get(f"/api/nail/booking/status/{hold_token}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "status" in body

    def test_release_hold(self, client, test_shop, test_slot, test_service, test_staff):
        """Customer can release a hold before paying."""
        hold_r = client.post(
            "/api/nail/booking/hold",
            json={
                "shop_slug": test_shop.slug,
                "slot_id": test_slot.id,
                "service_id": test_service.id,
                "staff_id": test_staff.id,
                "customer_name": "Release Customer",
                "customer_phone": "0822222222",
            },
        )
        assert hold_r.status_code == 200
        hold_token = hold_r.json()["hold_token"]

        r = client.delete(
            "/api/nail/booking/hold",
            json={"hold_token": hold_token, "shop_slug": test_shop.slug},
        )
        assert r.status_code in (200, 204), r.text

    def test_admin_can_confirm_booking(self, client, nail_admin_headers, test_shop, db, test_slot, test_service, test_staff):
        """Admin can confirm a pending booking."""
        from backend.models import NailBooking
        import secrets

        booking = NailBooking(
            shop_id=test_shop.id,
            booking_ref=secrets.token_hex(4).upper(),
            slot_id=test_slot.id,
            service_id=test_service.id,
            staff_id=test_staff.id,
            status="pending_payment",
            customer_name="Admin Confirm",
            customer_phone="0833333333",
        )
        db.add(booking)
        db.flush()

        r = client.put(
            f"/api/nail/admin/bookings/{booking.id}",
            headers=nail_admin_headers,
            json={"status": "confirmed"},
        )
        assert r.status_code == 200, r.text

    def test_admin_can_refund_booking(self, client, nail_admin_headers, test_shop, db, test_slot, test_service, test_staff):
        """Admin can refund a booking."""
        from backend.models import NailBooking
        import secrets

        booking = NailBooking(
            shop_id=test_shop.id,
            booking_ref=secrets.token_hex(4).upper(),
            slot_id=test_slot.id,
            service_id=test_service.id,
            staff_id=test_staff.id,
            status="confirmed",
            customer_name="Refund Customer",
            customer_phone="0844444444",
        )
        db.add(booking)
        db.flush()

        r = client.post(
            f"/api/nail/admin/bookings/{booking.id}/refund",
            headers=nail_admin_headers,
            json={"reason": "Customer cancelled"},
        )
        assert r.status_code in (200, 204), r.text

    def test_booking_public_status_by_ref(self, client, test_shop, db, test_slot, test_service, test_staff):
        """Public can check booking status using booking ref + phone."""
        from backend.models import NailBooking
        import secrets

        ref = secrets.token_hex(4).upper()
        booking = NailBooking(
            shop_id=test_shop.id,
            booking_ref=ref,
            slot_id=test_slot.id,
            service_id=test_service.id,
            staff_id=test_staff.id,
            status="confirmed",
            customer_name="Public Check",
            customer_phone="0855555555",
        )
        db.add(booking)
        db.flush()

        r = client.get(
            "/api/nail/booking/public-status",
            params={"shop_slug": test_shop.slug, "booking_ref": ref, "phone": "0855555555"},
        )
        assert r.status_code == 200, r.text
