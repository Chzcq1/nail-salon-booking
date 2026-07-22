from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional
from functools import lru_cache


class Settings(BaseSettings):
    bot_token: Optional[str] = Field(default=None)
    database_url: Optional[str] = Field(default=None)
    admin_group_id: Optional[str] = Field(default=None)
    bot_username: Optional[str] = Field(default=None)
    webhook_url: Optional[str] = Field(default=None)
    secret_key: Optional[str] = Field(default=None)
    admin_passcode: Optional[str] = Field(default=None)
    admin_telegram_ids: Optional[str] = Field(default=None)
    slip2go_api_key: Optional[str] = Field(default=None)

    smtp_host: Optional[str] = Field(default=None)
    smtp_port: int = Field(default=587)
    smtp_user: Optional[str] = Field(default=None)
    smtp_password: Optional[str] = Field(default=None)
    smtp_from_email: Optional[str] = Field(default=None)

    resend_api_key: Optional[str] = Field(default=None)
    brevo_api_key: Optional[str] = Field(default=None)

    gafiwshop_key_api: Optional[str] = Field(default=None)
    nail_super_admin_key: Optional[str] = Field(default=None)  # key สำหรับ super-admin ระบบเช่า

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


# ─── Startup secret validation ────────────────────────────────────────────────
_INSECURE_PLACEHOLDERS = {
    "changeme",
    "changeme-please-set-a-real-secret-key-32chars",
    "wallet-pin-secret-change-in-production",
    "change_this_to_a_random_secret_key_at_least_32_chars",
    "secret",
    "password",
}

def validate_required_secrets() -> None:
    """Call once at application startup.

    Raises RuntimeError if SECRET_KEY is missing or is a known insecure placeholder.
    All JWT tokens (wallet customer auth + legacy admin sessions) are signed with this key,
    so a weak or missing key compromises the entire authentication system.
    """
    s = get_settings()

    if not s.secret_key:
        raise RuntimeError(
            "ต้องตั้งค่า SECRET_KEY ใน environment variables ก่อนเริ่มแอปพลิเคชัน\n"
            "สร้างค่าสุ่ม: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

    if s.secret_key.lower().strip() in _INSECURE_PLACEHOLDERS or len(s.secret_key) < 32:
        raise RuntimeError(
            "SECRET_KEY ไม่ปลอดภัย: ต้องมีความยาวอย่างน้อย 32 ตัวอักษรและต้องไม่ใช่ค่าตัวอย่าง\n"
            "สร้างค่าสุ่ม: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
