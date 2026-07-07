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

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional

from backend.config import get_settings
from backend.database import get_db
from backend.models import (
    NailShopSettings, NailService, NailStaff, NailTimeSlot,
    NailBooking, NailGallery,
)
from backend.slip_verify import verify_slip

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/nail", tags=["nail"])

# ─── helpers ────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_shop(db: Session) -> NailShopSettings:
    shop = db.query(NailShopSettings).filter_by(id=1).first()
    if not shop:
        shop = NailShopSettings(id=1)
        db.add(shop)
        db.commit()
        db.refresh(shop)
    return shop


def _check_admin(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization[7:]
    settings = get_settings()
    passcode = settings.admin_passcode
    if not passcode:
        raise HTTPException(
            status_code=503,
            detail="Admin auth not configured — set ADMIN_PASSCODE environment variable",
        )
    # ป้องกัน timing attack ด้วย secrets.compare_digest
    import hmac
    if not hmac.compare_digest(token, passcode):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _gen_ref(db: Session) -> str:
    """สร้างเลขอ้างอิงการจอง NB-0001"""
    last = db.query(NailBooking).order_by(NailBooking.id.desc()).first()
    n = (last.id + 1) if last else 1
    return f"NB-{n:04d}"


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

# ─── Public endpoints ────────────────────────────────────────────────────────

@router.get("/settings")
def get_settings_public(db: Session = Depends(get_db)):
    shop = _get_shop(db)
    # ตรวจสอบ rental expiry
    expired = False
    if shop.expired_at and _now() > shop.expired_at:
        expired = True
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
    slots = (
        db.query(NailTimeSlot)
        .filter_by(slot_date=date, is_available=True)
        .order_by(NailTimeSlot.start_time)
        .all()
    )
    result = []
    for s in slots:
        confirmed = _count_confirmed_bookings(db, s.id)
        result.append({
            "id": s.id,
            "start_time": s.start_time,
            "end_time": s.end_time,
            "available": confirmed < (s.max_bookings or 1),
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


@router.post("/booking/hold")
def hold_slot(req: HoldRequest, db: Session = Depends(get_db)):
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

    # Count inside the same transaction (consistent read after lock)
    confirmed = _count_confirmed_bookings(db, slot.id)
    if confirmed >= (slot.max_bookings or 1):
        raise HTTPException(status_code=409, detail="ช่วงเวลานี้เต็มแล้ว กรุณาเลือกเวลาอื่น")

    shop = _get_shop(db)
    service = db.query(NailService).filter_by(id=req.service_id).first() if req.service_id else None

    base_deposit = float(shop.deposit_amount or 200)
    rand_cents = random.randint(1, 99)  # สุ่มเศษสตางค์ 01–99 เพื่อระบุตัวตน
    deposit_total = round(base_deposit + rand_cents / 100, 2)

    hold_token = secrets.token_urlsafe(32)
    held_until = _now() + timedelta(minutes=10)

    booking = NailBooking(
        booking_ref=_gen_ref(db),
        slot_id=slot.id,
        service_id=req.service_id,
        staff_id=slot.staff_id,
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

    # ตรวจสลิปอัตโนมัติ
    shop = _get_shop(db)
    settings = get_settings()
    if settings.slip2go_api_key:
        try:
            result = await verify_slip(
                req.payment_proof,
                expected_amount=float(booking.deposit_total or 0),
                bank_account=shop.bank_account_number,
            )
            booking.slip_verify_status = result.get("status")
            booking.slip_verify_result = json.dumps(result, ensure_ascii=False)

            if result.get("success"):
                booking.status = "confirmed"
            else:
                booking.status = "pending_payment"
        except Exception as e:
            logger.warning(f"slip verify error: {e}")
            booking.status = "pending_payment"
            booking.slip_verify_status = "error"
    else:
        # ไม่มี slip2go → รอแอดมินอนุมัติ
        booking.status = "pending_payment"

    db.commit()
    db.refresh(booking)

    return {
        "booking_ref": booking.booking_ref,
        "status": booking.status,
        "slip_verify_status": booking.slip_verify_status,
        "message": (
            "จองคิวสำเร็จ! แอดมินยืนยันการชำระเงินแล้วครับ" if booking.status == "confirmed"
            else "อัปโหลดสลิปสำเร็จ รอแอดมินตรวจสอบค่ะ"
        ),
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


# ─── Admin endpoints ─────────────────────────────────────────────────────────

@router.get("/admin/bookings")
def admin_list_bookings(
    date: Optional[str] = None,
    status: Optional[str] = None,
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

    bookings = q.order_by(NailBooking.slot_date, NailBooking.start_time, NailBooking.id).all()

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


@router.post("/admin/bookings/{booking_id}/refund")
def admin_refund_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    authorization: str = Header(None),
):
    _check_admin(authorization)
    booking = db.query(NailBooking).filter_by(id=booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="ไม่พบการจอง")
    if booking.status not in ("pending_payment", "confirmed"):
        raise HTTPException(status_code=409, detail=f"ไม่สามารถคืนเงินสถานะ: {booking.status}")
    booking.status = "cancelled"
    booking.admin_note = (booking.admin_note or "") + " [ยกเลิกและคืนเงินโดยแอดมิน]"
    db.commit()
    return {"ok": True, "message": "ยกเลิกและบันทึกการคืนเงินแล้ว"}


class UpdateBookingBody(BaseModel):
    status: Optional[str] = None
    admin_note: Optional[str] = None


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
    db.commit()
    return {"ok": True}


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
        booking_ref=_gen_ref(db),
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
    q = db.query(NailTimeSlot)
    if date:
        q = q.filter_by(slot_date=date)
    slots = q.order_by(NailTimeSlot.slot_date, NailTimeSlot.start_time).all()
    result = []
    for s in slots:
        confirmed = _count_confirmed_bookings(db, s.id)
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
    color: Optional[str] = "#FF6B9D"
    sort_order: Optional[int] = 0


@router.get("/admin/services")
def admin_list_services(db: Session = Depends(get_db), authorization: str = Header(None)):
    _check_admin(authorization)
    items = db.query(NailService).order_by(NailService.sort_order, NailService.id).all()
    return [{"id": s.id, "name": s.name, "description": s.description,
             "duration_minutes": s.duration_minutes, "price": float(s.price or 0),
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
        price=body.price or 0, color=body.color or "#FF6B9D",
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
