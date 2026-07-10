---
name: Nail admin backend theme now follows shop brand_color
description: How the admin/back-office UI colors are linked to each shop's brand_color, and the CSS-var pattern used to do it without touching every call site.
---

- `NailAdminPage.tsx` used to hardcode a static candy-pink `A` color object at module scope; only the customer-facing `BookingPage` respected `shop.brand_color`. A non-nail-salon tenant (e.g. a car wash) was stuck with pink admin UI even after picking a different brand color.
- Fix: `A`'s brand-dependent fields (`primary/deep/light/pale/bg/border`) now hold `var(--b-*)` CSS variable strings instead of hex. `injectThemeCss()` (theme.ts) sets those vars on `:root`, so every tab sub-component in the file (they're separate function components sharing the module-level `A` const) picks up the live theme with no prop drilling.
- `NailAdminPage` fetches the shop's brand_color via the **public** `/api/nail/settings` endpoint (no auth) and calls `injectThemeCss` immediately, so theming applies even on the pre-login screen — not just after visiting the Settings tab (which is the only place that used to call it).
- `index.css` defines fallback `--b-*` vars (candy pink) on `:root` so first paint before that fetch resolves isn't unstyled.
- **Why:** many inline styles reference `A.primary` etc. directly as color strings (backgrounds, borders, SVG `color` props) — swapping the underlying value to a CSS var string is a drop-in replacement as long as no code does hex math (parsing/concatenation/slicing) on those fields. Checked and none does.
- **How to apply:** any new hardcoded color in NailAdminPage.tsx that should differ per shop must go through `A.*` (i.e. reference a `--b-*` var), not a literal hex — otherwise it silently reintroduces the same pink-only bug for future tenants.
