---
name: Nail booking multi-tenant shop scoping
description: Where shop_id isolation lives (and doesn't) in the nail salon booking system's admin/superadmin routes.
---

- All `nail_*` tables (services, staff, gallery, slots, slot templates, settings, renewal requests) are scoped by `shop_id`. Any new admin/superadmin endpoint touching these MUST filter/set `shop_id` explicitly — it is never inferred from the table schema alone, and several endpoints originally forgot to (gallery, services, staff, settings, slot templates, renewals were all missing it until fixed).
- `_get_shop(db, shop_id=1)` silently defaults to shop 1 if not passed — a recurring source of cross-tenant bugs. Always pass the caller's real `shop_id` explicitly.
- `Customer` / `CreditTransaction` / `TopupRequest` (the wallet system) are deliberately **platform-wide**, not per-shop — they're shared with the separate Telegram digital-product store. Nail admin endpoints for wallet management (`/admin/topup-requests`, `/admin/customers`, `/admin/customers/{id}/credit`, `/admin/transactions`) are gated to shop_id==1 (primary/trusted shop) only via `_require_platform_admin`, since any nail shop admin authenticating via `_check_admin` must NOT be able to manage other customers' wallets platform-wide.
- Two different "is_active" flags exist: `Shop.is_active` (real suspend/activate flag enforced at admin login and public shop resolution) vs `NailShopSettings.is_active` (an unrelated per-shop setting). Superadmin status/suspend endpoints must read/write `Shop.is_active`, not `NailShopSettings.is_active`.
