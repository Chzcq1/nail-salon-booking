import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Banner
from backend.routes.admin import get_admin

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")


def _banner_dict(b: Banner) -> dict:
    return {
        "id": b.id,
        "title": b.title,
        "subtitle": b.subtitle,
        "image_url": b.image_url,
        "link_url": b.link_url,
        "is_active": b.is_active,
        "sort_order": b.sort_order,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


@router.get("/banners")
def list_banners_public(db: Session = Depends(get_db)):
    banners = (
        db.query(Banner)
        .filter(Banner.is_active == True)
        .order_by(Banner.sort_order, Banner.id)
        .all()
    )
    return [_banner_dict(b) for b in banners]


@router.get("/admin/banners")
def list_banners_admin(db: Session = Depends(get_db), admin: dict = Depends(get_admin)):
    banners = db.query(Banner).order_by(Banner.sort_order, Banner.id).all()
    return [_banner_dict(b) for b in banners]


@router.post("/admin/banners")
def create_banner(body: dict, db: Session = Depends(get_db), admin: dict = Depends(get_admin)):
    b = Banner(
        title=body.get("title") or None,
        subtitle=body.get("subtitle") or None,
        image_url=body.get("image_url") or None,
        link_url=body.get("link_url") or None,
        is_active=bool(body.get("is_active", True)),
        sort_order=int(body.get("sort_order", 0)),
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _banner_dict(b)


@router.put("/admin/banners/{banner_id}")
def update_banner(banner_id: int, body: dict, db: Session = Depends(get_db), admin: dict = Depends(get_admin)):
    b = db.query(Banner).filter(Banner.id == banner_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="ไม่พบแบนเนอร์")
    if "title" in body:
        b.title = body["title"] or None
    if "subtitle" in body:
        b.subtitle = body["subtitle"] or None
    if "image_url" in body:
        b.image_url = body["image_url"] or None
    if "link_url" in body:
        b.link_url = body["link_url"] or None
    if "is_active" in body:
        b.is_active = bool(body["is_active"])
    if "sort_order" in body:
        b.sort_order = int(body["sort_order"])
    db.commit()
    db.refresh(b)
    return _banner_dict(b)


@router.delete("/admin/banners/{banner_id}")
def delete_banner(banner_id: int, db: Session = Depends(get_db), admin: dict = Depends(get_admin)):
    b = db.query(Banner).filter(Banner.id == banner_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="ไม่พบแบนเนอร์")
    db.delete(b)
    db.commit()
    return {"ok": True}


@router.post("/admin/banners/upload-image")
async def upload_banner_image(
    file: UploadFile = File(...),
    admin: dict = Depends(get_admin),
):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="รองรับเฉพาะไฟล์รูป (JPEG, PNG, WebP, GIF)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    filename = f"banner_{uuid.uuid4().hex}.{ext}"
    dest = os.path.join(UPLOADS_DIR, filename)
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/uploads/{filename}"}
