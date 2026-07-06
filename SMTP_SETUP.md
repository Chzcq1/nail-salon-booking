# Email Auth Setup Guide

## Environment Variables to set in Render

Add these to your Render service environment variables:

| Variable | Example | Description |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | 587 = STARTTLS (default), 465 = SSL |
| `SMTP_USER` | `youremail@gmail.com` | Login username |
| `SMTP_PASSWORD` | `abcd efgh ijkl mnop` | App password (NOT your main password) |
| `SMTP_FROM_EMAIL` | `noreply@yourstore.com` | Sender address shown to customers |

## Gmail Setup (Recommended)

1. Enable 2-Step Verification on your Google account
2. Go to myaccount.google.com → Security → App passwords
3. Create an "App password" for "Mail"
4. Use that 16-character password as `SMTP_PASSWORD`
5. Set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`

## Database Migrations (Automatic)

On first startup after deploy, the backend will automatically run:
- `ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255)` 
- Create `email_otp_sessions` table
- Make `telegram_username` nullable

No manual SQL needed.

## New Customer Auth Flow

1. Customer enters email → system checks if account exists
2. **New account**: OTP sent to email → customer sets PIN → logged in
3. **Existing account with PIN**: enter PIN directly → logged in
4. **Forgot PIN**: OTP sent to email → set new PIN → logged in

## Telegram Bot

- Main bot still works for **admin topup notifications**
- OTP bot is no longer needed (email replaces it)
- `OTP_BOT_TOKEN` can be left unset safely
