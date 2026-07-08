from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, Boolean, BigInteger, ForeignKey
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

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    telegram_username = Column(String(255), unique=True, nullable=True, index=True)
    telegram_user_id = Column(BigInteger, unique=True, nullable=True, index=True)
    balance = Column(Numeric(12, 2), nullable=False, default=0)
    pin_hash = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class TopupRequest(Base):
    __tablename__ = "topup_requests"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
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
#  Nail Salon Booking System
# ─────────────────────────────────────────────────────────────────────────────

class NailShopSettings(Base):
    """การตั้งค่าร้านทำเล็บ (singleton row id=1)"""
    __tablename__ = "nail_shop_settings"

    id = Column(Integer, primary_key=True, index=True)
    shop_name = Column(String(255), nullable=False, default="ร้านทำเล็บ")
    shop_logo_url = Column(String(1000), nullable=True)
    shop_tagline = Column(String(500), nullable=True, default="ทำเล็บสวย สไตล์คุณ")
    ig_url = Column(String(500), nullable=True)
    fb_url = Column(String(500), nullable=True)
    line_oa_url = Column(String(500), nullable=True)
    tiktok_url = Column(String(500), nullable=True)
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
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailService(Base):
    """บริการทำเล็บ เช่น เพนท์เจล, อะคริลิค, เพนท์ธรรมดา"""
    __tablename__ = "nail_services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, default=60, nullable=False)
    price = Column(Numeric(10, 2), default=0, nullable=False)
    color = Column(String(20), default="#FF6B9D", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailStaff(Base):
    """ช่างทำเล็บ"""
    __tablename__ = "nail_staff"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    color = Column(String(20), default="#FF6B9D", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NailTimeSlot(Base):
    """ช่วงเวลาที่แอดมินเปิดให้จอง"""
    __tablename__ = "nail_time_slots"

    id = Column(Integer, primary_key=True, index=True)
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
    booking_ref = Column(String(20), unique=True, nullable=False, index=True)  # NB-0001
    slot_id = Column(Integer, ForeignKey("nail_time_slots.id"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey("nail_services.id"), nullable=True)
    staff_id = Column(Integer, ForeignKey("nail_staff.id"), nullable=True)
    customer_name = Column(String(255), nullable=False)
    customer_phone = Column(String(20), nullable=False)
    customer_line = Column(String(100), nullable=True)
    customer_note = Column(Text, nullable=True)
    slot_date = Column(String(10), nullable=True)    # snapshot
    start_time = Column(String(5), nullable=True)    # snapshot
    end_time = Column(String(5), nullable=True)      # snapshot
    service_name = Column(String(255), nullable=True)  # snapshot
    deposit_amount = Column(Numeric(10, 2), nullable=True)
    deposit_cents = Column(Integer, nullable=True)    # random 1–99 สตางค์
    deposit_total = Column(Numeric(10, 2), nullable=True)  # deposit_amount + cents/100
    payment_proof = Column(Text, nullable=True)       # URL หรือ base64
    slip_verify_status = Column(String(30), nullable=True)
    slip_verify_result = Column(Text, nullable=True)
    # held | pending_payment | confirmed | cancelled | completed | walkin
    status = Column(String(30), nullable=False, default="held", index=True)
    held_until = Column(DateTime(timezone=True), nullable=True)
    hold_token = Column(String(64), unique=True, nullable=True, index=True)
    admin_note = Column(Text, nullable=True)
    is_walkin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class NailGallery(Base):
    """แกลเลอรีผลงานลายเล็บ"""
    __tablename__ = "nail_gallery"

    id = Column(Integer, primary_key=True, index=True)
    image_url = Column(String(1000), nullable=False)
    caption = Column(String(255), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NailRenewalRequest(Base):
    """คำขอต่ออายุการเช่าระบบ"""
    __tablename__ = "nail_renewal_requests"

    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, nullable=False, default=1)
    duration_months = Column(Integer, nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    slip_image = Column(Text, nullable=False)          # base64 data URI
    status = Column(String(20), nullable=False, default="pending", index=True)
    admin_note = Column(Text, nullable=True)
    requested_at = Column(DateTime(timezone=True), server_default=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    new_expired_at = Column(DateTime(timezone=True), nullable=True)
