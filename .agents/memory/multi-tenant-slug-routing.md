---
name: Multi-tenant slug routing & wallet isolation
description: Per-shop /r/:slug routing, wallet transaction scoping by shop_id, and superadmin traffic stats — key decisions
---

## Slug Routing (/r/:slug/...)

- `useCurrentSlug()` hook in App.tsx reads slug via regex `/^\/r\/([^/]+)/` from wouter `useLocation()`
- `ShopSlugContext.Provider` wraps Router; all components access slug via `useShopSlug()`
- `shopQs(slug, extra?)` builds `?shop_slug=...` query strings; empty string when slug=null
- BookingPage uses `makeApi(slug)` factory (not module-level `const api`) so all sub-components (SlotScreen, PaymentScreen) also call `makeApi(useShopSlug())`
- Navigation links (wallet, my-bookings) must be slug-sticky: `slug ? \`/r/${slug}/wallet\` : "/wallet"`
- ShopGate settings query uses slug param and `/r/:slug/(admin|nail-admin)` detection

## Wallet Transaction Isolation (shop_id on TopupRequest + CreditTransaction)

- NULL shop_id = legacy shop 1; filtering pattern: `(shop_id == 1) | (shop_id.is_(None))`
- Customer balance stays **platform-wide**; only topups and transactions are scoped
- Admin list_customers: subquery on TopupRequest.shop_id to find which customers belong to this shop
- Admin add_credit: if shop_id != 1, verify customer has at least one topup from this shop
- Wallet topup endpoints use **fail-closed** slug resolution: if slug provided but shop not found/active → 404 (NOT fallback to shop 1)

**Why:** Silent fallback would misattribute financial records to wrong tenant — security issue.

## Superadmin Traffic Stats

- `GET /superadmin/traffic?days=30` queries `nail_api_stats` + `shops` via raw SQL join
- Returns per-shop totals + 14-day daily breakdown for mini bar chart
- TrafficSection component in NailSuperAdminPage uses `saFetch` with `sKey`

## Migration Required Before Deploy

`scripts/migrate_shop_wallet.py` — runs `ALTER TABLE ADD COLUMN IF NOT EXISTS shop_id` on both tables. Must run on prod Neon DB before deploying.
