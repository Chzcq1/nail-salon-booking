import base64
import logging

from fastapi import APIRouter, Depends, HTTPException
from backend import storage
from backend.routes.admin import get_admin

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _decode_base64(data: str) -> tuple[bytes, str, str]:
    """
    Parse a base64 data URI (or raw base64 string).

    Returns:
        (raw_bytes, mime_type, file_extension)
    Raises:
        HTTPException 400 on invalid base64.
    """
    if "," in data:
        header, b64 = data.split(",", 1)
        mime, ext = storage.mime_and_ext(header)
    else:
        b64 = data
        mime, ext = "image/jpeg", ".jpg"

    try:
        img_bytes = base64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=400, detail="รูปภาพไม่ถูกต้อง (base64 error)")

    return img_bytes, mime, ext


@router.post("/upload/slip")
async def upload_slip(body: dict):
    """
    รับรูปเป็น base64 data URI → validate → อัปโหลดไป object storage (R2/S3) → คืน URL สาธารณะ

    เมื่อตั้งค่า S3_* env vars แล้ว:
      - รูปถูก upload ไปยัง object storage
      - DB จะเก็บแค่ URL (https://...) — ไม่มี base64 ใน DB อีกต่อไป

    กรณียังไม่ตั้ง S3_* (dev/local):
      - คืน data URI เดิมกลับไป (backward compatible)

    Body : {"data": "data:image/jpeg;base64,..."}
    Return: {"url": "https://...", "size": 123456}
            หรือ {"url": "data:image/jpeg;base64,...", "size": ...} ถ้า storage ไม่ได้ตั้ง
    """
    data = (body.get("data") or "").strip()
    if not data:
        raise HTTPException(status_code=400, detail="ไม่พบข้อมูลรูปภาพ")

    img_bytes, mime, ext = _decode_base64(data)

    if len(img_bytes) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="รูปภาพใหญ่เกิน 5MB")

    if storage.is_configured():
        try:
            url = storage.upload_bytes(img_bytes, mime, folder="slips", extension=ext)
            logger.info("Slip uploaded to storage: %d bytes → %s", len(img_bytes), url)
            return {"url": url, "size": len(img_bytes)}
        except Exception as exc:
            logger.error("Storage upload failed: %s", exc)
            raise HTTPException(status_code=500, detail="อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่")
    else:
        # Dev/local fallback — return data URI when storage is not configured
        logger.info(
            "Storage not configured — returning data URI (%d bytes, no disk write)",
            len(img_bytes),
        )
        b64 = data.split(",", 1)[1] if "," in data else data
        return {"url": f"data:{mime};base64,{b64}", "size": len(img_bytes)}


@router.post("/upload/delete")
async def delete_image(body: dict, _admin: dict = Depends(get_admin)):
    """
    ลบรูปจาก object storage — เฉพาะแอดมินเท่านั้น

    ใช้เมื่อ admin ลบ announcement / เปลี่ยนรูปในฟอร์ม
    URL ที่ไม่ใช่ของ storage เรา (เช่น data:image/ หรือ URL ภายนอก) จะถูกข้ามไปเงียบๆ

    Body: {"url": "https://..."}
    """
    url = (body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="ต้องระบุ URL รูปภาพ")

    if not url.startswith("https://"):
        # data URI or other non-storage value — nothing to delete
        return {"ok": True, "skipped": True}

    storage.delete_url(url)
    return {"ok": True}
