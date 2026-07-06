/**
 * NailAdminPage — หน้าจัดการร้านทำเล็บ (Admin)
 * Route: /nail-admin
 */
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Calendar, Clock, Users, Settings, Image, Plus, Trash2, Check, X,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Loader2,
  Phone, User, CheckCircle, XCircle, AlertCircle, Upload, RefreshCw,
  ArrowLeft, Scissors, Package, PlusCircle,
} from "lucide-react";

const P = {
  pink:      "#FF6B9D",
  pinkLight: "#FF85B3",
  pinkPale:  "#FFF0F7",
  pinkBorder:"#FFD6EC",
  pinkDeep:  "#E0457B",
  white:     "#FFFFFF",
  offwhite:  "#FFF8FC",
  text:      "#1A1A2E",
  sub:       "#6B6B8A",
  muted:     "#A0A0B8",
  gray:      "#E8E8F0",
  success:   "#22C55E",
  error:     "#EF4444",
  warning:   "#F59E0B",
} as const;

type Tab = "bookings" | "slots" | "gallery" | "services" | "settings";

function toISO(d: Date) { return d.toISOString().split("T")[0]; }
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
}

const statusColor: Record<string, string> = {
  held:            P.warning,
  pending_payment: "#3B82F6",
  confirmed:       P.success,
  cancelled:       P.error,
  completed:       "#8B5CF6",
  walkin:          "#F97316",
};
const statusLabel: Record<string, string> = {
  held:            "กำลังรอชำระ",
  pending_payment: "รอตรวจสลิป",
  confirmed:       "ยืนยันแล้ว",
  cancelled:       "ยกเลิก",
  completed:       "เสร็จสิ้น",
  walkin:          "Walk-in",
};

// ─────────────────────────────────────────────────────────────────────────────
export default function NailAdminPage() {
  const [tab, setTab] = useState<Tab>("bookings");
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: P.offwhite, padding: 24 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <div style={{ background: P.white, borderRadius: 20, padding: 36, maxWidth: 360, width: "100%", boxShadow: "0 8px 40px rgba(255,107,157,0.15)", fontFamily: "'Prompt', sans-serif" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>💅</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: P.text }}>Admin Panel</h1>
            <p style={{ color: P.sub, fontSize: 14 }}>ระบบจัดการร้านทำเล็บ</p>
          </div>
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="รหัสผ่าน Admin"
            style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 12, padding: "12px 14px", fontSize: 15, outline: "none", marginBottom: 12, boxSizing: "border-box", fontFamily: "inherit" }}
          />
          {authError && <p style={{ color: P.error, fontSize: 13, marginBottom: 10 }}>{authError}</p>}
          <button
            onClick={handleLogin}
            style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "bookings", label: "คิว", icon: <Calendar size={18} /> },
    { id: "slots",    label: "เวลา", icon: <Clock size={18} /> },
    { id: "gallery",  label: "แกลเลอรี", icon: <Image size={18} /> },
    { id: "services", label: "บริการ", icon: <Scissors size={18} /> },
    { id: "settings", label: "ตั้งค่า", icon: <Settings size={18} /> },
  ];

  return (
    <div style={{ background: P.offwhite, minHeight: "100vh", fontFamily: "'Prompt', 'Noto Sans Thai', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ color: "#fff", fontSize: 18, fontWeight: 700, margin: 0 }}>💅 Admin Panel</h1>
          <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, margin: 0 }}>ระบบจัดการร้านทำเล็บ</p>
        </div>
        <button onClick={() => { localStorage.removeItem("nail_admin_token"); setToken(""); }}
          style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 100, padding: "6px 14px", color: "#fff", cursor: "pointer", fontSize: 13 }}>
          ออก
        </button>
      </div>

      {/* Tab bar */}
      <div style={{ background: P.white, borderBottom: `1px solid ${P.pinkBorder}`, display: "flex", overflowX: "auto", padding: "0 8px" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              padding: "10px 14px", border: "none", background: "none", cursor: "pointer",
              color: tab === t.id ? P.pink : P.muted, whiteSpace: "nowrap",
              borderBottom: `3px solid ${tab === t.id ? P.pink : "transparent"}`,
              fontSize: 12, fontWeight: tab === t.id ? 600 : 400, fontFamily: "inherit",
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 80px" }}>
        {tab === "bookings" && <BookingsTab token={token} />}
        {tab === "slots"    && <SlotsTab token={token} />}
        {tab === "gallery"  && <GalleryTab token={token} />}
        {tab === "services" && <ServicesTab token={token} />}
        {tab === "settings" && <SettingsTab token={token} />}
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────
const authH = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

async function authFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, headers: { ...authH(token), ...(options?.headers || {}) } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || `HTTP ${res.status}`);
  return data;
}

// ── Bookings Tab ─────────────────────────────────────────────────────
function BookingsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState(toISO(new Date()));
  const [filterStatus, setFilterStatus] = useState("all");

  const url = `/api/nail/admin/bookings?date=${filterDate}` + (filterStatus !== "all" ? `&status=${filterStatus}` : "");
  const { data: bookings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["nail-admin-bookings", filterDate, filterStatus],
    queryFn: () => fetch(url, { headers: authH(token) }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(`/api/nail/admin/bookings/${id}`, {
        method: "PUT", headers: authH(token),
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }),
  });

  // Walk-in form
  const [showWalkin, setShowWalkin] = useState(false);
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wTime, setWTime] = useState("09:00");
  const walkinMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/bookings/walkin", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ customer_name: wName, customer_phone: wPhone, slot_date: filterDate, start_time: wTime }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-bookings"] }); setShowWalkin(false); setWName(""); setWPhone(""); },
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center" }}>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          style={{ flex: 1, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "8px 12px", fontSize: 14, fontFamily: "inherit" }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }}>
          <option value="all">ทั้งหมด</option>
          <option value="pending_payment">รอตรวจสลิป</option>
          <option value="confirmed">ยืนยันแล้ว</option>
          <option value="held">กำลังรอ</option>
          <option value="walkin">Walk-in</option>
          <option value="completed">เสร็จ</option>
          <option value="cancelled">ยกเลิก</option>
        </select>
        <button onClick={() => refetch()} style={{ background: P.pinkPale, border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", color: P.pink }}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: P.sub, fontSize: 13 }}>{bookings.length} รายการ</span>
        <button onClick={() => setShowWalkin(true)}
          style={{ background: P.pink, color: "#fff", border: "none", borderRadius: 100, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={15} /> Walk-in
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={28} color={P.pink} className="animate-spin" /></div>
      ) : bookings.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, background: P.white, borderRadius: 14, border: `1px solid ${P.pinkBorder}` }}>
          <Calendar size={32} color={P.muted} style={{ margin: "0 auto 8px" }} />
          <p style={{ color: P.muted }}>ไม่มีการจองในวันนี้</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bookings.map((b: any) => (
            <div key={b.id} style={{ background: P.white, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: P.text }}>{b.customer_name}</span>
                  <span style={{ color: P.muted, fontSize: 13, marginLeft: 8 }}>{b.booking_ref}</span>
                </div>
                <span style={{ background: `${statusColor[b.status]}22`, color: statusColor[b.status], borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                  {statusLabel[b.status] || b.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 13, color: P.sub, marginBottom: 10 }}>
                <span>🕐 {b.start_time} – {b.end_time}</span>
                {b.service_name && <span>💅 {b.service_name}</span>}
                <span>📱 {b.customer_phone}</span>
              </div>
              {b.deposit_total > 0 && (
                <div style={{ fontSize: 13, color: P.text, marginBottom: 8 }}>
                  มัดจำ: <strong>฿{b.deposit_total.toFixed(2)}</strong>
                  {b.slip_verify_status && <span style={{ marginLeft: 8, color: b.slip_verify_status === "verified" ? P.success : P.warning }}>({b.slip_verify_status})</span>}
                </div>
              )}
              {b.customer_note && <div style={{ fontSize: 13, color: P.sub, marginBottom: 8 }}>หมายเหตุ: {b.customer_note}</div>}
              {/* Action buttons */}
              {b.status === "pending_payment" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => updateMutation.mutate({ id: b.id, status: "confirmed" })}
                    style={{ flex: 1, background: P.success, color: "#fff", border: "none", borderRadius: 10, padding: "8px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <CheckCircle size={15} /> ยืนยัน
                  </button>
                  <button onClick={() => updateMutation.mutate({ id: b.id, status: "cancelled" })}
                    style={{ flex: 1, background: "#FEF2F2", color: P.error, border: `1px solid #FECACA`, borderRadius: 10, padding: "8px", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <XCircle size={15} /> ปฏิเสธ
                  </button>
                </div>
              )}
              {b.status === "confirmed" && (
                <button onClick={() => updateMutation.mutate({ id: b.id, status: "completed" })}
                  style={{ background: "#EDE9FE", color: "#7C3AED", border: "none", borderRadius: 10, padding: "7px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ✓ เสร็จสิ้น
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Walk-in Modal */}
      {showWalkin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 9999 }}>
          <div style={{ background: P.white, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: P.text }}>เพิ่ม Walk-in</h3>
            <input value={wName} onChange={e => setWName(e.target.value)} placeholder="ชื่อลูกค้า *"
              style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            <input value={wPhone} onChange={e => setWPhone(e.target.value)} placeholder="เบอร์โทร *"
              style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            <input type="time" value={wTime} onChange={e => setWTime(e.target.value)}
              style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", marginBottom: 16, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowWalkin(false)}
                style={{ flex: 1, background: P.gray, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontFamily: "inherit" }}>
                ยกเลิก
              </button>
              <button onClick={() => walkinMutation.mutate()} disabled={!wName || !wPhone}
                style={{ flex: 1, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                {walkinMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "เพิ่ม"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Slots Tab ────────────────────────────────────────────────────────
function SlotsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [selDate, setSelDate] = useState(toISO(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [batchMode, setBatchMode] = useState(false);

  const { data: slots = [], isLoading } = useQuery<any[]>({
    queryKey: ["nail-admin-slots", selDate],
    queryFn: () => fetch(`/api/nail/admin/slots?date=${selDate}`, { headers: authH(token) }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/slots", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ slot_date: selDate, start_time: startTime, end_time: endTime }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }); setShowAdd(false); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_available }: { id: number; is_available: boolean }) =>
      fetch(`/api/nail/admin/slots/${id}`, {
        method: "PUT", headers: authH(token),
        body: JSON.stringify({ is_available }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/slots/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
  });

  // Batch: create standard slots for the whole week
  const batchMutation = useMutation({
    mutationFn: (body: object) =>
      fetch("/api/nail/admin/slots/batch", {
        method: "POST", headers: authH(token), body: JSON.stringify(body),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-slots"] }),
  });

  const defaultTimes = [
    { start: "09:00", end: "10:00" }, { start: "10:00", end: "11:00" },
    { start: "11:00", end: "12:00" }, { start: "13:00", end: "14:00" },
    { start: "14:00", end: "15:00" }, { start: "15:00", end: "16:00" },
    { start: "16:00", end: "17:00" }, { start: "17:00", end: "18:00" },
  ];

  const createWeekSlots = () => {
    const dates: string[] = [];
    const base = new Date(selDate + "T00:00:00");
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      dates.push(toISO(d));
    }
    batchMutation.mutate({ dates, times: defaultTimes });
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
          style={{ flex: 1, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "8px 12px", fontSize: 14, fontFamily: "inherit" }} />
        <button onClick={() => setShowAdd(true)}
          style={{ background: P.pink, color: "#fff", border: "none", borderRadius: 10, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <Plus size={15} /> เพิ่ม
        </button>
      </div>

      <button onClick={createWeekSlots} disabled={batchMutation.isPending}
        style={{ width: "100%", background: P.pinkPale, color: P.pink, border: `1px solid ${P.pinkBorder}`, borderRadius: 10, padding: "9px", cursor: "pointer", fontSize: 13, fontWeight: 600, marginBottom: 14, fontFamily: "inherit" }}>
        {batchMutation.isPending ? <Loader2 size={14} className="animate-spin" style={{ display: "inline" }} /> : "สร้าง slot 7 วัน (จากวันที่เลือก, 09:00–18:00)"}
      </button>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 32 }}><Loader2 size={24} color={P.pink} className="animate-spin" /></div>
      ) : slots.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, background: P.white, borderRadius: 12, border: `1px solid ${P.pinkBorder}` }}>
          <Clock size={28} color={P.muted} style={{ margin: "0 auto 8px" }} />
          <p style={{ color: P.muted, fontSize: 14 }}>ยังไม่มี slot สำหรับวันนี้</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {slots.map((sl: any) => (
            <div key={sl.id} style={{ background: sl.is_available ? P.white : P.gray, border: `1.5px solid ${sl.is_available ? P.pinkBorder : P.grayDark}`, borderRadius: 12, padding: 12, opacity: sl.is_available ? 1 : 0.7 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: sl.is_available ? P.text : P.muted }}>{sl.start_time}</div>
              <div style={{ fontSize: 12, color: P.muted }}>ถึง {sl.end_time}</div>
              <div style={{ fontSize: 12, color: sl.booked_count > 0 ? P.warning : P.success, marginTop: 4 }}>
                {sl.booked_count}/{sl.max_bookings} จอง
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={() => toggleMutation.mutate({ id: sl.id, is_available: !sl.is_available })}
                  style={{ flex: 1, background: sl.is_available ? "#FEF2F2" : "#F0FDF4", color: sl.is_available ? P.error : P.success, border: "none", borderRadius: 8, padding: "5px", cursor: "pointer", fontSize: 11 }}>
                  {sl.is_available ? "ปิด" : "เปิด"}
                </button>
                <button onClick={() => deleteMutation.mutate(sl.id)} disabled={sl.booked_count > 0}
                  style={{ background: P.gray, border: "none", borderRadius: 8, padding: "5px 8px", cursor: sl.booked_count > 0 ? "not-allowed" : "pointer", opacity: sl.booked_count > 0 ? 0.4 : 1 }}>
                  <Trash2 size={13} color={P.error} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 9999 }}>
          <div style={{ background: P.white, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>เพิ่ม Slot วันที่ {fmtDate(selDate)}</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: P.sub }}>เวลาเริ่ม</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: P.sub }}>เวลาสิ้นสุด</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, background: P.gray, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
              <button onClick={() => createMutation.mutate()}
                style={{ flex: 1, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "เพิ่ม"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Gallery Tab ──────────────────────────────────────────────────────
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
      fetch("/api/nail/admin/gallery", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ image_url, caption }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-gallery"] }); setPreview(null); setCaption(""); setUploading(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/gallery/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-gallery"] }),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!preview) return;
    setUploading(true);
    const res = await fetch("/api/upload/slip", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: preview }),
    }).then(r => r.json());
    addMutation.mutate(res.url);
  };

  return (
    <div style={{ padding: 16 }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

      {preview ? (
        <div style={{ marginBottom: 16 }}>
          <img src={preview} alt="" style={{ width: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 12, border: `2px solid ${P.pink}` }} />
          <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="คำบรรยาย (optional)"
            style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", marginTop: 10, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={() => setPreview(null)} style={{ flex: 1, background: P.gray, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer" }}>ยกเลิก</button>
            <button onClick={handleUpload} disabled={uploading || addMutation.isPending}
              style={{ flex: 1, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700 }}>
              {(uploading || addMutation.isPending) ? <Loader2 size={14} className="animate-spin" /> : "อัปโหลด"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          style={{ width: "100%", border: `2px dashed ${P.pinkBorder}`, borderRadius: 14, padding: "20px", background: P.pinkPale, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: P.pink, fontWeight: 600, fontFamily: "inherit" }}>
          <Upload size={20} /> อัปโหลดรูปผลงาน
        </button>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {items.map((g: any) => (
          <div key={g.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", background: P.gray, aspectRatio: "1" }}>
            <img src={g.image_url} alt={g.caption || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button onClick={() => deleteMutation.mutate(g.id)}
              style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Trash2 size={12} color="#fff" />
            </button>
          </div>
        ))}
      </div>

      {items.length === 0 && !preview && (
        <div style={{ textAlign: "center", padding: 32, color: P.muted, fontSize: 14 }}>
          <Image size={32} style={{ margin: "0 auto 8px" }} />
          ยังไม่มีผลงาน
        </div>
      )}
    </div>
  );
}

// ── Services Tab ─────────────────────────────────────────────────────
function ServicesTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("0");
  const [dur, setDur] = useState("60");

  const { data: services = [] } = useQuery<any[]>({
    queryKey: ["nail-admin-services"],
    queryFn: () => fetch("/api/nail/admin/services", { headers: authH(token) }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/services", {
        method: "POST", headers: authH(token),
        body: JSON.stringify({ name, description: desc, price: parseFloat(price), duration_minutes: parseInt(dur) }),
      }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nail-admin-services"] }); setShow(false); setName(""); setDesc(""); setPrice("0"); setDur("60"); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/nail/admin/services/${id}`, { method: "DELETE", headers: authH(token) }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nail-admin-services"] }),
  });

  return (
    <div style={{ padding: 16 }}>
      <button onClick={() => setShow(true)}
        style={{ width: "100%", background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 12, padding: "12px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}>
        <Plus size={18} /> เพิ่มบริการ
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {services.map((s: any) => (
          <div key={s.id} style={{ background: P.white, border: `1.5px solid ${P.pinkBorder}`, borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: P.text }}>{s.name}</div>
              {s.description && <div style={{ fontSize: 13, color: P.sub }}>{s.description}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <span style={{ background: P.pinkPale, color: P.pink, borderRadius: 100, padding: "2px 10px", fontSize: 12, fontWeight: 600 }}>฿{s.price}</span>
                <span style={{ background: P.gray, color: P.sub, borderRadius: 100, padding: "2px 10px", fontSize: 12 }}>{s.duration_minutes} นาที</span>
              </div>
            </div>
            <button onClick={() => deleteMutation.mutate(s.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
              <Trash2 size={16} color={P.error} />
            </button>
          </div>
        ))}
      </div>

      {show && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", zIndex: 9999 }}>
          <div style={{ background: P.white, borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", fontFamily: "inherit" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>เพิ่มบริการใหม่</h3>
            {[
              { label: "ชื่อบริการ *", val: name, set: setName, ph: "เช่น เพนท์เจล" },
              { label: "คำอธิบาย", val: desc, set: setDesc, ph: "รายละเอียดบริการ" },
              { label: "ราคา (฿)", val: price, set: setPrice, ph: "350", type: "number" },
              { label: "ระยะเวลา (นาที)", val: dur, set: setDur, ph: "60", type: "number" },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: P.sub, display: "block", marginBottom: 4 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} type={f.type || "text"}
                  style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => setShow(false)} style={{ flex: 1, background: P.gray, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontFamily: "inherit" }}>ยกเลิก</button>
              <button onClick={() => createMutation.mutate()} disabled={!name}
                style={{ flex: 1, background: `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ─────────────────────────────────────────────────────
function SettingsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  useQuery({
    queryKey: ["nail-admin-settings"],
    queryFn: () => fetch("/api/nail/admin/settings", { headers: authH(token) }).then(r => r.json()).then(d => { setForm(d); return d; }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/nail/admin/settings", {
        method: "PUT", headers: authH(token), body: JSON.stringify(form),
      }).then(r => r.json()),
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); qc.invalidateQueries({ queryKey: ["nail-admin-settings"] }); },
  });

  if (!form) return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={24} color={P.pink} className="animate-spin" /></div>;

  const f = (key: string, label: string, type = "text", ph = "") => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: P.sub, fontWeight: 500, display: "block", marginBottom: 5 }}>{label}</label>
      <input
        type={type} value={form[key] ?? ""} placeholder={ph}
        onChange={e => setForm((p: any) => ({ ...p, [key]: e.target.value }))}
        style={{ width: "100%", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }}
      />
    </div>
  );

  return (
    <div style={{ padding: 16, fontFamily: "inherit" }}>
      <h3 style={{ fontWeight: 700, color: P.text, marginBottom: 16 }}>ข้อมูลร้าน</h3>
      {f("shop_name", "ชื่อร้าน", "text", "ร้านทำเล็บของคุณ")}
      {f("shop_tagline", "สโลแกน", "text", "ทำเล็บสวย สไตล์คุณ")}
      {f("shop_logo_url", "URL โลโก้")}

      <h3 style={{ fontWeight: 700, color: P.text, margin: "20px 0 14px" }}>ช่องทางติดต่อ</h3>
      {f("ig_url", "Instagram URL")}
      {f("fb_url", "Facebook URL")}
      {f("line_oa_url", "Line OA URL")}
      {f("tiktok_url", "TikTok URL")}

      <h3 style={{ fontWeight: 700, color: P.text, margin: "20px 0 14px" }}>การชำระเงิน</h3>
      {f("deposit_amount", "ค่ามัดจำ (฿)", "number", "200")}
      {f("bank_name", "ชื่อธนาคาร", "text", "ธนาคารกสิกรไทย")}
      {f("bank_account_number", "เลขบัญชี")}
      {f("bank_account_name", "ชื่อบัญชี")}
      {f("bank_qr_url", "URL QR Code พร้อมเพย์")}

      <h3 style={{ fontWeight: 700, color: P.text, margin: "20px 0 14px" }}>การจอง</h3>
      {f("max_advance_days", "จองล่วงหน้าได้สูงสุด (วัน)", "number", "14")}
      {f("slot_duration_minutes", "ระยะเวลาต่อ slot (นาที)", "number", "60")}

      <h3 style={{ fontWeight: 700, color: P.text, margin: "20px 0 14px" }}>ระบบเช่า / หมดอายุ</h3>
      <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: "#92400E" }}>
        ⚠️ ถ้าตั้งวันหมดอายุ ระบบจะล็อกหน้าเว็บลูกค้าเมื่อถึงเวลา
      </div>
      {f("expired_at", "วันหมดอายุ (ปล่อยว่าง = ไม่มีกำหนด)", "datetime-local")}

      <button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        style={{ width: "100%", marginTop: 8, background: saved ? P.success : `linear-gradient(135deg, ${P.pink}, ${P.pinkDeep})`, color: "#fff", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "inherit" }}
      >
        {saveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : saved ? <><CheckCircle size={18} /> บันทึกแล้ว!</> : "บันทึกการตั้งค่า"}
      </button>
    </div>
  );
}
