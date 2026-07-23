---
name: Object storage migration
description: Images moved from base64-in-DB to Cloudflare R2 / S3-compatible object storage via backend/storage.py
---

# Object Storage Migration (S3 / Cloudflare R2)

## What changed
Images previously stored as base64 TEXT in Neon/PostgreSQL are now uploaded to object storage.
DB columns still exist (TEXT) but now hold HTTPS URLs instead of data URIs.

## New module
`backend/storage.py` — public API:
- `is_configured() -> bool` — True when all 5 S3_* env vars are set
- `upload_bytes(data, content_type, folder, extension) -> str` — returns public URL
- `delete_url(url)` — deletes if URL matches S3_PUBLIC_URL prefix; no-op otherwise
- `delete_urls(urls)` — batch delete

**Why boto3:** S3-compatible API works with both Cloudflare R2 and AWS S3.
No ACL parameter on put_object — R2 uses bucket-level public access, not per-object ACLs.

## New env vars (Render Dashboard)
| Var | Example |
|---|---|
| S3_ENDPOINT_URL | https://<account>.r2.cloudflarestorage.com |
| S3_BUCKET_NAME | my-bucket |
| S3_ACCESS_KEY_ID | R2 / AWS key ID |
| S3_SECRET_ACCESS_KEY | R2 / AWS secret |
| S3_PUBLIC_URL | https://pub.example.com (R2 custom domain or bucket URL) |
| S3_REGION | auto (R2) or us-east-1 (AWS) |

## Backward compatibility
- `POST /api/upload/slip` contract unchanged: body `{data: base64}`, response `{url, size}`
- When S3_* vars not set → falls back to returning data URI (dev/local works as before)
- All existing https:// validations in nail.py already pass (no DB schema changes needed)

## New endpoint
`POST /api/upload/delete` — admin-auth required; body `{url}`
Called by AnnouncementsTab when admin removes an image from the form.

## Cleanup (delete from storage before nulling field)
Every place that does `field = None` after admin approve/reject/confirm now calls
`storage.delete_url(old_value)` first. Affected paths:
- orders.py: auto-approve + manual approve
- wallet.py: auto Slip2Go, admin approve, admin reject (3 places)
- nail.py: booking confirm, topup approve, topup reject (3 places)

## Slip2Go compat
`slip_verify.py` now handles HTTPS URLs: fetches image via httpx, converts to base64
data URI before sending to Slip2Go API (which only accepts base64).

## ref_image / slip_image validation
nail.py updated to accept `https://` in addition to `data:image/` for:
- booking submit_payment ref_image
- booking pay-wallet ref_image
- shop registration slip_image

## How to apply
Any new field that stores user images must:
1. Receive via `POST /api/upload/slip` (returns URL or data URI in dev)
2. Store the returned URL in the DB column
3. Call `storage.delete_url()` before nulling the field
