---
name: Wallet per-shop isolation
description: How wallet customers are now scoped per shop — prevents cross-shop PIN/balance sharing
---

# Wallet per-shop isolation

## The Rule
Each shop has its own wallet customer registry. Same email at two different shops = two separate Customer rows, each with its own PIN and balance.

**Why:** Before the fix, `Customer.email` had a global `UNIQUE` constraint. Any JWT token encoded only `email` (no `shop_id`), so a customer registered at `/default` could log in at any cloned shop with the same PIN and see the same balance.

## How to Apply
- When looking up a customer: always filter `WHERE email = ? AND shop_id = ?`
- JWT tokens now include `"shop_id"` field — legacy tokens without it default to `shop_id = 1`
- `_create_token(email, shop_id)` and `_decode_token(token) → (email, shop_id)`
- `_resolve_wallet_shop_id(slug, db)` converts a shop slug to shop_id (slug=None/"default" → 1)
- All wallet endpoints (`/wallet/check`, `/wallet/send-otp`, `/wallet/verify-otp`, `/wallet/auth`, `/wallet/reset-pin`) receive `shop_slug` to scope the customer lookup
- `verified_token` (from `verify-otp`) embeds `shop_id` so it flows to `wallet_auth` / `wallet_reset_pin` automatically

## Frontend
- `sessionStorage` key is per-shop: `wallet_token_${slug || "default"}` — tokens from different shops never collide in the browser
- Every wallet API call passes `shop_slug: slug | null` in body (or `?shop_slug=` query param)

## DB Migration (ran on startup)
```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
UPDATE customers SET shop_id = 1 WHERE shop_id IS NULL;
DROP INDEX IF EXISTS ix_customers_email;   -- old global unique on email alone
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_shop
  ON customers (email, shop_id)
  WHERE email IS NOT NULL AND shop_id IS NOT NULL;
```
