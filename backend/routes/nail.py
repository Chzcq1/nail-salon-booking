"""
Nail Salon Booking System — API Routes
Public  : GET /api/nail/settings, /api/nail/gallery, /api/nail/services, /api/nail/slots
Booking : POST /api/nail/booking/hold, /pay, GET /api/nail/booking/status/:token
Admin   : /api/nail/admin/* (requires admin bearer token)
"""
import json
import logging
import random
import secrets
import string
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.config import get_settings
from backend.database import get_db
from backend.models import (
    NailShopSettings, NailService, NailStaff, NailTimeSlot, NailSlotTemplate,
    NailBooking, NailGallery, NailRenewalRequest, NailApiStats, OTPSession,
    Customer, CreditTransaction,
)
from backend.auth import generate_otp, create_admin_token, verify_admin_token
from backend.routes.wallet import get_wallet_customer
import backend.bot as bot_module

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nail", tags=["nail"])

# ─── helpers ────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ประเทศไทยอยู่ UTC+7 ตลอดปี (ไม่มี DST) — ใช้คำนวณ "วันนี้/เวลานี้" ให้ตรงกับความเป็นจริงของร้าน
TH_TZ = timezone(timedelta(hours=7))


def _now_th() -> datetime:
    return _now().astimezone(TH_TZ)


def _increment_api_counter() -> None:
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
                INSERT INTO nail_api_stats (stat_date, request_count)
                VALUES (:d, 1)
                ON CONFLICT (stat_date)
                DO UPDATE SET request_count = nail_api_stats.request_count + 1,
                              updated_at = NOW()
                """
            ),
            {"d": today},
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def _get_shop(db: Session) -> NailShopSettings:
    shop = db.query(NailShopSettings).filter_by(id=1).first()
    if not shop:
        shop = NailShopSettings(id=1)
        db.add(shop)
        db.commit()
        db.refresh(shop)
    return shop


# Telegram session ID สำหรับ nail admin OTP (ต่างจาก store admin ที่ใช้ 0)
NAIL_ADMIN_SESSION_ID = -1


def _check_admin(authorization: str = Header(None)):
    """ตรวจสอบ JWT token ที่ได้จาก /api/nail/admin/verify-otp"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    payload = verify_admin_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token หมดอายุหรือไม่ถูกต้อง กรุณาล็อกอินใหม่")


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


def _count_confirmed_bookings(db: Session, slot_id: int) -> int:
    """นับ booking ที่ยังใช้งานอยู่ใน slot นี้"""
    return db.query(NailBooking).filter(
        NailBooking.slot_id == slot_id,
        NailBooking.status.in_(["held", "pending_payment", "confirmed"]),
    ).count()


DAY_NAMES_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"]


def _ensure_templates_exist(db: Session):
    """สร้างแถวเทมเพลต 7 วัน (จันทร์–อาทิตย์) ถ้ายังไม่มี"""
    existing_days = {t.day_of_week for t in db.query(NailSlotTemplate).all()}
    changed = False
    for dow in range(7):
        if dow not in existing_days:
            db.add(NailSlotTemplate(day_of_week=dow, is_open=False))
            changed = True
    if changed:
        db.commit()


def _ensure_slots_for_date(db: Session, shop: NailShopSettings, date_str: str):
    """
    สร้างสล็อตอัตโนมัติจากเทมเพลตประจำสัปดาห์ — ทำงานเฉพาะตอนที่ 'ยังไม่มีสล็อตใดๆ' ของวันนั้นเลย
    เพื่อไม่ไปทับ/ลบสล็อตที่แอดมินเคยแก้ไขเองแล้ว (แก้ครั้งเดียวหลังจากนั้นคุมเองได้เต็มที่)
    """
    if shop.closed_dates:
        try:
            closed = json.loads(shop.closed_dates)
            if date_str in closed:
                return
        except Exception:
            pass

    # ป้องกัน 2 request สร้างสล็อตวันเดียวกันพร้อมกันจนได้สล็อตซ้ำ (advisory lock ทั้ง transaction)
    # หมายเหตุ: บาง serverless PostgreSQL (เช่น Neon.tech) อาจไม่รองรับ hashtext → fallback gracefully
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:d))"), {"d": f"nail_slot_gen:{date_str}"})
    except Exception as _adv_lock_err:
        # hashtext ไม่ถูกรองรับบน serverless PostgreSQL บางตัว (เช่น Neon)
        # rollback เฉพาะ statement นั้น แล้วทำงานต่อโดยไม่มี lock
        err_str = str(_adv_lock_err).lower()
        if "hashtext" in err_str or "function" in err_str or "does not exist" in err_str:
            try:
                db.rollback()
            except Exception:
                pass
        else:
            raise  # re-raise ถ้าเป็น error อื่น เช่น connection failed

    already = db.query(NailTimeSlot).filter_by(slot_date=date_str).first()
    if already:
        return

    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return

    tmpl = db.query(NailSlotTemplate).filter_by(day_of_week=d.weekday(), is_open=True).first()
    if not tmpl or tmpl.rounds_count <= 0:
        return

    try:
        cursor = datetime.strptime(tmpl.start_time, "%H:%M")
    except ValueError:
        return

    for i in range(tmpl.rounds_count):
        start = cursor + timedelta(minutes=i * (tmpl.round_minutes + tmpl.gap_minutes))
        end = start + timedelta(minutes=tmpl.round_minutes)
        db.add(NailTimeSlot(
            slot_date=date_str,
            start_time=start.strftime("%H:%M"),
            end_time=end.strftime("%H:%M"),
            max_bookings=tmpl.max_bookings or 1,
            staff_id=tmpl.staff_id,
            is_available=True,
        ))
    db.commit()

# ─── Admin Auth (2-step: passcode → OTP → JWT) ──────────────────────────────

class NailAdminOTPRequest(BaseModel):
    passcode: str

class NailAdminOTPVerify(BaseModel):
    otp_code: str

@router.post("/admin/request-otp")
async def nail_request_otp(body: NailAdminOTPRequest, db: Session = Depends(get_db)):
    """ขั้นที่ 1 — ตรวจรหัสผ่าน แล้วส่ง OTP ไปยัง Telegram group admin"""
    cfg = get_settings()
    passcode = cfg.admin_passcode
    if not passcode:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า ADMIN_PASSCODE บนเซิร์ฟเวอร์")

    import hmac as _hmac
    if not _hmac.compare_digest(body.passcode.strip(), passcode.strip()):
        raise HTTPException(status_code=403, detail="รหัสผ่านไม่ถูกต้อง")

    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    session = OTPSession(
        telegram_id=NAIL_ADMIN_SESSION_ID,
        otp_code=otp,
        expires_at=expires,
    )
    db.add(session)
    db.commit()

    sent, err_msg = await bot_module.send_otp(NAIL_ADMIN_SESSION_ID, otp)
    if not sent:
        raise HTTPException(status_code=500, detail=f"ส่ง OTP ไม่สำเร็จ: {err_msg}")

    return {"message": "ส่ง OTP ไปยัง Telegram แล้ว"}


@router.post("/admin/verify-otp")
def nail_verify_otp(body: NailAdminOTPVerify, db: Session = Depends(get_db)):
    """ขั้นที่ 2 — ยืนยัน OTP แล้วรับ JWT token"""
    otp_input = (body.otp_code or "").strip()
    session = (
        db.query(OTPSession)
        .filter(
            OTPSession.telegram_id == NAIL_ADMIN_SESSION_ID,
            OTPSession.otp_code == otp_input,
            OTPSession.is_used == False,
            OTPSession.expires_at > datetime.now(timezone.utc),
        )
        .order_by(OTPSession.created_at.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="OTP ไม่ถูกต้องหรือหมดอายุแล้ว")

    session.is_used = True
    db.commit()

    token = create_admin_token(NAIL_ADMIN_SESSION_ID)
    return {"access_token": token}


# ─── Public endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings_public(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    shop = _get_shop(db)
    # ตรวจสอบ rental expiry
    expired = False
    if shop.expired_at and _now() > shop.expired_at:
        expired = True
    # นับ request เป็น background task — ไม่กระทบ transaction หลัก
    background_tasks.add_task(_increment_api_counter)
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
    }


@router.get("/gallery")
def get_gallery(db: Session = Depends(get_db)):
    items = (
        db.query(NailGallery)
        .filter_by(is_active=True)
        .order_by(NailGallery.sort_order, NailGallery.id.desc())
        .all()
    )
    return [{"id": g.id, "image_url": g.image_url, "caption": g.caption} for g in items]


@router.get("/services")
def get_services(db: Session = Depends(get_db)):
    items = (
        db.query(NailService)
        .filter_by(is_active=True)
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
def get_slots(date: str, db: Session = Depends(get_db)):
    """ดึงช่วงเวลาที่เปิดให้จองของวันนั้น พร้อมสถานะ available/held/full"""
    _release_expired_holds(db)
    # ตรวจวันปิดร้าน
    shop = _get_shop(db)
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
        .filter_by(slot_date=date, is_available=True)
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

    shop = _get_shop(db)
    # ป้องกันการจองใหม่ถ้าร้านถูกปิด/หมดอายุการเช่าระบบ (บังคับที่ฝั่งเซิร์ฟเวอร์ ไม่พึ่งแค่ frontend gate)
    if not shop.is_active or (shop.expired_at and _now() > shop.expired_at):
        raise HTTPException(status_code=403, detail="ระบบจองคิวปิดใช้งานชั่วคราว กรุณาติดต่อร้านโดยตรง")
    service = db.query(NailService).filter_by(id=req.service_id).first() if req.service_id else None

    # ค่ามัดจำ: ใช้ของบริการถ้าตั้งไว้ ไม่งั้น fallback เป็นค่าเริ่มต้นของร้าน
    if service is not None and service.deposit_amount is not None:
        base_deposit = float(service.deposit_amount)
    else:
        base_deposit = float(shop.deposit_amount or 200)
    rand_cents = random.randint(1, 99)  # สุ่มเศษสตางค์ 01–99 เพื่อระบุตัวตน
    deposit_total = round(base_deposit + rand_cents / 100, 2)

    hold_token = secrets.token_urlsafe(32)
    held_until = _now() + timedelta(minutes=10)

    booking = NailBooking(
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
        deposit_cents=rand_cents,
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
        "deposit_cents": rand_cents,
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
    }


class PayRequest(BaseModel):
    hold_token: str
    payment_proof: str   # base64 data URI หรือ URL path


@router.post("/booking/pay")
async def submit_payment(req: PayRequest, db: Session = Depends(get_db)):
    """
    Step 2: อัปโหลดสลิป — ตรวจสอบและเปลี่ยนสถานะ
    """
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

    booking.payment_proof = req.payment_proof

    # ไม่ตรวจสลิปอัตโนมัติแล้ว — แอดมินตรวจสอบยอดเงินและยืนยันเองทุกครั้ง
    # (เผื่ออนาคตอยากเปิดใช้ Slip2Go อัตโนมัติอีกครั้ง ดู backend/slip_verify.py)
    booking.status = "pending_payment"

    db.commit()
    db.refresh(booking)

    # แจ้ง Telegram แอดมินทันทีเมื่อลูกค้าส่งสลิป
    try:
        from backend.bot import send_nail_slip_notify
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


class WalletPayRequest(BaseModel):
    hold_token: str


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
    _check_admin(authorization)
    _release_expired_holds(db)

    q = db.query(NailBooking)
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
            "admin_note": b.admin_note,
            "is_walkin": b.is_walkin,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "held_until": b.held_until.isoformat() if b.held_until else None,
        })
    return result


@router.get("/admin/dashboard")
def admin_dashboard(db: Session = Depends(get_db), authorization: str = Header(None)):
    _check_admin(authorization)
    today = _now().date().isoformat()
    week_start = (_now().date() - timedelta(days=_now().weekday())).isoformat()

    def count_status(status: str, date: str = None):
        q = db.query(NailBooking).filter(NailBooking.status == status)
        if date:
            q = q.filter(NailBooking.slot_date == date)
        return q.count()

    today_confirmed = count_status("confirmed", today)
    today_pending = count_status("pending_payment", today)
    today_walkin = count_status("walkin", today)

    from sqlalchemy import func as sqlfunc
    week_revenue = db.query(sqlfunc.sum(NailBooking.deposit_total)).filter(
        NailBooking.slot_date >= week_start,
        NailBooking.status.in_(["confirmed", "completed", "walkin"]),
    ).scalar() or 0

    total_bookings = db.query(NailBooking).filter(
        NailBooking.status.in_(["confirmed", "completed", "walkin"])
    ).count()

    recent = (
        db.query(NailBooking)
        .filter(NailBooking.status.in_(["pending_payment", "confirmed", "held"]))
        .order_by(NailBooking.created_at.desc())
        .limit(5)
        .all()
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
    _check_admin(authorization)
    booking = db.query(NailBooking).filter_by(id=booking_id).with_for_update().first()
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
    _check_admin(authorization)

    cfg = get_settings()
    passcode = cfg.admin_passcode
    if not passcode:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า ADMIN_PASSCODE บนเซิร์ฟเวอร์")
    import hmac as _hmac
    if not _hmac.compare_digest((body.passcode or "").strip(), passcode.strip()):
        raise HTTPException(status_code=403, detail="รหัสยืนยันไม่ถูกต้อง")

    booking = db.query(NailBooking).filter_by(id=booking_id).with_for_update().first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")

    _refund_wallet_if_needed(db, booking, "ลบรายการโดยแอดมิน")
    db.delete(booking)
    db.commit()
    return {"ok": True, "message": "ลบการจองแล้ว"}


class UpdateBookingBody(BaseModel):
    status: Optional[str] = None
    admin_note: Optional[str] = None
    service_id: Optional[int] = None  # ใช้ตอนลูกค้าขอเปลี่ยนบริการหน้าร้าน


@router.put("/admin/bookings/{booking_id}")
def admin_update_booking(
    booking_id: int,
    body: UpdateBookingBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    booking = db.query(NailBooking).filter_by(id=booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")
    if body.status:
        booking.status = body.status
    if body.admin_note is not None:
        booking.admin_note = body.admin_note

    deposit_diff = None
    if body.service_id is not None and body.service_id != booking.service_id:
        new_service = db.query(NailService).filter_by(id=body.service_id).first()
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
    _check_admin(authorization)
    service = db.query(NailService).filter_by(id=body.service_id).first() if body.service_id else None
    booking = NailBooking(
        booking_ref="PENDING",
        slot_id=body.slot_id,
        service_id=body.service_id,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        slot_date=body.slot_date,
        start_time=body.start_time,
        end_time=body.end_time or "",
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
    _check_admin(authorization)
    _release_expired_holds(db)
    if date:
        _ensure_slots_for_date(db, _get_shop(db), date)
    q = db.query(NailTimeSlot)
    if date:
        q = q.filter_by(slot_date=date)
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


class SlotTemplateBulkBody(BaseModel):
    templates: List[SlotTemplateItem]


@router.get("/admin/slot-templates")
def admin_get_slot_templates(db: Session = Depends(get_db), authorization: str = Header(None)):
    """ดึงเทมเพลตประจำสัปดาห์ (7 วัน) — ใช้ตั้งค่า 'เปิดกี่รอบ รอบละกี่นาที' ของแต่ละวัน"""
    _check_admin(authorization)
    _ensure_templates_exist(db)
    rows = db.query(NailSlotTemplate).order_by(NailSlotTemplate.day_of_week).all()
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
        }
        for t in rows
    ]


@router.put("/admin/slot-templates")
def admin_update_slot_templates(
    body: SlotTemplateBulkBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """บันทึกเทมเพลตประจำสัปดาห์ — จะมีผลกับสล็อตของวันที่ยัง 'ไม่เคยถูกสร้าง' เท่านั้น
    วันที่แอดมินเคยแก้ไขสล็อตเองแล้วจะไม่ถูกสร้างทับ (ต้องแก้ผ่าน /admin/slots เอง)"""
    _check_admin(authorization)
    for item in body.templates:
        if not (0 <= item.day_of_week <= 6):
            continue
        row = db.query(NailSlotTemplate).filter_by(day_of_week=item.day_of_week).first()
        if not row:
            row = NailSlotTemplate(day_of_week=item.day_of_week)
            db.add(row)
        row.is_open = item.is_open
        row.start_time = item.start_time
        row.rounds_count = max(0, item.rounds_count)
        row.round_minutes = max(1, item.round_minutes)
        row.gap_minutes = max(0, item.gap_minutes)
        row.max_bookings = max(1, item.max_bookings)
        row.staff_id = item.staff_id
    db.commit()
    return {"ok": True}


class GenerateSlotsBody(BaseModel):
    days: int = 30


@router.post("/admin/slot-templates/generate")
def admin_generate_slots_from_template(
    body: GenerateSlotsBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """สร้างสล็อตล่วงหน้าจากเทมเพลตทันที (แทนที่จะรอให้ลูกค้าเปิดหน้าจองก่อน) —
    ข้ามวันที่มีสล็อตอยู่แล้ว (ทั้งจากเทมเพลตเดิมหรือที่แอดมินสร้างเอง)"""
    _check_admin(authorization)
    shop = _get_shop(db)
    today = _now().date()
    days = max(1, min(body.days, 90))
    generated = []
    for i in range(days):
        date_str = (today + timedelta(days=i)).isoformat()
        before = db.query(NailTimeSlot).filter_by(slot_date=date_str).count()
        _ensure_slots_for_date(db, shop, date_str)
        after = db.query(NailTimeSlot).filter_by(slot_date=date_str).count()
        if after > before:
            generated.append(date_str)
    return {"ok": True, "generated_dates": generated, "generated_count": len(generated)}


@router.post("/admin/slots")
def admin_create_slot(
    body: SlotBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    slot = NailTimeSlot(
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
    _check_admin(authorization)
    created = 0
    for date in body.dates:
        for t in body.times:
            # ตรวจไม่ duplicate
            existing = db.query(NailTimeSlot).filter_by(
                slot_date=date, start_time=t["start"]
            ).first()
            if existing:
                continue
            slot = NailTimeSlot(
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
    _check_admin(authorization)
    slot = db.query(NailTimeSlot).filter_by(id=slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="ไม่พบ slot")
    if "is_available" in body:
        slot.is_available = body["is_available"]
    if "max_bookings" in body:
        slot.max_bookings = body["max_bookings"]
    db.commit()
    return {"ok": True}


@router.delete("/admin/slots/{slot_id}")
def admin_delete_slot(
    slot_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    slot = db.query(NailTimeSlot).filter_by(id=slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="ไม่พบ slot")
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
    _check_admin(authorization)
    items = db.query(NailGallery).order_by(NailGallery.sort_order, NailGallery.id.desc()).all()
    return [{"id": g.id, "image_url": g.image_url, "caption": g.caption,
             "sort_order": g.sort_order, "is_active": g.is_active} for g in items]


@router.post("/admin/gallery")
def admin_add_gallery(
    body: GalleryBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    g = NailGallery(image_url=body.image_url, caption=body.caption, sort_order=body.sort_order or 0)
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
    _check_admin(authorization)
    g = db.query(NailGallery).filter_by(id=gallery_id).first()
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
    _check_admin(authorization)
    items = db.query(NailService).filter(NailService.is_active == True).order_by(NailService.sort_order, NailService.id).all()
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
    _check_admin(authorization)
    s = NailService(
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
    _check_admin(authorization)
    s = db.query(NailService).filter_by(id=service_id).first()
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
    _check_admin(authorization)
    s = db.query(NailService).filter_by(id=service_id).first()
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
    _check_admin(authorization)
    items = db.query(NailStaff).order_by(NailStaff.id).all()
    return [{"id": s.id, "name": s.name, "color": s.color, "is_active": s.is_active}
            for s in items]


@router.post("/admin/staff")
def admin_create_staff(
    body: StaffBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    s = NailStaff(name=body.name, color=body.color or "#FF6B9D")
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
    _check_admin(authorization)
    s = db.query(NailStaff).filter_by(id=staff_id).first()
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
    expired_at: Optional[str] = None   # ISO datetime string
    is_active: Optional[bool] = None
    closed_dates: Optional[str] = None  # JSON array of "YYYY-MM-DD"


@router.get("/admin/settings")
def admin_get_settings(db: Session = Depends(get_db), authorization: str = Header(None)):
    _check_admin(authorization)
    shop = _get_shop(db)
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
        "expired_at": shop.expired_at.isoformat() if shop.expired_at else None,
        "is_active": shop.is_active,
        "closed_dates": shop.closed_dates or "[]",
    }


@router.put("/admin/settings")
def admin_update_settings(
    body: ShopSettingsBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    shop = _get_shop(db)
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


def _check_superadmin(x_super_admin_key: Optional[str] = Header(None)):
    cfg = get_settings()
    key = cfg.nail_super_admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า NAIL_SUPER_ADMIN_KEY ใน environment")
    if x_super_admin_key != key:
        raise HTTPException(status_code=403, detail="Key ไม่ถูกต้อง")


@router.get("/admin/rental-status")
def admin_rental_status(db: Session = Depends(get_db), authorization: str = Header(None)):
    """สถานะการเช่าระบบ + คำขอต่ออายุล่าสุด"""
    _check_admin(authorization)
    shop = _get_shop(db)
    now = _now()
    expired = bool(shop.expired_at and now > shop.expired_at)
    days_left: Optional[int] = None
    if shop.expired_at and not expired:
        days_left = (shop.expired_at - now).days

    last_req = (
        db.query(NailRenewalRequest)
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
    _check_admin(authorization)
    shop = _get_shop(db)
    plans = _effective_renewal_plans(shop)
    return [{"months": m, "price": plans[m]} for m in (1, 3, 6, 12)]


class RenewalRequestBody(BaseModel):
    duration_months: int
    payment_channel: str                # "bank_slip" | "angpao"
    slip_image: Optional[str] = None    # base64 data URI (สำหรับโอนผ่านสลิป)
    voucher_code: Optional[str] = None  # TrueMoney gift voucher URL หรือรหัสซอง


@router.post("/admin/renewal-request")
def admin_submit_renewal(
    body: RenewalRequestBody,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """ส่งคำขอต่ออายุพร้อมสลิปโอนเงินหรือซอง TrueMoney — เจ้าของร้านเลือกช่องทางชำระเงินเอง"""
    _check_admin(authorization)
    if body.payment_channel not in ("bank_slip", "angpao"):
        raise HTTPException(status_code=400, detail="ช่องทางชำระเงินไม่ถูกต้อง")
    if body.payment_channel == "bank_slip" and not body.slip_image:
        raise HTTPException(status_code=400, detail="กรุณาแนบสลิปโอนเงิน")
    if body.payment_channel == "angpao" and not body.voucher_code:
        raise HTTPException(status_code=400, detail="กรุณาระบุลิงก์/รหัสซองอั่งเปา")
    shop = _get_shop(db)
    amount = _effective_renewal_plans(shop).get(body.duration_months)
    if not amount:
        raise HTTPException(status_code=400, detail="ระยะเวลาไม่ถูกต้อง (เลือก 1, 3, 6 หรือ 12 เดือน)")
    # เก็บ voucher ใน slip_image field โดยใช้ prefix "voucher:" เพื่อให้ super-admin แยกแยะได้ (backward compat)
    image_or_voucher = body.slip_image or f"voucher:{body.voucher_code}"
    req = NailRenewalRequest(
        duration_months=body.duration_months,
        amount=amount,
        slip_image=image_or_voucher,
        payment_channel=body.payment_channel,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"ok": True, "id": req.id}


# ── Nail Admin: Wallet / Top-up management ───────────────────────────────────

@router.get("/admin/topup-requests")
def nail_admin_list_topups(
    status: str = "pending",
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """รายการขอเติมเครดิตของลูกค้า (nail admin auth)"""
    _check_admin(authorization)
    from backend.models import TopupRequest
    q = db.query(TopupRequest)
    if status != "all":
        q = q.filter(TopupRequest.status == status)
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
        })
    return result


@router.post("/admin/topup-requests/{topup_id}/approve")
def nail_admin_approve_topup(
    topup_id: int,
    body: dict,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """อนุมัติคำขอเติมเครดิต (nail admin auth)"""
    _check_admin(authorization)
    from backend.models import TopupRequest
    topup = db.query(TopupRequest).filter(TopupRequest.id == topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ")
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
    """ปฏิเสธคำขอเติมเครดิต (nail admin auth)"""
    _check_admin(authorization)
    from backend.models import TopupRequest
    topup = db.query(TopupRequest).filter(TopupRequest.id == topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ")
    topup.status = "rejected"
    db.commit()
    return {"ok": True}


# ── Admin: customer wallet management ────────────────────────────────────────

@router.get("/admin/customers")
def nail_admin_list_customers(
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    """รายชื่อลูกค้าทั้งหมด (nail admin auth)"""
    _check_admin(authorization)
    customers = db.query(Customer).order_by(Customer.id.desc()).limit(300).all()
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
    """เพิ่ม/ลด เครดิตให้ลูกค้าใดก็ได้ (nail admin auth)"""
    _check_admin(authorization)
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
    """ประวัติธุรกรรมเครดิตทั้งหมด (nail admin auth)"""
    _check_admin(authorization)
    txns = (
        db.query(CreditTransaction)
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

@router.get("/superadmin/status")
def superadmin_status(
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db)
    now = _now()
    expired = bool(shop.expired_at and now > shop.expired_at)
    return {
        "shop_name": shop.shop_name,
        "expired_at": shop.expired_at.isoformat() if shop.expired_at else None,
        "is_expired": expired,
        "days_left": (shop.expired_at - now).days if shop.expired_at and not expired else None,
        "is_active": shop.is_active,
    }


@router.get("/superadmin/renewals")
def superadmin_list_renewals(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    _check_superadmin(x_super_admin_key)
    q = db.query(NailRenewalRequest)
    if status:
        q = q.filter_by(status=status)
    items = q.order_by(NailRenewalRequest.requested_at.desc()).limit(50).all()
    return [
        {
            "id": r.id,
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
def superadmin_get_pricing(db: Session = Depends(get_db), x_super_admin_key: Optional[str] = Header(None)):
    """ราคาค่าเช่าที่ตั้งไว้เฉพาะร้านนี้ (null = ยังใช้ราคากลาง) + ราคากลางเริ่มต้น"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db)
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
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งราคาค่าเช่าพิเศษเฉพาะร้านนี้ — ส่ง null เพื่อกลับไปใช้ราคากลาง"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db)
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
    shop = _get_shop(db)
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
    db: Session = Depends(get_db),
    x_super_admin_key: Optional[str] = Header(None),
):
    """ตั้งวันหมดอายุตรงๆ (bypass renewal flow) — ใช้สำหรับ super-admin เปิด/ปิดได้ทันที"""
    _check_superadmin(x_super_admin_key)
    shop = _get_shop(db)
    shop.expired_at = datetime.fromisoformat(body.expired_at) if body.expired_at else None
    db.commit()
    return {"ok": True, "expired_at": shop.expired_at.isoformat() if shop.expired_at else None}
