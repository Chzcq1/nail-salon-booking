"""
Migration: Add shop_id to topup_requests and credit_transactions tables.

Run once on production DB before deploying the new code:
    python scripts/migrate_shop_wallet.py

Safe to run multiple times — uses IF NOT EXISTS checks.
"""
import os
import sys

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("NEON_DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL or NEON_DATABASE_URL env var required")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

MIGRATIONS = [
    # topup_requests: เพิ่ม shop_id — NULL หมายถึง shop 1 (legacy)
    """
    ALTER TABLE topup_requests
    ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
    """,
    # index สำหรับ query กรองตาม shop
    """
    CREATE INDEX IF NOT EXISTS ix_topup_requests_shop_id
    ON topup_requests (shop_id);
    """,
    # credit_transactions: เพิ่ม shop_id — NULL หมายถึง shop 1 (legacy)
    """
    ALTER TABLE credit_transactions
    ADD COLUMN IF NOT EXISTS shop_id INTEGER REFERENCES shops(id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_credit_transactions_shop_id
    ON credit_transactions (shop_id);
    """,
]

with engine.begin() as conn:
    for sql in MIGRATIONS:
        sql = sql.strip()
        print(f"Running: {sql[:80]}...")
        conn.execute(text(sql))
        print("  OK")

print("\nMigration complete.")
