---
name: Wallet login link must not open in a new tab
description: sessionStorage is per-tab; a wallet login link with target="_blank" makes the caller page never see the new token
---

`sessionStorage` is isolated per browser tab — it is **not** shared even between tabs of the
same origin. If a "login to wallet" link anywhere in the booking/storefront flow uses
`target="_blank"`, the customer logs in successfully in the new tab, but the original tab
(e.g. the booking/payment screen) keeps reading its own empty `sessionStorage` and still shows
"please log in" even though the customer believes they are logged in.

**Why:** This caused a real customer-facing bug: nail booking's `InfoScreen` had the initial
"สร้างบัญชี / เข้าสู่ระบบ" link open the wallet page with `target="_blank"`, so `isLoggedIn`
in the booking flow never became true after login.

**How to apply:** Any link/button that sends the customer to the wallet login (`/r/:slug/wallet`
or `/wallet`) from a flow that then checks `sessionStorage` for the wallet token must navigate in
the **same tab** (no `target="_blank"`). It's fine to keep `target="_blank"` for a top-up link
used *while already logged in* mid-payment (to protect an active hold/countdown), since that
case doesn't depend on detecting a fresh login — but any link used for the login step itself
must stay same-tab.
