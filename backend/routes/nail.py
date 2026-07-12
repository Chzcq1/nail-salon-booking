"""
Nail Salon Booking System — API Routes
Public  : GET /api/nail/settings, /api/nail/gallery, /api/nail/services, /api/nail/slots
Booking : POST /api/nail/booking/hold, /pay, GET /api/nail/booking/status/:token
Admin   : /api/nail/admin/* (requires admin bearer token)
"""
import json
import logging
import re
import secrets
import string
import time
import jwt as _pyjwt
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header, Request
from pydantic import BaseModel
from sqlalchemy import text, func, case, delete
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.config import get_settings
from backend.database import get_db
from backend.models import (
    NailShopSettings, NailService, NailStaff, NailTimeSlot, NailSlotTemplate,
    NailBooking, NailGallery, NailRenewalRequest, NailApiStats, OTPSession,
    Customer, CreditTransaction, NailShopApiKeys, TopupRequest, EmailOTPSession,
    SystemConfig, ShopPlan, ShopRegistration,
)
from backend.auth import generate_otp, create_admin_token, verify_admin_token, hash_passcode, verify_passcode
from backend.models import Shop
from backend.routes.wallet import get_wallet_customer
import backend.bot as bot_module
from backend.totp_utils import generate_totp_secret, get_totp_uri, get_qr_code_base64, verify_totp as _verify_totp
from backend.email_service import send_custom_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nail", tags=["nail"])

# ─── ประเภทธุรกิจ ───────────────────────────────────────────────────────────
# ใช้ personalize ค่าเริ่มต้นตอนสร้างร้านใหม่เท่านั้น (tagline, emoji, บริการตัวอย่าง)
# ร้านแก้ไขทุกอย่างเองได้ปกติทีหลัง ไม่มีผลต่อ logic การจองใดๆ — เพิ่ม type ใหม่ได้ที่นี่จุดเดียว
BUSINESS_TYPE_TEMPLATES: dict[str, dict] = {
    "nail": {
        "label": "ร้านทำเล็บ",
        "tagline": "ทำเล็บสวย สไตล์คุณ",
        "emoji": "💅",
        "services": [
            {"name": "เพนท์เจล", "duration_minutes": 90, "price": 350, "color": "#FF6B9D"},
            {"name": "อะคริลิค", "duration_minutes": 120, "price": 550, "color": "#C084FC"},
            {"name": "เพนท์ธรรมดา", "duration_minutes": 45, "price": 150, "color": "#FB7185"},
        ],
    },
    "hair": {
        "label": "ร้านตัดผม/ทำผม",
        "tagline": "ตัดผม สไตล์คุณ นัดง่าย ไม่ต้องรอ",
        "emoji": "💇",
        "services": [
            {"name": "ตัดผม", "duration_minutes": 45, "price": 250, "color": "#60A5FA"},
            {"name": "สีผม", "duration_minutes": 120, "price": 1200, "color": "#F472B6"},
            {"name": "ดัด/ยืดผม", "duration_minutes": 150, "price": 1500, "color": "#A78BFA"},
        ],
    },
    "massage": {
        "label": "ร้านนวด",
        "tagline": "ผ่อนคลาย คลายเมื่อย นัดคิวล่วงหน้าได้",
        "emoji": "💆",
        "services": [
            {"name": "นวดแผนไทย 60 นาที", "duration_minutes": 60, "price": 350, "color": "#34D399"},
            {"name": "นวดน้ำมัน 90 นาที", "duration_minutes": 90, "price": 600, "color": "#FBBF24"},
            {"name": "นวดเท้า 30 นาที", "duration_minutes": 30, "price": 200, "color": "#38BDF8"},
        ],
    },
    "spa": {
        "label": "สปา",
        "tagline": "ดูแลผิวและร่างกายแบบครบวงจร",
        "emoji": "🧖",
        "services": [
            {"name": "แพ็กเกจหน้า 60 นาที", "duration_minutes": 60, "price": 800, "color": "#F9A8D4"},
            {"name": "สครับผิวกาย", "duration_minutes": 60, "price": 700, "color": "#FCD34D"},
        ],
    },
    "carwash": {
        "label": "ร้านล้างรถ",
        "tagline": "จองล้างรถล่วงหน้า ไม่ต้องรอคิว",
        "emoji": "🚗",
        "services": [
            {"name": "ล้างรถภายนอก", "duration_minutes": 30, "price": 150, "color": "#60A5FA"},
            {"name": "ล้างรถ + ดูดฝุ่น", "duration_minutes": 60, "price": 300, "color": "#34D399"},
        ],
    },
    "other": {
        "label": "อื่นๆ / จองคิวทั่วไป",
        "tagline": "จองคิวออนไลน์ง่ายๆ ไม่ต้องรอสาย",
        "emoji": "🗓️",
        "services": [],
    },
}

# ─── helpers ────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ประเทศไทยอยู่ UTC+7 ตลอดปี (ไม่มี DST) — ใช้คำนวณ "วันนี้/เวลานี้" ให้ตรงกับความเป็นจริงของร้าน
TH_TZ = timezone(timedelta(hours=7))


def _now_th() -> datetime:
    return _now().astimezone(TH_TZ)


def _increment_api_counter(shop_id: int = 1) -> None:
    """นับ public API request ต่อวัน (Thai time) — รันเป็น background task
    ใช้ session แยก เพื่อไม่กระทบ transaction หลักของ request
    ใช้ UPSERT เพื่อกันเงื่อนไข race condition"""
    from backend.database import SessionLocal
    if not SessionLocal:
        return
    db = SessionLocal()
    try:
        today = _now_th().strftime("%Y-%m-%d")
        db.execute(
            text(
                """
                INSERT INTO nail_api_stats (shop_id, stat_date, request_count)
                VALUES (:shop_id, :d, 1)
                ON CONFLICT (shop_id, stat_date)
                DO UPDATE SET request_count = nail_api_stats.request_count + 1,
                              updated_at = NOW()
                """
            ),
            {"shop_id": shop_id, "d": today},
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _get_shop(db: Session, shop_id: int = 1) -> NailShopSettings:
    shop = db.query(NailShopSettings).filter_by(shop_id=shop_id).first()
    if not shop:
        if shop_id == 1:
            shop = NailShopSettings(shop_id=1)
            db.add(shop)
            db.commit()
            db.refresh(shop)
        else:
            raise HTTPException(status_code=404, detail="ไม่พบข้อมูลร้าน")
    return shop


def _resolve_shop_by_slug(db: Session, shop_slug: Optional[str]) -> Shop:
    """Resolve a Shop row by slug. None/'default' → shop id=1."""
    if not shop_slug or shop_slug == "default":
        shop_row = db.query(Shop).filter_by(id=1).first()
        if not shop_row:
            raise HTTPException(status_code=404, detail="ไม่พบร้านค้า default")
        return shop_row
    shop_row = db.query(Shop).filter_by(slug=shop_slug).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail=f"ไม่พบร้านค้า: {shop_slug}")
    if not shop_row.is_active:
        raise HTTPException(status_code=404, detail="ร้านนี้ปิดให้บริการชั่วคราว")
    return shop_row


def get_shop_by_slug(shop_slug: Optional[str] = None, db: Session = Depends(get_db)) -> Shop:
    """FastAPI dependency: resolve Shop from optional slug query param."""
    return _resolve_shop_by_slug(db, shop_slug)


# Telegram session ID สำหรับ nail admin OTP (ต่างจาก store admin ที่ใช้ 0)
NAIL_ADMIN_SESSION_ID = -1


def _check_admin(authorization: str = Header(None)) -> int:
    """ตรวจสอบ JWT token ที่ได้จาก /api/nail/admin/verify-otp
    Returns shop_id from the token (defaults to 1 for tokens issued before multi-tenant)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    payload = verify_admin_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token หมดอายุหรือไม่ถูกต้อง กรุณาล็อกอินใหม่")
    return int(payload.get("shop_id", 1))


def _gen_ref(booking_id: int) -> str:
    """สร้างเลขอ้างอิงการจองจาก auto-increment ID (thread-safe, no race condition)"""
    return f"NB-{booking_id:04d}"


def _release_expired_holds(db: Session):
    """ปล่อย slot ที่ hold หมดเวลาแล้ว"""
    try:
        db.query(NailBooking).filter(
            NailBooking.status == "held",
            NailBooking.held_until < _now(),
        ).update({"status": "cancelled"})
        db.commit()
    except Exception as e:
        logger.warning(f"release_expired_holds: {e}")
        db.rollback()


def _cleanup_old_otps(db: Session):
    """ลบ OTP ที่หมดอายุหรือใช้แล้ว — ป้องกัน otp_sessions โต เรียกก่อนสร้าง OTP ใหม่ทุกครั้ง"""
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        db.query(OTPSession).filter(
            (OTPSession.expires_at < cutoff) | (OTPSession.is_used == True)
        ).delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        logger.warning(f"cleanup_old_otps: {e}")
        db.rollback()


def _count_confirmed_bookings(db: Session, slot_id: int) -> int:
    """นับ booking ที่ยังใช้งานอยู่ใน slot นี้"""
    return db.query(NailBooking).filter(
        NailBooking.slot_id == slot_id,
        NailBooking.status.in_(["held", "pending_payment", "confirmed"]),
    ).count()


DAY_NAMES_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]


def _ensure_templates_exist(db: Session, shop_id: int = 1):
    """สร้างแถวเทมเพลต 7 วัน (จันทร์–อาทิตย์) ถ้ายังไม่มี"""
    existing_days = {t.day_of_week for t in db.query(NailSlotTemplate).filter_by(shop_id=shop_id).all()}
    changed = False
    for dow in range(7):
        if dow not in existing_days:
            db.add(NailSlotTemplate(day_of_week=dow, is_open=False, shop_id=shop_id))
            changed = True
    if changed:
        db.commit()


def _ensure_slots_for_date(db: Session, shop: NailShopSettings, date_str: str):
    """
    สร้างสล็อตอัตโนมัติจากเทมเพลตประจำสัปดาห์ — ทำงานเฉพาะตอนที่ 'ยังไม่มีสล็อตใดๆ' ของวันนั้นเลย
    เพื่อไม่ไปทับ/ลบสล็อตที่แอดมินเคยแก้ไขเองแล้ว (แก้ครั้งเดียวหลังจากนั้นคุมเองได้เต็มที่)
    """
    shop_id = shop.shop_id
    if shop.closed_dates:
        try:
            closed = json.loads(shop.closed_dates)
            if date_str in closed:
                return
        except Exception:
            pass

    # ตรวจสอบก่อนว่ามีสล็อตของวันนี้อยู่แล้วหรือไม่ — ถ้ามีแล้วข้ามไป (ไม่ทับสล็อตที่แอดมินแก้ไขเอง)
    # ไม่ใช้ advisory lock เพราะ Neon serverless pooler อาจ reject hashtext() ทำให้เกิด 500
    # สำหรับ nail salon admin คนเดียว race condition นี้ไม่มีนัยสำคัญในทางปฏิบัติ
    already = db.query(NailTimeSlot).filter_by(shop_id=shop_id, slot_date=date_str).first()
    if already:
        return

    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return

    tmpl = db.query(NailSlotTemplate).filter_by(shop_id=shop_id, day_of_week=d.weekday(), is_open=True).first()
    if not tmpl or tmpl.rounds_count <= 0:
        return

    try:
        cursor = datetime.strptime(tmpl.start_time, "%H:%M")
    except ValueError:
        return

    def _add_block_slots(start_time_str: str, rounds: int, round_min: int, gap_min: int, max_b: int, staff_id_: Any):
        try:
            cur = datetime.strptime(start_time_str, "%H:%M")
        except ValueError:
            return
        for i in range(rounds):
            s = cur + timedelta(minutes=i * (round_min + gap_min))
            e = s + timedelta(minutes=round_min)
            db.add(NailTimeSlot(
                shop_id=shop_id,
                slot_date=date_str,
                start_time=s.strftime("%H:%M"),
                end_time=e.strftime("%H:%M"),
                max_bookings=max(1, max_b or 1),
                staff_id=staff_id_,
                is_available=True,
            ))

    _add_block_slots(tmpl.start_time, tmpl.rounds_count, tmpl.round_minutes, tmpl.gap_minutes or 0, tmpl.max_bookings or 1, tmpl.staff_id)

    # process extra_blocks — บล็อกเวลาเพิ่มเติมต่อวัน
    if tmpl.extra_blocks:
        try:
            for blk in json.loads(tmpl.extra_blocks):
                _add_block_slots(
                    blk.get("start_time", ""),
                    int(blk.get("rounds_count", 0)),
                    int(blk.get("round_minutes", 60)),
                    int(blk.get("gap_minutes", 0)),
                    int(blk.get("max_bookings", 1)),
                    tmpl.staff_id,
                )
        except Exception:
            pass

    db.commit()

# ─── Admin Auth (2-step: passcode → OTP → JWT) ──────────────────────────────

class NailAdminOTPRequest(BaseModel):
    passcode: str
    shop_slug: Optional[str] = None

class NailAdminOTPVerify(BaseModel):
    otp_code: str
    shop_slug: Optional[str] = None

@router.post("/admin/request-otp")
async def nail_request_otp(body: NailAdminOTPRequest, db: Session = Depends(get_db)):
    """ขั้นที่ 1 — ตรวจรหัสผ่าน แล้วส่ง OTP ไปยัง Telegram group admin"""
    cfg = get_settings()

    # Resolve target shop
    shop_row = _resolve_shop_by_slug(db, body.shop_slug)
    if not shop_row.is_active:
        raise HTTPException(status_code=403, detail="ร้านนี้ปิดให้บริการชั่วคราว")

    # Check passcode: per-shop hash first, then global fallback
    if shop_row.admin_passcode_hash:
        if not verify_passcode(body.passcode.strip(), shop_row.admin_passcode_hash):
            raise HTTPException(status_code=403, detail="รหัสผ่านไม่ถูกต้อง")
    else:
        passcode = cfg.admin_passcode
        if not passcode:
            raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า ADMIN_PASSCODE บนเซิร์ฟเวอร์")
        import hmac as _hmac
        if not _hmac.compare_digest(body.passcode.strip(), passcode.strip()):
            raise HTTPException(status_code=403, detail="รหัสผ่านไม่ถูกต้อง")

    # ── TOTP shops — ไม่ต้องส่ง Telegram; แค่ return ให้ frontend รู้ว่าใช้ TOTP
    if shop_row.auth_method == "totp":
        return {"message": "กรอกรหัส 6 หลักจาก Google Authenticator", "method": "totp"}

    # Load per-shop Telegram credentials FIRST (fail fast before generating OTP)
    shop_keys = db.query(NailShopApiKeys).filter_by(shop_id=shop_row.id).first()
    if not shop_keys or not shop_keys.telegram_bot_token or not shop_keys.admin_group_id:
        raise HTTPException(
            status_code=503,
            detail="ยังไม่ได้ตั้งค่า Telegram Bot สำหรับร้านนี้ กรุณาติดต่อผู้ดูแลระบบ",
        )

    _cleanup_old_otps(db)  # ล้าง OTP เก่าที่หมดอายุ/ใช้แล้วทั่วระบบก่อนสร้างใหม่

    # Use a per-shop OTP session ID to allow concurrent OTP sessions for different shops
    otp_session_id = NAIL_ADMIN_SESSION_ID - shop_row.id  # -1 for shop1, -2 for shop2, etc.

    # ลบ OTP เดิมของร้านนี้ทิ้งทั้งหมดก่อนออกใบใหม่ — ถ้าเคยขอไว้แล้วไม่ได้ใช้ พอกดขอใหม่ก็เลิกใช้ตัวเก่าเลย
    db.query(OTPSession).filter(OTPSession.telegram_id == otp_session_id).delete(synchronize_session=False)
    db.commit()

    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    session = OTPSession(
        telegram_id=otp_session_id,
        otp_code=otp,
        expires_at=expires,
    )
    db.add(session)
    db.commit()

    sent, err_msg = await bot_module.send_otp_with_config(
        shop_keys.telegram_bot_token,
        shop_keys.admin_group_id,
        otp,
    )
    if not sent:
        # Remove the OTP we just committed so there's no dangling record
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=500, detail=f"ส่ง OTP ไม่สำเร็จ: {err_msg}")

    return {"message": "ส่ง OTP ไปยัง Telegram แล้ว"}


@router.post("/admin/verify-otp")
def nail_verify_otp(body: NailAdminOTPVerify, db: Session = Depends(get_db)):
    """ขั้นที่ 2 — ยืนยัน OTP แล้วรับ JWT token"""
    # Resolve target shop
    shop_row = _resolve_shop_by_slug(db, body.shop_slug)
    if not shop_row.is_active:
        raise HTTPException(status_code=403, detail="ร้านนี้ปิดให้บริการชั่วคราว")

    otp_session_id = NAIL_ADMIN_SESSION_ID - shop_row.id

    otp_input = (body.otp_code or "").strip()
    session = (
        db.query(OTPSession)
        .filter(
            OTPSession.telegram_id == otp_session_id,
            OTPSession.otp_code == otp_input,
            OTPSession.is_used == False,
            OTPSession.expires_at > datetime.now(timezone.utc),
        )
        .order_by(OTPSession.created_at.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="OTP ไม่ถูกต้องหรือหมดอายุแล้ว")

    # consume แบบ atomic — DELETE ที่มีเงื่อนไขครบในคำสั่งเดียว กัน race condition ที่ verify
    # พร้อมกัน 2 request ด้วย OTP เดียวกันอาจผ่านทั้งคู่
    result = db.execute(
        delete(OTPSession).where(
            OTPSession.id == session.id,
            OTPSession.is_used == False,
            OTPSession.expires_at > datetime.now(timezone.utc),
        ).execution_options(synchronize_session=False)
    )
    db.commit()
    if result.rowcount != 1:
        raise HTTPException(status_code=401, detail="OTP ไม่ถูกต้องหรือหมดอายุแล้ว")

    token = create_admin_token(NAIL_ADMIN_SESSION_ID, shop_id=shop_row.id)
    return {"access_token": token}


# ─── Public endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings_public(background_tasks: BackgroundTasks, db: Session = Depends(get_db), shop_slug: Optional[str] = None):
    shop_row = _resolve_shop_by_slug(db, shop_slug)
    shop = _get_shop(db, shop_row.id)
    # ตรวจสอบ rental expiry
    expired = False
    if shop.expired_at and _now() > shop.expired_at:
        expired = True
    # นับ request เป็น background task — ไม่กระทบ transaction หลัก
    background_tasks.add_task(_increment_api_counter, shop_row.id)
    return {
        "shop_name": shop.shop_name,
        "shop_logo_url": shop.shop_logo_url,
        "shop_tagline": shop.shop_tagline,
        "ig_url": shop.ig_url,
        "fb_url": shop.fb_url,
        "line_oa_url": shop.line_oa_url,
        "tiktok_url": shop.tiktok_url,
        "deposit_amount": float(shop.deposit_amount or 200),
        "bank_account_number": shop.bank_account_number,
        "bank_name": shop.bank_name,
        "bank_account_name": shop.bank_account_name,
        "bank_qr_url": shop.bank_qr_url,
        "max_advance_days": shop.max_advance_days or 14,
        "slot_duration_minutes": shop.slot_duration_minutes or 60,
        "is_active": shop.is_active and not expired,
        "expired": expired,
        "closed_dates": shop.closed_dates or "[]",
        "accept_bank_transfer": shop.accept_bank_transfer if shop.accept_bank_transfer is not None else True,
        "accept_truemoney_angpao": shop.accept_truemoney_angpao if shop.accept_truemoney_angpao is not None else True,
        "brand_color": shop.brand_color or "#B5174B",
        "service_section_emoji": shop.service_section_emoji or "💅",
        "show_why_choose_section": shop.show_why_choose_section if shop.show_why_choose_section is not None else True,
        "why_choose_custom_text": shop.why_choose_custom_text,
        "why_choose_heading": shop.why_choose_heading,
        # Feature flags — superadmin เปิด/ปิดต่อร้าน
        "allow_ref_image": bool(shop.allow_ref_image) if shop.allow_ref_image is not None else False,
    }


@router.get("/gallery")
def get_gallery(db: Session = Depends(get_db), shop_slug: Optional[str] = None):
    shop_row = _resolve_shop_by_slug(db, shop_slug)
    items = (
        db.query(NailGallery)
        .filter_by(shop_id=shop_row.id, is_active=True)
        .order_by(NailGallery.sort_order, NailGallery.id.desc())
        .all()
    )
    return [{"id": g.id, "image_url": g.image_url, "caption": g.caption} for g in items]


@router.get("/services")
def get_services(db: Session = Depends(get_db), shop_slug: Optional[str] = None):
    shop_row = _resolve_shop_by_slug(db, shop_slug)
    items = (
        db.query(NailService)
        .filter_by(shop_id=shop_row.id, is_active=True)
        .order_by(NailService.sort_order, NailService.id)
        .all()
    )
    return [
        {
            "id": s.id, "name": s.name, "description": s.description,
            "duration_minutes": s.duration_minutes,
            "price": float(s.price or 0), "color": s.color,
            "deposit_amount": float(s.deposit_amount) if s.deposit_amount is not None else None,
        }
        for s in items
    ]


@router.get("/slots")
def get_slots(date: str, db: Session = Depends(get_db), shop_slug: Optional[str] = None):
    """ดึงช่วงเวลาที่เปิดให้จองของวันนั้น พร้อมสถานะ available/held/full"""
    _release_expired_holds(db)
    shop_row = _resolve_shop_by_slug(db, shop_slug)
    # ตรวจวันปิดร้าน
    shop = _get_shop(db, shop_row.id)
    if shop.closed_dates:
        try:
            closed = json.loads(shop.closed_dates)
            if date in closed:
                return []
        except Exception:
            pass
    _ensure_slots_for_date(db, shop, date)
    slots = (
        db.query(NailTimeSlot)
        .filter_by(shop_id=shop_row.id, slot_date=date, is_available=True)
        .order_by(NailTimeSlot.start_time)
        .all()
    )
    # ── Single GROUP BY query replaces N+1 _count_confirmed_bookings calls ──
    from sqlalchemy import func as sqlfunc
    slot_ids = [s.id for s in slots]
    booking_counts: dict = {}
    if slot_ids:
        rows = (
            db.query(NailBooking.slot_id, sqlfunc.count(NailBooking.id).label("cnt"))
            .filter(
                NailBooking.slot_id.in_(slot_ids),
                NailBooking.status.in_(["held", "pending_payment", "confirmed"]),
            )
            .group_by(NailBooking.slot_id)
            .all()
        )
        booking_counts = {r.slot_id: r.cnt for r in rows}

    # ── ถ้าเป็น "วันนี้" (ตามเวลาไทย) ให้ตัดช่วงเวลาที่ผ่านไปแล้วออก ──────────
    now_th = _now_th()
    is_today = date == now_th.strftime("%Y-%m-%d")
    current_hm = now_th.strftime("%H:%M")

    result = []
    for s in slots:
        is_past = is_today and s.start_time <= current_hm
        confirmed = booking_counts.get(s.id, 0)
        result.append({
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            # เวลาที่ผ่านไปแล้ว ยังคงแสดงในรายการ (ไม่ซ่อน) แต่ห้ามจอง — กันลูกค้าที่เข้ามาดูงงว่าทำไมไม่มีคิวเลย
            "available": (not is_past) and confirmed < (s.max_bookings or 1),
            "is_past": is_past,
            "booked_count": confirmed,
            "max_bookings": s.max_bookings or 1,
        })
    return result


# ─── Booking Flow ────────────────────────────────────────────────────────────

class HoldRequest(BaseModel):
    slot_id: int
    service_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    customer_line: Optional[str] = None
    customer_note: Optional[str] = None


def _optional_wallet_customer(
    authorization: str = Header(None), db: Session = Depends(get_db)
) -> Optional[Customer]:
    """เหมือน get_wallet_customer แต่ไม่บังคับล็อกอิน (คืน None ถ้าไม่มี/token ไม่ถูกต้อง)"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return get_wallet_customer(authorization=authorization, db=db)
    except HTTPException:
        return None


@router.post("/booking/hold")
def hold_slot(
    req: HoldRequest,
    db: Session = Depends(get_db),
    customer: Optional[Customer] = Depends(_optional_wallet_customer),
):
    """
    Step 1: ล็อก slot ไว้ 10 นาที
    ใช้ SELECT FOR UPDATE เพื่อป้องกัน race condition
    ส่งคืน: hold_token, deposit_total, expires_at
    """
    from sqlalchemy import text as sa_text

    _release_expired_holds(db)

    # ── Atomic lock: SELECT FOR UPDATE prevents concurrent double-hold ──────
    # Lock the slot row so no other transaction can read/modify it simultaneously
    slot = (
        db.query(NailTimeSlot)
        .filter_by(id=req.slot_id, is_available=True)
        .with_for_update()
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="ไม่พบช่วงเวลาที่เลือก")

    # ── ห้ามจองช่วงเวลาที่ผ่านไปแล้ว (กันเผื่อ client ส่ง slot ของวันนี้ที่เวลาผ่านไปแล้วมา) ──
    now_th = _now_th()
    if slot.slot_date < now_th.strftime("%Y-%m-%d") or (
        slot.slot_date == now_th.strftime("%Y-%m-%d") and slot.start_time <= now_th.strftime("%H:%M")
    ):
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาอื่น")

    # Count inside the same transaction (consistent read after lock)
    confirmed = _count_confirmed_bookings(db, slot.id)
    if confirmed >= (slot.max_bookings or 1):
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น")

    shop = _get_shop(db, slot.shop_id)
    # ป้องกันการจองใหม่ถ้าร้านถูกปิด/หมดอายุการเช่าระบบ (บังคับที่ฝั่งเซิร์ฟเวอร์ ไม่พึ่งแค่ frontend gate)
    if not shop.is_active or (shop.expired_at and _now() > shop.expired_at):
        raise HTTPException(status_code=403, detail="ระบบจองคิวปิดใช้งานชั่วคราว กรุณาติดต่อร้านโดยตรง")

    # ── กันบัญชีกระเป๋าเงินข้ามร้าน ────────────────────────────────────────────
    # customer มาจาก token ซึ่งผูกกับร้านหนึ่งร้านเท่านั้น (shop_id ฝังอยู่ใน JWT)
    # ถ้า token เป็นของร้านอื่น (ไม่ตรงกับร้านของ slot ที่กำลังจอง) ต้องไม่ผูกบัญชี/ยอดเงินข้ามร้านเด็ดขาด
    # ถือว่าเหมือนยังไม่ได้ล็อกอิน (สำหรับร้านนี้) แทนที่จะปล่อยให้ balance ร้านอื่นรั่วมาแสดง
    if customer is not None and customer.shop_id != slot.shop_id:
        customer = None

    service = db.query(NailService).filter_by(id=req.service_id, shop_id=slot.shop_id).first() if req.service_id else None

    # ตรวจว่าระยะเวลาบริการไม่เกินระยะเวลาสล็อต — กันลูกค้าจองบริการ 90 นาทีเข้าสล็อต 60 นาที
    if service and service.duration_minutes:
        try:
            sh, sm = map(int, slot.start_time.split(":"))
            eh, em = map(int, slot.end_time.split(":"))
            slot_duration = (eh * 60 + em) - (sh * 60 + sm)
            if slot_duration > 0 and service.duration_minutes > slot_duration:
                raise HTTPException(
                    status_code=422,
                    detail=f"บริการนี้ใช้เวลา {service.duration_minutes} นาที แต่สล็อตที่เลือกมีเวลาเพียง {slot_duration} นาที กรุณาเลือกสล็อตที่ยาวกว่า"
                )
        except HTTPException:
            raise
        except Exception:
            pass

    # ค่ามัดจำ: ใช้ของบริการถ้าตั้งไว้ ไม่งั้น fallback เป็นค่าเริ่มต้นของร้าน
    if service is not None and service.deposit_amount is not None:
        base_deposit = float(service.deposit_amount)
    else:
        base_deposit = float(shop.deposit_amount or 200)
    # ไม่สุ่มเศษสตางค์แล้ว — ยอดมัดจำเป็นเลขกลมๆ ให้ร้านค้าตรวจสอบยอดโอนเอง
    deposit_total = round(base_deposit, 2)

    hold_token = secrets.token_urlsafe(32)
    held_until = _now() + timedelta(minutes=10)

    booking = NailBooking(
        shop_id=slot.shop_id,
        booking_ref="PENDING",  # ตั้ง placeholder ก่อน — จะแทนที่ด้วย ID จริงหลัง flush
        slot_id=slot.id,
        service_id=req.service_id,
        staff_id=slot.staff_id,
        customer_id=customer.id if customer else None,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        customer_line=req.customer_line,
        customer_note=req.customer_note,
        slot_date=slot.slot_date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        service_name=service.name if service else None,
        deposit_amount=base_deposit,
        deposit_cents=0,
        deposit_total=deposit_total,
        status="held",
        held_until=held_until,
        hold_token=hold_token,
    )
    db.add(booking)
    db.flush()   # ดึง auto-increment ID โดยยังไม่ commit (FOR UPDATE lock ยังอยู่)
    booking.booking_ref = _gen_ref(booking.id)  # thread-safe: ใช้ ID จริงจาก DB
    db.commit()   # releases the FOR UPDATE lock
    db.refresh(booking)

    return {
        "hold_token": hold_token,
        "booking_ref": booking.booking_ref,
        "deposit_total": deposit_total,
        "deposit_amount": base_deposit,
        "deposit_cents": 0,
        "bank_account_number": shop.bank_account_number,
        "bank_name": shop.bank_name,
        "bank_account_name": shop.bank_account_name,
        "bank_qr_url": shop.bank_qr_url,
        "held_until": held_until.isoformat(),
        "slot_date": slot.slot_date,
        "start_time": slot.start_time,
        "end_time": slot.end_time,
        "service_name": service.name if service else None,
        "customer_name": req.customer_name,
        "wallet_balance": float(customer.balance or 0) if customer else None,
        "wallet_sufficient": (float(customer.balance or 0) >= deposit_total) if customer else False,
        # Feature flags — ให้ frontend รู้ว่าร้านนี้เปิดฟีเจอร์ใดบ้าง
        "allow_ref_image": bool(shop.allow_ref_image) if shop.allow_ref_image is not None else False,
    }


class PayRequest(BaseModel):
    hold_token: str
    payment_proof: str              # base64 data URI หรือ URL path
    ref_image: Optional[str] = None  # รูปอ้างอิงแบบงาน (brief) — ส่งเฉพาะร้านที่ allow_ref_image=True


@router.post("/booking/pay")
async def submit_payment(req: PayRequest, db: Session = Depends(get_db)):
    """
    Step 2: อัปโหลดสลิป — ตรวจสอบและเปลี่ยนสถานะ
    """
    booking_pre = db.query(NailBooking).filter_by(hold_token=req.hold_token).first()
    shop = _get_shop(db, booking_pre.shop_id if booking_pre else 1)
    if not shop.is_active or (shop.expired_at and _now() > shop.expired_at):
        raise HTTPException(status_code=403, detail="ระบบจองคิวปิดใช้งานชั่วคราว กรุณาติดต่อร้านโดยตรง")

    booking = db.query(NailBooking).filter_by(hold_token=req.hold_token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการจอง")

    if booking.status == "cancelled":
        raise HTTPException(status_code=410, detail="การจองหมดเวลา กรุณาจองใหม่")

    if booking.status not in ("held", "pending_payment"):
        raise HTTPException(status_code=409, detail=f"สถานะไม่สามารถอัปเดตได้: {booking.status}")

    # ตรวจว่า hold ยังไม่หมดอายุ
    if booking.held_until and _now() > booking.held_until and booking.status == "held":
        booking.status = "cancelled"
        db.commit()
        raise HTTPException(status_code=410, detail="การจองหมดเวลาแล้ว กรุณาจองใหม่")

    # ตรวจสอบ payment_proof — รับเฉพาะ URL (https://) หรือรหัส voucher เท่านั้น
    proof = (req.payment_proof or "").strip()
    if not proof:
        raise HTTPException(status_code=400, detail="กรุณาใส่ลิงก์หลักฐานการชำระ")
    if len(proof) > 2048:
        raise HTTPException(status_code=400, detail="ลิงก์ยาวเกินไป (สูงสุด 2048 ตัวอักษร)")
    # ถ้าเป็น URL ต้องขึ้นต้นด้วย https:// (ไม่รับ http:// ป้องกัน mixed content)
    # voucher code หรือ internal note รับได้เช่นกัน (ไม่ขึ้นต้นด้วย http)
    if proof.startswith("http://") or (proof.startswith("http") and not proof.startswith("https://")):
        raise HTTPException(status_code=400, detail="ลิงก์ต้องใช้ https:// เท่านั้น")

    booking.payment_proof = proof

    # ── รูปอ้างอิงแบบงาน (brief) — เฉพาะร้านที่ allow_ref_image=True ──────────────────────────
    if req.ref_image:
        _shop_settings = db.query(NailShopSettings).filter_by(shop_id=booking.shop_id).first()
        if _shop_settings and _shop_settings.allow_ref_image:
            ref = req.ref_image.strip()
            # รับเฉพาะ base64 data URI (data:image/...) ไม่รับ URL ภายนอก
            if ref.startswith("data:image/") and "base64," in ref:
                # ตรวจขนาดคร่าวๆ (base64 ~1.37× ขนาดจริง) — ป้องกันรูปใหญ่เกิน 5MB
                b64_part = ref.split("base64,", 1)[1]
                approx_bytes = len(b64_part) * 3 // 4
                if approx_bytes <= 5 * 1024 * 1024:
                    booking.ref_image = ref

    # ไม่ตรวจสลิปอัตโนมัติแล้ว — แอดมินตรวจสอบยอดเงินและยืนยันเองทุกครั้ง
    # (เผื่ออนาคตอยากเปิดใช้ Slip2Go อัตโนมัติอีกครั้ง ดู backend/slip_verify.py)
    booking.status = "pending_payment"

    db.commit()
    db.refresh(booking)

    # แจ้ง Telegram แอดมินทันทีเมื่อลูกค้าส่งสลิป (ใช้ per-shop bot)
    try:
        from backend.bot import send_nail_slip_notify
        _shop_keys = db.query(NailShopApiKeys).filter_by(shop_id=booking.shop_id).first()
        await send_nail_slip_notify(
            booking_ref=booking.booking_ref,
            customer_name=booking.customer_name or "ไม่ระบุ",
            customer_phone=booking.customer_phone or "ไม่ระบุ",
            customer_line=booking.customer_line,
            slot_date=booking.slot_date or "",
            start_time=booking.start_time or "",
            end_time=booking.end_time or "",
            service_name=booking.service_name,
            deposit_total=float(booking.deposit_total or 0),
            payment_proof=req.payment_proof,
            slip_verify_status=booking.slip_verify_status,
            shop_bot_token=_shop_keys.telegram_bot_token if _shop_keys else None,
            shop_admin_group_id=_shop_keys.admin_group_id if _shop_keys else None,
        )
    except Exception as e:
        logger.warning(f"Telegram slip notify failed (non-critical): {e}")

    return {
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "slip_verify_status": booking.slip_verify_status,
        "message": (
            "จองคิวสำเร็จ! แอดมินยืนยันการชำระเงินแล้วครับ" if booking.status == "confirmed"
            else "อัปโหลดสลิปสำเร็จ รอแอดมินตรวจสอบค่ะ"
        ),
    }


class ReleaseHoldRequest(BaseModel):
    hold_token: str


@router.delete("/booking/hold")
def release_hold(req: ReleaseHoldRequest, db: Session = Depends(get_db)):
    """
    ยกเลิก hold ที่ลูกค้ากด Back ออกจากหน้าชำระเงินก่อนจ่าย
    คืน slot ให้คนอื่นจองได้ทันที แทนที่จะรอหมดอายุ 10 นาที
    """
    booking = db.query(NailBooking).filter_by(hold_token=req.hold_token, status="held").first()
    if not booking:
        return {"ok": True}  # already released / not found — not an error
    booking.status = "cancelled"
    db.commit()
    return {"ok": True}


class WalletPayRequest(BaseModel):
    hold_token: str
    ref_image: Optional[str] = None  # รูปอ้างอิงแบบงาน (brief) — ส่งเฉพาะร้านที่ allow_ref_image=True


@router.post("/booking/pay-wallet")
async def submit_payment_wallet(
    req: WalletPayRequest,
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_wallet_customer),
):
    """
    ชำระมัดจำด้วยเครดิตในกระเป๋าเงิน (ต้องล็อกอินและมีเครดิตพอ) — ยืนยันคิวทันที ไม่ต้องรอแอดมินตรวจสลิป
    """
    booking = (
        db.query(NailBooking)
        .filter_by(hold_token=req.hold_token)
        .with_for_update()
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลการจอง")

    # ── กันบัญชีกระเป๋าเงินข้ามร้าน ────────────────────────────────────────────
    # ต้องเช็คว่าบัญชีที่ล็อกอินอยู่ (จาก token) เป็นของร้านเดียวกับที่จองไว้เท่านั้น
    # ไม่งั้นจะเกิดกรณีล็อกอินร้าน A แล้วเอาเครดิตร้าน A ไปจ่ายจองคิวร้าน B ได้ (ห้ามเด็ดขาด)
    if customer.shop_id != booking.shop_id:
        raise HTTPException(status_code=403, detail="บัญชีนี้ไม่ได้อยู่ร้านนี้ กรุณาเข้าสู่ระบบกระเป๋าเงินของร้านนี้ก่อนชำระเงิน")

    shop = _get_shop(db, booking.shop_id)
    if not shop.is_active or (shop.expired_at and _now() > shop.expired_at):
        raise HTTPException(status_code=403, detail="ระบบจองคิวปิดใช้งานชั่วคราว กรุณาติดต่อร้านโดยตรง")

    if booking.status == "cancelled":
        raise HTTPException(status_code=410, detail="การจองหมดเวลา กรุณาจองใหม่")

    if booking.status not in ("held", "pending_payment"):
        raise HTTPException(status_code=409, detail=f"สถานะไม่สามารถอัปเดตได้: {booking.status}")

    if booking.held_until and _now() > booking.held_until and booking.status == "held":
        booking.status = "cancelled"
        db.commit()
        raise HTTPException(status_code=410, detail="การจองหมดเวลาแล้ว กรุณาจองใหม่")

    # ล็อกแถวลูกค้าไว้ด้วย เพื่อกันการหักเครดิตซ้ำซ้อนถ้ามีการชำระเงินพร้อมกันหลาย request
    locked_customer = (
        db.query(Customer)
        .filter_by(id=customer.id)
        .with_for_update()
        .first()
    )
    if not locked_customer:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูลลูกค้า")
    customer = locked_customer

    deposit = Decimal(str(booking.deposit_total or 0))
    balance = customer.balance or Decimal("0")
    if balance < deposit:
        shortfall = deposit - balance
        raise HTTPException(
            status_code=402,
            detail=f"เครดิตไม่พอ กรุณาเติมเงินเพิ่มอีก {float(shortfall):.2f} บาท (มี {float(balance):.2f} ต้องใช้ {float(deposit):.2f})",
        )

    customer.balance = balance - deposit
    booking.customer_id = customer.id
    booking.payment_method = "wallet"
    booking.status = "confirmed"
    booking.slip_verify_status = "wallet_paid"

    # ── รูปอ้างอิงแบบงาน (brief) — เฉพาะร้านที่ allow_ref_image=True ──────────────
    if req.ref_image:
        _shop_settings = db.query(NailShopSettings).filter_by(shop_id=booking.shop_id).first()
        if _shop_settings and _shop_settings.allow_ref_image:
            ref = req.ref_image.strip()
            if ref.startswith("data:image/") and "base64," in ref:
                b64_part = ref.split("base64,", 1)[1]
                if len(b64_part) * 3 // 4 <= 5 * 1024 * 1024:
                    booking.ref_image = ref
    db.add(CreditTransaction(
        customer_id=customer.id,
        txn_type="nail_booking",
        amount=-deposit,
        description=f"มัดจำจองคิวทำเล็บ #{booking.booking_ref}",
        ref_id=booking.id,
    ))
    db.commit()
    db.refresh(booking)
    db.refresh(customer)

    try:
        from backend.bot import send_nail_slip_notify
        _shop_keys = db.query(NailShopApiKeys).filter_by(shop_id=booking.shop_id).first()
        await send_nail_slip_notify(
            booking_ref=booking.booking_ref,
            customer_name=booking.customer_name or "ไม่ระบุ",
            customer_phone=booking.customer_phone or "ไม่ระบุ",
            customer_line=booking.customer_line,
            slot_date=booking.slot_date or "",
            start_time=booking.start_time or "",
            end_time=booking.end_time or "",
            service_name=booking.service_name,
            deposit_total=float(booking.deposit_total or 0),
            payment_proof="[ชำระด้วยเครดิตในกระเป๋าเงิน]",
            slip_verify_status="wallet_paid",
            shop_bot_token=_shop_keys.telegram_bot_token if _shop_keys else None,
            shop_admin_group_id=_shop_keys.admin_group_id if _shop_keys else None,
        )
    except Exception as e:
        logger.warning(f"Telegram wallet-pay notify failed (non-critical): {e}")

    return {
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "balance": float(customer.balance),
        "message": "จองคิวสำเร็จ! ชำระด้วยเครดิตเรียบร้อยแล้วค่ะ",
    }


@router.get("/booking/status/{hold_token}")
def booking_status(hold_token: str, db: Session = Depends(get_db)):
    booking = db.query(NailBooking).filter_by(hold_token=hold_token).first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบข้อมูล")
    return {
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "slot_date": booking.slot_date,
        "start_time": booking.start_time,
        "service_name": booking.service_name,
        "customer_name": booking.customer_name,
    }


@router.get("/booking/my")
def my_bookings(
    db: Session = Depends(get_db),
    customer: Customer = Depends(get_wallet_customer),
):
    """ประวัติการจองของลูกค้าที่ล็อกอินอยู่ — กันลืมวันเวลาที่จองไว้"""
    bookings = (
        db.query(NailBooking)
        .filter(NailBooking.customer_id == customer.id)
        .order_by(NailBooking.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": b.id,
            "booking_ref": b.booking_ref,
            "status": b.status,
            "slot_date": b.slot_date,
            "start_time": b.start_time,
            "end_time": b.end_time,
            "service_name": b.service_name,
            "deposit_total": float(b.deposit_total or 0),
            "payment_method": b.payment_method,
            "created_at": b.created_at.isoformat() if b.created_at else None,
        }
        for b in bookings
    ]


# ─── Admin endpoints ─────────────────────────────────────────────────────────

@router.get("/admin/bookings")
def admin_list_bookings(
    date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    _release_expired_holds(db)

    q = db.query(NailBooking).filter(NailBooking.shop_id == shop_id)
    if date:
        q = q.filter(NailBooking.slot_date == date)
    if status:
        q = q.filter(NailBooking.status == status)
    else:
        q = q.filter(NailBooking.status.in_(
            ["held", "pending_payment", "confirmed", "completed", "walkin"]
        ))

    bookings = q.order_by(NailBooking.slot_date, NailBooking.start_time, NailBooking.id).limit(limit).offset(offset).all()

    result = []
    for b in bookings:
        result.append({
            "id": b.id,
            "booking_ref": b.booking_ref,
            "status": b.status,
            "slot_date": b.slot_date,
            "start_time": b.start_time,
            "end_time": b.end_time,
            "service_name": b.service_name,
            "customer_name": b.customer_name,
            "customer_phone": b.customer_phone,
            "customer_line": b.customer_line,
            "customer_note": b.customer_note,
            "customer_id": b.customer_id,
            "payment_method": b.payment_method,
            "deposit_total": float(b.deposit_total or 0),
            "slip_verify_status": b.slip_verify_status,
            "payment_proof": b.payment_proof,
            "ref_image": b.ref_image,
            "admin_note": b.admin_note,
            "is_walkin": b.is_walkin,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "held_until": b.held_until.isoformat() if b.held_until else None,
        })
    return result


@router.get("/admin/dashboard")
def admin_dashboard(db: Session = Depends(get_db), authorization: str = Header(None)):
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    reset_since = shop.stats_reset_at  # None = count from the very beginning
    today = _now().date().isoformat()
    week_start = (_now().date() - timedelta(days=_now().weekday())).isoformat()

    def count_status(status: str, date: str = None):
        q = db.query(NailBooking).filter(NailBooking.status == status, NailBooking.shop_id == shop_id)
        if date:
            q = q.filter(NailBooking.slot_date == date)
        return q.count()

    today_confirmed = count_status("confirmed", today)
    today_pending = count_status("pending_payment", today)
    today_walkin = count_status("walkin", today)

    from sqlalchemy import func as sqlfunc
    week_revenue = db.query(sqlfunc.sum(NailBooking.deposit_total)).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.slot_date >= week_start,
        NailBooking.status.in_(["confirmed", "completed", "walkin"]),
    ).scalar() or 0

    total_bookings_q = db.query(NailBooking).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.status.in_(["confirmed", "completed", "walkin"])
    )
    if reset_since:
        total_bookings_q = total_bookings_q.filter(NailBooking.created_at >= reset_since)
    total_bookings = total_bookings_q.count()

    recent = (
        db.query(NailBooking)
        .filter(NailBooking.shop_id == shop_id, NailBooking.status.in_(["pending_payment", "confirmed", "held"]))
        .order_by(NailBooking.created_at.desc())
        .limit(5)
        .all()
    )

    # ── "เงินที่ระบบช่วยหามาให้" — ตัวเลขพิสูจน์คุณค่าของระบบให้เจ้าของร้านเห็นชัดๆ ──
    month_start = _now().date().replace(day=1).isoformat()
    LOCKED_STATUSES = ["confirmed", "completed", "walkin"]  # นับเฉพาะที่ยืนยัน/มัดจำแล้วจริง

    month_revenue = db.query(sqlfunc.sum(NailBooking.deposit_total)).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.slot_date >= month_start,
        NailBooking.status.in_(LOCKED_STATUSES),
    ).scalar() or 0

    all_time_q = db.query(sqlfunc.sum(NailBooking.deposit_total)).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.status.in_(LOCKED_STATUSES),
    )
    if reset_since:
        all_time_q = all_time_q.filter(NailBooking.created_at >= reset_since)
    all_time_revenue = all_time_q.scalar() or 0

    # ลูกค้าที่กลับมาจองซ้ำ (นับเบอร์โทรที่มี booking สำเร็จมากกว่า 1 ครั้ง) — วัด "ความรัก" ที่ลูกค้ามีต่อร้าน
    phone_counts = (
        db.query(NailBooking.customer_phone, sqlfunc.count(NailBooking.id).label("cnt"))
        .filter(NailBooking.shop_id == shop_id, NailBooking.status.in_(LOCKED_STATUSES), NailBooking.customer_phone.isnot(None))
        .group_by(NailBooking.customer_phone)
        .all()
    )
    unique_customers = len(phone_counts)
    repeat_customers = sum(1 for _, cnt in phone_counts if cnt > 1)
    repeat_rate = round((repeat_customers / unique_customers) * 100, 1) if unique_customers else 0.0

    # กันคิวเบี้ยว/ไม่โผล่ — ประเมินยอดที่ "อาจเสียไป" ถ้าไม่มีมัดจำ (deposit_total ของ booking ที่ยกเลิกเดือนนี้)
    no_show_prevented = db.query(sqlfunc.sum(NailBooking.deposit_total)).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.slot_date >= month_start,
        NailBooking.status == "cancelled",
    ).scalar() or 0

    # วันที่คิวแน่นที่สุดในช่วง 90 วันล่าสุด — ช่วยร้านวางแผนกำลังคน
    ninety_days_ago = (_now().date() - timedelta(days=90)).isoformat()
    busiest_day_row = (
        db.query(NailBooking.slot_date, sqlfunc.count(NailBooking.id).label("cnt"))
        .filter(NailBooking.shop_id == shop_id, NailBooking.status.in_(LOCKED_STATUSES), NailBooking.slot_date >= ninety_days_ago)
        .group_by(NailBooking.slot_date)
        .order_by(sqlfunc.count(NailBooking.id).desc())
        .first()
    )

    return {
        "today": {
            "confirmed": today_confirmed,
            "pending": today_pending,
            "walkin": today_walkin,
            "total": today_confirmed + today_pending + today_walkin,
        },
        "week_revenue": float(week_revenue),
        "total_bookings": total_bookings,
        "recent_bookings": [
            {
                "id": b.id,
                "booking_ref": b.booking_ref,
                "status": b.status,
                "customer_name": b.customer_name,
                "slot_date": b.slot_date,
                "start_time": b.start_time,
                "service_name": b.service_name,
                "deposit_total": float(b.deposit_total or 0),
            }
            for b in recent
        ],
        # ── สรุปคุณค่าที่ระบบสร้างให้ร้าน (สำหรับการ์ด "เงินที่ระบบช่วยหามาให้") ──
        "value_stats": {
            "month_revenue": float(month_revenue),
            "all_time_revenue": float(all_time_revenue),
            "unique_customers": unique_customers,
            "repeat_customers": repeat_customers,
            "repeat_rate": repeat_rate,
            "no_show_prevented_this_month": float(no_show_prevented),
            "busiest_day": {"date": busiest_day_row[0], "count": busiest_day_row[1]} if busiest_day_row else None,
        },
        "stats_reset_at": shop.stats_reset_at.isoformat() if shop.stats_reset_at else None,
    }


def _refund_wallet_if_needed(db: Session, booking: "NailBooking", note: str) -> None:
    """
    คืนเครดิตเข้ากระเป๋าลูกค้า ถ้าการจองนี้จ่ายด้วยเครดิตในกระเป๋าเงิน
    ข้อกำหนด: `booking` ต้องถูกโหลดด้วย SELECT FOR UPDATE (with_for_update()) โดยผู้เรียก
    อยู่แล้ว ก่อนเรียกฟังก์ชันนี้ — เพื่อให้การเช็คสถานะ (refundable) กับการเช็ค/ตั้งค่า
    wallet_refunded อยู่บนแถวที่ถูกล็อกเดียวกัน กันคืนเงินซ้ำเมื่อมีการเรียก refund/delete พร้อมกัน
    """
    if not booking or booking.payment_method != "wallet" or not booking.customer_id:
        return
    if booking.wallet_refunded:
        return  # กันคืนเงินซ้ำ — ตั้งค่าไว้แล้วในทรานแซกชันก่อนหน้า
    customer = (
        db.query(Customer)
        .filter_by(id=booking.customer_id)
        .with_for_update()
        .first()
    )
    if not customer:
        return
    deposit = Decimal(str(booking.deposit_total or 0))
    if deposit <= 0:
        booking.wallet_refunded = True
        return
    customer.balance = (customer.balance or Decimal("0")) + deposit
    db.add(CreditTransaction(
        customer_id=customer.id,
        txn_type="nail_booking_refund",
        amount=deposit,
        description=f"คืนมัดจำจองคิวทำเล็บ #{booking.booking_ref} ({note})",
        ref_id=booking.id,
    ))
    booking.wallet_refunded = True


@router.post("/admin/bookings/{booking_id}/refund")
def admin_refund_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    booking = db.query(NailBooking).filter_by(id=booking_id, shop_id=shop_id).with_for_update().first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")
    if booking.status not in ("pending_payment", "confirmed"):
        raise HTTPException(status_code=409, detail=f"ไม่สามารถคืนเงินสถานะ: {booking.status}")
    _refund_wallet_if_needed(db, booking, "ยกเลิกโดยแอดมิน")
    booking.status = "cancelled"
    booking.admin_note = (booking.admin_note or "") + " [ยกเลิกและคืนเงินโดยแอดมิน]"
    db.commit()
    return {"ok": True, "message": "ยกเลิกและบันทึกการคืนเงินแล้ว"}


class DeleteBookingBody(BaseModel):
    passcode: str


@router.post("/admin/bookings/{booking_id}/delete")
def admin_delete_booking(
    booking_id: int,
    body: DeleteBookingBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """
    ลบการจองออกจากระบบถาวร (ใช้ล้างรายการทดสอบ/รายการผิดพลาด) — ต้องใส่รหัสผ่านร้าน
    (ADMIN_PASSCODE) ซ้ำอีกครั้งเพื่อยืนยัน นอกเหนือจาก session token ปกติ
    ถ้าการจองนี้จ่ายด้วยเครดิตในกระเป๋าเงิน จะคืนเครดิตให้ลูกค้าก่อนลบ
    """
    shop_id = _check_admin(authorization)

    # Verify passcode — for per-shop admins: check per-shop hash first, then global
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if shop_row and shop_row.admin_passcode_hash:
        if not verify_passcode((body.passcode or "").strip(), shop_row.admin_passcode_hash):
            raise HTTPException(status_code=403, detail="รหัสยืนยันไม่ถูกต้อง")
    else:
        cfg = get_settings()
        passcode = cfg.admin_passcode
        if not passcode:
            raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า ADMIN_PASSCODE บนเซิร์ฟเวอร์")
        import hmac as _hmac
        if not _hmac.compare_digest((body.passcode or "").strip(), passcode.strip()):
            raise HTTPException(status_code=403, detail="รหัสยืนยันไม่ถูกต้อง")

    booking = db.query(NailBooking).filter_by(id=booking_id, shop_id=shop_id).with_for_update().first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    _refund_wallet_if_needed(db, booking, "ลบรายการโดยแอดมิน")
    db.delete(booking)
    db.commit()
    return {"ok": True, "message": "ลบการจองแล้ว"}


@router.post("/admin/bookings/bulk-delete-cancelled")
def admin_bulk_delete_cancelled(
    body: DeleteBookingBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """
    ลบการจองที่มีสถานะ cancelled ทั้งหมดออกจากระบบ (ล้างข้อมูลทดสอบ)
    ต้องใส่ ADMIN_PASSCODE ยืนยัน — ไม่คืนเครดิตเพราะ cancelled แปลว่าคืนไปแล้ว
    """
    shop_id = _check_admin(authorization)
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if shop_row and shop_row.admin_passcode_hash:
        if not verify_passcode((body.passcode or "").strip(), shop_row.admin_passcode_hash):
            raise HTTPException(status_code=403, detail="รหัสยืนยันไม่ถูกต้อง")
    else:
        cfg = get_settings()
        passcode = cfg.admin_passcode
        if not passcode:
            raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า ADMIN_PASSCODE")
        import hmac as _hmac
        if not _hmac.compare_digest((body.passcode or "").strip(), passcode.strip()):
            raise HTTPException(status_code=403, detail="รหัสยืนยันไม่ถูกต้อง")

    deleted = db.query(NailBooking).filter(
        NailBooking.shop_id == shop_id,
        NailBooking.status == "cancelled"
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted": deleted, "message": f"ลบข้อมูลยกเลิก {deleted} รายการแล้ว"}


class UpdateBookingBody(BaseModel):
    status: Optional[str] = None
    admin_note: Optional[str] = None
    service_id: Optional[int] = None  # ใช้ตอนลูกค้าขอเปลี่ยนบริการหน้าร้าน
    slot_id: Optional[int] = None      # ย้ายไปสล็อตใหม่ (admin reschedule)
    new_slot_date: Optional[str] = None
    new_start_time: Optional[str] = None
    new_end_time: Optional[str] = None


@router.put("/admin/bookings/{booking_id}")
def admin_update_booking(
    booking_id: int,
    body: UpdateBookingBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    booking = db.query(NailBooking).filter_by(id=booking_id, shop_id=shop_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")
    if body.status:
        booking.status = body.status
    if body.admin_note is not None:
        booking.admin_note = body.admin_note

    # ── ย้ายคิวไปสล็อตใหม่ (admin reschedule) ────────────────────────────────
    if body.slot_id is not None:
        slot = db.query(NailTimeSlot).filter_by(id=body.slot_id, shop_id=shop_id).first()
        if not slot:
            raise HTTPException(status_code=404, detail="ไม่พบสล็อตเวลาที่ต้องการย้าย")
        old_date = booking.slot_date or ""
        old_time = booking.start_time or ""
        booking.slot_id = slot.id
        booking.slot_date = slot.slot_date
        booking.start_time = slot.start_time
        booking.end_time = slot.end_time
        booking.admin_note = (
            (booking.admin_note or "").rstrip() + f" [ย้ายคิว: {old_date} {old_time} → {slot.slot_date} {slot.start_time}]"
        ).strip()

    deposit_diff = None
    if body.service_id is not None and body.service_id != booking.service_id:
        new_service = db.query(NailService).filter_by(id=body.service_id, shop_id=shop_id).first()
        if not new_service:
            raise HTTPException(status_code=404, detail="ไม่พบบริการที่ต้องการเปลี่ยน")
        old_name = booking.service_name or "-"
        old_deposit = float(booking.deposit_amount or 0)
        new_deposit = float(new_service.deposit_amount) if new_service.deposit_amount is not None else None
        booking.service_id = new_service.id
        booking.service_name = new_service.name
        note = f"[เปลี่ยนบริการ: {old_name} → {new_service.name}]"
        if new_deposit is not None:
            deposit_diff = round(new_deposit - old_deposit, 2)
            if deposit_diff > 0:
                note += f" ต้องเก็บมัดจำเพิ่ม ฿{deposit_diff:.2f}"
            elif deposit_diff < 0:
                note += f" ต้องคืนมัดจำส่วนต่าง ฿{abs(deposit_diff):.2f}"
        booking.admin_note = ((booking.admin_note or "") + " " + note).strip()

    db.commit()
    return {"ok": True, "deposit_diff": deposit_diff}


class WalkInBody(BaseModel):
    slot_id: Optional[int] = None
    service_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    slot_date: str
    start_time: str
    end_time: Optional[str] = None
    admin_note: Optional[str] = None


@router.post("/admin/bookings/walkin")
def admin_add_walkin(
    body: WalkInBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    service = db.query(NailService).filter_by(id=body.service_id, shop_id=shop_id).first() if body.service_id else None
    # ตรวจสอบ slot_id ต้องเป็นของร้านนี้เท่านั้น — ป้องกัน cross-tenant linkage ถ้ามีคนส่ง slot_id ของร้านอื่นมา
    slot = db.query(NailTimeSlot).filter_by(id=body.slot_id, shop_id=shop_id).first() if body.slot_id else None
    if body.slot_id and not slot:
        raise HTTPException(status_code=404, detail="ไม่พบสล็อตเวลานี้ในร้านของคุณ")
    if body.service_id and not service:
        raise HTTPException(status_code=404, detail="ไม่พบบริการนี้ในร้านของคุณ")
    # เดา end_time ถ้าไม่ได้ระบุ — ใช้ระยะเวลาของบริการ ถ้าไม่มีก็ใช้ slot_duration_minutes ของร้าน
    # หมายเหตุ: walk-in ไม่ตรวจสอบเวลาซ้ำ/ทับกับสล็อตอื่นโดยตั้งใจ — ร้านสามารถจองทับเวลาที่มีคนจองออนไลน์ไว้แล้วได้
    # เพื่อความสะดวก (เช่น ลูกค้าวอคอินมาในช่วงเวลาที่ระบบออนไลน์ปิดรับจองไปแล้ว)
    end_time = body.end_time
    if not end_time:
        try:
            dur = getattr(service, "duration_minutes", None) if service else None
            shop_row = _get_shop(db, shop_id)
            dur = dur or shop_row.slot_duration_minutes or 60
            start_dt = datetime.strptime(body.start_time, "%H:%M")
            end_time = (start_dt + timedelta(minutes=dur)).strftime("%H:%M")
        except Exception:
            end_time = body.start_time
    booking = NailBooking(
        shop_id=shop_id,
        booking_ref="PENDING",
        slot_id=slot.id if slot else None,
        service_id=service.id if service else None,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        slot_date=body.slot_date,
        start_time=body.start_time,
        end_time=end_time,
        service_name=service.name if service else None,
        deposit_total=0,
        status="walkin",
        is_walkin=True,
        admin_note=body.admin_note,
    )
    db.add(booking)
    db.flush()
    booking.booking_ref = _gen_ref(booking.id)
    db.commit()
    db.refresh(booking)
    return {"ok": True, "booking_ref": booking.booking_ref}


# ── Slot Management ──────────────────────────────────────────────────────────

class SlotBody(BaseModel):
    slot_date: str
    start_time: str
    end_time: str
    max_bookings: Optional[int] = 1
    staff_id: Optional[int] = None


@router.get("/admin/slots")
def admin_list_slots(
    date: Optional[str] = None,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    _release_expired_holds(db)
    if date:
        _ensure_slots_for_date(db, _get_shop(db, shop_id), date)
    q = db.query(NailTimeSlot).filter(NailTimeSlot.shop_id == shop_id)
    if date:
        q = q.filter(NailTimeSlot.slot_date == date)
    slots = q.order_by(NailTimeSlot.slot_date, NailTimeSlot.start_time).all()
    # ── Single GROUP BY query replaces N+1 calls ──
    from sqlalchemy import func as sqlfunc
    slot_ids = [s.id for s in slots]
    booking_counts: dict = {}
    if slot_ids:
        rows = (
            db.query(NailBooking.slot_id, sqlfunc.count(NailBooking.id).label("cnt"))
            .filter(
                NailBooking.slot_id.in_(slot_ids),
                NailBooking.status.in_(["held", "pending_payment", "confirmed"]),
            )
            .group_by(NailBooking.slot_id)
            .all()
        )
        booking_counts = {r.slot_id: r.cnt for r in rows}

    result = []
    for s in slots:
        confirmed = booking_counts.get(s.id, 0)
        result.append({
            "id": s.id,
            "slot_date": s.slot_date,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "max_bookings": s.max_bookings,
            "is_available": s.is_available,
            "booked_count": confirmed,
        })
    return result


# ── Weekly recurring slot templates ─────────────────────────────────────────

class SlotTemplateItem(BaseModel):
    day_of_week: int
    is_open: bool = False
    start_time: str = "09:00"
    rounds_count: int = 0
    round_minutes: int = 60
    gap_minutes: int = 0
    max_bookings: int = 1
    staff_id: Optional[int] = None
    extra_blocks: Optional[str] = None  # JSON string of [{start_time,rounds_count,round_minutes,gap_minutes,max_bookings}]


class SlotTemplateBulkBody(BaseModel):
    templates: List[SlotTemplateItem]


@router.get("/admin/slot-templates")
def admin_get_slot_templates(db: Session = Depends(get_db), authorization: str = Header(None)):
    """ดึงเทมเพลตประจำสัปดาห์ (7 วัน) — ใช้ตั้งค่า 'เปิดกี่รอบ รอบละกี่นาที' ของแต่ละวัน"""
    shop_id = _check_admin(authorization)
    try:
        _ensure_templates_exist(db, shop_id)
    except Exception as e:
        logger.warning(f"[slot-templates] _ensure_templates_exist failed (shop {shop_id}): {e}")
        db.rollback()
    rows = db.query(NailSlotTemplate).filter_by(shop_id=shop_id).order_by(NailSlotTemplate.day_of_week).all()
    return [
        {
            "id": t.id,
            "day_of_week": t.day_of_week,
            "day_name": DAY_NAMES_TH[t.day_of_week],
            "is_open": t.is_open,
            "start_time": t.start_time,
            "rounds_count": t.rounds_count,
            "round_minutes": t.round_minutes,
            "gap_minutes": t.gap_minutes,
            "max_bookings": t.max_bookings,
            "staff_id": t.staff_id,
            "extra_blocks": t.extra_blocks or "[]",
        }
        for t in rows
    ]


@router.put("/admin/slot-templates")
def admin_update_slot_templates(
    body: SlotTemplateBulkBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """บันทึกเทมเพลตประจำสัปดาห์ แล้ว sync สล็อตล่วงหน้า 60 วันให้ตรงกับเทมเพลตใหม่ทันที —
    ลบสล็อตเก่าที่ยังไม่มีคนจอง แล้วสร้างสล็อตใหม่ตามเทมเพลต (สล็อตที่มีคนจองแล้วจะไม่ถูกแก้/ลบ)
    ป้องกันปัญหาสล็อตเก่าตกค้าง (เช่น 10:30, 14:30 ที่มาจากเทมเพลตเดิมก่อนแก้ไข) ค้างอยู่ในระบบ"""
    shop_id = _check_admin(authorization)
    for item in body.templates:
        if not (0 <= item.day_of_week <= 6):
            continue
        row = db.query(NailSlotTemplate).filter_by(shop_id=shop_id, day_of_week=item.day_of_week).first()
        if not row:
            row = NailSlotTemplate(shop_id=shop_id, day_of_week=item.day_of_week)
            db.add(row)
        row.is_open = item.is_open
        row.start_time = item.start_time
        row.rounds_count = max(0, item.rounds_count)
        row.round_minutes = max(1, item.round_minutes)
        row.gap_minutes = max(0, item.gap_minutes)
        row.max_bookings = max(1, item.max_bookings)
        row.staff_id = item.staff_id
        row.extra_blocks = item.extra_blocks or "[]"
    db.commit()

    # sync สล็อตล่วงหน้าให้ตรงกับเทมเพลตใหม่ทันที (ไม่ต้องรอแอดมินกดปุ่มแยก)
    shop = _get_shop(db, shop_id)
    closed_dates_json = shop.closed_dates
    today = _now().date()
    sync_result = {"total_deleted": 0, "total_created": 0}
    # ใช้ savepoint (begin_nested) ต่อวัน + commit เดียวรวมท้ายสุด แทนการ commit ทีละวัน (60 round-trip ไป Neon)
    # ที่ทำให้การบันทึกเทมเพลตหมุนนานมาก — savepoint ยังแยก error ของแต่ละวันออกจากกันได้เหมือนเดิม
    for i in range(60):
        date_str = (today + timedelta(days=i)).isoformat()
        try:
            with db.begin_nested():
                r = _apply_template_for_date_core(db, shop_id, date_str, closed_dates_json, commit=False)
            sync_result["total_deleted"] += r["deleted"]
            sync_result["total_created"] += r["created"]
        except Exception as e:
            logger.warning(f"[slot-templates] sync failed for {date_str} (shop {shop_id}): {e}")
    db.commit()
    return {"ok": True, "synced": sync_result}


class GenerateSlotsBody(BaseModel):
    days: int = 30
    from_date: Optional[str] = None   # "YYYY-MM-DD" — ถ้าไม่ระบุ ใช้วันนี้


@router.post("/admin/slot-templates/generate")
def admin_generate_slots_from_template(
    body: GenerateSlotsBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """สร้างสล็อตล่วงหน้าจากเทมเพลตทันที (แทนที่จะรอให้ลูกค้าเปิดหน้าจองก่อน) —
    ข้ามวันที่มีสล็อตอยู่แล้ว (ทั้งจากเทมเพลตเดิมหรือที่แอดมินสร้างเอง)
    รองรับ from_date เพื่อ generate จากวันที่กำหนด แทนวันนี้"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    # กำหนดจุดเริ่มต้น
    if body.from_date:
        try:
            start_date = datetime.strptime(body.from_date, "%Y-%m-%d").date()
        except ValueError:
            start_date = _now().date()
    else:
        start_date = _now().date()
    days = max(1, min(body.days, 90))
    generated = []
    for i in range(days):
        date_str = (start_date + timedelta(days=i)).isoformat()
        before = db.query(NailTimeSlot).filter_by(slot_date=date_str, shop_id=shop_id).count()
        _ensure_slots_for_date(db, shop, date_str)
        after = db.query(NailTimeSlot).filter_by(slot_date=date_str, shop_id=shop_id).count()
        if after > before:
            generated.append(date_str)
    return {"ok": True, "generated_dates": generated, "generated_count": len(generated)}


class SyncFutureBody(BaseModel):
    days: int = 30
    from_date: Optional[str] = None   # "YYYY-MM-DD" — ถ้าไม่ระบุ ใช้วันนี้


@router.post("/admin/slot-templates/sync-future")
def admin_sync_future_slots_to_template(
    body: SyncFutureBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """Sync สล็อตล่วงหน้าให้ตรงกับเทมเพลตปัจจุบันทุกวัน (ต่างจาก /generate ที่ข้ามวันที่มีสล็อตอยู่แล้วทั้งวัน) —
    ใช้ตอนแก้เทมเพลตแล้วต้องการให้มีผลกับวันที่เคย generate สล็อตไปแล้วด้วย
    สล็อตที่มีคนจองไว้แล้วจะถูกเก็บไว้เสมอ ไม่ถูกลบหรือแก้เวลา"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    if body.from_date:
        try:
            start_date = datetime.strptime(body.from_date, "%Y-%m-%d").date()
        except ValueError:
            start_date = _now().date()
    else:
        start_date = _now().date()
    days = max(1, min(body.days, 90))

    closed_dates_json = shop.closed_dates
    total_deleted = 0
    total_created = 0
    changed_dates = []
    errors: list = []
    # ใช้ savepoint ต่อวัน + commit เดียวรวมท้ายสุด แทนการ commit ทีละวัน (ลด round-trip ไป Neon ลงมาก)
    for i in range(days):
        date_str = (start_date + timedelta(days=i)).isoformat()
        try:
            with db.begin_nested():
                result = _apply_template_for_date_core(db, shop_id, date_str, closed_dates_json, commit=False)
            total_deleted += result["deleted"]
            total_created += result["created"]
            if result["deleted"] or result["created"]:
                changed_dates.append(date_str)
        except Exception as _day_err:
            logger.error(f"sync_future: error on {date_str}: {_day_err}", exc_info=True)
            errors.append({"date": date_str, "error": str(_day_err)})

    db.commit()
    if errors and not changed_dates:
        # ล้มเหลวทุกวัน — ส่ง 500 พร้อม detail เพื่อช่วย debug
        raise HTTPException(
            status_code=500,
            detail=f"ซิงค์ไม่สำเร็จทุกวัน: {errors[0]['error']}",
        )

    return {
        "ok": True,
        "days_scanned": days,
        "changed_dates": changed_dates,
        "total_deleted": total_deleted,
        "total_created": total_created,
        "errors": errors,
    }


class ApplyTemplateDayBody(BaseModel):
    date: str   # "YYYY-MM-DD"


def _apply_template_for_date_core(db: Session, shop_id: int, date_str: str, closed_dates_json: Optional[str] = None, commit: bool = True) -> dict:
    """
    Sync สล็อตของวันที่ระบุให้ตรงกับเทมเพลตปัจจุบัน —
    ลบสล็อตที่ว่าง (ไม่มีการจอง) แล้วเพิ่มสล็อตที่ขาดหายจากเทมเพลต
    เก็บสล็อตที่มีคนจองไว้แล้วเสมอ (ไม่ลบ/ไม่แก้เวลา) แม้เวลานั้นจะไม่ตรงกับเทมเพลตล่าสุดแล้วก็ตาม
    ใช้ร่วมกันทั้งจาก endpoint แบบทีละวัน (apply-template-day) และแบบ bulk (sync-future)

    หมายเหตุ: รับ shop_id: int โดยตรงแทน ORM object เพื่อหลีกเลี่ยง DetachedInstanceError
    ข้ามการวนซ้ำหลาย transaction ใน bulk sync loop
    ไม่ใช้ advisory lock (pg_advisory_xact_lock/hashtext) เพราะ sync เป็นการดำเนินการของ admin คนเดียว
    และ advisory lock บน Neon serverless pooler อาจทำให้เกิด 500 ได้
    """
    # หาเทมเพลตของวันที่ระบุก่อน จะได้เอา max_bookings/staff_id ล่าสุดไปอัปเดตสล็อตที่ถูกเก็บไว้ (มีคนจองแล้ว) ด้วย
    try:
        d_lookup = datetime.strptime(date_str, "%Y-%m-%d")
        tmpl_lookup = db.query(NailSlotTemplate).filter_by(
            shop_id=shop_id, day_of_week=d_lookup.weekday(), is_open=True
        ).first()
    except ValueError:
        tmpl_lookup = None
    tmpl_by_start: dict[str, "NailSlotTemplate"] = {}
    if tmpl_lookup and tmpl_lookup.rounds_count > 0:
        try:
            _cursor = datetime.strptime(tmpl_lookup.start_time or "", "%H:%M")
            for i in range(tmpl_lookup.rounds_count):
                _s = _cursor + timedelta(minutes=i * (tmpl_lookup.round_minutes + tmpl_lookup.gap_minutes))
                tmpl_by_start[_s.strftime("%H:%M")] = tmpl_lookup
        except (ValueError, TypeError):
            pass

    # ── Step 1: ลบสล็อตที่ไม่มีการจองออก ──────────────────────────────────
    existing = db.query(NailTimeSlot).filter_by(slot_date=date_str, shop_id=shop_id).all()
    deleted = 0
    has_booked = False
    surviving_start_times: set[str] = set()

    # นับ booking ของทุกสล็อตในวันนี้ทีเดียว (แทนการ query ทีละสล็อต) — ทั้งจำนวนที่ยัง active
    # และจำนวนทั้งหมดรวม cancelled ด้วย เพื่อกัน N+1 query ตอน sync หลายวัน/หลายสล็อต
    slot_ids = [sl.id for sl in existing]
    active_counts: dict[int, int] = {}
    any_counts: dict[int, int] = {}
    if slot_ids:
        rows = db.query(
            NailBooking.slot_id,
            func.count(NailBooking.id).label("total"),
            func.sum(case((NailBooking.status.notin_(["cancelled"]), 1), else_=0)).label("active"),
        ).filter(NailBooking.slot_id.in_(slot_ids)).group_by(NailBooking.slot_id).all()
        for slot_id, total, active in rows:
            any_counts[slot_id] = total or 0
            active_counts[slot_id] = int(active or 0)

    for sl in existing:
        active_booked = active_counts.get(sl.id, 0)
        # ห้ามลบสล็อตถ้ายังมี booking แถวไหนอ้างอิง id นี้อยู่ (ต่อให้สถานะเป็น cancelled ก็ตาม)
        # เพราะ FOREIGN KEY constraint จะทำให้ DELETE พังทันที (500)
        any_reference = any_counts.get(sl.id, 0) > 0
        if not any_reference:
            db.delete(sl)
            deleted += 1
        else:
            has_booked = has_booked or (active_booked > 0)
            surviving_start_times.add(sl.start_time)
            # สล็อตที่มีคนจองแล้ว: เก็บเวลาไว้เหมือนเดิม แต่อัปเดต capacity/staff ให้ตรงกับเทมเพลตล่าสุด
            # (ไม่งั้นถ้าร้านลดคิวจาก 8 เหลือ 6 วันที่มีคนจองแล้วจะค้างที่ 8 ตลอดไป)
            # ใช้ค่า max_bookings/staff_id ของเทมเพลตวันนั้นเสมอถ้ามีเทมเพลตเปิดอยู่ — แม้เวลาของสล็อต
            # จะไม่ตรงกับรอบใดๆ ในเทมเพลตปัจจุบันแล้ว (เช่น ลดจำนวนรอบ หรือเลื่อนเวลาเริ่ม) ก็ยังต้องได้ค่า capacity ล่าสุด
            match = tmpl_by_start.get(sl.start_time) or tmpl_lookup
            if match:
                sl.max_bookings = max(1, match.max_bookings or 1)
                sl.staff_id = match.staff_id
    db.flush()  # flush เพื่อให้ delete มีผลก่อน insert

    # ── Step 2: สร้างสล็อตจากเทมเพลต เฉพาะที่ยังไม่มีอยู่ ─────────────────
    created = 0
    if closed_dates_json:
        try:
            if date_str in json.loads(closed_dates_json):
                if commit:
                    db.commit()
                else:
                    db.flush()
                return {"deleted": deleted, "created": 0, "has_booked_slots_preserved": has_booked}
        except Exception:
            pass

    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        if commit:
            db.commit()
        else:
            db.flush()
        return {"deleted": deleted, "created": 0, "has_booked_slots_preserved": has_booked}

    tmpl = tmpl_lookup
    if tmpl and tmpl.rounds_count > 0:
        try:
            cursor = datetime.strptime(tmpl.start_time or "", "%H:%M")
        except (ValueError, TypeError):
            cursor = None

        if cursor is not None:
            for i in range(tmpl.rounds_count):
                start = cursor + timedelta(minutes=i * (tmpl.round_minutes + tmpl.gap_minutes))
                end = start + timedelta(minutes=tmpl.round_minutes)
                start_str = start.strftime("%H:%M")
                # เพิ่มเฉพาะสล็อตที่ไม่ซ้ำกับที่เหลืออยู่ (สล็อตที่มี booking)
                if start_str not in surviving_start_times:
                    db.add(NailTimeSlot(
                        shop_id=shop_id,
                        slot_date=date_str,
                        start_time=start_str,
                        end_time=end.strftime("%H:%M"),
                        max_bookings=tmpl.max_bookings or 1,
                        staff_id=tmpl.staff_id,
                        is_available=True,
                    ))
                    created += 1

    # process extra_blocks — บล็อกเวลาเพิ่มเติมต่อวัน
    if tmpl and tmpl.extra_blocks:
        try:
            for blk in json.loads(tmpl.extra_blocks):
                blk_start = blk.get("start_time", "")
                blk_count = int(blk.get("rounds_count", 0))
                blk_min = int(blk.get("round_minutes", 60))
                blk_gap = int(blk.get("gap_minutes", 0))
                blk_max = int(blk.get("max_bookings", 1))
                if not blk_start or blk_count <= 0 or blk_min <= 0:
                    continue
                try:
                    blk_cursor = datetime.strptime(blk_start, "%H:%M")
                except ValueError:
                    continue
                for i in range(blk_count):
                    s = blk_cursor + timedelta(minutes=i * (blk_min + blk_gap))
                    e = s + timedelta(minutes=blk_min)
                    s_str = s.strftime("%H:%M")
                    if s_str not in surviving_start_times:
                        db.add(NailTimeSlot(
                            shop_id=shop_id,
                            slot_date=date_str,
                            start_time=s_str,
                            end_time=e.strftime("%H:%M"),
                            max_bookings=max(1, blk_max),
                            staff_id=tmpl.staff_id,
                            is_available=True,
                        ))
                        created += 1
        except Exception:
            pass

    if commit:
        db.commit()
    else:
        db.flush()
    return {"deleted": deleted, "created": created, "has_booked_slots_preserved": has_booked}


@router.post("/admin/slots/apply-template-day")
def admin_apply_template_for_day(
    body: ApplyTemplateDayBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """รีเซ็ตสล็อตวันนั้นให้ตรงกับเทมเพลต —
    ลบสล็อตที่ว่าง (ไม่มีการจอง) แล้วเพิ่มสล็อตที่ขาดหายจากเทมเพลต
    ต่างจาก _ensure_slots_for_date ตรงที่ทำงานได้แม้จะมีสล็อตเดิมอยู่แล้ว"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    date_str = body.date
    try:
        result = _apply_template_for_date_core(db, shop_id, date_str, shop.closed_dates)
    except Exception as e:
        logger.error(f"apply-template-day failed for {date_str} (shop {shop_id}): {e}", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"รีเซ็ตไม่สำเร็จ: {e}")
    return {"ok": True, **result}


class CustomDailyBlock(BaseModel):
    start_time: str
    rounds_count: int
    round_minutes: int
    gap_minutes: int = 0
    max_bookings: int = 1


class ApplyCustomDailyBody(BaseModel):
    date: str
    blocks: List[CustomDailyBlock]


@router.post("/admin/slots/apply-custom-daily")
def admin_apply_custom_daily(
    body: ApplyCustomDailyBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """สร้างสล็อตจากเทมเพลตเฉพาะวัน (กำหนดเอง) — ลบสล็อตที่ว่างก่อน แล้วสร้างใหม่จากหลายบล็อก
    สล็อตที่มีการจองอยู่แล้วจะถูกเก็บไว้เสมอ (ไม่ถูกลบ ไม่ถูกแตะต้อง)"""
    shop_id = _check_admin(authorization)
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)")

    # ดึงสล็อตที่มีอยู่แล้วของวันนี้
    existing = db.query(NailTimeSlot).filter_by(slot_date=body.date, shop_id=shop_id).all()
    slot_ids = [s.id for s in existing]

    # นับ booking ของทุกสล็อตทีเดียว (กัน N+1)
    any_counts: dict = {}
    if slot_ids:
        from sqlalchemy import func as sqlfunc2
        rows = (
            db.query(NailBooking.slot_id, sqlfunc2.count(NailBooking.id).label("total"))
            .filter(NailBooking.slot_id.in_(slot_ids))
            .group_by(NailBooking.slot_id)
            .all()
        )
        any_counts = {r.slot_id: r.total for r in rows}

    # ลบสล็อตที่ไม่มี booking อ้างอิง (FK safe)
    deleted = 0
    surviving_times: set = set()
    for sl in existing:
        if any_counts.get(sl.id, 0) == 0:
            db.delete(sl)
            deleted += 1
        else:
            surviving_times.add(sl.start_time)
    db.flush()

    # สร้างสล็อตใหม่จาก blocks ที่กำหนด
    created = 0
    for blk in body.blocks:
        if blk.rounds_count <= 0:
            continue
        try:
            cur = datetime.strptime(blk.start_time, "%H:%M")
        except ValueError:
            continue
        for i in range(blk.rounds_count):
            s_time = cur + timedelta(minutes=i * (blk.round_minutes + (blk.gap_minutes or 0)))
            e_time = s_time + timedelta(minutes=blk.round_minutes)
            start_str = s_time.strftime("%H:%M")
            if start_str in surviving_times:
                continue  # ข้ามเวลาที่มีคนจองอยู่แล้ว (ไม่เขียนทับ)
            db.add(NailTimeSlot(
                shop_id=shop_id,
                slot_date=body.date,
                start_time=start_str,
                end_time=e_time.strftime("%H:%M"),
                max_bookings=max(1, blk.max_bookings or 1),
                is_available=True,
            ))
            created += 1

    db.commit()
    return {"ok": True, "deleted": deleted, "created": created}


@router.post("/admin/slots")
def admin_create_slot(
    body: SlotBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    slot = NailTimeSlot(
        shop_id=shop_id,
        slot_date=body.slot_date,
        start_time=body.start_time,
        end_time=body.end_time,
        max_bookings=body.max_bookings or 1,
        staff_id=body.staff_id,
        is_available=True,
    )
    db.add(slot)
    db.commit()
    db.refresh(slot)
    return {"ok": True, "id": slot.id}


class SlotBatchBody(BaseModel):
    dates: list[str]          # ["2026-07-10", "2026-07-11", ...]
    times: list[dict]         # [{"start": "09:00", "end": "10:00"}, ...]
    max_bookings: Optional[int] = 1
    staff_id: Optional[int] = None


@router.post("/admin/slots/batch")
def admin_create_slots_batch(
    body: SlotBatchBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """สร้าง slot หลายวัน/หลายเวลาพร้อมกัน"""
    shop_id = _check_admin(authorization)
    created = 0
    for date in body.dates:
        for t in body.times:
            # ตรวจไม่ duplicate
            existing = db.query(NailTimeSlot).filter_by(
                slot_date=date, start_time=t["start"], shop_id=shop_id
            ).first()
            if existing:
                continue
            slot = NailTimeSlot(
                shop_id=shop_id,
                slot_date=date,
                start_time=t["start"],
                end_time=t["end"],
                max_bookings=body.max_bookings or 1,
                staff_id=body.staff_id,
                is_available=True,
            )
            db.add(slot)
            created += 1
    db.commit()
    return {"ok": True, "created": created}


@router.put("/admin/slots/{slot_id}")
def admin_update_slot(
    slot_id: int,
    body: dict,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    slot = db.query(NailTimeSlot).filter_by(id=slot_id, shop_id=shop_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="ไม่พบ slot")
    if "is_available" in body:
        slot.is_available = body["is_available"]
    if "max_bookings" in body:
        slot.max_bookings = body["max_bookings"]
    # แก้เวลาเริ่ม/สิ้นสุดของสล็อตนี้ตรงๆ — อนุญาตแม้มีลูกค้าจองอยู่แล้ว ตามที่ร้านต้องการคัสตอมเวลาได้เอง
    if "start_time" in body:
        slot.start_time = body["start_time"]
    if "end_time" in body:
        slot.end_time = body["end_time"]
    db.commit()
    return {"ok": True}


@router.delete("/admin/slots/{slot_id}")
def admin_delete_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    slot = db.query(NailTimeSlot).filter_by(id=slot_id, shop_id=shop_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="ไม่พบ slot")
    # ห้ามลบถ้ายังมี booking แถวไหนอ้างอิง slot นี้อยู่ (แม้สถานะจะเป็น cancelled ก็ตาม)
    # เพราะ FOREIGN KEY constraint จะทำให้ DELETE พังกลางทาง กลายเป็น 500/"เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
    # ที่ฝั่งแอดมิน — เช็คก่อนแล้วตอบเป็นข้อความที่เข้าใจง่ายแทน
    has_reference = db.query(NailBooking.id).filter(NailBooking.slot_id == slot_id).first() is not None
    if has_reference:
        raise HTTPException(
            status_code=400,
            detail="ลบสล็อตนี้ไม่ได้ เพราะมีประวัติการจอง (รวมที่ยกเลิกแล้ว) อ้างอิงอยู่ — ให้ปิดใช้งานสล็อตนี้แทน (ปุ่มเปิด/ปิด) หรือแก้ไขเวลาด้วยไอคอนดินสอ",
        )
    db.delete(slot)
    db.commit()
    return {"ok": True}


# ── Gallery Management ───────────────────────────────────────────────────────

class GalleryBody(BaseModel):
    image_url: str
    caption: Optional[str] = None
    sort_order: Optional[int] = 0


@router.get("/admin/gallery")
def admin_list_gallery(db: Session = Depends(get_db), authorization: str = Header(None)):
    shop_id = _check_admin(authorization)
    items = db.query(NailGallery).filter_by(shop_id=shop_id).order_by(NailGallery.sort_order, NailGallery.id.desc()).all()
    return [{"id": g.id, "image_url": g.image_url, "caption": g.caption,
             "sort_order": g.sort_order, "is_active": g.is_active} for g in items]


@router.post("/admin/gallery")
def admin_add_gallery(
    body: GalleryBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    g = NailGallery(shop_id=shop_id, image_url=body.image_url, caption=body.caption, sort_order=body.sort_order or 0)
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"ok": True, "id": g.id}


@router.delete("/admin/gallery/{gallery_id}")
def admin_delete_gallery(
    gallery_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    g = db.query(NailGallery).filter_by(id=gallery_id, shop_id=shop_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="ไม่พบรูป")
    db.delete(g)
    db.commit()
    return {"ok": True}


# ── Service Management ───────────────────────────────────────────────────────

class ServiceBody(BaseModel):
    name: str
    description: Optional[str] = None
    duration_minutes: Optional[int] = 60
    price: Optional[float] = 0
    deposit_amount: Optional[float] = None  # ถ้าไม่ระบุ (None) จะใช้ค่ามัดจำเริ่มต้นของร้าน
    color: Optional[str] = "#FF6B9D"
    sort_order: Optional[int] = 0


@router.get("/admin/services")
def admin_list_services(db: Session = Depends(get_db), authorization: str = Header(None)):
    shop_id = _check_admin(authorization)
    items = db.query(NailService).filter(NailService.is_active == True, NailService.shop_id == shop_id).order_by(NailService.sort_order, NailService.id).all()
    return [{"id": s.id, "name": s.name, "description": s.description,
             "duration_minutes": s.duration_minutes, "price": float(s.price or 0),
             "deposit_amount": float(s.deposit_amount) if s.deposit_amount is not None else None,
             "color": s.color, "is_active": s.is_active, "sort_order": s.sort_order}
            for s in items]


@router.post("/admin/services")
def admin_create_service(
    body: ServiceBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    s = NailService(
        shop_id=shop_id,
        name=body.name, description=body.description,
        duration_minutes=body.duration_minutes or 60,
        price=body.price or 0,
        deposit_amount=body.deposit_amount if body.deposit_amount is not None else None,
        color=body.color or "#FF6B9D",
        sort_order=body.sort_order or 0,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"ok": True, "id": s.id}


@router.put("/admin/services/{service_id}")
def admin_update_service(
    service_id: int,
    body: ServiceBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    s = db.query(NailService).filter_by(id=service_id, shop_id=shop_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="ไม่พบบริการ")
    s.name = body.name
    s.description = body.description
    s.duration_minutes = body.duration_minutes or 60
    s.price = body.price or 0
    s.deposit_amount = body.deposit_amount if body.deposit_amount is not None else None
    s.color = body.color or "#FF6B9D"
    s.sort_order = body.sort_order or 0
    db.commit()
    return {"ok": True}


@router.delete("/admin/services/{service_id}")
def admin_delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    s = db.query(NailService).filter_by(id=service_id, shop_id=shop_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="ไม่พบบริการ")
    s.is_active = False
    db.commit()
    return {"ok": True}


# ── Staff Management ─────────────────────────────────────────────────────────

class StaffBody(BaseModel):
    name: str
    color: Optional[str] = "#FF6B9D"


@router.get("/admin/staff")
def admin_list_staff(db: Session = Depends(get_db), authorization: str = Header(None)):
    shop_id = _check_admin(authorization)
    items = db.query(NailStaff).filter_by(shop_id=shop_id).order_by(NailStaff.id).all()
    return [{"id": s.id, "name": s.name, "color": s.color, "is_active": s.is_active}
            for s in items]


@router.post("/admin/staff")
def admin_create_staff(
    body: StaffBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    s = NailStaff(shop_id=shop_id, name=body.name, color=body.color or "#FF6B9D")
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"ok": True, "id": s.id}


@router.delete("/admin/staff/{staff_id}")
def admin_delete_staff(
    staff_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    s = db.query(NailStaff).filter_by(id=staff_id, shop_id=shop_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="ไม่พบช่าง")
    s.is_active = False
    db.commit()
    return {"ok": True}


# ── Shop Settings ────────────────────────────────────────────────────────────

class ShopSettingsBody(BaseModel):
    shop_name: Optional[str] = None
    shop_logo_url: Optional[str] = None
    shop_tagline: Optional[str] = None
    ig_url: Optional[str] = None
    fb_url: Optional[str] = None
    line_oa_url: Optional[str] = None
    tiktok_url: Optional[str] = None
    deposit_amount: Optional[float] = None
    bank_account_number: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_qr_url: Optional[str] = None
    max_advance_days: Optional[int] = None
    slot_duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None
    closed_dates: Optional[str] = None  # JSON array of "YYYY-MM-DD"
    truemoney_phone: Optional[str] = None
    accept_bank_transfer: Optional[bool] = None
    accept_truemoney_angpao: Optional[bool] = None
    brand_color: Optional[str] = None
    service_section_emoji: Optional[str] = None  # อีโมจิส่วนหัวบริการ
    show_why_choose_section: Optional[bool] = None
    why_choose_custom_text: Optional[str] = None
    why_choose_heading: Optional[str] = None


@router.get("/admin/settings")
def admin_get_settings(db: Session = Depends(get_db), authorization: str = Header(None)):
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    return {
        "shop_name": shop.shop_name,
        "shop_logo_url": shop.shop_logo_url,
        "shop_tagline": shop.shop_tagline,
        "ig_url": shop.ig_url,
        "fb_url": shop.fb_url,
        "line_oa_url": shop.line_oa_url,
        "tiktok_url": shop.tiktok_url,
        "deposit_amount": float(shop.deposit_amount or 200),
        "bank_account_number": shop.bank_account_number,
        "bank_name": shop.bank_name,
        "bank_account_name": shop.bank_account_name,
        "bank_qr_url": shop.bank_qr_url,
        "max_advance_days": shop.max_advance_days or 14,
        "slot_duration_minutes": shop.slot_duration_minutes or 60,
        "is_active": shop.is_active,
        "closed_dates": shop.closed_dates or "[]",
        "truemoney_phone": shop.truemoney_phone,
        "accept_bank_transfer": shop.accept_bank_transfer if shop.accept_bank_transfer is not None else True,
        "accept_truemoney_angpao": shop.accept_truemoney_angpao if shop.accept_truemoney_angpao is not None else True,
        "brand_color": shop.brand_color or "#B5174B",
        "service_section_emoji": shop.service_section_emoji or "💅",
        "show_why_choose_section": shop.show_why_choose_section if shop.show_why_choose_section is not None else True,
        "why_choose_custom_text": shop.why_choose_custom_text,
        "why_choose_heading": shop.why_choose_heading,
        "stats_reset_at": shop.stats_reset_at.isoformat() if shop.stats_reset_at else None,
    }


@router.post("/admin/settings/reset-stats")
def admin_reset_stats(db: Session = Depends(get_db), authorization: str = Header(None)):
    """รีเซ็ตการนับยอดสะสม (total_bookings + all_time_revenue) ให้เริ่มใหม่จากตอนนี้"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    shop.stats_reset_at = _now()
    db.commit()
    return {"ok": True, "reset_at": shop.stats_reset_at.isoformat()}


@router.put("/admin/settings")
def admin_update_settings(
    body: ShopSettingsBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    for field, val in body.model_dump(exclude_none=True).items():
        if field == "expired_at" and val:
            setattr(shop, field, datetime.fromisoformat(val))
        else:
            setattr(shop, field, val)
    db.commit()
    return {"ok": True}


# ── Rental / Renewal System ──────────────────────────────────────────────────

RENEWAL_PLANS = {1: 500.0, 3: 1300.0, 6: 2400.0, 12: 4500.0}


def _effective_renewal_plans(shop: "NailShopSettings") -> dict:
    """ราคาค่าเช่าจริงที่ใช้ — ใช้ราคาที่ super-admin ตั้งไว้เฉพาะร้านนี้ ถ้าไม่ได้ตั้งไว้ใช้ราคากลาง"""
    custom = {1: shop.price_1m, 3: shop.price_3m, 6: shop.price_6m, 12: shop.price_12m}
    return {
        months: float(custom[months]) if custom.get(months) is not None else default
        for months, default in RENEWAL_PLANS.items()
    }


_SUPERADMIN_FAILS: list = []   # [timestamp, ...] — in-memory rate limiter สำหรับ session token ผิด/หมดอายุ (global, ไม่แยกตาม IP)
_SUPERADMIN_FAIL_WINDOW = 300  # 5 นาที
_SUPERADMIN_FAIL_LIMIT = 10

# Rate limiter แยกต่างหากสำหรับ login endpoints (PIN/OTP ผิด) — ไม่ปนกับ
# ทราฟฟิกของ session token ที่หมดอายุ/ผิดบนหน้าแอดมิน ป้องกันไม่ให้ session
# เก่าที่ยังเปิดหน้าค้างอยู่ทำให้เจ้าของระบบ login ใหม่ไม่ได้ (self-lockout)
_SUPERADMIN_LOGIN_FAILS: list = []
_SUPERADMIN_LOGIN_FAIL_WINDOW = 300  # 5 นาที
_SUPERADMIN_LOGIN_FAIL_LIMIT = 10


def _check_login_rate_limit():
    now_ts = time.time()
    while _SUPERADMIN_LOGIN_FAILS and now_ts - _SUPERADMIN_LOGIN_FAILS[0] > _SUPERADMIN_LOGIN_FAIL_WINDOW:
        _SUPERADMIN_LOGIN_FAILS.pop(0)
    if len(_SUPERADMIN_LOGIN_FAILS) >= _SUPERADMIN_LOGIN_FAIL_LIMIT:
        logging.warning(f"[superadmin] login rate-limited: {len(_SUPERADMIN_LOGIN_FAILS)} failed attempts in last {_SUPERADMIN_LOGIN_FAIL_WINDOW}s")
        raise HTTPException(status_code=429, detail="พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอสักครู่")
    return now_ts

# ── Super-Admin session tokens (issued only after PIN + Telegram OTP) ───────
# ใช้ JWT ที่เซ็นด้วย NAIL_SUPER_ADMIN_KEY (stateless) แทนการเก็บ token ใน memory dict
# ผลลัพธ์: session ยังใช้ได้แม้ server restart (Render.com สามารถ restart ตลอดเวลา)
_SUPERADMIN_SESSION_TTL = 12 * 3600  # 12 ชั่วโมง
_SUPERADMIN_LOGIN_OTP_SENTINEL = "superadmin:login"


def _issue_superadmin_session() -> str:
    """ออก JWT session token สำหรับ superadmin — เซ็นด้วย NAIL_SUPER_ADMIN_KEY, หมดอายุใน 12 ชม."""
    cfg = get_settings()
    secret = cfg.nail_super_admin_key or secrets.token_urlsafe(32)
    payload = {
        "sub": "superadmin",
        "iat": int(time.time()),
        "exp": int(time.time()) + _SUPERADMIN_SESSION_TTL,
    }
    return _pyjwt.encode(payload, secret, algorithm="HS256")


def _check_superadmin(x_super_admin_key: Optional[str] = Header(None)):
    """ตรวจสอบ JWT session token ที่ออกให้หลังผ่าน PIN + Telegram OTP เท่านั้น
    (ไม่ยอมรับ NAIL_SUPER_ADMIN_KEY ดิบๆ อีกต่อไป — ต้อง login ผ่าน /superadmin/login/* ก่อน)
    stateless JWT: ใช้ได้แม้ server restart เพราะไม่เก็บ state ใน memory

    หมายเหตุ: ไม่มี rate limiter ที่นี่โดยเจตนา — JWT เซ็นด้วย secret key แล้ว ไม่มีประโยชน์ที่จะ
    rate-limit การตรวจสอบ signature เพราะ brute-force ทำไม่ได้จริง และการใส่ rate limiter
    ทำให้เกิด self-lockout เมื่อ session เก่าใน localStorage ยิง request หลายอันพร้อมกันก่อนที่
    ผู้ใช้จะ login ใหม่ (token เก่า → decode fail ทุกครั้ง → เกิน limit → token ใหม่ก็ถูก block ด้วย)
    Rate limiting ที่แท้จริงอยู่ที่ login endpoints (PIN/OTP) ใน _SUPERADMIN_LOGIN_FAILS แทน
    """
    cfg = get_settings()
    if not cfg.nail_super_admin_key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY ใน environment")

    token = x_super_admin_key or ""
    if not token:
        raise HTTPException(status_code=403, detail="เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")

    try:
        payload = _pyjwt.decode(token, cfg.nail_super_admin_key, algorithms=["HS256"])
        if payload.get("sub") != "superadmin":
            raise ValueError("wrong subject")
    except _pyjwt.ExpiredSignatureError:
        logging.warning("[superadmin] expired JWT session token")
        raise HTTPException(status_code=403, detail="เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่")
    except Exception:
        logging.warning("[superadmin] invalid JWT session token")
        raise HTTPException(status_code=403, detail="เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")


class SuperAdminRequestOtpBody(BaseModel):
    pin: str


class SuperAdminVerifyOtpBody(BaseModel):
    pin: str
    otp_code: str


_SUPERADMIN_TOTP_KEY = "superadmin_totp_secret"


def _get_superadmin_totp_secret(db: Session) -> Optional[str]:
    row = db.query(SystemConfig).filter_by(key=_SUPERADMIN_TOTP_KEY).first()
    return row.value if row else None


@router.post("/superadmin/login/request-otp")
async def superadmin_login_request_otp(body: SuperAdminRequestOtpBody, db: Session = Depends(get_db)):
    """ขั้นตอนที่ 1: ตรวจ PIN
    - ถ้าตั้ง TOTP แล้ว → return {method:'totp'} ให้ frontend กรอก code จาก Google Authenticator
    - ถ้ายังไม่ตั้ง TOTP → fallback ส่ง OTP ผ่าน Telegram (legacy)
    """
    cfg = get_settings()
    key = cfg.nail_super_admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY ใน environment")

    now_ts = _check_login_rate_limit()

    if not secrets.compare_digest(body.pin or "", key):
        _SUPERADMIN_LOGIN_FAILS.append(now_ts)
        logging.warning("[superadmin] failed PIN attempt")
        raise HTTPException(status_code=403, detail="PIN ไม่ถูกต้อง")

    # ── TOTP path (ร้านใหม่) ──
    totp_secret = _get_superadmin_totp_secret(db)
    if totp_secret:
        return {"ok": True, "method": "totp", "message": "กรอกรหัส 6 หลักจาก Google Authenticator"}

    # ── Legacy Telegram OTP path ──
    if not cfg.bot_token or not cfg.admin_group_id:
        raise HTTPException(
            status_code=503,
            detail="ยังไม่ได้ตั้ง TOTP และไม่พบ BOT_TOKEN/ADMIN_GROUP_ID — กรุณาตั้งค่า TOTP ก่อนที่ /superadmin/totp/setup",
        )

    db.query(EmailOTPSession).filter(EmailOTPSession.email == _SUPERADMIN_LOGIN_OTP_SENTINEL).delete()

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    session = EmailOTPSession(
        session_token=secrets.token_urlsafe(32),
        email=_SUPERADMIN_LOGIN_OTP_SENTINEL,
        otp_code=otp_code,
        is_used=False,
        expires_at=_now() + timedelta(minutes=5),
    )
    db.add(session)
    db.commit()

    message = (
        "🔐 <b>Super Admin — รหัสยืนยันเข้าสู่ระบบ</b>\n\n"
        f"OTP: <code>{otp_code}</code>\n\n"
        "⚠️ OTP มีอายุ 5 นาที ห้ามแชร์กับผู้อื่น"
    )
    telegram_sent = await _send_telegram_message(cfg.bot_token, cfg.admin_group_id, message)
    if not telegram_sent:
        logging.warning("[superadmin] login OTP generated but Telegram send failed")
        raise HTTPException(status_code=502, detail="ส่ง OTP ผ่าน Telegram ไม่สำเร็จ กรุณาลองใหม่")

    return {"ok": True, "method": "telegram", "telegram_sent": True, "expires_in_seconds": 300}


@router.post("/superadmin/login/verify-otp")
def superadmin_login_verify_otp(body: SuperAdminVerifyOtpBody, db: Session = Depends(get_db)):
    """ขั้นตอนที่ 2: ตรวจ PIN + code
    - ถ้าตั้ง TOTP แล้ว → ตรวจ TOTP code จาก Google Authenticator
    - ถ้ายังไม่ตั้ง TOTP → ตรวจ OTP ที่ส่งไป Telegram (legacy)
    """
    cfg = get_settings()
    key = cfg.nail_super_admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY ใน environment")

    now_ts = _check_login_rate_limit()

    if not secrets.compare_digest(body.pin or "", key):
        _SUPERADMIN_LOGIN_FAILS.append(now_ts)
        logging.warning("[superadmin] failed PIN attempt (verify-otp)")
        raise HTTPException(status_code=403, detail="PIN ไม่ถูกต้อง")

    # ── TOTP path ──
    totp_secret = _get_superadmin_totp_secret(db)
    if totp_secret:
        if not _verify_totp(totp_secret, body.otp_code or ""):
            _SUPERADMIN_LOGIN_FAILS.append(now_ts)
            logging.warning("[superadmin] invalid TOTP code")
            raise HTTPException(status_code=403, detail="รหัส TOTP ไม่ถูกต้อง กรุณาตรวจสอบเวลาอุปกรณ์ให้ตรงกัน")
        token = _issue_superadmin_session()
        logging.info("[superadmin] TOTP login success")
        return {"ok": True, "token": token, "expires_in_seconds": _SUPERADMIN_SESSION_TTL}

    # ── Legacy Telegram OTP path ──
    now = _now()
    otp_session = (
        db.query(EmailOTPSession)
        .filter(
            EmailOTPSession.email == _SUPERADMIN_LOGIN_OTP_SENTINEL,
            EmailOTPSession.otp_code == (body.otp_code or "").strip(),
            EmailOTPSession.is_used == False,  # noqa: E712
            EmailOTPSession.expires_at > now,
        )
        .first()
    )
    if not otp_session:
        _SUPERADMIN_LOGIN_FAILS.append(now_ts)
        logging.warning("[superadmin] invalid or expired OTP attempt")
        raise HTTPException(status_code=403, detail="OTP ไม่ถูกต้องหรือหมดอายุ")

    otp_session.is_used = True
    db.commit()

    token = _issue_superadmin_session()
    logging.info("[superadmin] Telegram OTP login success")
    return {"ok": True, "token": token, "expires_in_seconds": _SUPERADMIN_SESSION_TTL}


@router.post("/superadmin/logout")
def superadmin_logout(x_super_admin_key: Optional[str] = Header(None)):
    """Logout สำหรับ superadmin — ใช้ stateless JWT แล้ว ไม่ต้องล้าง server-side state
    การ logout จริงเกิดที่ฝั่ง client (ลบ token จาก localStorage) token เก่าจะหมดอายุเองใน 12 ชม."""
    return {"ok": True}


@router.get("/admin/rental-status")
def admin_rental_status(db: Session = Depends(get_db), authorization: str = Header(None)):
    """สถานะการเช่าระบบ + คำขอต่ออายุล่าสุด"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    now = _now()
    expired = bool(shop.expired_at and now > shop.expired_at)
    days_left: Optional[int] = None
    if shop.expired_at and not expired:
        days_left = (shop.expired_at - now).days

    last_req = (
        db.query(NailRenewalRequest)
        .filter_by(shop_id=shop_id)
        .order_by(NailRenewalRequest.requested_at.desc())
        .first()
    )
    return {
        "expired_at": shop.expired_at.isoformat() if shop.expired_at else None,
        "is_expired": expired,
        "days_left": days_left,
        "last_request": {
            "id": last_req.id,
            "duration_months": last_req.duration_months,
            "amount": float(last_req.amount),
            "status": last_req.status,
            "payment_channel": last_req.payment_channel,
            "admin_note": last_req.admin_note,
            "requested_at": last_req.requested_at.isoformat() if last_req.requested_at else None,
            "new_expired_at": last_req.new_expired_at.isoformat() if last_req.new_expired_at else None,
        } if last_req else None,
    }


@router.get("/admin/renewal-plans")
def admin_get_renewal_plans(db: Session = Depends(get_db), authorization: str = Header(None)):
    """ราคาค่าเช่าที่ใช้จริงกับร้านนี้ (super-admin อาจตั้งราคาพิเศษเฉพาะร้านไว้)"""
    shop_id = _check_admin(authorization)
    shop = _get_shop(db, shop_id)
    plans = _effective_renewal_plans(shop)
    return [{"months": m, "price": plans[m]} for m in (1, 3, 6, 12)]


class RenewalRequestBody(BaseModel):
    duration_months: int
    payment_channel: str                # "bank_slip" | "angpao"
    slip_image: Optional[str] = None    # base64 data URI (สำหรับโอนผ่านสลิป)
    voucher_code: Optional[str] = None  # TrueMoney gift voucher URL หรือรหัสซอง


@router.post("/admin/renewal-request")
async def admin_submit_renewal(
    body: RenewalRequestBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """ส่งคำขอต่ออายุ — angpao ใช้ TrueMoney auto-redeem อัตโนมัติ, สลิปรอ super-admin ตรวจสอบ"""
    shop_id = _check_admin(authorization)
    if body.payment_channel not in ("bank_slip", "angpao"):
        raise HTTPException(status_code=400, detail="ช่องทางชำระเงินไม่ถูกต้อง")
    if body.payment_channel == "bank_slip" and not body.slip_image:
        raise HTTPException(status_code=400, detail="กรุณาแนบสลิปโอนเงิน")
    if body.payment_channel == "angpao" and not body.voucher_code:
        raise HTTPException(status_code=400, detail="กรุณาระบุลิงก์/รหัสซองอั่งเปา")

    shop = _get_shop(db, shop_id)
    plan_price = _effective_renewal_plans(shop).get(body.duration_months)
    if not plan_price:
        raise HTTPException(status_code=400, detail="ระยะเวลาไม่ถูกต้อง (เลือก 1, 3, 6 หรือ 12 เดือน)")

    # ── แยก & ตรวจสอบรูปแบบ voucher ก่อนสร้าง record ──────────────────────
    if body.payment_channel == "angpao":
        from backend.truemoney import (
            extract_voucher_code as _extract_vc,
            redeem_voucher as _redeem,
        )
        from backend.models import StoreSettings, TopupRequest
        voucher_code = _extract_vc(body.voucher_code)   # raise 400 ถ้า format ผิด

        # ── Double-spend guard: ตรวจว่าซองนี้ถูกใช้ไปแล้วหรือยัง ────────────
        used_in_renewal = db.query(NailRenewalRequest).filter(
            NailRenewalRequest.slip_image == f"voucher:{voucher_code}"
        ).first()
        used_in_topup = db.query(TopupRequest).filter(
            TopupRequest.voucher_code == voucher_code
        ).first()
        if used_in_renewal or used_in_topup:
            raise HTTPException(status_code=409, detail="ซองอั่งเปานี้ถูกใช้ไปแล้ว กรุณาใช้ซองใหม่")

        image_or_voucher = f"voucher:{voucher_code}"
    else:
        image_or_voucher = body.slip_image

    req = NailRenewalRequest(
        shop_id=shop_id,
        duration_months=body.duration_months,
        amount=plan_price,
        slip_image=image_or_voucher,
        payment_channel=body.payment_channel,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # ── TrueMoney Angpao: auto-redeem อัตโนมัติ (เหมือน wallet topup flow) ──
    if body.payment_channel == "angpao":
        try:
            phone_row = db.query(StoreSettings).filter_by(key="truemoney_phone").first()
            phone = (phone_row.value or "").strip() if phone_row else ""
            result = await _redeem(voucher_code, phone) if phone else await _redeem(voucher_code)

            logger.info(f"TrueMoney renewal #{req.id}: success={result['success']} amount={result.get('amount')}")

            if result["success"]:
                voucher_amount = Decimal(str(result["amount"]))
                if voucher_amount >= Decimal(str(plan_price)):
                    # ✅ อนุมัติอัตโนมัติ — ขยาย expired_at
                    now = _now()
                    base = shop.expired_at if (shop.expired_at and shop.expired_at > now) else now
                    new_expiry = base + timedelta(days=body.duration_months * 30)
                    shop.expired_at = new_expiry
                    req.status = "approved"
                    req.approved_at = now
                    req.new_expired_at = new_expiry
                    req.admin_note = f"อนุมัติอัตโนมัติ ซอง ฿{float(voucher_amount):,.0f}"
                    db.commit()
                    return {
                        "ok": True,
                        "auto_approved": True,
                        "id": req.id,
                        "new_expired_at": new_expiry.isoformat(),
                        "voucher_amount": float(voucher_amount),
                        "message": f"ต่ออายุสำเร็จ! แลกซอง ฿{float(voucher_amount):,.0f} อัตโนมัติ",
                    }
                else:
                    # ซองมียอดน้อยกว่าราคา — รอ super-admin
                    req.admin_note = f"ซองมียอด ฿{float(voucher_amount):,.0f} น้อยกว่าราคา ฿{float(plan_price):,.0f}"
                    db.commit()
                    return {
                        "ok": True,
                        "auto_approved": False,
                        "id": req.id,
                        "message": (
                            f"ยอดในซอง ฿{float(voucher_amount):,.0f} น้อยกว่าราคา ฿{float(plan_price):,.0f} "
                            "— บันทึกไว้แล้ว รอแอดมินตรวจสอบ"
                        ),
                    }
            else:
                # แลกไม่สำเร็จ — รอ super-admin
                err_msg = result["error_message"] or "แลกซองไม่สำเร็จ"
                req.admin_note = f"แลกซองไม่สำเร็จ: {err_msg}"
                db.commit()
                return {
                    "ok": True,
                    "auto_approved": False,
                    "id": req.id,
                    "message": f"แลกซองไม่สำเร็จ ({err_msg}) — บันทึกไว้แล้ว รอแอดมินตรวจสอบ",
                }

        except HTTPException:
            raise   # format error ส่งกลับทันที
        except Exception as e:
            logger.warning(f"TrueMoney renewal auto-redeem error for #{req.id}: {e}")
            db.commit()
            return {
                "ok": True,
                "auto_approved": False,
                "id": req.id,
                "message": "ติดต่อ TrueMoney ไม่ได้ชั่วคราว — บันทึกไว้แล้ว รอแอดมินตรวจสอบ",
            }

    # bank_slip — รอ super-admin ตรวจสอบสลิป
    return {"ok": True, "auto_approved": False, "id": req.id, "message": None}


# ── Nail Admin: Wallet / Top-up management ───────────────────────────────────

def _parse_tm_fail_reason(truemoney_result: str | None) -> str | None:
    """แยกสาเหตุที่แลกซองไม่สำเร็จจาก JSON ที่เก็บไว้ใน truemoney_result"""
    if not truemoney_result:
        return None
    try:
        import json as _json
        raw = _json.loads(truemoney_result)
        from backend.truemoney import TRUEMONEY_ERROR_MESSAGES
        err_code = str(raw.get("code", ""))
        return TRUEMONEY_ERROR_MESSAGES.get(err_code) or raw.get("message") or None
    except Exception:
        return None


def _require_platform_admin(authorization: str) -> int:
    """
    Wallet/customer credit (Customer, CreditTransaction, TopupRequest) เป็นทรัพยากรระดับ
    แพลตฟอร์ม ไม่ผูกกับร้านทำเล็บร้านใดร้านหนึ่ง — จำกัดให้เฉพาะแอดมินของร้านหลัก (shop_id=1)
    เท่านั้นที่จัดการได้ ป้องกันแอดมินร้านอื่น (ที่ superadmin สร้างเพิ่ม) เข้าถึงกระเป๋าเงินลูกค้าทั้งระบบ
    """
    shop_id = _check_admin(authorization)
    if shop_id != 1:
        raise HTTPException(status_code=403, detail="ฟีเจอร์นี้ใช้ได้เฉพาะแอดมินร้านหลักเท่านั้น")
    return shop_id


@router.get("/admin/topup-requests")
def nail_admin_list_topups(
    status: str = "pending",
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """รายการขอเติมเครดิต — กรองเฉพาะร้านที่ admin ล็อกอิน (shop_id=1 รวม NULL = legacy)"""
    shop_id = _check_admin(authorization)
    from backend.models import TopupRequest
    q = db.query(TopupRequest)
    if status != "all":
        q = q.filter(TopupRequest.status == status)
    # กรองตาม shop — shop_id=1 เห็น NULL ด้วย (records เก่าก่อน multi-tenant)
    if shop_id == 1:
        q = q.filter((TopupRequest.shop_id == 1) | (TopupRequest.shop_id.is_(None)))
    else:
        q = q.filter(TopupRequest.shop_id == shop_id)
    topups = q.order_by(TopupRequest.id.desc()).limit(100).all()
    result = []
    for t in topups:
        cust = db.query(Customer).filter(Customer.id == t.customer_id).first()
        result.append({
            "id": t.id,
            "customer_email": cust.email if cust else "?",
            "customer_name": (cust.display_name or "") if cust else "",
            "customer_phone": (cust.phone_number or "") if cust else "",
            "topup_type": t.topup_type,
            "amount": float(t.amount) if t.amount else None,
            "status": t.status,
            "payment_proof": t.payment_proof or None,
            "voucher_code": t.voucher_code or None,
            "slip_verify_status": t.slip_verify_status,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            # สาเหตุที่แลกซองไม่สำเร็จ (มีเฉพาะ TrueMoney ที่ผ่านการ auto-verify แล้วล้มเหลว)
            "fail_reason": _parse_tm_fail_reason(t.truemoney_result) if t.topup_type == "truemoney" else None,
        })
    return result


@router.post("/admin/topup-requests/{topup_id}/approve")
def nail_admin_approve_topup(
    topup_id: int,
    body: dict,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """อนุมัติคำขอเติมเครดิต — ตรวจสิทธิ์ว่าเป็นร้านเดียวกับที่ลูกค้าเติม"""
    shop_id = _check_admin(authorization)
    from backend.models import TopupRequest
    topup = db.query(TopupRequest).filter(TopupRequest.id == topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ")
    # ตรวจสิทธิ์ร้าน (NULL = legacy shop 1)
    topup_shop = topup.shop_id if topup.shop_id is not None else 1
    if topup_shop != shop_id:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์จัดการรายการของร้านอื่น")
    if topup.status != "pending":
        raise HTTPException(status_code=400, detail="รายการนี้ดำเนินการแล้ว")
    amount = Decimal(str(body.get("amount", topup.amount or 0)))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="กรุณาระบุจำนวนเครดิต")
    customer = db.query(Customer).filter(Customer.id == topup.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="ไม่พบบัญชีลูกค้า")
    topup.amount = amount
    topup.status = "approved"
    customer.balance = (customer.balance or Decimal("0")) + amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        shop_id=shop_id,
        txn_type="topup",
        amount=amount,
        description=f"อนุมัติเติมเครดิต #{topup_id} ({topup.topup_type})",
        ref_id=topup_id,
    ))
    db.commit()
    return {"ok": True, "balance": float(customer.balance)}


@router.post("/admin/topup-requests/{topup_id}/reject")
def nail_admin_reject_topup(
    topup_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """ปฏิเสธคำขอเติมเครดิต — ตรวจสิทธิ์ว่าเป็นร้านเดียวกัน"""
    shop_id = _check_admin(authorization)
    from backend.models import TopupRequest
    topup = db.query(TopupRequest).filter(TopupRequest.id == topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ")
    topup_shop = topup.shop_id if topup.shop_id is not None else 1
    if topup_shop != shop_id:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์จัดการรายการของร้านอื่น")
    topup.status = "rejected"
    db.commit()
    return {"ok": True}


# ── Admin: customer wallet management ────────────────────────────────────────

@router.get("/admin/customers")
def nail_admin_list_customers(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """รายชื่อลูกค้าที่เคยเติมเงินผ่านร้านนี้ — กรองตาม shop_id ของ admin"""
    shop_id = _check_admin(authorization)
    from backend.models import TopupRequest
    # แสดงเฉพาะลูกค้าที่มี topup_request กับร้านนี้
    if shop_id == 1:
        cust_ids_q = (
            db.query(TopupRequest.customer_id)
            .filter((TopupRequest.shop_id == 1) | (TopupRequest.shop_id.is_(None)))
            .distinct()
        )
    else:
        cust_ids_q = (
            db.query(TopupRequest.customer_id)
            .filter(TopupRequest.shop_id == shop_id)
            .distinct()
        )
    cust_ids = [r[0] for r in cust_ids_q.all()]
    customers = (
        db.query(Customer)
        .filter(Customer.id.in_(cust_ids))
        .order_by(Customer.id.desc())
        .limit(300)
        .all()
    )
    return [
        {
            "id": c.id,
            "email": c.email or "",
            "display_name": c.display_name or "",
            "phone_number": c.phone_number or "",
            "balance": float(c.balance or 0),
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in customers
    ]


@router.post("/admin/customers/{customer_id}/credit")
def nail_admin_add_credit(
    customer_id: int,
    body: dict,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """เพิ่ม/ลด เครดิต — ตรวจสิทธิ์ว่าลูกค้าเคยเติมเงินผ่านร้านนี้"""
    shop_id = _check_admin(authorization)
    from backend.models import TopupRequest
    # ตรวจสิทธิ์ — shop_id=1 เข้าถึงได้ทุกลูกค้า (backward compat), ร้านอื่นต้องมี topup จากร้านนั้น
    if shop_id != 1:
        allowed = (
            db.query(TopupRequest)
            .filter(TopupRequest.customer_id == customer_id, TopupRequest.shop_id == shop_id)
            .first()
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="ลูกค้ารายนี้ไม่ได้อยู่ในร้านของคุณ")
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="ไม่พบลูกค้า")
    try:
        amount = Decimal(str(body.get("amount", 0)))
    except Exception:
        raise HTTPException(status_code=400, detail="จำนวนเงินไม่ถูกต้อง")
    if amount == 0:
        raise HTTPException(status_code=400, detail="กรุณาระบุจำนวน")
    reason = body.get("reason", "แอดมินเพิ่มเครดิต")
    customer.balance = (customer.balance or Decimal("0")) + amount
    db.add(CreditTransaction(
        customer_id=customer.id,
        shop_id=shop_id,
        txn_type="adjustment",
        amount=amount,
        description=f"[แอดมิน] {reason}",
        ref_id=None,
    ))
    db.commit()
    return {"ok": True, "balance": float(customer.balance)}


@router.get("/admin/transactions")
def nail_admin_list_transactions(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
    limit: int = 100,
):
    """ประวัติธุรกรรมเครดิต — กรองเฉพาะร้านที่ admin ล็อกอิน"""
    shop_id = _check_admin(authorization)
    q = db.query(CreditTransaction)
    # กรองตาม shop — shop_id=1 เห็น NULL ด้วย (legacy)
    if shop_id == 1:
        q = q.filter((CreditTransaction.shop_id == 1) | (CreditTransaction.shop_id.is_(None)))
    else:
        q = q.filter(CreditTransaction.shop_id == shop_id)
    txns = (
        q
        .order_by(CreditTransaction.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    result = []
    for t in txns:
        cust = db.query(Customer).filter(Customer.id == t.customer_id).first()
        result.append({
            "id": t.id,
            "customer_id": t.customer_id,
            "customer_email": cust.email if cust else None,
            "customer_name": (cust.display_name or cust.email or "?") if cust else "?",
            "txn_type": t.txn_type,
            "amount": float(t.amount),
            "description": t.description or "",
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


# ── Super-Admin endpoints (NAIL_SUPER_ADMIN_KEY required) ────────────────────

@router.get("/superadmin/shops")
def superadmin_list_shops(db: Session = Depends(get_db), x_super_admin_key: Optional[str] = Header(None)):
    """รายชื่อร้านทั้งหมดในระบบ — ใช้เลือกร้านที่จะจัดการต่อ"""
    _check_superadmin(x_super_admin_key)
    shops = db.query(Shop).order_by(Shop.id).all()
    now = _now()
    result = []
    for sh in shops:
        settings_row = db.query(NailShopSettings).filter_by(shop_id=sh.id).first()
        expired_at = settings_row.expired_at if settings_row else None
        expired = bool(expired_at and now > expired_at)
        result.append({
            "id": sh.id,
            "slug": sh.slug,
            "name": sh.name,
            "is_active": sh.is_active,
            "shop_name": settings_row.shop_name if settings_row else None,
            "expired_at": expired_at.isoformat() if expired_at else None,
            "is_expired": expired,
            "days_left": (expired_at - now).days if expired_at and not expired else None,
        })
    return result


class CreateShopBody(BaseModel):
    slug: str
    name: str
    expiry_days: Optional[int] = 30  # อายุการเช่าเริ่มต้น (วัน) — null = ไม่มีกำหนด
    business_type: Optional[str] = "nail"  # นวด/ตัดผม/สปา/ล้างรถ/ทำเล็บ/อื่นๆ — ดู BUSINESS_TYPE_TEMPLATES


@router.get("/superadmin/business-types")
def superadmin_list_business_types(x_super_admin_key: Optional[str] = Header(None)):
    """รายชื่อประเภทธุรกิจที่เลือกได้ตอนสร้างร้าน — ใช้ populate dropdown ฝั่ง superadmin UI"""
    _check_superadmin(x_super_admin_key)
    return [{"value": k, "label": v["label"], "emoji": v["emoji"]} for k, v in BUSINESS_TYPE_TEMPLATES.items()]


@router.post("/superadmin/shops")
def superadmin_create_shop(
    body: CreateShopBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """สร้างร้านใหม่ (clone ระบบ) — ข้อมูลของแต่ละร้านแยกกันโดยสมบูรณ์ผ่าน shop_id"""
    _check_superadmin(x_super_admin_key)
    slug = (body.slug or "").strip().lower()
    if not slug or not re.match(r"^[a-z0-9-]+$", slug):
        raise HTTPException(status_code=400, detail="slug ต้องเป็นตัวอักษรอังกฤษเล็ก ตัวเลข หรือ - เท่านั้น")
    if db.query(Shop).filter_by(slug=slug).first():
        raise HTTPException(status_code=409, detail="slug นี้มีร้านอื่นใช้อยู่แล้ว")

    business_type = (body.business_type or "nail").strip().lower()
    tmpl = BUSINESS_TYPE_TEMPLATES.get(business_type) or BUSINESS_TYPE_TEMPLATES["nail"]
    if business_type not in BUSINESS_TYPE_TEMPLATES:
        business_type = "nail"

    try:
        shop_row = Shop(slug=slug, name=body.name, is_active=True)
        db.add(shop_row)
        db.flush()  # ได้ shop_row.id

        # สร้างแถว settings ด้วย explicit values สำหรับทุก NOT NULL column
        # เพื่อไม่ให้เกิด "column does not exist" ถ้า migration ยังไม่ได้รันใน prod
        settings_row = NailShopSettings(
            shop_id=shop_row.id,
            shop_name=body.name,
            shop_tagline=tmpl["tagline"],
            business_type=business_type,
            deposit_amount=200,
            is_active=True,
            max_advance_days=14,
            slot_duration_minutes=60,
            accept_bank_transfer=True,
            accept_truemoney_angpao=True,
        )
        if body.expiry_days is not None:
            settings_row.expired_at = _now() + timedelta(days=max(0, body.expiry_days))
        db.add(settings_row)
        db.flush()

        # seed บริการตัวอย่างตามประเภทธุรกิจ — ร้านแก้ไข/ลบ/เพิ่มเองได้ทันทีในหน้า Admin > บริการ
        for i, svc in enumerate(tmpl["services"]):
            db.add(NailService(
                shop_id=shop_row.id,
                name=svc["name"],
                duration_minutes=svc["duration_minutes"],
                price=svc["price"],
                color=svc["color"],
                is_active=True,
                sort_order=i,
            ))

        db.commit()
        db.refresh(shop_row)
    except Exception as e:
        db.rollback()
        logging.error(f"[superadmin] create_shop failed for slug={slug!r}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="สร้างร้านไม่สำเร็จ กรุณาดู server log เพื่อดูรายละเอียด")

    try:
        _ensure_templates_exist(db, shop_row.id)
    except Exception as e:
        logging.warning(f"[superadmin] _ensure_templates_exist failed for shop {shop_row.id}: {e}")
        # ไม่ถึงขั้น fail — ร้านสร้างสำเร็จแล้ว admin แก้เทมเพลตเองได้ทีหลัง

    return {"ok": True, "id": shop_row.id, "slug": shop_row.slug}


class ShopActiveBody(BaseModel):
    is_active: bool


@router.put("/superadmin/shops/{shop_id}/active")
def superadmin_set_shop_active(
    shop_id: int,
    body: ShopActiveBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """เปิด/ปิด (ระงับ) การใช้งานร้าน — ร้านที่ระงับจะเข้าระบบจองไม่ได้ทันที"""
    _check_superadmin(x_super_admin_key)
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    shop_row.is_active = body.is_active
    db.commit()
    return {"ok": True, "is_active": shop_row.is_active}


class ShopExpiryDaysBody(BaseModel):
    days: int  # จำนวนวันที่จะ "เพิ่ม" (ค่าลบ = ลดอายุ) จากวันหมดอายุปัจจุบัน (หรือวันนี้ถ้ายังไม่มี/หมดแล้ว)


@router.put("/superadmin/shops/{shop_id}/expiry-days")
def superadmin_adjust_shop_expiry_days(
    shop_id: int,
    body: ShopExpiryDaysBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ปรับอายุการเช่าของร้าน โดยระบุจำนวนวันที่จะเพิ่ม/ลดจากวันหมดอายุปัจจุบัน"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db, shop_id)
    now = _now()
    base = shop.expired_at if (shop.expired_at and shop.expired_at > now) else now
    shop.expired_at = base + timedelta(days=body.days)
    db.commit()
    return {"ok": True, "expired_at": shop.expired_at.isoformat() if shop.expired_at else None}


class RenameShopBody(BaseModel):
    name: str


@router.put("/superadmin/shops/{shop_id}/name")
def superadmin_rename_shop(
    shop_id: int,
    body: RenameShopBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """เปลี่ยนชื่อร้าน (Shop.name และ NailShopSettings.shop_name พร้อมกัน)"""
    _check_superadmin(x_super_admin_key)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="ชื่อร้านต้องไม่ว่าง")
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    shop_row.name = name
    settings_row = db.query(NailShopSettings).filter_by(shop_id=shop_id).first()
    if settings_row:
        settings_row.shop_name = name
    db.commit()
    return {"ok": True, "name": name}


# Sentinel email prefix ที่ใช้ใน EmailOTPSession สำหรับ delete-shop OTPs
_DELETE_OTP_SENTINEL_PREFIX = "superadmin:delete-shop:"


async def _send_telegram_message(bot_token: str, chat_id: str, text: str) -> bool:
    """ส่งข้อความผ่าน Telegram Bot API คืน True ถ้าสำเร็จ"""
    try:
        import httpx
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"})
            if resp.status_code == 200:
                return True
            logging.error(f"[superadmin] Telegram sendMessage failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        logging.error(f"[superadmin] Telegram sendMessage error: {e}")
        return False


@router.post("/superadmin/shops/{shop_id}/delete-otp")
async def superadmin_request_delete_otp(
    shop_id: int,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ขอ OTP 6 หลักเพื่อยืนยันการลบร้าน
    - OTP เก็บใน DB (email_otp_sessions) จึงทำงานถูกต้องในทุก deployment scenario
    - ส่ง OTP ผ่าน Telegram Bot ไปยัง ADMIN_GROUP_ID; ถ้าไม่ตั้งค่า → log ที่ server
    """
    _check_superadmin(x_super_admin_key)
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    if shop_id == 1:
        raise HTTPException(status_code=400, detail="ไม่สามารถลบร้านหลัก (id=1) ได้")

    sentinel_email = f"{_DELETE_OTP_SENTINEL_PREFIX}{shop_id}"
    now = _now()

    # ลบ OTP เก่าของร้านนี้ก่อน (ป้องกัน spam)
    db.query(EmailOTPSession).filter(
        EmailOTPSession.email == sentinel_email
    ).delete()

    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    session_token = secrets.token_urlsafe(32)
    session = EmailOTPSession(
        session_token=session_token,
        email=sentinel_email,
        otp_code=otp_code,
        is_used=False,
        expires_at=now + timedelta(minutes=5),
    )
    db.add(session)
    db.commit()

    cfg = get_settings()
    telegram_sent = False
    if cfg.bot_token and cfg.admin_group_id:
        message = (
            f"🗑️ <b>Super Admin — ยืนยันลบร้าน</b>\n\n"
            f"ร้าน: <b>{shop_row.name}</b> (slug: <code>{shop_row.slug}</code>)\n"
            f"OTP: <code>{otp_code}</code>\n\n"
            f"⚠️ OTP มีอายุ 5 นาที ห้ามแชร์กับผู้อื่น"
        )
        telegram_sent = await _send_telegram_message(cfg.bot_token, cfg.admin_group_id, message)

    if not telegram_sent:
        # Fallback: log ฝั่ง server ให้ดูได้จาก Render logs
        logging.warning(
            f"[superadmin] delete-shop OTP for shop_id={shop_id} slug={shop_row.slug!r}: {otp_code} "
            f"(Telegram not configured or failed — check server logs)"
        )

    return {
        "ok": True,
        "telegram_sent": telegram_sent,
        "expires_in_seconds": 300,
        # ไม่คืน OTP ใน response ไม่ว่ากรณีใด → ดูจาก Telegram หรือ server log
    }


class DeleteShopBody(BaseModel):
    totp_code: str       # รหัส 6 หลักจาก Google Authenticator
    confirm_slug: str


@router.delete("/superadmin/shops/{shop_id}")
def superadmin_delete_shop(
    shop_id: int,
    body: DeleteShopBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ลบร้านและข้อมูลทั้งหมดแบบถาวร — ยืนยันด้วย TOTP (Google Authenticator) + พิมพ์ slug ร้าน"""
    _check_superadmin(x_super_admin_key)
    if shop_id == 1:
        raise HTTPException(status_code=400, detail="ไม่สามารถลบร้านหลัก (id=1) ได้")

    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")

    if body.confirm_slug.strip() != shop_row.slug:
        raise HTTPException(status_code=400, detail="slug ไม่ตรงกับร้านที่ต้องการลบ")

    # ยืนยัน TOTP แทน Telegram OTP
    totp_secret = _get_superadmin_totp_secret(db)
    if not totp_secret:
        raise HTTPException(status_code=400, detail="ยังไม่ได้ตั้งค่า TOTP กรุณาตั้งค่าที่ /superadmin/setup-totp ก่อน")
    if not _verify_totp(totp_secret, (body.totp_code or "").strip()):
        raise HTTPException(status_code=403, detail="รหัส Google Authenticator ไม่ถูกต้อง")

    slug_deleted = shop_row.slug
    try:
        # ลบตามลำดับ FK dependency (child → parent)
        db.query(NailApiStats).filter(NailApiStats.shop_id == shop_id).delete()
        db.query(NailRenewalRequest).filter(NailRenewalRequest.shop_id == shop_id).delete()
        db.query(NailGallery).filter(NailGallery.shop_id == shop_id).delete()
        db.query(NailBooking).filter(NailBooking.shop_id == shop_id).delete()
        db.query(NailTimeSlot).filter(NailTimeSlot.shop_id == shop_id).delete()
        db.query(NailSlotTemplate).filter(NailSlotTemplate.shop_id == shop_id).delete()
        db.query(NailStaff).filter(NailStaff.shop_id == shop_id).delete()
        db.query(NailService).filter(NailService.shop_id == shop_id).delete()
        db.query(NailShopApiKeys).filter(NailShopApiKeys.shop_id == shop_id).delete()
        db.query(NailShopSettings).filter(NailShopSettings.shop_id == shop_id).delete()
        # wallet / customer references เป็น nullable FK → null ออกแทนลบ
        db.query(TopupRequest).filter(TopupRequest.shop_id == shop_id).update({"shop_id": None})
        db.query(CreditTransaction).filter(CreditTransaction.shop_id == shop_id).update({"shop_id": None})
        db.query(Customer).filter(Customer.shop_id == shop_id).update({"shop_id": None})
        db.query(ShopRegistration).filter(ShopRegistration.shop_id == shop_id).update({"shop_id": None})
        # ลบ OTP sessions ที่เกี่ยวข้อง
        db.query(EmailOTPSession).filter(
            EmailOTPSession.email == f"{_DELETE_OTP_SENTINEL_PREFIX}{shop_id}"
        ).delete()
        db.delete(shop_row)
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"[superadmin] delete_shop failed shop_id={shop_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="ลบร้านไม่สำเร็จ กรุณาดู server log")

    logging.warning(f"[superadmin] DELETED shop id={shop_id} slug={slug_deleted!r}")
    return {"ok": True, "deleted_shop_id": shop_id, "slug": slug_deleted}


@router.get("/superadmin/status")
def superadmin_status(
    shop_id: int = 1,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db, shop_id)
    shop_row = db.query(Shop).filter_by(id=shop_id).first()
    now = _now()
    expired = bool(shop.expired_at and now > shop.expired_at)
    return {
        "shop_name": shop.shop_name,
        "expired_at": shop.expired_at.isoformat() if shop.expired_at else None,
        "is_expired": expired,
        "days_left": (shop.expired_at - now).days if shop.expired_at and not expired else None,
        # is_active สะท้อนสถานะระงับการใช้งานจริง (Shop.is_active) ที่ superadmin สั่งระงับ/เปิด
        # ไม่ใช่ NailShopSettings.is_active ซึ่งเป็นคนละ flag
        "is_active": shop_row.is_active if shop_row else shop.is_active,
    }


@router.get("/superadmin/renewals")
def superadmin_list_renewals(
    status: Optional[str] = None,
    shop_id: Optional[int] = None,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    q = db.query(NailRenewalRequest)
    if status:
        q = q.filter_by(status=status)
    if shop_id is not None:
        q = q.filter_by(shop_id=shop_id)
    items = q.order_by(NailRenewalRequest.requested_at.desc()).limit(50).all()
    return [
        {
            "id": r.id,
            "shop_id": r.shop_id,
            "duration_months": r.duration_months,
            "amount": float(r.amount),
            "status": r.status,
            "admin_note": r.admin_note,
            "requested_at": r.requested_at.isoformat() if r.requested_at else None,
            "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            "new_expired_at": r.new_expired_at.isoformat() if r.new_expired_at else None,
            "slip_image": r.slip_image,
            "payment_channel": r.payment_channel,
        }
        for r in items
    ]


class ShopPricingBody(BaseModel):
    price_1m: Optional[float] = None
    price_3m: Optional[float] = None
    price_6m: Optional[float] = None
    price_12m: Optional[float] = None


@router.get("/superadmin/pricing")
def superadmin_get_pricing(shop_id: int = 1, db: Session = Depends(get_db), x_super_admin_key: Optional[str] = Header(None)):
    """ราคาค่าเช่าที่ตั้งไว้เฉพาะร้านนี้ (null = ยังใช้ราคากลาง) + ราคากลางเริ่มต้น"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db, shop_id)
    return {
        "custom": {
            "price_1m": float(shop.price_1m) if shop.price_1m is not None else None,
            "price_3m": float(shop.price_3m) if shop.price_3m is not None else None,
            "price_6m": float(shop.price_6m) if shop.price_6m is not None else None,
            "price_12m": float(shop.price_12m) if shop.price_12m is not None else None,
        },
        "default": RENEWAL_PLANS,
        "effective": _effective_renewal_plans(shop),
    }


@router.put("/superadmin/pricing")
def superadmin_set_pricing(
    body: ShopPricingBody,
    shop_id: int = 1,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งราคาค่าเช่าพิเศษเฉพาะร้านนี้ — ส่ง null เพื่อกลับไปใช้ราคากลาง"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db, shop_id)
    shop.price_1m = body.price_1m
    shop.price_3m = body.price_3m
    shop.price_6m = body.price_6m
    shop.price_12m = body.price_12m
    db.commit()
    return {"ok": True, "effective": _effective_renewal_plans(shop)}


@router.get("/superadmin/usage")
def superadmin_usage(db: Session = Depends(get_db), x_super_admin_key: Optional[str] = Header(None)):
    """
    ข้อมูลการใช้งาน/โหลดของระบบร้านนี้ สำหรับ super-admin มอนิเตอร์ (ไม่รวมข้อมูลรายได้/ส่วนตัวของร้าน)
    วัดจากฐานข้อมูลจริง — ใช้ประเมินว่าถึงเวลาต้องแนะนำอัปเกรดฐานข้อมูล/แผน deploy หรือยัง
    """
    _check_superadmin(x_super_admin_key)
    from sqlalchemy import text as sa_text

    db_size_bytes = db.execute(sa_text("SELECT pg_database_size(current_database())")).scalar() or 0
    total_bookings = db.query(NailBooking).count()
    total_customers = db.query(Customer).count()
    total_transactions = db.query(CreditTransaction).count()

    since = _now() - timedelta(days=30)
    bookings_last_30d = db.query(NailBooking).filter(NailBooking.created_at >= since).count()

    # แนวโน้มการจอง 14 วันล่าสุด (ใช้เป็นตัวชี้วัดทราฟฟิก/โหลดคร่าวๆ แทนเมตริกเซิร์ฟเวอร์จริง)
    trend_rows = db.execute(sa_text(
        """
        SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS d, COUNT(*) AS c
        FROM nail_bookings
        WHERE created_at >= :since
        GROUP BY d ORDER BY d
        """
    ), {"since": since}).fetchall()
    trend = [{"date": row[0], "count": row[1]} for row in trend_rows]

    # แนวโน้ม API request 14 วันล่าสุด — วัดจาก nail_api_stats
    api_trend_rows = db.execute(sa_text(
        """
        SELECT stat_date AS d, request_count AS c
        FROM nail_api_stats
        WHERE stat_date >= :since_str
        ORDER BY stat_date
        """
    ), {"since_str": (_now() - timedelta(days=14)).strftime("%Y-%m-%d")}).fetchall()
    api_trend = [{"date": row[0], "count": row[1]} for row in api_trend_rows]

    # ยอดรวม request ทั้งหมด
    total_api_calls = db.execute(sa_text(
        "SELECT COALESCE(SUM(request_count), 0) FROM nail_api_stats"
    )).scalar() or 0

    return {
        "db_size_bytes": int(db_size_bytes),
        "db_size_mb": round(db_size_bytes / (1024 * 1024), 2),
        "total_bookings": total_bookings,
        "bookings_last_30d": bookings_last_30d,
        "total_customers": total_customers,
        "total_transactions": total_transactions,
        "booking_trend_14d": trend,
        "api_trend_14d": api_trend,
        "total_api_calls": int(total_api_calls),
        "note": "วัดจากฐานข้อมูลจริง — ทราฟฟิกนับจาก public API requests ต่อวัน (Thai time)",
    }


class ApproveBody(BaseModel):
    duration_months_override: Optional[int] = None


@router.post("/superadmin/renewals/{req_id}/approve")
def superadmin_approve_renewal(
    req_id: int,
    body: ApproveBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    req = db.query(NailRenewalRequest).filter_by(id=req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="ไม่พบคำขอ")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"สถานะปัจจุบัน: {req.status}")

    months = body.duration_months_override or req.duration_months
    shop = _get_shop(db, req.shop_id)
    now = _now()
    base = shop.expired_at if (shop.expired_at and shop.expired_at > now) else now
    new_expiry = base + timedelta(days=months * 30)

    shop.expired_at = new_expiry
    req.status = "approved"
    req.approved_at = now
    req.new_expired_at = new_expiry
    db.commit()
    return {"ok": True, "new_expired_at": new_expiry.isoformat()}


class RejectBody(BaseModel):
    reason: Optional[str] = "ไม่ผ่านการตรวจสอบ"


@router.post("/superadmin/renewals/{req_id}/reject")
def superadmin_reject_renewal(
    req_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    req = db.query(NailRenewalRequest).filter_by(id=req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="ไม่พบคำขอ")
    req.status = "rejected"
    req.admin_note = body.reason
    db.commit()
    return {"ok": True}


class SetExpiryBody(BaseModel):
    expired_at: Optional[str] = None   # ISO datetime string หรือ null = ไม่มีกำหนด


@router.put("/superadmin/set-expiry")
def superadmin_set_expiry(
    body: SetExpiryBody,
    shop_id: int = 1,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งวันหมดอายุตรงๆ (bypass renewal flow) — ใช้สำหรับ super-admin เปิด/ปิดได้ทันที"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db, shop_id)
    shop.expired_at = datetime.fromisoformat(body.expired_at) if body.expired_at else None
    db.commit()
    return {"ok": True, "expired_at": shop.expired_at.isoformat() if shop.expired_at else None}


# ── SuperAdmin Payment Info ──────────────────────────────────────────────────

class SuperAdminPaymentInfoBody(BaseModel):
    sa_bank_name: Optional[str] = None
    sa_bank_account_number: Optional[str] = None
    sa_bank_account_name: Optional[str] = None
    sa_truemoney_phone: Optional[str] = None


def _sa_payment_info(db: Session) -> dict:
    from backend.models import StoreSettings
    keys = ["sa_bank_name", "sa_bank_account_number", "sa_bank_account_name", "sa_truemoney_phone"]
    result: dict = {}
    for k in keys:
        row = db.query(StoreSettings).filter_by(key=k).first()
        result[k] = row.value if row else None
    return result


@router.get("/superadmin/payment-info")
def superadmin_get_payment_info(
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ข้อมูลบัญชีรับเงินของ super-admin"""
    _check_superadmin(x_super_admin_key)
    return _sa_payment_info(db)


@router.put("/superadmin/payment-info")
def superadmin_set_payment_info(
    body: SuperAdminPaymentInfoBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งข้อมูลบัญชีรับเงิน — admin จะเห็นข้อมูลนี้ตอนต่ออายุระบบ"""
    _check_superadmin(x_super_admin_key)
    from backend.models import StoreSettings
    for field, val in body.model_dump().items():
        if val is None:
            continue
        row = db.query(StoreSettings).filter_by(key=field).first()
        if row:
            row.value = val.strip()
        else:
            db.add(StoreSettings(key=field, value=val.strip()))
    db.commit()
    return {"ok": True, **_sa_payment_info(db)}


@router.get("/superadmin/traffic")
def superadmin_traffic(
    days: int = 30,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """
    สถิติทราฟฟิก API แยกรายร้าน — ดูได้เฉพาะ super-admin
    คืน total_requests, active_days, peak_day, และ daily breakdown 14 วันย้อนหลัง
    """
    _check_superadmin(x_super_admin_key)
    from sqlalchemy import text as _text
    since_all = (datetime.now() - timedelta(days=min(days, 90))).strftime("%Y-%m-%d")
    since_daily = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")

    shop_rows = db.execute(
        _text("""
            SELECT sh.id, sh.name, sh.slug,
                   COALESCE(SUM(s.request_count), 0) AS total_requests,
                   COUNT(DISTINCT s.stat_date) AS active_days,
                   MAX(s.stat_date) AS last_active,
                   MAX(s.request_count) AS peak_day
            FROM shops sh
            LEFT JOIN nail_api_stats s
                   ON s.shop_id = sh.id AND s.stat_date >= :since
            GROUP BY sh.id, sh.name, sh.slug
            ORDER BY total_requests DESC
        """),
        {"since": since_all},
    ).fetchall()

    daily_rows = db.execute(
        _text("""
            SELECT shop_id, stat_date, request_count
            FROM nail_api_stats
            WHERE stat_date >= :since
            ORDER BY shop_id, stat_date
        """),
        {"since": since_daily},
    ).fetchall()

    daily_by_shop: dict = {}
    for r in daily_rows:
        sid = r[0]
        daily_by_shop.setdefault(sid, []).append({"date": r[1], "count": int(r[2])})

    return {
        "days": days,
        "shops": [
            {
                "shop_id": r[0],
                "shop_name": r[1] or f"Shop {r[0]}",
                "slug": r[2],
                "total_requests": int(r[3] or 0),
                "active_days": int(r[4] or 0),
                "last_active": r[5],
                "peak_day": int(r[6] or 0),
                "daily": daily_by_shop.get(r[0], []),
            }
            for r in shop_rows
        ],
    }


@router.get("/admin/superadmin-payment-info")
def admin_get_superadmin_payment_info(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """ดึงข้อมูลบัญชีรับเงินของ super-admin (admin ดูก่อนโอนเงินต่ออายุ)"""
    _check_admin(authorization)
    return _sa_payment_info(db)


# ── SuperAdmin: per-shop API keys management ─────────────────────────────────

def _mask(val: Optional[str]) -> Optional[str]:
    """Mask a secret: show first 4 + last 4 chars, middle replaced with ***"""
    if not val:
        return None
    if len(val) <= 8:
        return "****"
    return val[:4] + "****" + val[-4:]


class ShopApiKeysBody(BaseModel):
    telegram_bot_token: Optional[str] = None
    admin_group_id: Optional[str] = None
    slip2go_api_key: Optional[str] = None
    slip_verify_mode: Optional[str] = None   # 'auto' | 'off'


class ShopPasscodeBody(BaseModel):
    new_passcode: str


@router.get("/superadmin/shops/{shop_id}/api-keys")
def superadmin_get_shop_api_keys(
    shop_id: int,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ดึง API keys ของร้าน (masked) — ไม่คืน token เต็ม"""
    _check_superadmin(x_super_admin_key)
    shop = db.query(Shop).filter_by(id=shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    keys = db.query(NailShopApiKeys).filter_by(shop_id=shop_id).first()
    return {
        "shop_id": shop_id,
        "has_telegram_bot_token": bool(keys and keys.telegram_bot_token),
        "telegram_bot_token_masked": _mask(keys.telegram_bot_token if keys else None),
        "admin_group_id": keys.admin_group_id if keys else None,
        "has_slip2go_api_key": bool(keys and keys.slip2go_api_key),
        "slip2go_api_key_masked": _mask(keys.slip2go_api_key if keys else None),
        "slip_verify_mode": keys.slip_verify_mode if keys else "off",
        "has_admin_passcode": bool(shop.admin_passcode_hash),
    }


@router.put("/superadmin/shops/{shop_id}/api-keys")
def superadmin_update_shop_api_keys(
    shop_id: int,
    body: ShopApiKeysBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้ง/แก้ไข API keys ของร้าน (ส่ง empty string = ลบค่า)"""
    _check_superadmin(x_super_admin_key)
    shop = db.query(Shop).filter_by(id=shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    keys = db.query(NailShopApiKeys).filter_by(shop_id=shop_id).first()
    if not keys:
        keys = NailShopApiKeys(shop_id=shop_id)
        db.add(keys)

    if body.telegram_bot_token is not None:
        keys.telegram_bot_token = body.telegram_bot_token.strip() or None
    if body.admin_group_id is not None:
        gid = body.admin_group_id.strip()
        if gid:
            # Validate format: negative integer, optionally followed by _threadId
            # e.g. -1001234567 or -1001234567_3
            pattern = r"^-\d+(_\d+)?$"
            if not re.match(pattern, gid):
                raise HTTPException(
                    status_code=400,
                    detail="admin_group_id ต้องเป็นตัวเลขลบ เช่น -1001234567 หรือ -1001234567_3",
                )
        keys.admin_group_id = gid or None
    if body.slip2go_api_key is not None:
        keys.slip2go_api_key = body.slip2go_api_key.strip() or None
    if body.slip_verify_mode is not None:
        if body.slip_verify_mode not in ("auto", "off"):
            raise HTTPException(status_code=400, detail="slip_verify_mode ต้องเป็น 'auto' หรือ 'off'")
        keys.slip_verify_mode = body.slip_verify_mode

    db.commit()
    return {"ok": True}


@router.put("/superadmin/shops/{shop_id}/passcode")
def superadmin_set_shop_passcode(
    shop_id: int,
    body: ShopPasscodeBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งรหัสผ่าน Admin (/r/{slug}/admin) สำหรับร้านนั้น"""
    _check_superadmin(x_super_admin_key)
    shop = db.query(Shop).filter_by(id=shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    passcode = body.new_passcode.strip()
    if len(passcode) < 4:
        raise HTTPException(status_code=400, detail="รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร")
    shop.admin_passcode_hash = hash_passcode(passcode)
    db.commit()
    return {"ok": True}


# ── Superadmin: Feature Flags ────────────────────────────────────────────────
class ShopFeaturesBody(BaseModel):
    allow_ref_image: Optional[bool] = None  # อนุญาตให้ลูกค้าแนบรูปบรีฟตอนจองคิว


@router.get("/superadmin/shops/{shop_id}/features")
def superadmin_get_shop_features(
    shop_id: int,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ดึง feature flags ของร้าน"""
    _check_superadmin(x_super_admin_key)
    shop = db.query(Shop).filter_by(id=shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    settings = db.query(NailShopSettings).filter_by(shop_id=shop_id).first()
    return {
        "shop_id": shop_id,
        "allow_ref_image": bool(settings.allow_ref_image) if settings and settings.allow_ref_image is not None else False,
    }


@router.put("/superadmin/shops/{shop_id}/features")
def superadmin_update_shop_features(
    shop_id: int,
    body: ShopFeaturesBody,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้ง feature flags ของร้าน"""
    _check_superadmin(x_super_admin_key)
    shop = db.query(Shop).filter_by(id=shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="ไม่พบร้าน")
    settings = db.query(NailShopSettings).filter_by(shop_id=shop_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="ไม่พบการตั้งค่าร้าน")
    if body.allow_ref_image is not None:
        settings.allow_ref_image = body.allow_ref_image
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════════
# TOTP SETUP & SELF-REGISTRATION SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

_SUPERADMIN_TOTP_KEY = "superadmin_totp_secret"


def _get_superadmin_totp_secret(db: Session) -> Optional[str]:
    row = db.query(SystemConfig).filter_by(key=_SUPERADMIN_TOTP_KEY).first()
    return row.value if row else None


class _SAPin(BaseModel):
    pin: str


class _SATOTPConfirm(BaseModel):
    pin: str
    totp_code: str


@router.get("/superadmin/totp/status")
def superadmin_totp_status(db: Session = Depends(get_db)):
    """Public — ตรวจว่าตั้ง TOTP แล้วหรือยัง ให้ frontend เลือก login flow"""
    secret = _get_superadmin_totp_secret(db)
    return {"totp_enabled": bool(secret)}


@router.post("/superadmin/totp/setup")
def superadmin_totp_setup(body: _SAPin, db: Session = Depends(get_db)):
    """Generate TOTP secret + QR — ต้อง verify PIN ก่อน (ไม่ต้อง login session)"""
    cfg = get_settings()
    key = cfg.nail_super_admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY")
    if not secrets.compare_digest(body.pin or "", key):
        raise HTTPException(status_code=403, detail="PIN ไม่ถูกต้อง")

    existing = db.query(SystemConfig).filter_by(key=_SUPERADMIN_TOTP_KEY).first()
    if existing and existing.value:
        totp_secret = existing.value
    else:
        totp_secret = generate_totp_secret()
        if not existing:
            db.add(SystemConfig(key=_SUPERADMIN_TOTP_KEY, value=totp_secret))
        else:
            existing.value = totp_secret
        db.commit()

    uri = get_totp_uri(totp_secret, "CSC Super Admin", "CSC System")
    qr_base64 = get_qr_code_base64(uri)
    return {"ok": True, "qr_code": qr_base64, "secret": totp_secret}


@router.post("/superadmin/totp/confirm")
def superadmin_totp_confirm(body: _SATOTPConfirm, db: Session = Depends(get_db)):
    """ยืนยัน TOTP setup ด้วย code จาก Google Authenticator"""
    cfg = get_settings()
    key = cfg.nail_super_admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY")
    if not secrets.compare_digest(body.pin or "", key):
        raise HTTPException(status_code=403, detail="PIN ไม่ถูกต้อง")

    totp_secret = _get_superadmin_totp_secret(db)
    if not totp_secret:
        raise HTTPException(status_code=400, detail="ยังไม่ได้ generate secret กรุณาเรียก /setup ก่อน")
    if not _verify_totp(totp_secret, body.totp_code or ""):
        raise HTTPException(status_code=403, detail="รหัส TOTP ไม่ถูกต้อง กรุณาลองใหม่")

    return {"ok": True, "message": "ตั้งค่า TOTP สำเร็จ — ใช้ Google Authenticator login ได้เลย"}


# ── Shop Admin TOTP Login ─────────────────────────────────────────────────────

class _AdminTOTPLogin(BaseModel):
    passcode: str
    totp_code: str
    shop_slug: Optional[str] = None


@router.post("/admin/login/totp")
def admin_login_totp(body: _AdminTOTPLogin, db: Session = Depends(get_db)):
    """Login สำหรับร้านที่ใช้ TOTP — passcode + 6-digit TOTP → JWT"""
    shop_row = _resolve_shop_by_slug(db, body.shop_slug)
    if not shop_row.is_active:
        raise HTTPException(status_code=403, detail="ร้านนี้ปิดให้บริการชั่วคราว")
    if shop_row.auth_method != "totp":
        raise HTTPException(status_code=400, detail="ร้านนี้ไม่ได้ใช้ TOTP")

    if shop_row.admin_passcode_hash:
        if not verify_passcode(body.passcode.strip(), shop_row.admin_passcode_hash):
            raise HTTPException(status_code=403, detail="รหัสผ่านไม่ถูกต้อง")
    else:
        raise HTTPException(status_code=403, detail="ยังไม่ได้ตั้งรหัสผ่าน กรุณาทำ onboarding ก่อน")

    if not shop_row.totp_secret or not _verify_totp(shop_row.totp_secret, body.totp_code or ""):
        raise HTTPException(status_code=403, detail="รหัส TOTP ไม่ถูกต้อง")

    token = create_admin_token(NAIL_ADMIN_SESSION_ID, shop_id=shop_row.id)
    return {"access_token": token}


# ── Shop Admin Onboarding (ครั้งแรก) ─────────────────────────────────────────

class _OnboardingComplete(BaseModel):
    setup_token: str
    pin: str
    totp_code: str


@router.get("/admin/onboarding")
def admin_onboarding_info(setup_token: str, db: Session = Depends(get_db)):
    """ดึง QR Code สำหรับ onboarding ครั้งแรก — ตรวจ setup_token"""
    shop_row = db.query(Shop).filter_by(onboarding_token=setup_token).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ลิงก์ onboarding ไม่ถูกต้องหรือใช้ไปแล้ว")
    if shop_row.totp_confirmed:
        raise HTTPException(status_code=400, detail="ร้านนี้ทำ onboarding เสร็จแล้ว กรุณา login ปกติ")

    if not shop_row.totp_secret:
        shop_row.totp_secret = generate_totp_secret()
        db.commit()

    uri = get_totp_uri(shop_row.totp_secret, shop_row.name or shop_row.slug, "CSC System")
    qr_base64 = get_qr_code_base64(uri)
    return {
        "shop_name": shop_row.name,
        "slug": shop_row.slug,
        "qr_code": qr_base64,
        "totp_secret": shop_row.totp_secret,
    }


@router.post("/admin/onboarding/complete")
def admin_onboarding_complete(body: _OnboardingComplete, db: Session = Depends(get_db)):
    """ตั้ง PIN + ยืนยัน TOTP → จบ onboarding ทำได้ครั้งเดียว"""
    shop_row = db.query(Shop).filter_by(onboarding_token=body.setup_token).first()
    if not shop_row:
        raise HTTPException(status_code=404, detail="ลิงก์ onboarding ไม่ถูกต้องหรือใช้ไปแล้ว")
    if shop_row.totp_confirmed:
        raise HTTPException(status_code=400, detail="ร้านนี้ทำ onboarding เสร็จแล้ว")

    pin = (body.pin or "").strip()
    if len(pin) < 4:
        raise HTTPException(status_code=400, detail="PIN ต้องมีอย่างน้อย 4 ตัวอักษร")
    if not shop_row.totp_secret:
        raise HTTPException(status_code=400, detail="ยังไม่ได้โหลด QR กรุณาเปิดหน้านี้ใหม่")
    if not _verify_totp(shop_row.totp_secret, body.totp_code or ""):
        raise HTTPException(status_code=403, detail="รหัส TOTP ไม่ถูกต้อง กรุณาลองใหม่")

    shop_row.admin_passcode_hash = hash_passcode(pin)
    shop_row.totp_confirmed = True
    shop_row.onboarding_token = None
    db.commit()

    token = create_admin_token(NAIL_ADMIN_SESSION_ID, shop_id=shop_row.id)
    return {"ok": True, "access_token": token}


# ── Registration — Public ─────────────────────────────────────────────────────

REGISTRATION_BANK_INFO = {
    "truemoney_phone": "0809209043",
    "kasikorn_account": "0951443204",
    "kasikorn_name": "ศราวุฒิ แซ่ลิม",
    "kasikorn_bank": "ธนาคารกสิกรไทย",
}


@router.get("/register/plans")
def register_list_plans(db: Session = Depends(get_db)):
    plans = db.query(ShopPlan).filter_by(is_active=True).order_by(ShopPlan.sort_order).all()
    result = []
    for p in plans:
        slots_left = None if p.total_slots is None else max(0, p.total_slots - (p.registered_count or 0))
        result.append({
            "id": p.id, "name": p.name, "description": p.description,
            "price": float(p.price), "total_slots": p.total_slots,
            "registered_count": p.registered_count or 0,
            "slots_left": slots_left, "is_available": slots_left is None or slots_left > 0,
            "expiry_days": p.expiry_days,
        })
    return result


@router.get("/register/bank-info")
def register_get_bank_info():
    return REGISTRATION_BANK_INFO


class _CheckSlug(BaseModel):
    slug: str


@router.post("/register/check-slug")
def register_check_slug(body: _CheckSlug, db: Session = Depends(get_db)):
    slug = (body.slug or "").strip().lower()
    if not slug:
        return {"available": False, "reason": "กรุณากรอก slug"}
    if not re.match(r"^[a-z0-9-]+$", slug):
        return {"available": False, "reason": "ใช้ได้เฉพาะตัวพิมพ์เล็ก ตัวเลข และ -"}
    if len(slug) < 3:
        return {"available": False, "reason": "slug ต้องมีอย่างน้อย 3 ตัวอักษร"}
    if db.query(Shop).filter_by(slug=slug).first():
        return {"available": False, "reason": "slug นี้ถูกใช้ไปแล้ว"}
    if db.query(ShopRegistration).filter(
        ShopRegistration.slug == slug, ShopRegistration.status == "pending"
    ).first():
        return {"available": False, "reason": "slug นี้มีผู้ยื่นสมัครอยู่แล้ว"}
    return {"available": True}


class _SubmitReg(BaseModel):
    plan_id: int
    shop_name: str
    slug: str
    owner_email: str
    owner_line: Optional[str] = None
    payment_channel: str = "bank_slip"   # "bank_slip" | "angpao"
    slip_image: Optional[str] = None     # base64 data URI (bank_slip only)
    voucher_code: Optional[str] = None  # TrueMoney gift link or code (angpao only)


@router.post("/register/submit")
async def register_submit(body: _SubmitReg, db: Session = Depends(get_db)):
    """ยื่นสมัครร้านใหม่ — bank_slip: Slip2Go verify / angpao: TrueMoney auto-redeem"""
    if body.payment_channel not in ("bank_slip", "angpao"):
        raise HTTPException(status_code=400, detail="ช่องทางชำระเงินไม่ถูกต้อง")

    plan = db.query(ShopPlan).filter_by(id=body.plan_id, is_active=True).first()
    if not plan:
        raise HTTPException(status_code=404, detail="ไม่พบแพ็กเกจที่เลือก")
    if plan.total_slots is not None and (plan.registered_count or 0) >= plan.total_slots:
        raise HTTPException(status_code=409, detail="แพ็กเกจนี้เต็มแล้ว")

    slug = (body.slug or "").strip().lower()
    if not slug or not re.match(r"^[a-z0-9-]+$", slug) or len(slug) < 3:
        raise HTTPException(status_code=400, detail="slug ไม่ถูกต้อง")
    if db.query(Shop).filter_by(slug=slug).first():
        raise HTTPException(status_code=409, detail="slug นี้ถูกใช้ไปแล้ว")
    if db.query(ShopRegistration).filter(
        ShopRegistration.slug == slug, ShopRegistration.status == "pending"
    ).first():
        raise HTTPException(status_code=409, detail="slug นี้มีผู้ยื่นสมัครอยู่แล้ว")

    email = (body.owner_email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="อีเมลไม่ถูกต้อง")

    # ── Validate & prepare payment payload ───────────────────────────────────
    if body.payment_channel == "bank_slip":
        if not body.slip_image or not body.slip_image.startswith("data:image"):
            raise HTTPException(status_code=400, detail="กรุณาอัปโหลดสลิปการโอนเงิน")
        image_or_voucher = body.slip_image
        voucher_code_clean = None
    else:  # angpao
        if not body.voucher_code:
            raise HTTPException(status_code=400, detail="กรุณาระบุลิงก์/รหัสซองอั่งเปา")
        from backend.truemoney import extract_voucher_code as _extract_vc
        voucher_code_clean = _extract_vc(body.voucher_code)
        # Double-spend guard
        if db.query(ShopRegistration).filter(ShopRegistration.voucher_code == voucher_code_clean).first():
            raise HTTPException(status_code=409, detail="ซองอั่งเปานี้ถูกใช้ไปแล้ว กรุณาใช้ซองใหม่")
        image_or_voucher = f"voucher:{voucher_code_clean}"

    reg = ShopRegistration(
        plan_id=plan.id, shop_name=(body.shop_name or "").strip(),
        slug=slug, owner_email=email,
        owner_line=(body.owner_line or "").strip() or None,
        slip_image=image_or_voucher,
        payment_channel=body.payment_channel,
        voucher_code=voucher_code_clean,
        status="pending", auto_verified=False,
    )
    db.add(reg)
    db.flush()

    auto_verified = False
    cfg = get_settings()

    if body.payment_channel == "bank_slip" and cfg.slip2go_api_key:
        try:
            from backend.slip_verify import verify_slip
            result = await verify_slip(body.slip_image, cfg.slip2go_api_key, expected_amount=float(plan.price))
            if result.get("status") == "success":
                reg.amount_paid = result.get("amount") or float(plan.price)
                reg.auto_verified = True
                auto_verified = True
        except Exception as exc:
            logging.warning(f"[register] Slip2Go auto-verify failed: {exc}")

    elif body.payment_channel == "angpao":
        from backend.truemoney import redeem_voucher as _redeem
        from backend.models import StoreSettings
        try:
            phone_row = db.query(StoreSettings).filter_by(key="truemoney_phone").first()
            phone = (phone_row.value or "").strip() if phone_row else ""
            result = await _redeem(voucher_code_clean, phone) if phone else await _redeem(voucher_code_clean)
            if result["success"]:
                voucher_amount = Decimal(str(result["amount"]))
                reg.amount_paid = voucher_amount
                if voucher_amount >= Decimal(str(plan.price)):
                    reg.auto_verified = True
                    auto_verified = True
            else:
                logging.warning(f"[register angpao] Redeem failed: {result.get('error_message')}")
        except Exception as exc:
            logging.warning(f"[register angpao] TrueMoney redeem failed: {exc}")

    db.commit()
    db.refresh(reg)
    return {
        "ok": True, "registration_id": reg.id, "auto_verified": auto_verified,
        "message": (
            "ระบบตรวจสอบซองอั่งเปาแล้ว! ทีมงานจะสร้างร้านให้ภายใน 24 ชั่วโมง"
            if (auto_verified and body.payment_channel == "angpao") else
            "ระบบตรวจสลิปอัตโนมัติแล้ว รอ Admin อนุมัติสักครู่ครับ"
            if (auto_verified and body.payment_channel == "bank_slip") else
            "ส่งคำขอสมัครสำเร็จ! ทีมงานจะตรวจสอบและติดต่อกลับทางอีเมลภายใน 24 ชั่วโมง"
        ),
    }


# ── Registration Management (Superadmin) ──────────────────────────────────────

@router.get("/superadmin/registrations")
def superadmin_list_registrations(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    q = db.query(ShopRegistration)
    if status:
        q = q.filter(ShopRegistration.status == status)
    regs = q.order_by(ShopRegistration.created_at.desc()).all()
    result = []
    for r in regs:
        plan = db.query(ShopPlan).filter_by(id=r.plan_id).first() if r.plan_id else None
        result.append({
            "id": r.id, "shop_name": r.shop_name, "slug": r.slug,
            "owner_email": r.owner_email, "owner_line": r.owner_line,
            "status": r.status, "auto_verified": r.auto_verified,
            "amount_paid": float(r.amount_paid) if r.amount_paid else None,
            "slip_image": r.slip_image, "reject_reason": r.reject_reason,
            "payment_channel": r.payment_channel or "bank_slip",
            "voucher_code": r.voucher_code,
            "shop_id": r.shop_id,
            "plan_name": plan.name if plan else None,
            "plan_price": float(plan.price) if plan else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return result


def _provision_shop(reg: "ShopRegistration", plan, expiry_days: Optional[int], db: Session):
    """สร้างร้านจากคำขอสมัคร — คืน (shop_row, onboarding_token)"""
    slug = reg.slug
    if db.query(Shop).filter_by(slug=slug).first():
        raise HTTPException(status_code=409, detail=f"slug '{slug}' ถูกใช้ไปแล้ว")

    totp_secret = generate_totp_secret()
    onboarding_token = secrets.token_urlsafe(32)
    days = expiry_days if expiry_days is not None else (plan.expiry_days if plan else 30)

    shop_row = Shop(
        slug=slug, name=reg.shop_name, is_active=True,
        auth_method="totp", totp_secret=totp_secret,
        totp_confirmed=False, onboarding_token=onboarding_token,
        owner_email=reg.owner_email,
    )
    db.add(shop_row)
    db.flush()

    settings_row = NailShopSettings(
        shop_id=shop_row.id, shop_name=reg.shop_name,
        shop_tagline="ทำเล็บสวย สไตล์คุณ", business_type="nail",
        deposit_amount=200, is_active=True, max_advance_days=14,
        slot_duration_minutes=60, accept_bank_transfer=True, accept_truemoney_angpao=True,
    )
    if days:
        settings_row.expired_at = _now() + timedelta(days=max(0, days))
    db.add(settings_row)
    db.flush()

    for i, svc in enumerate(BUSINESS_TYPE_TEMPLATES["nail"]["services"]):
        db.add(NailService(
            shop_id=shop_row.id, name=svc["name"],
            duration_minutes=svc["duration_minutes"], price=svc["price"],
            color=svc["color"], is_active=True, sort_order=i,
        ))

    try:
        _ensure_templates_exist(db, shop_row.id)
    except Exception as exc:
        logging.warning(f"[provision] templates failed: {exc}")

    return shop_row, onboarding_token


class _ApproveReg(BaseModel):
    expiry_days: Optional[int] = None


@router.post("/superadmin/registrations/{reg_id}/approve")
async def superadmin_approve_registration(
    reg_id: int, body: _ApproveReg,
    request: Request,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """อนุมัติคำขอสมัคร → สร้างร้านอัตโนมัติ + ส่ง onboarding email"""
    _check_superadmin(x_super_admin_key)
    reg = db.query(ShopRegistration).filter_by(id=reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="ไม่พบคำขอสมัคร")
    if reg.status != "pending":
        raise HTTPException(status_code=400, detail=f"คำขอนี้อยู่ใน status '{reg.status}' แล้ว")

    plan = db.query(ShopPlan).filter_by(id=reg.plan_id).first() if reg.plan_id else None

    try:
        shop_row, onboarding_token = _provision_shop(reg, plan, body.expiry_days, db)
        reg.status = "approved"
        reg.shop_id = shop_row.id
        if plan:
            plan.registered_count = (plan.registered_count or 0) + 1
        db.commit()
        db.refresh(shop_row)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logging.error(f"[superadmin] provision failed reg {reg_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="สร้างร้านไม่สำเร็จ")

    import os as _os
    # ดึง base_url จาก Request จริง — รองรับ Render (X-Forwarded-*), Replit dev, และ local
    _scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "https"
    _host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or _os.environ.get("REPLIT_DEV_DOMAIN", "")
        or "localhost:8000"
    )
    base_url = f"{_scheme}://{_host}"
    storefront_url = f"{base_url}/r/{shop_row.slug}"
    admin_url = f"{base_url}/r/{shop_row.slug}/admin"
    onboarding_url = f"{base_url}/r/{shop_row.slug}/admin/onboarding?token={onboarding_token}"

    html = (
        "<html><body style='background:#0f172a;font-family:sans-serif;padding:40px 0'>"
        "<div style='max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;padding:36px;border:1px solid #334155'>"
        f"<h2 style='color:#f1f5f9;margin:0 0 8px'>🎉 ยินดีต้อนรับสู่ CSC!</h2>"
        f"<p style='color:#94a3b8;margin:0 0 20px'>ร้าน <b style='color:#e2e8f0'>{reg.shop_name}</b> ได้รับการอนุมัติแล้วครับ</p>"
        f"<p style='color:#94a3b8;font-size:14px;margin:4px 0'>🛍️ หน้าร้าน: <a href='{storefront_url}' style='color:#a78bfa'>{storefront_url}</a></p>"
        f"<p style='color:#94a3b8;font-size:14px;margin:4px 0 20px'>⚙️ หลังร้าน: <a href='{admin_url}' style='color:#60a5fa'>{admin_url}</a></p>"
        "<div style='background:#1a2744;border-radius:12px;padding:20px;border:1px solid #1e3a8a'>"
        "<p style='color:#93c5fd;font-weight:700;margin:0 0 8px'>⚡ ตั้งค่าร้านครั้งแรก (PIN + Google Authenticator)</p>"
        f"<a href='{onboarding_url}' style='display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700'>🚀 เริ่มตั้งค่าร้าน →</a>"
        "<p style='color:#64748b;font-size:12px;margin:12px 0 0'>⚠️ ลิงก์ใช้ได้ครั้งเดียว อย่าแชร์ผู้อื่น</p>"
        "</div></div></body></html>"
    )
    txt = f"ร้าน {reg.shop_name} ได้รับการอนุมัติ\nหน้าร้าน: {storefront_url}\nหลังร้าน: {admin_url}\nตั้งค่าร้าน: {onboarding_url}"

    try:
        await send_custom_email(reg.owner_email, f"ร้าน {reg.shop_name} ได้รับการอนุมัติแล้ว 🎉", html, txt)
    except Exception as exc:
        logging.warning(f"[superadmin] welcome email failed: {exc}")

    return {"ok": True, "shop_id": shop_row.id, "slug": shop_row.slug, "onboarding_url": onboarding_url}


class _RejectReg(BaseModel):
    reason: Optional[str] = None


@router.post("/superadmin/registrations/{reg_id}/reject")
def superadmin_reject_registration(
    reg_id: int, body: _RejectReg,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    reg = db.query(ShopRegistration).filter_by(id=reg_id).first()
    if not reg:
        raise HTTPException(status_code=404, detail="ไม่พบคำขอสมัคร")
    if reg.status != "pending":
        raise HTTPException(status_code=400, detail=f"คำขอนี้อยู่ใน status '{reg.status}' แล้ว")
    reg.status = "rejected"
    reg.reject_reason = (body.reason or "").strip() or None
    db.commit()
    return {"ok": True}
