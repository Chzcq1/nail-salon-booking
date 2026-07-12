import asyncio
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)

OTP_HTML_TEMPLATE = """
<html>
<body style="margin:0;padding:0;background:#0f172a;font-family:sans-serif;">
  <div style="max-width:420px;margin:40px auto;background:#1e293b;border-radius:16px;
              padding:36px 32px;border:1px solid #334155;">
    <h2 style="color:#f1f5f9;margin:0 0 6px 0;font-size:20px;">รหัส OTP</h2>
    <p style="color:#94a3b8;margin:0 0 28px 0;font-size:14px;">สำหรับยืนยันตัวตนบนกระเป๋าเครดิต</p>
    <div style="background:#0f172a;border-radius:12px;padding:28px;text-align:center;
                margin-bottom:24px;border:1px solid #334155;">
      <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#a78bfa;">
        {otp_code}
      </span>
    </div>
    <p style="color:#64748b;font-size:13px;margin:0;">
      รหัสนี้จะหมดอายุใน <strong style="color:#94a3b8;">10 นาที</strong>
      &mdash; กรุณาอย่าเปิดเผยรหัสนี้ให้ใคร
    </p>
  </div>
</body>
</html>
"""


async def _send_via_resend(to_email: str, otp_code: str, api_key: str, from_email: str) -> bool:
    html = OTP_HTML_TEMPLATE.format(otp_code=otp_code)
    text = f"รหัส OTP ของคุณคือ: {otp_code}\n\nรหัสนี้จะหมดอายุใน 10 นาที อย่าเปิดเผยรหัสนี้ให้ใคร"

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": f"รหัส OTP: {otp_code} — กระเป๋าเครดิต",
        "html": html,
        "text": text,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code in (200, 201):
        logger.info("ส่งอีเมล OTP ผ่าน Resend สำเร็จ")
        return True

    error_body = resp.text
    logger.error("Resend API error %s: %s", resp.status_code, error_body)
    raise RuntimeError(f"ส่งอีเมลไม่สำเร็จ (Resend {resp.status_code}): {error_body}")


async def _send_via_smtp(to_email: str, otp_code: str) -> bool:
    settings = get_settings()
    html = OTP_HTML_TEMPLATE.format(otp_code=otp_code)
    text = f"รหัส OTP ของคุณคือ: {otp_code}\n\nรหัสนี้จะหมดอายุใน 10 นาที อย่าเปิดเผยรหัสนี้ให้ใคร"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"รหัส OTP: {otp_code} — กระเป๋าเครดิต"
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    def _send():
        port = settings.smtp_port or 587
        ctx = ssl.create_default_context()
        SMTP_TIMEOUT = 15
        if port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, port, context=ctx, timeout=SMTP_TIMEOUT) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, port, timeout=SMTP_TIMEOUT) as server:
                server.ehlo()
                server.starttls(context=ctx)
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        return True

    return await asyncio.to_thread(_send)


async def _send_via_brevo(to_email: str, otp_code: str, api_key: str, from_email: str) -> bool:
    html = OTP_HTML_TEMPLATE.format(otp_code=otp_code)
    text = f"รหัส OTP ของคุณคือ: {otp_code}\n\nรหัสนี้จะหมดอายุใน 10 นาที อย่าเปิดเผยรหัสนี้ให้ใคร"

    payload = {
        "sender": {"name": "กระเป๋าเครดิต", "email": from_email},
        "to": [{"email": to_email}],
        "subject": f"รหัส OTP: {otp_code} — กระเป๋าเครดิต",
        "htmlContent": html,
        "textContent": text,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )

    if resp.status_code in (200, 201):
        logger.info("ส่งอีเมล OTP ผ่าน Brevo สำเร็จ")
        return True

    error_body = resp.text
    logger.error("Brevo API error %s: %s", resp.status_code, error_body)
    raise RuntimeError(f"ส่งอีเมลไม่สำเร็จ (Brevo {resp.status_code}): {error_body}")


async def send_custom_email(to_email: str, subject: str, html: str, text: str) -> bool:
    """ส่งอีเมล custom content — subject/html/text กำหนดเองได้"""
    settings = get_settings()

    if settings.brevo_api_key:
        from_email = settings.smtp_from_email
        if not from_email:
            raise ValueError("กรุณาตั้งค่า SMTP_FROM_EMAIL")
        payload = {
            "sender": {"name": "CSC System", "email": from_email},
            "to": [{"email": to_email}],
            "subject": subject,
            "htmlContent": html,
            "textContent": text,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": settings.brevo_api_key, "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code in (200, 201, 202):
            return True
        logger.error("Brevo custom email error %s: %s", resp.status_code, resp.text)
        return False

    if settings.resend_api_key:
        from_email = settings.smtp_from_email or "onboarding@resend.dev"
        payload = {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": text,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code in (200, 201):
            return True
        logger.error("Resend custom email error %s: %s", resp.status_code, resp.text)
        return False

    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password, settings.smtp_from_email]):
        raise ValueError("ระบบอีเมลยังไม่ได้ตั้งค่า")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    def _send():
        port = settings.smtp_port or 587
        ctx = ssl.create_default_context()
        SMTP_TIMEOUT = 15
        if port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, port, context=ctx, timeout=SMTP_TIMEOUT) as server:
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        else:
            with smtplib.SMTP(settings.smtp_host, port, timeout=SMTP_TIMEOUT) as server:
                server.ehlo()
                server.starttls(context=ctx)
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.smtp_from_email, to_email, msg.as_string())
        return True

    return await asyncio.to_thread(_send)


async def send_otp_email(to_email: str, otp_code: str) -> bool:
    settings = get_settings()

    if settings.brevo_api_key:
        from_email = settings.smtp_from_email
        if not from_email:
            raise ValueError("กรุณาตั้งค่า SMTP_FROM_EMAIL เป็น Gmail ที่ verify แล้วใน Brevo")
        return await _send_via_brevo(to_email, otp_code, settings.brevo_api_key, from_email)

    if settings.resend_api_key:
        from_email = settings.smtp_from_email or "onboarding@resend.dev"
        return await _send_via_resend(to_email, otp_code, settings.resend_api_key, from_email)

    if not all([settings.smtp_host, settings.smtp_user, settings.smtp_password, settings.smtp_from_email]):
        raise ValueError(
            "ระบบอีเมลยังไม่ได้ตั้งค่า กรุณาติดต่อแอดมิน "
            "(ตั้งค่า BREVO_API_KEY + SMTP_FROM_EMAIL หรือ SMTP_HOST/USER/PASSWORD/FROM_EMAIL)"
        )

    return await _send_via_smtp(to_email, otp_code)
