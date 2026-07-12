---
name: Render ephemeral disk breaks local file uploads
description: Why writing uploaded files (slips, images) to local disk on this project's Render deployment silently loses them, and the fix pattern used.
---

The nail booking app is deployed on Render (see `project-deployment.md`). Render's filesystem is
ephemeral: any file written to local disk is lost on redeploy/restart and isn't shared across
instances if the service ever scales beyond one. A `POST /api/upload/slip`-style endpoint that
saved bytes to `uploads/slips/xxx.jpg` and returned a `/uploads/...` URL path worked in local dev
but caused customer payment slips to "disappear" from the admin backend in production — the DB
row (e.g. `TopupRequest`) was there, but the referenced file was gone.

**Why:** this class of bug is invisible in Replit dev (persistent disk) and only manifests after a
production redeploy/restart, so it reads like "the request never arrived" when actually the record
exists but its file reference is dead.

**How to apply:** for any file this app needs to keep (slip photos, etc.), store it inline as a
base64 `data:` URI directly in the DB `Text`/`TEXT` column instead of writing to disk and storing a
URL path. Consumers (`<img src=...>`, Slip2Go's `verify_slip()`) already accept `data:` URIs
transparently, so this requires no changes on the read side — only the upload endpoint changes to
skip the disk write and return the data URI as-is. Before adding any new local-disk file write in
this project, prefer this pattern or real object storage — never assume the filesystem persists.
