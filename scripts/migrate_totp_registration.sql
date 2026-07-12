-- Migration: Add TOTP + Self-Registration support
-- Run once on production DB (Neon)
-- Safe to re-run (uses IF NOT EXISTS / IF EXISTS)

-- 1. New columns on shops table
ALTER TABLE shops ADD COLUMN IF NOT EXISTS auth_method VARCHAR(20) NOT NULL DEFAULT 'telegram_otp';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(200);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS totp_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS onboarding_token VARCHAR(200);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255);

-- 2. system_config — key-value store (superadmin TOTP secret ฯลฯ)
CREATE TABLE IF NOT EXISTS system_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 3. shop_plans — แพ็กเกจสมัครใช้ระบบ
CREATE TABLE IF NOT EXISTS shop_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    total_slots INTEGER,               -- NULL = ไม่จำกัด
    registered_count INTEGER NOT NULL DEFAULT 0,
    expiry_days INTEGER DEFAULT 30,    -- วันที่ได้รับเมื่อสมัคร
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 4. shop_registrations — คำขอสมัครร้านใหม่
CREATE TABLE IF NOT EXISTS shop_registrations (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES shop_plans(id),
    shop_name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    owner_email VARCHAR(255) NOT NULL,
    owner_line VARCHAR(100),
    slip_image TEXT,
    amount_paid NUMERIC(10,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    auto_verified BOOLEAN NOT NULL DEFAULT FALSE,
    reject_reason VARCHAR(500),
    shop_id INTEGER REFERENCES shops(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- 5. Seed: Founding Member plan (20 slots, 99 บาท, ได้ทุกอย่าง 30 วัน)
INSERT INTO shop_plans (name, description, price, total_slots, expiry_days, sort_order)
VALUES (
    'Founding Member',
    'สำหรับ 20 ร้านแรก — ราคาพิเศษสุด ได้ใช้ฟีเจอร์ทั้งหมด 30 วัน (ต่ออายุได้ในภายหลัง)',
    99.00,
    20,
    30,
    0
)
ON CONFLICT DO NOTHING;
