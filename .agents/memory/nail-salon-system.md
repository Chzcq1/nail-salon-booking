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

## Tab components must actually exist
`NailAdminPage.tsx` routes tabs via `{tab === "x" && <XTab .../>}`. Found `staff`/`renewal` tabs referencing `StaffTab`/`RenewalTab` that were never defined anywhere — a silent `ReferenceError` crash (blank/black screen) on click, easy to miss since TS/build didn't catch it in this file's config.

**Why:** No test coverage or CI clicks through every admin tab, so an incomplete tab wire-up shipped unnoticed.

**How to apply:** When a user reports a specific admin page going blank/black, grep the tab-routing switch for the component name and confirm it's actually defined (not just imported/referenced) before assuming an infra/DB cause.

## Weekly recurring slot templates
`NailSlotTemplate` (one row per weekday 0–6) drives `_ensure_slots_for_date()`, which auto-generates that day's `NailTimeSlot` rows **only if the date has zero existing slots** — preserves any manual admin edit for that specific date going forward.

**Why:** Admin needs to override individual days (holidays, special hours) without the weekly template silently re-generating and wiping their edits.

**How to apply:** Any new code touching slot generation must keep the "skip if any slot row exists for that date" guard, and must take the `pg_advisory_xact_lock(hashtext('nail_slot_gen:'+date))` before the existence check to avoid duplicate-row races under concurrent requests for the same date.

## Wallet-linked payments need row-locked balance mutations
Any endpoint that deducts from `Customer.balance` (e.g. nail booking wallet payment) must `SELECT ... FOR UPDATE` the customer row before reading/checking/deducting balance, in addition to locking whatever resource (booking/order) it's paying for.

**Why:** Locking only the booking/order row is not enough — two concurrent payment requests from the same customer can still both read the same pre-deduction balance and both succeed, causing a double-spend/under-deduction.

**How to apply:** Lock both rows (the resource being paid for, and the customer) in the same transaction before any balance comparison, and require an explicit reject with the shortfall amount if balance is insufficient — no partial-payment fallback for wallet-authenticated flows unless explicitly requested.

## Colors (BookingPage)
- Primary: `#FF6B9D` (candy pink)
- Deep: `#E0457B`
- Pale bg: `#FFF0F7`
- Border: `#FFD6EC`
- Font: Prompt (Google Fonts, loaded inline)
