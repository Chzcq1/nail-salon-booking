---
name: OTP cleanup policy
description: How and when OTP sessions are purged from otp_sessions / email_otp_sessions, and how consume is made atomic
---

## Rule (updated)
OTP rows are now deleted **immediately** at two points, in all three OTP flows
(`backend/routes/wallet.py` email OTP, `backend/routes/admin.py` telegram admin OTP,
`backend/routes/nail.py` per-shop telegram admin OTP):

1. **On new OTP request** — all prior rows for that identity (email or telegram_id) are
   deleted before inserting the new one, so requesting a fresh code immediately invalidates
   any old unused code instead of leaving it around.
2. **On successful verify** — the row is deleted right away (not just marked `is_used=True`).

**Why:** rows were previously kept around (marked used, or left unused after a re-request),
growing the table indefinitely and creating stale valid-looking rows.

**Consume must be atomic — critical gotcha:** verifying an OTP is a single conditional
`DELETE ... WHERE id=<row> AND is_used=False AND expires_at > now`, checked via `rowcount == 1`,
not a check-then-mark-used pattern — the old pattern allowed two concurrent verify requests with
the same OTP to both pass validation before either committed (double-verification race).
Must pass `.execution_options(synchronize_session=False)` on these ORM Core `delete()` statements —
without it, SQLAlchemy's ORM-level "evaluate" sync strategy tries to evaluate the WHERE clause in
Python against already-loaded objects and crashes with `TypeError: can't compare offset-naive and
offset-aware datetimes` when comparing tz-aware `expires_at` to `datetime.utcnow()`.

**Where it runs:** `wallet_send_otp`/`wallet_verify_otp` (wallet.py), `request_otp`/`verify_otp`
(admin.py), `nail_request_otp`/`nail_verify_otp` (nail.py). The old lazy `_cleanup_old_otps`
expired-cleanup helper in nail.py still runs too, as a backstop for rows from before this change.

**Not yet made consistent:** the superadmin delete-shop OTP flow in nail.py still uses the older
check-then-mark-used pattern (lower traffic, less urgent) — apply the same atomic-consume fix there
if it ever becomes a concern.
