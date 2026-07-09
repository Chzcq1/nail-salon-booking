import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


def _run_cleanup(engine):
    """
    Startup cleanup — ล้างข้อมูลขยะทุกครั้งที่ backend เริ่ม:
    1. OTP sessions หมดอายุ (email, admin/legacy)
    2. admin_logs เก่าเกิน 90 วัน
    3. payment_proof (รูปสลิป base64) ของออเดอร์/topup ที่อนุมัติ/ปฏิเสธ
       ไปแล้วเกิน 30 วัน — Admin ตรวจสอบเสร็จแล้วไม่จำเป็นต้องเก็บรูปอีก
    """
    cleanup_sqls = [
        # ── OTP Sessions ─────────────────────────────────────────────────────
        "DELETE FROM email_otp_sessions WHERE expires_at < NOW()",
        # ลบ legacy OTP ที่ใช้แล้ว หรือหมดอายุนานเกิน 1 วัน
        "DELETE FROM otp_sessions WHERE is_used = TRUE AND expires_at < NOW() - INTERVAL '1 day'",
        "DELETE FROM otp_sessions WHERE expires_at < NOW() - INTERVAL '7 days'",

        # ── Admin Logs ────────────────────────────────────────────────────────
        "DELETE FROM admin_logs WHERE created_at < NOW() - INTERVAL '90 days'",

        # ── Orders ────────────────────────────────────────────────────────────
        # ลบ base64 รูปสลิปออเดอร์ที่ตัดสินใจแล้วเกิน 30 วัน — ประหยัด DB มาก
        "UPDATE orders SET payment_proof = NULL WHERE payment_proof IS NOT NULL AND length(payment_proof) > 200 AND status IN ('approved', 'rejected') AND created_at < NOW() - INTERVAL '30 days'",
        # ล้าง slip_verify_result (JSON ยาว) ออเดอร์เก่าเกิน 60 วัน — เหลือแค่ status ก็พอ
        "UPDATE orders SET slip_verify_result = NULL WHERE slip_verify_result IS NOT NULL AND created_at < NOW() - INTERVAL '60 days'",
        # ออเดอร์ค้าง pending เกิน 7 วัน → ถือว่าลูกค้าไม่ชำระ
        "UPDATE orders SET status = 'rejected' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'",
        # ล้าง invite_links เก่าเกิน 90 วัน — ลิงก์ Telegram หมดอายุอยู่แล้ว
        "UPDATE orders SET invite_links = NULL WHERE invite_links IS NOT NULL AND status = 'approved' AND created_at < NOW() - INTERVAL '90 days'",

        # ── TopupRequests ─────────────────────────────────────────────────────
        "UPDATE topup_requests SET payment_proof = NULL WHERE payment_proof IS NOT NULL AND length(payment_proof) > 200 AND status IN ('approved', 'rejected') AND created_at < NOW() - INTERVAL '30 days'",
        "UPDATE topup_requests SET slip_verify_result = NULL WHERE slip_verify_result IS NOT NULL AND created_at < NOW() - INTERVAL '60 days'",
        "UPDATE topup_requests SET status = 'rejected' WHERE status = 'pending' AND created_at < NOW() - INTERVAL '7 days'",

        # ── Nail Bookings ─────────────────────────────────────────────────────
        # ลบ base64 สลิปการจองที่ยืนยัน/เสร็จแล้วเกิน 30 วัน (รูปใหญ่มาก)
        "UPDATE nail_bookings SET payment_proof = NULL WHERE payment_proof IS NOT NULL AND length(payment_proof) > 200 AND status IN ('confirmed', 'completed', 'walkin') AND created_at < NOW() - INTERVAL '30 days'",
        # ลบการจองที่ยกเลิกแล้วเกิน 14 วัน — ไม่มีประโยชน์เก็บ
        "DELETE FROM nail_bookings WHERE status = 'cancelled' AND created_at < NOW() - INTERVAL '14 days'",
        # ลบ held ที่หมดเวลานานเกิน 1 วันโดยไม่ได้จ่ายเงิน
        "DELETE FROM nail_bookings WHERE status = 'held' AND held_until < NOW() - INTERVAL '1 day'",
        # ลบการจองที่เสร็จสิ้น/walk-in เก่าเกิน 180 วัน — กันประวัติการจองลูกค้าโตไม่มีที่สิ้นสุด
        "DELETE FROM nail_bookings WHERE status IN ('completed', 'walkin') AND created_at < NOW() - INTERVAL '180 days'",

        # ── Nail Time Slots ───────────────────────────────────────────────────
        # ลบ slot วันที่ผ่านมาเกิน 60 วัน — ไม่มีประโยชน์เก็บอีกต่อไป
        "DELETE FROM nail_time_slots WHERE slot_date < (CURRENT_DATE - INTERVAL '60 days')::text",
    ]
    from sqlalchemy import text
    with engine.connect() as conn:
        for sql in cleanup_sqls:
            try:
                result = conn.execute(text(sql))
                conn.commit()
                if hasattr(result, "rowcount") and result.rowcount > 0:
                    logger.info(f"Cleanup affected {result.rowcount} rows: {sql[:60]}…")
            except Exception as e:
                conn.rollback()  # ล้าง aborted transaction ก่อน statement ถัดไป
                logger.warning(f"Cleanup step skipped: {e}")


def _drop_single_col_unique_on_day_of_week(conn):
    """Drop any single-column unique constraint/index on nail_slot_templates.day_of_week.

    SQLAlchemy text() treats $ as a bind-param placeholder so PL/pgSQL dollar-quoting
    cannot be used inside the string-based migration list.  This callable is placed in the
    list instead; the runner calls it with the live connection.

    Safe to run multiple times — IF NOT EXISTS / non-crashing SELECT ensures idempotency.
    """
    from sqlalchemy import text as _text

    # 1. Find and drop unique CONSTRAINTS that cover only day_of_week
    result = conn.execute(_text("""
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'nail_slot_templates'
          AND c.contype = 'u'
          AND array_length(c.conkey, 1) = 1
          AND c.conkey[1] = (
            SELECT a.attnum FROM pg_attribute a
            WHERE a.attrelid = t.oid AND a.attname = 'day_of_week'
          )
    """))
    for row in result.fetchall():
        conn.execute(_text(f'ALTER TABLE nail_slot_templates DROP CONSTRAINT IF EXISTS "{row[0]}"'))

    # 2. Find and drop unique INDEXes that cover only day_of_week (excluding our composite one)
    result2 = conn.execute(_text("""
        SELECT i.relname AS idxname
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE t.relname = 'nail_slot_templates'
          AND ix.indisunique = TRUE
          AND array_length(ix.indkey, 1) = 1
          AND ix.indkey[0] = (
            SELECT a.attnum FROM pg_attribute a
            WHERE a.attrelid = t.oid AND a.attname = 'day_of_week'
          )
          AND i.relname <> 'uix_nail_slot_templates_shop_day'
    """))
    for row in result2.fetchall():
        conn.execute(_text(f'DROP INDEX IF EXISTS "{row[0]}"'))

    conn.commit()


def _run_migrations(engine):
    """Add missing columns to existing tables (safe to run on every startup)."""
    migrations = [
        # link_sent added to orders
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS link_sent BOOLEAN NOT NULL DEFAULT FALSE",
        # admin_message_id added to orders
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_message_id BIGINT",
        # telegram_first_name added to orders (customer name)
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_first_name VARCHAR(255)",
        # payment_type added to orders
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) NOT NULL DEFAULT 'slip'",
        # telegram_user_id must be nullable (Telegram login removed)
        "ALTER TABLE orders ALTER COLUMN telegram_user_id DROP NOT NULL",
        # telegram_username must be nullable
        "ALTER TABLE orders ALTER COLUMN telegram_username DROP NOT NULL",
        # invite_links stores JSON array of invite link URLs
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS invite_links TEXT",
        # announcements table columns (created via create_all, these guard extras)
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS images TEXT",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS font_size VARCHAR(10) NOT NULL DEFAULT 'base'",
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE",
        # phone_number for order lookup without order ID
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)",
        # image_urls stores JSON array of product image URLs
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT",
        # sort_order for manual product ordering
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        # is_featured + badge fields for highlighting products on storefront
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_text VARCHAR(50)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS badge_color VARCHAR(20)",
        # sales_count tracks total approved orders per product
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_count INTEGER NOT NULL DEFAULT 0",
        # finance_entries table columns (created via create_all, these guard extras)
        "ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS order_id INTEGER",
        # slip verify columns
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS slip_verify_status VARCHAR(20)",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS slip_verify_result TEXT",
        # sort_order for announcements
        "ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0",
        # wallet / credit system (legacy: telegram_username column, now nullable)
        "CREATE TABLE IF NOT EXISTS customers (id SERIAL PRIMARY KEY, telegram_username VARCHAR(255) UNIQUE, balance NUMERIC(12,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        "CREATE TABLE IF NOT EXISTS topup_requests (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), topup_type VARCHAR(20) NOT NULL DEFAULT 'slip', amount NUMERIC(12,2), payment_proof TEXT, voucher_code VARCHAR(100) UNIQUE, status VARCHAR(20) NOT NULL DEFAULT 'pending', slip_verify_status VARCHAR(30), slip_verify_result TEXT, truemoney_result TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        "CREATE TABLE IF NOT EXISTS credit_transactions (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), txn_type VARCHAR(20) NOT NULL, amount NUMERIC(12,2) NOT NULL, description VARCHAR(300), ref_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW())",
        # truemoney auto redeem setting
        "INSERT INTO store_settings (key, value) VALUES ('truemoney_auto_redeem', 'on') ON CONFLICT (key) DO NOTHING",
        # wallet PIN hash column
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)",
        # catalog_group for dual catalog (A/B) system
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS catalog_group VARCHAR(1) NOT NULL DEFAULT 'A'",
        # telegram_user_id for optional Telegram binding
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_telegram_user_id ON customers (telegram_user_id) WHERE telegram_user_id IS NOT NULL",
        # email-based auth: add email column to customers
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(255)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_email ON customers (email) WHERE email IS NOT NULL",
        # allow existing telegram_username to be nullable (email replaces it as primary identifier)
        "ALTER TABLE customers ALTER COLUMN telegram_username DROP NOT NULL",
        # email OTP sessions for email-based wallet auth
        "CREATE TABLE IF NOT EXISTS email_otp_sessions (id SERIAL PRIMARY KEY, session_token VARCHAR(64) UNIQUE NOT NULL, email VARCHAR(255) NOT NULL, otp_code VARCHAR(6), is_used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL)",
        "CREATE INDEX IF NOT EXISTS ix_email_otp_sessions_session_token ON email_otp_sessions (session_token)",
        "CREATE INDEX IF NOT EXISTS ix_email_otp_sessions_email ON email_otp_sessions (email)",
        # gafiw product toggle states
        "CREATE TABLE IF NOT EXISTS gafiw_products (id SERIAL PRIMARY KEY, type_id VARCHAR(100) UNIQUE NOT NULL, is_enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        "CREATE INDEX IF NOT EXISTS ix_gafiw_products_type_id ON gafiw_products (type_id)",
        # price markup per gafiw product (admin-adjustable, default 0)
        "ALTER TABLE gafiw_products ADD COLUMN IF NOT EXISTS price_markup NUMERIC(10,2) NOT NULL DEFAULT 0",
        # markup_percent per product (-1 = use global setting)
        "ALTER TABLE gafiw_products ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(6,2) NOT NULL DEFAULT -1",
        # global markup percent setting (applies to all gafiw products by default)
        "INSERT INTO store_settings (key, value) VALUES ('gafiw_global_markup_percent', '0') ON CONFLICT (key) DO NOTHING",
        # fake_price per gafiw product (null = no fake price)
        "ALTER TABLE gafiw_products ADD COLUMN IF NOT EXISTS fake_price NUMERIC(10,2)",
        # hero banners table
        "CREATE TABLE IF NOT EXISTS banners (id SERIAL PRIMARY KEY, title VARCHAR(255), subtitle VARCHAR(500), image_url VARCHAR(1000), link_url VARCHAR(1000), is_active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ)",
        # product cost (ต้นทุน/gafiw price) — กำไร = price - cost
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2)",
        # gafiw_orders: local purchase history (keeps textdb/รหัสสินค้า permanently)
        "CREATE TABLE IF NOT EXISTS gafiw_orders (id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), type_id VARCHAR(100), product_name VARCHAR(255) NOT NULL, textdb TEXT, image_api VARCHAR(1000), price NUMERIC(10,2), created_at TIMESTAMPTZ DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ix_gafiw_orders_customer_id ON gafiw_orders (customer_id)",
        # nail_gallery: change image_url to TEXT so base64 images can be stored directly
        "ALTER TABLE nail_gallery ALTER COLUMN image_url TYPE TEXT",
        # nail_renewal_requests: คำขอต่ออายุการเช่าระบบ
        """CREATE TABLE IF NOT EXISTS nail_renewal_requests (
            id SERIAL PRIMARY KEY,
            shop_id INTEGER NOT NULL DEFAULT 1,
            duration_months INTEGER NOT NULL,
            amount NUMERIC(10,2) NOT NULL,
            slip_image TEXT NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            admin_note TEXT,
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            approved_at TIMESTAMPTZ,
            new_expired_at TIMESTAMPTZ
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nail_renewal_requests_status ON nail_renewal_requests (status)",
        # nail_bookings: composite indexes for common filter patterns
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_slot_status ON nail_bookings (slot_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_date_status ON nail_bookings (slot_date, status)",
        # closed_dates added to nail_shop_settings (วันปิดร้าน) — table already existed on
        # production before this column was added to the model, so create_all() never adds it
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS closed_dates TEXT",
        # ช่องทางรับเงินมัดจำจากลูกค้า (nail shop)
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS truemoney_phone VARCHAR(20)",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS accept_bank_transfer BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS accept_truemoney_angpao BOOLEAN NOT NULL DEFAULT TRUE",
        # display_name / phone_number for customer wallet profile
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)",
        "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30)",
        # brand_color — สีหลักประจำร้าน (hex เช่น #B5174B) เพื่อ white-label UI
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS brand_color VARCHAR(20)",

        # ── Performance indexes ────────────────────────────────────────────────
        # orders: admin กรอง status บ่อย + เรียงตาม created_at
        "CREATE INDEX IF NOT EXISTS ix_orders_status ON orders (status)",
        "CREATE INDEX IF NOT EXISTS ix_orders_created_at ON orders (created_at DESC)",
        # topup_requests: admin กรอง status
        "CREATE INDEX IF NOT EXISTS ix_topup_requests_status ON topup_requests (status)",
        # nail_bookings: admin ดึงตามวันที่ + เรียงล่าสุดก่อน
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_slot_date_status ON nail_bookings (slot_date, status)",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_created_at ON nail_bookings (created_at DESC)",
        # credit_transactions: customer history เรียงล่าสุดก่อน
        "CREATE INDEX IF NOT EXISTS ix_credit_transactions_created_at ON credit_transactions (created_at DESC)",
        # otp_sessions: ล้างตาม expires_at
        "CREATE INDEX IF NOT EXISTS ix_otp_sessions_expires_at ON otp_sessions (expires_at)",

        # ── Nail Salon Booking System ──────────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS nail_shop_settings (
            id SERIAL PRIMARY KEY,
            shop_name VARCHAR(255) NOT NULL DEFAULT 'ร้านทำเล็บ',
            shop_logo_url VARCHAR(1000),
            shop_tagline VARCHAR(500) DEFAULT 'ทำเล็บสวย สไตล์คุณ',
            ig_url VARCHAR(500), fb_url VARCHAR(500), line_oa_url VARCHAR(500), tiktok_url VARCHAR(500),
            deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 200,
            bank_account_number VARCHAR(50), bank_name VARCHAR(100), bank_account_name VARCHAR(200),
            bank_qr_url VARCHAR(1000),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            expired_at TIMESTAMPTZ,
            max_advance_days INTEGER NOT NULL DEFAULT 14,
            slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ
        )""",
        "INSERT INTO nail_shop_settings (id, shop_name, deposit_amount, max_advance_days, slot_duration_minutes, is_active, accept_bank_transfer, accept_truemoney_angpao) VALUES (1, 'ร้านทำเล็บ', 200, 14, 60, TRUE, TRUE, TRUE) ON CONFLICT (id) DO NOTHING",
        """CREATE TABLE IF NOT EXISTS nail_services (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            duration_minutes INTEGER NOT NULL DEFAULT 60,
            price NUMERIC(10,2) NOT NULL DEFAULT 0,
            color VARCHAR(20) NOT NULL DEFAULT '#FF6B9D',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ
        )""",
        """CREATE TABLE IF NOT EXISTS nail_staff (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            color VARCHAR(20) NOT NULL DEFAULT '#FF6B9D',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS nail_time_slots (
            id SERIAL PRIMARY KEY,
            slot_date VARCHAR(10) NOT NULL,
            start_time VARCHAR(5) NOT NULL,
            end_time VARCHAR(5) NOT NULL,
            max_bookings INTEGER NOT NULL DEFAULT 1,
            is_available BOOLEAN NOT NULL DEFAULT TRUE,
            staff_id INTEGER REFERENCES nail_staff(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nail_time_slots_date ON nail_time_slots (slot_date)",
        """CREATE TABLE IF NOT EXISTS nail_bookings (
            id SERIAL PRIMARY KEY,
            booking_ref VARCHAR(20) UNIQUE NOT NULL,
            slot_id INTEGER REFERENCES nail_time_slots(id) ON DELETE SET NULL,
            service_id INTEGER REFERENCES nail_services(id) ON DELETE SET NULL,
            staff_id INTEGER REFERENCES nail_staff(id) ON DELETE SET NULL,
            customer_name VARCHAR(255) NOT NULL,
            customer_phone VARCHAR(20) NOT NULL,
            customer_note TEXT,
            slot_date VARCHAR(10), start_time VARCHAR(5), end_time VARCHAR(5),
            service_name VARCHAR(255),
            deposit_amount NUMERIC(10,2), deposit_cents INTEGER, deposit_total NUMERIC(10,2),
            payment_proof TEXT, slip_verify_status VARCHAR(30), slip_verify_result TEXT,
            status VARCHAR(30) NOT NULL DEFAULT 'held',
            held_until TIMESTAMPTZ, hold_token VARCHAR(64) UNIQUE,
            admin_note TEXT, is_walkin BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_status ON nail_bookings (status)",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_hold_token ON nail_bookings (hold_token)",
        # customer_line หายไปจาก CREATE TABLE เดิม — ทำให้ทุกการจองพัง (column does not exist) บนฐานข้อมูลที่สร้างตารางไว้ก่อนหน้านี้
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS customer_line VARCHAR(100)",
        """CREATE TABLE IF NOT EXISTS nail_gallery (
            id SERIAL PRIMARY KEY,
            image_url VARCHAR(1000) NOT NULL,
            caption VARCHAR(255),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        # ลบ duplicate services ที่เกิดจากไม่มี unique constraint (ก่อนสร้าง index)
        # เก็บ row ที่ id น้อยสุดของแต่ละชื่อไว้
        "DELETE FROM nail_services a USING nail_services b WHERE a.id > b.id AND a.name = b.name",
        # สร้าง unique constraint บน name — ป้องกัน duplicate จากนี้ไป
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_nail_services_name ON nail_services (name)",
        # Seed default services (ใช้ ON CONFLICT (name) ได้แล้วเพราะมี unique index)
        "INSERT INTO nail_services (name, description, duration_minutes, price, color, is_active, sort_order) VALUES ('เพนท์เจล', 'ทำเล็บเจลสีพื้น', 90, 350, '#FF6B9D', TRUE, 1) ON CONFLICT (name) DO NOTHING",
        "INSERT INTO nail_services (name, description, duration_minutes, price, color, is_active, sort_order) VALUES ('อะคริลิค', 'ต่อเล็บอะคริลิค', 120, 550, '#C084FC', TRUE, 2) ON CONFLICT (name) DO NOTHING",
        "INSERT INTO nail_services (name, description, duration_minutes, price, color, is_active, sort_order) VALUES ('เพนท์ธรรมดา', 'เพนท์สีทาเล็บทั่วไป', 45, 150, '#FB7185', TRUE, 3) ON CONFLICT (name) DO NOTHING",
        "INSERT INTO nail_services (name, description, duration_minutes, price, color, is_active, sort_order) VALUES ('ออกแบบลาย', 'ออกแบบลายเล็บพิเศษ', 60, 200, '#F472B6', TRUE, 4) ON CONFLICT (name) DO NOTHING",

        # ── Weekly recurring slot templates ─────────────────────────────────────
        """CREATE TABLE IF NOT EXISTS nail_slot_templates (
            id SERIAL PRIMARY KEY,
            day_of_week INTEGER NOT NULL UNIQUE,
            is_open BOOLEAN NOT NULL DEFAULT FALSE,
            start_time VARCHAR(5) NOT NULL DEFAULT '09:00',
            rounds_count INTEGER NOT NULL DEFAULT 0,
            round_minutes INTEGER NOT NULL DEFAULT 60,
            gap_minutes INTEGER NOT NULL DEFAULT 0,
            max_bookings INTEGER NOT NULL DEFAULT 1,
            staff_id INTEGER REFERENCES nail_staff(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ
        )""",

        # nail_slot_templates: gap_minutes / max_bookings / staff_id ถูกเพิ่มเข้า CREATE TABLE ทีหลัง
        # → ฐานข้อมูลที่สร้างตารางในรุ่นแรกจะไม่มีคอลัมน์เหล่านี้ ทำให้ GET /admin/slot-templates พัง (500)
        "ALTER TABLE nail_slot_templates ADD COLUMN IF NOT EXISTS gap_minutes INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE nail_slot_templates ADD COLUMN IF NOT EXISTS max_bookings INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE nail_slot_templates ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES nail_staff(id) ON DELETE SET NULL",
        # nail_time_slots: max_bookings / staff_id ถูกเพิ่มเข้า CREATE TABLE ทีหลังเช่นกัน
        "ALTER TABLE nail_time_slots ADD COLUMN IF NOT EXISTS max_bookings INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE nail_time_slots ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES nail_staff(id) ON DELETE SET NULL",

        # ── Link nail bookings to customer wallet accounts ──────────────────────
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)",
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS wallet_refunded BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS price_1m NUMERIC(10,2)",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS price_3m NUMERIC(10,2)",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS price_6m NUMERIC(10,2)",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS price_12m NUMERIC(10,2)",
        "ALTER TABLE nail_renewal_requests ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(20) NOT NULL DEFAULT 'bank_slip'",
        # ข้อมูลเก่า: คำขอที่จ่ายด้วยซอง TrueMoney ถูกเก็บโดยใส่ prefix "voucher:" ไว้ใน slip_image —
        # แปลงเป็น payment_channel='angpao' ให้ตรงกับของจริง (รันครั้งเดียว ไม่กระทบแถวที่ตั้งค่าไว้แล้ว)
        "UPDATE nail_renewal_requests SET payment_channel = 'angpao' WHERE slip_image LIKE 'voucher:%' AND payment_channel = 'bank_slip'",
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'slip'",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_customer_id ON nail_bookings (customer_id)",
        # deposit_cents / deposit_total อาจหายถ้า table ถูกสร้างก่อน columns นี้จะถูกเพิ่ม
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS deposit_cents INTEGER",
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS deposit_total NUMERIC(10,2)",

        # ── ค่ามัดจำแยกตามบริการ — บริการที่ราคาต่างกันควรมัดจำไม่เท่ากัน ──────────
        "ALTER TABLE nail_services ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2)",

        # ── Multi-shop: shops table + shop_id ทุกตาราง nail_* ────────────────────
        # เดิมระบบสมมติว่ามีร้านเดียวเท่านั้น (nail_shop_settings id=1) — ตอนนี้แยกเป็นตาราง shops
        # และเพิ่ม shop_id ในทุกตารางธุรกิจของระบบจองคิว เพื่อให้ 1 DB รองรับได้หลายร้าน
        """CREATE TABLE IF NOT EXISTS shops (
            id SERIAL PRIMARY KEY,
            slug VARCHAR(100) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            admin_passcode_hash VARCHAR(255),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ
        )""",
        # สร้างร้าน default (id=1) จากข้อมูลร้านที่มีอยู่แล้วในระบบ — ทุกแถวเดิมทั้งหมดถือเป็นของร้านนี้
        """INSERT INTO shops (id, slug, name, is_active)
           SELECT 1, 'default', COALESCE((SELECT shop_name FROM nail_shop_settings ORDER BY id LIMIT 1), 'ร้านทำเล็บ'), TRUE
           WHERE NOT EXISTS (SELECT 1 FROM shops WHERE id = 1)""",
        "SELECT setval('shops_id_seq', (SELECT COALESCE(MAX(id), 1) FROM shops))",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_services ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_staff ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_slot_templates ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_time_slots ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_bookings ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_gallery ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        "ALTER TABLE nail_renewal_requests ALTER COLUMN shop_id SET DEFAULT 1",
        "ALTER TABLE nail_api_stats ADD COLUMN IF NOT EXISTS shop_id INTEGER NOT NULL DEFAULT 1 REFERENCES shops(id)",
        # index สำหรับ query ตาม shop (ทุกตารางธุรกิจต้องกรองด้วย shop_id เสมอในโค้ดที่รองรับ multi-shop)
        "CREATE INDEX IF NOT EXISTS ix_nail_shop_settings_shop_id ON nail_shop_settings (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_services_shop_id ON nail_services (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_staff_shop_id ON nail_staff (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_time_slots_shop_id ON nail_time_slots (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_bookings_shop_id ON nail_bookings (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_gallery_shop_id ON nail_gallery (shop_id)",
        "CREATE INDEX IF NOT EXISTS ix_nail_renewal_requests_shop_id ON nail_renewal_requests (shop_id)",
        # nail_slot_templates: เดิม unique เดี่ยวที่ day_of_week (ร้านเดียว) → ต้องเปลี่ยนเป็น unique ต่อร้าน (shop_id, day_of_week)
        # ใช้ callable เพราะ SQLAlchemy text() ตีความ $ เป็น bind parameter ทำให้ PL/pgSQL ใช้ไม่ได้
        _drop_single_col_unique_on_day_of_week,
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_nail_slot_templates_shop_day ON nail_slot_templates (shop_id, day_of_week)",
        # nail_api_stats: เดิม unique เดี่ยวที่ stat_date (ร้านเดียว) → ต้องเปลี่ยนเป็น unique ต่อร้าน (shop_id, stat_date)
        "ALTER TABLE nail_api_stats DROP CONSTRAINT IF EXISTS nail_api_stats_stat_date_key",
        "CREATE UNIQUE INDEX IF NOT EXISTS uix_nail_api_stats_shop_date ON nail_api_stats (shop_id, stat_date)",

        # ── Per-shop API keys (Telegram bot token, Slip2Go key, etc.) ─────────────
        """CREATE TABLE IF NOT EXISTS nail_shop_api_keys (
            id SERIAL PRIMARY KEY,
            shop_id INTEGER NOT NULL UNIQUE REFERENCES shops(id),
            telegram_bot_token VARCHAR(500),
            admin_group_id VARCHAR(100),
            slip2go_api_key VARCHAR(500),
            slip_verify_mode VARCHAR(20) NOT NULL DEFAULT 'off',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        )""",
        "CREATE INDEX IF NOT EXISTS ix_nail_shop_api_keys_shop_id ON nail_shop_api_keys (shop_id)",

        # ── service_section_emoji — อีโมจิส่วนหัวบริการ (เจ้าของร้านแก้ได้เอง) ───────
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS service_section_emoji VARCHAR(20) DEFAULT '💅'",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS show_why_choose_section BOOLEAN NOT NULL DEFAULT TRUE",
        "ALTER TABLE nail_shop_settings ADD COLUMN IF NOT EXISTS why_choose_custom_text TEXT",
    ]
    from sqlalchemy import text
    with engine.connect() as conn:
        for step in migrations:
            try:
                if callable(step):
                    # Python callable — รับ conn เป็น argument, จัดการ commit เอง
                    step(conn)
                else:
                    conn.execute(text(step))
                    conn.commit()
            except Exception as e:
                conn.rollback()  # ล้าง aborted transaction ก่อนไปต่อ
                logger.warning(f"Migration skipped (probably already applied): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import time
    from backend.database import engine, Base
    if engine is not None:
        # Neon serverless อาจต้อง cold-start — retry สูงสุด 3 ครั้ง
        for attempt in range(1, 4):
            try:
                Base.metadata.create_all(bind=engine)
                logger.info("Database tables created/verified")
                break
            except Exception as e:
                if attempt < 3:
                    logger.warning(f"DB connect attempt {attempt} failed ({e}), retrying in 5s…")
                    time.sleep(5)
                else:
                    logger.error(f"DB connect failed after 3 attempts: {e}")
        try:
            _run_migrations(engine)
            logger.info("Database migrations applied")
        except Exception as e:
            logger.error(f"Migration error: {e}")
        try:
            _run_cleanup(engine)
            logger.info("Startup cleanup completed")
        except Exception as e:
            logger.warning(f"Startup cleanup error (non-fatal): {e}")
    else:
        logger.warning("Skipping DB init — DATABASE_URL not set")

    if settings.bot_token and settings.webhook_url:
        try:
            from backend import bot as bot_module
            await bot_module.setup_webhook(settings.webhook_url)
        except Exception as e:
            logger.warning(f"Could not set main bot webhook on startup: {e}")
    else:
        logger.warning("BOT_TOKEN or WEBHOOK_URL not set — skipping webhook setup")

    yield
    logger.info("Shutting down")


app = FastAPI(
    title="Digital Product Store API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    # หมายเหตุ: ระบบ auth ใช้ Bearer token ใน header ไม่ใช้ cookie ดังนั้นไม่จำเป็นต้อง
    # allow_credentials=True (และเบราว์เซอร์ก็บล็อกการรวม wildcard origin กับ credentials อยู่แล้ว)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


from fastapi import Request
from fastapi.responses import JSONResponse


@app.exception_handler(Exception)
async def _log_unhandled_exceptions(request: Request, exc: Exception):
    """
    ดักทุก error ที่ไม่ได้ถูกจัดการไว้แล้ว log ให้เห็น traceback เต็มๆ ใน server log
    (ไม่งั้นฝั่งลูกค้าจะเห็นแค่ "เกิดข้อผิดพลาด (500)" โดยไม่รู้สาเหตุ และหาสาเหตุยากมาก)
    """
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง"},
    )

from backend.routes.products import router as products_router
from backend.routes.orders import router as orders_router
from backend.routes.admin import router as admin_router
from backend.routes.auth import router as auth_router
from backend.routes.announcements import router as announcements_router
from backend.routes.finance import router as finance_router
from backend.routes.wallet import router as wallet_router
from backend.routes.gafiw import router as gafiw_router
from backend.routes.banners import router as banners_router
from backend.routes.upload import router as upload_router
from backend.routes.nail import router as nail_router
from backend.webhook import router as webhook_router

app.include_router(products_router, prefix="/api")
app.include_router(orders_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(announcements_router, prefix="/api")
app.include_router(finance_router, prefix="/api")
app.include_router(wallet_router, prefix="/api")
app.include_router(gafiw_router, prefix="/api")
app.include_router(banners_router, prefix="/api")
app.include_router(upload_router, prefix="/api")
app.include_router(nail_router)
app.include_router(webhook_router)


# ต้องประกาศ route นี้ "ก่อน" catch-all SPA route (serve_spa) ด้านล่าง
# ไม่งั้น FastAPI จะจับคู่ catch-all "/{full_path:path}" ก่อนเสมอ (จับคู่ตามลำดับที่ประกาศ)
# ทำให้ /api/healthz (และ route อื่นที่ประกาศทีหลัง) เข้าไม่ถึงเลยบน production — เจอ 404 Not Found
@app.get("/api/healthz")
async def healthz():
    return {
        "status": "ok",
        "bot_configured": bool(settings.bot_token),
        "database_configured": bool(settings.database_url),
    }


# On Vercel the filesystem is read-only except /tmp; use /tmp/uploads there.
_IS_VERCEL = bool(os.environ.get("VERCEL"))
UPLOADS_DIR = "/tmp/uploads" if _IS_VERCEL else os.path.join(os.path.dirname(__file__), "..", "uploads")
try:
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
except Exception as _e:
    logger.warning(f"Could not mount /uploads directory: {_e}")

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts", "store", "dist", "public")

if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
else:
    @app.get("/", include_in_schema=False)
    async def root():
        return {"message": "Digital Product Store API is running. Add env vars and build the frontend."}


