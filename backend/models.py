from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, Boolean, BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from backend.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Numeric(10, 2), nullable=False)
    cost = Column(Numeric(10, 2), nullable=True)  # ต้นทุนสินค้า (gafiw) — กำไร = price - cost
    fake_discount_price = Column(Numeric(10, 2), nullable=True)
    image_url = Column(String(500), nullable=True)
    image_urls = Column(Text, nullable=True)
    telegram_group_ids = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False, server_default="0")
    is_featured = Column(Boolean, default=False, nullable=False, server_default="false")
    badge_text = Column(String(50), nullable=True)
    badge_color = Column(String(20), nullable=True)
    sales_count = Column(Integer, default=0, nullable=False, server_default="0")
    catalog_group = Column(String(1), default="A", nullable=False, server_default="A")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    telegram_user_id = Column(BigInteger, nullable=True, index=True)
    telegram_username = Column(String(255), nullable=True)
    telegram_first_name = Column(String(255), nullable=True)
    product_id = Column(Integer, nullable=False)
    product_name = Column(String(255), nullable=False)
    payment_proof = Column(Text, nullable=True)
    payment_type = Column(String(50), nullable=False, default="slip")
    status = Column(String(50), nullable=False, default="pending")
    admin_message_id = Column(BigInteger, nullable=True)
    link_sent = Column(Boolean, default=False, nullable=False)
    invite_links = Column(Text, nullable=True)
    phone_number = Column(String(20), nullable=True)
    slip_verify_status = Column(String(20), nullable=True)
    slip_verify_result = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(BigInteger, nullable=False)
    otp_code = Column(String(8), nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)


class StoreSettings(Base):
    __tablename__ = "store_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    images = Column(Text, nullable=True)
    font_size = Column(String(10), nullable=False, default="base")
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class FinanceEntry(Base):
    __tablename__ = "finance_entries"

    id = Column(Integer, primary_key=True, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    description = Column(String(255), nullable=False)
    admin_name = Column(String(100), nullable=False)
    entry_type = Column(String(50), nullable=False, default="income")
    order_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AdminLog(Base):
    __tablename__ = "admin_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_name = Column(String(100), nullable=False)
    action = Column(String(100), nullable=False)
    details = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        # (email, shop_id) composite unique — แต่ละร้านมี customer registry แยกกัน
        # email เดียวกันสมัครได้หลายร้าน แต่ละร้านมี PIN และ balance เป็นของตัวเอง
        UniqueConstraint("email", "shop_id", name="uq_customer_email_shop"),
    )

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=True, index=True)  # unique ถูกย้ายไปเป็น composite กับ shop_id
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=True, index=True)  # ร้านที่ลูกค้าสังกัด
    telegram_username = Column(String(255), unique=True, nullable=True, index=True)
    telegram_user_id = Column(BigInteger, unique=True, nullable=True, index=True)
    balance = Column(Numeric(12, 2), nullable=False, default=0)
    pin_hash = Column(String(255), nullable=True)
    display_name = Column(String(255), nullable=True)
    phone_number = Column(String(30), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TopupRequest(Base):
    __tablename__ = "topup_requests"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=True, index=True)  # ร้านที่ลูกค้าเติมเงิน (NULL = shop 1 legacy)
    topup_type = Column(String(20), nullable=False, default="slip")
    amount = Column(Numeric(12, 2), nullable=True)
    payment_proof = Column(Text, nullable=True)
    voucher_code = Column(String(100), nullable=True, unique=True)
    status = Column(String(20), nullable=False, default="pending")
    slip_verify_status = Column(String(30), nullable=True)
    slip_verify_result = Column(Text, nullable=True)
    truemoney_result = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=True, index=True)  # ร้านที่ทำธุรกรรม (NULL = shop 1 legacy)
    txn_type = Column(String(20), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    description = Column(String(300), nullable=True)
    ref_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EmailOTPSession(Base):
    __tablename__ = "email_otp_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String(64), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    otp_code = Column(String(6), nullable=True)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)


class GafiwProduct(Base):
    """เก็บสถานะ enable/disable และ price markup ของสินค้าจาก gafiwshop.xyz"""
    __tablename__ = "gafiw_products"

    id = Column(Integer, primary_key=True, index=True)
    type_id = Column(String(100), unique=True, nullable=False, index=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    price_markup = Column(Numeric(10, 2), nullable=False, default=0)
    markup_percent = Column(Numeric(6, 2), nullable=False, default=-1, server_default="-1")
    fake_price = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Banner(Base):
    """Hero banner สำหรับแสดงโปรโมชั่นที่หน้าร้าน"""
    __tablename__ = "banners"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=True)
    subtitle = Column(String(500), nullable=True)
    image_url = Column(String(1000), nullable=True)
    link_url = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class GafiwOrder(Base):
    """บันทึกประวัติการซื้อสินค้าจาก gafiwshop.xyz ไว้ในระบบเราเอง
    (เก็บ textdb/รหัสสินค้าไว้ถาวร ไม่ต้องพึ่ง history API ของ gafiwshop)"""
    __tablename__ = "gafiw_orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    type_id = Column(String(100), nullable=True)
    product_name = Column(String(255), nullable=False)
    textdb = Column(Text, nullable=True)
    image_api = Column(String(1000), nullable=True)
    price = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────────────────────
#  Nail Salon Booking System — Multi-shop
# ─────────────────────────────────────────────────────────────────────────────

class Shop(Base):
    """
    ร้านหนึ่งร้านในระบบ multi-tenant — 1 แถว = 1 ร้านที่เช่าใช้ระบบ
    ทุกตาราง nail_* ผูกกับ shop_id เพื่อแยกข้อมูลแต่ละร้านออกจากกันใน DB เดียว
    slug ใช้ทำลิงก์ /r/{slug} (หน้าร้าน) และ /r/{slug}/admin (หลังร้าน)
    auth_method: 'telegram_otp' (ร้านเก่า) | 'totp' (ร้านใหม่ผ่าน self-registration)
    """
    __tablename__ = "shops"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)  # ใช้ในลิงก์ /r/{slug}
    name = Column(String(255), nullable=False)
    admin_passcode_hash = Column(String(255), nullable=True)  # รหัสเข้าหลังร้านของร้านนี้ (แยกจากร้านอื่น)
    is_active = Column(Boolean, default=True, nullable=False)
    # ── Auth method — telegram_otp (legacy) | totp (new self-registered shops) ──
    auth_method = Column(String(20), nullable=False, server_default="telegram_otp", default="telegram_otp")
    totp_secret = Column(String(200), nullable=True)   # TOTP secret สำหรับร้านที่ใช้ Google Authenticator
    totp_confirmed = Column(Boolean, server_default="false", default=False, nullable=False)  # scanned & confirmed QR แล้ว
    onboarding_token = Column(String(200), nullable=True)   # one-time token สำหรับหน้า onboarding ครั้งแรก
    owner_email = Column(String(255), nullable=True)   # อีเมลเจ้าของร้าน (จาก registration)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailShopSettings(Base):
    """การตั้งค่าร้านทำเล็บ — เดิมเป็น singleton (id=1), ตอนนี้ 1 แถว = 1 ร้าน ผูกกับ shop_id"""
    __tablename__ = "nail_shop_settings"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    shop_name = Column(String(255), nullable=False, default="ร้านทำเล็บ")
    shop_logo_url = Column(String(1000), nullable=True)
    shop_tagline = Column(String(500), nullable=True, default="ทำเล็บสวย สไตล์คุณ")
    ig_url = Column(String(500), nullable=True)
    fb_url = Column(String(500), nullable=True)
    line_oa_url = Column(String(500), nullable=True)
    tiktok_url = Column(String(500), nullable=True)
    map_url = Column(String(500), nullable=True)            # Google Maps / location link แสดงในหน้าร้านและใบเสร็จ
    booking_policy = Column(Text, nullable=True)            # นโยบาย/กฎการจอง — แสดงในใบเสร็จหลังจอง (เช่น "เลทได้ไม่เกิน 10 นาที")
    deposit_amount = Column(Numeric(10, 2), nullable=False, default=200)
    bank_account_number = Column(String(50), nullable=True)
    bank_name = Column(String(100), nullable=True)
    bank_account_name = Column(String(200), nullable=True)
    bank_qr_url = Column(String(1000), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    expired_at = Column(DateTime(timezone=True), nullable=True)   # ใช้สำหรับระบบเช่า
    max_advance_days = Column(Integer, default=14)
    slot_duration_minutes = Column(Integer, default=60)
    closed_dates = Column(Text, nullable=True)  # JSON array of "YYYY-MM-DD"
    # ราคาค่าเช่าระบบต่อรอบ (ตั้งโดย super-admin) — null = ใช้ราคาเริ่มต้นกลาง (RENEWAL_PLANS)
    price_1m = Column(Numeric(10, 2), nullable=True)
    price_3m = Column(Numeric(10, 2), nullable=True)
    price_6m = Column(Numeric(10, 2), nullable=True)
    price_12m = Column(Numeric(10, 2), nullable=True)
    # ช่องทางรับเงินมัดจำจากลูกค้า
    truemoney_phone = Column(String(20), nullable=True)       # เบอร์ TrueMoney สำหรับรับซองอั่งเปา
    # server_default="true" เพื่อให้ create_all() สร้าง column พร้อม DB-level DEFAULT
    accept_bank_transfer = Column(Boolean, server_default="true", default=True, nullable=False)
    accept_truemoney_angpao = Column(Boolean, server_default="true", default=True, nullable=False)
    brand_color = Column(String(20), nullable=True)   # hex สีหลักของร้าน เช่น "#B5174B"
    service_section_emoji = Column(String(20), nullable=True, server_default="💅")   # อีโมจิส่วนหัวบริการ — ใช้ server_default เท่านั้น ไม่ใส่ Python default เพื่อไม่ให้ ORM inject emoji ใน INSERT (ป้องกัน encoding error ถ้า column ยังไม่มีใน prod)
    # "ทำไมต้องเลือกเรา" — บางร้านอยากตั้งกฎ/จุดเด่นเอง บางร้านไม่อยากให้มีเพราะรก จึงต้องเปิด/ปิด และแก้เนื้อหาได้เอง
    show_why_choose_section = Column(Boolean, server_default="true", default=True, nullable=False)
    why_choose_custom_text = Column(Text, nullable=True)  # ถ้าตั้งไว้ จะแสดงข้อความนี้แทนจุดเด่นเริ่มต้น 6 ข้อ
    why_choose_heading = Column(String(500), nullable=True)  # ชื่อหัวข้อแถบ "ทำไมต้องเลือกร้านเรา" — ถ้าไม่ตั้งจะใช้ค่า default
    stats_reset_at = Column(DateTime(timezone=True), nullable=True)  # รีเซ็ตนับยอดสรุป ณ เวลานี้ (NULL = นับจากวันแรก)
    # ── Feature flags ต่อร้าน (superadmin เปิด/ปิดให้ ตั้งปิดไว้ก่อนทุกร้าน) ──────────────────
    # allow_ref_image: ลูกค้าแนบรูปอ้างอิงแบบงาน (brief) ตอนจองคิว เพื่อให้ช่างดูก่อนเริ่มงาน
    allow_ref_image = Column(Boolean, server_default="false", default=False, nullable=False)
    # ประเภทธุรกิจ — ขับเคลื่อน default คำศัพท์/emoji/บริการตอนสร้างร้าน (ดู BUSINESS_TYPE_TEMPLATES ใน routes/nail.py)
    # ไม่ล็อกพฤติกรรมใดๆ ของระบบ ร้านยังแก้ไขทุกอย่างเองได้ปกติ — ใช้เพื่อ personalize ตอนเริ่มต้นเท่านั้น
    business_type = Column(String(30), nullable=False, server_default="nail", default="nail")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailShopApiKeys(Base):
    """API credentials ต่อร้าน — Telegram bot, Slip2Go, etc. (แยกจาก env vars หลัก)"""
    __tablename__ = "nail_shop_api_keys"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, unique=True, index=True)
    telegram_bot_token = Column(String(500), nullable=True)   # Bot token สำหรับส่ง OTP
    admin_group_id = Column(String(100), nullable=True)       # Telegram group/thread ID รับ OTP
    slip2go_api_key = Column(String(500), nullable=True)      # Slip2Go API key (optional)
    slip_verify_mode = Column(String(20), nullable=False, server_default="off", default="off")  # 'auto' | 'off'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailService(Base):
    """บริการทำเล็บ เช่น เพนท์เจล, อะคริลิค, เพนท์ธรรมดา"""
    __tablename__ = "nail_services"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, default=60, nullable=False)
    price = Column(Numeric(10, 2), default=0, nullable=False)
    deposit_amount = Column(Numeric(10, 2), nullable=True)  # ถ้าไม่ตั้ง จะใช้ค่ามัดจำเริ่มต้นของร้าน (nail_shop_settings.deposit_amount)
    color = Column(String(20), default="#FF6B9D", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    image_url = Column(String(2048), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailStaff(Base):
    """ช่างทำเล็บ"""
    __tablename__ = "nail_staff"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(20), default="#FF6B9D", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NailSlotTemplate(Base):
    """เทมเพลตสล็อตประจำสัปดาห์ — ใช้สร้าง nail_time_slots อัตโนมัติทุกวัน"""
    __tablename__ = "nail_slot_templates"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    day_of_week = Column(Integer, nullable=False, index=True)  # 0=จันทร์ ... 6=อาทิตย์ (unique ร่วมกับ shop_id ผ่าน migration index)
    is_open = Column(Boolean, default=False, nullable=False)
    start_time = Column(String(5), nullable=False, default="09:00")  # HH:MM รอบแรกเริ่มกี่โมง
    rounds_count = Column(Integer, nullable=False, default=0)        # เปิดกี่รอบต่อวัน
    round_minutes = Column(Integer, nullable=False, default=60)      # แต่ละรอบกี่นาที
    gap_minutes = Column(Integer, nullable=False, default=0)         # เว้นระหว่างรอบกี่นาที
    max_bookings = Column(Integer, nullable=False, default=1)        # รับกี่คิวต่อรอบ
    staff_id = Column(Integer, ForeignKey("nail_staff.id"), nullable=True)
    extra_blocks = Column(Text, nullable=True)  # JSON array of {start_time, rounds_count, round_minutes, gap_minutes, max_bookings} — บล็อกเวลาเพิ่มเติมนอกจากบล็อกแรก
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailTimeSlot(Base):
    """ช่วงเวลาที่แอดมินเปิดให้จอง"""
    __tablename__ = "nail_time_slots"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    slot_date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(String(5), nullable=False)              # HH:MM
    end_time = Column(String(5), nullable=False)
    max_bookings = Column(Integer, default=1, nullable=False)
    is_available = Column(Boolean, default=True, nullable=False)
    staff_id = Column(Integer, ForeignKey("nail_staff.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NailBooking(Base):
    """การจองคิวทำเล็บ"""
    __tablename__ = "nail_bookings"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    booking_ref = Column(String(20), unique=True, nullable=False, index=True)  # NB-0001
    slot_id = Column(Integer, ForeignKey("nail_time_slots.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("nail_services.id"), nullable=True)
    staff_id = Column(Integer, ForeignKey("nail_staff.id"), nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)  # ผูกกับบัญชีลูกค้า (ถ้าล็อกอิน)
    payment_method = Column(String(20), nullable=False, default="slip")  # slip | wallet
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(20), nullable=False)
    customer_line = Column(String(100), nullable=True)
    customer_note = Column(Text, nullable=True)
    slot_date = Column(String(10), nullable=True)    # snapshot
    start_time = Column(String(5), nullable=True)    # snapshot
    end_time = Column(String(5), nullable=True)      # snapshot
    service_name = Column(String(255), nullable=True)  # snapshot
    deposit_amount = Column(Numeric(10, 2), nullable=True)
    deposit_cents = Column(Integer, nullable=True)    # legacy: เดิมสุ่ม 1–99 สตางค์ ตอนนี้ไม่ใช้แล้ว เก็บไว้เป็น 0
    deposit_total = Column(Numeric(10, 2), nullable=True)  # ยอดมัดจำเลขกลมๆ (ไม่มีเศษสตางค์) — ร้านค้าตรวจยอดโอนเอง
    payment_proof = Column(Text, nullable=True)       # URL หรือ base64
    ref_image = Column(Text, nullable=True)           # รูปอ้างอิงแบบงาน (brief) จากลูกค้า — base64 data URI, เฉพาะร้านที่ allow_ref_image=True
    slip_verify_status = Column(String(30), nullable=True)
    slip_verify_result = Column(Text, nullable=True)
    # held | pending_payment | confirmed | cancelled | completed | walkin
    status = Column(String(30), nullable=False, default="held", index=True)
    held_until = Column(DateTime(timezone=True), nullable=True)
    hold_token = Column(String(64), unique=True, nullable=True, index=True)
    admin_note = Column(Text, nullable=True)
    is_walkin = Column(Boolean, default=False, nullable=False)
    wallet_refunded = Column(Boolean, nullable=False, default=False)  # กันคืนเครดิตซ้ำ (ล็อกแถวก่อนเช็ค/ตั้งค่า)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailGallery(Base):
    """แกลเลอรีผลงานลายเล็บ"""
    __tablename__ = "nail_gallery"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    image_url = Column(String(1000), nullable=False)
    caption = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NailRenewalRequest(Base):
    """คำขอต่ออายุการเช่าระบบ"""
    __tablename__ = "nail_renewal_requests"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    duration_months = Column(Integer, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    slip_image = Column(Text, nullable=False)          # base64 data URI (หรือ "voucher:<code>")
    payment_channel = Column(String(20), nullable=False, default="bank_slip")  # bank_slip | angpao
    status = Column(String(20), nullable=False, default="pending", index=True)
    admin_note = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    new_expired_at = Column(DateTime(timezone=True), nullable=True)


class NailApiStats(Base):
    """นับ API request สาธารณะต่อวัน — ใช้ประมาณการทราฟฟิก/โหลดของระบบ"""
    __tablename__ = "nail_api_stats"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=False, default=1, index=True)
    stat_date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD (Thai time)
    request_count = Column(Integer, nullable=False, default=0, server_default="0")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class SystemConfig(Base):
    """Key-value store สำหรับ config ของระบบ — เช่น superadmin_totp_secret"""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ShopPlan(Base):
    """แพ็กเกจการสมัครใช้ระบบ — Founding Member, Pro, Business ฯลฯ"""
    __tablename__ = "shop_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)               # ชื่อแพ็กเกจ เช่น "Founding Member"
    description = Column(Text, nullable=True)                # รายละเอียดสำหรับแสดงในหน้าสมัคร
    price = Column(Numeric(10, 2), nullable=False)           # ราคา (บาท)
    is_active = Column(Boolean, server_default="true", default=True, nullable=False)
    total_slots = Column(Integer, nullable=True)             # จำนวน slot ทั้งหมด (null = ไม่จำกัด)
    registered_count = Column(Integer, server_default="0", default=0, nullable=False)  # ลงทะเบียนไปแล้วกี่ร้าน
    expiry_days = Column(Integer, nullable=True, default=30) # จำนวนวันที่ได้รับเมื่อสมัคร (null = ไม่จำกัด)
    sort_order = Column(Integer, nullable=False, server_default="0", default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ShopRegistration(Base):
    """คำขอสมัครร้านใหม่จากลูกค้า — pending → approved (สร้างร้านอัตโนมัติ) | rejected"""
    __tablename__ = "shop_registrations"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("shop_plans.id"), nullable=True)
    shop_name = Column(String(255), nullable=False)          # ชื่อร้าน
    slug = Column(String(100), nullable=False)               # slug ที่ต้องการ
    owner_email = Column(String(255), nullable=False)        # อีเมลเจ้าของร้าน
    owner_line = Column(String(100), nullable=True)          # Line ID (optional)
    slip_image = Column(Text, nullable=True)                 # base64 สลิปโอนเงิน
    amount_paid = Column(Numeric(10, 2), nullable=True)      # ยอดที่โอนมา (จาก Slip2Go)
    status = Column(String(20), nullable=False, server_default="pending", default="pending")  # pending|approved|rejected
    auto_verified = Column(Boolean, server_default="false", default=False, nullable=False)  # Slip2Go ผ่านอัตโนมัติ
    payment_channel = Column(String(20), server_default="bank_slip", default="bank_slip", nullable=False)  # "bank_slip" | "angpao"
    voucher_code = Column(String(200), nullable=True)   # TrueMoney voucher code (angpao channel)
    reject_reason = Column(String(500), nullable=True)
    shop_id = Column(Integer, ForeignKey("shops.id"), nullable=True)  # หลัง approve แล้วชี้ไปที่ร้าน
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
