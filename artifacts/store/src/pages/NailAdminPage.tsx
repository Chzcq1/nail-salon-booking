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
  Wallet, CreditCard,
} from "lucide-react";

// ── Rose Gold Admin Theme (แตกต่างจาก Candy Pink หน้าร้าน) ──────────────
const A = {
  primary:   "#B5174B",
  light:     "#D81B60",
  pale:      "#FCE4EC",
  border:    "#F8BBD9",
  deep:      "#880E4F",
  bg:        "#FFF5F8",
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

type Tab = "dashboard" | "bookings" | "services" | "schedule" | "gallery" | "settings" | "staff" | "renewal" | "accounts";

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
  const [tab, setTab] = useState<Tab>("dashboard");
  const [token, setToken] = useState(() => localStorage.getItem("nail_admin_token") || "");
  const [newBookingAlert, setNewBookingAlert] = useState(false);
  const knownBookingIds = useRef<Set<number>>(new Set());
  const isFirstPoll = useRef(true);
  const lastPollDate = useRef("");

  // ── Background booking poller (runs when admin is logged in) ──────────────
  useEffect(() => {
    if (!token) return;
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
  }, [token]); // eslint-disable-line

  // login steps: "passcode" → "otp"
  const [loginStep, setLoginStep] = useState<"passcode" | "otp">("passcode");
  const [passcodeInput, setPasscodeInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 1 — ตรวจรหัสผ่าน ขอ OTP
  const handlePasscode = async () => {
    if (!passcodeInput.trim()) return;
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/nail/admin/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: passcodeInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setLoginStep("otp");
      } else {
        setAuthError(data?.detail || "รหัสผ่านไม่ถูกต้อง");
      }
    } catch {
      setAuthError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — ยืนยัน OTP รับ JWT
  const handleOTP = async () => {
    if (!otpInput.trim()) return;
    setLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/nail/admin/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp_code: otpInput }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        localStorage.setItem("nail_admin_token", data.access_token);
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
          ) : (
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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "ภาพรวม",    icon: <LayoutDashboard size={17} /> },
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
        <button onClick={() => { localStorage.removeItem("nail_admin_token"); setToken(""); }}
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
              transition: "color 0.2s",
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 0 80px" }}>
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {tab === "dashboard" && <DashboardTab token={token} onGoBookings={() => setTab("bookings")} />}
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
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["nail-admin-dashboard"],
    queryFn: () => aFetch("/api/nail/admin/dashboard", token),
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
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
          {/* Stat Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {[
              { label: "รออนุมัติวันนี้", value: data?.today?.pending ?? 0, icon: <AlertCircle size={20} />, color: A.info, bg: A.infoBg },
              { label: "ยืนยันแล้ววันนี้", value: data?.today?.confirmed ?? 0, icon: <CheckCircle size={20} />, color: A.success, bg: A.successBg },
              { label: "Walk-in วันนี้", value: data?.today?.walkin ?? 0, icon: <Users size={20} />, color: A.warning, bg: A.warningBg },
              { label: "รวมทั้งหมด (ทุกเวลา)", value: data?.total_bookings ?? 0, icon: <TrendingUp size={20} />, color: A.primary, bg: A.pale },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}33`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ color: c.color }}>{c.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 12, color: A.sub }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Revenue Card */}
          <div style={{ background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, borderRadius: 16, padding: "18px 20px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, margin: "0 0 4px" }}>มัดจำที่ได้รับสัปดาห์นี้</p>
              <div style={{ color: "#fff", fontSize: 28, fontWeight: 800 }}>฿{(data?.week_revenue ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, color: "#fff", fontSize: 14 }}>
              <Banknote size={20} />
            </div>
          </div>

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

// ─── Bookings ─────────────────────────────────────────────────────────────────
function BookingsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(toISO(new Date()));
  const [filterStatus, setFilterStatus] = useState("all");
  const [showWalkin, setShowWalkin] = useState(false);
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wTime, setWTime] = useState("09:00");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmRefundId, setConfirmRefundId] = useState<number | null>(null);
  const [changeServiceFor, setChangeServiceFor] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deletePasscode, setDeletePasscode] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const url = `/api/nail/admin/bookings?date=${filterDate}` + (filterStatus !== "all" ? `&status=${filterStatus}` : "");
  const { data: bookings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-bookings", filterDate, filterStatus],
    queryFn: () => fetch(url, { headers: authH(token) }).then(r => r.json()),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: 1,
  });

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services"],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/nail/admin/bookings/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }),
  });

  const [changeServiceResult, setChangeServiceResult] = useState<string | null>(null);
  const changeServiceMutation = useMutation({
    mutationFn: ({ id, service_id }: { id: number; service_id: number }) =>
      fetch(`/api/nail/admin/bookings/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ service_id }) }).then(r => r.json()),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }); qc.invalidateQueries({ queryKey: ["nail-admin-dashboard"] }); setConfirmRefundId(null); },
  });

  const walkinMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/bookings/walkin", { method: "POST", headers: authH(token), body: JSON.stringify({ customer_name: wName, customer_phone: wPhone, slot_date: filterDate, start_time: wTime }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }); setShowWalkin(false); setWName(""); setWPhone(""); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/nail/admin/bookings/${id}/delete`, {
        method: "POST", headers: authH(token), body: JSON.stringify({ passcode: deletePasscode }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.detail || `HTTP ${r.status}`);
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] });
      qc.invalidateQueries({ queryKey: ["nail-admin-dashboard"] });
      setDeleteTarget(null); setDeletePasscode(""); setDeleteError("");
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const pendingCount = bookings.filter(b => b.status === "pending_payment").length;

  return (
    <div style={{ padding: 16 }}>
      {pendingCount > 0 && (
        <div style={{ background: A.infoBg, border: `1px solid ${A.info}44`, borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, color: A.info, fontSize: 13, fontWeight: 600 }}>
          <AlertCircle size={16} /> มี {pendingCount} รายการรอตรวจสลิป
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
        <span style={{ color: A.sub, fontSize: 13 }}>{bookings.length} รายการ — {fmtDate(filterDate)}</span>
        <button onClick={() => setShowWalkin(true)}
          style={{ background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 100, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          <Plus size={14} /> Walk-in
        </button>
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
                <span>🕐 {b.start_time}{b.end_time ? ` – ${b.end_time}` : ""}</span>
                {b.service_name && <span>💅 {b.service_name}</span>}
                <span>📱 {b.customer_phone}</span>
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
                <div style={{ fontSize: 12, color: A.sub, marginTop: 4, background: A.gray, borderRadius: 8, padding: "6px 10px" }}>
                  📝 {b.customer_note}
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
                    <button onClick={() => { setDeleteTarget({ id: b.id, name: b.customer_name }); setDeletePasscode(""); setDeleteError(""); }}
                      title="ลบรายการนี้ออกจากระบบถาวร"
                      style={{ background: A.gray, color: A.error, border: `1px solid ${A.error}33`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                      <Trash2 size={14} /> ลบถาวร
                    </button>
                  </div>

                  {/* Slip Image */}
                  {b.payment_proof && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ fontSize: 12, color: A.sub, marginBottom: 6 }}>หลักฐานการชำระ:</p>
                      <a href={b.payment_proof} target="_blank" rel="noopener noreferrer">
                        <img src={b.payment_proof} alt="slip" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 10, border: `1px solid ${A.border}`, objectFit: "contain" }} />
                      </a>
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
            <input type="time" value={wTime} onChange={e => setWTime(e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 16, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
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
              <div style={{ width: 54, height: 54, borderRadius: "50%", background: A.errorBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 26 }}>🗑️</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 6, textAlign: "center" }}>ลบรายการถาวร?</h3>
              <p style={{ color: A.sub, fontSize: 13, marginBottom: 14, lineHeight: 1.5, textAlign: "center" }}>
                จะลบการจองของ <strong>{deleteTarget.name}</strong> ออกจากระบบถาวร (ไม่ใช่แค่ยกเลิก) และคืนเครดิตกระเป๋าเงินให้ลูกค้าถ้าจ่ายด้วยเครดิต
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
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [dur, setDur] = useState("60");
  const [deposit, setDeposit] = useState("");

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services"],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const openAdd = () => { setEditId(null); setName(""); setDesc(""); setPrice("0"); setDur("60"); setDeposit(""); setShow(true); };
  const openEdit = (s: any) => { setEditId(s.id); setName(s.name); setDesc(s.description || ""); setPrice(String(s.price)); setDur(String(s.duration_minutes)); setDeposit(s.deposit_amount != null ? String(s.deposit_amount) : ""); setShow(true); };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        name, description: desc, price: parseFloat(price), duration_minutes: parseInt(dur),
        deposit_amount: deposit.trim() === "" ? null : parseFloat(deposit),
      });
      if (editId) {
        return fetch(`/api/nail/admin/services/${editId}`, { method: "PUT", headers: authH(token), body }).then(r => r.json());
      }
      return fetch("/api/nail/admin/services", { method: "POST", headers: authH(token), body }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services"] }); setShow(false); },
  });

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/services/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services"] }); setConfirmDelete(null); },
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
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>💅</div>
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
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#FF6B9D");

  const { data: staff = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-staff"],
    queryFn: () => fetch("/api/nail/admin/staff", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  const openAdd = () => { setName(""); setColor("#FF6B9D"); setShow(true); };

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/staff", { method: "POST", headers: authH(token), body: JSON.stringify({ name, color }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-staff"] }); setShow(false); },
  });

  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/staff/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-staff"] }); setConfirmDelete(null); },
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

function AccountsTab({ token }: { token: string }) {
  const [view, setView] = useState<AccountsView>("topups");
  return (
    <div style={{ padding: 16 }}>
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
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [approveAmounts, setApproveAmounts] = useState<Record<number, string>>({});

  const { data: topups = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-topups", statusFilter],
    queryFn: () => fetch(`/api/nail/admin/topup-requests?status=${statusFilter}`, { headers: authH(token) }).then(r => r.json()),
    staleTime: 15000,
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) =>
      fetch(`/api/nail/admin/topup-requests/${id}/approve`, { method: "POST", headers: { ...authH(token), "Content-Type": "application/json" }, body: JSON.stringify({ amount }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-topups"] }); },
  });
  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/topup-requests/${id}/reject`, { method: "POST", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-topups"] }); },
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
                {(t.voucher_code || t.payment_proof?.startsWith("voucher:")) && (
                  <div style={{ background: A.infoBg, border: `1px solid ${A.info}33`, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: A.info, marginBottom: 10 }}>
                    🧧 Voucher: {t.voucher_code || t.payment_proof?.replace("voucher:", "")}
                  </div>
                )}
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
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-customers"],
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
      qc.invalidateQueries({ queryKey: ["nail-admin-customers"] });
      qc.invalidateQueries({ queryKey: ["nail-admin-transactions"] });
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
  const { data: txns = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-transactions"],
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
  const qc = useQueryClient();
  const [months, setMonths] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: status, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["nail-admin-rental-status"],
    queryFn: () => fetch("/api/nail/admin/rental-status", { headers: authH(token) }).then(r => r.json()),
    staleTime: 30000,
    retry: 1,
  });

  // ราคาจริงของร้านนี้ (super-admin อาจตั้งราคาพิเศษไว้) — fallback เป็นราคากลางถ้ายังโหลดไม่เสร็จ
  const { data: plans = RENEWAL_PLANS } = useQuery<any[]>({
    queryKey: ["nail-admin-renewal-plans"],
    queryFn: () => fetch("/api/nail/admin/renewal-plans", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
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
      qc.invalidateQueries({ queryKey: ["nail-admin-rental-status"] });
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

// ─── Weekly recurring slot template ──────────────────────────────────────────
const DAY_NAMES_TH = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];

function WeeklyTemplateSection({ token, onGenerated }: { token: string; onGenerated: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<any[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-slot-templates"],
    queryFn: () => fetch("/api/nail/admin/slot-templates", { headers: authH(token) }).then(r => r.json()),
    staleTime: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (data && !rows) setRows(data.map((d: any) => ({ ...d })));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/slot-templates", {
        method: "PUT",
        headers: authH(token),
        body: JSON.stringify({ templates: rows }),
      }).then(r => r.json()),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      qc.invalidateQueries({ queryKey: ["nail-admin-slot-templates"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/slot-templates/generate", {
        method: "POST",
        headers: authH(token),
        body: JSON.stringify({ days: 30 }),
      }).then(r => r.json()),
    onSuccess: (d: any) => {
      setGenResult(`สร้างสล็อตให้แล้ว ${d.generated_count} วัน (จาก 30 วันข้างหน้า)`);
      onGenerated();
      setTimeout(() => setGenResult(null), 4000);
    },
  });

  const updateRow = (day_of_week: number, patch: object) => {
    setRows(prev => prev!.map(r => r.day_of_week === day_of_week ? { ...r, ...patch } : r));
  };

  if (isLoading || !rows) {
    return (
      <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16, textAlign: "center" }}>
        <Loader2 size={20} color={A.primary} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <button onClick={() => setExpanded(e => !e)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "inherit" }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          <Calendar size={16} color={A.primary} /> เทมเพลตสล็อตประจำสัปดาห์
        </h3>
        {expanded ? <ChevronUp size={18} color={A.muted} /> : <ChevronDown size={18} color={A.muted} />}
      </button>
      <p style={{ color: A.sub, fontSize: 12, marginTop: 8, marginBottom: expanded ? 12 : 0 }}>
        ตั้งค่าครั้งเดียว ระบบจะสร้างสล็อตให้อัตโนมัติทุกสัปดาห์ตามวัน — ถ้าวันไหนแก้เองแล้วจะไม่ถูกเขียนทับ
      </p>

      {expanded && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {rows.map(r => (
              <div key={r.day_of_week} style={{ border: `1.5px solid ${r.is_open ? A.border : A.grayBorder}`, borderRadius: 12, padding: 12, background: r.is_open ? A.pale : A.gray }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: r.is_open ? 10 : 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: A.text }}>วัน{DAY_NAMES_TH[r.day_of_week]}</span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: A.sub }}>
                    <input type="checkbox" checked={r.is_open} onChange={e => updateRow(r.day_of_week, { is_open: e.target.checked })} />
                    เปิดร้าน
                  </label>
                </div>
                {r.is_open && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>เริ่ม</label>
                      <input type="time" value={r.start_time} onChange={e => updateRow(r.day_of_week, { start_time: e.target.value })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.bg }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>กี่รอบ</label>
                      <input type="number" min={0} value={r.rounds_count} onChange={e => updateRow(r.day_of_week, { rounds_count: Number(e.target.value) })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.bg }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>นาที/รอบ</label>
                      <input type="number" min={1} value={r.round_minutes} onChange={e => updateRow(r.day_of_week, { round_minutes: Number(e.target.value) })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.bg }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: A.muted, display: "block", marginBottom: 3 }}>รับ/รอบ</label>
                      <input type="number" min={1} value={r.max_bookings} onChange={e => updateRow(r.day_of_week, { max_bookings: Number(e.target.value) })}
                        style={{ width: "100%", border: `1px solid ${A.border}`, borderRadius: 8, padding: "6px 8px", fontFamily: "inherit", fontSize: 12, boxSizing: "border-box", background: A.bg }} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
            style={{ width: "100%", background: saved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 8 }}>
            {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : saved ? <><CheckCircle size={15} /> บันทึกแล้ว</> : <><Save size={15} /> บันทึกเทมเพลต</>}
          </button>

          <button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}
            style={{ width: "100%", background: A.pale, color: A.primary, border: `1px solid ${A.border}`, borderRadius: 10, padding: "9px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
            {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" style={{ display: "inline" }} /> : "สร้างสล็อตล่วงหน้า 30 วันตามเทมเพลตทันที"}
          </button>
          {genResult && <p style={{ textAlign: "center", color: A.success, fontSize: 12, marginTop: 8 }}>{genResult}</p>}
        </>
      )}
    </div>
  );
}

// ─── Schedule (Slots + Closed Days) ──────────────────────────────────────────
function ScheduleTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [selDate, setSelDate] = useState(toISO(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:30");
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Load settings for closed_dates — use useEffect to handle cached data correctly
  const { data: settingsData } = useQuery<any>({
    queryKey: ["nail-admin-settings"],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  useEffect(() => {
    if (settingsData?.closed_dates !== undefined) {
      try { setClosedDates(JSON.parse(settingsData.closed_dates || "[]")); } catch { setClosedDates([]); }
    }
  }, [settingsData]);

  const { data: slots = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-slots", selDate],
    queryFn: () => fetch(`/api/nail/admin/slots?date=${selDate}`, { headers: authH(token) }).then(r => r.json()),
    staleTime: 20000,
    retry: 1,
  });

  const saveClosedDates = useMutation({
    mutationFn: () => fetch("/api/nail/admin/settings", { method: "PUT", headers: authH(token), body: JSON.stringify({ closed_dates: JSON.stringify(closedDates) }) }).then(r => r.json()),
    onSuccess: () => { setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000); qc.invalidateQueries({ queryKey: ["nail-admin-settings"] }); },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/slots", { method: "POST", headers: authH(token), body: JSON.stringify({ slot_date: selDate, start_time: startTime, end_time: endTime }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }); setShowAdd(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_available }: { id: number; is_available: boolean }) =>
      fetch(`/api/nail/admin/slots/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ is_available }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }); setDeleteSlotId(null); setSlotDeleteError(""); },
    onError: (e: any) => setSlotDeleteError(e.message || "ลบไม่สำเร็จ"),
  });

  const batchMutation = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/nail/admin/slots/batch", { method: "POST", headers: authH(token), body: JSON.stringify(body) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
  });

  const defaultTimes = [
    { start: "09:00", end: "10:30" }, { start: "10:30", end: "12:00" },
    { start: "13:00", end: "14:30" }, { start: "14:30", end: "16:00" },
    { start: "16:00", end: "17:30" }, { start: "17:30", end: "19:00" },
  ];

  const toggleClosedDate = (date: string) => {
    setClosedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  const isClosed = closedDates.includes(selDate);

  // Generate next 30 days for closed date picker
  const next30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return toISO(d);
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Closed Days Section */}
      <div style={{ background: A.card, border: `1.5px solid ${A.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Ban size={16} color={A.error} /> วันปิดร้าน
        </h3>
        <p style={{ color: A.sub, fontSize: 12, marginBottom: 12 }}>เลือกวันที่ต้องการปิดร้าน ลูกค้าจะจองคิวไม่ได้ในวันนั้น</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {next30.map(d => {
            const isCl = closedDates.includes(d);
            const dateObj = new Date(d + "T00:00:00");
            return (
              <button key={d} onClick={() => toggleClosedDate(d)}
                style={{
                  border: `1.5px solid ${isCl ? A.error : A.border}`,
                  borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                  background: isCl ? A.errorBg : A.bg, color: isCl ? A.error : A.sub,
                  fontWeight: isCl ? 700 : 400,
                }}>
                {dateObj.toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
              </button>
            );
          })}
        </div>
        {closedDates.length > 0 && (
          <div style={{ marginBottom: 12, fontSize: 12, color: A.error }}>
            ปิดทั้งหมด {closedDates.length} วัน: {closedDates.sort().map(d => fmtDate(d)).join(", ")}
          </div>
        )}
        <button onClick={() => saveClosedDates.mutate()}
          style={{ width: "100%", background: settingsSaved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {saveClosedDates.isPending ? <Loader2 size={15} className="animate-spin" /> : settingsSaved ? <><CheckCircle size={15} /> บันทึกแล้ว</> : <><Save size={15} /> บันทึกวันปิดร้าน</>}
        </button>
      </div>

      {/* Weekly recurring slot template */}
      <WeeklyTemplateSection token={token} onGenerated={() => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] })} />

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
          <Plus size={15} /> เพิ่ม
        </button>
      </div>

      {isClosed && (
        <div style={{ background: A.errorBg, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.error, fontSize: 13, fontWeight: 600 }}>
          🚫 วันนี้ตั้งเป็นวันปิดร้าน ลูกค้าจองไม่ได้
        </div>
      )}

      <button onClick={() => {
        const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(selDate + "T00:00:00"); d.setDate(d.getDate() + i); return toISO(d); });
        batchMutation.mutate({ dates, times: defaultTimes });
      }} disabled={batchMutation.isPending}
        style={{ width: "100%", background: A.pale, color: A.primary, border: `1px solid ${A.border}`, borderRadius: 10, padding: "9px", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: "inherit" }}>
        {batchMutation.isPending ? <Loader2 size={14} className="animate-spin" style={{ display: "inline" }} /> : "สร้าง slot 7 วัน (จากวันที่เลือก, 09:00–19:00 × 6 รอบ)"}
      </button>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 32 }}><Loader2 size={24} color={A.primary} className="animate-spin" /></div>
      ) : slots.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, background: A.card, borderRadius: 12, border: `1px solid ${A.border}` }}>
          <Clock size={28} color={A.muted} style={{ margin: "0 auto 8px" }} />
          <p style={{ color: A.muted, fontSize: 14 }}>ยังไม่มี slot สำหรับวันนี้</p>
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
                <button onClick={() => toggleMutation.mutate({ id: sl.id, is_available: !sl.is_available })}
                  style={{ flex: 1, background: sl.is_available ? A.errorBg : A.successBg, color: sl.is_available ? A.error : A.success, border: "none", borderRadius: 8, padding: "5px", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                  {sl.is_available ? "ปิด" : "เปิด"}
                </button>
                <button onClick={() => { if (sl.booked_count === 0) setDeleteSlotId(sl.id); }} disabled={sl.booked_count > 0}
                  style={{ background: A.gray, border: "none", borderRadius: 8, padding: "5px 8px", cursor: sl.booked_count > 0 ? "not-allowed" : "pointer", opacity: sl.booked_count > 0 ? 0.4 : 1 }}>
                  <Trash2 size={13} color={A.error} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Slot Confirm Dialog */}
      {deleteSlotId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: A.card, borderRadius: 18, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 8 }}>ยืนยันลบ Slot?</h3>
            <p style={{ fontSize: 14, color: A.sub, marginBottom: 20 }}>ไม่สามารถกู้คืนได้หลังลบแล้ว</p>
            {slotDeleteError && <p style={{ color: A.error, fontSize: 13, marginBottom: 12 }}>⚠️ {slotDeleteError}</p>}
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
    </div>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────
function GalleryTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const { data: items = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-gallery"],
    queryFn: () => fetch("/api/nail/admin/gallery", { headers: authH(token) }).then(r => r.json()),
  });

  const addMutation = useMutation({
    mutationFn: (image_url: string) =>
      fetch("/api/nail/admin/gallery", { method: "POST", headers: authH(token), body: JSON.stringify({ image_url, caption }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-gallery"] }); setPreview(null); setCaption(""); setUploading(false); },
  });

  const [deleteGalleryId, setDeleteGalleryId] = useState<number | null>(null);
  const [galleryDeleteError, setGalleryDeleteError] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/nail/admin/gallery/${id}`, { method: "DELETE", headers: authH(token) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.detail ?? `HTTP ${r.status}`);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-gallery"] }); setDeleteGalleryId(null); setGalleryDeleteError(""); },
    onError: (e: any) => setGalleryDeleteError(e.message || "ลบไม่สำเร็จ"),
  });

  const [fileError, setFileError] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError("");
    // Guard: limit to 1.5 MB to prevent large base64 payloads in DB
    if (file.size > 1.5 * 1024 * 1024) {
      setFileError("รูปภาพต้องไม่เกิน 1.5 MB กรุณาลดขนาดรูปก่อนอัปโหลด");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setUploading(true);
    // Store base64 data URI directly in DB (no filesystem — survives Render restarts)
    addMutation.mutate(preview);
  };

  return (
    <div style={{ padding: 16 }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      {fileError && (
        <div style={{ background: A.errorBg, border: `1px solid ${A.error}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: A.error, fontSize: 13 }}>
          {fileError}
        </div>
      )}
      {preview ? (
        <div style={{ marginBottom: 16 }}>
          <img src={preview} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 12, border: `2px solid ${A.primary}` }} />
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="คำบรรยาย (optional)"
            style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "10px 12px", marginTop: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", background: A.bg }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => setPreview(null)} style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
            <button onClick={handleUpload} disabled={uploading || addMutation.isPending}
              style={{ flex: 1, background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
              {(uploading || addMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : "อัปโหลด"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          style={{ width: "100%", border: `2px dashed ${A.border}`, borderRadius: 14, padding: "20px", background: A.pale, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: A.primary, fontWeight: 600, fontFamily: "inherit", fontSize: 14 }}>
          <Upload size={20} /> อัปโหลดรูปผลงาน
        </button>
      )}
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
      {items.length === 0 && !preview && (
        <div style={{ textAlign: "center", padding: 32, color: A.muted, fontSize: 14 }}>
          <Image size={32} style={{ margin: "0 auto 8px" }} /><p>ยังไม่มีผลงาน</p>
        </div>
      )}

      {/* Delete Gallery Confirm Dialog */}
      {deleteGalleryId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div style={{ background: A.card, borderRadius: 18, padding: 24, width: "100%", maxWidth: 360, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: A.text, marginBottom: 8 }}>ลบรูปผลงานนี้?</h3>
            <p style={{ fontSize: 14, color: A.sub, marginBottom: 20 }}>รูปจะหายไปจากแกลเลอรีทันที</p>
            {galleryDeleteError && <p style={{ color: A.error, fontSize: 13, marginBottom: 12 }}>⚠️ {galleryDeleteError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setDeleteGalleryId(null); setGalleryDeleteError(""); }}
                style={{ flex: 1, background: A.gray, border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>ยกเลิก</button>
              <button onClick={() => deleteMutation.mutate(deleteGalleryId!)} disabled={deleteMutation.isPending}
                style={{ flex: 1, background: A.error, color: "#fff", border: "none", borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
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
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  // IMPORTANT: use useEffect to handle cached data — the queryFn may not re-run
  // when data is already in cache from ScheduleTab (same queryKey)
  const { data: settingsData, isLoading: settingsLoading, isError: settingsError } = useQuery<any>({
    queryKey: ["nail-admin-settings"],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()),
    staleTime: 60000,
    retry: 1,
  });

  // Sync form from server data. When data refetches (e.g. after save), update form.
  // This is safe because staleTime:60s means background refetches only trigger after
  // invalidation (i.e. after a successful save — resetting to confirmed server values is correct).
  useEffect(() => {
    if (settingsData) {
      setForm({ ...settingsData, closed_dates: undefined });
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
    onSuccess: () => { setSaved(true); setSaveError(""); setTimeout(() => setSaved(false), 2500); qc.invalidateQueries({ queryKey: ["nail-admin-settings"] }); },
    onError: (e: any) => setSaveError(e.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่"),
  });

  if (settingsLoading && !settingsData) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} color={A.primary} className="animate-spin" /></div>;
  if (settingsError && !form) return <div style={{ textAlign: "center", padding: 40, color: A.error, fontSize: 14 }}>โหลดการตั้งค่าไม่สำเร็จ กรุณา <button onClick={() => qc.invalidateQueries({ queryKey: ["nail-admin-settings"] })} style={{ background: "none", border: "none", cursor: "pointer", color: A.primary, textDecoration: "underline", fontFamily: "inherit" }}>ลองใหม่</button></div>;
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

      <Section title="โซเชียลมีเดีย" />
      <div style={{ background: A.pale, border: `1px solid ${A.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.primary }}>
        💡 ลิงก์ที่กรอกจะแสดงปุ่มให้ลูกค้ากดดูผลงานในหน้าร้าน
      </div>
      {F("ig_url", "Instagram URL", "url", "https://instagram.com/...")}
      {F("fb_url", "Facebook URL", "url", "https://facebook.com/...")}
      {F("line_oa_url", "Line Official Account URL", "url", "https://line.me/...")}
      {F("tiktok_url", "TikTok URL", "url", "https://tiktok.com/...")}

      <Section title="การชำระมัดจำ" />
      {F("deposit_amount", "ค่ามัดจำ (฿)", "number", "200")}
      {F("bank_name", "ชื่อธนาคาร", "text", "ธนาคารกสิกรไทย")}
      {F("bank_account_number", "เลขบัญชี")}
      {F("bank_account_name", "ชื่อบัญชี")}
      {F("bank_qr_url", "URL รูป QR Code พร้อมเพย์")}

      <Section title="ระบบจอง" />
      {F("max_advance_days", "จองล่วงหน้าได้สูงสุด (วัน)", "number", "14")}
      {F("slot_duration_minutes", "ระยะเวลาต่อ slot เริ่มต้น (นาที)", "number", "90")}

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
