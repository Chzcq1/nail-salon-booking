---
name: Nail Salon Booking System
description: Architecture decisions, key files, and constraints for the nail salon booking system built on top of the existing FastAPI+PostgreSQL stack
---

# Nail Salon Booking System

## Stack
Built on the existing infrastructure — FastAPI + PostgreSQL (Supabase) + React + Vite. No new infra needed.

## Key files
- `backend/routes/nail.py` — all nail API routes (prefix `/api/nail/`)
- `backend/models.py` — NailShopSettings, NailService, NailStaff, NailTimeSlot, NailBooking, NailGallery (appended at bottom)
- `artifacts/store/src/pages/BookingPage.tsx` — customer booking page (Gen Z pink UI)
- `artifacts/store/src/pages/NailAdminPage.tsx` — admin: bookings, slots, gallery, services, settings
- `artifacts/store/src/App.tsx` — `/` → BookingPage, `/nail-admin` → NailAdminPage, `/shop` → old StoreFront

## Slot locking (race condition prevention)
`hold_slot()` uses `SELECT ... with_for_update()` on the NailTimeSlot row before counting active bookings. This prevents two concurrent requests from both passing the capacity check for `max_bookings=1` slots.

**Why:** Without FOR UPDATE, two simultaneous requests read the same count (0) and both insert NailBooking rows, creating a double-booking.

**How to apply:** Any endpoint that creates/modifies NailBooking records for a slot should lock the slot row first.

## Admin auth
`_check_admin()` uses `hmac.compare_digest()` for timing-safe comparison.

**Critical:** If `ADMIN_PASSCODE` env var is unset, all admin routes return 503 (not silently accept empty token). Always set this in Render/environment.

## Rental expiry
`nail_shop_settings.expired_at` (TIMESTAMPTZ) — if set and in the past, the public `/api/nail/settings` returns `{"expired": true}`, and BookingPage shows a white lock screen.

## Deposit with random cents
Base deposit (admin-configurable, default 200 ฿) + random 1–99 satang. e.g., 200.47 ฿. Helps admin identify individual transfers without a formal payment reference.

## DB migrations
All nail tables are created via `_run_migrations()` in `backend/main.py`. The migration runner uses `conn.rollback()` on each failure to prevent cascade abort. Tables are also created by SQLAlchemy `create_all()` on startup.

## Colors (BookingPage)
- Primary: `#FF6B9D` (candy pink)
- Deep: `#E0457B`
- Pale bg: `#FFF0F7`
- Border: `#FFD6EC`
- Font: Prompt (Google Fonts, loaded inline)
