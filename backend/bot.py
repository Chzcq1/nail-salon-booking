import logging
import base64
import io
from typing import Optional
from backend.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

_bot = None
_otp_bot = None


def get_bot():
    global _bot
    if _bot is None:
        if not settings.bot_token:
            raise RuntimeError("BOT_TOKEN is not configured. Set the BOT_TOKEN environment variable.")
        from telegram import Bot
        _bot = Bot(token=settings.bot_token)
    return _bot


def get_otp_bot():
    """Return the OTP-only bot. Falls back to the main bot if OTP_BOT_TOKEN is not set."""
    global _otp_bot
    if settings.otp_bot_token:
        if _otp_bot is None:
            from telegram import Bot
            _otp_bot = Bot(token=settings.otp_bot_token)
        return _otp_bot
    return get_bot()


def _parse_admin_group() -> tuple[int, Optional[int]]:
    """
    Parse ADMIN_GROUP_ID into (chat_id, thread_id).

    Supports two formats:
      • "-1001234567"        → plain group  → (−1001234567, None)
      • "-1001234567_3"      → topic/thread → (−1001234567, 3)

    The underscore separates the group chat_id from the message_thread_id
    (Telegram Topics / Forum threads).
    """
    raw = settings.admin_group_id
    if not raw:
        return 0, None
    raw = raw.strip()
    if "_" in raw:
        # handle negative group IDs: "-1001234567_3"
        # find the LAST underscore to split thread id
        last = raw.rfind("_")
        chat_part = raw[:last]
        thread_part = raw[last + 1:]
        try:
            return int(chat_part), int(thread_part)
        except ValueError:
            logger.warning(f"Could not parse ADMIN_GROUP_ID '{raw}' — using as plain chat_id")
            return int(raw.replace("_", "")), None
    return int(raw), None


async def send_approval_request(
    order_id: int,
    product_name: str,
    customer_id: int,
    customer_username: Optional[str],
    customer_first_name: Optional[str],
    payment_proof: str,
    payment_type: str,
) -> Optional[int]:
    if not settings.bot_token or not settings.admin_group_id:
        logger.warning("Bot not configured — skipping admin notification")
        return None

    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    from telegram.error import TelegramError

    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    display_name = customer_first_name or customer_username or (f"ID:{customer_id}" if customer_id else "ไม่ระบุ")
    username_str = f"@{customer_username}" if customer_username else "ไม่มี username"
    proof_label = "สลีปโอนเงิน" if payment_type == "slip" else "ลิงก์ TrueMoney"
    customer_info = f"ID: {customer_id}" if customer_id else "ไม่มี Telegram ID"

    caption = (
        f"🛒 ออเดอร์ใหม่ #{order_id}\n\n"
        f"👤 ลูกค้า: {display_name}\n"
        f"📱 Telegram: {username_str}\n"
        f"🔑 {customer_info}\n"
        f"📦 สินค้า: {product_name}\n"
        f"💳 ประเภทการชำระ: {proof_label}"
    )

    keyboard = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("✅ อนุมัติ", callback_data=f"approve:{order_id}"),
            InlineKeyboardButton("❌ ปฏิเสธ", callback_data=f"reject:{order_id}"),
        ]
    ])

    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}

    try:
        if payment_type == "slip" and payment_proof.startswith("data:image"):
            header, b64data = payment_proof.split(",", 1)
            image_bytes = base64.b64decode(b64data)
            photo_file = io.BytesIO(image_bytes)
            photo_file.name = f"slip_order_{order_id}.jpg"
            msg = await bot.send_photo(
                chat_id=_chat_id,
                photo=photo_file,
                caption=caption,
                reply_markup=keyboard,
                **extra_kwargs,
            )
        elif payment_type == "truemoney":
            text = caption + f"\n\n🔗 ลิงก์: {payment_proof}"
            msg = await bot.send_message(
                chat_id=_chat_id,
                text=text,
                reply_markup=keyboard,
                **extra_kwargs,
            )
        else:
            msg = await bot.send_message(
                chat_id=_chat_id,
                text=caption + f"\n\n{proof_label}: {payment_proof}",
                reply_markup=keyboard,
                **extra_kwargs,
            )
        return msg.message_id
    except TelegramError as e:
        logger.error(f"Failed to send approval request: {e}")
        return None


async def generate_invite_links(order_id: int, group_ids_str: str) -> list[str]:
    """สร้างลิงก์เชิญสำหรับกลุ่ม Telegram ทั้งหมด (ใช้ครั้งเดียว) — ไม่ต้องส่ง DM"""
    if not settings.bot_token:
        logger.warning("Bot not configured — cannot create invite links")
        return []

    from telegram.error import TelegramError
    bot = get_bot()

    group_ids = [g.strip() for g in group_ids_str.split(",") if g.strip()]
    invite_links = []

    for group_id in group_ids:
        try:
            link = await bot.create_chat_invite_link(
                chat_id=int(group_id),
                member_limit=1,
                name=f"Order #{order_id}",
            )
            invite_links.append(link.invite_link)
            logger.info(f"Created invite link for order #{order_id}, group {group_id}")
        except TelegramError as e:
            logger.error(f"Failed to create invite link for group {group_id}: {e}")

    return invite_links


async def approve_order(order_id: int, customer_id: int, group_ids_str: str) -> bool:
    """ส่งลิงก์เข้ากลุ่มให้ลูกค้าทาง DM (ใช้เมื่อมี telegram_user_id)"""
    if not settings.bot_token:
        return False
    if not customer_id:
        return False

    from telegram.error import TelegramError
    bot = get_bot()

    invite_links = await generate_invite_links(order_id, group_ids_str)

    if invite_links:
        links_text = "\n".join(invite_links)
        message = (
            f"✅ ออเดอร์ #{order_id} ได้รับการอนุมัติแล้ว!\n\n"
            f"🔗 ลิงก์เข้ากลุ่ม (ใช้ได้ครั้งเดียว — ห้ามแชร์):\n\n{links_text}"
        )
    else:
        message = f"✅ ออเดอร์ #{order_id} ได้รับการอนุมัติแล้ว! ติดต่อแอดมินเพื่อรับลิงก์เข้ากลุ่ม"

    try:
        await bot.send_message(chat_id=customer_id, text=message)
        return True
    except TelegramError as e:
        logger.error(f"Failed to send DM to {customer_id}: {e}")
        return False


async def reject_order(order_id: int, customer_id: int) -> bool:
    if not settings.bot_token:
        return False

    if not customer_id:
        logger.warning(f"No Telegram user_id for order #{order_id} — cannot DM customer")
        return False

    from telegram.error import TelegramError
    bot = get_bot()

    try:
        await bot.send_message(
            chat_id=customer_id,
            text=(
                f"❌ ออเดอร์ #{order_id} ไม่ได้รับการอนุมัติ\n\n"
                f"กรุณาตรวจสอบข้อมูลการชำระเงินแล้วลองใหม่ หรือติดต่อแอดมิน"
            ),
        )
        return True
    except TelegramError as e:
        logger.error(f"Failed to send rejection DM to {customer_id}: {e}")
        return False


async def send_otp(telegram_id: int, otp_code: str) -> tuple[bool, str]:
    """Returns (success, error_message). error_message is empty string on success."""
    if not settings.bot_token:
        msg = "BOT_TOKEN ไม่ได้ตั้งค่า"
        logger.warning(msg)
        return False, msg
    if not settings.admin_group_id:
        msg = "ADMIN_GROUP_ID ไม่ได้ตั้งค่า"
        logger.warning(msg)
        return False, msg

    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}

    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"🔐 คำขอเข้าสู่ระบบแอดมิน\n\n"
                f"รหัส OTP: <b>{otp_code}</b>\n\n"
                f"⏰ หมดอายุใน 5 นาที"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
        return True, ""
    except TelegramError as e:
        logger.error(f"Failed to send OTP: {e}")
        return False, str(e)


async def send_finance_notification(action: str, description: str, amount: float, admin_name: str) -> bool:
    if not settings.bot_token or not settings.admin_group_id:
        return False
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    sign = "+" if amount >= 0 else ""
    emoji = "💰" if amount >= 0 else "💸"
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"{emoji} <b>{action}</b>\n\n"
                f"📝 {description}\n"
                f"👤 แอดมิน: {admin_name}\n"
                f"💵 จำนวน: {sign}฿{abs(amount):,.2f}"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
        return True
    except TelegramError as e:
        logger.error(f"Failed to send finance notification: {e}")
        return False


async def send_topup_failed(
    topup_id: int,
    customer_email: str,
    topup_type: str,
    reason: str,
    amount_hint: float | None = None,
    voucher_code: Optional[str] = None,
) -> None:
    """
    แจ้งแอดมินกลุ่มทันทีเมื่อลูกค้าเติมเงินไม่ผ่าน (สลิปปฏิเสธ / ซองมีปัญหา)
    แยกออกจาก send_topup_request เพื่อให้แอดมินรู้ว่าเป็นการ 'ตรวจสอบไม่ผ่าน' ไม่ใช่แค่ 'รอตรวจ'
    """
    if not settings.bot_token or not settings.admin_group_id:
        return
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    type_label = "📸 สลีปโอนเงิน" if topup_type == "slip" else "🧧 ซองอั่งเปา TrueMoney"
    amount_str = f"฿{amount_hint:,.0f}" if amount_hint else "ไม่ทราบยอด"
    voucher_str = f"\n🔑 Voucher: <code>{voucher_code}</code>" if voucher_code else ""
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"⚠️ <b>เติมเงินไม่สำเร็จ #{topup_id}</b>\n\n"
                f"👤 ลูกค้า: <code>{customer_email}</code>\n"
                f"ประเภท: {type_label}\n"
                f"ยอด: {amount_str}"
                f"{voucher_str}\n\n"
                f"❌ สาเหตุ: <b>{reason}</b>\n\n"
                f"📋 ตรวจสอบเพิ่มเติมได้ในแผงแอดมิน (Topup #{topup_id})"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
    except TelegramError as e:
        logger.error(f"Failed to send topup failed notification: {e}")


async def send_topup_request(
    topup_id: int,
    customer_username: str,
    amount_hint: float | None,
    topup_type: str,
    voucher_code: Optional[str] = None,
) -> None:
    if not settings.bot_token or not settings.admin_group_id:
        logger.warning("Bot not configured — skipping topup notification")
        return
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    type_label = "สลีปโอนเงิน" if topup_type == "slip" else "🧧 ซองอั่งเปา TrueMoney"
    amount_str = f"฿{amount_hint:,.0f}" if amount_hint else "ไม่ระบุ"
    extra = f"\n🔑 Voucher: <code>{voucher_code}</code>" if voucher_code else ""
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"💳 <b>คำขอเติมเครดิตใหม่ #{topup_id}</b>\n\n"
                f"👤 @{customer_username}\n"
                f"ประเภท: {type_label}\n"
                f"จำนวน: {amount_str}"
                f"{extra}\n\n"
                f"กรุณาตรวจสอบและอนุมัติในแผงแอดมิน"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
    except TelegramError as e:
        logger.error(f"Failed to send topup notification: {e}")


async def send_topup_success(
    topup_id: int,
    customer_username: str,
    amount: float,
    topup_type: str,
    voucher_code: Optional[str] = None,
) -> None:
    if not settings.bot_token or not settings.admin_group_id:
        return
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    type_label = "สลีปโอนเงิน" if topup_type == "slip" else "🧧 ซองอั่งเปา TrueMoney"
    extra = f"\n🔑 Voucher: <code>{voucher_code}</code>" if voucher_code else ""
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"✅ <b>เติมเครดิตอัตโนมัติสำเร็จ #{topup_id}</b>\n\n"
                f"👤 @{customer_username}\n"
                f"ประเภท: {type_label}\n"
                f"ยอด: ฿{amount:,.2f}"
                f"{extra}"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
    except TelegramError as e:
        logger.error(f"Failed to send topup success notification: {e}")


async def send_gafiw_purchase(
    customer_email: str,
    product_name: str,
    sell_price: float,
    actual_cost: float | None,
    profit: float,
    gafiw_balance_after: float | None,
) -> bool:
    """แจ้งแอดมินกลุ่มเมื่อลูกค้าซื้อสินค้า Gafiw"""
    if not settings.bot_token or not settings.admin_group_id:
        return False
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    cost_line = f"\n💸 ต้นทุน Gafiw: ฿{actual_cost:,.2f}" if actual_cost is not None else "\n💸 ต้นทุน Gafiw: ไม่ทราบ"
    balance_line = f"\n🏦 คงเหลือ Gafiw: ฿{gafiw_balance_after:,.2f}" if gafiw_balance_after is not None else ""
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"🛒 <b>ซื้อสินค้า Gafiw</b>\n\n"
                f"👤 ลูกค้า: <code>{customer_email}</code>\n"
                f"📦 สินค้า: {product_name}\n"
                f"💰 ราคาขาย: ฿{sell_price:,.2f}"
                f"{cost_line}\n"
                f"📈 กำไร: <b>฿{profit:,.2f}</b>"
                f"{balance_line}"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
        return True
    except TelegramError as e:
        logger.error(f"Failed to send gafiw purchase notification: {e}")
        return False


async def send_topup_admin_notify(
    topup_id: int,
    customer_identifier: str,
    amount: float,
    topup_type: str,
) -> None:
    """แจ้งแอดมินกลุ่มเมื่อลูกค้าเติมเงิน (ทั้งรอตรวจสอบและสำเร็จอัตโนมัติ)"""
    if not settings.bot_token or not settings.admin_group_id:
        return
    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}
    type_label = "📸 สลีปโอนเงิน" if topup_type == "slip" else "🧧 ซองอั่งเปา TrueMoney"
    try:
        await bot.send_message(
            chat_id=_chat_id,
            text=(
                f"💳 <b>คำขอเติมเครดิต #{topup_id}</b>\n\n"
                f"👤 ลูกค้า: <code>{customer_identifier}</code>\n"
                f"ประเภท: {type_label}\n"
                f"💵 ยอด: ฿{amount:,.2f}\n\n"
                f"กรุณาตรวจสอบและอนุมัติในแผงแอดมิน"
            ),
            parse_mode="HTML",
            **extra_kwargs,
        )
    except TelegramError as e:
        logger.error(f"Failed to send topup admin notify: {e}")


async def send_wallet_otp(chat_id: int, otp_code: str, username: str) -> bool:
    """Send OTP via DM for wallet registration. Uses OTP bot if configured, else main bot."""
    if not settings.otp_bot_token and not settings.bot_token:
        logger.warning("Neither OTP_BOT_TOKEN nor BOT_TOKEN set — cannot send wallet OTP")
        return False
    bot = get_otp_bot()
    from telegram.error import TelegramError
    try:
        await bot.send_message(
            chat_id=chat_id,
            text=(
                f"🔐 <b>รหัส OTP กระเป๋าเครดิต</b>\n\n"
                f"สวัสดีคุณ @{username}!\n\n"
                f"รหัสยืนยันตัวตนของคุณคือ:\n\n"
                f"<code>{otp_code}</code>\n\n"
                f"⏰ ใช้ได้ภายใน 10 นาที\n"
                f"⚠️ อย่าบอกรหัสนี้กับใครเด็ดขาด"
            ),
            parse_mode="HTML",
        )
        return True
    except TelegramError as e:
        logger.error(f"Failed to send wallet OTP to chat {chat_id}: {e}")
        return False


async def send_nail_slip_notify(
    booking_ref: str,
    customer_name: str,
    customer_phone: str,
    customer_line: Optional[str],
    slot_date: str,
    start_time: str,
    end_time: str,
    service_name: Optional[str],
    deposit_total: float,
    payment_proof: str,
    slip_verify_status: Optional[str] = None,
) -> None:
    """
    แจ้งแอดมินกลุ่มทันทีเมื่อลูกค้าส่งสลิปนัดทำเล็บ
    ส่งรูปสลิปพร้อมข้อมูลการจอง
    """
    import html as _html

    if not settings.bot_token or not settings.admin_group_id:
        logger.warning("Bot not configured — skipping nail slip notification")
        return

    from telegram.error import TelegramError
    bot = get_bot()
    _chat_id, _thread_id = _parse_admin_group()
    extra_kwargs = {"message_thread_id": _thread_id} if _thread_id else {}

    # Escape all user-supplied fields to prevent HTML injection in Telegram HTML mode
    esc = _html.escape
    safe_ref = esc(booking_ref)
    safe_name = esc(customer_name)
    safe_phone = esc(customer_phone)
    safe_line = esc(customer_line) if customer_line else "ไม่มี"
    safe_date = esc(slot_date)
    safe_start = esc(start_time)
    safe_end = esc(end_time)
    safe_service = esc(service_name) if service_name else "ไม่ระบุ"

    # Map actual slip_verify.py status values → emoji + Thai label
    _STATUS_MAP = {
        "verified":         ("✅", "ผ่านอัตโนมัติ"),
        "failed":           ("❌", "ไม่ผ่านการตรวจ"),
        "wrong_receiver":   ("❌", "บัญชีผู้รับไม่ถูกต้อง"),
        "amount_mismatch":  ("⚠️", "ยอดโอนไม่ตรง"),
        "duplicate":        ("⚠️", "สลิปซ้ำ"),
        "expired":          ("⚠️", "สลิปหมดอายุ"),
        "no_config":        ("⚙️", "ไม่ได้ตั้งค่า Slip2Go"),
        "error":            ("⚠️", "เกิดข้อผิดพลาด"),
    }
    if slip_verify_status:
        emoji, label = _STATUS_MAP.get(slip_verify_status, ("🔍", esc(slip_verify_status)))
        verify_str = f"\n{emoji} ตรวจสลิป: {label}"
    else:
        verify_str = ""

    caption = (
        f"📸 <b>สลิปใหม่ — {safe_ref}</b>\n\n"
        f"👤 ชื่อ: {safe_name}\n"
        f"📞 เบอร์: {safe_phone}\n"
        f"💬 LINE: {safe_line}\n\n"
        f"📅 วันที่: {safe_date}\n"
        f"🕐 เวลา: {safe_start} – {safe_end}\n"
        f"💅 บริการ: {safe_service}\n"
        f"💵 มัดจำ: ฿{deposit_total:,.2f}"
        f"{verify_str}"
    )

    try:
        if payment_proof and payment_proof.startswith("data:image"):
            try:
                _header, b64data = payment_proof.split(",", 1)
                image_bytes = base64.b64decode(b64data)
                photo_file = io.BytesIO(image_bytes)
                photo_file.name = f"slip_{booking_ref}.jpg"
                await bot.send_photo(
                    chat_id=_chat_id,
                    photo=photo_file,
                    caption=caption,
                    parse_mode="HTML",
                    **extra_kwargs,
                )
                return
            except (ValueError, base64.binascii.Error) as decode_err:
                logger.warning(f"Slip image decode failed, falling back to text: {decode_err}")

        # ไม่มีรูป หรือ decode ล้มเหลว → ส่งแค่ข้อความ
        text = caption
        if payment_proof and not payment_proof.startswith("data:"):
            text += f"\n\n🔗 สลิป: {esc(payment_proof)}"
        await bot.send_message(
            chat_id=_chat_id,
            text=text,
            parse_mode="HTML",
            **extra_kwargs,
        )
    except TelegramError as e:
        logger.error(f"Failed to send nail slip notification: {e}")


async def setup_webhook(webhook_url: str) -> bool:
    if not settings.bot_token:
        logger.warning("BOT_TOKEN not set — skipping webhook setup")
        return False

    from telegram.error import TelegramError
    bot = get_bot()

    try:
        await bot.set_webhook(url=webhook_url)
        logger.info(f"Main bot webhook set to {webhook_url}")
        return True
    except TelegramError as e:
        logger.error(f"Failed to set main bot webhook: {e}")
        return False


async def setup_otp_webhook(webhook_url: str) -> bool:
    """Register webhook for the OTP-only bot at /webhook-otp."""
    if not settings.otp_bot_token:
        logger.info("OTP_BOT_TOKEN not set — skipping OTP bot webhook setup")
        return False

    from telegram.error import TelegramError
    otp_url = webhook_url.rstrip("/").replace("/webhook", "") + "/webhook-otp"
    bot = get_otp_bot()

    try:
        await bot.set_webhook(url=otp_url)
        logger.info(f"OTP bot webhook set to {otp_url}")
        return True
    except TelegramError as e:
        logger.error(f"Failed to set OTP bot webhook: {e}")
        return False
