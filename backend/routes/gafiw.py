import logging
import time
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import httpx

from backend.config import get_settings
from backend.database import get_db
from backend.models import Customer, CreditTransaction, GafiwProduct, StoreSettings, FinanceEntry, GafiwOrder
from backend.routes.wallet import get_wallet_customer
from backend.routes.admin import get_admin

logger = logging.getLogger(__name__)
router = APIRouter()

GAFIW_BASE = "https://gafiwshop.xyz/api"

# ── In-memory cache สำหรับ gafiwshop API (TTL 60 วินาที) ─────────────────────
_gafiw_product_cache: dict = {"data": None, "ts": 0.0}
_GAFIW_CACHE_TTL = 60  # seconds


def _get_key() -> str:
    key = get_settings().gafiwshop_key_api
    if not key:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่า GAFIWSHOP_KEY_API")
    return key


def _get_global_markup_percent(db: Session) -> float:
    """ดึง global markup % จาก store_settings (default 0)"""
    row = db.query(StoreSettings).filter(StoreSettings.key == "gafiw_global_markup_percent").first()
    try:
        return float(row.value) if (row and row.value is not None) else 0.0
    except (TypeError, ValueError):
        return 0.0


def _effective_markup_percent(toggle: GafiwProduct | None, global_pct: float) -> float:
    """คืน % markup ที่ใช้จริงสำหรับสินค้านี้
    - ถ้าสินค้ามี markup_percent >= 0 → ใช้ค่ารายตัว
    - ถ้าเป็น -1 (default) → ใช้ global markup %
    """
    if toggle is None:
        return global_pct
    pct = float(toggle.markup_percent if toggle.markup_percent is not None else -1)
    return pct if pct >= 0 else global_pct


def _apply_markup(api_price: float, pct: float) -> float:
    """ราคาขาย = ต้นทุน × (1 + %/100)  ปัดเป็นจำนวนเต็ม"""
    return round(api_price * (1 + pct / 100))


async def _fetch_gafiw_balance(key: str) -> float | None:
    """ดึงยอดเงินกระเป๋า Gafiw ของเรา (reseller wallet) — คืน None ถ้า error
    Gafiw ต้องการ POST + Content-Type: application/x-www-form-urlencoded
    Response: {"status":"success","msg":"100.00 บาท"}
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{GAFIW_BASE}/api_money",
                data={"keyapi": key},
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            resp.raise_for_status()
            data = resp.json()
        # {"status":"success","msg":"100.00 บาท"}
        if data.get("status") == "success":
            msg = str(data.get("msg", "0"))
            # ตัด "บาท" และ comma ออก แล้วแปลงเป็น float
            numeric = msg.replace("บาท", "").replace(",", "").strip()
            return float(numeric)
        return None
    except Exception as e:
        logger.warning("ดึง Gafiw balance ไม่ได้: %s", e)
        return None


# ── Public: list all active gafiw products (merged with toggled state) ─────────

@router.get("/gafiw/products")
async def gafiw_products(db: Session = Depends(get_db)):
    """ดึงสินค้าจาก gafiwshop.xyz แล้ว merge สถานะ enable/disable และ markup จาก DB
    ผลลัพธ์จาก gafiwshop จะถูก cache ไว้ 60 วินาที เพื่อลด latency"""
    global _gafiw_product_cache
    now = time.time()

    if _gafiw_product_cache["data"] is not None and (now - _gafiw_product_cache["ts"]) < _GAFIW_CACHE_TTL:
        raw_products = _gafiw_product_cache["data"]
    else:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{GAFIW_BASE}/api_product",
                                        headers={"Accept": "application/json"})
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            if _gafiw_product_cache["data"] is not None:
                logger.warning("gafiwshop ไม่ตอบสนอง — ใช้ข้อมูล cache เก่า: %s", e)
                raw_products = _gafiw_product_cache["data"]
            else:
                raise HTTPException(status_code=502, detail=f"ดึงสินค้าจาก gafiwshop ไม่ได้: {e}")
        else:
            if not data.get("ok"):
                raise HTTPException(status_code=502, detail="gafiwshop ตอบกลับ ok=false")
            raw_products = data.get("data", [])
            _gafiw_product_cache = {"data": raw_products, "ts": now}
    global_pct = _get_global_markup_percent(db)

    toggles: dict[str, GafiwProduct] = {
        g.type_id: g for g in db.query(GafiwProduct).all()
    }

    result = []
    for p in raw_products:
        type_id = str(p.get("type_id", ""))
        toggle = toggles.get(type_id)
        is_enabled = toggle.is_enabled if toggle else True

        api_price = float(str(p.get("price", "0")).replace(",", "")) or 0.0
        eff_pct = _effective_markup_percent(toggle, global_pct)
        sell_price = _apply_markup(api_price, eff_pct)

        result.append({
            "type_id": type_id,
            "name": p.get("name", ""),
            "imageapi": p.get("imageapi", ""),
            "api_price": api_price,
            "price": sell_price,
            "markup_percent": eff_pct,
            "markup_percent_custom": float(toggle.markup_percent) if (toggle and float(toggle.markup_percent) >= 0) else None,
            "global_markup_percent": global_pct,
            "fake_price": float(toggle.fake_price) if (toggle and toggle.fake_price is not None) else None,
            "pricevip": p.get("pricevip", "0"),
            "stock": p.get("stock", "0"),
            "type_menu": p.get("type_menu", ""),
            "details": p.get("details", ""),
            "is_enabled": is_enabled,
            "source": "gafiw",
        })

    return {"ok": True, "data": result}


# ── Public: stock history (no key needed) ─────────────────────────────────────

@router.get("/gafiw/stock-history")
async def gafiw_stock_history():
    """ประวัติการเพิ่มสต็อกล่าสุด เรียงใหม่ → เก่า"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{GAFIW_BASE}/update_stock",
                                    headers={"Accept": "application/json"})
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ดึงประวัติสต็อกไม่ได้: {e}")


# ── Customer: buy gafiw product with wallet credits ────────────────────────────

@router.post("/gafiw/buy")
async def gafiw_buy(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
    db: Session = Depends(get_db),
):
    key = _get_key()
    type_id = (body.get("type_id") or "").strip()
    if not type_id:
        raise HTTPException(status_code=400, detail="กรุณาระบุรหัสสินค้า (type_id)")

    toggle = db.query(GafiwProduct).filter(GafiwProduct.type_id == type_id).first()
    if toggle and not toggle.is_enabled:
        raise HTTPException(status_code=403, detail="สินค้านี้ถูกปิดการขายชั่วคราว")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{GAFIW_BASE}/api_product",
                                    headers={"Accept": "application/json"})
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ดึงข้อมูลสินค้าไม่ได้: {e}")

    products = data.get("data", []) if data.get("ok") else []
    product_info = next((p for p in products if str(p.get("type_id", "")) == type_id), None)
    if not product_info:
        raise HTTPException(status_code=404, detail="ไม่พบสินค้านี้ใน gafiwshop")

    stock = int(str(product_info.get("stock", "0")).replace(",", "") or 0)
    if stock <= 0:
        raise HTTPException(status_code=400, detail="สินค้าหมดสต็อก")

    api_price_str = str(product_info.get("price", "0")).replace(",", "")
    try:
        api_price = float(api_price_str)
    except Exception:
        raise HTTPException(status_code=502, detail="ราคาสินค้าผิดรูปแบบ")

    # คำนวณราคาขาย (รวม markup %)
    global_pct = _get_global_markup_percent(db)
    eff_pct = _effective_markup_percent(toggle, global_pct)
    sell_price = Decimal(str(_apply_markup(api_price, eff_pct)))

    if (customer.balance or Decimal("0")) < sell_price:
        raise HTTPException(
            status_code=400,
            detail=f"เครดิตไม่พอ (มี {float(customer.balance or 0):.0f} บาท ต้องการ {float(sell_price):.0f} บาท)"
        )

    # ── เช็ค Gafiw balance ก่อน buy เพื่อคำนวณ actual_cost หลัง buy ─────────────
    balance_before = await _fetch_gafiw_balance(key)

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{GAFIW_BASE}/api_buy",
                data={
                    "keyapi": key,
                    "type_id": type_id,
                    "username_buy": customer.email or str(customer.id),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            result = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"สั่งซื้อที่ gafiwshop ไม่ได้: {e}")

    if result.get("status") != "success":
        msg = result.get("error", {}).get("message") or result.get("msg") or "สั่งซื้อไม่สำเร็จ"
        raise HTTPException(status_code=400, detail=msg)

    # ── ดึง Gafiw balance หลัง buy เพื่อคำนวณต้นทุนจริง ───────────────────────
    balance_after = await _fetch_gafiw_balance(key)
    actual_cost: Decimal | None = None
    if balance_before is not None and balance_after is not None:
        diff = Decimal(str(balance_before)) - Decimal(str(balance_after))
        if diff > 0:
            actual_cost = diff

    # หักเงินตามราคาขาย (รวม markup แล้ว)
    customer.balance = (customer.balance or Decimal("0")) - sell_price
    d = result.get("data", {})
    product_name = d.get("name") or product_info.get("name", type_id)

    db.add(CreditTransaction(
        customer_id=customer.id,
        txn_type="purchase",
        amount=-sell_price,
        description=f"ซื้อ {product_name} (gafiwshop)",
    ))

    # ── บันทึก FinanceEntry: กำไร = sell_price - ต้นทุนจริง (Gafiw balance diff) ─
    profit = sell_price - actual_cost if actual_cost is not None else sell_price
    cost_note = f" [Gafiw ฿{float(actual_cost):,.2f}]" if actual_cost is not None else " [ไม่ทราบต้นทุน]"
    db.add(FinanceEntry(
        amount=profit,
        description=f"Gafiw: {product_name}{cost_note}",
        admin_name="ระบบ",
        entry_type="order",
    ))

    # ── บันทึกประวัติการซื้อไว้ในระบบเราเอง (เก็บรหัสสินค้าถาวร) ────────────────
    db.add(GafiwOrder(
        customer_id=customer.id,
        type_id=type_id,
        product_name=product_name,
        textdb=d.get("textdb"),
        image_api=d.get("imageapi"),
        price=sell_price,
    ))
    db.commit()

    # ── แจ้ง Telegram Admin Group ─────────────────────────────────────────────
    try:
        from backend import bot as bot_module
        await bot_module.send_gafiw_purchase(
            customer_email=customer.email or str(customer.id),
            product_name=product_name,
            sell_price=float(sell_price),
            actual_cost=float(actual_cost) if actual_cost is not None else None,
            profit=float(profit),
            gafiw_balance_after=balance_after,
        )
    except Exception as e:
        logger.warning(f"Gafiw purchase notify error: {e}")

    return {
        "ok": True,
        "product_name": product_name,
        "price": float(sell_price),
        "balance": float(customer.balance),
        "actual_cost": float(actual_cost) if actual_cost is not None else None,
        "profit": float(profit),
        "data": {
            "uid": d.get("uid"),
            "name": d.get("name"),
            "textdb": d.get("textdb"),
            "imageapi": d.get("imageapi"),
            "point": d.get("point"),
            "date": d.get("date"),
        },
    }


# ── Customer: purchase history from gafiwshop ─────────────────────────────────

@router.get("/gafiw/history")
async def gafiw_history(
    customer: Customer = Depends(get_wallet_customer),
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """ดึงประวัติการซื้อจากฐานข้อมูลของเราเอง (เก็บรหัสสินค้า/textdb ไว้ถาวร
    ไม่ต้องพึ่ง history API ของ gafiwshop ซึ่งอาจไม่คืนรหัสสินค้าให้ภายหลัง)"""
    rows = (
        db.query(GafiwOrder)
        .filter(GafiwOrder.customer_id == customer.id)
        .order_by(GafiwOrder.created_at.desc())
        .limit(limit)
        .all()
    )
    data = [
        {
            "id": r.id,
            "type_id": r.type_id,
            "name": r.product_name,
            "textdb": r.textdb,
            "imageapi": r.image_api,
            "price": float(r.price) if r.price is not None else None,
            "date": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
    return {"ok": True, "data": data}


# ── Customer: claim order ─────────────────────────────────────────────────────

@router.post("/gafiw/claim")
async def gafiw_claim(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
):
    key = _get_key()
    order_id = body.get("order_id")
    reason = body.get("reason", "ไม่ได้รับสินค้า")
    if not order_id:
        raise HTTPException(status_code=400, detail="กรุณาระบุ order_id")

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{GAFIW_BASE}/api_claim",
                data={"keyapi": key, "order_id": order_id, "reason": reason},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"เคลมไม่ได้: {e}")


# ── Customer: check claim status ──────────────────────────────────────────────

@router.post("/gafiw/check-claim")
async def gafiw_check_claim(
    body: dict,
    customer: Customer = Depends(get_wallet_customer),
):
    key = _get_key()
    order_id = body.get("order_id")

    post_data: dict = {"keyapi": key}
    if order_id:
        post_data["order_id"] = order_id

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{GAFIW_BASE}/check_claim_status",
                data=post_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"เช็คสถานะเคลมไม่ได้: {e}")


# ── Customer: wallet balance from gafiwshop ───────────────────────────────────

@router.get("/gafiw/money")
async def gafiw_money(customer: Customer = Depends(get_wallet_customer)):
    key = _get_key()
    balance = await _fetch_gafiw_balance(key)
    if balance is None:
        raise HTTPException(status_code=502, detail="ดึงยอดเงิน Gafiw ไม่ได้")
    return {"status": "success", "msg": f"{balance:,.2f} บาท", "balance": balance}


# ── Admin: toggle gafiw product enable/disable ────────────────────────────────

@router.post("/admin/gafiw/toggle")
def admin_gafiw_toggle(
    body: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    type_id = (body.get("type_id") or "").strip()
    is_enabled = bool(body.get("is_enabled", True))
    if not type_id:
        raise HTTPException(status_code=400, detail="กรุณาระบุ type_id")

    row = db.query(GafiwProduct).filter(GafiwProduct.type_id == type_id).first()
    if row:
        row.is_enabled = is_enabled
    else:
        db.add(GafiwProduct(type_id=type_id, is_enabled=is_enabled))
    db.commit()
    return {"ok": True, "type_id": type_id, "is_enabled": is_enabled}


# ── Admin: set global markup percent ──────────────────────────────────────────

@router.post("/admin/gafiw/global-markup")
def admin_gafiw_set_global_markup(
    body: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    """ตั้ง global markup % ที่ใช้กับสินค้าทุกตัวที่ไม่มี override"""
    pct = body.get("markup_percent", 0)
    try:
        pct_val = float(pct)
        if pct_val < 0:
            raise ValueError("ต้องเป็นตัวเลข >= 0")
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="markup_percent ต้องเป็นตัวเลข >= 0")

    row = db.query(StoreSettings).filter(StoreSettings.key == "gafiw_global_markup_percent").first()
    if row:
        row.value = str(pct_val)
    else:
        row = StoreSettings(key="gafiw_global_markup_percent", value=str(pct_val))
        db.add(row)
    db.commit()
    return {"ok": True, "markup_percent": pct_val}


# ── Admin: get global markup setting ──────────────────────────────────────────

@router.get("/admin/gafiw/global-markup")
def admin_gafiw_get_global_markup(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    return {"ok": True, "markup_percent": _get_global_markup_percent(db)}


# ── Admin: set per-product markup percent (override) ─────────────────────────

@router.post("/admin/gafiw/markup")
def admin_gafiw_set_markup(
    body: dict,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    """ตั้ง markup % และ fake_price รายตัว — ส่ง markup_percent=-1 เพื่อใช้ global แทน"""
    type_id = str(body.get("type_id", "")).strip()
    if not type_id:
        raise HTTPException(status_code=400, detail="ต้องระบุ type_id")

    pct = body.get("markup_percent", -1)
    try:
        pct_val = Decimal(str(pct))
    except Exception:
        raise HTTPException(status_code=400, detail="markup_percent ต้องเป็นตัวเลข")

    row = db.query(GafiwProduct).filter(GafiwProduct.type_id == type_id).first()
    if row:
        row.markup_percent = pct_val
    else:
        row = GafiwProduct(type_id=type_id, is_enabled=True, markup_percent=pct_val)
        db.add(row)

    # บันทึก fake_price (ราคาหลอกตา) — ถ้าส่ง null หรือ 0 จะเคลียร์
    fake_price_raw = body.get("fake_price")
    if "fake_price" in body:
        try:
            fp = float(fake_price_raw) if fake_price_raw is not None else 0
            row.fake_price = Decimal(str(fp)) if fp > 0 else None
        except Exception:
            pass

    db.commit()
    return {
        "ok": True,
        "type_id": type_id,
        "markup_percent": float(pct_val),
        "fake_price": float(row.fake_price) if row.fake_price is not None else None,
    }


# ── Admin: check Gafiw reseller wallet balance ────────────────────────────────

@router.get("/admin/gafiw/wallet-balance")
async def admin_gafiw_wallet_balance(
    admin: dict = Depends(get_admin),
):
    """เช็คยอดเงินกระเป๋า Gafiw ของร้าน (reseller wallet)"""
    key = _get_key()
    balance = await _fetch_gafiw_balance(key)
    if balance is None:
        raise HTTPException(status_code=502, detail="ดึงยอดเงิน Gafiw ไม่ได้ชั่วคราว")
    return {"ok": True, "balance": balance}


# ── Admin: get all toggle states ──────────────────────────────────────────────

@router.get("/admin/gafiw/toggles")
def admin_gafiw_toggles(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin),
):
    rows = db.query(GafiwProduct).all()
    return {r.type_id: r.is_enabled for r in rows}


# ── Public: OTP YouKu (no key needed) ─────────────────────────────────────────

@router.get("/gafiw/otp/youku")
async def gafiw_otp_youku():
    """ดึง OTP ล่าสุดจากกล่องเมล YouKu ย้อนหลัง 30 นาที (ไม่ต้องใช้ key)"""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{GAFIW_BASE}/otp_youku",
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ดึง OTP YouKu ไม่ได้: {e}")


# ── Public: OTP Disney+ by phone (no key needed) ──────────────────────────────

@router.get("/gafiw/otp/disney")
async def gafiw_otp_disney(phone: str = ""):
    """ดึง OTP Disney+ โดยใช้เบอร์โทร (ไม่ต้องใช้ key)"""
    if not phone.strip():
        raise HTTPException(status_code=400, detail="กรุณาระบุเบอร์โทร (phone)")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{GAFIW_BASE}/otp_disney",
                params={"phone": phone.strip()},
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ดึง OTP Disney+ ไม่ได้: {e}")
