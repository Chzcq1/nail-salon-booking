import base64
import logging
import os
import uuid

from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)
router = APIRouter()

SLIPS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "slips")
os.makedirs(SLIPS_DIR, exist_ok=True)

MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/upload/slip")
async def upload_slip(body: dict):
    """
    รับรูปสลิปเป็น base64 data URI → บันทึกเป็นไฟล์บนดิสก์ → คืน URL path
    Body : {"data": "data:image/jpeg;base64,..."}
    Return: {"url": "/uploads/slips/xxxxxxxx.jpg", "size": 123456}
    """
    data = body.get("data", "")
    if not data:
        raise HTTPException(status_code=400, detail="ไม่พบข้อมูลรูปภาพ")

    if "," in data:
        header, b64 = data.split(",", 1)
        ext = "jpg"
        if "png" in header:
            ext = "png"
        elif "gif" in header:
            ext = "gif"
        elif "webp" in header:
            ext = "webp"
    else:
        b64 = data
        ext = "jpg"

    try:
        img_bytes = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=400, detail="รูปภาพไม่ถูกต้อง (base64 error)")

    if len(img_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="รูปภาพใหญ่เกิน 5MB")

    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(SLIPS_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(img_bytes)

    url = f"/uploads/slips/{filename}"
    logger.info(f"Slip saved: {url} ({len(img_bytes):,} bytes)")
    return {"url": url, "size": len(img_bytes)}
