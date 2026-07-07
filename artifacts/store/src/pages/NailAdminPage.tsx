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
  MessageCircle,
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
  sub:       "#5A5A7A",
  muted:     "#9090A8",
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

type Tab = "dashboard" | "bookings" | "services" | "schedule" | "gallery" | "settings";

function toISO(d: Date) { return d.toISOString().split("T")[0]; }
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

// ─────────────────────────────────────────────────────────────────────────────
export default function NailAdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [token, setToken] = useState(() => localStorage.getItem("nail_admin_token") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [authError, setAuthError] = useState("");

  const handleLogin = async () => {
    const res = await fetch("/api/nail/admin/settings", {
      headers: { Authorization: `Bearer ${tokenInput}` },
    });
    if (res.ok) {
      localStorage.setItem("nail_admin_token", tokenInput);
      setToken(tokenInput);
      setAuthError("");
    } else {
      setAuthError("รหัสผ่านไม่ถูกต้อง");
    }
  };

  if (!token) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: A.bg, fontFamily: "'Prompt', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ background: A.card, borderRadius: 24, padding: "40px 32px", maxWidth: 360, width: "100%", boxShadow: "0 8px 40px rgba(176,23,75,0.12)", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 28 }}>💅</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: A.text, marginBottom: 4 }}>หลังร้านทำเล็บ</h1>
          <p style={{ color: A.sub, fontSize: 14, marginBottom: 28 }}>กรุณาเข้าสู่ระบบ</p>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="รหัสผ่าน Admin"
            style={{ width: "100%", border: `1.5px solid ${A.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, outline: "none", marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit", background: A.bg }}
          />
          {authError && <p style={{ color: A.error, fontSize: 13, marginBottom: 10 }}>{authError}</p>}
          <button onClick={handleLogin}
            style={{ width: "100%", background: `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "ภาพรวม",    icon: <LayoutDashboard size={17} /> },
    { id: "bookings",  label: "คิว",        icon: <Calendar size={17} /> },
    { id: "services",  label: "บริการ",     icon: <Scissors size={17} /> },
    { id: "schedule",  label: "ตารางเวลา",  icon: <Clock size={17} /> },
    { id: "gallery",   label: "แกลเลอรี",  icon: <Image size={17} /> },
    { id: "settings",  label: "ตั้งค่า",    icon: <Settings size={17} /> },
  ];

  return (
    <div style={{ background: A.bg, minHeight: "100vh", fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${A.primary} 0%, ${A.deep} 100%)`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 16px rgba(136,14,79,0.25)" }}>
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
            {tab === "gallery"   && <GalleryTab token={token} />}
            {tab === "settings"  && <SettingsTab token={token} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ token, onGoBookings }: { token: string; onGoBookings: () => void }) {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["nail-admin-dashboard"],
    queryFn: () => aFetch("/api/nail/admin/dashboard", token),
    refetchInterval: 60000,
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

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 48 }}><Loader2 size={28} color={A.primary} className="animate-spin" /></div>
      ) : (
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
      )}
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

  const url = `/api/nail/admin/bookings?date=${filterDate}` + (filterStatus !== "all" ? `&status=${filterStatus}` : "");
  const { data: bookings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-bookings", filterDate, filterStatus],
    queryFn: () => fetch(url, { headers: authH(token) }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/nail/admin/bookings/${id}`, { method: "PUT", headers: authH(token), body: JSON.stringify({ status }) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }),
  });

  const refundMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/bookings/${id}/refund`, { method: "POST", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }); qc.invalidateQueries({ queryKey: ["nail-admin-dashboard"] }); },
  });

  const walkinMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/bookings/walkin", { method: "POST", headers: authH(token), body: JSON.stringify({ customer_name: wName, customer_phone: wPhone, slot_date: filterDate, start_time: wTime }) }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }); setShowWalkin(false); setWName(""); setWPhone(""); },
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
                        <button onClick={() => { if (confirm("ยืนยันการยกเลิกและคืนเงิน?")) refundMutation.mutate(b.id); }}
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
                        <button onClick={() => { if (confirm("ยืนยันการยกเลิกและคืนเงิน?")) refundMutation.mutate(b.id); }}
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

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services"],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
  });

  const openAdd = () => { setEditId(null); setName(""); setDesc(""); setPrice("0"); setDur("60"); setShow(true); };
  const openEdit = (s: any) => { setEditId(s.id); setName(s.name); setDesc(s.description || ""); setPrice(String(s.price)); setDur(String(s.duration_minutes)); setShow(true); };

  const saveMutation = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name, description: desc, price: parseFloat(price), duration_minutes: parseInt(dur) });
      if (editId) {
        return fetch(`/api/nail/admin/services/${editId}`, { method: "PUT", headers: authH(token), body }).then(r => r.json());
      }
      return fetch("/api/nail/admin/services", { method: "POST", headers: authH(token), body }).then(r => r.json());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services"] }); setShow(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/services/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-services"] }),
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
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <span style={{ background: A.pale, color: A.primary, borderRadius: 100, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>฿{s.price.toLocaleString()}</span>
                <span style={{ background: A.gray, color: A.sub, borderRadius: 100, padding: "2px 10px", fontSize: 12 }}>⏱ {s.duration_minutes} นาที</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => openEdit(s)} style={{ background: A.infoBg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
                <Edit2 size={14} color={A.info} />
              </button>
              <button onClick={() => { if (confirm(`ลบบริการ "${s.name}"?`)) deleteMutation.mutate(s.id); }} style={{ background: A.errorBg, border: "none", borderRadius: 8, padding: "7px 10px", cursor: "pointer" }}>
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

  // Load settings for closed_dates
  useQuery({
    queryKey: ["nail-admin-settings"],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()).then(d => {
      try { setClosedDates(JSON.parse(d.closed_dates || "[]")); } catch { setClosedDates([]); }
      return d;
    }),
  });

  const { data: slots = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-slots", selDate],
    queryFn: () => fetch(`/api/nail/admin/slots?date=${selDate}`, { headers: authH(token) }).then(r => r.json()),
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/slots/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
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

      {/* Slots Section */}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: A.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Clock size={16} color={A.primary} /> ช่วงเวลาจอง
      </h3>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
          style={{ flex: 1, border: `1.5px solid ${A.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13, fontFamily: "inherit", background: A.card }} />
        <button onClick={() => setShowAdd(true)}
          style={{ background: A.primary, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
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
                <button onClick={() => { if (sl.booked_count === 0) deleteMutation.mutate(sl.id); }} disabled={sl.booked_count > 0}
                  style={{ background: A.gray, border: "none", borderRadius: 8, padding: "5px 8px", cursor: sl.booked_count > 0 ? "not-allowed" : "pointer", opacity: sl.booked_count > 0 ? 0.4 : 1 }}>
                  <Trash2 size={13} color={A.error} />
                </button>
              </div>
            </div>
          ))}
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/gallery/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-gallery"] }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setUploading(true);
    const res = await fetch("/api/upload/slip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: preview }) }).then(r => r.json());
    addMutation.mutate(res.url);
  };

  return (
    <div style={{ padding: 16 }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
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
            <button onClick={() => deleteMutation.mutate(g.id)}
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
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useQuery({
    queryKey: ["nail-admin-settings"],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()).then(d => { setForm({ ...d, closed_dates: undefined }); return d; }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/settings", { method: "PUT", headers: authH(token), body: JSON.stringify(form) }).then(r => r.json()),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); qc.invalidateQueries({ queryKey: ["nail-admin-settings"] }); },
  });

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

      <Section title="ระบบเช่า / หมดอายุ" />
      <div style={{ background: A.warningBg, border: `1px solid ${A.warning}44`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: A.warning }}>
        ⚠️ ถ้าตั้งวันหมดอายุ ระบบจะล็อกหน้าเว็บลูกค้าเมื่อถึงเวลา
      </div>
      {F("expired_at", "วันหมดอายุ (ปล่อยว่าง = ไม่มีกำหนด)", "datetime-local")}

      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ width: "100%", marginTop: 8, background: saved ? A.success : `linear-gradient(135deg, ${A.primary}, ${A.deep})`, color: "#fff", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
        {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : saved ? <><CheckCircle size={18} /> บันทึกแล้ว!</> : <><Save size={18} /> บันทึกการตั้งค่า</>}
      </button>
    </div>
  );
}
