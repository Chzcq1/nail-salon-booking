---
name: Framer Motion transform breaks position:fixed modals
description: Why fixed-position modals nested inside a framer-motion animated wrapper can render as if not full-screen (no dark backdrop, sandwiched between page content) instead of covering the whole viewport, especially visible on iOS Safari.
---

`artifacts/store/src/pages/NailAdminPage.tsx` wraps each admin tab's content in a page-transition
`<motion.div key={tab} animate={{ opacity: 1, y: 0 }}>`. Framer Motion controls animated properties
via an inline `transform` style and leaves it on the DOM node even once the animation settles at
`y: 0` (i.e. `transform: translateY(0px)` remains, it does not reset to `transform: none`). Per the
CSS spec, ANY element with a `transform` other than `none` becomes a new containing block for all
descendant `position: fixed` elements — so every full-screen modal (`position: fixed; inset: 0`)
nested anywhere inside that wrapper stops covering the true viewport and instead behaves like
`position: absolute` relative to that wrapper's box. Visually this looks like the modal "doesn't
cover the whole screen" / has no dark backdrop / is sandwiched between visible page content above
and below it — reported by a shop owner on iPad Safari as the popup looking broken/overlapping.

**Why:** this is invisible on desktop dev tools at default scroll position (wrapper often fills the
viewport there) but shows up clearly once the page is scrolled, or on mobile Safari where viewport
sizing quirks make the mismatch obvious.

**How to apply:** never give a `motion.div` (or any ancestor) an animated `x`/`y`/`scale` transform
if `position: fixed` overlays can be mounted anywhere inside it — animate `opacity` only for such
wrappers, or portal fixed-position modals to `document.body` so they escape the containing block
entirely. This app's outer per-tab transition wrapper was changed to opacity-only for this reason;
don't reintroduce a transform-based animation on it without portaling the modals first.
