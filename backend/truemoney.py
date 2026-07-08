"""
TrueMoney Angpao (ซองอั่งเปา) voucher redemption — shared helper.
Used by both the wallet top-up flow (backend/routes/wallet.py) and the
nail salon deposit/renewal payment flow (backend/routes/nail.py) so both
systems share one implementation of the external gateway call.
"""
import logging
import re

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

TRUEMONEY_API = "https://gateway.autozy.app/api/giftvoucher/{code}/{phone}/"

TRUEMONEY_ERROR_MESSAGES = {
    "100": "ซองนี้ถูกใช้งานแล้ว",
    "101": "ไม่พบซองของขวัญ",
    "102": "ไม่สามารถใช้ซองของตัวเองได้",
    "103": "ซองนี้รับไปแล้ว",
    "104": "ข้อมูลไม่ถูกต้อง",
    "105": "ซองหมดอายุแล้ว",
}

DEFAULT_PHONE_PLACEHOLDER = "0800000000"


def extract_voucher_code(raw: str) -> str:
    """แยกรหัสซองจากลิงก์เต็ม (เช่น https://gift.truemoney.com/campaign/?v=XXXX) หรือรับรหัสตรงๆ"""
    raw = (raw or "").strip()
    match = re.search(r"[?&]v=([A-Za-z0-9]+)", raw)
    if match:
        return match.group(1)
    if re.match(r"^[A-Za-z0-9]+$", raw):
        return raw
    raise HTTPException(status_code=400, detail="รูปแบบลิงก์ซองไม่ถูกต้อง กรุณาวาง link เต็มหรือรหัสซอง")


async def redeem_voucher(code: str, phone: str = DEFAULT_PHONE_PLACEHOLDER) -> dict:
    """
    เรียก TrueMoney gateway API เพื่อแลกซองอั่งเปา
    คืนค่า: {"success": bool, "amount": float | None, "raw": dict, "error_message": str | None}
    ไม่ raise exception เอง — caller ตัดสินใจว่าจะ fallback อย่างไรเมื่อเรียก API ไม่สำเร็จ
    """
    url = TRUEMONEY_API.format(code=code, phone=phone)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(url)
        data = resp.json()

    if data.get("status") == "SUCCESS":
        credit_raw = data.get("data", {}).get("voucher", {}).get("redeemAmount") or data.get("amount")
        if credit_raw:
            return {"success": True, "amount": float(credit_raw), "raw": data, "error_message": None}
        err_code = str(data.get("code", ""))
        err_msg = TRUEMONEY_ERROR_MESSAGES.get(err_code, data.get("message", "แลกซองไม่สำเร็จ"))
        return {"success": False, "amount": None, "raw": data, "error_message": err_msg}

    err_code = str(data.get("code", ""))
    err_msg = TRUEMONEY_ERROR_MESSAGES.get(err_code, data.get("message", "แลกซองไม่สำเร็จ"))
    return {"success": False, "amount": None, "raw": data, "error_message": err_msg}
