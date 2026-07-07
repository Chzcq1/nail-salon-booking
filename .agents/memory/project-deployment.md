---
name: Project deployment and Replit role
description: Where the project is deployed, where secrets live, and what Replit's job is in this workflow.
---

# Project Deployment & Replit Role

## The rule
**Replit's only job is to write / edit / add code.** Do not ask the owner for API keys, tokens, or passwords unless a brand-new third-party service is being integrated for the first time.

**Why:** The project is already deployed on Render with all secrets pre-configured. Asking for keys the owner has already set up wastes their time and creates confusion.

## Where things live

| What | Where |
|---|---|
| Source code | GitHub (private repo) — Replit edits here |
| Hosting | Render (Web Service) — live production |
| All secrets / API keys / tokens | Render Environment Variables — **already set** |
| Database | Neon.tech (PostgreSQL serverless) — `DATABASE_URL` on Render |

## How to apply
- Before asking "what is your X API key?", check `backend/config.py` — if the env var is already defined there, it exists on Render. Just reference the variable name in code.
- Only request a secret from the owner when integrating a brand-new external service that has never been configured before.
- Never hardcode secrets in source files.
