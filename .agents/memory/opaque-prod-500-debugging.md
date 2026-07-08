---
name: Debugging opaque prod 500s without log access
description: What to do when a user reports a generic 500 error on a Render-deployed app and Replit tools cannot reach Render's logs
---

When the app is deployed on Render (not Replit deployments), `fetch_deployment_logs` does not work — it only covers Replit-hosted deployments. There is no way to pull the actual traceback for a reported production 500 directly.

**What to do instead:**
1. Add (or verify) a FastAPI/Flask global exception handler that calls `logger.exception(...)` on every unhandled error and returns a friendly, non-leaky message. Without this, Render's own logs may still show a traceback, but the user has to go find it — and future debugging sessions have zero way to introspect it.
2. Statically review the failing endpoint for the most likely edge cases (None handling, Decimal/float mixing, missing FK lookups) and fix defensively rather than waiting on log access.
3. If still stuck after defensive fixes, ask the user for the Neon production `DATABASE_URL` (from Render env vars) as a one-off debugging credential, then query `information_schema.columns` for the affected table(s) directly and diff against the SQLAlchemy models — this catches schema-drift bugs (see [schema-drift-migrations.md](schema-drift-migrations.md)) in minutes without needing Render's own logs at all.
4. Safe additive fixes (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) found this way can be applied directly to prod immediately to unblock users even before a code redeploy — they never touch existing data.
5. Only as a last resort, ask the user to paste the Render log excerpt for the failing request — don't guess indefinitely.

**Why:** Repeated blind guessing without a logging safety net wastes cycles and risks silently missing the actual bug. A global handler is cheap insurance and pays off on the next opaque error report too. Direct read access to the prod DB schema is often faster than waiting on log access.
