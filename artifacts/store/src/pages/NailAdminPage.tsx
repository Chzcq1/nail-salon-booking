/**
 * NailAdminPage — ระบบจัดการร้านทำเล็บ (Admin Backend)
 * Route: /admin  และ  /nail-admin
 * Theme: Rose Gold (เข้มกว่าหน้าลูกค้า — รู้สึกเป็น professional backend)
 */
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Calendar, Scissors, Clock, Image, Settings,
  Plus, Trash2, CheckCircle, XCircle, Loader2, RefreshCw,
  Phone, User, AlertCircle, Upload, ChevronRight, TrendingUp,
  Banknote, Users, ArrowLeft, Edit2, Save, X, Ban, RotateCcw,
  MessageCircle, Package, Crown, ChevronLeft, Palette, ChevronUp, ChevronDown,
  Wallet, CreditCard, Bell, Settings2, AlertTriangle, Paperclip, ExternalLink,
  Receipt, Smartphone, FileText,
} from "lucide-react";
import { BRAND_THEMES, getTheme, injectThemeCss } from "@/theme";
import { useShopSlug } from "@/lib/shopSlugContext";

// ── Admin theme — derives from the shop's brand_color so the backend
// office matches the customer-facing storefront (e.g. a car wash shouldn't
// be stuck with candy pink). Non-brand colors (text/status) stay fixed. ──
const STATIC_A = {
  card:      "#FFFFFF",
  text:      "#1A1A2E",
  sub:       "#45455F",    // เพิ่มความเข้มจาก #5A5A7A — ผ่าน WCAG AA
  muted:     "#666680",    // เพิ่มความเข้มจาก #9090A8 — ผ่าน WCAG AA
  gray:      "#F0F0F8",
  grayBorder:"#E0E0EE",
  success:   "#2E7D32",
  successBg: "#E8F5E9",
  error:     "#C62828",
  errorBg:   "#FFEBEE",
  warning:   "#E65100",
  warningBg: "#FFF3E0",
  info:      "#1565C0",
  infoBg:    "#E3F2FD",
} as const;

// Brand-dependent colors reference the CSS custom properties injected by
// injectThemeCss() (see theme.ts) — this makes EVERY tab component in this
// file (Dashboard, Bookings, Services, Settings, ...) follow the shop's
// brand_color automatically, with no prop drilling. injectThemeCss() is
// called as early as possible (see NailAdminPage below) using the shop's
// brand_color, fetched from the public /api/nail/settings endpoint so it
// applies even before login. index.css defines fallback --b-* values
// (candy pink) so the very first paint — before that fetch resolves — is
// never unstyled.
const A = {
  ...STATIC_A,
  primary: "var(--b-primary)",
  light:   "var(--b-light)",
  pale:    "var(--b-pale)",
  border:  "var(--b-border)",
  deep:    "var(--b-deep)",
  bg:      "var(--b-bg)",
} as const;

type Tab = "dashboard" | "inbox" | "bookings" | "services" | "schedule" | "gallery" | "settings" | "staff" | "renewal" | "accounts";

// คำนวณเวลาสล็อตที่จะถูกสร้างจากเทมเพลต (ใช้แสดง preview ก่อนบันทึก)
function computeSlotTimes(startTime: string, count: number, roundMin: number, gapMin: number): string[] {
  if (!startTime || count <= 0 || roundMin <= 0) return [];
  const parts = startTime.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return [];
  const fmt = (total: number) =>
    `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return Array.from({ length: Math.min(count, 12) }, (_, i) => {
    const s = h * 60 + m + i * (roundMin + gapMin);
    return `${fmt(s)}–${fmt(s + roundMin)}`;
  });
}

// ใช้วันที่ตาม "เวลาท้องถิ่น" ของเบราว์เซอร์ ห้ามใช้ toISOString() เพราะจะแปลงเป็น UTC
// แล้วทำให้วันที่เลื่อนถอยหลัง 1 วันสำหรับโซนเวลาไทย (UTC+7) เช่น เลือกวันที่ 9 กลายเป็นวันที่ 8
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
}
function fmtDateLong(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });
}

// ช่องกรอกตัวเลข (จำนวนคิว/นาที/รับกี่คน ฯลฯ) — เก็บค่าที่พิมพ์เป็น string ระหว่างแก้ไข
// เพื่อให้ "ลบทุกหลักจนว่าง" ได้จริง ไม่ใช่เด้งกลับเป็น 0 ทันทีจนดูเหมือนลบไม่ออก (ติดเลขตัวแรก)
// ค่าจะถูก parse เป็นตัวเลขจริงตอนพิมพ์เสร็จ (ถ้า parse ได้) และ fallback เป็นค่าต่ำสุดตอนออกจากช่อง (blur) ถ้าปล่อยว่างไว้
function NumberField({
  value, onChange, min, max, step, placeholder, style,
}: {
  value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  return (
    <input
      type="number" min={min} max={max} step={step} placeholder={placeholder}
      value={raw}
      onChange={e => {
        const v = e.target.value;
        setRaw(v);
        if (v === "" || v === "-") return; // ให้ลบว่างหรือพิมพ์ - นำหน้าได้โดยไม่ถูกบังคับ parse ทันที
        const n = Number(v);
        if (!Number.isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        const n = Number(raw);
        if (raw === "" || Number.isNaN(n)) {
          const fallback = min ?? 0;
          setRaw(String(fallback));
          onChange(fallback);
        }
      }}
      style={style}
    />
  );
}

/** TimeSelect — ตัวเลือกเวลาแบบ select ชั่วโมง + นาที แยกกัน
 *  ใช้แทน <input type="time"> เพราะ iOS Safari บางรุ่นไม่แสดง minute wheel */
const MINUTE_STEPS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
function TimeSelect({
  value, onChange, style,
}: {
  value: string; onChange: (v: string) => void; style?: React.CSSProperties;
}) {
  const parts = (value || "00:00").split(":");
  const hh = parseInt(parts[0] ?? "0", 10);
  const mm = parseInt(parts[1] ?? "0", 10);
  // round mm down to nearest 5
  const mmSnapped = MINUTE_STEPS.reduce((prev, cur) => Math.abs(cur - mm) < Math.abs(prev - mm) ? cur : prev, 0);

  const selStyle: React.CSSProperties = {
    border: "1px solid var(--b-border)",
    borderRadius: 8,
    padding: "7px 4px",
    fontFamily: "inherit",
    fontSize: 13,
    background: "#fff",
    appearance: "auto" as const,
    WebkitAppearance: "menulist" as const,
    cursor: "pointer",
    ...style,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <select
        value={hh}
        onChange={e => onChange(`${String(+e.target.value).padStart(2, "0")}:${String(mmSnapped).padStart(2, "0")}`)}
        style={{ ...selStyle, flex: 1, minWidth: 0 }}
      >
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
        ))}
      </select>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--b-primary)", flexShrink: 0 }}>:</span>
      <select
        value={mmSnapped}
        onChange={e => onChange(`${String(hh).padStart(2, "0")}:${String(+e.target.value).padStart(2, "0")}`)}
        style={{ ...selStyle, flex: 1, minWidth: 0 }}
      >
        {MINUTE_STEPS.map(m => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  );
}

const statusColor: Record<string, string> = {
  held:            A.warning,
  pending_payment: A.info,
  confirmed:       A.success,
  cancelled:       A.error,
  completed:       "#6A1B9A",
  walkin:          "#E65100",
};
const statusBg: Record<string, string> = {
  held:            A.warningBg,
  pending_payment: A.infoBg,
  confirmed:       A.successBg,
  cancelled:       A.errorBg,
  completed:       "#F3E5F5",
  walkin:          "#FFF3E0",
};
const statusLabel: Record<string, string> = {
  held:            "รอชำระ",
  pending_payment: "รอตรวจสลิป",
  confirmed:       "ยืนยันแล้ว",
  cancelled:       "ยกเลิก",
  completed:       "เสร็จสิ้น",
  walkin:          "Walk-in",
};

// ── Themed confirm dialog (replaces browser's native confirm() to match shop theme) ──
function ConfirmDialog({ open, title, message, danger, onCancel, onConfirm, loading }: {
  open: boolean; title?: string; message: string; danger?: boolean;
  onCancel: () => void; onConfirm: () => void; loading?: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 20 }}
          onClick={onCancel}>
          <motion.div initial={{ scale: 0.9, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            onClick={e => e.stopPropagation()}
            style={{ background: A.card, borderRadius: 20, padding: 26, maxWidth: 340, width: "100%", boxShadow: "0 16px 48px rgba(136,14,79,0.3)", textAlign: "center", fontFamily: "'Prompt', sans-serif" }}>
            <div style={{ width: 54, height: 54, borderRadius: "50%", background: danger ? A.errorBg : A.pale, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>
              {danger ? "🗑️" : "💅"}
            </div>
            {title && <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 6 }}>{title}</h3>}
            <p style={{ color: A.sub, fontSize: 14, marginBottom: 22, lineHeight: 1.5 }}>{message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onCancel} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 12, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: A.text }}>
                ยกเลิก
              </button>
              <button onClick={onConfirm} disabled={loading}
                style={{ flex: 1, background: danger ? `linear-gradient(135deg, ${A.error}, #7A0000)` : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", cursor: loading ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : "ยืนยัน"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const authH = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

async function aFetch(url: string, token: string, opts?: RequestInit) {
  const r = await fetch(url, { ...opts, headers: { ...authH(token), ...(opts?.headers || {}) } });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
  return d;
}

// ── Web Audio beep (no external file needed) ─────────────────────────────────
function playBookingAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const play = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    play(880, 0, 0.18);
    play(1100, 0.22, 0.18);
    play(1320, 0.44, 0.3);
  } catch { /* ignore in environments where AudioContext is unavailable */ }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NailAdminPage() {
  const slug = useShopSlug();
  const [tab, setTab] = useState<Tab>("dashboard");
  // Key แยกตาม slug เพื่อไม่ให้ร้าน A กับ B ใช้ token เดียวกัน
  const storageKey = `nail_admin_token${slug ? `_${slug}` : ""}`;
  const [token, setToken] = useState(() => localStorage.getItem(storageKey) || "");

  // ซิงก์ token เมื่อ slug เปลี่ยน (SPA navigation ระหว่างร้าน)
  useEffect(() => {
    const stored = localStorage.getItem(storageKey) || "";
    setToken(stored);
  }, [storageKey]);

  // ── Subscription expiry gate — blocks all admin tabs if shop has expired ──
  const shopKeyForGate = slug ?? "default";
  const qcGate = useQueryClient();

  // ── Brand theme — fetch via the PUBLIC settings endpoint (no auth needed) so the
  // admin backend (including the login screen) matches the shop's brand_color from
  // the very first paint, not just after visiting the Settings tab. ──
  const { data: publicSettings } = useQuery<any>({
    queryKey: ["nail-admin-public-theme", shopKeyForGate],
    queryFn: () => fetch(`/api/nail/settings${slug ? `?shop_slug=${encodeURIComponent(slug)}` : ""}`).then(r => r.ok ? r.json() : null),
    staleTime: 60000,
    retry: 1,
  });
  useEffect(() => { injectThemeCss(getTheme(publicSettings?.brand_color)); }, [publicSettings?.brand_color]);
  const {
    data: rentalGate,
    isLoading: rentalGateLoading,
    isError: rentalGateError,
    error: rentalGateErrorObj,
  } = useQuery<any>({
    queryKey: ["nail-admin-rental-status", shopKeyForGate],
    queryFn: () =>
      fetch("/api/nail/admin/rental-status", {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => {
        if (r.status === 401 || r.status === 403) throw new Error("UNAUTHORIZED");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    enabled: !!token,
    staleTime: 30_000,
    // Auto-poll every 30 s while expired so the block lifts automatically after renewal
    refetchInterval: (query) => (query.state.data?.is_expired ? 30_000 : false),
    retry: 1,
    retryDelay: 2000,
  });

  // Auto-logout when token is expired/invalid (401/403 from rental-status)
  useEffect(() => {
    if (rentalGateError && (rentalGateErrorObj as Error)?.message === "UNAUTHORIZED") {
      localStorage.removeItem(storageKey);
      setToken("");
    }
  }, [rentalGateError, rentalGateErrorObj, storageKey]);

  // ── Pending inbox count — for the badge on the inbox tab ─────────────────
  // Must be here (before early returns) to satisfy Rules of Hooks
  const { data: inboxBookings = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-inbox-count", slug ?? "default"],
    queryFn: () =>
      fetch(`/api/nail/admin/bookings?status=pending_payment&limit=500`, {
        headers: authH(token),
      }).then(r => r.json()),
    enabled: !!token,
    refetchInterval: 20000,
    staleTime: 10000,
    retry: 1,
  });
  const inboxCount = Array.isArray(inboxBookings) ? inboxBookings.length : 0;

  const [newBookingAlert, setNewBookingAlert] = useState(false);
  const knownBookingIds = useRef<Set<number>>(new Set());
  const isFirstPoll = useRef(true);
  const lastPollDate = useRef("");

  // ── Background booking poller (runs when admin is logged in AND subscription active) ──
  useEffect(() => {
    // Do not poll sensitive booking data while:
    //   • not logged in
    //   • rental status is still loading (rentalGate undefined)
    //   • shop subscription is expired
    if (!token || rentalGate === undefined || rentalGate?.is_expired) return;
    // Reset detection state every time a new session starts
    knownBookingIds.current = new Set();
    isFirstPoll.current = true;
    lastPollDate.current = "";

    const poll = async () => {
      const today = toISO(new Date());
      // Reset on date rollover so midnight bookings don't trigger false alerts
      if (lastPollDate.current && lastPollDate.current !== today) {
        knownBookingIds.current = new Set();
        isFirstPoll.current = true;
      }
      lastPollDate.current = today;
      try {
        const res = await fetch(`/api/nail/admin/bookings?date=${today}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const bookings: Array<{ id: number; status: string }> = await res.json();
        if (isFirstPoll.current) {
          // Seed known IDs on first load — don't alert for existing bookings
          bookings.forEach(b => knownBookingIds.current.add(b.id));
          isFirstPoll.current = false;
          return;
        }
        const incoming = bookings.filter(b => !knownBookingIds.current.has(b.id));
        if (incoming.length > 0) {
          incoming.forEach(b => knownBookingIds.current.add(b.id));
          playBookingAlert();
          setNewBookingAlert(true);
        }
      } catch { /* silent — do not crash admin UI */ }
    };
    poll(); // immediate first poll
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, [token, rentalGate?.is_expired]); // eslint-disable-line

  // login steps: "passcode" → "otp" (Telegram) หรือ "totp" (Google Authenticator)
  const [loginStep, setLoginStep] = useState<"passcode" | "otp" | "totp">("passcode");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1 — ตรวจรหัสผ่าน ขอ OTP หรือ TOTP
  const handlePasscode = async () => {
    if (!passcodeInput.trim()) return;
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/nail/admin/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput, ...(slug ? { shop_slug: slug } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        // backend ส่ง method: 'totp' สำหรับร้านใหม่, 'otp' สำหรับร้านเดิม
        if (data?.method === "totp") {
          setLoginStep("totp");
        } else {
          setLoginStep("otp");
        }
      } else {
        setAuthError(data?.detail || "รหัสผ่านไม่ถูกต้อง");
      }
    } catch {
      setAuthError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  // Step 2a — ยืนยัน Telegram OTP รับ JWT
  const handleOTP = async () => {
    if (!otpInput.trim()) return;
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/nail/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_code: otpInput, ...(slug ? { shop_slug: slug } : {}) }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem(storageKey, data.access_token);
        setToken(data.access_token);
        setAuthError("");
      } else {
        setAuthError(data?.detail || "OTP ไม่ถูกต้อง");
      }
    } catch {
      setAuthError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  // Step 2b — ยืนยัน Google Authenticator TOTP รับ JWT
  const handleTOTP = async () => {
    if (otpInput.length !== 6) return;
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/nail/admin/login/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput, totp_code: otpInput, ...(slug ? { shop_slug: slug } : {}) }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem(storageKey, data.access_token);
        setToken(data.access_token);
        setAuthError("");
      } else {
        setAuthError(data?.detail || "รหัส TOTP ไม่ถูกต้อง");
      }
    } catch {
      setAuthError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 12,
    padding: "12px 14px", fontSize: 15, outline: "none", marginBottom: 12,
    boxSizing: "border-box", fontFamily: "inherit", background: A.bg, color: A.text,
  };

  if (!token) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: A.bg, fontFamily: "'Prompt', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ background: A.card, borderRadius: 24, padding: "40px 32px", maxWidth: 360, width: "100%", boxShadow: "0 8px 40px rgba(176,23,75,0.12)", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>💅</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: A.text, marginBottom: 4 }}>หลังร้านทำเล็บ</h1>

          {loginStep === "passcode" ? (
            <form onSubmit={e => { e.preventDefault(); handlePasscode(); }}>
              <p style={{ color: A.sub, fontSize: 14, marginBottom: 28 }}>กรุณาใส่รหัสผ่าน Admin</p>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                value={passcodeInput}
                onChange={e => setPasscodeInput(e.target.value)}
                placeholder="รหัสผ่าน Admin"
                style={inputStyle}
                autoFocus
              />
              {authError && <p style={{ color: A.error, fontSize: 13, marginBottom: 10 }}>{authError}</p>}
              <button type="submit" disabled={loading}
                style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? "กำลังตรวจสอบ…" : "ต่อไป →"}
              </button>
            </form>
          ) : loginStep === "totp" ? (
            /* Google Authenticator TOTP — ร้านใหม่ที่สมัครผ่านระบบ */
            <form onSubmit={e => { e.preventDefault(); handleTOTP(); }}>
              <p style={{ color: A.sub, fontSize: 14, marginBottom: 4 }}>เปิด Google Authenticator</p>
              <p style={{ color: A.muted, fontSize: 12, marginBottom: 24 }}>กรอกรหัส 6 หลักจากแอป Google Authenticator</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpInput}
                onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                style={{ ...inputStyle, textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                autoFocus
              />
              {authError && <p style={{ color: A.error, fontSize: 13, marginBottom: 10 }}>{authError}</p>}
              <button type="submit" disabled={loading || otpInput.length < 6}
                style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, cursor: (loading || otpInput.length < 6) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (loading || otpInput.length < 6) ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? "กำลังยืนยัน…" : "เข้าสู่ระบบ"}
              </button>
              <button type="button" onClick={() => { setLoginStep("passcode"); setOtpInput(""); setAuthError(""); }}
                style={{ marginTop: 10, background: "none", border: "none", color: A.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ← กลับใส่รหัสผ่านใหม่
              </button>
            </form>
          ) : (
            /* Telegram OTP — ร้านเดิม */
            <form onSubmit={e => { e.preventDefault(); handleOTP(); }}>
              <p style={{ color: A.sub, fontSize: 14, marginBottom: 8 }}>ส่ง OTP ไปยัง Telegram แล้ว</p>
              <p style={{ color: A.muted, fontSize: 12, marginBottom: 24 }}>กรุณาเปิด Telegram group admin และกรอกรหัส 6 หลักที่ได้รับ</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpInput}
                onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
                placeholder="รหัส OTP 6 หลัก"
                style={{ ...inputStyle, textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                autoFocus
              />
              {authError && <p style={{ color: A.error, fontSize: 13, marginBottom: 10 }}>{authError}</p>}
              <button type="submit" disabled={loading || otpInput.length < 6}
                style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, cursor: (loading || otpInput.length < 6) ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: (loading || otpInput.length < 6) ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                {loading ? "กำลังยืนยัน…" : "เข้าสู่ระบบ"}
              </button>
              <button type="button" onClick={() => { setLoginStep("passcode"); setOtpInput(""); setAuthError(""); }}
                style={{ marginTop: 10, background: "none", border: "none", color: A.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ← กลับใส่รหัสผ่านใหม่
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ── ตรวจสอบการหมดอายุ — บล็อกทุกหน้าและแสดงเฉพาะหน้าต่ออายุ ──────────────
  if (token && rentalGateLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0d0d0d", fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ fontSize: 36, animation: "spin 1.5s linear infinite" }}>🌸</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Fail-closed: if rental status errors after retry, block admin rather than leak data
  if (token && rentalGateError) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#0d0d0d", fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif", gap: 16,
      }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ fontSize: 36 }}>🔒</div>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, textAlign: "center", maxWidth: 280 }}>
          ไม่สามารถตรวจสอบสถานะการสมัครสมาชิกได้<br />กรุณาลองโหลดหน้าใหม่
        </p>
        <button
          onClick={() => qcGate.invalidateQueries({ queryKey: ["nail-admin-rental-status", shopKeyForGate] })}
          style={{
            background: "#be185d", color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 20px", cursor: "pointer", fontFamily: "inherit",
            fontSize: 14, fontWeight: 600,
          }}
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  if (token && rentalGate?.is_expired) {
    return (
      <AdminBillingBlock
        token={token}
        slug={slug}
        onRenewalSuccess={() =>
          qcGate.invalidateQueries({ queryKey: ["nail-admin-rental-status", shopKeyForGate] })
        }
      />
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "dashboard", label: "ภาพรวม",    icon: <LayoutDashboard size={17} /> },
    { id: "inbox",     label: "สลิป",       icon: <Bell size={17} />, badge: inboxCount },
    { id: "bookings",  label: "คิว",        icon: <Calendar size={17} /> },
    { id: "services",  label: "บริการ",     icon: <Scissors size={17} /> },
    { id: "schedule",  label: "ตารางเวลา",  icon: <Clock size={17} /> },
    { id: "staff",     label: "ช่าง",       icon: <Users size={17} /> },
    { id: "gallery",   label: "แกลเลอรี",  icon: <Image size={17} /> },
    { id: "settings",  label: "ตั้งค่า",    icon: <Settings size={17} /> },
    { id: "accounts",  label: "บัญชี",      icon: <Wallet size={17} /> },
    { id: "renewal",   label: "ต่ออายุ",   icon: <Crown size={17} /> },
  ];

  return (
    <div className="nail-admin-root" style={{ background: A.bg, minHeight: "100vh", fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        .nail-admin-root input, .nail-admin-root textarea, .nail-admin-root select {
          color: ${A.text} !important;
        }
        .nail-admin-root input::placeholder, .nail-admin-root textarea::placeholder {
          color: ${A.muted} !important;
          opacity: 1 !important;
        }
      `}</style>

      {/* New booking notification banner */}
      <AnimatePresence>
        {newBookingAlert && (
          <motion.div
            initial={{ opacity: 0, y: -48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -48 }}
            style={{
              position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
              background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`,
              color: "#fff", padding: "12px 20px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              boxShadow: "0 4px 24px rgba(136,14,79,0.35)",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              🔔 มีการจองใหม่เข้ามา!
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => { setTab("bookings"); setNewBookingAlert(false); }}
                style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 8, padding: "5px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}
              >
                ดูคิว
              </button>
              <button
                onClick={() => setNewBookingAlert(false)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", padding: "4px 8px" }}
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${A.primary} 0%, ${A.deep} 100%)`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 16px rgba(136,14,79,0.25)", marginTop: newBookingAlert ? 48 : 0, transition: "margin-top 0.3s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💅</div>
          <div>
            <h1 style={{ color: "#fff", fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>ระบบหลังร้าน</h1>
            <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, margin: 0 }}>Nail Salon Admin</p>
          </div>
        </div>
        <button onClick={() => { localStorage.removeItem(storageKey); setToken(""); }}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
          ออกจากระบบ
        </button>
      </div>

      {/* Tab Bar */}
      <div style={{ background: A.card, borderBottom: `2px solid ${A.border}`, display: "flex", overflowX: "auto", padding: "0 4px" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              padding: "10px 12px", border: "none", background: "none", cursor: "pointer",
              color: tab === t.id ? A.primary : A.muted, whiteSpace: "nowrap",
              borderBottom: `3px solid ${tab === t.id ? A.primary : "transparent"}`,
              fontSize: 11, fontWeight: tab === t.id ? 700 : 400, fontFamily: "inherit",
              transition: "color 0.2s", position: "relative",
            }}>
            <div style={{ position: "relative" }}>
              {t.icon}
              {(t.badge ?? 0) > 0 && (
                <span style={{
                  position: "absolute", top: -6, right: -8,
                  background: "#EF4444", color: "#fff",
                  borderRadius: 100, minWidth: 16, height: 16,
                  fontSize: 9, fontWeight: 800, lineHeight: "16px",
                  textAlign: "center", padding: "0 3px", boxSizing: "border-box",
                  border: "1.5px solid #fff", boxShadow: "0 1px 4px rgba(239,68,68,0.5)",
                }}>
                  {(t.badge ?? 0) > 99 ? "99+" : t.badge}
                </span>
              )}
            </div>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 80px" }}>
        <AnimatePresence mode="wait">
          {/* หมายเหตุ: ตั้งใจไม่ใช้ animate ที่มีค่า y/x (translate) ตรงนี้ เพราะ framer-motion จะฝัง
              inline style "transform" ค้างไว้บน div นี้ตลอด (แม้ท้ายๆจะเป็น translateY(0)) ซึ่งตาม
              สเปก CSS จะทำให้ div นี้กลายเป็น containing block ใหม่ให้ลูกทุกตัวที่ใช้ position:fixed
              (เช่น popup "แก้ไขเวลาสล็อต" และโมดัลอื่นๆ ในทุกแท็บ) กลายเป็นเหมือน position:absolute
              เทียบกับ div นี้แทนที่จะเป็น full-screen overlay จริง ทำให้โมดัลดูซ้อน/ไม่คลุมทั้งหน้าจอ
              บน iOS Safari ให้ animate เฉพาะ opacity เพื่อเลี่ยงปัญหานี้ */}
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === "dashboard" && <DashboardTab token={token} onGoBookings={() => setTab("bookings")} />}
            {tab === "inbox"     && <InboxTab token={token} />}
            {tab === "bookings"  && <BookingsTab token={token} />}
            {tab === "services"  && <ServicesTab token={token} />}
            {tab === "schedule"  && <ScheduleTab token={token} />}
            {tab === "staff"     && <StaffTab token={token} />}
            {tab === "gallery"   && <GalleryTab token={token} />}
            {tab === "settings"  && <SettingsTab token={token} />}
            {tab === "accounts"  && <AccountsTab token={token} />}
            {tab === "renewal"   && <RenewalTab token={token} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ token, onGoBookings }: { token: string; onGoBookings: () => void }) {
  const shopKey = useShopSlug() ?? "default";
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["nail-admin-dashboard", shopKey],
    queryFn: () => aFetch("/api/nail/admin/dashboard", token),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });

  const resetStatsMutation = useMutation({
    mutationFn: () => fetch("/api/nail/admin/settings/reset-stats", { method: "POST", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ["nail-admin-dashboard", shopKey] }); },
  });

  const today = new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, marginTop: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: A.text, margin: 0 }}>ภาพรวมวันนี้</h2>
          <p style={{ color: A.sub, fontSize: 13, margin: 0 }}>{today}</p>
        </div>
        <button onClick={() => refetch()} style={{ background: A.pale, border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: A.primary, display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {isError && !data && (
        <div style={{ textAlign: "center", padding: 40, background: A.errorBg, borderRadius: 14, border: `1px solid ${A.error}44`, color: A.error, fontSize: 14 }}>
          ไม่สามารถโหลดข้อมูลได้ กรุณากด <button onClick={() => refetch()} style={{ background: "none", border: "none", cursor: "pointer", color: A.primary, textDecoration: "underline", fontFamily: "inherit" }}>รีเฟรช</button>
        </div>
      )}
      {isLoading && !data ? (
        <div style={{ textAlign: "center", padding: 48 }}><Loader2 size={28} color={A.primary} className="animate-spin" /></div>
      ) : data ? (
        <>
          {/* ── Hero card — รายได้วันนี้ + สล็อตเหลือ ── */}
          <div style={{ background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, borderRadius: 18, padding: "20px 20px 18px", marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 0, alignItems: "stretch" }}>
              {/* รายได้วันนี้ */}
              <div style={{ paddingRight: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Banknote size={14} color="rgba(255,255,255,0.7)" />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>รายได้วันนี้</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
                  ฿{(data?.today?.revenue ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                  เฉพาะที่ยืนยันแล้ว
                </div>
              </div>

              {/* Divider */}
              <div style={{ background: "rgba(255,255,255,0.2)", width: 1, margin: "0 4px" }} />

              {/* สล็อตวันนี้ */}
              <div style={{ paddingLeft: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Calendar size={14} color="rgba(255,255,255,0.7)" />
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>คิววันนี้</span>
                </div>
                {(data?.today?.slot_capacity ?? 0) > 0 ? (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>
                      <span style={{ color: (data?.today?.slot_available ?? 0) === 0 ? "#FCA5A5" : "#86EFAC" }}>
                        {data?.today?.slot_available ?? 0}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.6)" }}>
                        /{data?.today?.slot_capacity ?? 0}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, marginBottom: 8 }}>
                      ช่องว่าง / ทั้งหมด
                    </div>
                    {/* Progress bar */}
                    {(() => {
                      const cap = data?.today?.slot_capacity ?? 0;
                      const booked = data?.today?.slot_booked ?? 0;
                      const pct = cap > 0 ? Math.round((booked / cap) * 100) : 0;
                      const full = pct >= 100;
                      return (
                        <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 99,
                            background: full ? "#FCA5A5" : pct >= 75 ? "#FCD34D" : "#86EFAC",
                            transition: "width 0.4s ease",
                          }} />
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>ยังไม่มีสล็อตวันนี้</div>
                )}
              </div>
            </div>

            {/* Secondary row — สัปดาห์นี้ */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>มัดจำสัปดาห์นี้</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>฿{(data?.week_revenue ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "รออนุมัติวันนี้", value: data?.today?.pending ?? 0, icon: <AlertCircle size={20} />, color: A.info, bg: A.infoBg },
              { label: "ยืนยันแล้ววันนี้", value: data?.today?.confirmed ?? 0, icon: <CheckCircle size={20} />, color: A.success, bg: A.successBg },
              { label: "Walk-in วันนี้", value: data?.today?.walkin ?? 0, icon: <Users size={20} />, color: A.warning, bg: A.warningBg },
              { label: data?.stats_reset_at ? `รวมตั้งแต่รีเซ็ต (${new Date(data.stats_reset_at).toLocaleDateString("th-TH")})` : "รวมทั้งหมด (ทุกเวลา)", value: data?.total_bookings ?? 0, icon: <TrendingUp size={20} />, color: A.primary, bg: A.pale },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}33`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: c.color }}>{c.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 12, color: A.sub }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* ── เงินที่ระบบช่วยหามาให้ — พิสูจน์คุณค่าของระบบให้เจ้าของร้านเห็นเป็นตัวเลข ── */}
          {data?.value_stats && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: "0 0 10px" }}>💰 เงินที่ระบบช่วยหามาให้ร้าน</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: A.text }}>฿{data.value_stats.month_revenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: A.sub, marginTop: 2 }}>มัดจำที่ได้รับเดือนนี้</div>
                </div>
                <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 14, padding: "14px 16px", position: "relative" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: A.text }}>฿{data.value_stats.all_time_revenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: A.sub, marginTop: 2 }}>{data?.stats_reset_at ? `ตั้งแต่ ${new Date(data.stats_reset_at).toLocaleDateString("th-TH")}` : "รวมทั้งหมดตั้งแต่เริ่มใช้ระบบ"}</div>
                  <button onClick={() => { if (confirm("รีเซ็ตยอดสะสม (total_bookings + รายได้รวม) ให้เริ่มนับใหม่จากตอนนี้?\n\nยอดเก่าจะไม่แสดงในหน้าภาพรวมอีกต่อไป (ข้อมูลในฐานข้อมูลยังคงอยู่)")) resetStatsMutation.mutate(); }}
                    disabled={resetStatsMutation.isPending}
                    style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: A.muted, fontSize: 11, fontFamily: "inherit", padding: "2px 6px", borderRadius: 6, display: "flex", alignItems: "center", gap: 3 }}>
                    {resetStatsMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : <><RotateCcw size={10} /> รีเซ็ต</>}
                  </button>
                </div>
                <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: A.text }}>{data.value_stats.repeat_rate}%</div>
                  <div style={{ fontSize: 12, color: A.sub, marginTop: 2 }}>ลูกค้ากลับมาจองซ้ำ ({data.value_stats.repeat_customers}/{data.value_stats.unique_customers} คน)</div>
                </div>
                <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: A.text }}>฿{data.value_stats.no_show_prevented_this_month.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                  <div style={{ fontSize: 12, color: A.sub, marginTop: 2 }}>มัดจำจากคิวที่ยกเลิกเดือนนี้ (กันร้านเสียรายได้เปล่า)</div>
                </div>
              </div>
              {data.value_stats.busiest_day?.date && (
                <div style={{ background: A.pale, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: A.text }}>
                  📈 วันที่คิวแน่นที่สุดใน 90 วันล่าสุด: <strong>{fmtDate(data.value_stats.busiest_day.date)}</strong> ({data.value_stats.busiest_day.count} คิว) — ใช้วางแผนกำลังคนล่วงหน้าได้
                </div>
              )}
            </div>
          )}

          {/* Recent Bookings */}
          {data?.recent_bookings?.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: 0 }}>รายการล่าสุดที่ต้องดำเนินการ</h3>
                <button onClick={onGoBookings} style={{ background: "none", border: "none", cursor: "pointer", color: A.primary, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  ดูทั้งหมด <ChevronRight size={14} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.recent_bookings.map((b: any) => (
                  <div key={b.id} style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ background: statusBg[b.status], color: statusColor[b.status], borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {statusLabel[b.status] || b.status}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: A.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.customer_name}</div>
                      <div style={{ fontSize: 12, color: A.sub }}>{fmtDate(b.slot_date)} {b.start_time && `• ${b.start_time}`}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: A.primary, whiteSpace: "nowrap" }}>฿{b.deposit_total?.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data?.recent_bookings?.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px 20px", background: A.card, borderRadius: 14, border: `1px solid ${A.border}` }}>
              <Calendar size={32} color={A.muted} style={{ margin: "0 auto 8px" }} />
              <p style={{ color: A.muted, fontSize: 14 }}>ยังไม่มีรายการที่ต้องดำเนินการ 🎉</p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── Inbox — ศูนย์ตรวจสลิปรวม ────────────────────────────────────────────────
function InboxTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const shopKey = useShopSlug() ?? "default";
  const [confirmRejectId, setConfirmRejectId] = useState<number | null>(null);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());

  const { data: rawPending = [], isLoading, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["nail-admin-inbox", shopKey],
    queryFn: () =>
      fetch("/api/nail/admin/bookings?status=pending_payment&limit=500", {
        headers: authH(token),
      }).then(r => r.json()),
    refetchInterval: 20000,
    staleTime: 10000,
    retry: 1,
  });

  // filter out locally-completed items until next refetch (เพื่อ UX ลื่น)
  const pending = rawPending.filter((b: any) => !doneIds.has(b.id));

  const confirmMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/bookings/${id}`, {
        method: "PUT", headers: authH(token),
        body: JSON.stringify({ status: "confirmed" }),
      }).then(r => r.json()),
    onSuccess: (_data: any, id: number) => {
      setDoneIds(prev => new Set([...prev, id]));
      qc.invalidateQueries({ queryKey: ["nail-admin-inbox", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-inbox-count", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-dashboard", shopKey] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/bookings/${id}/refund`, {
        method: "POST", headers: authH(token),
      }).then(r => r.json()),
    onSuccess: (_data: any, id: number) => {
      setDoneIds(prev => new Set([...prev, id]));
      setConfirmRejectId(null);
      qc.invalidateQueries({ queryKey: ["nail-admin-inbox", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-inbox-count", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-dashboard", shopKey] });
    },
  });

  // Group by slot_date
  const todayStr = toISO(new Date());
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  const yesterdayStr = toISO(yd);

  const groups = pending.reduce((acc: Record<string, any[]>, b: any) => {
    (acc[b.slot_date] = acc[b.slot_date] || []).push(b);
    return acc;
  }, {});
  const sortedDates = Object.keys(groups).sort();

  const dateLabel = (d: string): { icon: React.ReactNode; text: string; overdue: boolean } => {
    if (d === todayStr) return { icon: <Calendar size={12} />, text: "วันนี้", overdue: false };
    if (d === yesterdayStr) return { icon: <AlertTriangle size={12} />, text: "เมื่อวาน", overdue: true };
    if (d < todayStr) return { icon: <AlertCircle size={12} />, text: "เลยกำหนด", overdue: true };
    return { icon: <Calendar size={12} />, text: "", overdue: false };
  };

  return (
    <div style={{ padding: "16px 14px 40px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: A.text, margin: 0 }}>ศูนย์ตรวจสลิป</h2>
          <p style={{ fontSize: 12, color: A.muted, margin: "3px 0 0" }}>
            {pending.length === 0 ? "ยืนยันครบแล้ว ✅" : `รอตรวจ ${pending.length} รายการ — ทุกวันรวมกัน`}
          </p>
        </div>
        <button onClick={() => refetch()}
          style={{ background: A.gray, border: `1px solid ${A.grayBorder}`, borderRadius: 10, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isFetching ? A.primary : A.sub, fontFamily: "inherit" }}>
          <RefreshCw size={13} style={{ animation: isFetching ? "spin 1s linear infinite" : "none" }} /> รีเฟรช
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: "40px 0" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: A.primary }} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && pending.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <CheckCircle size={64} color={A.success} style={{ marginBottom: 16 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: A.success, marginBottom: 8 }}>ยืนยันครบแล้ว!</div>
          <div style={{ fontSize: 13, color: A.muted }}>ไม่มีสลิปค้างรอตรวจสอบ — ระบบจะแจ้งเมื่อมีสลิปใหม่</div>
        </div>
      )}

      {/* Grouped by date */}
      {sortedDates.map(date => {
        const { text: dlabel, overdue } = dateLabel(date);
        const items = groups[date];
        return (
          <div key={date} style={{ marginBottom: 26 }}>
            {/* Date header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{
                background: overdue ? A.errorBg : A.pale,
                border: `1.5px solid ${overdue ? A.error + "44" : A.border}`,
                borderRadius: 100, padding: "5px 14px",
                fontSize: 12, fontWeight: 700,
                color: overdue ? A.error : A.primary,
                flexShrink: 0,
              }}>
                {dlabel}{date !== todayStr && date !== yesterdayStr ? ` — ${fmtDate(date)}` : ` — ${fmtDate(date)}`}
              </div>
              <div style={{ flex: 1, height: 1, background: A.grayBorder }} />
              <div style={{
                background: overdue ? A.error : A.primary,
                color: "#fff", borderRadius: 100, padding: "3px 10px",
                fontSize: 11, fontWeight: 700, flexShrink: 0,
              }}>
                {items.length} รายการ
              </div>
            </div>

            {/* Cards */}
            {items.map((b: any) => (
              <div key={b.id} style={{
                background: A.card,
                border: `1.5px solid ${overdue ? A.error + "44" : A.grayBorder}`,
                borderRadius: 16, marginBottom: 12, overflow: "hidden",
                boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
              }}>
                {/* Info */}
                <div style={{ padding: "14px 14px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const, marginBottom: 5 }}>
                      <span style={{ fontWeight: 800, fontSize: 13, color: A.primary, fontFamily: "monospace", letterSpacing: 1 }}>
                        {b.booking_ref}
                      </span>
                      <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 100, padding: "2px 10px", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Clock size={10} /> รอตรวจสลิป
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: A.text, marginBottom: 3 }}>{b.customer_name}</div>
                    <div style={{ fontSize: 12, color: A.sub, display: "flex", flexWrap: "wrap" as const, gap: "2px 12px" }}>
                      <span>🕐 {b.start_time}{b.end_time ? `–${b.end_time}` : ""}</span>
                      {b.service_name && <span>💅 {b.service_name}</span>}
                      {b.customer_phone && <span>📞 {b.customer_phone}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: A.primary }}>฿{(b.deposit_total ?? 0).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: A.muted }}>มัดจำ</div>
                  </div>
                </div>

                {/* Slip image */}
                {b.payment_proof && (
                  <div style={{ padding: "0 14px 12px" }}>
                    <div style={{ fontSize: 11, color: A.muted, marginBottom: 5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><Paperclip size={11} /> สลิปการชำระเงิน</div>
                    {(b.payment_proof.startsWith("http") || b.payment_proof.startsWith("data:image/")) ? (
                      <img src={b.payment_proof} alt="slip"
                        style={{ width: "100%", maxHeight: 320, objectFit: "contain", borderRadius: 12, border: `1px solid ${A.grayBorder}`, background: A.gray, cursor: b.payment_proof.startsWith("http") ? "pointer" : "default", display: "block" }}
                        onClick={() => b.payment_proof.startsWith("http") && window.open(b.payment_proof, "_blank")}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div style={{ background: A.gray, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: A.sub, wordBreak: "break-all" as const }}>
                        {b.payment_proof}
                      </div>
                    )}
                  </div>
                )}
                {!b.payment_proof && (
                  <div style={{ padding: "0 14px 12px" }}>
                    <div style={{ background: "#FFF8E1", border: "1px solid #FFD54F55", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#E65100" }}>
                      ⚠️ ยังไม่มีสลิป — รอลูกค้าอัปโหลด
                    </div>
                  </div>
                )}

                {/* Reference / Brief Image */}
                {b.ref_image && (
                  <div style={{ padding: "0 14px 12px" }}>
                    <div style={{ fontSize: 11, color: "#7C3AED", marginBottom: 5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}><Palette size={11} /> รูปอ้างอิง (Brief)</div>
                    <img src={b.ref_image} alt="ref brief"
                      style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 12, border: "1.5px solid #DDD6FE", background: "#F5F3FF", display: "block" }}
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                )}

                {/* Actions */}
                <div style={{ borderTop: `1px solid ${A.grayBorder}`, padding: "10px 14px", display: "flex", gap: 8 }}>
                  <button
                    onClick={() => confirmMutation.mutate(b.id)}
                    disabled={confirmMutation.isPending}
                    style={{ flex: 1, background: A.successBg, border: `1.5px solid ${A.success}44`, borderRadius: 12, padding: "11px 8px", cursor: "pointer", color: A.success, fontWeight: 700, fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <CheckCircle size={15} /> ยืนยันสลิป ✓
                  </button>
                  <button
                    onClick={() => setConfirmRejectId(b.id)}
                    style={{ flex: 1, background: A.errorBg, border: `1.5px solid ${A.error}44`, borderRadius: 12, padding: "11px 8px", cursor: "pointer", color: A.error, fontWeight: 700, fontSize: 13, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <XCircle size={15} /> ปฏิเสธ
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Reject confirm dialog */}
      {confirmRejectId !== null && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setConfirmRejectId(null)}>
          <div
            style={{ background: A.card, borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: A.text, marginBottom: 10 }}>ปฏิเสธสลิปนี้?</h3>
            <p style={{ fontSize: 13, color: A.sub, lineHeight: 1.7, marginBottom: 20 }}>
              สลิปจะถูกปฏิเสธ และมัดจำจะถูกคืนให้ลูกค้า (หากชำระผ่าน Wallet จะได้รับเงินคืนทันที)
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmRejectId(null)}
                style={{ flex: 1, background: A.gray, border: `1px solid ${A.grayBorder}`, borderRadius: 12, padding: "11px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, color: A.sub, fontSize: 13 }}>
                ยกเลิก
              </button>
              <button
                onClick={() => rejectMutation.mutate(confirmRejectId)}
                disabled={rejectMutation.isPending}
                style={{ flex: 1, background: A.error, border: "none", borderRadius: 12, padding: "11px", cursor: "pointer", color: "#fff", fontWeight: 700, fontSize: 13, fontFamily: "inherit" }}>
                {rejectMutation.isPending ? "กำลังดำเนินการ…" : "ยืนยัน ปฏิเสธ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bookings ─────────────────────────────────────────────────────────────────
function BookingsTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(toISO(new Date()));
  const [filterStatus, setFilterStatus] = useState("all");
  const [showWalkin, setShowWalkin] = useState(false);
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wTime, setWTime] = useState("09:00");
  const [wEndTime, setWEndTime] = useState<string>("");
  const [wServiceId, setWServiceId] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<number | null>(null);
  const [changeServiceFor, setChangeServiceFor] = useState<any | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSlotId, setRescheduleSlotId] = useState<number | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletePasscode, setDeletePasscode] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const url = `/api/nail/admin/bookings?date=${filterDate}` + (filterStatus !== "all" ? `&status=${filterStatus}` : "");
  const { data: bookings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-bookings", shopKey, filterDate, filterStatus],
    queryFn: () => fetch(url, { headers: authH(token) }).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services", shopKey],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/nail/admin/bookings/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] }),
  });

  const [changeServiceResult, setChangeServiceResult] = useState<string | null>(null);
  const changeServiceMutation = useMutation({
    mutationFn: ({ id, service_id }: { id: number; service_id: number }) =>
      fetch(`/api/nail/admin/bookings/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ service_id }) }).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] });
      setChangeServiceFor(null);
      if (data?.deposit_diff != null && data.deposit_diff !== 0) {
        setChangeServiceResult(
          data.deposit_diff > 0
            ? `เปลี่ยนบริการสำเร็จ — เก็บมัดจำเพิ่มจากลูกค้าอีก ฿${data.deposit_diff.toFixed(2)}`
            : `เปลี่ยนบริการสำเร็จ — คืนมัดจำส่วนต่างให้ลูกค้า ฿${Math.abs(data.deposit_diff).toFixed(2)}`
        );
      } else {
        setChangeServiceResult("เปลี่ยนบริการสำเร็จ");
      }
    },
  });

  const refundMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/bookings/${id}/refund`, { method: "POST", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] }); qc.invalidateQueries({ queryKey: ["nail-admin-dashboard", shopKey] }); setConfirmRefundId(null); },
  });

  const walkinMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/bookings/walkin", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({
          customer_name: wName, customer_phone: wPhone, slot_date: filterDate, start_time: wTime,
          end_time: wEndTime || undefined,
          service_id: wServiceId ? Number(wServiceId) : undefined,
        }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] }); setShowWalkin(false); setWName(""); setWPhone(""); setWEndTime(""); setWServiceId(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      // id === -1 หมายถึง bulk-delete cancelled ทั้งหมด
      const url = id === -1
        ? "/api/nail/admin/bookings/bulk-delete-cancelled"
        : `/api/nail/admin/bookings/${id}/delete`;
      const r = await fetch(url, {
        method: "POST", headers: authH(token), body: JSON.stringify({ passcode: deletePasscode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-dashboard", shopKey] });
      setDeleteTarget(null); setDeletePasscode(""); setDeleteError("");
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const { data: rescheduleSlots = [], isLoading: rSlotsLoading } = useQuery<any[]>({
    queryKey: ["nail-reschedule-slots", shopKey, rescheduleDate],
    queryFn: () => fetch(`/api/nail/admin/slots?date=${rescheduleDate}`, { headers: authH(token) }).then(r => r.json()),
    enabled: !!rescheduleDate && !!rescheduleTarget,
    staleTime: 15000,
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      if (!rescheduleTarget || !rescheduleSlotId) throw new Error("กรุณาเลือกสล็อตใหม่ก่อน");
      return fetch(`/api/nail/admin/bookings/${rescheduleTarget.id}`, {
        method: "PUT", headers: authH(token),
        body: JSON.stringify({ slot_id: rescheduleSlotId }),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`); return d; });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings", shopKey] });
      setRescheduleTarget(null); setRescheduleDate(""); setRescheduleSlotId(null); setRescheduleError("");
    },
    onError: (e: Error) => setRescheduleError(e.message),
  });

  const pendingCount = bookings.filter(b => b.status === "pending_payment").length;

  return (
    <div style={{ padding: 16 }}>
      {pendingCount > 0 && (
        <div style={{ background: "#FFFBEB", border: "2px solid #F59E0B", borderRadius: 12, padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, color: "#92400E", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 8px #F59E0B33" }}>
          <AlertCircle size={18} color="#F59E0B" /> 🔔 มี {pendingCount} รายการรอตรวจสลิป — กรุณายืนยันด้วย
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ flex: 1, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", background: A.card }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: A.card }}>
          <option value="all">ทั้งหมด</option>
          <option value="pending_payment">รอตรวจสลิป</option>
          <option value="confirmed">ยืนยันแล้ว</option>
          <option value="held">กำลังรอ</option>
          <option value="walkin">Walk-in</option>
          <option value="completed">เสร็จ</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
        <button onClick={() => refetch()} style={{ background: A.pale, border: "none", borderRadius: 10, padding: "9px 12px", cursor: "pointer", color: A.primary }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: A.sub, fontSize: 13 }}>{bookings.length} รายการ — {filterStatus === "all" ? fmtDate(filterDate) : filterStatus}</span>
        <div style={{ display: "flex", gap: 8 }}>
          {filterStatus === "cancelled" && bookings.length > 0 && (
            <button onClick={() => { setDeleteTarget({ id: -1, name: `ยกเลิก ${bookings.length} รายการ` }); setDeletePasscode(""); setDeleteError(""); }}
              style={{ background: A.errorBg, color: A.error, border: `1px solid ${A.error}44`, borderRadius: 100, padding: "7px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
              <Trash2 size={12} /> ล้างทั้งหมด
            </button>
          )}
          <button onClick={() => setShowWalkin(true)}
            style={{ background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 100, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            <Plus size={14} /> Walk-in
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} color={A.primary} className="animate-spin" /></div>
      ) : bookings.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, background: A.card, borderRadius: 14, border: `1px solid ${A.border}` }}>
          <Calendar size={32} color={A.muted} style={{ margin: "0 auto 8px" }} />
          <p style={{ color: A.muted }}>ไม่มีการจองในวันนี้</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bookings.map((b: any) => (
            <div key={b.id} style={{ background: A.card, border: `1.5px solid ${expandedId === b.id ? A.primary : A.border}`, borderRadius: 14, padding: 14, transition: "border-color 0.2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: A.text }}>{b.customer_name}</span>
                    <span style={{ background: statusBg[b.status], color: statusColor[b.status], borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                      {statusLabel[b.status] || b.status}
                    </span>
                  </div>
                  <span style={{ color: A.muted, fontSize: 12 }}>{b.booking_ref}</span>
                </div>
                <button onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: A.sub, padding: 4 }}>
                  {expandedId === b.id ? <X size={16} /> : <Edit2 size={14} />}
                </button>
              </div>

              {/* Basic Info */}
              <div style={{ display: "flex", gap: 12, fontSize: 13, color: A.sub, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {b.start_time}{b.end_time ? ` – ${b.end_time}` : ""}</span>
                {b.service_name && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Scissors size={12} /> {b.service_name}</span>}
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Smartphone size={12} /> {b.customer_phone}</span>
                {b.customer_line && <span style={{ color: "#06C755" }}>LINE: {b.customer_line}</span>}
              </div>

              {b.deposit_total > 0 && (
                <div style={{ fontSize: 13, color: A.text, marginTop: 6 }}>
                  มัดจำ: <strong style={{ color: A.primary }}>฿{b.deposit_total.toFixed(2)}</strong>
                  {b.slip_verify_status && (
                    <span style={{ marginLeft: 8, fontSize: 11, background: b.slip_verify_status === "verified" ? A.successBg : A.warningBg, color: b.slip_verify_status === "verified" ? A.success : A.warning, borderRadius: 6, padding: "1px 8px" }}>
                      {b.slip_verify_status}
                    </span>
                  )}
                </div>
              )}

              {b.customer_note && (
                <div style={{ fontSize: 12, color: A.sub, marginTop: 4, background: A.gray, borderRadius: 8, padding: "6px 10px", display: "flex", alignItems: "flex-start", gap: 5 }}>
                  <FileText size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {b.customer_note}
                </div>
              )}

              {/* Action Buttons */}
              {expandedId === b.id && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} style={{ marginTop: 12, borderTop: `1px solid ${A.border}`, paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {b.status === "pending_payment" && (
                      <>
                        <button onClick={() => updateMutation.mutate({ id: b.id, status: "confirmed" })}
                          style={{ flex: 1, background: A.successBg, color: A.success, border: `1px solid ${A.success}44`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                          <CheckCircle size={15} /> ยืนยันสลิป
                        </button>
                        <button onClick={() => setConfirmRefundId(b.id)}
                          style={{ flex: 1, background: A.errorBg, color: A.error, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                          <RotateCcw size={15} /> คืนเงิน
                        </button>
                      </>
                    )}
                    {b.status === "confirmed" && (
                      <>
                        <button onClick={() => updateMutation.mutate({ id: b.id, status: "completed" })}
                          style={{ flex: 1, background: "#F3E5F5", color: "#6A1B9A", border: "1px solid #CE93D844", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                          ✓ เสร็จสิ้น
                        </button>
                        <button onClick={() => setConfirmRefundId(b.id)}
                          style={{ background: A.errorBg, color: A.error, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                          <RotateCcw size={15} /> คืนเงิน
                        </button>
                      </>
                    )}
                    {b.status === "held" && (
                      <button onClick={() => updateMutation.mutate({ id: b.id, status: "cancelled" })}
                        style={{ flex: 1, background: A.errorBg, color: A.error, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <Ban size={15} /> ยกเลิก
                      </button>
                    )}
                    {b.status === "walkin" && (
                      <button onClick={() => updateMutation.mutate({ id: b.id, status: "completed" })}
                        style={{ flex: 1, background: "#FFF3E0", color: A.warning, border: "1px solid #FFCC8044", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        ✓ เสร็จสิ้น
                      </button>
                    )}
                    {["pending_payment", "confirmed", "held", "walkin"].includes(b.status) && (
                      <button onClick={() => setChangeServiceFor(b)}
                        style={{ flex: 1, background: A.infoBg, color: A.info, border: `1px solid ${A.info}44`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <Scissors size={14} /> เปลี่ยนบริการ
                      </button>
                    )}
                    {["pending_payment", "confirmed", "held", "walkin"].includes(b.status) && (
                      <button onClick={() => { setRescheduleTarget(b); setRescheduleDate(b.slot_date || filterDate); setRescheduleSlotId(null); setRescheduleError(""); }}
                        style={{ flex: 1, background: "#F3E5F5", color: "#6A1B9A", border: "1px solid #CE93D844", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <Calendar size={14} /> ย้ายคิว
                      </button>
                    )}
                    <button onClick={() => { setDeleteTarget({ id: b.id, name: b.customer_name }); setDeletePasscode(""); setDeleteError(""); }}
                      title="ลบรายการนี้ออกจากระบบถาวร"
                      style={{ background: A.gray, color: A.error, border: `1px solid ${A.error}33`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                      <Trash2 size={14} /> ลบถาวร
                    </button>
                  </div>

                  {/* Payment Proof */}
                  {b.payment_proof && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 12, color: A.sub, marginBottom: 6 }}>หลักฐานการชำระ:</p>
                      {(b.payment_proof.startsWith("http") || b.payment_proof.startsWith("data:image/")) ? (
                        <div>
                          {b.payment_proof.startsWith("http") && (
                            <a href={b.payment_proof} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: A.primary, fontWeight: 600, textDecoration: "none", background: A.pale, borderRadius: 8, padding: "5px 12px", border: `1px solid ${A.border}`, marginBottom: 6 }}>
                              🔗 เปิดลิงก์สลิป
                            </a>
                          )}
                          <img src={b.payment_proof} alt="slip"
                            style={{ display: "block", maxWidth: "100%", maxHeight: 260, borderRadius: 10, border: `1px solid ${A.border}`, objectFit: "contain" }}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, color: A.sub, background: A.gray, borderRadius: 8, padding: "6px 12px", wordBreak: "break-all" }}>{b.payment_proof}</p>
                      )}
                    </div>
                  )}

                  {/* Reference Image (Brief) */}
                  {b.ref_image && (
                    <div style={{ marginTop: 10, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontSize: 12, color: "#7C3AED", marginBottom: 8, fontWeight: 600 }}>🎨 รูปอ้างอิงแบบงาน (Brief):</p>
                      <img
                        src={b.ref_image}
                        alt="ref brief"
                        style={{ display: "block", maxWidth: "100%", maxHeight: 220, borderRadius: 8, border: "1px solid #DDD6FE", objectFit: "contain" }}
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Walk-in Modal */}
      {showWalkin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: A.text }}>เพิ่ม Walk-in</h3>
            {[
              { val: wName, set: setWName, ph: "ชื่อลูกค้า *", type: "text" },
              { val: wPhone, set: setWPhone, ph: "เบอร์โทร *", type: "tel" },
            ].map((f, i) => (
              <input key={i} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type}
                style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
            ))}
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: A.muted, display: "block", marginBottom: 3 }}>เวลาเริ่ม *</label>
              <input type="time" value={wTime} onChange={e => setWTime(e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: A.muted, display: "block", marginBottom: 3 }}>เวลาสิ้นสุด (ไม่กรอก = คำนวณอัตโนมัติจากบริการ/ค่าเริ่มต้นร้าน)</label>
              <input type="time" value={wEndTime} onChange={e => setWEndTime(e.target.value)}
                style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
            </div>
            <select value={wServiceId} onChange={e => setWServiceId(e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }}>
              <option value="">ไม่ระบุบริการ (ใช้เวลาเริ่มต้นของร้าน)</option>
              {services.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes} นาที)</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: A.muted, marginBottom: 16 }}>
              💡 สามารถตั้งเวลาทับกับคิวที่มีคนจองไว้แล้วในช่วงนั้นได้ ระบบจะไม่บล็อก — ใช้สำหรับลูกค้าวอคอิน
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowWalkin(false)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => walkinMutation.mutate()} disabled={!wName || !wPhone}
                style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", opacity: !wName || !wPhone ? 0.5 : 1 }}>
                {walkinMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "เพิ่ม"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Reschedule Booking Modal */}
      {rescheduleTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }}>
          <motion.div initial={{ y: 120 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: A.text }}>ย้ายคิว</h3>
            <p style={{ color: A.sub, fontSize: 13, marginBottom: 14 }}>
              {rescheduleTarget.customer_name} · {fmtDate(rescheduleTarget.slot_date)} {rescheduleTarget.start_time}
            </p>
            {/* Date Picker */}
            <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>วันใหม่</label>
            <input type="date" value={rescheduleDate} onChange={e => { setRescheduleDate(e.target.value); setRescheduleSlotId(null); }}
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
            {/* Slot List */}
            {rescheduleDate && (
              <>
                <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 8 }}>เลือกสล็อตเวลาใหม่</label>
                {rSlotsLoading ? (
                  <div style={{ textAlign: "center", padding: 20 }}><Loader2 size={20} color={A.primary} className="animate-spin" /></div>
                ) : rescheduleSlots.length === 0 ? (
                  <p style={{ color: A.muted, fontSize: 13, textAlign: "center", padding: 16 }}>ไม่มีสล็อตในวันที่เลือก</p>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                    {rescheduleSlots.map((sl: any) => {
                      const isSelected = rescheduleSlotId === sl.id;
                      const remaining = sl.max_bookings > 1 ? Math.max(0, sl.max_bookings - sl.booked_count) : null;
                      return (
                        <button key={sl.id} onClick={() => setRescheduleSlotId(sl.id)}
                          style={{ background: isSelected ? `linear-gradient(135deg, ${A.primary}, ${A.deep})` : A.bg, color: isSelected ? "#fff" : A.text, border: `2px solid ${isSelected ? A.primary : A.border}`, borderRadius: 12, padding: "12px 8px", cursor: "pointer", textAlign: "center", fontFamily: "inherit" }}>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{sl.start_time}</div>
                          <div style={{ fontSize: 11, opacity: 0.75 }}>→ {sl.end_time}</div>
                          {remaining !== null && <div style={{ fontSize: 11, marginTop: 3, color: isSelected ? "rgba(255,255,255,0.85)" : A.primary }}>ว่าง {remaining} ที่</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {rescheduleError && <p style={{ color: A.error, fontSize: 13, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {rescheduleError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setRescheduleTarget(null); setRescheduleDate(""); setRescheduleSlotId(null); setRescheduleError(""); }}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => rescheduleMutation.mutate()} disabled={!rescheduleSlotId || rescheduleMutation.isPending}
                style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", opacity: !rescheduleSlotId || rescheduleMutation.isPending ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {rescheduleMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Calendar size={14} /> ยืนยันย้ายคิว</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={confirmRefundId !== null}
        title="ยกเลิกและคืนเงิน?"
        message="ระบบจะคืนเงินมัดจำให้ลูกค้าและยกเลิกคิวนี้"
        danger
        loading={refundMutation.isPending}
        onCancel={() => setConfirmRefundId(null)}
        onConfirm={() => confirmRefundId !== null && refundMutation.mutate(confirmRefundId)}
      />

      {/* Delete Booking Modal — ต้องใส่รหัสยืนยันของร้านซ้ำก่อนลบถาวร */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, padding: 20 }}
            onClick={() => setDeleteTarget(null)}>
            <motion.div initial={{ scale: 0.9, y: 10, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ background: A.card, borderRadius: 20, padding: 26, maxWidth: 340, width: "100%", boxShadow: "0 16px 48px rgba(136,14,79,0.3)", fontFamily: "'Prompt', sans-serif" }}>
              <div style={{ width: 54, height: 54, borderRadius: "50%", background: A.errorBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Trash2 size={26} color={A.error} /></div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 6, textAlign: "center" }}>
                {deleteTarget.id === -1 ? "ล้างข้อมูลยกเลิกทั้งหมด?" : "ลบรายการถาวร?"}
              </h3>
              <p style={{ color: A.sub, fontSize: 13, marginBottom: 14, lineHeight: 1.5, textAlign: "center" }}>
                {deleteTarget.id === -1 ? (
                  <>จะลบ<strong>การจองที่ยกเลิกทุกรายการในระบบ</strong> (ทุกวัน ทุกช่วงเวลา) ออกถาวร ไม่มีผลกับการจองที่ยังใช้งาน<br /><strong style={{ color: A.error }}>⚠ ไม่สามารถกู้คืนได้</strong></>
                ) : (
                  <>จะลบการจองของ <strong>{deleteTarget.name}</strong> ออกจากระบบถาวร และคืนเครดิตกระเป๋าเงินให้ลูกค้าถ้าจ่ายด้วยเครดิต</>
                )}
                <br />กรุณาใส่<strong>รหัสผ่านร้าน</strong>เพื่อยืนยัน
              </p>
              <input
                type="password"
                value={deletePasscode}
                onChange={e => { setDeletePasscode(e.target.value); setDeleteError(""); }}
                placeholder="รหัสผ่านร้าน"
                autoFocus
                style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }}
              />
              {deleteError && <p style={{ color: A.error, fontSize: 12, marginBottom: 10 }}>{deleteError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setDeleteTarget(null)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 12, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 600, color: A.text }}>
                  ยกเลิก
                </button>
                <button onClick={() => deleteTarget && deletePasscode.trim() && deleteMutation.mutate(deleteTarget.id)}
                  disabled={!deletePasscode.trim() || deleteMutation.isPending}
                  style={{ flex: 1, background: `linear-gradient(135deg, ${A.error}, #7A0000)`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", cursor: deleteMutation.isPending ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, opacity: !deletePasscode.trim() || deleteMutation.isPending ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {deleteMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : "ยืนยันลบ"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Change Service Modal — ลูกค้าอยากเปลี่ยนไปทำบริการอื่นหน้าร้าน */}
      {changeServiceFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: A.text }}>เปลี่ยนบริการ</h3>
            <p style={{ fontSize: 13, color: A.sub, marginBottom: 14 }}>
              คิวปัจจุบันของ {changeServiceFor.customer_name}: <strong>{changeServiceFor.service_name || "-"}</strong> (มัดจำ ฿{Number(changeServiceFor.deposit_amount || 0).toFixed(2)})
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {services.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => changeServiceMutation.mutate({ id: changeServiceFor.id, service_id: s.id })}
                  disabled={changeServiceMutation.isPending || s.id === changeServiceFor.service_id}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    border: `1.5px solid ${s.id === changeServiceFor.service_id ? A.primary : A.border}`,
                    background: s.id === changeServiceFor.service_id ? A.pale : A.bg,
                    borderRadius: 12, padding: "12px 14px", cursor: s.id === changeServiceFor.service_id ? "default" : "pointer",
                    fontFamily: "inherit", textAlign: "left", opacity: changeServiceMutation.isPending ? 0.6 : 1,
                  }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: A.text }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: A.sub }}>
                    ฿{s.price.toLocaleString()} • มัดจำ {s.deposit_amount != null ? `฿${Number(s.deposit_amount).toLocaleString()}` : "ค่าเริ่มต้นร้าน"}
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => setChangeServiceFor(null)} style={{ width: "100%", marginTop: 16, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              ปิด
            </button>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={changeServiceResult !== null}
        title="สำเร็จ"
        message={changeServiceResult || ""}
        onCancel={() => setChangeServiceResult(null)}
        onConfirm={() => setChangeServiceResult(null)}
      />
    </div>
  );
}

// ─── Services ─────────────────────────────────────────────────────────────────
function ServicesTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [dur, setDur] = useState("60");
  const [deposit, setDeposit] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services", shopKey],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const openAdd = () => { setEditId(null); setName(""); setDesc(""); setPrice("0"); setDur("60"); setDeposit(""); setImageUrl(""); setShow(true); };
  const openEdit = (s: any) => { setEditId(s.id); setName(s.name); setDesc(s.description || ""); setPrice(String(s.price)); setDur(String(s.duration_minutes)); setDeposit(s.deposit_amount != null ? String(s.deposit_amount) : ""); setImageUrl(s.image_url || ""); setShow(true); };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name, description: desc, price: parseFloat(price), duration_minutes: parseInt(dur),
        deposit_amount: deposit.trim() === "" ? null : parseFloat(deposit),
        image_url: imageUrl.trim() || null,
      });
      if (editId) {
        return fetch(`/api/nail/admin/services/${editId}`, { method: "PUT", headers: authH(token), body }).then(r => r.json());
      }
      return fetch("/api/nail/admin/services", { method: "POST", headers: authH(token), body }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services", shopKey] }); setShow(false); },
  });

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/services/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services", shopKey] }); setConfirmDelete(null); },
  });

  return (
    <div style={{ padding: 16 }}>
      <button onClick={openAdd}
        style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
        <Plus size={18} /> เพิ่มบริการใหม่
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {services.map((s: any) => (
          <div key={s.id} style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            {s.image_url
              ? <div style={{ width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}><img src={s.image_url} alt={s.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
              : <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>💅</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: A.text, fontSize: 15 }}>{s.name}</div>
              {s.description && <div style={{ fontSize: 13, color: A.sub }}>{s.description}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ background: A.pale, color: A.primary, borderRadius: 100, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>฿{s.price.toLocaleString()}</span>
                <span style={{ background: A.gray, color: A.sub, borderRadius: 100, padding: "2px 10px", fontSize: 12 }}>⏱ {s.duration_minutes} นาที</span>
                <span style={{ background: A.warningBg, color: A.warning, borderRadius: 100, padding: "2px 10px", fontSize: 12 }}>
                  มัดจำ {s.deposit_amount != null ? `฿${Number(s.deposit_amount).toLocaleString()}` : "ค่าเริ่มต้นร้าน"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => openEdit(s)} style={{ background: A.infoBg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                <Edit2 size={14} color={A.info} />
              </button>
              <button onClick={() => setConfirmDelete({ id: s.id, name: s.name })} style={{ background: A.errorBg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                <Trash2 size={14} color={A.error} />
              </button>
            </div>
          </div>
        ))}
        {services.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: A.muted, fontSize: 14 }}>
            <Scissors size={32} style={{ margin: "0 auto 8px" }} /><p>ยังไม่มีบริการ</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {show && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", zIndex: 9999 }}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", fontFamily: "inherit" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: A.text }}>{editId ? "แก้ไขบริการ" : "เพิ่มบริการใหม่"}</h3>
            {[
              { label: "ชื่อบริการ *", val: name, set: setName, ph: "เช่น เพนท์เจล", type: "text" },
              { label: "คำอธิบาย", val: desc, set: setDesc, ph: "รายละเอียดบริการ", type: "text" },
              { label: "ราคา (฿)", val: price, set: setPrice, ph: "350", type: "number" },
              { label: "ระยะเวลา (นาที)", val: dur, set: setDur, ph: "90", type: "number" },
              { label: "ค่ามัดจำ (฿) — เว้นว่าง = ใช้ค่าเริ่มต้นของร้าน", val: deposit, set: setDeposit, ph: "เช่น 100", type: "number" },
              { label: "URL รูปตัวอย่าง (ไม่บังคับ) — แนะนำใช้ postimages.org", val: imageUrl, set: setImageUrl, ph: "https://...", type: "text" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type}
                  style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setShow(false)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => saveMutation.mutate()} disabled={!name}
                style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", opacity: !name ? 0.5 : 1 }}>
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} style={{ display: "inline", marginRight: 6 }} />บันทึก</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="ลบบริการ?"
        message={confirmDelete ? `ต้องการลบบริการ "${confirmDelete.name}" ใช่หรือไม่`: ""}
        danger
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </div>
  );
}

// ─── Staff (ช่าง) ───────────────────────────────────────────────────────────
function StaffTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#FF6B9D");

  const { data: staff = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-staff", shopKey],
    queryFn: () => fetch("/api/nail/admin/staff", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const openAdd = () => { setName(""); setColor("#FF6B9D"); setShow(true); };

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/staff", { method: "POST", headers: authH(token), body: JSON.stringify({ name, color }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-staff", shopKey] }); setShow(false); },
  });

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/staff/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-staff", shopKey] }); setConfirmDelete(null); },
  });

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={32} color={A.error} style={{ margin: "0 auto 10px" }} />
        <p style={{ color: A.sub, marginBottom: 12 }}>โหลดข้อมูลช่างไม่สำเร็จ กรุณาลองใหม่</p>
        <button onClick={() => refetch()} style={{ background: A.pale, color: A.primary, border: "none", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} />ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <button onClick={openAdd}
        style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
        <Plus size={18} /> เพิ่มช่างใหม่
      </button>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} className="animate-spin" color={A.primary} /></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {staff.filter((s: any) => s.is_active !== false).map((s: any) => (
            <div key={s.id} style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: s.color || A.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 700 }}>
                {(s.name || "?").charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, fontWeight: 600, color: A.text, fontSize: 15 }}>{s.name}</div>
              <button onClick={() => setConfirmDelete({ id: s.id, name: s.name })} style={{ background: A.errorBg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer", flexShrink: 0 }}>
                <Trash2 size={14} color={A.error} />
              </button>
            </div>
          ))}
          {staff.filter((s: any) => s.is_active !== false).length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: A.muted, fontSize: 14 }}>
              <Users size={32} style={{ margin: "0 auto 8px" }} /><p>ยังไม่มีช่าง</p>
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {show && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", zIndex: 9999 }}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", fontFamily: "inherit" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: A.text }}>เพิ่มช่างใหม่</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>ชื่อช่าง *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น น้องมิ้นท์"
                style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, color: A.text }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>สีประจำตัว</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: "100%", height: 42, border: `1.5px solid ${A.border}`, borderRadius: 10, cursor: "pointer", padding: 4, background: A.bg }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button onClick={() => setShow(false)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => saveMutation.mutate()} disabled={!name || saveMutation.isPending}
                style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", opacity: !name ? 0.5 : 1 }}>
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} style={{ display: "inline", marginRight: 6 }} />บันทึก</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="ลบช่าง?"
        message={confirmDelete ? `ต้องการลบช่าง "${confirmDelete.name}" ใช่หรือไม่`: ""}
        danger
        loading={deleteMutation.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
      />
    </div>
  );
}

// ─── Renewal (ต่ออายุ) ──────────────────────────────────────────────────────
const RENEWAL_PLANS = [
  { months: 1, price: 500 },
  { months: 3, price: 1300 },
  { months: 6, price: 2400 },
  { months: 12, price: 4500 },
];

const RENEWAL_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "รอตรวจสอบ", color: "#B5850A" },
  approved: { label: "อนุมัติแล้ว", color: "#1E8E5A" },
  rejected: { label: "ถูกปฏิเสธ", color: "#C0392B" },
};

// ─── Accounts / Wallet Management ────────────────────────────────────────────
type AccountsView = "topups" | "credit" | "transactions";

/** การ์ดแสดงช่องทางรับเงินของร้าน — ให้แอดมินเห็นว่าลูกค้าจะโอนมาที่ไหน */
function ShopPaymentInfoCard({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const { data: settings } = useQuery<any>({
    queryKey: ["nail-admin-settings", shopKey],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60_000,
  });

  const hasBank = !!(settings?.bank_name || settings?.bank_account_number);
  const hasTM   = !!(settings?.truemoney_phone);
  if (!settings || (!hasBank && !hasTM)) return null;

  return (
    <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: A.primary, marginBottom: 8 }}>
        💳 ช่องทางรับเงินของร้าน (ลูกค้าเห็นข้อมูลนี้ตอนเติมเครดิต)
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: A.text }}>
        {hasBank && (
          <div>🏦 {settings.bank_name || "ธนาคาร"} — <b>{settings.bank_account_number || "ยังไม่กรอกเลขบัญชี"}</b>{settings.bank_account_name ? ` (${settings.bank_account_name})` : ""}</div>
        )}
        {hasTM && (
          <div>🧧 TrueMoney: <b>{settings.truemoney_phone}</b></div>
        )}
        {!hasBank && !hasTM && (
          <div style={{ color: A.muted }}>ยังไม่ได้ตั้งค่าช่องทางรับเงิน — ไปที่แท็บ "ตั้งค่า"</div>
        )}
      </div>
      {!(settings?.accept_bank_transfer ?? true) && !(settings?.accept_truemoney_angpao ?? true) && (
        <div style={{ marginTop: 8, fontSize: 11, color: A.error, fontWeight: 600 }}>⚠️ ปิดรับเงินทุกช่องทางอยู่ — ลูกค้าเติมเครดิตไม่ได้</div>
      )}
    </div>
  );
}

function AccountsTab({ token }: { token: string }) {
  const [view, setView] = useState<AccountsView>("topups");
  return (
    <div style={{ padding: 16 }}>
      {/* ช่องทางรับเงินของร้าน — ข้อมูลอ้างอิงสำหรับแอดมิน */}
      <ShopPaymentInfoCard token={token} />
      {/* Sub-navigation */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
        {([
          { key: "topups"       as const, label: "📋 คำขอเติมเงิน" },
          { key: "credit"       as const, label: "💰 เพิ่มเครดิต" },
          { key: "transactions" as const, label: "📊 ธุรกรรม" },
        ]).map(({ key, label }) => (
          <button key={key} onClick={() => setView(key)}
            style={{
              padding: "8px 14px", border: `1.5px solid ${view === key ? A.primary : A.border}`,
              borderRadius: 100, background: view === key ? A.pale : "#fff",
              color: view === key ? A.primary : A.sub, fontFamily: "inherit",
              fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}>
            {label}
          </button>
        ))}
      </div>
      {view === "topups"       && <TopupRequestsView token={token} />}
      {view === "credit"       && <AddCreditView token={token} />}
      {view === "transactions" && <TransactionsView token={token} />}
    </div>
  );
}

// ─── TopupRequestsView ────────────────────────────────────────────────────────
function TopupRequestsView({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [approveAmounts, setApproveAmounts] = useState<Record<number, string>>({});

  const { data: topups = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-topups", shopKey, statusFilter],
    queryFn: () => fetch(`/api/nail/admin/topup-requests?status=${statusFilter}`, { headers: authH(token) }).then(r => r.json()),
    staleTime: 15000,
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) =>
      fetch(`/api/nail/admin/topup-requests/${id}/approve`, { method: "POST", headers: { ...authH(token), "Content-Type": "application/json" }, body: JSON.stringify({ amount }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-topups", shopKey] }); },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/topup-requests/${id}/reject`, { method: "POST", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-topups", shopKey] }); },
  });

  const ttLabel: Record<string, string> = { slip: "🏦 สลิปโอนเงิน", truemoney: "🧧 TrueMoney" };
  const slabel: Record<string, { label: string; color: string }> = {
    pending:  { label: "รอตรวจสอบ", color: A.warning },
    approved: { label: "อนุมัติแล้ว", color: A.success },
    rejected: { label: "ปฏิเสธ",    color: A.error },
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: 0 }}>คำขอเติมเงิน</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {(["pending", "all"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: "5px 12px", border: `1.5px solid ${statusFilter === s ? A.primary : A.border}`, borderRadius: 100, background: statusFilter === s ? A.pale : "#fff", color: statusFilter === s ? A.primary : A.sub, fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {s === "pending" ? "รอตรวจสอบ" : "ทั้งหมด"}
            </button>
          ))}
          <button onClick={() => refetch()} style={{ padding: "5px 8px", border: `1.5px solid ${A.border}`, borderRadius: 100, background: "#fff", cursor: "pointer", color: A.sub, display: "flex", alignItems: "center" }}>
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} className="animate-spin" color={A.primary} /></div>
      ) : topups.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: A.muted }}>
          <CreditCard size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
          <p>{statusFilter === "pending" ? "ไม่มีคำขอรอตรวจสอบ" : "ไม่มีรายการ"}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {topups.map((t: any) => {
            const isPending = t.status === "pending";
            const sl = slabel[t.status] || { label: t.status, color: A.sub };
            const defaultAmt = t.amount ? String(t.amount) : "";
            const inputAmt = approveAmounts[t.id] ?? defaultAmt;
            return (
              <div key={t.id} style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(t.customer_name || t.customer_phone) ? (
                      <div style={{ fontWeight: 700, color: A.text, fontSize: 15, marginBottom: 2 }}>
                        {t.customer_name || "ไม่ระบุชื่อ"}
                        {t.customer_phone && <span style={{ fontWeight: 500, color: A.sub, fontSize: 13, marginLeft: 8 }}>{t.customer_phone}</span>}
                      </div>
                    ) : (
                      <div style={{ fontWeight: 600, color: A.warning, fontSize: 13, marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
                        <AlertCircle size={13} /> ลูกค้ายังไม่ได้ตั้งชื่อ
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: A.muted, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.customer_email}</div>
                    <div style={{ fontSize: 12, color: A.sub }}>
                      {ttLabel[t.topup_type] || t.topup_type}
                      {t.amount ? ` · ฿${Number(t.amount).toLocaleString()}` : ""}
                      <span style={{ color: A.muted, marginLeft: 6 }}>
                        {t.created_at ? new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : ""}
                      </span>
                    </div>
                  </div>
                  <span style={{ background: `${sl.color}18`, color: sl.color, borderRadius: 100, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{sl.label}</span>
                </div>
                {t.payment_proof && !t.payment_proof.startsWith("voucher:") && (
                  <img src={t.payment_proof} alt="slip" style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 10, border: `1px solid ${A.border}`, marginBottom: 10 }} />
                )}
                {(t.voucher_code || t.payment_proof?.startsWith("voucher:")) && (() => {
                  const code = t.voucher_code || t.payment_proof?.replace("voucher:", "");
                  const link = `https://gift.truemoney.com/campaign/?v=${code}`;
                  return (
                    <div style={{ background: A.infoBg, border: `1px solid ${A.info}33`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: A.info, marginBottom: 10 }}>
                      <div style={{ marginBottom: t.fail_reason ? 6 : 0 }}>
                        🧧 ลิงก์ซองอั่งเปา:{" "}
                        <a href={link} target="_blank" rel="noreferrer" style={{ color: A.info, fontWeight: 700, wordBreak: "break-all" }}>
                          {link}
                        </a>
                      </div>
                      {t.fail_reason && (
                        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "5px 8px", color: "#C0392B", fontSize: 11, marginTop: 4 }}>
                          ⚠️ สาเหตุที่แลกอัตโนมัติไม่สำเร็จ: <b>{t.fail_reason}</b>
                          <div style={{ color: "#9B2335", marginTop: 3 }}>กดลิงก์ด้านบนเพื่อเปิดซองตรวจสอบ แล้วกด "อนุมัติ" หากเงินเข้าแล้ว</div>
                        </div>
                      )}
                      {!t.fail_reason && t.status === "pending" && (
                        <div style={{ color: `${A.info}BB`, fontSize: 11, marginTop: 4 }}>
                          กดลิงก์ด้านบนเพื่อเปิดซองตรวจสอบ แล้วกด "อนุมัติ" หากเงินเข้าแล้ว
                        </div>
                      )}
                    </div>
                  );
                })()}
                {isPending && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="number" min="1" step="0.01" value={inputAmt}
                      onChange={e => setApproveAmounts(prev => ({ ...prev, [t.id]: e.target.value }))}
                      placeholder="จำนวนเครดิต ฿"
                      style={{ flex: 1, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", outline: "none", color: A.text }} />
                    <button onClick={() => approveMutation.mutate({ id: t.id, amount: parseFloat(inputAmt || "0") })}
                      disabled={!inputAmt || parseFloat(inputAmt) <= 0 || approveMutation.isPending}
                      style={{ background: A.success, color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, opacity: !inputAmt || parseFloat(inputAmt) <= 0 ? 0.5 : 1 }}>
                      <CheckCircle size={14} /> อนุมัติ
                    </button>
                    <button onClick={() => rejectMutation.mutate(t.id)} disabled={rejectMutation.isPending}
                      style={{ background: A.errorBg, color: A.error, border: `1.5px solid ${A.error}44`, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      <XCircle size={14} /> ปฏิเสธ
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AddCreditView ────────────────────────────────────────────────────────────
function AddCreditView({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-customers", shopKey],
    queryFn: () => fetch("/api/nail/admin/customers", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
  });

  const addMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/nail/admin/customers/${selected.id}/credit`, {
        method: "POST",
        headers: { ...authH(token), "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(amount), reason: reason || "แอดมินเพิ่มเครดิต" }),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.detail || "เกิดข้อผิดพลาด"); return d; }),
    onSuccess: (data) => {
      setResult({ ok: true, message: `สำเร็จ! ยอดเครดิตใหม่: ฿${Number(data.balance).toFixed(2)}` });
      setAmount(""); setReason("");
      setSelected((s: any) => s ? { ...s, balance: data.balance } : null);
      qc.invalidateQueries({ queryKey: ["nail-admin-customers", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-transactions", shopKey] });
    },
    onError: (e: any) => setResult({ ok: false, message: e.message || "เกิดข้อผิดพลาด" }),
  });

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q
      || (c.email || "").toLowerCase().includes(q)
      || (c.display_name || "").toLowerCase().includes(q)
      || (c.phone_number || "").includes(q);
  });

  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: "0 0 14px" }}>เพิ่ม / หักเครดิตให้ลูกค้า</h3>

      {/* Customer search */}
      <input value={search} onChange={e => { setSearch(e.target.value); setSelected(null); setResult(null); }}
        placeholder="🔍 ค้นหาชื่อ, อีเมล, หรือเบอร์โทร..."
        style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", color: A.text, boxSizing: "border-box", marginBottom: 8 }} />

      {/* Customer list (when not selected) */}
      {!selected && (
        <div style={{ maxHeight: 260, overflowY: "auto", border: `1px solid ${A.border}`, borderRadius: 12, marginBottom: 14 }}>
          {isLoading ? (
            <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={20} className="animate-spin" color={A.primary} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: A.muted, fontSize: 13 }}>ไม่พบลูกค้า</div>
          ) : filtered.slice(0, 40).map((c: any) => (
            <button key={c.id} onClick={() => { setSelected(c); setSearch(""); setResult(null); }}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "none", border: "none", borderBottom: `1px solid ${A.border}`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: A.text, fontSize: 14 }}>{c.display_name || "ไม่ระบุชื่อ"}</div>
                <div style={{ fontSize: 12, color: A.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>
                {c.phone_number && <div style={{ fontSize: 12, color: A.muted }}>{c.phone_number}</div>}
              </div>
              <span style={{ fontWeight: 700, color: A.primary, fontSize: 14, flexShrink: 0, marginLeft: 8 }}>฿{Number(c.balance).toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Selected customer + form */}
      {selected && (
        <div>
          <div style={{ background: A.pale, border: `1.5px solid ${A.primary}44`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: A.text, fontSize: 15 }}>{selected.display_name || "ไม่ระบุชื่อ"}</div>
                <div style={{ fontSize: 12, color: A.muted }}>{selected.email}</div>
                {selected.phone_number && <div style={{ fontSize: 12, color: A.muted }}>{selected.phone_number}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: A.sub }}>เครดิตปัจจุบัน</div>
                <div style={{ fontWeight: 800, color: A.primary, fontSize: 22 }}>฿{Number(selected.balance).toFixed(2)}</div>
              </div>
            </div>
            <button onClick={() => { setSelected(null); setResult(null); }}
              style={{ marginTop: 8, background: "none", border: "none", color: A.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
              เปลี่ยนลูกค้า
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="number" step="1" value={amount}
              onChange={e => { setAmount(e.target.value); setResult(null); }}
              placeholder="จำนวน (เช่น 200 = เพิ่ม, -50 = หักออก)"
              style={{ border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", color: A.text }} />
            <input type="text" value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="เหตุผล (ไม่บังคับ)"
              style={{ border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", outline: "none", color: A.text }} />

            {result && (
              <div style={{ background: result.ok ? A.successBg : A.errorBg, border: `1px solid ${result.ok ? A.success : A.error}44`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: result.ok ? A.success : A.error, display: "flex", alignItems: "center", gap: 8 }}>
                {result.ok ? <CheckCircle size={14} /> : <AlertCircle size={14} />} {result.message}
              </div>
            )}

            <button
              onClick={() => addMutation.mutate()}
              disabled={!amount || isNaN(parseFloat(amount)) || parseFloat(amount) === 0 || addMutation.isPending}
              style={{
                background: amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0
                  ? (parseFloat(amount) < 0 ? A.error : `linear-gradient(135deg, ${A.primary}, ${A.deep})`)
                  : A.gray,
                color: amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0 ? "#fff" : A.muted,
                border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 700,
                cursor: amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== 0 ? "pointer" : "not-allowed",
                fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {addMutation.isPending
                ? <><Loader2 size={16} className="animate-spin" /> กำลังดำเนินการ...</>
                : !isNaN(parseFloat(amount || "x")) && parseFloat(amount || "0") < 0
                  ? `หักเครดิต ฿${Math.abs(parseFloat(amount || "0")).toFixed(2)}`
                  : `เพิ่มเครดิต ฿${isNaN(parseFloat(amount || "0")) ? "0.00" : parseFloat(amount || "0").toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TransactionsView ─────────────────────────────────────────────────────────
function TransactionsView({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const { data: txns = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-transactions", shopKey],
    queryFn: () => fetch("/api/nail/admin/transactions?limit=100", { headers: authH(token) }).then(r => r.json()),
    staleTime: 15000,
  });

  const typeStyle: Record<string, { label: string; color: string; bg: string }> = {
    topup:        { label: "เติมเงิน",   color: A.success, bg: A.successBg },
    purchase:     { label: "ซื้อสินค้า", color: A.error,   bg: A.errorBg  },
    adjustment:   { label: "ปรับยอด",    color: A.info,    bg: A.infoBg   },
    nail_booking: { label: "มัดจำจอง",   color: A.warning, bg: A.warningBg },
  };

  const totalTopups   = txns.filter(t => t.txn_type === "topup").reduce((s, t) => s + t.amount, 0);
  const totalDeposits = txns.filter(t => t.txn_type === "nail_booking" && t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: 0 }}>ธุรกรรม (100 รายการล่าสุด)</h3>
        <button onClick={() => refetch()} style={{ background: A.pale, border: "none", borderRadius: 10, padding: "7px 10px", cursor: "pointer", color: A.primary, display: "flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <div style={{ background: A.successBg, border: `1px solid ${A.success}33`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: A.success, fontWeight: 600, marginBottom: 4 }}>ยอดเติมเงินรวม</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: A.success }}>฿{totalTopups.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ background: A.warningBg, border: `1px solid ${A.warning}33`, borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: A.warning, fontWeight: 600, marginBottom: 4 }}>มัดจำที่หักแล้ว</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: A.warning }}>฿{totalDeposits.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} className="animate-spin" color={A.primary} /></div>
      ) : txns.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: A.muted }}>ไม่มีธุรกรรม</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {txns.map((t: any) => {
            const ts = typeStyle[t.txn_type] || { label: t.txn_type, color: A.sub, bg: A.gray };
            return (
              <div key={t.id} style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: A.text }}>{t.customer_name || t.customer_email || "?"}</span>
                    <span style={{ background: ts.bg, color: ts.color, borderRadius: 100, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>{ts.label}</span>
                  </div>
                  {t.description && <div style={{ fontSize: 12, color: A.muted, marginTop: 2 }}>{t.description}</div>}
                  <div style={{ fontSize: 11, color: A.muted, marginTop: 1 }}>
                    {t.created_at ? new Date(t.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : ""}
                  </div>
                </div>
                <span style={{ fontWeight: 700, fontSize: 16, color: t.amount >= 0 ? A.success : A.error, flexShrink: 0 }}>
                  {t.amount >= 0 ? "+" : ""}฿{Math.abs(t.amount).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RenewalTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [months, setMonths] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: status, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["nail-admin-rental-status", shopKey],
    queryFn: () => fetch("/api/nail/admin/rental-status", { headers: authH(token) }).then(r => r.json()),
    staleTime: 30000,
    retry: 1,
  });

  // ราคาจริงของร้านนี้ (super-admin อาจตั้งราคาพิเศษไว้) — fallback เป็นราคากลางถ้ายังโหลดไม่เสร็จ
  const { data: plans = RENEWAL_PLANS } = useQuery<any[]>({
    queryKey: ["nail-admin-renewal-plans", shopKey],
    queryFn: () => fetch("/api/nail/admin/renewal-plans", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  // ข้อมูลบัญชีรับเงินของ super-admin (ไปโอนที่ไหน)
  const { data: saPayment } = useQuery<any>({
    queryKey: ["nail-admin-sa-payment-info", shopKey],
    queryFn: () => fetch("/api/nail/admin/superadmin-payment-info", { headers: authH(token) }).then(r => r.json()),
    staleTime: 120000,
    retry: 1,
  });

  const [payMethod, setPayMethod] = useState<"slip" | "truemoney">("slip");
  const [voucher, setVoucher] = useState("");
  const [submitResult, setSubmitResult] = useState<{
    auto_approved: boolean;
    message: string | null;
    new_expired_at?: string;
    voucher_amount?: number;
  } | null>(null);

  const selectedPlan = (plans as any[]).find(p => p.months === months);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        duration_months: months,
        payment_channel: payMethod === "slip" ? "bank_slip" : "angpao",
      };
      if (payMethod === "slip") body.slip_image = preview;
      else body.voucher_code = voucher.trim();
      const r = await fetch("/api/nail/admin/renewal-request", {
        method: "POST",
        headers: { ...authH(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-rental-status", shopKey] });
      qc.invalidateQueries({ queryKey: ["shop-gate-settings"] });
      setPreview(null);
      setVoucher("");
      setSubmitResult({
        auto_approved: data.auto_approved,
        message: data.message,
        new_expired_at: data.new_expired_at,
        voucher_amount: data.voucher_amount,
      });
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (file.size > 1.5 * 1024 * 1024) {
      setFileError("รูปสลิปต้องไม่เกิน 1.5 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  if (isError) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={32} color={A.error} style={{ margin: "0 auto 10px" }} />
        <p style={{ color: A.sub, marginBottom: 12 }}>โหลดสถานะการเช่าไม่สำเร็จ กรุณาลองใหม่</p>
        <button onClick={() => refetch()} style={{ background: A.pale, color: A.primary, border: "none", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          <RefreshCw size={14} style={{ display: "inline", marginRight: 6 }} />ลองใหม่
        </button>
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} className="animate-spin" color={A.primary} /></div>;
  }

  const lastReq = status?.last_request;

  return (
    <div style={{ padding: 16 }}>
      {/* Status Card */}
      <div style={{
        background: status?.is_expired ? A.errorBg : `linear-gradient(135deg, ${A.primary}, ${A.deep})`,
        borderRadius: 16, padding: 20, marginBottom: 16, color: status?.is_expired ? A.error : "#fff",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Crown size={18} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>สถานะการใช้งานระบบ</span>
        </div>
        {status?.is_expired ? (
          <p style={{ fontWeight: 700, fontSize: 16 }}>หมดอายุการใช้งานแล้ว</p>
        ) : status?.expired_at ? (
          <p style={{ fontSize: 14, opacity: 0.95 }}>
            เหลือ <b>{status.days_left}</b> วัน (หมดอายุ {fmtDate(status.expired_at.slice(0, 10))})
          </p>
        ) : (
          <p style={{ fontSize: 14, opacity: 0.95 }}>ยังไม่มีกำหนดหมดอายุ</p>
        )}
      </div>

      {/* Last request status */}
      {lastReq && (
        <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: A.text, marginBottom: 8 }}>คำขอต่ออายุล่าสุด</h3>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: A.sub }}>
            <span>{lastReq.duration_months} เดือน · ฿{lastReq.amount.toLocaleString()}</span>
            <span style={{
              color: RENEWAL_STATUS_LABEL[lastReq.status]?.color || A.sub,
              fontWeight: 700, background: `${RENEWAL_STATUS_LABEL[lastReq.status]?.color || A.sub}18`,
              borderRadius: 100, padding: "2px 10px", fontSize: 12,
            }}>
              {RENEWAL_STATUS_LABEL[lastReq.status]?.label || lastReq.status}
            </span>
          </div>
          {lastReq.admin_note && <p style={{ fontSize: 12, color: A.muted, marginTop: 6 }}>หมายเหตุ: {lastReq.admin_note}</p>}
        </div>
      )}

      {/* SuperAdmin payment info — ต้องโอนเงินไปที่ไหน */}
      {(saPayment?.sa_bank_name || saPayment?.sa_bank_account_number || saPayment?.sa_truemoney_phone) && (
        <div style={{ background: "#FFFBEB", border: `1.5px solid #FDE68A`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#92400E", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            💸 โอนเงินไปที่บัญชีนี้
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {saPayment?.sa_bank_name && (
              <div style={{ fontSize: 13, color: "#78350F" }}>
                <span style={{ fontWeight: 600 }}>ธนาคาร:</span> {saPayment.sa_bank_name}
              </div>
            )}
            {saPayment?.sa_bank_account_name && (
              <div style={{ fontSize: 13, color: "#78350F" }}>
                <span style={{ fontWeight: 600 }}>ชื่อบัญชี:</span> {saPayment.sa_bank_account_name}
              </div>
            )}
            {saPayment?.sa_bank_account_number && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 13, color: "#78350F" }}>
                  <span style={{ fontWeight: 600 }}>เลขบัญชี:</span>{" "}
                  <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700 }}>{saPayment.sa_bank_account_number}</span>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(saPayment.sa_bank_account_number)}
                  style={{ background: "#FDE68A", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, color: "#92400E", fontFamily: "inherit" }}
                >
                  คัดลอก
                </button>
              </div>
            )}
            {saPayment?.sa_truemoney_phone && (
              <div style={{ fontSize: 13, color: "#78350F" }}>
                <span style={{ fontWeight: 600 }}>🧧 TrueMoney เบอร์:</span> {saPayment.sa_truemoney_phone}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Renewal form */}
      <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: A.text, marginBottom: 12 }}>ต่ออายุการใช้งาน</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {(plans as any[]).map(p => (
            <button key={p.months} onClick={() => setMonths(p.months)}
              style={{
                border: `1.5px solid ${months === p.months ? A.primary : A.border}`,
                background: months === p.months ? A.pale : A.bg,
                borderRadius: 10, padding: "10px 8px", cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              }}>
              <div style={{ fontWeight: 700, color: A.text, fontSize: 14 }}>{p.months} เดือน</div>
              <div style={{ fontSize: 12, color: A.primary, fontWeight: 600 }}>฿{p.price.toLocaleString()}</div>
            </button>
          ))}
        </div>

        {/* Payment method selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([["slip", "🏦 โอนสลิป"], ["truemoney", "🧧 TrueMoney"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setPayMethod(m)}
              style={{ flex: 1, border: `1.5px solid ${payMethod === m ? A.primary : A.border}`, background: payMethod === m ? A.pale : A.bg, borderRadius: 10, padding: "9px 6px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: payMethod === m ? A.primary : A.sub }}>
              {label}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        {fileError && (
          <div style={{ background: A.errorBg, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.error, fontSize: 13 }}>
            {fileError}
          </div>
        )}

        {payMethod === "slip" ? (
          preview ? (
            <div style={{ marginBottom: 14 }}>
              <img src={preview} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 12, border: `2px solid ${A.primary}` }} />
              <button onClick={() => setPreview(null)} style={{ marginTop: 8, background: A.gray, border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>เปลี่ยนรูปสลิป</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width: "100%", border: `2px dashed ${A.border}`, borderRadius: 14, padding: "18px", background: A.pale, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: A.primary, fontWeight: 600, fontFamily: "inherit", fontSize: 14 }}>
              <Upload size={18} /> อัปโหลดสลิปโอนเงิน
            </button>
          )
        ) : (
          <div style={{ marginBottom: 14 }}>
            <input
              type="text"
              value={voucher}
              onChange={e => setVoucher(e.target.value)}
              placeholder="https://gift.truemoney.com/campaign/?v=... หรือรหัสซอง"
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", outline: "none", color: A.text, boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: A.muted, marginTop: 6 }}>วางลิงก์ซอง TrueMoney Gift จาก TrueMoney Wallet App</p>
          </div>
        )}

        {submitResult ? (
          // ── ผลลัพธ์หลังกด submit ────────────────────────────────────────
          <div style={{
            background: submitResult.auto_approved ? A.successBg ?? "#f0fdf4" : A.pale,
            border: `1.5px solid ${submitResult.auto_approved ? A.success : A.border}`,
            borderRadius: 12, padding: 16, textAlign: "center",
          }}>
            {submitResult.auto_approved ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                <p style={{ fontWeight: 700, color: A.success, fontSize: 15, marginBottom: 4 }}>ต่ออายุสำเร็จ!</p>
                <p style={{ color: A.sub, fontSize: 13, marginBottom: 4 }}>{submitResult.message}</p>
                {submitResult.new_expired_at && (
                  <p style={{ color: A.text, fontSize: 13, fontWeight: 600 }}>
                    หมดอายุใหม่: {fmtDate(submitResult.new_expired_at.slice(0, 10))}
                  </p>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                <p style={{ fontWeight: 700, color: A.text, fontSize: 14, marginBottom: 4 }}>
                  {payMethod === "slip" ? "ส่งสลิปแล้ว รอแอดมินตรวจสอบ" : "บันทึกแล้ว รอแอดมินตรวจสอบ"}
                </p>
                {submitResult.message && (
                  <p style={{ color: A.sub, fontSize: 13 }}>{submitResult.message}</p>
                )}
              </>
            )}
            <button onClick={() => setSubmitResult(null)}
              style={{ marginTop: 12, background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: A.primary, fontWeight: 600 }}>
              ต่ออายุเพิ่มเติม
            </button>
          </div>
        ) : (
          (() => {
            const canSubmit = payMethod === "slip" ? !!preview : !!voucher.trim();
            return (
              <>
                <button onClick={() => submitMutation.mutate()} disabled={!canSubmit || submitMutation.isPending}
                  style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, opacity: !canSubmit ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {submitMutation.isPending
                    ? <><Loader2 size={15} className="animate-spin" /> {payMethod === "truemoney" ? "กำลังแลกซอง…" : "กำลังส่ง…"}</>
                    : <><Save size={15} /> {payMethod === "truemoney" ? "แลกซองและต่ออายุ" : "ส่งคำขอต่ออายุ"}</>
                  }
                </button>
                {submitMutation.isError && (
                  <p style={{ textAlign: "center", color: A.error, fontSize: 13, marginTop: 8 }}>
                    {(submitMutation.error as any)?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"}
                  </p>
                )}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

// ─── Admin Billing Block — แสดงเมื่อแพ็กเกจหมดอายุ ────────────────────────────
function AdminBillingBlock({
  token, slug, onRenewalSuccess,
}: { token: string; slug: string | null; onRenewalSuccess: () => void }) {
  const shopKey = slug ?? "default";
  const qc = useQueryClient();

  const [months, setMonths] = useState(1);
  const [payMethod, setPayMethod] = useState<"slip" | "truemoney">("slip");
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [voucher, setVoucher] = useState("");
  const [submitResult, setSubmitResult] = useState<{
    auto_approved: boolean; message: string | null; new_expired_at?: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: plans = RENEWAL_PLANS } = useQuery<any[]>({
    queryKey: ["nail-admin-renewal-plans", shopKey],
    queryFn: () => fetch("/api/nail/admin/renewal-plans", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60_000, retry: 1,
  });

  const { data: saPayment } = useQuery<any>({
    queryKey: ["nail-admin-sa-payment-info", shopKey],
    queryFn: () => fetch("/api/nail/admin/superadmin-payment-info", { headers: authH(token) }).then(r => r.json()),
    staleTime: 120_000, retry: 1,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        duration_months: months,
        payment_channel: payMethod === "slip" ? "bank_slip" : "angpao",
      };
      if (payMethod === "slip") body.slip_image = preview;
      else body.voucher_code = voucher.trim();
      const r = await fetch("/api/nail/admin/renewal-request", {
        method: "POST",
        headers: { ...authH(token), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-rental-status", shopKey] });
      setSubmitResult({ auto_approved: data.auto_approved, message: data.message, new_expired_at: data.new_expired_at });
      if (data.auto_approved) {
        // Short delay so the user can read the success message, then lift the block
        setTimeout(() => onRenewalSuccess(), 2500);
      }
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    if (file.size > 1.5 * 1024 * 1024) {
      setFileError("รูปสลิปต้องไม่เกิน 1.5 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit = payMethod === "slip" ? !!preview : !!voucher.trim();
  const selectedPlan = (plans as any[]).find(p => p.months === months);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      overflowY: "auto",
      fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif",
    }}>
      {/* Keyframe animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        @keyframes bb-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes bb-pulse {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%       { transform: scale(1.12); opacity: 1;    }
        }
        @keyframes bb-orbit {
          from { transform: rotate(0deg)   translateX(56px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(56px) rotate(-360deg); }
        }
        @keyframes bb-orbit2 {
          from { transform: rotate(120deg) translateX(56px) rotate(-120deg); }
          to   { transform: rotate(480deg) translateX(56px) rotate(-480deg); }
        }
        @keyframes bb-orbit3 {
          from { transform: rotate(240deg) translateX(56px) rotate(-240deg); }
          to   { transform: rotate(600deg) translateX(56px) rotate(-600deg); }
        }
        @keyframes bb-fade-in {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bb-glow {
          0%, 100% { box-shadow: 0 0 28px 8px rgba(244,114,182,0.25); }
          50%       { box-shadow: 0 0 48px 16px rgba(244,114,182,0.45); }
        }
      `}</style>

      {/* ── Cherry-blossom spinner ── */}
      <div style={{
        position: "relative",
        width: 140, height: 140,
        marginTop: 48, marginBottom: 8,
        flexShrink: 0,
      }}>
        {/* Outer glow ring */}
        <div style={{
          position: "absolute", inset: 10,
          borderRadius: "50%",
          animation: "bb-glow 3s ease-in-out infinite",
        }} />
        {/* Spinning ring */}
        <div style={{
          position: "absolute", inset: 0,
          animation: "bb-spin 8s linear infinite",
        }}>
          {/* Orbit petal 1 */}
          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -10, marginLeft: -10, animation: "bb-orbit 8s linear infinite", fontSize: 20, lineHeight: 1 }}>🌸</div>
          {/* Orbit petal 2 */}
          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -10, marginLeft: -10, animation: "bb-orbit2 8s linear infinite", fontSize: 16, lineHeight: 1 }}>🌸</div>
          {/* Orbit petal 3 */}
          <div style={{ position: "absolute", top: "50%", left: "50%", marginTop: -10, marginLeft: -10, animation: "bb-orbit3 8s linear infinite", fontSize: 14, lineHeight: 1 }}>🌸</div>
        </div>
        {/* Center blossom — pulses */}
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: 52, lineHeight: 1,
          animation: "bb-pulse 3s ease-in-out infinite",
          filter: "drop-shadow(0 0 12px rgba(244,114,182,0.7))",
        }}>🌸</div>
      </div>

      {/* ── Notification message ── */}
      <div style={{
        maxWidth: 340, textAlign: "center", padding: "0 20px 12px",
        animation: "bb-fade-in 0.6s ease both",
        flexShrink: 0,
      }}>
        <h2 style={{
          fontSize: 17, fontWeight: 700,
          color: "#f9a8d4",
          lineHeight: 1.6, marginBottom: 6,
        }}>
          ระบบจัดการคิวอัตโนมัติ CSC ของร้านคุณเข้าสู่โหมดจำศีลชั่วคราว 🌸
        </h2>
        <p style={{
          fontSize: 13, color: "rgba(255,255,255,0.7)",
          lineHeight: 1.75, marginBottom: 0,
        }}>
          เพื่อเปิดใช้งานหน้าเว็บหน้าร้านให้ลูกค้าจองคิวต่อ และเข้าถึงแดชบอร์ดสถิติ
          กรุณาต่ออายุแพ็กเกจรายเดือนด้านล่างนี้ได้เลยครับ
        </p>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
          ระบบตรวจสอบการต่ออายุอัตโนมัติทุก 30 วินาที
        </p>
      </div>

      {/* ── Renewal card ── */}
      <div style={{
        width: "100%", maxWidth: 400,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(244,114,182,0.25)",
        borderRadius: 20,
        padding: 20,
        margin: "8px 16px 48px",
        animation: "bb-fade-in 0.7s ease 0.15s both",
        flexShrink: 0,
      }}>

        {/* Bank info from superadmin-payment-info */}
        {(saPayment?.sa_bank_name || saPayment?.sa_bank_account_number || saPayment?.sa_truemoney_phone) && (
          <div style={{
            background: "rgba(253,230,138,0.1)",
            border: "1px solid rgba(253,230,138,0.3)",
            borderRadius: 12, padding: 14, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fde68a", marginBottom: 8 }}>
              💸 โอนเงินค่าต่ออายุมาที่บัญชีนี้
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {saPayment?.sa_bank_name && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  <span style={{ fontWeight: 600 }}>ธนาคาร:</span> {saPayment.sa_bank_name}
                </div>
              )}
              {saPayment?.sa_bank_account_name && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  <span style={{ fontWeight: 600 }}>ชื่อบัญชี:</span> {saPayment.sa_bank_account_name}
                </div>
              )}
              {saPayment?.sa_bank_account_number && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 13, color: "#fde68a", fontFamily: "monospace", fontWeight: 700 }}>
                    {saPayment.sa_bank_account_number}
                  </div>
                  <button
                    onClick={() => navigator.clipboard.writeText(saPayment.sa_bank_account_number)}
                    style={{
                      background: "rgba(253,230,138,0.2)", border: "1px solid rgba(253,230,138,0.4)",
                      borderRadius: 6, padding: "2px 8px", cursor: "pointer",
                      fontSize: 11, color: "#fde68a", fontFamily: "inherit",
                    }}
                  >
                    คัดลอก
                  </button>
                </div>
              )}
              {saPayment?.sa_truemoney_phone && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                  <span style={{ fontWeight: 600 }}>🧧 TrueMoney เบอร์:</span> {saPayment.sa_truemoney_phone}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plan selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
            เลือกระยะเวลาที่ต้องการต่ออายุ
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(plans as any[]).map(p => (
              <button key={p.months} onClick={() => setMonths(p.months)} style={{
                border: `1.5px solid ${months === p.months ? "#f472b6" : "rgba(255,255,255,0.15)"}`,
                background: months === p.months ? "rgba(244,114,182,0.18)" : "rgba(255,255,255,0.04)",
                borderRadius: 10, padding: "10px 8px", cursor: "pointer",
                fontFamily: "inherit", textAlign: "center",
              }}>
                <div style={{ fontWeight: 700, color: months === p.months ? "#f9a8d4" : "rgba(255,255,255,0.8)", fontSize: 14 }}>
                  {p.months} เดือน
                </div>
                <div style={{ fontSize: 12, color: months === p.months ? "#f472b6" : "rgba(255,255,255,0.5)", fontWeight: 600 }}>
                  ฿{p.price.toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Payment method */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {([["slip", "🏦 โอนสลิป"], ["truemoney", "🧧 TrueMoney"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => setPayMethod(m)} style={{
              flex: 1,
              border: `1.5px solid ${payMethod === m ? "#f472b6" : "rgba(255,255,255,0.15)"}`,
              background: payMethod === m ? "rgba(244,114,182,0.18)" : "rgba(255,255,255,0.04)",
              borderRadius: 10, padding: "9px 6px", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              color: payMethod === m ? "#f9a8d4" : "rgba(255,255,255,0.6)",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* File input (hidden) */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

        {fileError && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: "#fca5a5", fontSize: 13 }}>
            {fileError}
          </div>
        )}

        {payMethod === "slip" ? (
          preview ? (
            <div style={{ marginBottom: 14 }}>
              <img src={preview} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 12, border: "2px solid #f472b6" }} />
              <button onClick={() => setPreview(null)} style={{
                marginTop: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, color: "rgba(255,255,255,0.7)",
              }}>
                เปลี่ยนรูปสลิป
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} style={{
              width: "100%",
              border: "2px dashed rgba(244,114,182,0.4)",
              borderRadius: 14, padding: "18px",
              background: "rgba(244,114,182,0.06)",
              cursor: "pointer", marginBottom: 14,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              color: "#f9a8d4", fontWeight: 600, fontFamily: "inherit", fontSize: 14,
            }}>
              <Upload size={18} /> อัปโหลดสลิปโอนเงิน
            </button>
          )
        ) : (
          <div style={{ marginBottom: 14 }}>
            <input
              type="text"
              value={voucher}
              onChange={e => setVoucher(e.target.value)}
              placeholder="https://gift.truemoney.com/campaign/?v=... หรือรหัสซอง"
              style={{
                width: "100%", border: "1.5px solid rgba(255,255,255,0.2)",
                borderRadius: 10, padding: "10px 12px", fontSize: 13,
                fontFamily: "inherit", outline: "none",
                background: "rgba(255,255,255,0.06)", color: "#fff",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
              วางลิงก์ซอง TrueMoney Gift จาก TrueMoney Wallet App
            </p>
          </div>
        )}

        {/* Result / Submit */}
        {submitResult ? (
          <div style={{
            background: submitResult.auto_approved ? "rgba(34,197,94,0.12)" : "rgba(244,114,182,0.1)",
            border: `1.5px solid ${submitResult.auto_approved ? "rgba(34,197,94,0.4)" : "rgba(244,114,182,0.3)"}`,
            borderRadius: 12, padding: 16, textAlign: "center",
          }}>
            {submitResult.auto_approved ? (
              <>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                <p style={{ fontWeight: 700, color: "#86efac", fontSize: 15, marginBottom: 4 }}>ต่ออายุสำเร็จ! กำลังเปิดระบบ…</p>
                <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{submitResult.message}</p>
                {submitResult.new_expired_at && (
                  <p style={{ color: "#f9a8d4", fontSize: 13, fontWeight: 600, marginTop: 4 }}>
                    หมดอายุใหม่: {fmtDate(submitResult.new_expired_at.slice(0, 10))}
                  </p>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                <p style={{ fontWeight: 700, color: "#f9a8d4", fontSize: 14, marginBottom: 4 }}>
                  ส่ง{payMethod === "slip" ? "สลิป" : "ซอง"}แล้ว — รอ CSC ตรวจสอบ
                </p>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.6 }}>
                  {submitResult.message || "ทีมงานจะดำเนินการตรวจสอบและเปิดระบบให้ภายใน 24 ชั่วโมง"}
                </p>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 8 }}>
                  ระบบจะเปิดโดยอัตโนมัติเมื่อ CSC อนุมัติ
                </p>
                <button onClick={() => setSubmitResult(null)} style={{
                  marginTop: 12,
                  background: "rgba(244,114,182,0.15)", border: "1px solid rgba(244,114,182,0.3)",
                  borderRadius: 8, padding: "7px 16px", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, color: "#f9a8d4", fontWeight: 600,
                }}>
                  ส่งสลิปใหม่อีกครั้ง
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {selectedPlan && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 10 }}>
                ยอดที่ต้องโอน: <span style={{ color: "#f9a8d4", fontWeight: 700, fontSize: 15 }}>฿{selectedPlan.price.toLocaleString()}</span> ({months} เดือน)
              </div>
            )}
            <button
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit || submitMutation.isPending}
              style={{
                width: "100%",
                background: canSubmit ? "linear-gradient(135deg, #be185d, #831843)" : "rgba(255,255,255,0.08)",
                color: canSubmit ? "#fff" : "rgba(255,255,255,0.3)",
                border: "none", borderRadius: 10, padding: "13px",
                cursor: canSubmit && !submitMutation.isPending ? "pointer" : "not-allowed",
                fontWeight: 700, fontFamily: "inherit", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 0.2s",
              }}
            >
              {submitMutation.isPending
                ? <><Loader2 size={15} style={{ animation: "bb-spin 1s linear infinite" }} /> {payMethod === "truemoney" ? "กำลังแลกซอง…" : "กำลังส่ง…"}</>
                : <><Save size={15} /> {payMethod === "truemoney" ? "แลกซองและต่ออายุ" : "ส่งสลิปต่ออายุ"}</>
              }
            </button>
            {submitMutation.isError && (
              <p style={{ textAlign: "center", color: "#fca5a5", fontSize: 13, marginTop: 8 }}>
                {(submitMutation.error as any)?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Weekly recurring slot template ──────────────────────────────────────────
const DAY_NAMES_TH  = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const DAY_SHORT_TH  = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];
const DOW_HEADER_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_TH_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                        "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function WeeklyTemplateSection({ token, onGenerated }: { token: string; onGenerated: () => void }) {
  const shopKey = useShopSlug() ?? "default";
  const qc = useQueryClient();

  const [rows, setRows]       = useState<any[] | null>(null);
  const [selDay, setSelDay]   = useState<number | null>(null);
  const [saved, setSaved]     = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showAdv, setShowAdv] = useState(false);

  const { data, isLoading, isError } = useQuery<any[]>({
    queryKey: ["nail-admin-slot-templates", shopKey],
    queryFn: () =>
      fetch("/api/nail/admin/slot-templates", { headers: authH(token) }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (Array.isArray(data) && !rows)
      setRows(data.map((d: any) => ({
        ...d,
        extra_blocks: (() => { try { return JSON.parse(d.extra_blocks || "[]"); } catch { return []; } })()
      })));
  }, [data]);

  // บันทึก template แล้ว auto-sync 30 วันข้างหน้าในครั้งเดียว
  const saveMutation = useMutation({
    mutationFn: async () => {
      const r1 = await fetch("/api/nail/admin/slot-templates", {
        method: "PUT",
        headers: authH(token),
        body: JSON.stringify({ templates: rows!.map(r => ({ ...r, extra_blocks: JSON.stringify(r.extra_blocks || []) })) }),
      });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1?.detail ?? `HTTP ${r1.status}`);
      // auto-sync 30 วันข้างหน้าทันที
      const r2 = await fetch("/api/nail/admin/slot-templates/sync-future", {
        method: "POST",
        headers: authH(token),
        body: JSON.stringify({ days: 30 }),
      });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2?.detail ?? `HTTP ${r2.status}`);
      return d2;
    },
    onSuccess: (d: any) => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      qc.invalidateQueries({ queryKey: ["nail-admin-slot-templates", shopKey] });
      qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] });
      onGenerated();
      if (d.changed_dates?.length > 0)
        setSyncMsg(`อัปเดตตารางแล้ว ${d.changed_dates.length} วัน (สล็อตที่มีการจองไม่ถูกแตะ)`);
      else
        setSyncMsg("ตารางทุกวันตรงกับเทมเพลตแล้ว");
      setTimeout(() => setSyncMsg(null), 5000);
    },
    onError: (e: any) => alert(`บันทึกไม่สำเร็จ: ${e.message}`),
  });

  // (ขั้นสูง) Sync เฉพาะเจาะจง
  const syncMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nail/admin/slot-templates/sync-future", {
        method: "POST",
        headers: authH(token),
        body: JSON.stringify({ days: 30 }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] });
      onGenerated();
      setSyncMsg(
        d.changed_dates?.length > 0
          ? `Sync แล้ว ${d.changed_dates.length} วัน (สร้างใหม่ ${d.total_created} • ลบเก่า ${d.total_deleted})`
          : "ทุกวันตรงกับเทมเพลตล่าสุดอยู่แล้ว"
      );
      setTimeout(() => setSyncMsg(null), 5000);
    },
    onError: (e: any) => alert(`Sync ไม่สำเร็จ: ${e.message}`),
  });

  const updateRow = (dow: number, patch: object) =>
    setRows(prev => prev!.map(r => r.day_of_week === dow ? { ...r, ...patch } : r));
  const addBlock = (dow: number, defRow: any) => {
    // คำนวณ start_time ของบล็อกใหม่ = end time ของบล็อกล่าสุด (main row หรือ extra block สุดท้าย)
    const blockEnd = (start: string, count: number, mins: number, gap: number) => {
      const [sh, sm] = start.split(":").map(Number);
      const total = sh * 60 + sm + count * (mins + gap) - gap;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    };
    setRows(prev => prev!.map(r => {
      if (r.day_of_week !== dow) return r;
      const extras = r.extra_blocks || [];
      const last = extras.length > 0 ? extras[extras.length - 1] : r;
      const autoStart = blockEnd(
        last.start_time,
        last.rounds_count,
        last.round_minutes ?? defRow.round_minutes,
        last.gap_minutes ?? defRow.gap_minutes ?? 0,
      );
      return {
        ...r, extra_blocks: [...extras,
          { start_time: autoStart, rounds_count: 2, round_minutes: defRow.round_minutes, gap_minutes: defRow.gap_minutes || 0, max_bookings: defRow.max_bookings }],
      };
    }));
  };
  const removeBlock = (dow: number, idx: number) =>
    setRows(prev => prev!.map(r => r.day_of_week === dow ? {
      ...r, extra_blocks: (r.extra_blocks || []).filter((_: any, i: number) => i !== idx)
    } : r));
  const updateBlock = (dow: number, idx: number, patch: object) =>
    setRows(prev => prev!.map(r => r.day_of_week === dow ? {
      ...r, extra_blocks: (r.extra_blocks || []).map((b: any, i: number) => i === idx ? { ...b, ...patch } : b)
    } : r));

  if (isError) return (
    <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <p style={{ color: A.error, fontSize: 13, textAlign: "center", margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <AlertTriangle size={14} /> โหลดเทมเพลตไม่สำเร็จ — กรุณา Refresh หรือล็อกอินใหม่
      </p>
    </div>
  );
  if (isLoading || !rows) return (
    <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16, textAlign: "center" }}>
      <Loader2 size={20} color={A.primary} className="animate-spin" />
    </div>
  );

  const selectedRow = selDay !== null ? rows.find(r => r.day_of_week === selDay) : null;
  const openRows    = rows.filter(r => r.is_open);

  return (
    <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        <Calendar size={15} color={A.primary} /> เวลาทำการประจำสัปดาห์
      </h3>
      <p style={{ color: A.muted, fontSize: 12, margin: "0 0 14px" }}>
        กดวันที่ต้องการตั้งเวลา — บันทึกแล้วระบบอัปเดตตาราง 30 วันข้างหน้าให้อัตโนมัติ
      </p>

      {/* ── Day pills ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {rows.map(r => {
          const active = selDay === r.day_of_week;
          return (
            <button key={r.day_of_week}
              onClick={() => setSelDay(active ? null : r.day_of_week)}
              style={{
                border: `2px solid ${active ? A.primary : r.is_open ? A.border : A.grayBorder}`,
                borderRadius: 10, padding: "8px 14px", cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                background: active ? A.pale : r.is_open ? A.card : A.gray,
                color: active ? A.primary : r.is_open ? A.text : A.muted,
                position: "relative",
              }}>
              {DAY_SHORT_TH[r.day_of_week]}
              {r.is_open && (
                <span style={{ position: "absolute", top: -5, right: -5, background: A.primary, borderRadius: "50%", width: 8, height: 8, border: `2px solid ${A.card}`, display: "block" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Selected day config panel ── */}
      {selectedRow && (
        <div style={{ border: `1.5px solid ${A.border}`, borderRadius: 12, padding: 14, marginBottom: 14, background: A.pale }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: A.text }}>วัน{DAY_NAMES_TH[selectedRow.day_of_week]}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <span style={{ fontSize: 12, color: A.sub }}>{selectedRow.is_open ? "เปิดร้าน" : "ปิดร้าน"}</span>
              {/* toggle switch */}
              <div onClick={() => updateRow(selectedRow.day_of_week, { is_open: !selectedRow.is_open })}
                style={{ width: 36, height: 20, borderRadius: 10, background: selectedRow.is_open ? A.primary : A.grayBorder, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                <div style={{ position: "absolute", top: 2, left: selectedRow.is_open ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
              </div>
            </label>
          </div>

          {selectedRow.is_open && (
            <>
              {/* 3-col: เริ่ม / จำนวนคิว / รับต่อคิว */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>เริ่มกี่โมง</label>
                  <TimeSelect value={selectedRow.start_time} onChange={v => updateRow(selectedRow.day_of_week, { start_time: v })} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>จำนวนคิว</label>
                  <NumberField min={0} value={selectedRow.rounds_count} onChange={n => updateRow(selectedRow.day_of_week, { rounds_count: n })}
                    style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", background: A.card }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>รับต่อคิว</label>
                  <NumberField min={1} value={selectedRow.max_bookings} onChange={n => updateRow(selectedRow.day_of_week, { max_bookings: n })}
                    style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", background: A.card }} />
                </div>
              </div>
              {/* ความยาวคิว — แถวแยก ป้องกัน overflow */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>ความยาวต่อคิว (นาที)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <NumberField min={1} value={selectedRow.round_minutes} onChange={n => updateRow(selectedRow.day_of_week, { round_minutes: n })}
                    style={{ width: 80, border: `1px solid ${A.border}`, borderRadius: 8, padding: "7px 8px", fontFamily: "inherit", fontSize: 13, boxSizing: "border-box", background: A.card }} />
                  <span style={{ fontSize: 12, color: A.muted }}>นาที / คิว</span>
                </div>
              </div>
              {/* Live preview */}
              {(() => {
                const times = computeSlotTimes(selectedRow.start_time, selectedRow.rounds_count, selectedRow.round_minutes, selectedRow.gap_minutes ?? 0);
                if (!times.length) return null;
                return (
                  <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: showAdv ? 10 : 0 }}>
                    <span style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 4 }}>ตัวอย่างเวลา</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {times.slice(0, 8).map(t => (
                        <span key={t} style={{ fontSize: 11, background: A.pale, color: A.primary, borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>{t}</span>
                      ))}
                      {selectedRow.rounds_count > 8 && <span style={{ fontSize: 11, color: A.muted }}>+{selectedRow.rounds_count - 8} เพิ่มเติม</span>}
                    </div>
                  </div>
                );
              })()}

              {/* Extra blocks (advanced) */}
              {showAdv && (selectedRow.extra_blocks || []).map((blk: any, idx: number) => (
                <div key={idx} style={{ border: `1.5px dashed ${A.primary}55`, borderRadius: 10, padding: 10, marginTop: 8, background: A.pale }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: A.primary }}>บล็อก {idx + 2}</span>
                    <button onClick={() => removeBlock(selectedRow.day_of_week, idx)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: A.error, fontSize: 12, padding: "2px 8px", borderRadius: 6, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                      <X size={12} /> ลบ
                    </button>
                  </div>
                  {/* 3-col: เริ่ม / จำนวนคิว / รับต่อคิว */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>เริ่มกี่โมง</label>
                      <TimeSelect value={blk.start_time} onChange={v => updateBlock(selectedRow.day_of_week, idx, { start_time: v })} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>จำนวนคิว</label>
                      <NumberField min={0} value={blk.rounds_count} onChange={n => updateBlock(selectedRow.day_of_week, idx, { rounds_count: n })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.card }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>รับต่อคิว</label>
                      <NumberField min={1} value={blk.max_bookings} onChange={n => updateBlock(selectedRow.day_of_week, idx, { max_bookings: n })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.card }} />
                    </div>
                  </div>
                  {/* ความยาวต่อคิว — แถวแยก เหมือนบล็อกหลัก */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>ความยาวต่อคิว (นาที)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <NumberField min={1} value={blk.round_minutes ?? selectedRow.round_minutes} onChange={n => updateBlock(selectedRow.day_of_week, idx, { round_minutes: n })}
                        style={{ width: 72, border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.card }} />
                      <span style={{ fontSize: 11, color: A.muted }}>นาที / คิว</span>
                    </div>
                  </div>
                  {(() => {
                    const times = computeSlotTimes(blk.start_time, blk.rounds_count, blk.round_minutes ?? selectedRow.round_minutes, blk.gap_minutes ?? 0);
                    if (!times.length) return null;
                    return (
                      <div style={{ background: A.card, border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 10px", fontSize: 11, color: A.sub }}>
                        <span style={{ fontWeight: 600, color: A.primary, marginRight: 6 }}>ตัวอย่าง:</span>
                        {times.slice(0, 6).join("  •  ")}
                      </div>
                    );
                  })()}
                </div>
              ))}
              {showAdv && (
                <button onClick={() => addBlock(selectedRow.day_of_week, selectedRow)}
                  style={{ width: "100%", marginTop: 8, background: "none", border: `1px dashed ${A.primary}77`, borderRadius: 8, padding: "7px", cursor: "pointer", color: A.primary, fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Plus size={13} /> เพิ่มช่วงเวลา (บล็อก {(selectedRow.extra_blocks?.length || 0) + 2})
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Summary (no day selected) ── */}
      {selDay === null && (
        <div style={{ background: A.successBg, border: `1px solid ${A.success}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: A.success, fontWeight: 700, marginBottom: openRows.length ? 6 : 0, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={13} /> เปิด {openRows.length} วัน / สัปดาห์
            {openRows.length === 0 && <span style={{ color: A.muted, fontWeight: 400 }}>— กดวันด้านบนเพื่อตั้งค่า</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {openRows.map(r => {
              const extras = r.extra_blocks || [];
              const allBlocks = [
                { start_time: r.start_time, rounds_count: r.rounds_count, round_minutes: r.round_minutes },
                ...extras,
              ];
              return (
                <div key={r.day_of_week} style={{ fontSize: 12, color: A.sub, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ flexShrink: 0 }}>วัน{DAY_NAMES_TH[r.day_of_week]}</span>
                  <span style={{ color: A.muted, textAlign: "right" }}>
                    {allBlocks.map((blk, i) => (
                      <span key={i} style={{ display: "block" }}>
                        {blk.start_time} · {blk.rounds_count} คิว · {blk.round_minutes} น./คิว
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
            {rows.filter(r => !r.is_open).length > 0 && (
              <div style={{ fontSize: 11, color: A.muted, marginTop: 2 }}>
                ปิด: {rows.filter(r => !r.is_open).map(r => `วัน${DAY_NAMES_TH[r.day_of_week]}`).join(", ")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONE save button ── */}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ width: "100%", background: saved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "13px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        {saveMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> กำลังบันทึก & อัปเดตตาราง…</> : saved ? <><CheckCircle size={16} /> บันทึกแล้ว!</> : <><Save size={16} /> บันทึก & อัปเดตตาราง</>}
      </button>

      {syncMsg && <p style={{ textAlign: "center", color: A.success, fontSize: 12, margin: "0 0 8px" }}>{syncMsg}</p>}

      {/* ── Advanced (collapsed) ── */}
      <button onClick={() => setShowAdv(v => !v)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", color: A.muted, fontSize: 12, padding: "4px 0", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Settings2 size={13} /> ตัวเลือกขั้นสูง (เพิ่มบล็อกเวลา / sync เฉพาะเจาะจง) {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {showAdv && (
        <div style={{ border: `1px dashed ${A.grayBorder}`, borderRadius: 10, padding: 12, marginTop: 8, background: A.gray }}>
          <p style={{ fontSize: 12, color: A.muted, margin: "0 0 10px" }}>
            เพิ่มบล็อกเวลา — กดวันด้านบนก่อน แล้วบล็อกเพิ่มเติมจะปรากฏในแผงตั้งค่าวัน
          </p>
          <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
            style={{ width: "100%", background: A.card, color: A.muted, border: `1px solid ${A.grayBorder}`, borderRadius: 8, padding: "8px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {syncMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <><RefreshCw size={13} /> Sync เฉพาะวันที่มีสล็อตเก่าอยู่แล้ว (ไม่บันทึก template)</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Schedule (Slots + Closed Days) ──────────────────────────────────────────
function ScheduleTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [selDate, setSelDate] = useState(toISO(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // ── Calendar state for closed-dates picker ──
  const [calYear, setCalYear]   = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth()); // 0-based

  // ── Daily template (เทมเพลตเฉพาะวัน — ยังเก็บไว้ใน "เพิ่มสล็อต" modal) ──
  const [showDailyTpl, setShowDailyTpl] = useState(false);
  const [dailyTplBlocks, setDailyTplBlocks] = useState<any[]>([
    { start_time: "09:00", rounds_count: 4, round_minutes: 60, gap_minutes: 0, max_bookings: 1 },
  ]);

  // Load settings for closed_dates — use useEffect to handle cached data correctly
  const { data: settingsData } = useQuery<any>({
    queryKey: ["nail-admin-settings", shopKey],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    }),
    staleTime: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (settingsData?.closed_dates !== undefined) {
      try { setClosedDates(JSON.parse(settingsData.closed_dates || "[]")); } catch { setClosedDates([]); }
    }
  }, [settingsData]);

  const { data: slots = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-slots", shopKey, selDate],
    queryFn: () =>
      fetch(`/api/nail/admin/slots?date=${selDate}`, { headers: authH(token) }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 20000,
    retry: 1,
  });

  // ใช้เช็คว่าสล็อตวันนี้ตรงกับเทมเพลตล่าสุดหรือไม่ (แจ้งเตือนถ้าไม่ตรง เพื่อลดความงงว่า "ทำไมเวลาไม่ตรง")
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-slot-templates", shopKey],
    queryFn: () =>
      fetch("/api/nail/admin/slot-templates", { headers: authH(token) }).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 30000,
    retry: 1,
  });

  const templateSyncStatus = (() => {
    if (isLoading || !templates.length) return null;
    const dow = (new Date(selDate + "T00:00:00").getDay() + 6) % 7; // 0=จันทร์
    const tmpl = templates.find((t: any) => t.day_of_week === dow);
    if (!tmpl || !tmpl.is_open) return null;
    const expected = new Set(computeSlotTimes(tmpl.start_time, tmpl.rounds_count, tmpl.round_minutes, tmpl.gap_minutes ?? 0));
    const actual = new Set(slots.map((s: any) => s.start_time));
    if (expected.size === 0) return null;
    const matches = expected.size === actual.size && [...expected].every(t => actual.has(t));
    return matches ? "match" : "mismatch";
  })();

  const saveClosedDates = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nail/admin/settings", { method: "PUT", headers: authH(token), body: JSON.stringify({ closed_dates: JSON.stringify(closedDates) }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000); qc.invalidateQueries({ queryKey: ["nail-admin-settings", shopKey] }); },
    onError: (e: any) => alert(`บันทึกวันปิดร้านไม่สำเร็จ: ${e.message}`),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nail/admin/slots", { method: "POST", headers: authH(token), body: JSON.stringify({ slot_date: selDate, start_time: startTime, end_time: endTime }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] }); setShowAdd(false); },
    onError: (e: any) => alert(`เพิ่ม slot ไม่สำเร็จ: ${e.message}`),
  });

  const dailyTplMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nail/admin/slots/apply-custom-daily", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ date: selDate, blocks: dailyTplBlocks }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] });
      setShowDailyTpl(false);
      alert(`✅ สร้างสล็อตแล้ว ${d.created} ช่วงเวลา${d.deleted > 0 ? ` (ลบเก่าที่ว่าง ${d.deleted})` : ""}`);
    },
    onError: (e: any) => alert(`เกิดข้อผิดพลาด: ${e.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_available }: { id: number; is_available: boolean }) => {
      const r = await fetch(`/api/nail/admin/slots/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ is_available }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    // Optimistic update — อัปเดต UI ทันทีโดยไม่รอ server
    onMutate: async ({ id, is_available }) => {
      await qc.cancelQueries({ queryKey: ["nail-admin-slots", shopKey, selDate] });
      const prev = qc.getQueryData<any[]>(["nail-admin-slots", shopKey, selDate]);
      qc.setQueryData(["nail-admin-slots", shopKey, selDate], (old: any[] = []) =>
        old.map(sl => sl.id === id ? { ...sl, is_available } : sl)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // rollback ถ้า server ตอบว่า error
      if (ctx?.prev) qc.setQueryData(["nail-admin-slots", shopKey, selDate], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey, selDate] }),
  });

  const [deleteSlotId, setDeleteSlotId] = useState<number | null>(null);
  const [slotDeleteError, setSlotDeleteError] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/nail/admin/slots/${id}`, { method: "DELETE", headers: authH(token) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] }); setDeleteSlotId(null); setSlotDeleteError(""); },
    onError: (e: any) => setSlotDeleteError(e.message || "ลบไม่สำเร็จ"),
  });

  // ── แก้เวลาเริ่ม/สิ้นสุดของสล็อตแบบเจาะจง (ไอคอนดินสอ) — แก้ได้แม้ลูกค้าจองแล้ว ──
  const [editSlot, setEditSlot] = useState<any | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editSlotError, setEditSlotError] = useState("");

  const editSlotMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/nail/admin/slots/${editSlot.id}`, {
        method: "PUT", headers: authH(token),
        body: JSON.stringify({ start_time: editStart, end_time: editEnd }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] }); setEditSlot(null); setEditSlotError(""); },
    onError: (e: any) => setEditSlotError(e.message || "บันทึกไม่สำเร็จ"),
  });

  // สร้างสล็อต 7 วันจากเทมเพลตจริง (ไม่ใช่ hardcode แล้ว)
  const batchMutation = useMutation({
    mutationFn: async (fromDate: string) => {
      const r = await fetch("/api/nail/admin/slot-templates/generate", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ days: 7, from_date: fromDate }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] });
      if (d.generated_count === 0) alert("ทุกวันในช่วงนี้มีสล็อตอยู่แล้ว ไม่มีการสร้างใหม่");
    },
    onError: (e: any) => alert(`เกิดข้อผิดพลาด: ${e.message}`),
  });

  // รีเซ็ตสล็อตวันที่เลือกให้ตรงกับเทมเพลต (ลบสล็อตว่าง แล้วสร้างใหม่จากเทมเพลต)
  const applyTemplateMutation = useMutation({
    mutationFn: async (date: string) => {
      const r = await fetch("/api/nail/admin/slots/apply-template-day", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ date }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] });
      const msg = d.has_booked_slots_preserved
        ? `รีเซ็ตแล้ว (สร้าง ${d.created} สล็อต — สล็อตที่มีการจองถูกเก็บไว้)`
        : `รีเซ็ตแล้ว (สร้าง ${d.created} สล็อต)`;
      alert(msg);
    },
    onError: (e: any) => alert(`เกิดข้อผิดพลาด: ${e.message}`),
  });

  const toggleClosedDate = (date: string) => {
    setClosedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  const isClosed = closedDates.includes(selDate);

  // ── Calendar helpers ──
  const todayISO = toISO(new Date());
  const calFirstDow = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calISO = (d: number) =>
    `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const prevCalMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextCalMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  return (
    <div style={{ padding: 16 }}>
      {/* ── Closed Days Section — calendar grid ── */}
      <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Ban size={15} color={A.error} /> วันปิดร้าน
        </h3>
        <p style={{ color: A.muted, fontSize: 12, margin: "0 0 14px" }}>กดวันที่ต้องการปิด — กดซ้ำเพื่อยกเลิก</p>

        {/* Month navigation */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={prevCalMonth} style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: A.primary, display: "flex", alignItems: "center" }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 14, color: A.text }}>
            {MONTH_TH_FULL[calMonth]} {calYear + 543}
          </span>
          <button onClick={nextCalMonth} style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer", color: A.primary, display: "flex", alignItems: "center" }}>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* DOW headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
          {DOW_HEADER_TH.map(h => (
            <div key={h} style={{ textAlign: "center", fontSize: 11, color: A.muted, fontWeight: 600, padding: "3px 0" }}>{h}</div>
          ))}
        </div>

        {/* Calendar cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 12 }}>
          {Array(calFirstDow).fill(null).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: calDaysInMonth }, (_, i) => i + 1).map(d => {
            const key   = calISO(d);
            const isCl  = closedDates.includes(key);
            const isPast = key < todayISO;
            const isToday = key === todayISO;
            return (
              <button key={key}
                onClick={() => { if (!isPast) toggleClosedDate(key); }}
                disabled={isPast}
                style={{
                  border: `1.5px solid ${isCl ? A.error : isToday ? A.primary : A.grayBorder}`,
                  borderRadius: 8, padding: "7px 2px", cursor: isPast ? "default" : "pointer",
                  background: isCl ? A.errorBg : isToday ? A.pale : A.card,
                  color: isCl ? A.error : isPast ? A.grayBorder : isToday ? A.primary : A.text,
                  fontWeight: isCl || isToday ? 700 : 400, fontSize: 13,
                  fontFamily: "inherit", textAlign: "center", opacity: isPast ? 0.4 : 1,
                  position: "relative",
                }}>
                {d}
                {isCl && <span style={{ position: "absolute", bottom: 1, left: "50%", transform: "translateX(-50%)", fontSize: 7, color: A.error, lineHeight: 1 }}>✕</span>}
              </button>
            );
          })}
        </div>

        {/* Summary */}
        {closedDates.length > 0 ? (
          <div style={{ background: A.errorBg, border: `1px solid ${A.error}33`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: A.error }}>
            <span style={{ fontWeight: 700 }}>ปิด {closedDates.length} วัน: </span>
            {closedDates.sort().map(d => fmtDate(d)).join(", ")}
          </div>
        ) : (
          <div style={{ background: A.successBg, border: `1px solid ${A.success}33`, borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: A.success, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle size={13} /> ไม่มีวันปิดร้านในเดือนนี้
          </div>
        )}

        <button onClick={() => saveClosedDates.mutate()}
          style={{ width: "100%", background: settingsSaved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saveClosedDates.isPending ? <Loader2 size={15} className="animate-spin" /> : settingsSaved ? <><CheckCircle size={15} /> บันทึกแล้ว</> : <><Save size={15} /> บันทึกวันปิดร้าน</>}
        </button>
      </div>

      {/* Weekly recurring slot template */}
      <WeeklyTemplateSection token={token} onGenerated={() => qc.invalidateQueries({ queryKey: ["nail-admin-slots", shopKey] })} />

      {/* Slots Section */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Clock size={16} color={A.primary} /> ช่วงเวลาจอง (แก้ไขเฉพาะวัน)
      </h3>
      <p style={{ color: A.sub, fontSize: 12, marginBottom: 10, marginTop: -6 }}>
        แก้ไข/เพิ่ม/ลบเฉพาะวันที่เลือกด้านล่าง — จะไม่ถูกเทมเพลตประจำสัปดาห์เขียนทับ
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, alignItems: "center" }}>
        <button
          onClick={() => { const d = new Date(selDate + "T00:00:00"); d.setDate(d.getDate() - 1); setSelDate(toISO(d)); }}
          style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "9px 11px", cursor: "pointer", color: A.primary, fontFamily: "inherit", flexShrink: 0, fontSize: 16, lineHeight: 1 }}
          title="วันก่อนหน้า">
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
          style={{ flex: 1, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", background: A.card }} />
        <button
          onClick={() => { const d = new Date(selDate + "T00:00:00"); d.setDate(d.getDate() + 1); setSelDate(toISO(d)); }}
          style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "9px 11px", cursor: "pointer", color: A.primary, fontFamily: "inherit", flexShrink: 0, fontSize: 16, lineHeight: 1 }}
          title="วันถัดไป">
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setShowAdd(true)}
          style={{ background: A.primary, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}>
          <Plus size={15} /> เพิ่มสล็อต
        </button>
      </div>

      {isClosed && (
        <div style={{ background: A.errorBg, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.error, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Ban size={14} /> วันนี้ตั้งเป็นวันปิดร้าน ลูกค้าจองไม่ได้
        </div>
      )}

      {!isClosed && templateSyncStatus === "mismatch" && (
        <div style={{ background: A.warningBg ?? "#FFF6E5", border: `1px solid ${A.warning}66`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.warning, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          สล็อตวันนี้ไม่ตรงกับเทมเพลตล่าสุด — กด "รีเซ็ตวันนี้" ด้านล่าง หรือบันทึกเทมเพลตใหม่เพื่ออัปเดตทีเดียวหลายวัน
        </div>
      )}
      {!isClosed && templateSyncStatus === "match" && (
        <div style={{ color: A.success, fontSize: 12, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle size={13} /> สล็อตวันนี้ตรงกับเทมเพลตล่าสุด
        </div>
      )}

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 32 }}><Loader2 size={24} color={A.primary} className="animate-spin" /></div>
      ) : slots.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24, background: A.card, borderRadius: 12, border: `1.5px dashed ${A.border}` }}>
          <Clock size={28} color={A.muted} style={{ margin: "0 auto 8px" }} />
          <p style={{ color: A.muted, fontSize: 14, marginBottom: 14 }}>ยังไม่มีสล็อตสำหรับวันนี้</p>
          {!isClosed && (
            <button
              onClick={() => applyTemplateMutation.mutate(selDate)}
              disabled={applyTemplateMutation.isPending}
              style={{ background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {applyTemplateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} สร้างสล็อตจากเทมเพลต
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {slots.map((sl: any) => (
            <div key={sl.id} style={{ background: sl.is_available ? A.card : A.gray, border: `1.5px solid ${sl.is_available ? A.border : A.grayBorder}`, borderRadius: 12, padding: 12, opacity: sl.is_available ? 1 : 0.65 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: sl.is_available ? A.text : A.muted }}>{sl.start_time}</div>
              <div style={{ fontSize: 12, color: A.muted }}>ถึง {sl.end_time}</div>
              <div style={{ fontSize: 12, color: sl.booked_count > 0 ? A.warning : A.success, marginTop: 4 }}>
                {sl.booked_count}/{sl.max_bookings} จอง
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => toggleMutation.mutate({ id: sl.id, is_available: !sl.is_available })}
                  disabled={toggleMutation.isPending && (toggleMutation.variables as any)?.id === sl.id}
                  style={{ flex: 1, background: sl.is_available ? A.errorBg : A.successBg, color: sl.is_available ? A.error : A.success, border: "none", borderRadius: 8, padding: "5px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", opacity: toggleMutation.isPending && (toggleMutation.variables as any)?.id === sl.id ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {toggleMutation.isPending && (toggleMutation.variables as any)?.id === sl.id
                    ? <Loader2 size={11} className="animate-spin" />
                    : sl.is_available ? "ปิด" : "เปิด"}
                </button>
                <button onClick={() => { setEditSlot(sl); setEditStart(sl.start_time); setEditEnd(sl.end_time); setEditSlotError(""); }}
                  title="แก้ไขเวลาเริ่ม/สิ้นสุด"
                  style={{ background: A.gray, border: "none", borderRadius: 8, padding: "5px 8px", cursor: "pointer" }}>
                  <Edit2 size={13} color={A.sub} />
                </button>
                <button onClick={() => { if (sl.booked_count === 0) setDeleteSlotId(sl.id); }} disabled={sl.booked_count > 0}
                  title={sl.booked_count > 0 ? "มีคนจองอยู่ ปิดใช้งานแทนได้" : "ลบ slot"}
                  style={{ background: A.gray, border: "none", borderRadius: 8, padding: "5px 8px", cursor: sl.booked_count > 0 ? "not-allowed" : "pointer", opacity: sl.booked_count > 0 ? 0.4 : 1 }}>
                  <Trash2 size={13} color={A.error} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* รีเซ็ตวันนี้ — แสดงเมื่อมีสล็อตอยู่แล้ว */}
      {slots.length > 0 && !isClosed && (
        <button onClick={() => {
          if (confirm(`รีเซ็ตสล็อตวันที่ ${selDate} ให้ตรงกับเทมเพลต?\n(สล็อตว่างจะถูกลบและสร้างใหม่ — สล็อตที่มีการจองจะเก็บไว้)`))
            applyTemplateMutation.mutate(selDate);
        }} disabled={applyTemplateMutation.isPending}
          style={{ width: "100%", marginTop: 10, background: "none", border: `1px solid ${A.grayBorder}`, borderRadius: 8, padding: "7px", cursor: "pointer", fontSize: 12, color: A.muted, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {applyTemplateMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} รีเซ็ตวันนี้ให้ตรงกับเทมเพลต
        </button>
      )}

      {/* Edit Slot Time Modal — แก้เวลาเฉพาะสล็อตนี้ ไม่ว่าจะมีคนจองแล้วหรือไม่ */}
      {editSlot && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: A.card, borderRadius: 18, padding: 24, width: "100%", maxWidth: 360 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
              <Edit2 size={16} /> แก้ไขเวลาสล็อต
            </h3>
            <p style={{ fontSize: 13, color: A.muted, marginBottom: 16 }}>
              เดิม {editSlot.start_time}–{editSlot.end_time}
              {editSlot.booked_count > 0 ? ` · มีลูกค้าจองอยู่ ${editSlot.booked_count} คน (แก้เวลาได้ตามปกติ)` : ""}
            </p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>เริ่ม</label>
                <TimeSelect value={editStart} onChange={setEditStart} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>สิ้นสุด</label>
                <TimeSelect value={editEnd} onChange={setEditEnd} />
              </div>
            </div>
            {editSlotError && <p style={{ color: A.error, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} /> {editSlotError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setEditSlot(null); setEditSlotError(""); }}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>ยกเลิก</button>
              <button onClick={() => editSlotMutation.mutate()} disabled={editSlotMutation.isPending || !editStart || !editEnd}
                style={{ flex: 1, background: A.primary, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: !editStart || !editEnd ? 0.6 : 1 }}>
                {editSlotMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Slot Confirm Dialog */}
      {deleteSlotId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: A.card, borderRadius: 18, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Trash2 size={36} color={A.error} /></div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 8 }}>ยืนยันลบ Slot?</h3>
            <p style={{ fontSize: 14, color: A.sub, marginBottom: 20 }}>ไม่สามารถกู้คืนได้หลังลบแล้ว</p>
            {slotDeleteError && <p style={{ color: A.error, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertTriangle size={13} /> {slotDeleteError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setDeleteSlotId(null); setSlotDeleteError(""); }}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>ยกเลิก</button>
              <button onClick={() => deleteMutation.mutate(deleteSlotId!)} disabled={deleteMutation.isPending}
                style={{ flex: 1, background: A.error, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "ลบ Slot"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Slot Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", zIndex: 9999 }}>
          <motion.div initial={{ y: 100 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>เพิ่ม Slot — {fmtDateLong(selDate)}</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              {[
                { label: "เวลาเริ่ม", val: startTime, set: setStartTime },
                { label: "เวลาสิ้นสุด", val: endTime, set: setEndTime },
              ].map(f => (
                <div key={f.label} style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: A.sub, display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input type="time" value={f.val} onChange={e => f.set(e.target.value)}
                    style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
              <button onClick={() => createMutation.mutate()}
                style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "เพิ่ม Slot"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Daily Template Modal — เพิ่มหลายสล็อตพร้อมกันด้วยการกำหนดบล็อกเวลา */}
      {showDailyTpl && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }}>
          <motion.div initial={{ y: 120 }} animate={{ y: 0 }} style={{ background: A.card, borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: A.text, display: "flex", alignItems: "center", gap: 8 }}><Calendar size={17} color={A.primary} /> เทมเพลตเฉพาะวัน</h3>
            <p style={{ fontSize: 12, color: A.sub, marginBottom: 14 }}>
              {fmtDateLong(selDate)} — กำหนดหลายบล็อกเวลาแล้วสร้างพร้อมกัน<br />
              <span style={{ color: A.warning, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}><AlertTriangle size={12} /> สล็อตที่ว่างของวันนี้จะถูกลบแล้วสร้างใหม่ตามที่กำหนด (สล็อตที่มีการจองอยู่แล้วจะถูกเก็บไว้)</span>
            </p>

            {dailyTplBlocks.map((blk: any, idx: number) => (
              <div key={idx} style={{ background: A.bg, border: `1.5px solid ${A.border}`, borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: A.text }}>บล็อก {idx + 1}</span>
                  {dailyTplBlocks.length > 1 && (
                    <button onClick={() => setDailyTplBlocks(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background: A.errorBg, color: A.error, border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                      ลบ
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>เวลาเริ่มต้น</label>
                    <input type="time" value={blk.start_time}
                      onChange={e => setDailyTplBlocks(prev => prev.map((b, i) => i === idx ? { ...b, start_time: e.target.value } : b))}
                      style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", background: A.card, fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>จำนวนรอบ</label>
                    <NumberField min={1} max={24} value={blk.rounds_count}
                      onChange={n => setDailyTplBlocks(prev => prev.map((b, i) => i === idx ? { ...b, rounds_count: n } : b))}
                      style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", background: A.card }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>ระยะเวลา/รอบ (นาที)</label>
                    <NumberField min={15} max={480} step={15} value={blk.round_minutes}
                      onChange={n => setDailyTplBlocks(prev => prev.map((b, i) => i === idx ? { ...b, round_minutes: n } : b))}
                      style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", background: A.card }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>ช่วงพักระหว่างรอบ (นาที)</label>
                    <NumberField min={0} max={120} step={5} value={blk.gap_minutes}
                      onChange={n => setDailyTplBlocks(prev => prev.map((b, i) => i === idx ? { ...b, gap_minutes: n } : b))}
                      style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", background: A.card }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>รับคิวต่อรอบ</label>
                    <NumberField min={1} max={20} value={blk.max_bookings}
                      onChange={n => setDailyTplBlocks(prev => prev.map((b, i) => i === idx ? { ...b, max_bookings: n } : b))}
                      style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", boxSizing: "border-box", background: A.card }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <div style={{ background: A.pale, borderRadius: 8, padding: "8px 10px", fontSize: 12, color: A.primary, fontWeight: 600, width: "100%", boxSizing: "border-box" }}>
                      {(() => {
                        try {
                          const [h, m] = blk.start_time.split(":").map(Number);
                          const endMin = h * 60 + m + blk.rounds_count * (blk.round_minutes + (blk.gap_minutes || 0)) - (blk.gap_minutes || 0);
                          return `${String(Math.floor(endMin / 60)).padStart(2,"0")}:${String(endMin % 60).padStart(2,"0")} (${blk.rounds_count} รอบ)`;
                        } catch { return "—"; }
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={() => setDailyTplBlocks(prev => [...prev, { start_time: "13:00", rounds_count: 3, round_minutes: 60, gap_minutes: 0, max_bookings: 1 }])}
              style={{ width: "100%", background: A.pale, color: A.primary, border: `1.5px dashed ${A.border}`, borderRadius: 10, padding: "10px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", marginBottom: 14 }}>
              + เพิ่มบล็อกเวลา
            </button>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowDailyTpl(false)}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>ยกเลิก</button>
              <button onClick={() => dailyTplMutation.mutate()} disabled={dailyTplMutation.isPending}
                style={{ flex: 2, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: dailyTplMutation.isPending ? 0.7 : 1 }}>
                {dailyTplMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <><Calendar size={15} /> สร้างสล็อต</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────
function GalleryTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [urlInput, setUrlInput] = useState("");
  const [caption, setCaption] = useState("");
  const [urlError, setUrlError] = useState("");
  const [deleteGalleryId, setDeleteGalleryId] = useState<number | null>(null);
  const [galleryDeleteError, setGalleryDeleteError] = useState("");

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-gallery", shopKey],
    queryFn: () => fetch("/api/nail/admin/gallery", { headers: authH(token) }).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (image_url: string) =>
      fetch("/api/nail/admin/gallery", { method: "POST", headers: authH(token), body: JSON.stringify({ image_url, caption }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-gallery", shopKey] }); setUrlInput(""); setCaption(""); setUrlError(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/nail/admin/gallery/${id}`, { method: "DELETE", headers: authH(token) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-gallery", shopKey] }); setDeleteGalleryId(null); setGalleryDeleteError(""); },
    onError: (e: any) => setGalleryDeleteError(e.message || "ลบไม่สำเร็จ"),
  });

  const isValidUrl = urlInput.trim().startsWith("http");

  const handleAdd = () => {
    if (!urlInput.trim()) { setUrlError("กรุณาใส่ลิงก์รูปภาพ"); return; }
    if (!isValidUrl) { setUrlError("ลิงก์ต้องขึ้นต้นด้วย https://"); return; }
    setUrlError("");
    addMutation.mutate(urlInput.trim());
  };

  return (
    <div style={{ padding: 16 }}>
      {/* URL input card */}
      <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: A.text, marginBottom: 4 }}>เพิ่มรูปผลงาน</div>
        <p style={{ fontSize: 12, color: A.muted, marginBottom: 10, lineHeight: 1.7 }}>
          อัปโหลดรูปที่{" "}
          <a href="https://imgbb.com" target="_blank" rel="noreferrer" style={{ color: A.primary, fontWeight: 600 }}>imgbb.com</a>
          {" "}หรือ{" "}
          <a href="https://postimages.org" target="_blank" rel="noreferrer" style={{ color: A.primary, fontWeight: 600 }}>postimages.org</a>
          {" "}แล้ววาง <strong>Direct Link</strong> ด้านล่าง (ไม่ใช่ลิงก์หน้าเว็บ)
        </p>
        <input
          value={urlInput}
          onChange={e => { setUrlInput(e.target.value); setUrlError(""); }}
          placeholder="https://i.ibb.co/xxxx/photo.jpg"
          style={{ width: "100%", border: `1.5px solid ${urlError ? A.error : A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }}
        />
        {urlError && <p style={{ color: A.error, fontSize: 12, marginTop: 4 }}>{urlError}</p>}
        {isValidUrl && (
          <div style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", border: `1px solid ${A.border}`, maxHeight: 180, background: A.gray }}>
            <img src={urlInput} alt="preview" style={{ width: "100%", maxHeight: 180, objectFit: "contain", display: "block" }}
              onError={() => setUrlError("โหลดภาพไม่ได้ — ลองใช้ Direct Link (ลงท้ายด้วย .jpg/.png)")} />
          </div>
        )}
        <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="คำบรรยาย (ไม่บังคับ)"
          style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginTop: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
        <button onClick={handleAdd} disabled={!urlInput.trim() || addMutation.isPending}
          style={{ width: "100%", marginTop: 10, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: !urlInput.trim() || addMutation.isPending ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, opacity: !urlInput.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={16} /> เพิ่มรูปในแกลเลอรี</>}
        </button>
      </div>

      {/* Gallery grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {items.map((g: any) => (
          <div key={g.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: A.gray, aspectRatio: "1" }}>
            <img src={g.image_url} alt={g.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={() => setDeleteGalleryId(g.id)}
              style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 26, height: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={13} color="#fff" />
            </button>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <div style={{ textAlign: "center", padding: 32, color: A.muted, fontSize: 14 }}>
          <Image size={32} style={{ margin: "0 auto 8px" }} /><p>ยังไม่มีผลงาน</p>
        </div>
      )}

      {/* Delete Gallery Confirm Dialog */}
      {deleteGalleryId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: A.card, borderRadius: 18, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Trash2 size={36} color={A.error} /></div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 8 }}>ลบรูปผลงานนี้?</h3>
            <p style={{ fontSize: 14, color: A.sub, marginBottom: 20 }}>รูปจะหายไปจากแกลเลอรีทันที</p>
            {galleryDeleteError && <p style={{ color: A.error, fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><AlertTriangle size={13} /> {galleryDeleteError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setDeleteGalleryId(null); setGalleryDeleteError(""); }}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>ยกเลิก</button>
              <button onClick={() => deleteMutation.mutate(deleteGalleryId!)} disabled={deleteMutation.isPending}
                style={{ flex: 1, background: A.error, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", opacity: deleteMutation.isPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "ลบรูป"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab({ token }: { token: string }) {
  const shopKey = useShopSlug() ?? "default";

  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  // IMPORTANT: use useEffect to handle cached data — the queryFn may not re-run
  // when data is already in cache from ScheduleTab (same queryKey)
  const { data: settingsData, isLoading: settingsLoading, isError: settingsError } = useQuery<any>({
    queryKey: ["nail-admin-settings", shopKey],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  // Sync form from server data + inject brand theme into CSS custom properties
  useEffect(() => {
    if (settingsData) {
      setForm({ ...settingsData, closed_dates: undefined });
      injectThemeCss(getTheme(settingsData.brand_color));
    }
  }, [settingsData]);

  const [saveError, setSaveError] = useState("");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/nail/admin/settings", { method: "PUT", headers: authH(token), body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { setSaved(true); setSaveError(""); setTimeout(() => setSaved(false), 2500); qc.invalidateQueries({ queryKey: ["nail-admin-settings", shopKey] }); },
    onError: (e: any) => setSaveError(e.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"),
  });

  if (settingsLoading && !settingsData) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} color={A.primary} className="animate-spin" /></div>;
  if (settingsError && !form) return <div style={{ textAlign: "center", padding: 40, color: A.error, fontSize: 14 }}>โหลดการตั้งค่าไม่สำเร็จ กรุณา <button onClick={() => qc.invalidateQueries({ queryKey: ["nail-admin-settings", shopKey] })} style={{ background: "none", border: "none", cursor: "pointer", color: A.primary, textDecoration: "underline", fontFamily: "inherit" }}>ลองใหม่</button></div>;
  if (!form) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} color={A.primary} className="animate-spin" /></div>;

  const F = (key: string, label: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>{label}</label>
      <input type={type} value={form[key] ?? ""} placeholder={ph}
        onChange={e => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
        style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
    </div>
  );

  const Section = ({ title }: { title: string }) => (
    <h3 style={{ fontWeight: 700, color: A.text, margin: "22px 0 14px", fontSize: 15, borderLeft: `3px solid ${A.primary}`, paddingLeft: 10 }}>{title}</h3>
  );

  return (
    <div style={{ padding: 16, fontFamily: "inherit" }}>
      <Section title="ข้อมูลร้าน" />
      {F("shop_name", "ชื่อร้าน", "text", "ร้านทำเล็บของคุณ")}
      {F("shop_tagline", "สโลแกน / คำอธิบาย", "text", "ทำเล็บสวย สไตล์คุณ")}
      {F("shop_logo_url", "URL โลโก้ร้าน")}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>
          อีโมจิส่วนหัวบริการ — แสดงในหน้าจองคิว
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="text"
            value={form?.service_section_emoji ?? "💅"}
            onChange={e => setForm((p: any) => ({ ...p, service_section_emoji: e.target.value }))}
            placeholder="💅"
            maxLength={8}
            style={{ width: 80, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 22, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, textAlign: "center" }}
          />
          <span style={{ fontSize: 13, color: A.muted }}>พิมพ์หรือวางอีโมจิที่ต้องการ เช่น 💅 ✨ 🌸 💖</span>
        </div>
      </div>

      <div style={{ marginBottom: 14, background: A.pale, border: `1px solid ${A.border}`, borderRadius: 12, padding: 14 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: (form?.show_why_choose_section ?? true) ? 10 : 0 }}>
          <input
            type="checkbox"
            checked={form?.show_why_choose_section ?? true}
            onChange={e => setForm((p: any) => ({ ...p, show_why_choose_section: e.target.checked }))}
            style={{ width: 18, height: 18, cursor: "pointer" }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: A.text }}>แสดงส่วน "ทำไมต้องเลือกร้านเรา" ในหน้าจองคิว</span>
        </label>
        {(form?.show_why_choose_section ?? true) && (
          <>
            <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>
              ชื่อหัวข้อ (ปล่อยว่าง = ใช้ค่าเริ่มต้น "✨ ทำไมต้องเลือก ร้านของคุณ?")
            </label>
            <input
              type="text"
              value={form?.why_choose_heading ?? ""}
              onChange={e => setForm((p: any) => ({ ...p, why_choose_heading: e.target.value || null }))}
              placeholder={`✨ ทำไมต้องเลือก ${form?.shop_name || "ร้านของเรา"}?`}
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, marginBottom: 10 }}
            />
            <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>
              ข้อความที่จะแสดง (ปล่อยว่างไว้ = ใช้ข้อความมาตรฐาน)
            </label>
            <textarea
              value={form?.why_choose_custom_text ?? ""}
              onChange={e => setForm((p: any) => ({ ...p, why_choose_custom_text: e.target.value }))}
              placeholder={"เขียนกฎ/จุดเด่นของร้านเองได้เลย เช่น\nงดคืนมัดจำหากยกเลิกก่อนถึงคิวไม่ถึง 24 ชม.\nกรุณามาก่อนเวลา 10 นาที"}
              rows={4}
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, resize: "vertical" }}
            />
          </>
        )}
      </div>

      <Section title="ข้อมูลสำหรับลูกค้าที่จอง" />
      <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.primary }}>
        💡 ข้อมูลนี้จะแสดงใน popup หลังลูกค้าจ่ายมัดจำสำเร็จ และในหน้าตรวจสอบสถานะการจอง
      </div>
      {F("location_url", "ลิงก์ Google Maps / ที่อยู่ร้าน", "url", "https://maps.app.goo.gl/...")}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>
          ข้อความต้อนรับ / แจ้งลูกค้า <span style={{ color: A.muted, fontWeight: 400 }}>(ปล่อยว่าง = ไม่แสดง)</span>
        </label>
        <textarea
          value={form?.booking_note ?? ""}
          onChange={e => setForm((p: any) => ({ ...p, booking_note: e.target.value || null }))}
          placeholder={"เช่น มาถึงแจ้งที่เคาน์เตอร์ชั้น 1 ได้เลยนะคะ\nจอดรถได้ที่ลานจอดรถหน้าห้าง ฟรี 2 ชั่วโมง"}
          rows={3}
          style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, resize: "vertical" }}
        />
      </div>

      <Section title="โซเชียลมีเดีย" />
      <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.primary }}>
        💡 ลิงก์ที่กรอกจะแสดงปุ่มให้ลูกค้ากดดูผลงานในหน้าร้าน
      </div>
      {F("ig_url", "Instagram URL", "url", "https://instagram.com/...")}
      {F("fb_url", "Facebook URL", "url", "https://facebook.com/...")}
      {F("line_oa_url", "Line Official Account URL", "url", "https://line.me/...")}
      {F("tiktok_url", "TikTok URL", "url", "https://tiktok.com/...")}
      {F("map_url", "ลิงก์แผนที่ร้าน (Google Maps)", "url", "https://maps.app.goo.gl/...")}

      <Section title="นโยบายการจอง" />
      <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.primary }}>
        💡 ข้อความนี้จะแสดงในใบเสร็จที่ลูกค้าได้รับหลังจองคิว — เช่น กฎการยกเลิก, เลทได้ไม่เกิน X นาที
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>นโยบาย / กฎการจอง</label>
        <textarea value={form?.booking_policy ?? ""} rows={5} placeholder={"📍 เลทได้ไม่เกิน 10 นาที\nตามเวลานัดหมาย\nไม่มีการเลื่อนคิว"}
          onChange={e => setForm((p: any) => ({ ...p, booking_policy: e.target.value }))}
          style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg, resize: "vertical" }} />
      </div>

      <Section title="การชำระมัดจำ" />
      {F("deposit_amount", "ค่ามัดจำ (฿)", "number", "200")}
      {F("bank_name", "ชื่อธนาคาร", "text", "ธนาคารกสิกรไทย")}
      {F("bank_account_number", "เลขบัญชี")}
      {F("bank_account_name", "ชื่อบัญชี")}
      {F("bank_qr_url", "URL รูป QR Code พร้อมเพย์")}

      <Section title="ช่องทางรับเงินเติมเครดิต" />
      <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.primary }}>
        💡 ตั้งค่าช่องทางที่ลูกค้าใช้เติมเครดิตเพื่อจ่ายค่ามัดจำ
      </div>
      {F("truemoney_phone", "เบอร์ TrueMoney รับซองอั่งเปา", "text", "0812345678")}
      {/* accept_bank_transfer toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: A.bg, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>รับโอนธนาคาร (สลิป)</div>
          <div style={{ fontSize: 12, color: A.muted }}>ลูกค้าเติมเครดิตโดยโอนเงินแล้วส่งสลิป</div>
        </div>
        <button
          onClick={() => setForm((p: any) => ({ ...p, accept_bank_transfer: !(p.accept_bank_transfer ?? true) }))}
          style={{ width: 44, height: 24, borderRadius: 100, border: "none", cursor: "pointer", background: (form?.accept_bank_transfer ?? true) ? A.primary : A.gray, position: "relative", transition: "background 0.2s", flexShrink: 0 }}
        >
          <div style={{ position: "absolute", top: 3, left: (form?.accept_bank_transfer ?? true) ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>
      {/* accept_truemoney_angpao toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: A.bg, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: A.text }}>รับซองอั่งเปา TrueMoney</div>
          <div style={{ fontSize: 12, color: A.muted }}>ลูกค้าเติมเครดิตด้วยซองของขวัญ (ต้องตั้งเบอร์ด้านบน)</div>
        </div>
        <button
          onClick={() => setForm((p: any) => ({ ...p, accept_truemoney_angpao: !(p.accept_truemoney_angpao ?? true) }))}
          style={{ width: 44, height: 24, borderRadius: 100, border: "none", cursor: "pointer", background: (form?.accept_truemoney_angpao ?? true) ? A.primary : A.gray, position: "relative", transition: "background 0.2s", flexShrink: 0 }}
        >
          <div style={{ position: "absolute", top: 3, left: (form?.accept_truemoney_angpao ?? true) ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      {/* ⚠️ Warning: TrueMoney enabled but phone not set */}
      {(form?.accept_truemoney_angpao ?? true) && !(form?.truemoney_phone || "").trim() && (
        <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#B45309", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>เปิดรับซองอั่งเปาไว้แต่ยังไม่ได้กรอก <b>เบอร์ TrueMoney</b> ด้านบน — ระบบจะแลกซองให้ลูกค้าไม่สำเร็จจนกว่าจะกรอกเบอร์</span>
        </div>
      )}

      <Section title="ธีมสีร้าน (หน้าลูกค้า)" />
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 13, color: A.sub, fontWeight: 500, display: "block", marginBottom: 8 }}>
          เลือกสีประจำร้าน — ปุ่ม, ส่วนหัว และสีหลักในหน้าจองจะเปลี่ยนตาม
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
          {BRAND_THEMES.map(t => {
            const selected = (form?.brand_color || "#B5174B").toLowerCase() === t.primary.toLowerCase();
            return (
              <button key={t.primary}
                onClick={() => { setForm((p: any) => ({ ...p, brand_color: t.primary })); injectThemeCss(t); }}
                title={t.name}
                style={{ width: 38, height: 38, borderRadius: "50%", background: t.primary, border: selected ? `3px solid #1A1A2E` : "3px solid transparent", cursor: "pointer", outline: selected ? `2px solid ${t.primary}` : "none", outlineOffset: 2, flexShrink: 0, boxShadow: selected ? "0 2px 8px rgba(0,0,0,0.25)" : "0 1px 3px rgba(0,0,0,0.15)" }} />
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: A.primary, background: A.pale, border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 10px" }}>
          🎨 สีที่เลือก: <b>{BRAND_THEMES.find(t => t.primary.toLowerCase() === (form?.brand_color || "#B5174B").toLowerCase())?.name || "ชมพู (ค่าเริ่มต้น)"}</b>
        </div>
      </div>

      <Section title="ระบบจอง" />
      {F("max_advance_days", "จองล่วงหน้าได้สูงสุด (วัน)", "number", "14")}
      {F("slot_duration_minutes", "ระยะเวลา slot เริ่มต้น (นาที) — ใช้เมื่อเพิ่ม slot เองรายวัน", "number", "60")}

      {saveError && (
        <div style={{ background: A.errorBg, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.error, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span> {saveError}
        </div>
      )}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ width: "100%", marginTop: 8, background: saved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
        {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : saved ? <><CheckCircle size={18} /> บันทึกแล้ว!</> : <><Save size={18} /> บันทึกการตั้งค่า</>}
      </button>
    </div>
  );
}
