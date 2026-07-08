---
name: Testing this store's Neon DB from Replit dev
description: How to reproduce/verify "data not saving" style reports locally against the real production Neon database.
---

# Testing against the real Neon DB from Replit dev

`backend/database.py` reads `DATABASE_URL` normally (matches Render), but also
falls back to a `NEON_DATABASE_URL` secret if `DATABASE_URL` is unset. This lets
Replit dev connect to the *same* Neon database Render uses, without touching
production's env wiring.

**Why:** The owner reported "nothing saves" in production. Code review of every
write endpoint showed correct `db.commit()` usage everywhere — the bug wasn't
reproducible by reading code. Requested the Neon connection string as a
`NEON_DATABASE_URL` secret (not `DATABASE_URL`, which is a Replit-reserved
runtime-managed key) and ran real create/read/delete calls through the actual
FastAPI endpoints. Every write persisted correctly — confirming the persistence
layer and ORM are healthy, and the reported symptom was environment-side
(stale Render deploy, expired admin session, etc.), not an app-code bug.

**How to apply:** When a save/persistence bug is reported and static code
review doesn't find an obvious cause, don't keep guessing — get the real
DATABASE_URL as a secret (under a non-reserved name) and run actual write/read
probes against production data before concluding there's a code fix needed.
