---
name: Sequential per-iteration DB commits are slow against Neon
description: Why a bulk operation looping over many days/rows with a commit() inside each iteration causes a very long spinner, and the savepoint-based fix pattern.
---

The nail-booking slot-template save flow re-syncs actual booking slots for up to 60-90 days every
time an admin saves the weekly schedule template. The core sync function
(`_apply_template_for_date_core` in `backend/routes/nail.py`) originally called `db.commit()` once
per date inside the loop — meaning saving a template did 60+ full round trips to the DB in serial.
Neon's serverless Postgres adds noticeably more per-round-trip latency than a typical local/managed
Postgres, so this pattern turned a save into a multi-second (sometimes very long) spinner, reported
by a shop owner as "saving the schedule spins forever."

**Why:** commits are separate network round trips; doing N of them serially in a request handler
scales latency linearly with N and gets worse specifically on Neon vs. lower-latency DBs.

**How to apply:** for any loop that must apply N independent units of work in one request, use one
`db.begin_nested()` (SAVEPOINT) per unit to keep per-unit error isolation, but only call the outer
`db.commit()` once after the whole loop finishes. The function gained a `commit: bool` parameter so
per-day callers (e.g. the single "reset today" admin action) can still commit immediately, while
bulk callers (template save, sync-future) pass `commit=False` and commit once at the end.
