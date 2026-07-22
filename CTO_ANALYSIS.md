# 🔍 CTO-Level Code Review — CSC (Chain System Care)
> วิเคราะห์โดย Senior CTO Lens | July 2025

---

## สรุปภาพรวม (Executive Summary)

โปรเจกต์นี้เป็น **multi-tenant SaaS** สำหรับร้านเสริมสวย/ร้านค้าดิจิทัล ซึ่งเกิดจากการ **organic growth** — เพิ่ม feature ต่อเนื่องโดยไม่มีการ refactor ตามหลัง  
Stack ที่เลือก (FastAPI + React/Vite + Neon PostgreSQL) เหมาะสมกับ use case แต่มี **technical debt สะสมจำนวนมาก** ที่จะกลายเป็นปัญหาใหญ่เมื่อ scale ขึ้นไป

---

## 1. 🏗️ Architecture — คะแนน: 5/10

### ✅ ทำได้ดี
- แยก Backend (FastAPI) / Frontend (Vite) ชัดเจน
- Multi-tenant ผ่าน `shop_id` threading ใช้งานได้จริง
- ใช้ Pydantic Settings สำหรับ config management

### ❌ ปัญหา
| ปัญหา | ความรุนแรง | รายละเอียด |
|---|---|---|
| **God Module** | 🔴 Critical | `routes/nail.py` มี **4,500+ บรรทัด** ในไฟล์เดียว — ผิด SRP อย่างรุนแรง |
| **Two Systems in One** | 🟠 High | Legacy Digital Store + Nail Salon อยู่ด้วยกัน — `admin.py` เป็น singleton แต่ `nail.py` เป็น multi-tenant ทำให้ mental model ปั่นป่วน |
| **ไม่มี Service Layer** | 🟠 High | Business logic อยู่ใน route handler โดยตรง ทำให้ test ลำบาก และ reuse ไม่ได้ |
| **Telegram Coupling** | 🟡 Medium | `bot.py` คุมกับ business logic โดยตรง — ถ้า Telegram API ล่ม OTP delivery หยุดทำงาน |
| **No API versioning** | 🟡 Medium | ไม่มี `/api/v1/` prefix — ทำให้ breaking changes ในอนาคตยาก |

**แนวทางแก้:** แตก `nail.py` ออกเป็น `nail/admin.py`, `nail/booking.py`, `nail/payment.py`, `nail/settings.py` + สร้าง Service layer แยก business logic ออกจาก HTTP layer

---

## 2. 🔒 Security — คะแนน: 4/10

### ✅ ทำได้ดี
- ใช้ `bcrypt` สำหรับ PIN hashing ใน wallet
- SQLAlchemy ORM + bound parameters — ป้องกัน SQL Injection
- JWT Bearer token สำหรับ auth
- OTP 60s cooldown ใน wallet

### ❌ ช่องโหว่สำคัญ

#### 🔴 Critical
```python
# auth.py L51 — ใช้ SHA-256 ไม่มี salt สำหรับ Admin Passcode
hashlib.sha256(passcode.encode()).hexdigest()
# ควรเป็น: bcrypt.hashpw(passcode.encode(), bcrypt.gensalt())
```
Admin passcode เสี่ยง rainbow table attack ทันทีถ้า DB รั่ว

#### 🔴 Critical
```python
# config.py + wallet.py — Hardcoded secret defaults
secret_key: str = Field(default="changeme-please-set-a-real-secret-key-32chars")
```
ถ้า env var ไม่ถูก set → แอปยังรันได้ด้วย weak key โดยไม่มี error

#### 🟠 High — CORS Wildcard
```python
# main.py
allow_origins=["*"]
```
เปิดให้ทุก origin ส่ง request ได้ — ควรระบุ domain จริงใน production

#### 🟠 High — No Rate Limiting on PIN/Passcode
ไม่มี brute-force protection บน endpoint `/verify-pin`, `/admin-login` — สามารถ brute force ได้ไม่จำกัด

#### 🟠 High — Missing Authorization Check in Token Verification
```python
# verify_admin_token เช็คแค่ JWT signature ถูกต้อง
# ไม่เช็คว่า shop ยังมีสิทธิ์อยู่ใน DB จริงหรือไม่
```

#### 🟡 Medium — File Upload ไม่ตรวจ Magic Bytes
```python
# upload.py รับ base64 แล้ว decode ตรงๆ
# ไม่มี image validation ว่าเป็น image จริง
# ไม่มี EXIF stripping
# ขนาดอาจสูงถึง 5MB ต่อ record
```

#### 🟡 Medium — Session ID ไม่ Random เพียงพอ
```python
# nail.py L366
NAIL_ADMIN_SESSION_ID - shop_row.id  # predictable pattern
```

---

## 3. 📈 Scalability — คะแนน: 4/10

### ❌ ปัญหา

| ปัญหา | Impact |
|---|---|
| **Blocking startup migrations** | `main.py` รัน SQL migrations + cleanups ทุก startup — ใช้ไม่ได้กับ horizontal scaling |
| **Sync route handlers** | ใช้ `def` แทน `async def` ใน DB-heavy routes → blocks event loop under load |
| **No caching layer** | ไม่มี Redis/Memcached — shop settings fetch ทุก request |
| **Image ใน DB** | Base64 images (5MB) ใน `payment_proof`, `ref_image` ทำให้ SELECT choke |
| **No background task queue** | Slip verification, email sending ทำใน request cycle — ทำให้ response ช้า |
| **ไม่มี CDN** | Static assets เสิร์ฟจาก Vite dev server โดยตรง |

### Race Condition ที่อันตราย
```python
# wallet.py — topup_slip: อัป balance และสร้าง CreditTransaction แยกกัน
customer.balance += amount        # step 1
db.add(CreditTransaction(...))    # step 2
db.commit()                       # ถ้า concurrent request เข้ามาระหว่างนี้ = double credit
# ควรใช้ SELECT FOR UPDATE + atomic update
```

---

## 4. 🗄️ Database — คะแนน: 6/10

### ✅ ทำได้ดี
- `pool_pre_ping=True` จัดการ Neon cold starts ได้ดี
- `pool_recycle=300` เหมาะสม
- ใช้ composite unique constraint `(email, shop_id)` ถูกต้อง

### ❌ ปัญหา

#### Missing Indexes ที่ควรมี
```sql
-- NailBooking ไม่มี composite index นี้ แต่ query บ่อยมาก
CREATE INDEX ON nail_bookings (shop_id, status);
CREATE INDEX ON nail_bookings (shop_id, booking_date);

-- TopupRequest
CREATE INDEX ON topup_requests (shop_id, status);
CREATE INDEX ON topup_requests (customer_id);
```

#### Dead Column
```python
# models.py — NailBooking
deposit_cents = Column(Integer, default=0)  # comment: "legacy: now not used"
# ยังอยู่ใน schema — เปลือง storage และ confuse developer ใหม่
```

#### Image Storage Anti-pattern
```
nail_bookings.ref_image    → Text (base64, up to 5MB)
nail_bookings.slip_image   → Text (base64)
topup_requests.slip_image  → Text (base64)
```
ควรย้ายไปที่ object storage (S3/Cloudflare R2) แล้วเก็บแค่ URL

#### Migration Strategy
ใช้ `CREATE TABLE IF NOT EXISTS` ใน `main.py` แทนที่จะใช้ Alembic — ทำให้ schema drift เกิดขึ้นได้ง่ายระหว่าง dev/prod

---

## 5. 🔌 API Design — คะแนน: 6/10

### ✅ ทำได้ดี
- ใช้ Pydantic schemas สำหรับ request/response validation
- FastAPI auto-generated OpenAPI docs

### ❌ ปัญหา

| ปัญหา | ตัวอย่าง |
|---|---|
| **ไม่มี API versioning** | `/api/nail/...` ควรเป็น `/api/v1/nail/...` |
| **RESTful ไม่ consistent** | มีทั้ง GET สำหรับ action (`/verify-otp`) และ POST สำหรับ query |
| **Endpoint ผสม public/admin** | `nail.py` มี public + admin routes ในไฟล์เดียว — ทำให้ middleware ปรับลำบาก |
| **Response format ไม่ consistent** | บาง endpoint return `{"success": true, "data": ...}` บางอันคืน object ตรงๆ |
| **ไม่มี Pagination standard** | บาง endpoint มี pagination บางอันไม่มี ไม่ consistent |

---

## 6. 🤢 Code Smell — คะแนน: 4/10

### ปัญหาหลัก

#### God File
```
routes/nail.py     → 4,500+ lines  🔴 ควรแตกเป็น 4-5 ไฟล์
routes/admin.py    → 1,500+ lines  🟠 ควรแตกเป็น 2-3 ไฟล์
artifacts/store/src/pages/StoreFront.tsx  → 1,500+ lines
artifacts/store/src/pages/BookingPage.tsx → 1,500+ lines
```

#### Duplication
```python
# _slim_verify_result() ซ้ำกันใน:
routes/wallet.py    L30
routes/orders.py    L17
# → ควรย้ายไป slip_verify.py
```

#### Magic Numbers
```python
# nail.py — ตัวเลขลอยไปมาโดยไม่มี constant
if minutes_until_slot < 30:  # ทำไม 30?
max_bookings = 1             # hardcoded
cleanup_days = 30            # hardcoded
```

#### Startup Cleanup Anti-pattern
```python
# main.py รัน cleanup SQL ทุก startup
# ควรย้ายไป scheduled job (APScheduler/Celery Beat)
```

---

## 7. 📁 Folder Structure — คะแนน: 6/10

### สภาพปัจจุบัน
```
backend/
├── routes/         ✅ แยก domain ได้ดีในระดับหนึ่ง
├── models.py       ❌ models ทุกอย่างในไฟล์เดียว (ควรแยก domain)
├── schemas.py      ❌ schemas ทุกอย่างในไฟล์เดียว
└── auth.py         ❌ ผสม Telegram auth + JWT + OTP + hashing

artifacts/store/src/
├── pages/          ✅ แยก pages ได้ดี
├── components/     ⚠️ flat — ไม่แบ่ง feature vs shared
├── hooks/          ✅ มีแต่น้อยมาก
└── lib/            ✅ ok
```

### โครงสร้างที่ควรเป็น
```
backend/
├── core/           (auth, config, database, security)
├── models/         (shop.py, customer.py, booking.py, wallet.py)
├── schemas/        (แยก domain เหมือนกัน)
├── services/       (booking_service.py, wallet_service.py)
└── routes/
    ├── nail/       (admin.py, booking.py, payment.py)
    ├── wallet/
    └── store/
```

---

## 8. 📝 Naming — คะแนน: 7/10

### ✅ ทำได้ดี
- snake_case ใน Python ค่อนข้าง consistent
- PascalCase สำหรับ React components
- DB column names สม่ำเสมอ

### ❌ ปัญหา
| ปัญหา | ตัวอย่าง |
|---|---|
| Abbreviated + full mixed | `shop_id` vs `s_id` ปรากฎในบางที่ |
| Inconsistent JSON keys | บางอัน `camelCase` บางอัน `snake_case` ใน response |
| Function ชื่อไม่ชัด | `_slim_verify_result` — "slim" หมายความว่าอะไร? |
| Thai + English mixed | comment บางส่วนเป็นไทย บางส่วนเป็นอังกฤษ |
| Boolean naming | `is_active` ใช้ได้ แต่ `allow_ref_image` ไม่ชัดว่า subject คืออะไร |

---

## 9. ⚡ Performance — คะแนน: 4/10

### ❌ ปัญหาใหญ่

#### Frontend
```tsx
// StoreFront.tsx + BookingPage.tsx — 1500+ lines, ไม่มี code splitting
// โหลด bundle ทั้งหมดตั้งแต่ต้น — ควรใช้ React.lazy() + Suspense

// ไม่มี useMemo/useCallback ใน list rendering
// filter/sort ทำใหม่ทุก render
```

#### Backend
```python
# N+1 Query pattern ที่น่าสงสัย
# (หลังแก้ไปแล้วบางส่วน แต่ใน 4500 lines มีโอกาสหลงเหลืออยู่)
for booking in bookings:
    booking.customer  # lazy load ทุก iteration
```

#### Fetch Override Anti-pattern
```tsx
// main.tsx — override window.fetch เพื่อ prepend API URL
// ไม่ใช่ standard practice, ทำให้ debug ยาก
// ควรใช้ Axios instance หรือ custom fetch wrapper แทน
```

---

## 10. 💾 Memory Leak — คะแนน: 8/10

### ✅ ทำได้ดี
- `useEffect` cleanup functions ส่วนใหญ่ทำได้ถูกต้อง
- React Query จัดการ polling lifecycle ได้ดี
- Event listeners ใน `use-mobile.tsx` cleanup ถูกต้อง

### ⚠️ จุดที่ควรตรวจสอบ
- Base64 images ใน state/memory ขณะ upload — อาจค้างในหน่วยความจำนานกว่าจำเป็น
- `ShopGate` polling interval ถ้า component unmount ระหว่าง refetch

---

## 11. 💀 Dead Code — คะแนน: 6/10

| Dead Code | ที่ตั้ง | Impact |
|---|---|---|
| `routes/auth.py` | Empty router file | Low |
| `deposit_cents` column | `models.py` NailBooking | Medium |
| `lib/api-client-react/` | Orval-generated client ไม่ถูกใช้ | High — build overhead |
| Legacy inline styles | `AppErrorBoundary`, `ExpiredShopScreen` | Low |
| Cleanup SQL ใน startup | `main.py` L27-318 | Medium |

**`lib/api-client-react/`** น่าสนใจมาก — มี generated TypeScript API client ครบ แต่ application ใช้ raw `fetch` / manual `api.ts` แทน ควรตัดสินใจว่าจะใช้อันไหนแล้วลบอีกอัน

---

## 12. 🐛 Bugs ที่อาจเกิดขึ้น — คะแนน: 5/10

### 🔴 Critical Bugs

#### Race Condition ใน Wallet Top-up
```python
# wallet.py — topup_slip endpoint
customer.balance += amount          # read-modify-write
db.add(CreditTransaction(...))
db.commit()
# ถ้า 2 requests พร้อมกัน → double credit
# Fix: SELECT customer FOR UPDATE แล้วค่อย update
```

#### JSON Parse Without Schema
```python
# nail.py L255, L305
json.loads(some_db_column)
# ถ้า DB มีข้อมูลเสียหาย → 500 error ไม่มี fallback
# Fix: try/except + validate with Pydantic
```

### 🟠 High Bugs

#### Admin Token ไม่เช็ค DB State
```python
# verify_admin_token เช็คแค่ JWT valid
# ถ้า shop ถูก deactivate/banned → token ยังใช้ได้จนกว่าจะ expire
```

#### Startup Migration Block
```python
# main.py runs blocking migrations at startup
# ถ้า DB connection fail → app crash ทันที, ไม่มี retry
```

### 🟡 Medium Bugs

- Error จาก Telegram Bot API ไม่ถูก handle → อาจทำให้ request หายเงียบ
- TOTP window อาจ drift ถ้า server time ผิด timezone
- File cleanup ใน startup เท่านั้น — ถ้า server รันนานมากโดยไม่ restart → disk/DB bloat

---

## 13. 🔧 จุดที่ Refactor ได้ (Quick Wins)

| Priority | Refactor | Effort | Impact |
|---|---|---|---|
| 🔴 1 | แตก `nail.py` เป็น 4-5 ไฟล์ | 2-3 วัน | สูงมาก |
| 🔴 2 | เปลี่ยน admin passcode hashing เป็น bcrypt | 1 ชั่วโมง | สูงมาก (security) |
| 🔴 3 | เพิ่ม rate limiting (slowapi) | 2-4 ชั่วโมง | สูงมาก (security) |
| 🟠 4 | Wallet topup → SELECT FOR UPDATE | 1-2 ชั่วโมง | สูงมาก (financial) |
| 🟠 5 | เพิ่ม composite indexes ใน NailBooking | 30 นาที | สูง (performance) |
| 🟠 6 | ย้าย images ออกจาก DB → object storage | 1-2 วัน | สูง (performance) |
| 🟠 7 | ย้าย startup cleanup → scheduled job | 4 ชั่วโมง | กลาง |
| 🟡 8 | สร้าง Service layer แยก business logic | 3-5 วัน | สูง (maintainability) |
| 🟡 9 | Migrate schema management เป็น Alembic | 1 วัน | สูง (reliability) |
| 🟡 10 | Code split StoreFront + BookingPage | 4-6 ชั่วโมง | กลาง (performance) |
| 🟡 11 | ลบ `lib/api-client-react/` หรือใช้จริง | 1-2 ชั่วโมง | กลาง |
| 🟢 12 | เพิ่ม API versioning prefix `/v1/` | 2-4 ชั่วโมง | กลาง |

---

## 14. ✅ สิ่งที่ทำได้ดี

| ด้าน | รายละเอียด |
|---|---|
| **Stack selection** | FastAPI + React + Neon เหมาะกับ use case และ budget มาก |
| **Multi-tenancy** | `shop_id` scoping ทำงานได้ดี, fail-closed slug resolution ถูกต้อง |
| **Error Boundary** | `AppErrorBoundary` ครอบทั้งแอป — UX ไม่พัง |
| **Wallet isolation** | composite unique `(email, shop_id)` + JWT ที่มี `shop_id` |
| **Slot locking** | ใช้ `SELECT FOR UPDATE` สำหรับ booking slot — ถูกต้อง |
| **PIN security** | ใช้ `bcrypt` สำหรับ customer PIN — ดี |
| **Database pooling** | `pool_pre_ping` + `pool_recycle` เหมาะสำหรับ Neon |
| **OTP cleanup** | lazy cleanup ก่อนสร้าง OTP ใหม่ — ดี |
| **Feature flags** | `allow_ref_image` pattern — scalable |
| **CSS variables theming** | brand_color ผ่าน CSS vars แทน hardcode — ดี |
| **Radix UI** | accessibility baseline จาก Shadcn/Radix |

---

## 📊 สรุปคะแนน

| หัวข้อ | คะแนน | เกรด |
|---|---|---|
| Architecture | 5/10 | C |
| Security | 4/10 | D |
| Scalability | 4/10 | D |
| Database | 6/10 | C+ |
| API Design | 6/10 | C+ |
| Code Smell | 4/10 | D |
| Folder Structure | 6/10 | C+ |
| Naming | 7/10 | B- |
| Performance | 4/10 | D |
| Memory Leak | 8/10 | B+ |
| Dead Code | 6/10 | C+ |
| Bug Risk | 5/10 | C |
| **รวม** | **5.4/10** | **C** |

---

## 🎯 ลำดับความสำคัญที่ต้องทำก่อน (Top 5 Actions)

1. **🔴 Fix bcrypt passcode** — 1 ชั่วโมง, security critical
2. **🔴 Add rate limiting** — 4 ชั่วโมง, security critical  
3. **🔴 Fix wallet race condition** — 2 ชั่วโมง, financial critical
4. **🟠 Split nail.py** — 2-3 วัน, maintainability critical
5. **🟠 Add DB indexes** — 30 นาที, performance quick win

---

*Generated by CTO Analysis | CSC Project | July 2025*
