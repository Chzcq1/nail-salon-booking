---
name: Superadmin rebrand & multi-shop UX
description: CSC/Chain System Care rebrand of /superadmin header, and tabbed layout + search/pagination for scaling to many shops.
---

The `/superadmin` page header was renamed from "Super Admin Nail Booking System" to
"CSC Super Admin" / "Chain System Care" — the system now serves any queue+deposit
booking business, not just nail salons. Only display text changed; internal
`nail_*` table/route names were intentionally left alone (see the business_type
rebrand plan in replit.md — renaming internals is a separate, riskier task since
production data already exists on Neon).

**Why:** owner explicitly asked for this brand name and said the previous single
long-scrolling `/superadmin` page becomes unusable once there are ~10+ shops.

**How to apply:** `/superadmin` (`NailSuperAdminPage.tsx`) is now tab-based (Shops /
Status / Renewals / Finance / Usage) instead of one long scroll, and the shop list
has search + pagination once shop count exceeds 5. When adding new superadmin
sections, put them under the right tab rather than appending to a single column.
