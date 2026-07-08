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
        "INSERT INTO nail_shop_settings (id, shop_name, deposit_amount, max_advance_days, slot_duration_minutes, is_active) VALUES (1, 'ร้านทำเล็บ', 200, 14, 60, TRUE) ON CONFLICT (id) DO NOTHING",
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
    ]
    from sqlalchemy import text
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception as e:
                conn.rollback()  # ล้าง aborted transaction ก่อนไปต่อ
                logger.warning(f"Migration skipped (probably already applied): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.database import engine, Base
    if engine is not None:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


