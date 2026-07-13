# CSC Design System — Blueprint

> เอกสารนี้ใช้เป็นแบบแผนกลางสำหรับการออกแบบ UX/UI ของระบบ CSC (Chain System Care)  
> อ้างอิงจากการศึกษา **MotherDuck.com** (ภาพอ้างอิง) + การวิเคราะห์โค้ดปัจจุบัน  
> **อัปเดตล่าสุด:** กรกฎาคม 2025

---

## 1. Design Philosophy (แนวคิดหลัก)

MotherDuck ใช้สไตล์ที่เรียกว่า **"Playful Editorial"** — ความเป็นทางการของ editorial design ผสมกับความสนุกสนานของ illustration และสีสดใส เหมาะกับ SaaS ที่ต้องการดูน่าเชื่อถือแต่ไม่น่าเบื่อ

สำหรับ CSC ให้ดึงหลักการเดียวกันมาใช้:
- **กล้า — ไม่กลัวขาวดำหรือสีสด** ใช้ color blocking จริง ๆ ไม่ใช่แค่ accent เล็ก ๆ
- **ชัดเจน — hierarchy ต้องอ่านง่ายในภาษาไทย** ขนาด font ต้องต่างกันชัด
- **มีเอกลักษณ์ — ไม่ใช่ dark-mode generic SaaS** หนีออกจาก #0B0F1A + gradient blue ที่ใช้อยู่

---

## 2. Color System (ระบบสี)

### 2.1 Palette หลัก (ดัดแปลงจาก MotherDuck → Thai-market CSC)

| Token | Hex | ใช้สำหรับ |
|-------|-----|-----------|
| `--cream` | `#F7F3EC` | Background หลักของทุกหน้า (แทน dark bg) |
| `--sky` | `#4FBBDF` | Hero section, header bands, CTA section |
| `--sun` | `#FFD84D` | Highlight section, step badge, alert success |
| `--ink` | `#1A1A1A` | Text หลักทั้งหมด, border, footer |
| `--snow` | `#FFFFFF` | Card background, input background |
| `--coral` | `#FF6B5B` | Error state, urgent badge, destructive action |
| `--sage` | `#2DCB8A` | Success state, verified badge |
| `--mist` | `#6B7A99` | Subtext, placeholder, muted label |
| `--cloud` | `#E8E2D9` | Divider, disabled state, border subtle |

### 2.2 Dark Mode (เก็บไว้เป็น optional ไม่ใช่ default)
ระบบปัจจุบันใช้ dark-mode เป็น default — ในการปรับใหม่ให้ **light-first** และ dark เป็น preference

### 2.3 Color Blocking Rules
- Section ที่ต้องการ attention → `--sky` background (เช่น hero, CTA)
- Section ที่แสดงราคา/แพ็กเกจ → `--sun` background
- Form section → `--snow` background บน `--cream` page bg
- Footer → `--ink` background, `--snow` text

---

## 3. Typography (ระบบตัวอักษร)

### 3.1 Font Stack

```css
/* Display — สำหรับ headline ใหญ่ */
font-family: 'Syne', 'Prompt', sans-serif;

/* Body / Form — รองรับภาษาไทยได้ดี */
font-family: 'Prompt', 'Noto Sans Thai', sans-serif;

/* Mono — code, slug preview, ref text */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

> **Syne** (Google Fonts) — มี Thai fallback ที่ดีเพราะ Prompt รับช่วงต่อ  
> **ทำไม Syne:** เป็น display font ที่ให้ความรู้สึก editorial bold เหมือน MotherDuck ใช้

### 3.2 Scale

| Role | Size | Weight | Line Height | ตัวอย่าง |
|------|------|--------|-------------|---------|
| Display | 56–72px | 800 | 1.05 | Hero headline |
| H1 | 36–48px | 800 | 1.1 | Page title |
| H2 | 28–32px | 700 | 1.2 | Section title |
| H3 | 20–24px | 700 | 1.3 | Card title, step number |
| Body L | 17–18px | 400 | 1.65 | Description text |
| Body M | 15px | 400 | 1.6 | Form label, paragraph |
| Body S | 13px | 400/600 | 1.5 | Caption, helper text |
| Label | 11px | 700 | 1 | ALL CAPS badge, tag |

### 3.3 Thai Typography Notes
- ภาษาไทยควรใช้ `line-height` อย่างน้อย **1.7** สำหรับ body text (ตัวอักษรไทยมีวรรณยุกต์)
- ไม่ใช้ `letter-spacing` กับภาษาไทย (ทำให้อ่านยาก)
- Bold (`font-weight: 700+`) ในภาษาไทยใช้ได้ดีกับ Prompt

---

## 4. Layout System (ระบบโครงร่าง)

### 4.1 Grid

```
Max content width: 1200px
Form/single-column max: 640px
Gutter (horizontal padding): 24px mobile / 48px tablet / 80px desktop
Section vertical rhythm: 80px–120px ระหว่าง sections
```

### 4.2 Section Patterns (จาก MotherDuck)

**A. Hero Section**
```
[Sky Blue BG]
  ┌─────────────────────────────┐
  │  [Logo pill badge]          │
  │                             │
  │  LARGE BOLD                 │  ← Display font, 56–72px
  │  HEADLINE HERE              │
  │                             │
  │  Subheadline ขนาด 18px     │
  │                             │
  │  [CTA Button]  [Secondary]  │
  └─────────────────────────────┘
  [Illustrated element / floating shape ขวาล่าง]
```

**B. Feature List Section**
```
[White/Cream BG]
  Pill badge: "FEATURES" (all caps, outlined)
  
  ┌──────────────┐  ┌────────────────────┐
  │ Text content  │  │  Illustration/Icon  │
  │ • Feature 1   │  │  (ขนาดใหญ่ right) │
  │ • Feature 2   │  │                    │
  └──────────────┘  └────────────────────┘
```

**C. Step Form Section (สำหรับ /register)**
```
[Cream BG — full page]
  
  ┌─── STEP CARD ───────────────────────────┐
  │  [Step Number — bold, 24px, --sky color] │
  │  Step Title ขนาด 20px                   │
  │  ─────────────────────────────────────── │
  │  [Form fields here]                      │
  └─────────────────────────────────────────┘
```

**D. Color Band / CTA Section**
```
[Sun Yellow BG]
  ┌─────────────────────────────────────────┐
  │  Bold headline ขนาด 32px (--ink color)  │
  │  subtext                                 │
  │  [Dark solid CTA button]                 │
  └─────────────────────────────────────────┘
```

### 4.3 Card Anatomy

```
┌─────────────────────────────────┐
│ [TOP ACCENT BAR — 4px, colored] │  ← optional, สไตล์ MotherDuck blog cards
│                                  │
│  Icon / Emoji (24–32px)         │
│  Card Title  (18px, 700)        │
│  Description (14px, 400, muted) │
│                                  │
│  [Optional badge / price tag]   │
└─────────────────────────────────┘
Border: 2px solid --cloud
Border-radius: 16px
Background: --snow
Shadow: 0 2px 12px rgba(0,0,0,0.06)
```

---

## 5. Component Library

### 5.1 Buttons

```
PRIMARY (Solid, Dark)
─────────────────────
Background: --ink (#1A1A1A)
Text: --snow (#FFFFFF)
Padding: 14px 28px
Border-radius: 8px
Font-weight: 700, 15px
Hover: background lighten 15% or slight scale(1.02)

SECONDARY (Outlined)
─────────────────────
Background: transparent
Border: 2px solid --ink
Text: --ink
Same sizing as primary

ACCENT (Sky Blue — for key CTA like form submit)
──────────────────────────────────────────────────
Background: --sky
Text: --ink (dark text on blue, ไม่ใช่ white)
```

> **หมายเหตุ:** MotherDuck ใช้ dark solid button ไม่ใช่ gradient — หนีออกจาก gradient style ปัจจุบัน

### 5.2 Form Inputs

```
Input field:
─────────────
Background: --snow
Border: 2px solid --cloud
Border-radius: 10px
Padding: 12px 16px
Font-size: 15px
Color: --ink

Focus state:
Border: 2px solid --ink (ไม่ใช่ accent blue)
Box-shadow: 0 0 0 3px rgba(26,26,26,0.08)

Error state:
Border: 2px solid --coral
Helper text: --coral, 13px

Success state:
Border: 2px solid --sage
Icon: checkmark ขวา
```

### 5.3 Step / Section Badge (สำหรับ form steps)

```
Style A — Number Badge (MotherDuck-inspired)
─────────────────────────────────────────────
┌────┐
│ 01 │  ← 20px, 800 weight, --sky bg, --ink text, rounded-full
└────┘
STEP TITLE  ← 20px, 700 weight

Style B — Pill Badge (สำหรับ section labels)
─────────────────────────────────────────────
[ FEATURES ]  ← ALL CAPS, 11px, 700, outlined pill, --ink border+text
```

### 5.4 Plan / Package Card

```
┌─────────────────────────────────────┐
│  [POPULAR badge — --sun bg, --ink]  │  ← top-right corner
│                                      │
│  Plan Name  20px 700                 │
│  Description 14px muted              │
│                                      │
│  ฿999   ← 32px, 800, --ink           │
│  /ต่อเดือน  ← 13px muted            │
│                                      │
│  [SELECT button — full width]        │
└─────────────────────────────────────┘

Selected state:
Border: 3px solid --ink (not blue gradient)
Background: --sun (light yellow tint)
```

### 5.5 Upload Zone

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  ↑  [Upload icon — 32px]
  
  กดหรือลากไฟล์มาวาง  ← 15px 600
  รองรับ JPG, PNG       ← 13px muted
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

Border: 2px dashed --cloud
Border-radius: 12px
Background: --cream
Hover: border-color --ink, background --snow

Uploaded state:
Border: 2px solid --sage (solid, not dashed)
Background: sage tint (#2DCB8A18)
```

### 5.6 Decorative Elements (MotherDuck signature)

```
Geometric shapes ลอยอยู่ใน background:
- วงกลม (circle): --sky หรือ --sun, opacity 0.3–0.5, size 40–120px
- สี่เหลี่ยม (square): หมุน 45°, stroke only หรือ fill ทึบ
- เส้น wavy: --cloud color, ใช้ svg path

Positioning:
- Corner decorations (top-right, bottom-left ของ hero section)
- ไม่วางทับ content หลัก — ใส่ไว้ใน ::before/::after หรือ absolute positioned div ที่ pointer-events: none
```

---

## 6. Motion & Interaction

### 6.1 Animation Principles
- **Purposeful** — animate เพื่อ guide attention ไม่ใช่ decorative
- **Fast** — duration ไม่เกิน 300ms สำหรับ micro-interactions
- **Spring-based** — ใช้ framer-motion `type: "spring"` กับ `stiffness: 400, damping: 30`

### 6.2 Standard Transitions

```javascript
// Page enter
{ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3 } }

// Card hover (plan selection)
{ whileHover: { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" } }

// Button press
{ whileTap: { scale: 0.97 } }

// Step reveal (sequential)
{ initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, transition: { delay: index * 0.08 } }
```

### 6.3 State Feedback
- Slug check: spinner → green check / red X (ไม่มี delay ให้รู้สึก)
- Form submit: button text เปลี่ยน + spinner ซ้าย (ไม่ใช่แค่ opacity)
- Upload success: animated scale + color change ไม่ใช่แค่ icon swap

---

## 7. Page-Specific Blueprint: `/register`

### 7.1 Layout Overview

```
┌────────────────────────────────────────────────────┐
│  NAV BAR — Logo left, link right [--ink bg]        │
├────────────────────────────────────────────────────┤
│  HERO BAND [--sky bg]                              │
│  "เปิดร้านกับ CSC" — Display 48px                 │
│  Subtext 18px                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
├────────────────────────────────────────────────────┤
│  FORM BODY [--cream bg]                            │
│                                                    │
│  [Step 1 Card] เลือกแพ็กเกจ                      │
│  [Step 2 Card] ข้อมูลร้าน                        │
│  [Step 3 Card] ชำระเงิน                          │
│  [Submit Button — full width, --ink]               │
│                                                    │
├────────────────────────────────────────────────────┤
│  FOOTER BAND [--ink bg]                            │
│  CSC © 2025                                        │
└────────────────────────────────────────────────────┘
```

### 7.2 Form Section Card Spec

```css
.step-card {
  background: #FFFFFF;
  border: 2px solid #E8E2D9;
  border-radius: 20px;
  padding: 32px;
  margin-bottom: 20px;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: #4FBBDF;   /* --sky */
  color: #1A1A1A;
  font-size: 16px;
  font-weight: 800;
  border-radius: 50%;
  margin-right: 12px;
}

.step-title {
  font-size: 20px;
  font-weight: 700;
  color: #1A1A1A;
  display: inline;
}
```

### 7.3 Plan Card Grid (ถ้า 2+ แพ็กเกจ)

```
Mobile: single column stack
Tablet+: 2-column grid (gap 16px)

เมื่อเลือกแล้ว:
- border: 3px solid --ink
- background: --sun tint (#FFD84D20)
- checkmark icon top-right (filled, --ink)
```

### 7.4 Success Screen

```
[--sun yellow bg — full page centered]

  🎉  (64px emoji หรือ SVG illustration)

  ส่งคำขอเรียบร้อยแล้ว!
  ← H2, 32px, 800

  เราจะตรวจสอบและอนุมัติภายใน 24 ชั่วโมง
  ← body, 17px

  📧 ส่งข้อมูลไปที่ {email}

  [กลับหน้าหลัก — --ink button]
```

---

## 8. Page-Specific Blueprint: `/admin` (login)

### 8.1 Layout

```
[--cream bg — full viewport]

  centered card, max-width: 400px

┌────────────────────────────┐
│  [Logo / Brand mark]        │
│  Admin Login                │ ← H2, 28px, 800
│  ─────────────────────────  │
│  [Input: passcode/email]    │
│  [Submit — --ink button]    │
│                             │
│  [Error state if fail]      │
└────────────────────────────┘
```

---

## 9. Icon System

ใช้ **Lucide React** (ที่มีอยู่แล้ว) — ไม่เปลี่ยน library

```
Icon size:
- Inline with text: 16px
- Section icon: 24px
- Feature / hero icon: 32–40px

Stroke width: 2px (default Lucide)

Color rules:
- Icon ใน button: inherit color จาก button text
- Icon ใน card: --mist (#6B7A99)
- Icon status (success/error): ใช้ --sage / --coral
```

---

## 10. Do's and Don'ts

### ✅ Do
- ใช้ **color blocking** จริง — ไม่ใช่แค่ accent เล็กน้อย
- **ขาวดำก่อน** สร้าง structure แล้วค่อยเติมสี
- Text บน colored bg: ตรวจ contrast ratio ≥ 4.5:1 เสมอ
- **ขนาด font ต่างกันชัด** — ratio อย่างน้อย 1.33× ระหว่าง step
- Thai text: `line-height` ≥ 1.7 สำหรับ body

### ❌ Don't
- ❌ ไม่ใช้ gradient button (linear-gradient accent→accentDk) — ใช้ solid แทน
- ❌ ไม่ใช้ dark background เป็น default (#0B0F1A) — light-first เท่านั้น
- ❌ ไม่ใช้ `letter-spacing` กับภาษาไทย
- ❌ ไม่ใส่ animation ที่ duration > 400ms สำหรับ UI feedback
- ❌ ไม่ใช้ `rgba(accent, 0.15)` แทนสีจริง — เลือก palette token และใช้ตรง ๆ
- ❌ ไม่ nested gradient บน gradient background (legibility drops)

---

## 11. Future System-Wide Redesign Scope

เมื่อพร้อมปรับ theme ทั้งระบบ ลำดับความสำคัญ:

1. **`/register`** — public-facing, ผลกระทบต่อ conversion
2. **`/r/:slug`** — customer-facing booking page (per-shop brand color apply ที่นี่)
3. **`/r/:slug/wallet`** — customer wallet + login
4. **`/admin`** — admin login + dashboard
5. **`/superadmin`** — internal tool, ไม่ต้องสวยมาก แต่ให้ readable

### Component Migration Order
```
1. สร้าง design token CSS vars ใน global stylesheet
2. Migrate color constants (C object) → ใช้ CSS vars
3. Migrate buttons → component เดียว (variant props)
4. Migrate inputs → component เดียว  
5. Migrate section cards → component เดียว
6. Apply per-page ทีละหน้า
```

---

## 12. Reference Links

- **MotherDuck (reference):** https://motherduck.com
- **Syne font:** https://fonts.google.com/specimen/Syne
- **Prompt font (Thai):** https://fonts.google.com/specimen/Prompt
- **Lucide icons:** https://lucide.dev
- **Framer Motion:** https://www.framer.com/motion/

---

*เอกสารนี้ควรอัปเดตทุกครั้งที่มีการตัดสินใจ design ใหม่ที่ส่งผลต่อหลายหน้า*
