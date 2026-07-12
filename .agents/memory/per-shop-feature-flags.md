---
name: Per-shop feature flags
description: Pattern for gating features per-shop via superadmin toggle; allow_ref_image is the first flag built this way.
---

# Per-shop feature flags

## The rule
New optional features that only some shops need go as Boolean columns on `NailShopSettings` (not `NailShopApiKeys`), with `server_default="false"` so all existing shops default to off.

**Why:** Keeps feature rollout safe — shops don't get unexpected UI changes; superadmin consciously enables per shop, like Slip2go.

## How to apply
1. Add column to `NailShopSettings` in `backend/models.py` with `server_default="false", default=False, nullable=False`
2. Add `ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS <flag> BOOLEAN NOT NULL DEFAULT FALSE` migration in `backend/main.py` `_run_migrations()`
3. Expose flag in `get_settings_public()` response (nail.py) and in `hold_slot()` response
4. Add `GET/PUT /superadmin/shops/{shop_id}/features` endpoints in nail.py (see `ShopFeaturesBody` Pydantic model)
5. Frontend `NailSuperAdminPage.tsx` `ShopKeysSection`: add query `["sa-shop-features", shopId]`, mutation, state, and toggle UI under the "Feature Flags" section
6. Frontend consuming page reads flag from `holdData.<flag>` (already in hold response) or from public settings

## Current flags
- `allow_ref_image` — customer can attach a reference/brief image during booking deposit step; stored as `ref_image` (base64 data URI) on `NailBooking`; displayed in admin booking card as 🎨 ref section
