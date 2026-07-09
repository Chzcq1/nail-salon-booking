---
name: OTP cleanup policy
description: How and when expired OTP sessions are purged from otp_sessions table
---

## Rule
OTP sessions are cleaned up **lazily on each OTP creation** (not via a cron job). The cleanup runs before inserting a new OTP session.

**Why:** The `otp_sessions` table accumulates rows over time (each login attempt adds a row). Without cleanup it grows indefinitely and slows queries.

**Cleanup predicate:**
```python
(OTPSession.expires_at < now - 1h) OR (OTPSession.is_used == True)
```
Used OTPs are deleted immediately. Expired-but-unused OTPs are kept for 1 hour then deleted.

**Where it runs:**
- `backend/routes/nail.py` → `_cleanup_old_otps(db)` helper, called in `nail_request_otp` before `db.add(session)`
- `backend/routes/admin.py` → inline equivalent before `db.add(session)` in `request_otp`

**Note:** If the system is idle for a long time (no logins), cleanup does not run. Table growth is bounded by login frequency, which is low for a nail salon.
