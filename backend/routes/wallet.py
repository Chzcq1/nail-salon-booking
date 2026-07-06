import json
import logging
import os
import re
import secrets
from datetime import datetime, timedelta
from decimal import Decimal

import bcrypt
import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
import jwt as _jwt
from jwt.exceptions import InvalidTokenError as JWTError
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.config import get_settings
from backend.database import get_db
from backend.models import Customer, TopupRequest, CreditTransaction, StoreSettings, EmailOTPSession
from backend.routes.admin import get_admin, _get_setting
from backend.slip_verify import verify_slip

logger = logging.getLogger(__name__)
router = APIRouter()


def _slim_verify_result(result: dict) -> dict:
    """เก็บเฉพาะ field สำคัญ ไม่เก็บ raw JSON ทั้งก้อนจาก Slip2Go (ประหยัด DB มาก)"""
    return {
        "status": result.get("status"),
        "success": result.get("success"),
        "amount": result.get("amount"),
        "trans_ref": result.get("trans_ref"),
        "date_time": result.get("date_time"),
        "sender_name": result.get("sender_name"),
        "sender_bank": result.get("sender_bank"),
        "receiver_name": result.get("receiver_name"),
        "amount_match": result.get("amount_match"),
        "receiver_match": result.get("receiver_match"),
        "error_message": result.get("error_message"),
    }

TRUEMONEY_API = "https://gateway.autozy.app/api/giftvoucher/{code}/{phone}/"

_JWT_SECRET = os.environ.get("SECRET_KEY", "wallet-pin-secret-change-in-production")
_JWT_ALG = "HS256"
_TOKEN_EXPIRE_DAYS = 7

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

OTP_EXPIRE_MINUTES = 10
OTP_SEND_COOLDOWN_SECONDS = 60


# ── Email / token helpers ─────────────────────────────────────────────────────

def _normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="รูปแบบอีเมลไม่ถูกต้อง")
    return email


def _create_token(email: str) -> str:
    payload = {
        "sub": email,
        "exp": datetime.utcnow() + timedelta(days=_TOKEN_EXPIRE_DAYS),
    }
    return _jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALG)


def _decode_token(token: str) -> str:
    payload = _jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALG])
    return payload.get("sub", "")


def get_wallet_customer(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> Customer:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบ")
    token = authorization[7:]
    try:
        email = _decode_token(token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Session หมดอายุ กรุณาเข้าสู่ระบบใหม่")
    customer = db.query(Customer).filter(Customer.email == email).first()
    if not customer:
        raise HTTPException(status_code=401, detail="ไม่พบบัญชี กรุณาเข้าสู่ระบบใหม่")
    return customer


def _hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def _verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode(), hashed.encode())
    except Exception:
        return False


# ── Check account ─────────────────────────────────────────────────────────────

@router.get("/wallet/check")
def wallet_check(email: str = Query(...), db: Session = Depends(get_db)):
    try:
        normalized = _normalize_email(email)
    except HTTPException:
        raise
    customer = db.query(Customer).filter(Customer.email == normalized).first()
    if not customer:
        return {"exists": False, "has_pin": False}
    return {"exists": True, "has_pin": bool(customer.pin_hash)}


# ── Send OTP via email ────────────────────────────────────────────────────────

@router.post("/wallet/send-otp")
async def wallet_send_otp(body: dict, db: Session = Depends(get_db)):
    raw_email = body.get("email", "")
    mode = body.get("mode", "login")

    email = _normalize_email(raw_email)

    if mode == "reset":
        customer = db.query(Customer).filter(Customer.email == email).first()
        if not customer:
            raise HTTPException(status_code=404, detail="ไม่พบบัญชีอีเมลนี้")

    now = datetime.utcnow()
    cooldown_since = now - timedelta(seconds=OTP_SEND_COOLDOWN_SECONDS)
    recent = (
        db.query(EmailOTPSession)
        .filter(
            EmailOTPSession.email == email,
            EmailOTPSession.created_at >= cooldown_since,
            EmailOTPSession.is_used == False,
        )
        .first()
    )
    if recent:
        wait_secs = int((recent.created_at + timedelta(seconds=OTP_SEND_COOLDOWN_SECONDS) - now).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"กรุณารอ {max(wait_secs, 1)} วินาทีก่อนขอ OTP ใหม่",
        )

    otp_code = str(secrets.randbelow(900000) + 100000)
    session_token = secrets.token_hex(32)
    expires_at = now + timedelta(minutes=OTP_EXPIRE_MINUTES)

    session = EmailOTPSession(
        session_token=session_token,
        email=email,
        otp_code=otp_code,
        is_used=False,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()

    try:
        from backend import email_service
        await email_service.send_otp_email(email, otp_code)
    except Exception as e:
        logger.error(f"Failed to send OTP email to {email}: {e}")
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=500, detail=f"ส่งอีเมลไม่สำเร็จ: {e}")

    return {
        "ok": True,
        "session_token": session_token,
        "message": f"ส่ง OTP ไปยัง {email} แล้ว (หมดอายุใน {OTP_EXPIRE_MINUTES} นาที)",
    }


# ── Verify OTP ────────────────────────────────────────────────────────────────

@router.post("/wallet/verify-otp")
def wallet_verify_otp(body: dict, db: Session = Depends(get_db)):
    session_token = body.get("session_token", "")
    otp_input = body.get("otp", "").strip()

    session = db.query(EmailOTPSession).filter(EmailOTPSession.session_token == session_token).first()
    if not session:
        raise HTTPException(status_code=400, detail="Session ไม่ถูกต้อง")
    if session.is_used:
        raise HTTPException(status_code=400, detail="OTP นี้ถูกใช้ไปแล้ว")
    if datetime.utcnow() > session.expires_at.replace(tzinfo=None):
        raise HTTPException(status_code=400, detail="OTP หมดอายุแล้ว กรุณาขอใหม่")
    if session.otp_code != otp_input:
        raise HTTPException(status_code=400, detail="OTP ไม่ถูกต้อง")

    session.is_used = True
    db.commit()

    verified_token = _jwt.encode(
        {
            "purpose": "otp_verified",
            "email": session.email,
            "exp": datetime.utcnow() + timedelta(minutes=15),
        },
        _JWT_SECRET,
        algorithm=_JWT_ALG,
    )

    return {"ok": True, "verified_token": verified_token, "email": session.email}


# ── Reset PIN ─────────────────────────────────────────────────────────────────

@router.post("/wallet/reset-pin")
def wallet_reset_pin(body: dict, db: Session = Depends(get_db)):
    verified_token = body.get("verified_token", "")
    new_pin = body.get("new_pin", "")
    confirm_pin = body.get("confirm_pin", "")

    try:
        payload = _jwt.decode(verified_token, _JWT_SECRET, algorithms=[_JWT_ALG])
        if payload.get("purpose") != "otp_verified":
            raise ValueError("wrong purpose")
        email = payload.get("email", "")
    except Exception:
        raise HTTPException(status_code=400, detail="Token ไม่ถูกต้องหรือหมดอายุ")

    if len(new_pin) < 4:
        raise HTTPException(status_code=400, detail="PIN ต้องมีอย่างน้อย 4 หลัก")
    if new_pin != confirm_pin:
        raise HTTPException(status_code=400, detail="PIN ไม่ตรงกัน")

    customer = db.query(Customer).filter(Customer.email == email).first()
    if not customer:
        raise HTTPException(status_code=404, detail="ไม่พบบัญชี")

    customer.pin_hash = _hash_pin(new_pin)
    db.commit()

    return {"ok": True, "token": _create_token(email)}


# ── Auth (login / register) ───────────────────────────────────────────────────

@router.post("/wallet/auth")
def wallet_auth(body: dict, db: Session = Depends(get_db)):
    raw_email = body.get("email", "")
    pin = body.get("pin", "")
    verified_token = body.get("verified_token", None)

    email = _normalize_email(raw_email)

    customer = db.query(Customer).filter(Customer.email == email).first()

    # ── New account: requires OTP verified_token ──────────────────────────────
    if not customer or not customer.pin_hash:
        if not verified_token:
            raise HTTPException(status_code=400, detail="กรุณายืนยัน OTP ก่อนตั้ง PIN")
        try:
            payload = _jwt.decode(verified_token, _JWT_SECRET, algorithms=[_JWT_ALG])
            if payload.get("purpose") != "otp_verified" or payload.get("email") != email:
                raise ValueError("wrong purpose or email")
        except Exception:
            raise HTTPException(status_code=400, detail="Token ยืนยัน OTP ไม่ถูกต้องหรือหมดอายุ")

        if len(pin) < 4:
            raise HTTPException(status_code=400, detail="PIN ต้องมีอย่างน้อย 4 หลัก")

        if not customer:
            customer = Customer(email=email, balance=Decimal("0"))
            db.add(customer)

        customer.pin_hash = _hash_pin(pin)
        db.commit()
        db.refresh(customer)
        return {"ok": True, "token": _create_token(email)}

    # ── Existing account: verify PIN ──────────────────────────────────────────
    if not pin:
        raise HTTPException(status_code=400, detail="กรุณาใส่ PIN")
    if not _verify_pin(pin, customer.pin_hash):
        raise HTTPException(status_code=401, detail="PIN ไม่ถูกต้อง")

    return {"ok": True, "token": _create_token(email)}


# ── Wallet info ───────────────────────────────────────────────────────────────

@router.get("/wallet/me")
def wallet_me(
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    txns = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.customer_id == customer.id)
        .order_by(desc(CreditTransaction.id))
        .limit(50)
        .all()
    )
    return {
        "email": customer.email,
        "balance": float(customer.balance or 0),
        "transactions": [
            {
                "id": t.id,
                "type": t.txn_type,
                "amount": float(t.amount),
                "description": t.description,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txns
        ],
    }


# ── Topup: slip ───────────────────────────────────────────────────────────────

@router.post("/wallet/topup/slip")
async def topup_slip(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    slip_enabled = (_get_setting(db, "topup_slip_enabled") or "on") == "on"
    if not slip_enabled:
        raise HTTPException(status_code=403, detail="ปิดรับเติมเงินผ่านสลีปชั่วคราว")

    payment_proof = body.get("payment_proof", "")
    if not payment_proof:
        raise HTTPException(status_code=400, detail="กรุณาแนบสลีป")

    topup = TopupRequest(
        customer_id=customer.id,
        topup_type="slip",
        amount=None,
        payment_proof=payment_proof,
        status="pending",
    )
    db.add(topup)
    db.commit()
    db.refresh(topup)

    if settings.slip2go_api_key:
        try:
            bank_account = _get_setting(db, "bank_account")
            result = await verify_slip(
                base64_image=payment_proof,
                bank_account=bank_account or None,
            )
            topup.slip_verify_status = result.get("status")
            topup.slip_verify_result = json.dumps(_slim_verify_result(result))

            if result.get("success") and result.get("amount") and float(result["amount"]) > 0:
                credit = Decimal(str(result["amount"]))
                topup.amount = credit
                topup.status = "approved"
                customer.balance = (customer.balance or Decimal("0")) + credit
                db.add(CreditTransaction(
                    customer_id=customer.id,
                    txn_type="topup",
                    amount=credit,
                    description=f"เติมเงินสลีปอัตโนมัติ #{topup.id} (จาก {result.get('sender_name') or 'ผู้โอน'})",
                    ref_id=topup.id,
                ))
                db.commit()
                return {
                    "ok": True,
                    "auto_approved": True,
                    "amount": float(credit),
                    "balance": float(customer.balance),
                    "topup_id": topup.id,
                }
            else:
                fail_status = result.get("status", "unknown")
                fail_msg = result.get("error_message") or fail_status
                logger.info(
                    f"Slip2Go no auto-approve for topup #{topup.id}: "
                    f"status={fail_status} amount={result.get('amount')} "
                    f"error={fail_msg}"
                )
                db.commit()
                # แจ้งแอดมินว่าตรวจสอบไม่ผ่าน พร้อมสาเหตุ
                try:
                    from backend import bot as bot_module
                    await bot_module.send_topup_failed(
                        topup_id=topup.id,
                        customer_email=customer.email or str(customer.id),
                        topup_type="slip",
                        reason=fail_msg,
                        amount_hint=float(result["amount"]) if result.get("amount") else None,
                    )
                except Exception as notify_err:
                    logger.warning(f"send_topup_failed error: {notify_err}")
                return {"ok": True, "auto_approved": False, "topup_id": topup.id, "status": "pending"}
        except Exception as e:
            logger.warning(f"Slip2go error for topup #{topup.id}: {e}")
            db.commit()

    # ไม่มี Slip2Go API → ส่งให้แอดมินตรวจสอบด้วยตนเอง
    try:
        from backend import bot as bot_module
        await bot_module.send_topup_request(
            topup_id=topup.id,
            customer_username=customer.email or str(customer.id),
            amount_hint=float(topup.amount) if topup.amount else None,
            topup_type="slip",
            payment_proof=payment_proof,
        )
    except Exception as e:
        logger.warning(f"Topup notify error: {e}")

    return {"ok": True, "auto_approved": False, "topup_id": topup.id, "status": "pending"}


# ── Topup: TrueMoney ──────────────────────────────────────────────────────────

@router.post("/wallet/topup/truemoney")
async def topup_truemoney(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    tm_enabled = (_get_setting(db, "topup_truemoney_enabled") or "on") == "on"
    if not tm_enabled:
        raise HTTPException(status_code=403, detail="ปิดรับเติมเงินผ่าน TrueMoney ชั่วคราว")

    voucher_raw = body.get("voucher", "")
    voucher_code = _extract_voucher_code(voucher_raw)

    existing = db.query(TopupRequest).filter(TopupRequest.voucher_code == voucher_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="ซองนี้ถูกใช้งานไปแล้ว")

    topup = TopupRequest(
        customer_id=customer.id,
        topup_type="truemoney",
        status="pending",
        voucher_code=voucher_code,
    )
    db.add(topup)
    db.commit()
    db.refresh(topup)

    phone_placeholder = "0800000000"
    url = TRUEMONEY_API.format(code=voucher_code, phone=phone_placeholder)

    if settings.bot_token:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(url)
                data = resp.json()
                topup.truemoney_result = json.dumps(data)
                if data.get("status") == "SUCCESS":
                    credit_raw = data.get("data", {}).get("voucher", {}).get("redeemAmount") or data.get("amount")
                    if credit_raw:
                        credit = Decimal(str(credit_raw))
                        topup.amount = credit
                        topup.status = "approved"
                        customer.balance = (customer.balance or Decimal("0")) + credit
                        db.add(CreditTransaction(
                            customer_id=customer.id,
                            txn_type="topup",
                            amount=credit,
                            description=f"แลกซอง TrueMoney อัตโนมัติ #{topup.id}",
                            ref_id=topup.id,
                        ))
                        db.commit()
                        return {
                            "ok": True,
                            "auto_approved": True,
                            "amount": float(credit),
                            "balance": float(customer.balance),
                            "topup_id": topup.id,
                        }
                    else:
                        msg_map = {
                            "100": "ซองนี้ถูกใช้งานแล้ว",
                            "101": "ไม่พบซองของขวัญ",
                            "102": "ไม่สามารถใช้ซองของตัวเองได้",
                            "103": "ซองนี้รับไปแล้ว",
                            "104": "ข้อมูลไม่ถูกต้อง",
                            "105": "ซองหมดอายุแล้ว",
                        }
                        err_code = str(data.get("code", ""))
                        err_msg = msg_map.get(err_code, data.get("message", "แลกซองไม่สำเร็จ"))
                        topup.status = "pending"
                        db.commit()
                        try:
                            from backend import bot as bot_module
                            await bot_module.send_topup_failed(
                                topup_id=topup.id,
                                customer_email=customer.email or str(customer.id),
                                topup_type="truemoney",
                                reason=err_msg,
                                voucher_code=voucher_code,
                            )
                        except Exception as notify_err:
                            logger.warning(f"Topup notify error: {notify_err}")
                        return {
                            "ok": True,
                            "auto_approved": False,
                            "topup_id": topup.id,
                            "status": "pending",
                            "message": f"แลกซองอัตโนมัติไม่ได้ ({err_msg}) — ส่งให้แอดมินตรวจสอบแล้ว",
                        }

        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"TrueMoney API error for topup #{topup.id}: {e}")
            topup.status = "pending"
            db.commit()
            try:
                from backend import bot as bot_module
                await bot_module.send_topup_request(
                    topup_id=topup.id,
                    customer_username=customer.email or str(customer.id),
                    amount_hint=None,
                    topup_type="truemoney",
                    voucher_code=voucher_code,
                )
            except Exception as notify_err:
                logger.warning(f"Topup notify error: {notify_err}")
            return {
                "ok": True,
                "auto_approved": False,
                "topup_id": topup.id,
                "status": "pending",
                "message": "ติดต่อ TrueMoney ไม่ได้ชั่วคราว — ส่งให้แอดมินตรวจสอบแล้ว",
            }
    else:
        try:
            from backend import bot as bot_module
            await bot_module.send_topup_request(
                topup_id=topup.id,
                customer_username=customer.email or str(customer.id),
                amount_hint=None,
                topup_type="truemoney",
                voucher_code=voucher_code,
            )
        except Exception as e:
            logger.warning(f"Topup notify error: {e}")
        return {"ok": True, "auto_approved": False, "topup_id": topup.id, "status": "pending"}


# ── Purchase with credits ─────────────────────────────────────────────────────

@router.post("/wallet/purchase")
async def purchase_with_credits(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    from backend.models import Order, Product
    from backend import bot as bot_module

    product_id = body.get("product_id")
    if not product_id:
        raise HTTPException(status_code=400, detail="กรุณาระบุสินค้า")

    product = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="ไม่พบสินค้า")

    price = Decimal(str(product.price))
    if (customer.balance or Decimal("0")) < price:
        raise HTTPException(
            status_code=400,
            detail=f"เครดิตไม่พอ (มี {float(customer.balance or 0):.0f} ต้องการ {float(price):.0f})"
        )

    customer.balance = customer.balance - price
    order = Order(
        telegram_username=customer.email,
        product_id=product.id,
        product_name=product.name,
        payment_type="credit",
        status="approved",
        link_sent=False,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    db.add(CreditTransaction(
        customer_id=customer.id,
        txn_type="purchase",
        amount=-price,
        description=f"ซื้อ {product.name}",
        ref_id=order.id,
    ))

    product.sales_count = (product.sales_count or 0) + 1

    from backend.models import FinanceEntry
    db.add(FinanceEntry(
        amount=price,
        description=f"ออเดอร์ #{order.id} — {product.name} (เครดิต)",
        admin_name="ระบบ",
        entry_type="order",
        order_id=order.id,
    ))

    db.commit()

    try:
        invite_links = await bot_module.generate_invite_links(order.id, product.telegram_group_ids or "")
        if invite_links:
            order.invite_links = json.dumps(invite_links)
            order.link_sent = True
            db.commit()
    except Exception as e:
        logger.warning(f"Invite link error for order #{order.id}: {e}")

    return {
        "ok": True,
        "order_id": order.id,
        "balance": float(customer.balance),
        "invite_links": json.loads(order.invite_links) if order.invite_links else [],
    }


# ── My orders ─────────────────────────────────────────────────────────────────

@router.get("/wallet/my-orders")
def get_my_orders(
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    from backend.models import Order
    orders = (
        db.query(Order)
        .filter(Order.telegram_username == customer.email)
        .order_by(desc(Order.id))
        .limit(50)
        .all()
    )
    return [
        {
            "id": o.id,
            "product_name": o.product_name,
            "status": o.status,
            "payment_type": o.payment_type,
            "invite_links": json.loads(o.invite_links) if o.invite_links else [],
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_voucher_code(raw: str) -> str:
    raw = raw.strip()
    match = re.search(r"[?&]v=([A-Za-z0-9]+)", raw)
    if match:
        return match.group(1)
    if re.match(r"^[A-Za-z0-9]+$", raw):
        return raw
    raise HTTPException(status_code=400, detail="รูปแบบลิงก์ซองไม่ถูกต้อง กรุณาวาง link เต็มหรือรหัสซอง")


# ── Admin: topup requests ─────────────────────────────────────────────────────

@router.get("/admin/topup-requests")
def admin_list_topups(
    status: str = Query(default="pending"),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    q = db.query(TopupRequest)
    if status != "all":
        q = q.filter(TopupRequest.status == status)
    topups = q.order_by(desc(TopupRequest.id)).limit(100).all()
    result = []
    for t in topups:
        cust = db.query(Customer).filter(Customer.id == t.customer_id).first()
        # Parse slip_verify_result for sender info
        verify_detail = {}
        if t.slip_verify_result:
            try:
                vr = json.loads(t.slip_verify_result)
                verify_detail = {
                    "sender_name": vr.get("sender_name"),
                    "sender_bank": vr.get("sender_bank"),
                    "trans_ref": vr.get("trans_ref"),
                    "error_message": vr.get("error_message"),
                }
            except Exception:
                pass
        result.append({
            "id": t.id,
            "customer_email": cust.email if cust else "?",
            "topup_type": t.topup_type,
            "amount": float(t.amount) if t.amount else None,
            "status": t.status,
            "payment_proof": t.payment_proof or None,
            "voucher_code": t.voucher_code or None,
            "slip_verify_status": t.slip_verify_status,
            "verify_detail": verify_detail,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })
    return result


@router.post("/admin/topup-requests/{topup_id}/approve")
def admin_approve_topup(
    topup_id: int,
    body: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
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
        description=f"แอดมินอนุมัติเติมเงิน #{topup_id} ({topup.topup_type})",
        ref_id=topup_id,
    ))
    db.commit()
    return {"ok": True, "balance": float(customer.balance)}


@router.post("/admin/topup-requests/{topup_id}/reject")
def admin_reject_topup(
    topup_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    topup = db.query(TopupRequest).filter(TopupRequest.id == topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="ไม่พบรายการ")
    topup.status = "rejected"
    db.commit()
    return {"ok": True}


# ── Admin: customers ──────────────────────────────────────────────────────────

@router.get("/admin/customers")
def admin_list_customers(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    customers = db.query(Customer).order_by(desc(Customer.id)).limit(200).all()
    result = []
    for c in customers:
        txn_count = db.query(CreditTransaction).filter(CreditTransaction.customer_id == c.id).count()
        result.append({
            "id": c.id,
            "email": c.email,
            "balance": float(c.balance or 0),
            "transaction_count": txn_count,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        })
    return result


@router.post("/admin/customers/{customer_id}/adjust")
def admin_adjust_balance(
    customer_id: int,
    body: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="ไม่พบลูกค้า")
    amount = Decimal(str(body.get("amount", 0)))
    reason = body.get("reason", "แอดมินปรับยอด")
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
