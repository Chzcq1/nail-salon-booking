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
    secret_key: str = Field(default="changeme-please-set-a-real-secret-key-32chars")
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
