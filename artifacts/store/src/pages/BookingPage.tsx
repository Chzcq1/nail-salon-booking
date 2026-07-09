/**
 * BookingPage — หน้าจองคิวร้านทำเล็บ (Gen Z UX, Candy Pink + White)
 * Route: /
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Instagram, Facebook, Clock, ChevronLeft, ChevronRight,
  Phone, User, StickyNote, CheckCircle, AlertCircle,
  Loader2, Calendar, Sparkles, Copy, Check, ArrowRight, X,
  MessageCircle, Video, HelpCircle, Wallet,
} from "lucide-react";
import { getTheme, injectThemeCss, DEFAULT_THEME } from "@/theme";

// ตั้งค่าสีเริ่มต้น (Candy Pink) ก่อน settings โหลด — ถูกเขียนทับได้เมื่อ brand_color โหลดจาก API
injectThemeCss(DEFAULT_THEME);

// ── Color tokens — ใช้ CSS custom properties เพื่อรองรับธีมสีตามร้าน ──
// CSS vars ถูก inject โดย injectThemeCss() → ถูกเขียนทับตาม brand_color ของแต่ละร้าน
const P = {
  pink:      "var(--b-primary, #FF6B9D)",
  pinkLight: "var(--b-light, #FF85B3)",
  pinkPale:  "var(--b-pale, #FFF0F7)",
  pinkBorder:"var(--b-border, #FFD6EC)",
  pinkDeep:  "var(--b-deep, #E0457B)",
  white:     "#FFFFFF",
  offwhite:  "var(--b-bg, #FFF8FC)",
  text:      "#1A1A2E",
  sub:       "#505068",   // เพิ่มความเข้มจาก #6B6B8A — ผ่าน WCAG AA
  muted:     "#707080",   // เพิ่มความเข้มจาก #A0A0B8 — ผ่าน WCAG AA
  gray:      "#E8E8F0",
  grayDark:  "#D0D0E0",
  success:   "#22C55E",
  error:     "#EF4444",
} as const;

// ── Utilities ────────────────────────────────────────────────────────
function fmt(d: Date) {
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDate(s: string) {
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
// ใช้วันที่ตาม "เวลาท้องถิ่น" ของเบราว์เซอร์ ห้ามใช้ toISOString() เพราะจะแปลงเป็น UTC
// แล้วทำให้วันที่เลื่อนถอยหลัง 1 วันสำหรับโซนเวลาไทย (UTC+7) เช่น เลือกวันที่ 9 กลายเป็นวันที่ 8
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Wallet session (แชร์ token เดียวกับ /wallet) ────────────────────────
const WALLET_SESSION_KEY = "wallet_token";
function getWalletToken(): string { return sessionStorage.getItem(WALLET_SESSION_KEY) || ""; }

// ── API calls ────────────────────────────────────────────────────────
/** แปลง detail จาก FastAPI/Pydantic เป็นข้อความที่อ่านได้ */
async function parseApiError(r: Response): Promise<string> {
  try {
    const d = await r.json();
    if (Array.isArray(d.detail)) return d.detail.map((e: any) => e.msg || JSON.stringify(e)).join(", ");
    return String(d.detail || `เกิดข้อผิดพลาด (${r.status})`);
  } catch {
    return `เกิดข้อผิดพลาด (${r.status})`;
  }
}

const api = {
  settings:  () => fetch("/api/nail/settings").then(r => r.json()),
  gallery:   () => fetch("/api/nail/gallery").then(r => r.json()),
  services:  () => fetch("/api/nail/services").then(r => r.json()),
  slots:     (date: string) => fetch(`/api/nail/slots?date=${date}`).then(r => r.json()),
  hold:      async (body: object) => {
    const token = getWalletToken();
    const r = await fetch("/api/nail/booking/hold", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await parseApiError(r));
    return r.json();
  },
  pay:       async (body: object) => {
    const r = await fetch("/api/nail/booking/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await parseApiError(r));
    return r.json();
  },
  payWallet: async (hold_token: string) => {
    const token = getWalletToken();
    const r = await fetch("/api/nail/booking/pay-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hold_token }),
    });
    if (!r.ok) throw new Error(await parseApiError(r));
    return r.json();
  },
  uploadSlip: (base64: string) =>
    fetch("/api/upload/slip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: base64 }),
    }).then(r => r.json()),
};

// ── Step types ───────────────────────────────────────────────────────
type Step = "landing" | "date" | "slot" | "info" | "payment" | "success";

interface BookingState {
  service:  any | null;
  date:     string | null;  // YYYY-MM-DD
  slot:     any | null;
  name:     string;
  phone:    string;
  line:     string;
  note:     string;
  holdData: any | null;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BookingPage() {
  const [step, setStep] = useState<Step>("landing");
  const [booking, setBooking] = useState<BookingState>({
    service: null, date: null, slot: null,
    name: "", phone: "", line: "", note: "", holdData: null,
  });

  const { data: shopSettings, isError: settingsError } = useQuery({
    queryKey: ["nail-settings"], queryFn: api.settings, staleTime: 15000, retry: 1,
  });

  // Inject brand theme whenever brand_color changes
  useEffect(() => {
    injectThemeCss(getTheme(shopSettings?.brand_color));
  }, [shopSettings?.brand_color]);

  const { data: gallery = [] } = useQuery({
    queryKey: ["nail-gallery"], queryFn: api.gallery, staleTime: 120000, retry: 1,
  });
  const { data: services = [] } = useQuery({
    queryKey: ["nail-services"], queryFn: api.services, staleTime: 120000, retry: 1,
  });

  // Rental expiry guard
  if (shopSettings?.expired === true) {
    return <ExpiredScreen shopName={shopSettings?.shop_name} />;
  }

  // Settings load error
  if (settingsError && !shopSettings) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: P.offwhite, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <p style={{ color: P.text, fontWeight: 600, fontSize: 18 }}>โหลดข้อมูลร้านไม่สำเร็จ</p>
        <p style={{ color: P.muted, fontSize: 14, marginTop: 8 }}>กรุณารีเฟรชหน้า หรือลองใหม่ภายหลัง</p>
      </div>
    );
  }

  const go = (s: Step) => { setStep(s); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div style={{ background: P.offwhite, minHeight: "100vh", color: P.text, fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}>
      {/* Google Fonts */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>

      <AnimatePresence mode="wait">
        {step === "landing" && (
          <LandingScreen
            key="landing"
            settings={shopSettings}
            gallery={gallery}
            onBook={() => go("date")}
          />
        )}
        {step === "date" && (
          <DateScreen
            key="date"
            maxDays={shopSettings?.max_advance_days || 14}
            closedDates={(() => { try { return JSON.parse(shopSettings?.closed_dates || "[]"); } catch { return []; } })()}
            selected={booking.date}
            onBack={() => go("landing")}
            onSelect={d => { setBooking(b => ({ ...b, date: d, slot: null })); go("slot"); }}
          />
        )}
        {step === "slot" && (
          <SlotScreen
            key="slot"
            date={booking.date!}
            selected={booking.slot}
            onBack={() => go("date")}
            onSelect={sl => { setBooking(b => ({ ...b, slot: sl })); go("info"); }}
          />
        )}
        {step === "info" && (
          <InfoScreen
            key="info"
            services={services}
            service={booking.service}
            name={booking.name}
            phone={booking.phone}
            line={booking.line}
            note={booking.note}
            defaultDeposit={shopSettings?.deposit_amount}
            onBack={() => go("slot")}
            onNext={(service, name, phone, line, note) => {
              setBooking(b => ({ ...b, service, name, phone, line, note }));
              go("payment");
            }}
          />
        )}
        {step === "payment" && (
          <PaymentScreen
            key="payment"
            booking={booking}
            onBack={() => go("info")}
            onSuccess={holdData => { setBooking(b => ({ ...b, holdData })); go("success"); }}
          />
        )}
        {step === "success" && (
          <SuccessScreen
            key="success"
            holdData={booking.holdData}
            onHome={() => { setBooking({ service: null, date: null, slot: null, name: "", phone: "", line: "", note: "", holdData: null }); go("landing"); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Expired Screen ───────────────────────────────────────────────────
function ExpiredScreen({ shopName }: { shopName?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#fff", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🌸</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: P.text, marginBottom: 8 }}>{shopName || "ร้านนี้"}</h1>
      <p style={{ color: P.sub, marginBottom: 24 }}>ขออภัยค่ะ ระบบจองคิวออนไลน์ปิดปรับปรุงชั่วคราว</p>
      <p style={{ color: P.muted, fontSize: 14 }}>กรุณาติดต่อร้านโดยตรงทางช่องทางโซเชียลมีเดียหรือเบอร์โทรของร้านนะคะ</p>
    </div>
  );
}

// ── Page Wrapper ─────────────────────────────────────────────────────
function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25 }}
      style={{ maxWidth: 480, margin: "0 auto", padding: "0 0 80px 0" }}
    >
      {children}
    </motion.div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, color: P.pink, background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 500, padding: "16px 20px 8px" }}>
      <ChevronLeft size={18} /> กลับ
    </button>
  );
}

// ── Tutorial Popup ───────────────────────────────────────────────────
const TUTORIAL_KEY = "nail_tutorial_seen_v2";

const tutorialSteps = [
  { icon: "📅", title: "เลือกวันที่", desc: "เลือกวันที่สะดวก ระบบแสดงเฉพาะวันที่เปิดรับจอง" },
  { icon: "🕐", title: "เลือกช่วงเวลา", desc: "เลือกช่วงเวลาที่ว่างสำหรับวันที่คุณเลือก" },
  { icon: "📝", title: "กรอกข้อมูล + เลือกบริการ", desc: "ใส่ชื่อ เบอร์โทร และเลือกบริการที่ต้องการ (ถ้ามี)" },
  { icon: "💳", title: "จ่ายมัดจำ", desc: "เติมเครดิตในกระเป๋าเงิน แล้วกดจ่ายมัดจำทันที — ไม่ต้องโอนสลิป" },
];

function TutorialPopup({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === tutorialSteps.length - 1;

  const handleClose = () => {
    localStorage.setItem(TUTORIAL_KEY, "1");
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999, padding: "0 0 0 0" }}>
      <motion.div initial={{ y: 200 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "28px 24px 36px", width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: 0 }}>วิธีจองคิวทำเล็บ</h2>
            <p style={{ color: P.muted, fontSize: 12, margin: 0 }}>มีแค่ 4 ขั้นตอนง่ายๆ!</p>
          </div>
          <button onClick={handleClose} style={{ background: P.gray, border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} color={P.sub} />
          </button>
        </div>

        {/* Steps */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {tutorialSteps.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? P.pink : P.gray, transition: "background 0.3s" }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}
            style={{ textAlign: "center", padding: "8px 0 24px" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{tutorialSteps[step].icon}</div>
            <div style={{ background: `var(--b-primary-15)`, borderRadius: 100, padding: "4px 16px", display: "inline-block", marginBottom: 12 }}>
              <span style={{ color: P.pink, fontSize: 12, fontWeight: 700 }}>ขั้นตอนที่ {step + 1}</span>
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: P.text, marginBottom: 8 }}>{tutorialSteps[step].title}</h3>
            <p style={{ color: P.sub, fontSize: 15, lineHeight: 1.6 }}>{tutorialSteps[step].desc}</p>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: "flex", gap: 10 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{ flex: 1, background: P.gray, border: "none", borderRadius: 14, padding: "14px", cursor: "pointer", fontFamily: "inherit", fontSize: 15, color: P.sub }}>
              ← ก่อนหน้า
            </button>
          )}
          <button onClick={() => isLast ? handleClose() : setStep(s => s + 1)}
            style={{ flex: 2, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 15 }}>
            {isLast ? "เข้าใจแล้ว! เริ่มจองเลย 🎉" : "ถัดไป →"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Landing Screen ───────────────────────────────────────────────────
function LandingScreen({ settings, gallery, onBook }: any) {
  const [galleryIdx, setGalleryIdx] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem(TUTORIAL_KEY));
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    const token = getWalletToken();
    if (!token) return;
    fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance != null) setWalletBalance(parseFloat(d.balance)); })
      .catch(() => {});
  }, []);

  const socials = [
    { url: settings?.ig_url, icon: <Instagram size={20} />, label: "Instagram", color: "#E1306C" },
    { url: settings?.fb_url, icon: <Facebook size={20} />, label: "Facebook", color: "#1877F2" },
    { url: settings?.line_oa_url, icon: <MessageCircle size={20} />, label: "Line OA", color: "#06C755" },
    { url: settings?.tiktok_url, icon: <Video size={20} />, label: "TikTok", color: "#010101" },
  ].filter(s => s.url);

  return (
    <PageWrap>
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${P.pink} 0%, ${P.pinkLight} 100%)`, padding: "48px 24px 40px", textAlign: "center", borderRadius: "0 0 32px 32px" }}>
        {settings?.shop_logo_url ? (
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#fff", border: "3px solid rgba(255,255,255,0.9)", boxShadow: "0 4px 16px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", overflow: "hidden", flexShrink: 0 }}>
            <img src={settings.shop_logo_url} alt="logo" style={{ width: "86%", height: "86%", objectFit: "contain", display: "block" }} />
          </div>
        ) : (
          <div style={{ width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, margin: "0 auto 16px" }}>💅</div>
        )}
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, marginBottom: 8 }}>
          {settings?.shop_name || "ร้านทำเล็บ"}
        </h1>
        <p style={{ color: "rgba(255,255,255,0.9)", fontSize: 15, marginBottom: 24 }}>
          {settings?.shop_tagline || "ทำเล็บสวย สไตล์คุณ"}
        </p>
        <button
          onClick={onBook}
          style={{
            background: "#fff", color: P.pink, border: "none", borderRadius: 100, padding: "14px 36px",
            fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            display: "inline-flex", alignItems: "center", gap: 8,
          }}
        >
          <Calendar size={18} /> จองคิวเลย <ArrowRight size={16} />
        </button>

        <button onClick={() => setShowTutorial(true)}
          style={{ marginTop: 12, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 100, padding: "8px 20px", color: "rgba(255,255,255,0.9)", cursor: "pointer", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          <HelpCircle size={14} /> วิธีจอง / คำแนะนำ
        </button>

        {/* Wallet button — แสดงเสมอ (logged in: แสดงยอด, ไม่ได้ login: เชิญชวนเติมเงิน) */}
        <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/wallet"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.5)", borderRadius: 100, padding: "10px 22px", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
            <Wallet size={16} />
            {walletBalance !== null
              ? <>กระเป๋าเงิน · <span style={{ fontWeight: 800 }}>฿{walletBalance.toFixed(2)}</span></>
              : "กระเป๋าเงิน / เติมเงินมัดจำ"
            }
          </a>
          <a href="/my-bookings"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.5)", borderRadius: 100, padding: "10px 22px", color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>
            <Calendar size={16} /> การจองของฉัน
          </a>
        </div>
      </div>

      {/* Tutorial Popup */}
      <AnimatePresence>
        {showTutorial && <TutorialPopup onClose={() => setShowTutorial(false)} />}
      </AnimatePresence>

      {/* Social Links */}
      {socials.length > 0 && (
        <div style={{ padding: "20px 20px 4px" }}>
          <p style={{ color: P.sub, fontSize: 13, marginBottom: 12, textAlign: "center" }}>ติดต่อและติดตามเราได้ที่</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {socials.map(s => (
              <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${P.pinkBorder}`, borderRadius: 100, padding: "8px 16px", textDecoration: "none", color: P.text, fontSize: 14, fontWeight: 500 }}>
                <span style={{ color: s.color }}>{s.icon}</span> {s.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── จุดเด่นของเรา ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: P.text, textAlign: "center", marginBottom: 16, letterSpacing: 0.2 }}>
          ✨ ทำไมต้องเลือก {settings?.shop_name || "ร้านของเรา"}?
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {([
            { icon: "💅", title: "ช่างมือดี มีประสบการณ์", desc: "ทุกชิ้นงานเต็มที่ ใส่ใจทุกรายละเอียด ไม่รีบ ไม่มักง่าย" },
            { icon: "📱", title: "จองออนไลน์ได้ตลอด 24 ชม.", desc: "เลือกวัน เลือกเวลา ได้เอง ไม่ต้องรอทัก ไม่ต้องโทร" },
            { icon: "🎨", title: "หลากหลายสไตล์", desc: "เจล ต่อเล็บ เพ้นท์ลาย มีให้เลือกเยอะ ตามสไตล์คุณ" },
            { icon: "🔒", title: "มัดจำปลอดภัย", desc: "ระบบกระเป๋าเงินออนไลน์ โปร่งใส ตรวจสอบได้ทุกรายการ" },
            { icon: "⏰", title: "ตรงเวลา ไม่ให้รอนาน", desc: "จัดคิวแม่นยำ เห็นสถานะจองได้ทันทีหลังชำระมัดจำ" },
            { icon: "📸", title: "แกลเลอรีผลงานจริง", desc: "ดูตัวอย่างผลงานจริงจากร้าน เลือกลายได้ก่อนมาถึง" },
          ] as { icon: string; title: string; desc: string }[]).map(f => (
            <div key={f.title} style={{ background: "#fff", border: `1px solid ${P.pinkBorder}`, borderRadius: 14, padding: "14px 12px" }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: P.text, marginBottom: 4, lineHeight: 1.3 }}>{f.title}</div>
              <div style={{ fontSize: 11.5, color: P.muted, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Gallery */}
      {gallery.length > 0 && (
        <div style={{ padding: "24px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: P.text, display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={18} color={P.pink} /> แกลเลอรีผลงาน
            </h2>
            <span style={{ color: P.muted, fontSize: 13 }}>{gallery.length} ผลงาน</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {gallery.slice(0, 9).map((g: any) => (
              <div key={g.id} style={{ aspectRatio: "1", borderRadius: 12, overflow: "hidden", background: P.gray }}>
                <img src={g.image_url} alt={g.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
          {gallery.length > 9 && (
            <p style={{ textAlign: "center", color: P.muted, fontSize: 13, marginTop: 10 }}>+{gallery.length - 9} ผลงานอีก</p>
          )}
        </div>
      )}

      {/* CTA bottom */}
      <div style={{ padding: "28px 20px 0" }}>
        <button
          onClick={onBook}
          style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 16, padding: "16px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 20px var(--b-primary-55)`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          <Calendar size={20} /> จองคิวทำเล็บ
        </button>
      </div>
    </PageWrap>
  );
}

// ── Date Screen ──────────────────────────────────────────────────────
function DateScreen({ maxDays, closedDates = [], selected, onBack, onSelect }: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const closedSet = new Set<string>(closedDates);

  const dates = Array.from({ length: maxDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <PageWrap>
      <BackBtn onClick={onBack} />
      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>เลือกวันนัด</h2>
        <p style={{ color: P.sub, marginBottom: 20, fontSize: 14 }}>จองได้ล่วงหน้าสูงสุด {maxDays} วัน</p>
        {closedSet.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, fontSize: 12, color: P.muted }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: P.gray, border: `1px solid ${P.grayDark}` }} />
            วันปิดร้าน — ไม่รับจอง
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {dates.map(d => {
            const iso = toISO(d);
            const isSelected = selected === iso;
            const isToday = iso === toISO(today);
            const isClosed = closedSet.has(iso);
            return (
              <motion.button
                key={iso}
                whileTap={isClosed ? {} : { scale: 0.96 }}
                onClick={() => !isClosed && onSelect(iso)}
                style={{
                  background: isClosed ? P.gray : isSelected ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : "#fff",
                  border: `2px solid ${isClosed ? P.grayDark : isSelected ? P.pink : P.pinkBorder}`,
                  borderRadius: 14, padding: "14px 12px",
                  cursor: isClosed ? "not-allowed" : "pointer",
                  textAlign: "center",
                  color: isClosed ? P.muted : isSelected ? "#fff" : P.text,
                  opacity: isClosed ? 0.55 : 1,
                  boxShadow: isSelected ? `0 4px 16px var(--b-primary-44)` : "none",
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>
                  {d.toLocaleDateString("th-TH", { weekday: "short" })}
                  {isToday && " (วันนี้)"}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{d.getDate()}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {d.toLocaleDateString("th-TH", { month: "short" })}
                </div>
                {isClosed && (
                  <div style={{ fontSize: 10, marginTop: 4, color: P.muted, fontWeight: 600 }}>ปิดร้าน</div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </PageWrap>
  );
}

// ── Slot Screen ──────────────────────────────────────────────────────
function SlotScreen({ date, selected, onBack, onSelect }: any) {
  const { data: slots = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["nail-slots", date],
    queryFn: () => api.slots(date),
    enabled: !!date,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });

  return (
    <PageWrap>
      <BackBtn onClick={onBack} />
      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>เลือกเวลา</h2>
        <p style={{ color: P.sub, marginBottom: 20, fontSize: 14 }}>{fmtDate(date)}</p>

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} color={P.pink} className="animate-spin" /></div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <p style={{ color: P.sub, fontSize: 15 }}>โหลดข้อมูลไม่สำเร็จ</p>
            <button onClick={() => refetch()} style={{ marginTop: 12, background: P.pinkPale, color: P.pink, border: "none", borderRadius: 100, padding: "8px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>ลองใหม่</button>
          </div>
        ) : slots.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <p style={{ color: P.sub, fontSize: 15 }}>ไม่มีช่วงเวลาว่างในวันนี้</p>
            <p style={{ color: P.muted, fontSize: 13, marginTop: 4 }}>กรุณาเลือกวันอื่น</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {slots.filter((sl: any) => !sl.is_past).map((sl: any) => {
              const avail = sl.available;
              const isPast = false; // past slots are now hidden entirely
              const isSelected = selected?.id === sl.id;
              const remaining = sl.max_bookings > 1 ? Math.max(0, sl.max_bookings - sl.booked_count) : null;
              return (
                <motion.button
                  key={sl.id}
                  whileTap={avail ? { scale: 0.96 } : {}}
                  onClick={() => avail && onSelect(sl)}
                  style={{
                    background: !avail ? P.gray : isSelected ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : "#fff",
                    border: `2px solid ${isSelected ? P.pink : avail ? P.pinkBorder : P.grayDark}`,
                    borderRadius: 14, padding: "16px 12px", cursor: avail ? "pointer" : "not-allowed",
                    textAlign: "center", color: !avail ? P.muted : isSelected ? "#fff" : P.text,
                    opacity: !avail ? 0.55 : 1,
                    boxShadow: isSelected ? `0 4px 16px var(--b-primary-44)` : "none",
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{sl.start_time}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>ถึง {sl.end_time}</div>
                  {isPast
                    ? <div style={{ fontSize: 11, marginTop: 4, color: P.muted, fontWeight: 600 }}>⏱️ ผ่านไปแล้ว</div>
                    : !avail
                      ? <div style={{ fontSize: 11, marginTop: 4, color: P.muted, fontWeight: 600 }}>🔴 เต็มแล้ว</div>
                      : remaining !== null
                        ? <div style={{ fontSize: 11, marginTop: 4, color: isSelected ? "rgba(255,255,255,0.85)" : P.pink }}>ว่าง {remaining} ที่</div>
                        : null
                  }
                  {isSelected && <CheckCircle size={16} style={{ margin: "4px auto 0" }} />}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </PageWrap>
  );
}

// ── Info Screen ──────────────────────────────────────────────────────
function InfoScreen({ services, service, name, phone, line, note, defaultDeposit, onBack, onNext }: any) {
  const [sel, setSel] = useState<any>(service || null);
  const depositAmount = sel?.deposit_amount ?? defaultDeposit ?? null;
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone);
  const [ln, setLn] = useState(line || "");
  const [nt, setNt] = useState(note);
  const isLoggedIn = !!getWalletToken();

  // Pre-fill from wallet profile if logged in and fields are still empty
  useEffect(() => {
    const token = getWalletToken();
    if (!token) return;
    fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (d.display_name) setN((prev: string) => prev || d.display_name);
        if (d.phone_number)  setP((prev: string) => prev || d.phone_number);
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  const valid = n.trim() && p.trim().replace(/\D/g, "").length >= 9;

  return (
    <PageWrap>
      <BackBtn onClick={onBack} />
      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>ข้อมูลการจอง</h2>
        <p style={{ color: P.sub, marginBottom: 16, fontSize: 14 }}>กรอกข้อมูลเพื่อยืนยันการจอง</p>

        {/* Wallet prompt for non-logged-in users */}
        {!isLoggedIn && (
          <div style={{ background: P.pinkPale, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: 14, marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Wallet size={18} color={P.pink} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: P.text, margin: "0 0 3px" }}>💳 มีกระเป๋าเงินแล้ว?</p>
              <p style={{ fontSize: 12, color: P.sub, margin: "0 0 6px" }}>เข้าสู่ระบบก่อนเพื่อจ่ายมัดจำจากเครดิตทันที และระบบจะกรอกชื่อ-เบอร์ให้อัตโนมัติ</p>
              <a href="/wallet" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: P.pink, fontWeight: 700, textDecoration: "none" }}>สร้างบัญชี / เข้าสู่ระบบ →</a>
            </div>
          </div>
        )}
        {isLoggedIn && (
          <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 14, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#15803D", display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={15} /> กรอกข้อมูลจากกระเป๋าเงินอัตโนมัติแล้ว — แก้ไขได้ด้านล่าง
          </div>
        )}

        {/* Service selector — moved here from separate step */}
        {services?.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: P.sub, fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
              <span style={{ color: P.pink }}>💅</span>เลือกบริการ (ถ้ามี)
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {services.map((s: any) => (
                <button key={s.id} onClick={() => setSel(sel?.id === s.id ? null : s)}
                  style={{
                    background: sel?.id === s.id ? P.pinkPale : "#fff",
                    border: `2px solid ${sel?.id === s.id ? P.pink : P.pinkBorder}`,
                    borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                    textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                    boxShadow: sel?.id === s.id ? `0 0 0 2px var(--b-primary-22)` : "none",
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color ? `${s.color}22` : "var(--b-primary-22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💅</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: P.text, fontSize: 14 }}>{s.name}</div>
                    {s.description && <div style={{ color: P.sub, fontSize: 12 }}>{s.description}</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <span style={{ background: P.pinkPale, color: P.pink, borderRadius: 100, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}>฿{s.price?.toLocaleString()}</span>
                      <span style={{ background: P.gray, color: P.sub, borderRadius: 100, padding: "1px 8px", fontSize: 11 }}><Clock size={10} style={{ display: "inline" }} /> {s.duration_minutes} นาที</span>
                    </div>
                  </div>
                  {sel?.id === s.id && <CheckCircle size={18} color={P.pink} />}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="ชื่อ-นามสกุล *" icon={<User size={16} />}>
            <input value={n} onChange={e => setN(e.target.value)} placeholder="กรอกชื่อของคุณ" style={inputStyle} />
          </Field>
          <Field label="เบอร์โทรศัพท์ *" icon={<Phone size={16} />}>
            <input value={p} onChange={e => setP(e.target.value)} placeholder="0xx-xxx-xxxx" inputMode="tel" style={inputStyle} />
          </Field>
          <Field label="LINE ID (สำหรับติดต่อ)" icon={<MessageCircle size={16} />}>
            <input value={ln} onChange={e => setLn(e.target.value)} placeholder="@yourline หรือ LINE ID" style={inputStyle} />
          </Field>
          <Field label="หมายเหตุ (ถ้ามี)" icon={<StickyNote size={16} />}>
            <textarea value={nt} onChange={e => setNt(e.target.value)} placeholder="เช่น สีที่อยากได้, ดีไซน์พิเศษ..." rows={3}
              style={{ ...inputStyle, resize: "none" }} />
          </Field>
        </div>

        {/* แสดงค่ามัดจำจริงของการจองนี้ ก่อนไปหน้าชำระเงิน — ให้ลูกค้ารู้ล่วงหน้าชัดเจน */}
        {depositAmount != null && (
          <div style={{ marginTop: 20, background: P.pinkPale, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: P.sub, fontWeight: 500 }}>💳 ค่ามัดจำสำหรับการจองนี้</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: P.pinkDeep }}>฿{Number(depositAmount).toLocaleString()}</span>
          </div>
        )}

        <button
          onClick={() => valid && onNext(sel, n.trim(), p.trim(), ln.trim(), nt.trim())}
          disabled={!valid}
          style={{
            width: "100%", marginTop: 28,
            background: valid ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : P.gray,
            color: valid ? "#fff" : P.muted, border: "none", borderRadius: 16, padding: "16px",
            fontSize: 17, fontWeight: 700, cursor: valid ? "pointer" : "not-allowed",
            boxShadow: valid ? `0 4px 20px var(--b-primary-55)` : "none",
          }}
        >
          ถัดไป — ชำระมัดจำ <ArrowRight size={18} style={{ display: "inline" }} />
        </button>
      </div>
    </PageWrap>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 12,
  padding: "12px 14px", fontSize: 15, outline: "none", background: "#fff",
  color: P.text, fontFamily: "inherit", boxSizing: "border-box",
};

function Field({ label, icon, children }: any) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, color: P.sub, fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
        <span style={{ color: P.pink }}>{icon}</span>{label}
      </label>
      {children}
    </div>
  );
}

// ── Payment Screen ────────────────────────────────────────────────────────────
function PaymentScreen({ booking, onBack, onSuccess }: any) {
  const [holdData, setHoldData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [timer, setTimer] = useState(600);
  const [payError, setPayError] = useState("");
  const [slipUrl, setSlipUrl] = useState("");
  const [slipError, setSlipError] = useState("");
  const [slipSubmitted, setSlipSubmitted] = useState(false);

  const holdMutation = useMutation({
    mutationFn: () => api.hold({
      slot_id: booking.slot.id,
      service_id: booking.service?.id,
      customer_name: booking.name,
      customer_phone: booking.phone,
      customer_line: booking.line || undefined,
      customer_note: booking.note,
    }),
    onSuccess: data => setHoldData(data),
    onError: (e: any) => setPayError(e.message),
  });

  useEffect(() => { holdMutation.mutate(); }, []); // eslint-disable-line

  // คำนวณเวลาที่เหลือจาก held_until จริง
  useEffect(() => {
    if (!holdData?.held_until) return;
    const heldUntil = new Date(holdData.held_until).getTime();
    const remaining = Math.max(0, Math.floor((heldUntil - Date.now()) / 1000));
    setTimer(remaining);
  }, [holdData]);

  useEffect(() => {
    if (!holdData) return;
    const interval = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(interval); return 0; } return t - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [holdData]);

  const mm = String(Math.floor(timer / 60)).padStart(2, "0");
  const ss = String(timer % 60).padStart(2, "0");
  const copyAmount = () => {
    navigator.clipboard.writeText(String(holdData?.deposit_total?.toFixed(2)));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLoggedIn = !!getWalletToken();
  const walletBalance: number | null = holdData?.wallet_balance ?? null;
  const walletSufficient: boolean = !!holdData?.wallet_sufficient;

  const payWalletMutation = useMutation({
    mutationFn: () => api.payWallet(holdData.hold_token),
    onSuccess: () => onSuccess(holdData),
    onError: (e: any) => setPayError(e.message),
  });

  const submitSlipMutation = useMutation({
    mutationFn: async () => {
      if (!slipUrl.trim().startsWith("http")) throw new Error("กรุณาวางลิงก์ภาพที่ขึ้นต้นด้วย https://");
      const r = await fetch("/api/nail/booking/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hold_token: holdData.hold_token, payment_proof: slipUrl.trim() }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e?.detail || `HTTP ${r.status}`); }
      return r.json();
    },
    onSuccess: () => setSlipSubmitted(true),
    onError: (e: any) => setSlipError(e.message),
  });

  if (holdMutation.isPending) {
    return (
      <PageWrap>
        <div style={{ textAlign: "center", padding: 80 }}>
          <Loader2 size={36} color={P.pink} className="animate-spin" style={{ margin: "0 auto 16px" }} />
          <p style={{ color: P.sub }}>กำลังจองเวลาให้คุณ...</p>
        </div>
      </PageWrap>
    );
  }

  if (!holdData && payError) {
    return (
      <PageWrap>
        <BackBtn onClick={onBack} />
        <div style={{ padding: 20, textAlign: "center" }}>
          <AlertCircle size={40} color={P.error} style={{ margin: "0 auto 12px" }} />
          <p style={{ color: P.error, fontWeight: 600 }}>{payError}</p>
          <button onClick={onBack} style={{ marginTop: 16, background: P.pinkPale, color: P.pink, border: "none", borderRadius: 100, padding: "10px 24px", cursor: "pointer", fontWeight: 600 }}>กลับไปเลือกเวลา</button>
        </div>
      </PageWrap>
    );
  }

  // ถ้าส่งสลิป URL ไปแล้ว อย่าแสดง "หมดเวลา" — booking เป็น pending_payment แล้ว
  if (timer === 0 && !slipSubmitted) {
    return (
      <PageWrap>
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
          <p style={{ fontSize: 18, fontWeight: 700, color: P.text }}>หมดเวลา</p>
          <p style={{ color: P.sub, marginTop: 8, marginBottom: 20 }}>เวลาที่จองหมดอายุแล้ว กรุณาจองใหม่</p>
          <button onClick={onBack} style={{ background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 14, padding: "12px 28px", cursor: "pointer", fontWeight: 700 }}>
            จองใหม่
          </button>
        </div>
      </PageWrap>
    );
  }

  return (
    <PageWrap>
      <BackBtn onClick={onBack} />
      <div style={{ padding: "0 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700 }}>ชำระมัดจำ</h2>
            <p style={{ color: P.sub, fontSize: 14, marginTop: 4 }}>ใช้เครดิตในกระเป๋าเงิน</p>
          </div>
          <div style={{ background: timer < 120 ? "#FEF2F2" : P.pinkPale, border: `1px solid ${timer < 120 ? "#FECACA" : P.pinkBorder}`, borderRadius: 12, padding: "8px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: P.muted }}>เหลือเวลา</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: timer < 120 ? P.error : P.pink, fontVariantNumeric: "tabular-nums" }}>{mm}:{ss}</div>
          </div>
        </div>

        {/* Booking summary */}
        <div style={{ background: P.pinkPale, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: P.sub, marginBottom: 8 }}>สรุปการจอง</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SummaryRow icon="📅" label={fmtDate(booking.date!)} />
            <SummaryRow icon="🕐" label={`${holdData?.start_time} – ${holdData?.end_time}`} />
            {holdData?.service_name && <SummaryRow icon="💅" label={holdData.service_name} />}
            <SummaryRow icon="👤" label={holdData?.customer_name} />
            <SummaryRow icon="📱" label={booking.phone} />
          </div>
        </div>

        {/* Payment amount */}
        <div style={{ background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 16, padding: 20, marginBottom: 20, textAlign: "center" }}>
          <p style={{ color: P.sub, fontSize: 14, marginBottom: 8 }}>ยอดมัดจำที่ต้องชำระ</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <span style={{ fontSize: 36, fontWeight: 800, color: P.pink }}>
              ฿{holdData?.deposit_total?.toFixed(2)}
            </span>
            <button onClick={copyAmount} style={{ background: P.pinkPale, border: "none", borderRadius: 100, padding: "6px 14px", cursor: "pointer", color: P.pink, display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
              {copied ? <><Check size={14} /> คัดลอกแล้ว</> : <><Copy size={14} /> คัดลอก</>}
            </button>
          </div>
        </div>

        {/* Credit payment — primary (and only) payment method */}
        {!isLoggedIn ? (
          <div style={{ background: P.pinkPale, border: `2px solid ${P.pink}`, borderRadius: 16, padding: 20, textAlign: "center" }}>
            <Wallet size={36} color={P.pink} style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: P.text, marginBottom: 8 }}>ต้องเติมเครดิตก่อนจอง</p>
            <p style={{ fontSize: 13, color: P.sub, marginBottom: 16, lineHeight: 1.6 }}>
              ระบบรับชำระมัดจำจากเครดิตในกระเป๋าเงินเท่านั้น<br />
              กรุณาสมัครบัญชีและเติมเครดิตให้ครบ <b>฿{holdData?.deposit_total?.toFixed(2)}</b> ก่อน แล้วกลับมาจองใหม่
            </p>
            <a
              href="/wallet"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`,
                color: "#fff", borderRadius: 14, padding: "12px 24px",
                fontWeight: 700, fontSize: 15, textDecoration: "none",
                boxShadow: `0 4px 16px var(--b-primary-55)`,
              }}
            >
              <Wallet size={18} /> สมัคร / เติมเครดิต
            </a>
            <p style={{ fontSize: 11, color: P.muted, marginTop: 12 }}>หลังเติมเครดิตแล้ว กลับมาจองใหม่จากหน้าหลัก</p>
          </div>
        ) : (
          <div style={{ background: walletSufficient ? "#F0FDF4" : "#FFFBEB", border: `1.5px solid ${walletSufficient ? "#BBF7D0" : "#FDE68A"}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: P.text }}>💳 เครดิตในกระเป๋าเงิน</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: walletSufficient ? "#16A34A" : "#B45309" }}>
                ฿{walletBalance?.toFixed(2) ?? "0.00"}
              </span>
            </div>
            {walletSufficient ? (
              <button
                onClick={() => payWalletMutation.mutate()}
                disabled={payWalletMutation.isPending}
                style={{
                  width: "100%", background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "#fff",
                  border: "none", borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 700,
                  cursor: payWalletMutation.isPending ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {payWalletMutation.isPending ? <><Loader2 size={18} className="animate-spin" /> กำลังยืนยัน...</> : "จ่ายด้วยเครดิต ✓"}
              </button>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "#B45309", marginBottom: 12, fontWeight: 600 }}>
                  ⚠️ เครดิตไม่พอ — ต้องเติมเพิ่มอีก <b>฿{((holdData?.deposit_total ?? 0) - (walletBalance ?? 0)).toFixed(2)}</b>
                </p>
                <a
                  href="/wallet"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`,
                    color: "#fff", borderRadius: 14, padding: "13px",
                    fontWeight: 700, fontSize: 15, textDecoration: "none",
                    boxShadow: `0 4px 16px var(--b-primary-55)`,
                  }}
                >
                  <ArrowRight size={18} /> เติมเครดิตที่กระเป๋าเงิน
                </a>
                <p style={{ fontSize: 11, color: P.muted, marginTop: 8, textAlign: "center" }}>หลังเติมเครดิตแล้ว กลับมากดจ่ายด้านนี้ได้เลย</p>
              </div>
            )}
          </div>
        )}

        {payError && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 14px", color: P.error, fontSize: 14, marginTop: 16 }}>
            {payError}
          </div>
        )}

        {/* Bank Transfer + Slip URL option — แสดงเมื่อร้านตั้งค่าบัญชีธนาคารไว้ */}
        {(holdData?.bank_account_name || holdData?.bank_qr_url) && !slipSubmitted && (
          <div style={{ marginTop: 20, background: "#F8FAFF", border: `1.5px solid #C7D6F5`, borderRadius: 16, padding: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: P.text, marginBottom: 10 }}>💳 หรือโอนผ่านบัญชีธนาคาร</p>
            {holdData.bank_qr_url && (
              <div style={{ textAlign: "center", marginBottom: 12 }}>
                <img src={holdData.bank_qr_url} alt="QR PromptPay" style={{ maxWidth: 180, borderRadius: 12, border: "1px solid #C7D6F5" }} />
              </div>
            )}
            {holdData.bank_name && <p style={{ fontSize: 13, color: P.sub, marginBottom: 2 }}>ธนาคาร: <strong>{holdData.bank_name}</strong></p>}
            {holdData.bank_account_name && <p style={{ fontSize: 13, color: P.sub, marginBottom: 12 }}>ชื่อบัญชี: <strong>{holdData.bank_account_name}</strong></p>}
            <p style={{ fontSize: 12, color: P.muted, marginBottom: 8, lineHeight: 1.6 }}>
              หลังโอนแล้ว อัปโหลดสลิปที่{" "}
              <a href="https://imgbb.com" target="_blank" rel="noreferrer" style={{ color: P.pink, fontWeight: 600 }}>imgbb.com</a>
              {" "}แล้ววาง Direct Link ด้านล่าง
            </p>
            <input
              value={slipUrl}
              onChange={e => { setSlipUrl(e.target.value); setSlipError(""); }}
              placeholder="https://i.ibb.co/xxxx/slip.jpg"
              style={{ width: "100%", border: `1.5px solid ${slipError ? P.error : P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: "#fff" }}
            />
            {slipError && <p style={{ color: P.error, fontSize: 12, marginTop: 4 }}>{slipError}</p>}
            <button
              onClick={() => { if (!slipUrl.trim()) { setSlipError("กรุณาวางลิงก์สลิปก่อน"); return; } submitSlipMutation.mutate(); }}
              disabled={submitSlipMutation.isPending}
              style={{ width: "100%", marginTop: 10, background: `linear-gradient(135deg, #3B82F6, #1D4ED8)`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700, cursor: submitSlipMutation.isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
            >
              {submitSlipMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> กำลังส่ง...</> : "📎 ส่งสลิปให้แอดมินตรวจสอบ"}
            </button>
          </div>
        )}

        {/* Slip submitted confirmation */}
        {slipSubmitted && (
          <div style={{ marginTop: 20, background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 16, padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 4 }}>ส่งสลิปแล้ว</p>
            <p style={{ fontSize: 13, color: "#16A34A", lineHeight: 1.6 }}>แอดมินจะตรวจสอบและยืนยันการจองให้ภายในไม่นาน</p>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

function SummaryRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: P.text }}>
      <span style={{ fontSize: 16 }}>{icon}</span>{label}
    </div>
  );
}

// ── Success Screen ───────────────────────────────────────────────────
function SuccessScreen({ holdData, onHome }: any) {
  return (
    <PageWrap>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5 }}
        style={{ padding: "60px 28px", textAlign: "center" }}
      >
        <div style={{ width: 90, height: 90, borderRadius: "50%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: `0 8px 32px var(--b-primary-66)` }}>
          <CheckCircle size={44} color="#fff" />
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: P.text, marginBottom: 8 }}>จองคิวสำเร็จ! 🎉</h2>
        <p style={{ color: P.sub, fontSize: 16, marginBottom: 24 }}>รอแอดมินยืนยันการชำระเงิน</p>

        <div style={{ background: P.pinkPale, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 16, padding: 20, marginBottom: 28, textAlign: "left" }}>
          <div style={{ fontSize: 12, color: P.muted, marginBottom: 10 }}>หมายเลขการจอง</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: P.pink, letterSpacing: 2 }}>{holdData?.booking_ref}</div>
          <div style={{ height: 1, background: P.pinkBorder, margin: "14px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {holdData?.slot_date && <SummaryRow icon="📅" label={fmtDate(holdData.slot_date)} />}
            {holdData?.start_time && <SummaryRow icon="🕐" label={`${holdData.start_time} – ${holdData.end_time}`} />}
            {holdData?.service_name && <SummaryRow icon="💅" label={holdData.service_name} />}
            {holdData?.customer_name && <SummaryRow icon="👤" label={holdData.customer_name} />}
          </div>
        </div>

        <p style={{ color: P.muted, fontSize: 13, marginBottom: 24 }}>ระบบจะส่งการยืนยันผ่านช่องทางที่คุณให้ไว้ หรือคุณสามารถติดต่อร้านโดยตรง</p>

        <button
          onClick={onHome}
          style={{ background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 16, padding: "14px 32px", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 16px var(--b-primary-55)` }}
        >
          กลับหน้าหลัก
        </button>
      </motion.div>
    </PageWrap>
  );
}
