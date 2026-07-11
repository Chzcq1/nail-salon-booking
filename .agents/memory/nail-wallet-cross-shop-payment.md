---
name: Wallet payment must verify customer.shop_id == booking.shop_id
description: hold/pay-wallet endpoints let a customer logged into shop A pay for a shop B booking using shop A's balance — real cross-shop money leak found and fixed
---

Even though `Customer` rows are correctly isolated per shop (composite unique on
`email + shop_id`, every login/lookup filters by shop), the nail-booking **hold** and
**pay-wallet** endpoints only checked the *slot*'s shop, never the *logged-in customer*'s shop.

**Why:** `hold_slot` accepted any logged-in customer token and linked `booking.customer_id`
to it regardless of whether `customer.shop_id == slot.shop_id`. `submit_payment_wallet`
similarly resolved the customer purely from the JWT and deducted from their balance without
checking `customer.shop_id == booking.shop_id`. Verified live (in this workspace's dev DB) that
a customer logged into shop A could hold + pay for a shop B slot, and shop A's wallet balance
was debited to confirm a shop B booking — a real cross-shop money leak, not just a UX bug.

**How to apply:** Any endpoint that takes a wallet-authenticated `Customer` (via
`get_wallet_customer`/`_optional_wallet_customer`) AND acts on a shop-scoped resource (booking,
slot, order, etc.) must explicitly check `customer.shop_id == <resource>.shop_id` before using
the customer for balance or ownership purposes. For optional-auth flows (like a public hold
endpoint), treat a shop mismatch as "not logged in" (drop the customer reference) rather than
erroring, since the shop the token belongs to just isn't relevant here. For required-auth flows
(like payment), reject with 403. This class of bug can hide behind seemingly correct per-shop
customer records — isolating the *account* is not the same as isolating every *action* taken
with that account's token.
