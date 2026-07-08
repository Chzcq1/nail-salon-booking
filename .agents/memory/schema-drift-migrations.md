---
name: Schema drift between CREATE TABLE and existing prod tables
description: Why adding a column to a model isn't enough — CREATE TABLE IF NOT EXISTS won't backfill columns on tables that already exist
---

`CREATE TABLE IF NOT EXISTS` is a no-op on a table that already exists — it will NOT add a newly-introduced column to it. If a column is added to a SQLAlchemy model and to the `CREATE TABLE` string used for fresh installs, but no separate `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is added to the migrations list, any environment whose table was created *before* that column existed will silently be missing it forever — while a fresh database (e.g. this project's Replit dev Postgres) has it from day one, masking the bug in dev.

This caused a full production outage in this project: `nail_bookings.customer_line` was added to the model and used in insert code, but only appeared in the `CREATE TABLE` string (already satisfied on prod) with no `ALTER TABLE ADD COLUMN` migration — every booking insert on Render/Neon prod failed with "column does not exist" while dev worked perfectly.

**Why:** Dev databases in this project are provisioned fresh from the current `CREATE TABLE` SQL, so they always have every column. Production tables persist across deploys and only gain new columns via explicit `ALTER TABLE` migrations — the two schemas diverge silently whenever this step is skipped.

**How to apply:** Whenever adding a new column to any model in `backend/models.py`, always add a matching `ALTER TABLE <table> ADD COLUMN IF NOT EXISTS ...` line to the migrations list in `backend/main.py`, even if the column is already present in that table's `CREATE TABLE IF NOT EXISTS` string. Never assume the `CREATE TABLE` alone will reach existing production tables.
