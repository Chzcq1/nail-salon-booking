/**
 * BookingPage — หน้าจองคิวร้านทำเล็บ (Gen Z UX, Candy Pink + White)
 * Route: /
 */
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Instagram, Facebook, Clock, ChevronLeft, ChevronRight,
  Phone, User, StickyNote, CheckCircle, AlertCircle,
  Loader2, Calendar, Sparkles, Copy, Check, ArrowRight, X,
  MessageCircle, Video, HelpCircle, Wallet, Upload, Printer, Search,
  Building2, Palette, MapPin, Scissors,
} from "lucide-react";
import { getTheme, injectThemeCss, DEFAULT_THEME } from "@/theme";
import { useShopSlug, shopQs } from "@/lib/shopSlugContext";

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

// ── Wallet session (แชร์ token เดียวกับ /wallet) — ต้องตรงกับ WalletPage.tsx/StoreFront.tsx
// key ต้อง scope ต่อร้าน (slug) ไม่งั้น token ร้านหนึ่งจะไปปนกับอีกร้าน
function getWalletToken(slug: string | null): string { return sessionStorage.getItem(`wallet_token_${slug || "default"}`) || ""; }

// ── Image helpers ────────────────────────────────────────────────────
/** บีบอัดรูปภาพก่อนอัปโหลด — คืน base64 data URI */
async function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        const MAX = 1600;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas ctx null")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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

/** Factory — สร้าง api object ที่ฝัง slug ไว้ทุก call */
function makeApi(slug: string | null) {
  const sq = (extra?: string) => shopQs(slug, extra);
  return {
    settings:  () => fetch(`/api/nail/settings${sq()}`).then(r => r.json()),
    gallery:   () => fetch(`/api/nail/gallery${sq()}`).then(r => r.json()),
    services:  () => fetch(`/api/nail/services${sq()}`).then(r => r.json()),
    slots:     (date: string) => fetch(`/api/nail/slots${sq(`date=${date}`)}`).then(r => r.json()),
    hold: async (body: object) => {
      const token = getWalletToken(slug);
      const r = await fetch(`/api/nail/booking/hold${sq()}`, {
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
    pay: async (body: object) => {
      const r = await fetch(`/api/nail/booking/pay${sq()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await parseApiError(r));
      return r.json();
    },
    payWallet: async (hold_token: string, ref_image?: string) => {
      const token = getWalletToken(slug);
      const r = await fetch(`/api/nail/booking/pay-wallet${sq()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hold_token, ...(ref_image ? { ref_image } : {}) }),
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
}

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
  const slug = useShopSlug();
  const api = makeApi(slug);

  const [step, setStep] = useState<Step>("landing");
  const [booking, setBooking] = useState<BookingState>({
    service: null, date: null, slot: null,
    name: "", phone: "", line: "", note: "", holdData: null,
  });

  const { data: shopSettings, isError: settingsError } = useQuery({
    queryKey: ["nail-settings", slug], queryFn: api.settings, staleTime: 15000, retry: 1,
  });

  // Inject brand theme whenever brand_color changes
  useEffect(() => {
    injectThemeCss(getTheme(shopSettings?.brand_color));
  }, [shopSettings?.brand_color]);

  const { data: gallery = [] } = useQuery({
    queryKey: ["nail-gallery", slug], queryFn: api.gallery, staleTime: 120000, retry: 1,
  });
  const { data: services = [] } = useQuery({
    queryKey: ["nail-services", slug], queryFn: api.services, staleTime: 120000, retry: 1,
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
            onSelect={(d: any) => { setBooking(b => ({ ...b, date: d, slot: null })); go("slot"); }}
          />
        )}
        {step === "slot" && (
          <SlotScreen
            key="slot"
            date={booking.date!}
            selected={booking.slot}
            services={services}
            preService={booking.service}
            onBack={() => go("date")}
            onSelect={(sl: any, svc: any) => { setBooking(b => ({ ...b, slot: sl, service: svc ?? b.service })); go("info"); }}
          />
        )}
        {step === "info" && (
          <InfoScreen
            key="info"
            slot={booking.slot}
            services={services}
            service={booking.service}
            name={booking.name}
            phone={booking.phone}
            line={booking.line}
            note={booking.note}
            defaultDeposit={shopSettings?.deposit_amount}
            serviceEmoji={shopSettings?.service_section_emoji || "💅"}
            onBack={() => go("slot")}
            onNext={(service: any, name: any, phone: any, line: any, note: any) => {
              setBooking(b => ({ ...b, service, name, phone, line, note }));
              go("payment");
            }}
          />
        )}
        {step === "payment" && (
          <PaymentScreen
            key="payment"
            booking={booking}
            serviceEmoji={shopSettings?.service_section_emoji || "💅"}
            onBack={() => go("info")}
            onSuccess={(holdData: any) => { setBooking(b => ({ ...b, holdData })); go("success"); }}
          />
        )}
        {step === "success" && (
          <SuccessScreen
            key="success"
            holdData={booking.holdData}
            phone={booking.phone}
            shopName={shopSettings?.shop_name}
            mapUrl={shopSettings?.map_url}
            bookingPolicy={shopSettings?.booking_policy}
            serviceEmoji={shopSettings?.service_section_emoji || "💅"}
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
  const slug = useShopSlug();
  const walletHref = slug ? `/r/${slug}/wallet` : "/wallet";
  const bookingsHref = slug ? `/r/${slug}/my-bookings` : "/my-bookings";
  const [galleryIdx, setGalleryIdx] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [showTutorial, setShowTutorial] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  // ── Status check modal ──
  const [showStatusCheck, setShowStatusCheck] = useState(false);
  const [scRef, setScRef] = useState("");
  const [scPhone, setScPhone] = useState("");
  const [scResult, setScResult] = useState<any>(null);
  const [scError, setScError] = useState("");
  const [scLoading, setScLoading] = useState(false);

  const doStatusCheck = async () => {
    const ref = scRef.trim().toUpperCase();
    const phone = scPhone.trim();
    if (!ref && !phone) { setScError("กรุณากรอกรหัสคิวหรือเบอร์โทรอย่างน้อยหนึ่งอย่าง"); return; }
    setScLoading(true); setScError(""); setScResult(null);
    try {
      const params = new URLSearchParams();
      if (ref) params.append("ref", ref);
      if (phone) params.append("phone", phone);
      if (slug) params.append("shop", slug);
      const r = await fetch(`/api/nail/booking/public-status?${params}`);
      if (!r.ok) { const e = await r.json(); setScError(e.detail || "ไม่พบข้อมูลการจอง"); }
      else setScResult(await r.json());
    } catch { setScError("เกิดข้อผิดพลาด กรุณาลองใหม่"); }
    setScLoading(false);
  };

  useEffect(() => {
    const token = getWalletToken(slug);
    if (!token) return;
    fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance != null) setWalletBalance(parseFloat(d.balance)); })
      .catch(() => {});
  }, [slug]);

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

      </div>

      {/* Tutorial Popup */}
      <AnimatePresence>
        {showTutorial && <TutorialPopup onClose={() => setShowTutorial(false)} />}
      </AnimatePresence>

      {/* ── Wallet + My Bookings cards ── */}
      <div style={{ padding: "20px 16px 4px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <a href={walletHref} style={{ textDecoration: "none", background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 18, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Wallet size={26} color={P.pink} />
          <div style={{ fontWeight: 700, fontSize: 14, color: P.text }}>กระเป๋าเงิน</div>
          <div style={{ fontSize: 12, color: P.muted }}>
            {walletBalance !== null ? `฿${walletBalance.toFixed(2)}` : "เติมเงินมัดจำ"}
          </div>
        </a>
        <a href={bookingsHref} style={{ textDecoration: "none", background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 18, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Calendar size={26} color={P.pink} />
          <div style={{ fontWeight: 700, fontSize: 14, color: P.text }}>การจองของฉัน</div>
          <div style={{ fontSize: 12, color: P.muted }}>ดูประวัติ / ตรวจสอบ</div>
        </a>
      </div>

      {/* ── ตรวจสอบสถานะการจอง ── */}
      <div style={{ padding: "10px 16px 0", textAlign: "center" }}>
        <button onClick={() => { setShowStatusCheck(true); setScResult(null); setScError(""); }}
          style={{ background: "none", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 100, padding: "9px 20px", fontSize: 13, fontWeight: 600, color: P.pink, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "inherit" }}>
          <Search size={14} /> ตรวจสอบสถานะการจอง
        </button>
      </div>

      {/* Social Links + Map */}
      {(socials.length > 0 || settings?.map_url) && (
        <div style={{ padding: "20px 20px 4px" }}>
          <p style={{ color: P.sub, fontSize: 13, marginBottom: 12, textAlign: "center" }}>ติดต่อและติดตามเราได้ที่</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {socials.map(s => (
              <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${P.pinkBorder}`, borderRadius: 100, padding: "8px 16px", textDecoration: "none", color: P.text, fontSize: 14, fontWeight: 500 }}>
                <span style={{ color: s.color }}>{s.icon}</span> {s.label}
              </a>
            ))}
            {settings?.map_url && (
              <a href={settings.map_url} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${P.pinkBorder}`, borderRadius: 100, padding: "8px 16px", textDecoration: "none", color: P.text, fontSize: 14, fontWeight: 500 }}>
                📍 แผนที่ร้าน
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── จุดเด่นของเรา — ร้านเปิด/ปิด และแก้เนื้อหาเองได้ผ่านหน้าตั้งค่า ── */}
      {(settings?.show_why_choose_section ?? true) && (
        <div style={{ padding: "28px 20px 0" }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: P.text, textAlign: "center", marginBottom: 16, letterSpacing: 0.2 }}>
            {settings?.why_choose_heading || `✨ ทำไมต้องเลือก ${settings?.shop_name || "ร้านของเรา"}?`}
          </h2>
          {settings?.why_choose_custom_text ? (
            <div style={{ background: "#fff", border: `1px solid ${P.pinkBorder}`, borderRadius: 14, padding: "16px 16px", whiteSpace: "pre-wrap", fontSize: 13.5, color: P.text, lineHeight: 1.7 }}>
              {settings.why_choose_custom_text}
            </div>
          ) : (
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
          )}
        </div>
      )}

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

      {/* spacer so content isn't hidden behind sticky bar */}
      <div style={{ height: 96 }} />

      {/* Floating help button */}
      <button
        onClick={() => setShowTutorial(true)}
        style={{
          position: "fixed", bottom: 88, left: 16, zIndex: 900,
          width: 44, height: 44, borderRadius: "50%",
          background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`,
          border: "none", cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <HelpCircle size={20} color="#fff" />
      </button>

      {/* Sticky bottom CTA */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 480,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(10px)",
        borderTop: `1px solid ${P.pinkBorder}`, padding: "12px 16px 20px", zIndex: 800,
        boxSizing: "border-box",
      }}>
        <button
          onClick={onBook}
          style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 16, padding: "15px", fontSize: 17, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 20px var(--b-primary-55)`, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          <Calendar size={20} /> จองคิวทำเล็บ
        </button>
      </div>
      {/* ── Status Check Modal ── */}
      {showStatusCheck && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowStatusCheck(false); }}>
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480, boxSizing: "border-box" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Search size={20} color={P.pink} />
                <span style={{ fontSize: 17, fontWeight: 800, color: P.text }}>ตรวจสอบสถานะการจอง</span>
              </div>
              <button onClick={() => setShowStatusCheck(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={22} color={P.muted} />
              </button>
            </div>

            {/* Form */}
            {!scResult ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: P.sub, display: "block", marginBottom: 6 }}>รหัสคิว (เช่น #00001) <span style={{ fontWeight: 400, color: P.muted }}>— กรอกอย่างใดอย่างนึง</span></label>
                  <input value={scRef} onChange={e => setScRef(e.target.value.replace(/^#/, ""))}
                    placeholder="รหัสคิว" maxLength={20}
                    style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: P.sub, display: "block", marginBottom: 6 }}>เบอร์โทรที่ใช้จอง <span style={{ fontWeight: 400, color: P.muted }}>— กรอกอย่างใดอย่างนึง</span></label>
                  <input value={scPhone} onChange={e => setScPhone(e.target.value)} type="tel" placeholder="0812345678" maxLength={15}
                    style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                </div>
                {scError && (
                  <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: P.error }}>{scError}</div>
                )}
                <button onClick={doStatusCheck} disabled={scLoading}
                  style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 15, fontWeight: 700, cursor: scLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {scLoading ? <><Loader2 size={16} className="animate-spin" /> กำลังตรวจสอบ…</> : <><Search size={16} /> ตรวจสอบสถานะ</>}
                </button>
              </div>
            ) : (
              /* Result */
              <div>
                <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 16, padding: 18, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#15803D", fontWeight: 600, marginBottom: 4 }}>รหัสคิว</div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: P.pink, letterSpacing: 2, marginBottom: 14 }}>#{scResult.booking_ref}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {scResult.slot_date && <SummaryRow icon={<Calendar size={15} />} label={fmtDate(scResult.slot_date)} />}
                    {scResult.start_time && <SummaryRow icon={<Clock size={15} />} label={`${scResult.start_time} – ${scResult.end_time}`} />}
                    {scResult.service_name && <SummaryRow icon={<Scissors size={15} />} label={scResult.service_name} />}
                    {scResult.customer_name && <SummaryRow icon={<User size={15} />} label={scResult.customer_name} />}
                  </div>
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #BBF7D0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, color: "#15803D" }}>สถานะ</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: scResult.status === "confirmed" || scResult.status === "wallet_paid" || scResult.status === "completed" ? "#16A34A" : scResult.status === "cancelled" ? P.error : "#D97706" }}>
                      {scResult.status_label}
                    </span>
                  </div>
                </div>
                <button onClick={() => { setScResult(null); setScRef(""); setScPhone(""); }}
                  style={{ width: "100%", background: "none", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: "12px", fontSize: 14, fontWeight: 600, color: P.pink, cursor: "pointer", fontFamily: "inherit" }}>
                  ตรวจสอบรหัสคิวอื่น
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

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
function SlotScreen({ date, selected, services = [], preService, onBack, onSelect }: any) {
  const slug = useShopSlug();
  const api = makeApi(slug);
  const { data: slots = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["nail-slots", date, slug],
    queryFn: () => api.slots(date),
    enabled: !!date,
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });

  // บริการที่เลือกล่วงหน้า (ใช้สำหรับกรองสล็อตที่สั้นเกินไป)
  const [selService, setSelService] = useState<any>(preService || null);

  const activeSlots = slots.filter((sl: any) => sl.is_past !== true);

  // คำนวณระยะเวลาสล็อต (นาที) จาก start_time และ end_time
  function slotDurMin(sl: any): number | null {
    try {
      const [sh, sm] = (sl.start_time as string).split(":").map(Number);
      const [eh, em] = (sl.end_time as string).split(":").map(Number);
      return (eh * 60 + em) - (sh * 60 + sm);
    } catch { return null; }
  }

  return (
    <PageWrap>
      <BackBtn onClick={onBack} />
      <div style={{ padding: "0 20px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>เลือกเวลา</h2>
        <p style={{ color: P.sub, marginBottom: 14, fontSize: 14 }}>{fmtDate(date)}</p>

        {/* ── Service pre-filter — กรองสล็อตตามระยะเวลาบริการที่เลือก ── */}
        {services.length > 0 && (
          <div style={{ marginBottom: 16, background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: "12px 14px" }}>
            <label style={{ fontSize: 12, color: P.sub, fontWeight: 600, display: "block", marginBottom: 8 }}>
              💅 เลือกบริการก่อน (เพื่อดูเฉพาะสล็อตที่เวลาเพียงพอ)
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              <button
                onClick={() => setSelService(null)}
                style={{
                  background: !selService ? P.pinkPale : "#f5f5f5",
                  border: `1.5px solid ${!selService ? P.pink : "#ddd"}`,
                  borderRadius: 100, padding: "5px 14px", cursor: "pointer",
                  fontSize: 12, fontWeight: !selService ? 700 : 400,
                  color: !selService ? P.pinkDeep : P.sub, fontFamily: "inherit",
                }}>
                ทั้งหมด
              </button>
              {services.map((s: any) => {
                const isSel = selService?.id === s.id;
                return (
                  <button key={s.id} onClick={() => setSelService(isSel ? null : s)}
                    style={{
                      background: isSel ? P.pinkPale : "#f5f5f5",
                      border: `1.5px solid ${isSel ? P.pink : "#ddd"}`,
                      borderRadius: 100, padding: "5px 14px", cursor: "pointer",
                      fontSize: 12, fontWeight: isSel ? 700 : 400,
                      color: isSel ? P.pinkDeep : P.sub, fontFamily: "inherit",
                    }}>
                    {s.name} <span style={{ opacity: 0.7 }}>({s.duration_minutes}น.)</span>
                  </button>
                );
              })}
            </div>
            {selService && (
              <p style={{ fontSize: 11, color: P.muted, marginTop: 8, marginBottom: 0 }}>
                ⏱ บริการ "{selService.name}" ใช้เวลา {selService.duration_minutes} นาที — สล็อตที่สั้นเกินไปจะแสดงสีเทา
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} color={P.pink} className="animate-spin" /></div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <p style={{ color: P.sub, fontSize: 15 }}>โหลดข้อมูลไม่สำเร็จ</p>
            <button onClick={() => refetch()} style={{ marginTop: 12, background: P.pinkPale, color: P.pink, border: "none", borderRadius: 100, padding: "8px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>ลองใหม่</button>
          </div>
        ) : activeSlots.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <p style={{ color: P.sub, fontSize: 15 }}>
              {slots.length > 0 ? "ช่วงเวลาของวันนี้ผ่านไปหมดแล้ว" : "ไม่มีช่วงเวลาว่างในวันนี้"}
            </p>
            <p style={{ color: P.muted, fontSize: 13, marginTop: 4 }}>กรุณาเลือกวันอื่น</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {activeSlots.map((sl: any) => {
              const avail = sl.available;
              const isSelected = selected?.id === sl.id;
              const remaining = sl.max_bookings > 1 ? Math.max(0, sl.max_bookings - sl.booked_count) : null;
              // ตรวจสอบว่าสล็อตนี้สั้นเกินไปสำหรับบริการที่เลือก
              const dur = slotDurMin(sl);
              const tooShort = !!(selService && dur !== null && selService.duration_minutes > dur);
              const clickable = avail && !tooShort;
              return (
                <motion.button
                  key={sl.id}
                  whileTap={clickable ? { scale: 0.96 } : {}}
                  onClick={() => clickable && onSelect(sl, selService)}
                  style={{
                    background: tooShort ? "#F5F5F5" : !avail ? P.gray : isSelected ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : "#fff",
                    border: `2px solid ${isSelected ? P.pink : tooShort ? "#E0E0E0" : avail ? P.pinkBorder : P.grayDark}`,
                    borderRadius: 14, padding: "16px 12px", cursor: clickable ? "pointer" : "not-allowed",
                    textAlign: "center", color: tooShort ? P.muted : !avail ? P.muted : isSelected ? "#fff" : P.text,
                    opacity: tooShort ? 0.5 : !avail ? 0.55 : 1,
                    boxShadow: isSelected ? `0 4px 16px var(--b-primary-44)` : "none",
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{sl.start_time}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>ถึง {sl.end_time}</div>
                  {tooShort
                    ? <div style={{ fontSize: 10, marginTop: 4, color: "#B0B0B0", fontWeight: 600 }}>⚠️ เวลาไม่พอ ({dur}น.)</div>
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
function InfoScreen({ slot, services, service, name, phone, line, note, defaultDeposit, serviceEmoji, onBack, onNext }: any) {
  const svcIcon = serviceEmoji || "💅";
  const slug = useShopSlug();
  const walletHref = slug ? `/r/${slug}/wallet` : "/wallet";
  const [sel, setSel] = useState<any>(service || null);
  const depositAmount = sel?.deposit_amount ?? defaultDeposit ?? null;
  const [n, setN] = useState(name);
  const [p, setP] = useState(phone);
  const [ln, setLn] = useState(line || "");
  const [nt, setNt] = useState(note);
  const isLoggedIn = !!getWalletToken(slug);

  // Pre-fill from wallet profile if logged in and fields are still empty
  useEffect(() => {
    const token = getWalletToken(slug);
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

  // ตรวจสอบว่าระยะเวลาบริการที่เลือกไม่เกินความยาวของสล็อต
  const slotDuration = slot ? (() => {
    try {
      const [sh, sm] = (slot.start_time as string).split(':').map(Number);
      const [eh, em] = (slot.end_time as string).split(':').map(Number);
      return (eh * 60 + em) - (sh * 60 + sm);
    } catch { return null; }
  })() : null;
  const slotTooShort = !!(sel && slotDuration !== null && (sel.duration_minutes ?? 0) > slotDuration);

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
              <a href={walletHref} style={{ fontSize: 12, color: P.pink, fontWeight: 700, textDecoration: "none" }}>สร้างบัญชี / เข้าสู่ระบบ →</a>
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
              <span style={{ color: P.pink }}>{svcIcon}</span>เลือกบริการ (ถ้ามี)
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
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color ? `${s.color}22` : "var(--b-primary-22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{svcIcon}</div>
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

        {slotTooShort && (
          <div style={{ background: "#FFF8E1", border: "1.5px solid #FFAB00", borderRadius: 12, padding: "10px 14px", marginBottom: 8, fontSize: 13, color: "#6D4C00", display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <div>
              <strong>สล็อตเวลานี้สั้นเกินไป</strong><br />
              บริการ "{sel?.name}" ต้องใช้เวลา <strong>{sel?.duration_minutes} นาที</strong> แต่สล็อตที่เลือกมีเพียง {slotDuration} นาที — กรุณากลับไปเลือกสล็อตเวลาที่ยาวกว่า
            </div>
          </div>
        )}
        <button
          onClick={() => valid && !slotTooShort && onNext(sel, n.trim(), p.trim(), ln.trim(), nt.trim())}
          disabled={!valid || slotTooShort}
          style={{
            width: "100%", marginTop: 12,
            background: (!valid || slotTooShort) ? P.gray : `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`,
            color: (!valid || slotTooShort) ? P.muted : "#fff", border: "none", borderRadius: 16, padding: "16px",
            fontSize: 17, fontWeight: 700, cursor: (!valid || slotTooShort) ? "not-allowed" : "pointer",
            boxShadow: (!valid || slotTooShort) ? "none" : `0 4px 20px var(--b-primary-55)`,
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
function PaymentScreen({ booking, onBack, onSuccess, serviceEmoji }: any) {
  const svcIcon = serviceEmoji || "💅";
  const slug = useShopSlug();
  const api = makeApi(slug);
  const walletHref = slug ? `/r/${slug}/wallet` : "/wallet";
  const [holdData, setHoldData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAcct, setCopiedAcct] = useState(false);
  const [timer, setTimer] = useState(600);
  const [payError, setPayError] = useState("");
  // รูปอ้างอิงแบบงาน (brief) — ใช้เมื่อร้านเปิด allow_ref_image
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);
  const refImageRef = useRef<HTMLInputElement>(null);

  // slip payment (ไม่ต้อง login)
  const [payTab, setPayTab] = useState<"slip" | "wallet">("slip");
  const [slipBase64, setSlipBase64] = useState<string | null>(null);
  const [slipName, setSlipName] = useState("");
  const slipInputRef = useRef<HTMLInputElement>(null);

  // ใช้ ref ติดตาม hold_token, payment status และ mount state
  const holdTokenRef   = useRef<string | null>(null);
  const paymentDoneRef = useRef(false);
  const isMountedRef   = useRef(true);
  // flag กันไม่ให้ release hold เมื่อ navigate ไปหน้า wallet (ไม่ใช่ abandon)
  const navigatingToWalletRef = useRef(false);

  // key ใน sessionStorage สำหรับ resume hold หลังกลับจากหน้า wallet
  const holdResumeKey = `nail_hold_resume_${slug || "default"}`;

  /** ปล่อย hold กลับคืนถ้ายังไม่ได้ชำระเงิน — fire-and-forget */
  const doRelease = (token: string) => {
    fetch("/api/nail/booking/hold", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold_token: token }),
    }).catch(() => {});
  };

  const releaseHold = () => {
    if (!holdTokenRef.current || paymentDoneRef.current || navigatingToWalletRef.current) return;
    const token = holdTokenRef.current;
    holdTokenRef.current = null;
    doRelease(token);
  };

  const handleBack = () => { releaseHold(); onBack(); };

  /** เรียกก่อน navigate ไปหน้า wallet — เซฟ hold ไว้ resume ตอนกลับ */
  const saveHoldForWallet = () => {
    if (!holdData) return;
    navigatingToWalletRef.current = true;
    sessionStorage.setItem(holdResumeKey, JSON.stringify(holdData));
  };

  const holdMutation = useMutation({
    mutationFn: () => api.hold({
      slot_id: booking.slot.id,
      service_id: booking.service?.id,
      customer_name: booking.name,
      customer_phone: booking.phone,
      customer_line: booking.line || undefined,
      customer_note: booking.note,
    }),
    onSuccess: data => {
      holdTokenRef.current = data.hold_token;
      // race condition guard: ถ้า component unmount ก่อน response กลับมา ให้ release ทันที
      if (!isMountedRef.current) { doRelease(data.hold_token); return; }
      setHoldData(data);
    },
    onError: (e: any) => { if (isMountedRef.current) setPayError(e.message); },
  });

  // Mount: ลอง resume hold เดิม (จาก wallet top-up flow) ถ้าหมดอายุแล้วค่อยสร้างใหม่
  useEffect(() => {
    isMountedRef.current = true;
    const saved = sessionStorage.getItem(holdResumeKey);
    if (saved) {
      sessionStorage.removeItem(holdResumeKey);
      try {
        const data = JSON.parse(saved);
        if (new Date(data.held_until).getTime() > Date.now()) {
          // hold ยังไม่หมดอายุ — resume โดยไม่สร้าง hold ใหม่
          holdTokenRef.current = data.hold_token;
          setHoldData(data);
          return () => { isMountedRef.current = false; releaseHold(); }; // eslint-disable-line
        }
      } catch {}
      // hold หมดอายุแล้ว หรือ parse ไม่ได้ — สร้างใหม่
    }
    holdMutation.mutate();
    return () => { isMountedRef.current = false; releaseHold(); }; // eslint-disable-line
  }, []); // eslint-disable-line

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

  // reactive: re-read sessionStorage เมื่อ tab ได้ focus กลับมา (เช่น หลังเติมเครดิต)
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!getWalletToken(slug));
  useEffect(() => {
    const refresh = () => setIsLoggedIn(!!getWalletToken(slug));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [slug]);

  const walletBalance: number | null = holdData?.wallet_balance ?? null;
  const walletSufficient: boolean = !!holdData?.wallet_sufficient;

  const payWalletMutation = useMutation({
    mutationFn: async () => {
      // อัปโหลดรูปบรีฟก่อน (ถ้าร้านเปิดฟีเจอร์และลูกค้าเลือกรูปมา)
      let refImageUrl: string | undefined;
      if (refImageFile && holdData?.allow_ref_image) {
        const refBase64 = await compressImage(refImageFile);
        const refUploadRes = await api.uploadSlip(refBase64);
        if (refUploadRes?.url) refImageUrl = refUploadRes.url;
      }
      return api.payWallet(holdData.hold_token, refImageUrl);
    },
    onSuccess: () => { paymentDoneRef.current = true; onSuccess(holdData); },
    onError: (e: any) => setPayError(e.message),
  });

  const paySlipMutation = useMutation({
    mutationFn: async () => {
      if (!slipBase64) throw new Error("กรุณาแนบสลิปการโอนเงินก่อน");
      const uploadRes = await api.uploadSlip(slipBase64);
      if (!uploadRes?.url) throw new Error("อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
      // อัปโหลดรูปบรีฟพร้อมกันถ้าร้านเปิดฟีเจอร์และลูกค้าเลือกรูปมา (ส่งเป็น base64 ตรง)
      let refImageBase64: string | undefined;
      if (refImageFile && holdData?.allow_ref_image) {
        refImageBase64 = await compressImage(refImageFile);
      }
      return api.pay({
        hold_token: holdData.hold_token,
        payment_proof: uploadRes.url,
        ...(refImageBase64 ? { ref_image: refImageBase64 } : {}),
      });
    },
    onSuccess: (data: any) => { paymentDoneRef.current = true; onSuccess({ ...holdData, ...data }); },
    onError: (e: any) => setPayError(e.message),
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

  if (timer === 0) {
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
      <BackBtn onClick={handleBack} />
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
            <SummaryRow icon={<Calendar size={15} />} label={fmtDate(booking.date!)} />
            <SummaryRow icon={<Clock size={15} />} label={`${holdData?.start_time} – ${holdData?.end_time}`} />
            {holdData?.service_name && <SummaryRow icon={<Scissors size={15} />} label={holdData.service_name} />}
            <SummaryRow icon={<User size={15} />} label={holdData?.customer_name} />
            <SummaryRow icon={<Phone size={15} />} label={booking.phone} />
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

        {/* ── Payment method tabs ── */}
        <div style={{ display: "flex", borderRadius: 12, border: `1.5px solid ${P.pinkBorder}`, overflow: "hidden", marginBottom: 16 }}>
          {(["slip", "wallet"] as const).map(t => (
            <button key={t} onClick={() => setPayTab(t)}
              style={{ flex: 1, padding: "10px 6px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                background: payTab === t ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : "#fff",
                color: payTab === t ? "#fff" : P.sub, transition: "all .18s" }}>
              {t === "slip" ? "📸 โอนสลิป" : "💳 กระเป๋าเงิน"}
            </button>
          ))}
        </div>

        {/* Hidden slip file input */}
        <input ref={slipInputRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setSlipName(file.name);
            setSlipBase64(await compressImage(file));
            e.target.value = "";
          }} />

        {payTab === "slip" ? (
          /* ── Slip payment (no login required) ── */
          <div>
            {/* Bank account info card */}
            {(holdData?.bank_account_number || holdData?.bank_name) && (
              <div style={{ background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Building2 size={16} color={P.pink} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: P.text }}>ข้อมูลบัญชีรับโอน</span>
                </div>
                {holdData.bank_name && (
                  <div style={{ fontSize: 13, color: P.sub, marginBottom: 8 }}>
                    ธนาคาร: <span style={{ color: P.text, fontWeight: 600 }}>{holdData.bank_name}</span>
                  </div>
                )}
                {holdData.bank_account_name && (
                  <div style={{ fontSize: 13, color: P.sub, marginBottom: 8 }}>
                    ชื่อบัญชี: <span style={{ color: P.text, fontWeight: 600 }}>{holdData.bank_account_name}</span>
                  </div>
                )}
                {holdData.bank_account_number && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: P.pink, letterSpacing: 2 }}>
                      {holdData.bank_account_number}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(holdData.bank_account_number);
                        setCopiedAcct(true);
                        setTimeout(() => setCopiedAcct(false), 2000);
                      }}
                      style={{ background: copiedAcct ? "#DCFCE7" : P.pinkPale, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: copiedAcct ? "#16A34A" : P.pink, display: "flex", alignItems: "center", gap: 5, fontWeight: 600, fontSize: 12, flexShrink: 0 }}>
                      {copiedAcct ? <><Check size={13} /> คัดลอกแล้ว</> : <><Copy size={13} /> คัดลอก</>}
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 11, color: P.muted, marginTop: 4 }}>แก้ไขได้ในบัญชีร้านค้า</div>
              </div>
            )}

            {/* Instruction */}
            <div style={{ background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 14, padding: 14, marginBottom: 14 }}>
              <p style={{ fontSize: 12, color: "#1E40AF", fontWeight: 600, marginBottom: 4 }}>📸 แนบสลิปโอนเงิน <span style={{ background: P.pink, color: "#fff", borderRadius: 100, padding: "1px 8px", fontSize: 11 }}>จำเป็น</span></p>
              <p style={{ fontSize: 11.5, color: "#3B82F6", lineHeight: 1.5, margin: 0 }}>
                โอน <b>฿{holdData?.deposit_total?.toFixed(2)}</b> เข้าบัญชีด้านบน → ถ่ายรูปสลิป → แนบที่นี่
              </p>
            </div>

            {slipBase64 ? (
              <div style={{ position: "relative", marginBottom: 14, textAlign: "center" }}>
                <img src={slipBase64} alt="slip" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 12, border: `1.5px solid ${P.pinkBorder}`, display: "block", margin: "0 auto" }} />
                <button onClick={() => { setSlipBase64(null); setSlipName(""); }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={14} color="#fff" />
                </button>
                <p style={{ fontSize: 11, color: P.muted, marginTop: 4 }}>{slipName}</p>
              </div>
            ) : (
              <button onClick={() => slipInputRef.current?.click()}
                style={{ width: "100%", background: P.pinkPale, border: `2px dashed ${P.pink}`, borderRadius: 14, padding: "20px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: "inherit", marginBottom: 14 }}>
                <Upload size={24} color={P.pink} />
                <span style={{ color: P.pink, fontWeight: 700, fontSize: 14 }}>แตะเพื่อแนบสลิป</span>
                <span style={{ color: P.muted, fontSize: 11 }}>JPG, PNG — ไม่เกิน 5MB</span>
              </button>
            )}

            <button onClick={() => paySlipMutation.mutate()} disabled={!slipBase64 || paySlipMutation.isPending}
              style={{ width: "100%", background: slipBase64 ? `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})` : P.gray,
                color: slipBase64 ? "#fff" : P.muted, border: "none", borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 700,
                cursor: slipBase64 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {paySlipMutation.isPending ? <><Loader2 size={18} className="animate-spin" /> กำลังส่งสลิป…</> : "📸 ส่งสลิปยืนยัน"}
            </button>
          </div>
        ) : !isLoggedIn ? (
          /* ── Wallet tab: not logged in ── */
          <div style={{ background: P.pinkPale, border: `2px solid ${P.pink}`, borderRadius: 16, padding: 20, textAlign: "center" }}>
            <Wallet size={36} color={P.pink} style={{ margin: "0 auto 12px" }} />
            <p style={{ fontSize: 16, fontWeight: 700, color: P.text, marginBottom: 8 }}>เข้าสู่ระบบก่อนใช้กระเป๋าเงิน</p>
            <p style={{ fontSize: 13, color: P.sub, marginBottom: 16, lineHeight: 1.6 }}>
              กรุณาสมัครบัญชีและเติมเครดิตให้ครบ <b>฿{holdData?.deposit_total?.toFixed(2)}</b>
            </p>
            <a href={walletHref} onClick={saveHoldForWallet}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", borderRadius: 14, padding: "12px 24px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
              <Wallet size={18} /> สมัคร / เข้าสู่ระบบ
            </a>
          </div>
        ) : (
          /* ── Wallet tab: logged in ── */
          <div style={{ background: walletSufficient ? "#F0FDF4" : "#FFFBEB", border: `1.5px solid ${walletSufficient ? "#BBF7D0" : "#FDE68A"}`, borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: P.text }}>💳 เครดิตในกระเป๋าเงิน</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: walletSufficient ? "#16A34A" : "#B45309" }}>
                ฿{walletBalance?.toFixed(2) ?? "0.00"}
              </span>
            </div>
            {walletSufficient ? (
              <button onClick={() => payWalletMutation.mutate()} disabled={payWalletMutation.isPending}
                style={{ width: "100%", background: "linear-gradient(135deg, #22C55E, #16A34A)", color: "#fff", border: "none", borderRadius: 14, padding: "14px", fontSize: 16, fontWeight: 700, cursor: payWalletMutation.isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {payWalletMutation.isPending ? <><Loader2 size={18} className="animate-spin" /> กำลังยืนยัน...</> : "จ่ายด้วยเครดิต ✓"}
              </button>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: "#B45309", marginBottom: 12, fontWeight: 600 }}>
                  ⚠️ เครดิตไม่พอ — ต้องเติมเพิ่มอีก <b>฿{((holdData?.deposit_total ?? 0) - (walletBalance ?? 0)).toFixed(2)}</b>
                </p>
                <a href={walletHref} onClick={saveHoldForWallet}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", borderRadius: 14, padding: "13px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                  <ArrowRight size={18} /> เติมเครดิตที่กระเป๋าเงิน
                </a>
                <button onClick={() => { releaseHold(); holdMutation.mutate(); }} disabled={holdMutation.isPending}
                  style={{ width: "100%", marginTop: 10, background: "none", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: "11px", fontSize: 14, fontWeight: 600, color: P.pink, cursor: holdMutation.isPending ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {holdMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> กำลังตรวจสอบ...</> : "🔄 เติมแล้ว — ตรวจสอบยอดใหม่"}
                </button>
              </div>
            )}
          </div>
        )}

        {payError && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "10px 14px", color: P.error, fontSize: 14, marginTop: 16 }}>
            {payError}
          </div>
        )}

        {/* รูปอ้างอิงแบบงาน (brief) — แสดงเมื่อร้านเปิดฟีเจอร์ allow_ref_image */}
        {holdData?.allow_ref_image && (
          <div style={{ marginTop: 16, background: "#F5F3FF", border: "1.5px solid #DDD6FE", borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Palette size={16} color="#7C3AED" />
              <p style={{ fontSize: 14, fontWeight: 700, color: "#5B21B6", margin: 0 }}>แนบรูปอ้างอิงแบบงาน <span style={{ fontSize: 12, fontWeight: 400, color: "#7C3AED" }}>(ไม่บังคับ)</span></p>
            </div>
            <p style={{ fontSize: 12, color: "#7C3AED", marginBottom: 10, lineHeight: 1.5 }}>ช่างจะได้เห็นว่าคุณอยากได้แบบไหน เช่น รูปจาก Pinterest หรือ Instagram</p>
            {/* Hidden file input */}
            <input
              ref={refImageRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setRefImageFile(file);
                setRefImagePreview(URL.createObjectURL(file));
              }}
            />
            {refImagePreview ? (
              <div style={{ textAlign: "center", marginBottom: 8, position: "relative", display: "inline-block", width: "100%" }}>
                <img src={refImagePreview} alt="ref preview" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 12, border: "1.5px solid #DDD6FE", display: "block", margin: "0 auto" }} />
                <button
                  onClick={() => { setRefImageFile(null); setRefImagePreview(null); if (refImageRef.current) refImageRef.current.value = ""; }}
                  style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                >
                  <X size={14} color="#fff" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => refImageRef.current?.click()}
                style={{ width: "100%", background: "#EDE9FE", border: "2px dashed #A78BFA", borderRadius: 12, padding: "18px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontFamily: "inherit" }}
              >
                <Upload size={22} color="#7C3AED" />
                <span style={{ color: "#7C3AED", fontWeight: 600, fontSize: 13 }}>แตะเพื่อเพิ่มรูปอ้างอิง</span>
                <span style={{ color: "#A78BFA", fontSize: 11 }}>รองรับ JPG, PNG — ไม่เกิน 5MB</span>
              </button>
            )}
            {refImagePreview && (
              <button onClick={() => refImageRef.current?.click()} style={{ background: "none", border: "none", color: "#7C3AED", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", marginTop: 4 }}>
                เปลี่ยนรูป
              </button>
            )}
          </div>
        )}

      </div>
    </PageWrap>
  );
}

function SummaryRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: P.text }}>
      <span style={{ display: "flex", alignItems: "center", color: P.pink, flexShrink: 0 }}>{icon}</span>{label}
    </div>
  );
}

// ── Success Screen — Thermal Receipt Printer Style ─────────────────
function SuccessScreen({ holdData, phone, onHome, serviceEmoji, shopName, mapUrl, bookingPolicy }: any) {
  const svcIcon = serviceEmoji || "💅";
  const isConfirmed = holdData?.status === "confirmed" || holdData?.status === "wallet_paid";
  const [copied, setCopied] = useState(false);

  // 🔊 Printer buzzing sound on mount
  useEffect(() => {
    try {
      const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      const sr = ctx.sampleRate;
      const dur = 1.4; // seconds
      const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        // Intermittent buzz pattern: 18 pulses/sec like dot-matrix
        const pulse = Math.sin(2 * Math.PI * 18 * t) > 0.3 ? 1 : 0;
        const env = Math.pow(Math.max(0, 1 - t / dur), 0.4);
        d[i] = (Math.random() * 2 - 1) * 0.07 * pulse * env;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.2;
      src.connect(bp); bp.connect(ctx.destination);
      src.start(); src.stop(ctx.currentTime + dur);
    } catch { /* AudioContext not available */ }
  }, []);

  const copyRef = () => {
    navigator.clipboard?.writeText(holdData?.booking_ref || "").then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const rows: { icon: ReactNode; label: string; val: string | null | undefined }[] = [
    { icon: <Calendar size={14} />, label: "วันที่",  val: holdData?.slot_date ? fmtDate(holdData.slot_date) : null },
    { icon: <Clock size={14} />,    label: "เวลา",   val: holdData?.start_time ? `${holdData.start_time} – ${holdData.end_time}` : null },
    { icon: <Scissors size={14} />, label: "บริการ", val: holdData?.service_name },
    { icon: <User size={14} />,     label: "ชื่อ",   val: holdData?.customer_name },
  ].filter(r => r.val);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: P.offwhite, fontFamily: "inherit" }}>
      <style>{`
        @keyframes receiptSlide {
          from { max-height: 0; opacity: 0; transform: translateY(-8px); }
          to   { max-height: 1200px; opacity: 1; transform: translateY(0); }
        }
        .receipt-paper { animation: receiptSlide 1.3s cubic-bezier(0.22,1,0.36,1) 0.25s both; overflow: hidden; }
        @media print {
          body * { visibility: hidden !important; }
          #nail-receipt, #nail-receipt * { visibility: visible !important; }
          #nail-receipt { position: fixed !important; inset: 0 !important; padding: 28px !important; background: #fff !important; }
          .no-print { display: none !important; }
          .receipt-paper { animation: none !important; max-height: none !important; overflow: visible !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>

      {/* ── Status bar "RECEIPT PRINTER" ── */}
      <div className="no-print" style={{ background: "#111827", padding: "10px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 2 }}>RECEIPT PRINTER</span>
        </div>
        <button onClick={onHome}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#4ade80", fontSize: 11, fontWeight: 700, letterSpacing: 1.5, fontFamily: "inherit" }}>
          ✓ DONE
        </button>
      </div>

      {/* ── Hero gradient ── */}
      <div style={{ background: `linear-gradient(155deg, ${P.pinkDeep} 0%, ${P.pink} 100%)`, padding: "32px 24px 52px", textAlign: "center", position: "relative" }}>
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
          <div style={{ width: 62, height: 62, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.75)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <CheckCircle size={34} color="#fff" />
          </div>
          <h2 style={{ fontSize: 21, fontWeight: 800, color: "#fff", marginBottom: 10 }}>
            {isConfirmed ? "จองคิวสำเร็จ! 🎉" : "ส่งสลิปเรียบร้อย! 🎉"}
          </h2>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,0.22)", backdropFilter: "blur(8px)", borderRadius: 100, padding: "8px 18px" }}>
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>
              🏪 {isConfirmed ? "ยืนยันแล้ว" : "รอร้านยืนยัน"}
            </span>
          </div>
        </motion.div>
      </div>

      {/* ── Receipt paper rolling out ── */}
      <div className="receipt-paper">
        <div id="nail-receipt" style={{ background: "#fff", margin: "0 14px", borderRadius: "0 0 18px 18px", boxShadow: "0 12px 32px rgba(0,0,0,0.15)" }}>

          {/* Shop name header (pink band) */}
          <div style={{ background: P.pinkPale, padding: "13px 20px", textAlign: "center", borderBottom: `1px dashed ${P.pinkBorder}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: P.pink }}>{shopName || "ร้านทำเล็บ"}</div>
            <div style={{ fontSize: 11, color: P.muted, marginTop: 2 }}>ใบยืนยันการจอง / ใบเสร็จมัดจำ</div>
          </div>

          <div style={{ padding: "18px 18px 22px" }}>
            {/* Booking ref + copy */}
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: P.muted, marginBottom: 4 }}>รหัสการจอง</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: P.pink, letterSpacing: 2 }}>
                  {holdData?.booking_ref}
                </span>
                <button onClick={copyRef}
                  style={{ background: P.pinkPale, border: `1px solid ${P.pinkBorder}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: P.pink, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                  {copied ? <><Check size={11} /> คัดลอกแล้ว</> : <><Copy size={11} /> คัดลอก</>}
                </button>
              </div>
            </div>

            <div style={{ border: `1px dashed ${P.pinkBorder}`, margin: "10px 0" }} />

            {/* Receipt rows */}
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                <span style={{ color: P.sub }}>{r.icon} {r.label}</span>
                <span style={{ fontWeight: 600, color: P.text, textAlign: "right", maxWidth: "58%" }}>{r.val}</span>
              </div>
            ))}

            <div style={{ border: `1px dashed ${P.pinkBorder}`, margin: "10px 0" }} />

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: P.text }}>ยอดมัดจำที่ชำระ</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: P.pink }}>฿{holdData?.deposit_total?.toFixed(2)}</span>
            </div>

            {/* Map link */}
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 12, background: "#EFF6FF", border: "1.5px solid #BFDBFE", borderRadius: 14, padding: "13px 15px", textDecoration: "none", marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#3B82F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MapPin size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1E40AF" }}>นำทางร้าน</div>
                  <div style={{ fontSize: 11.5, color: "#3B82F6" }}>กดเพื่อเปิด Google Maps</div>
                </div>
              </a>
            )}

            {/* Booking policy notice */}
            {bookingPolicy && (
              <div style={{ background: "#FFFBEB", border: "1.5px solid #FDE68A", borderRadius: 12, padding: "11px 13px" }}>
                <div style={{ fontSize: 12.5, color: "#78350F", lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                  {bookingPolicy}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Action buttons ── */}
      <div className="no-print" style={{ padding: "18px 16px 32px", display: "flex", flexDirection: "column", gap: 10 }}>
        <button onClick={() => window.print()}
          style={{ width: "100%", background: "#fff", color: P.pink, border: `2px solid ${P.pink}`, borderRadius: 14, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
          <Printer size={16} /> พิมพ์ใบเสร็จ / บันทึก PDF
        </button>
        <button onClick={onHome}
          style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 14, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: `0 4px 16px var(--b-primary-55)` }}>
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  );
}
