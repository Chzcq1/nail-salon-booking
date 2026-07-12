import base64
import logging

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/upload/slip")
async def upload_slip(body: dict):
    """
    รับรูปสลิปเป็น base64 data URI → ตรวจสอบขนาด/รูปแบบ → คืน data URI เดิมกลับไปตรงๆ

    เดิม endpoint นี้เซฟไฟล์ลงดิสก์ของเซิร์ฟเวอร์แล้วคืน URL path (/uploads/slips/xxx.jpg)
    แต่ Render (โฮสต์จริงของโปรเจกต์) ใช้ filesystem แบบ ephemeral — ไฟล์หายทุกครั้งที่
    redeploy/restart หรือกระจาย request ไปคนละ instance ทำให้สลิปที่ลูกค้าส่งมา "หาย" จาก
    หลังบ้านแอดมิน (แม้ request จะถูกบันทึกใน DB แล้วก็ตาม) จึงเปลี่ยนมาคืน data URI ตรงๆ
    เพื่อให้ payment_proof ที่บันทึกใน DB (Neon, ถาวร) มีรูปสลิปแนบอยู่ในตัวเอง ไม่พึ่งดิสก์เลย
    ทั้ง <img src=...> ในหน้าแอดมินและ Slip2Go verify() รองรับ data URI อยู่แล้วโดยไม่ต้องแก้จุดอื่น

    Body : {"data": "data:image/jpeg;base64,..."}
    Return: {"url": "data:image/jpeg;base64,...", "size": 123456}
    """
    data = body.get("data", "")
    if not data:
        raise HTTPException(status_code=400, detail="ไม่พบข้อมูลรูปภาพ")

    if "," in data:
        header, b64 = data.split(",", 1)
        mime = "image/jpeg"
        if "png" in header:
            mime = "image/png"
        elif "gif" in header:
            mime = "image/gif"
        elif "webp" in header:
            mime = "image/webp"
    else:
        b64 = data
        mime = "image/jpeg"

    try:
        img_bytes = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=400, detail="รูปภาพไม่ถูกต้อง (base64 error)")

    if len(img_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="รูปภาพใหญ่เกิน 5MB")

    data_uri = f"data:{mime};base64,{b64}"
    logger.info(f"Slip received: {len(img_bytes):,} bytes (stored inline, no disk)")

    return {"url": data_uri, "size": len(img_bytes)}
