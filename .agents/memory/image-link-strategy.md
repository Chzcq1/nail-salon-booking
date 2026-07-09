---
name: Image link strategy
description: System policy on how images are stored/referenced — URL links not base64/files
---

## Rule
All images (gallery, logos, QR codes, payment slips) are stored as **URL strings**, not base64 blobs or server files.

**Why:** Render has an ephemeral filesystem (files lost on redeploy). Storing base64 in the DB wastes storage and makes rows large. The system is hosted on Render + Neon.

**How to apply:**
- Gallery images: admin pastes a Direct Link from imgbb.com / postimages.org → stored as `image_url` (TEXT)
- Payment slips: customers paste an imgbb link into `payment_proof` field
- `/api/upload/slip` endpoint (upload.py) still exists but is no longer wired to the frontend
- Backend `/api/nail/booking/pay` validates `payment_proof` must be https:// or non-http internal string, max 2048 chars
- Admin payment proof display: if value starts with `http` → show as clickable link + `<img>` with onError hide; else show as plain text
