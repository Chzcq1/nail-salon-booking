---
name: SQLAlchemy server_default vs default for NOT NULL columns
description: When adding NOT NULL Boolean columns, server_default is required so the DB-level DEFAULT is set; Python-only default= causes seed INSERT failures on fresh DBs.
---

## Rule
For every NOT NULL column with a default value, always set **both** `server_default` (DB-level) and `default` (Python ORM level).

```python
# WRONG — DB column has no DEFAULT; raw SQL INSERTs that omit the column fail
accept_bank_transfer = Column(Boolean, default=True, nullable=False)

# CORRECT
accept_bank_transfer = Column(Boolean, server_default="true", default=True, nullable=False)
```

**Why:** `create_all()` creates the column as `NOT NULL` but without `DEFAULT TRUE`. If a seed INSERT (raw SQL in migrations list) doesn't specify the column, Postgres raises `NotNullViolation`. The `server_default` fixes this for fresh DBs. The ALTER TABLE migration already carries `DEFAULT TRUE` for existing DBs.

**How to apply:** Any time a new NOT NULL column is added to a model:
1. Add `server_default=` to the Column definition.
2. Also include the new column with its default value in the seed INSERT inside `_run_migrations()` in `main.py`.
3. The ALTER TABLE migration should also specify `DEFAULT <value>` so existing prod rows get the right value.
