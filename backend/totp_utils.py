"""
TOTP (Time-based One-Time Password) utilities — ใช้กับ Google Authenticator
pyotp + qrcode ต้องติดตั้งแล้ว (pip install pyotp qrcode[pil])
"""
import io
import base64
import pyotp
import qrcode


def generate_totp_secret() -> str:
    """สร้าง random base32 secret สำหรับ TOTP ใหม่"""
    return pyotp.random_base32()


def get_totp_uri(secret: str, account_name: str, issuer: str = "CSC System") -> str:
    """สร้าง provisioning URI สำหรับ QR Code ที่ Google Authenticator อ่านได้"""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=account_name, issuer_name=issuer)


def get_qr_code_base64(uri: str) -> str:
    """Render QR Code จาก URI แล้วคืนกลับเป็น base64 PNG data URI"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=8,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return "data:image/png;base64," + base64.b64encode(buf.read()).decode()


def verify_totp(secret: str, code: str) -> bool:
    """ตรวจสอบ TOTP code — อนุญาต valid_window=1 สำหรับ clock drift เล็กน้อย"""
    if not secret or not code:
        return False
    totp = pyotp.TOTP(secret)
    return totp.verify((code or "").strip(), valid_window=1)
