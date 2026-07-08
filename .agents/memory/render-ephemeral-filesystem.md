---
name: Render ephemeral filesystem for uploaded files
description: Files written to disk on Render (including /tmp) are lost on every deploy/restart. Images must be stored in the DB or an external CDN.
---

## The Rule
Never store user-uploaded images as files on Render's filesystem. Any URL pointing to `/uploads/xxx.jpg` on the same server will break after the next deploy.

## How to Apply
- **Gallery images**: Store as base64 data URIs directly in the DB. Use a TEXT column (not VARCHAR). Enforce a max file size (1.5 MB) before reading as base64 to prevent payload/storage bloat.
- **Slip/payment proof images**: These use the same upload mechanism. If they're short-lived (admin checks within minutes), the ephemeral filesystem is acceptable. But for archival, should also go to DB or CDN.
- **Migration**: `ALTER TABLE nail_gallery ALTER COLUMN image_url TYPE TEXT` — added to `_run_migrations` in main.py.

## Migration Added
```python
"ALTER TABLE nail_gallery ALTER COLUMN image_url TYPE TEXT",
```
