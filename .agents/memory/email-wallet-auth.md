---
name: Email Wallet Auth Migration
description: Replaced Telegram OTP login with email OTP + PIN for customer wallet accounts
---

# Email Wallet Auth

## What changed
- Customer auth: was Telegram @username + Telegram DM OTP + PIN → now email + email OTP + PIN
- Admin auth: unchanged (ADMIN_PASSCODE flow)
- Telegram bot: kept for topup/payment notifications to admin group, no longer sends OTP to customers

## Key files changed
- `backend/email_service.py` — NEW: sends OTP via smtplib (no new pip deps)
- `backend/models.py` — EmailOTPSession table, Customer.email column added, telegram_username now nullable
- `backend/config.py` — SMTP_HOST/PORT/USER/PASSWORD/FROM_EMAIL settings added
- `backend/routes/wallet.py` — full rewrite; email-based auth, GET /wallet/check?email=..., send-otp via email
- `backend/routes/auth.py` — stripped to empty router (Telegram auth endpoint removed)
- `backend/main.py` — email DB migrations added on startup, /api/wallet/bot-info endpoint removed

## Required env vars (Render)
SMTP_HOST, SMTP_PORT (587 for STARTTLS, 465 for SSL), SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL

**Why:** User wanted to remove Telegram login dependency for customers; email is universally accessible.

**How to apply:** DB migrations run automatically on startup. SMTP env vars must be set before deploy.

## Order lookup workaround
Credit purchase orders store customer.email in Order.telegram_username field (no orders table schema change needed). my-orders endpoint filters Order.telegram_username == customer.email.
