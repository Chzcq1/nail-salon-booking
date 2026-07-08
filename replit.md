# Digital Product Store (ร้านสินค้าดิจิทัล)

ร้านค้าออนไลน์ภาษาไทยสำหรับขายสินค้าดิจิทัล เช่น Netflix, Disney+, YouKu พร้อมระบบกระเป๋าเครดิต และดึงสินค้าจาก gafiwshop.xyz API

---

## 🔴 บันทึกสำคัญ — อ่านก่อนทำงานทุกครั้ง

| ข้อ | รายละเอียด |
|---|---|
| 🚀 **Deploy แล้ว** | โปรเจกต์ถูก deploy บน **Render** อยู่แล้ว ใช้งานจริงในโปรดักชัน |
| 🔑 **Secrets อยู่บน Render** | API Keys, Tokens, Passwords ทั้งหมดถูกตั้งไว้ใน Render Environment Variables — **ไม่ต้องขอจากเจ้าของร้าน** |
| 🗄️ **ฐานข้อมูล** | ใช้ **Neon.tech** (PostgreSQL serverless) — `DATABASE_URL` ตั้งอยู่บน Render แล้ว |
| ✏️ **บทบาท Replit** | Replit มีหน้าที่ **เขียน / แก้ไข / เพิ่มโค้ดเท่านั้น** — ไม่ต้องรัน server, ไม่ต้องขอ key ใดๆ หากไม่จำเป็นจริงๆ |

> ⚠️ **ห้ามฝัง API Key / Token ใดๆ ลงในโค้ดโดยตรง** — secrets ทั้งหมดต้องอ้างอิงผ่าน environment variables เท่านั้น

---

## บทบาทของ Replit Agent

Replit มีหน้าที่:
- **อ่านและวิเคราะห์โค้ด** — ทำความเข้าใจโครงสร้างก่อนแก้ไขทุกครั้ง
- **เสนอความคิดและแนวทาง** — แนะนำวิธีที่ดีที่สุดตามบริบทของโปรเจกต์
- **แก้ไขโค้ดที่ผิดพลาด** — debug และแก้ไขปัญหาอย่างรวดเร็ว
- **เพิ่มฟีเจอร์ใหม่** — ตามที่เจ้าของร้านต้องการ

**ไม่ใช่หน้าที่ของ Replit:**
- ❌ ขอ API Key / Token / Password จากเจ้าของร้าน (มีอยู่บน Render แล้ว)
- ❌ รัน production server หรือ deploy เอง
- ❌ แตะต้อง environment variables บน Render

---

## Infrastructure

| ชั้น | บริการ |
|---|---|
| **Source code** | GitHub (private repo) |
| **Deploy / Hosting** | Render (Web Service) — **ที่นี่เก็บ secrets ทั้งหมด** |
| **Database** | **Neon.tech** (PostgreSQL serverless) |
| **Frontend build** | Vite + React (built by `build.sh`, served by FastAPI) |

---

## Run & Operate (Replit dev environment)

Two separate Replit workflows serve this app for dev/preview here: `Backend API` (defined in `.replit`, uvicorn on :8000 — this is what the `Project`/Run button starts) and `artifacts/store: web` (a Replit artifact workflow, Vite on its own assigned port, started/managed separately). If the frontend preview isn't loading, check whether `artifacts/store: web` is running and start it via the workflow tools if not. Restart either after dependency or code changes that require a reload.

`artifacts/api-server` and `artifacts/mockup-sandbox` show as failed/stopped — that's expected and non-blocking; see below.

```bash
# Manual equivalent, if ever needed outside the workflows
pnpm --filter @workspace/store run dev &
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### First-time setup (after a fresh clone / import)

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install JS/TS dependencies (all workspaces)
pnpm install
```

Both workflows (`Backend API` and `artifacts/store: web`) can then be started normally.

**Dev DB note**: In this Replit workspace, `DATABASE_URL` points at Replit's own local dev Postgres (auto-provisioned, empty), *not* the production Neon.tech database. This keeps dev/preview isolated from real customer data. `ADMIN_PASSCODE`, `GAFIWSHOP_KEY_API`, `SMTP_*`, `BOT_TOKEN` etc. are unset here, so admin login (`/nail-admin`, `/admin`), the Gafiw product catalog, and OTP email/Telegram flows won't work until those are provided as Replit secrets — ask before adding them, don't invent values.

The `artifacts/api-server` and `artifacts/mockup-sandbox` folders/workflows are unrelated platform scaffolding (not part of this app's real stack) and are left stopped.

---

## Stack

- **Backend**: Python 3.11, FastAPI, SQLAlchemy, psycopg2-binary
- **Frontend**: React 19, Vite 7, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Framer Motion
- **Monorepo**: pnpm workspaces

---

## โครงสร้างไฟล์สำคัญ

```
backend/
  main.py          — FastAPI app, lifespan, migrations, static serving
  config.py        — Settings (env vars via pydantic-settings)
  models.py        — SQLAlchemy models
  schemas.py       — Pydantic request/response schemas
  routes/
    admin.py       — Admin endpoints + store settings
    gafiw.py       — gafiwshop.xyz API proxy (products, buy, OTP, markup)
    wallet.py      — Customer wallet / credit system
    orders.py      — Order management
    products.py    — Own product catalog

artifacts/store/src/
  pages/
    StoreFront.tsx — หน้าร้านลูกค้า (products, gafiw cards, OTP tools)
    AdminPanel.tsx — หน้า Admin (/admin)
```

---

## Environment Variables (ตั้งใน Render Dashboard)

| ตัวแปร | หมายเหตุ |
|---|---|
| `DATABASE_URL` | Neon.tech connection string (postgresql+psycopg2://...) |
| `SECRET_KEY` | JWT secret 32+ chars |
| `ADMIN_PASSCODE` | รหัสเข้า Admin Panel |
| `GAFIWSHOP_KEY_API` | API key จาก gafiwshop.xyz |
| `WEBHOOK_URL` | URL ของ Render service |
| `BOT_TOKEN` | Telegram bot token (optional) |
| `SMTP_HOST/USER/PASSWORD/FROM_EMAIL` | Gmail SMTP สำหรับส่ง OTP อีเมล |

---

## Render Deploy

- **Build Command**: `bash build.sh`
- **Start Command**: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Python Version**: 3.11.11 (กำหนดโดย `.python-version` และ `runtime.txt`)

---

## Nail Salon Booking System (ใหม่)

ระบบจองคิวร้านทำเล็บ สร้างบน stack เดิม (FastAPI + PostgreSQL + React)

| หน้า | URL | หน้าที่ |
|---|---|---|
| หน้าจองลูกค้า | `/` | Gallery + จองคิว + ชำระมัดจำ |
| Admin Nail | `/nail-admin` | จัดการคิว, slot, gallery, บริการ, ตั้งค่า |
| Admin เดิม | `/admin` | ระบบ order สินค้าดิจิทัลเดิม |

**Models ใหม่**: `nail_shop_settings`, `nail_services`, `nail_staff`, `nail_time_slots`, `nail_bookings`, `nail_gallery`

**Routes**: `backend/routes/nail.py` — prefix `/api/nail/`

**ENV ที่ต้องตั้ง**:
- `ADMIN_PASSCODE` — รหัสเข้า `/nail-admin` (บังคับ — ถ้าไม่ตั้งจะ 503)
- `SLIP2GO_API_KEY` — ตรวจสลิปอัตโนมัติ (optional)

**UX**: Candy Pink (#FF6B9D) + White, font Prompt, ภาษาไทย

**Slot locking**: `SELECT FOR UPDATE` ป้องกัน race condition, hold 10 นาที

**Rental expiry**: ตั้ง `expired_at` ใน nail_shop_settings → ล็อกหน้าลูกค้าอัตโนมัติ

**ค่ามัดจำแยกตามบริการ**: `nail_services.deposit_amount` (nullable) — ถ้าตั้งไว้จะใช้แทนค่ามัดจำเริ่มต้นของร้าน (`nail_shop_settings.deposit_amount`) ตอน hold slot แก้ได้ในหน้า Admin > บริการ

**เปลี่ยนบริการหลังจอง**: แอดมินกดปุ่ม "เปลี่ยนบริการ" ในการ์ดคิว (`/nail-admin` แท็บคิว) → เลือกบริการใหม่ ระบบคำนวณส่วนต่างมัดจำให้อัตโนมัติและบันทึกไว้ใน `admin_note` (ไม่โอนเงินอัตโนมัติ แอดมินต้องเก็บ/คืนเงินหน้าร้านเอง)

**ช่วงเวลาที่ผ่านไปแล้ว**: ระบบคำนวณเวลาไทย UTC+7 ผ่าน `_now_th()` ใน `nail.py` เพื่อกันการจองสล็อตของ "วันนี้" ที่เวลาผ่านไปแล้ว (`/booking/hold` จะ reject ด้วย 409) ส่วนฝั่งแสดงผล (`/slots`) ไม่ซ่อนออกจากรายการ แต่ส่ง `is_past: true` มาให้ frontend แสดงเป็นการ์ดปิดพร้อมป้าย "ผ่านไปแล้ว" แทน (ดูหัวข้อ "ช่วงเวลาที่ผ่านไปแล้ว (UX)" ด้านล่าง)

**Global error logging**: `backend/main.py` มี exception handler กลางที่ log traceback เต็มของทุก error ที่ไม่ได้ถูกจัดการไว้ และคืนข้อความภาษาไทยที่เป็นมิตรแทน error ดิบ — ช่วยหาสาเหตุ 500 error ในโปรดักชันได้ง่ายขึ้น (เดิมไม่มี handler นี้ทำให้ debug 500 บน Render ยากมาก)

**ช่วงเวลาที่ผ่านไปแล้ว (UX)**: `/api/nail/slots` ไม่ซ่อนสล็อตที่ผ่านเวลาไปแล้วของวันนี้อีกต่อไป — ส่งกลับมาพร้อม `is_past: true` และ `available: false` แทน ฝั่งหน้าจองแสดงเป็นการ์ดสีเทาปิดกดไม่ได้พร้อมป้าย "⏱️ ผ่านไปแล้ว" ให้ลูกค้าเข้าใจว่าทำไมเลือกไม่ได้ (ก่อนหน้านี้ซ่อนหายไปเฉยๆ ทำให้ลูกค้างงว่าไม่มีคิวว่างเลย)

**การแสดงค่ามัดจำ**: ไม่แสดงค่ามัดจำเริ่มต้นของร้าน (shop-wide) ที่หน้า Landing อีกต่อไป (ดูเหมือนขายของตั้งแต่แรกจนลูกค้าอาจหนี) แต่จะแสดงค่ามัดจำจริงของบริการที่เลือก (หรือค่าเริ่มต้นถ้าไม่เลือกบริการ) ให้เห็นชัดเจนที่หน้ากรอกข้อมูล (ก่อนหน้าชำระเงิน) และหน้าชำระเงินเหมือนเดิม

---

## User preferences

- ภาษาไทยในทุก UI และ error messages
- ไม่แสดงชื่อ "gafiwshop" / "Gafiw" ในหน้าลูกค้า
- ชื่อ section สินค้าแก้ได้ในหน้า Admin
- ราคาสินค้า Gafiw ต้องปรับ markup ได้ต่อรายการ ไม่ใช่ราคาดิบจาก API
- Secrets ห้ามอยู่ในโค้ด — ต้องอยู่ใน Render Environment Variables เท่านั้น
- Gen Z UX: Candy Pink + White, font Prompt, rounded corners, animation smooth
- ระบบจองคิว: slot lock atomic (SELECT FOR UPDATE), hold 10 นาที, deposit random cents
