/**
 * NailSuperAdminPage — ระบบควบคุมสำหรับเจ้าของระบบ (Developer / System Owner)
 * Route: /superadmin
 *
 * วิธีใช้:
 * 1. ตั้งค่า NAIL_SUPER_ADMIN_KEY ใน Render → Environment Variables
 * 2. เข้า /superadmin แล้วกรอก key เพื่อล็อกอิน
 * 3. อนุมัติ / ปฏิเสธคำขอต่ออายุ หรือตั้งวันหมดอายุตรงๆ ได้เลย
 */

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, CheckCircle, XCircle, Clock, Loader2, RefreshCw,
  Calendar, AlertTriangle, Crown, LogOut, Eye, EyeOff, ExternalLink,
  Tag, Activity, Database, Save, Store, Plus, Ban, PlayCircle, PlusCircle, MinusCircle,
  Copy, Key, Link, Trash2, Pencil, X,
} from "lucide-react";

// ── Design tokens (distinct dark-blue theme) ─────────────────────────────────
const S = {
  bg:       "#0F1117",
  surface:  "#1A1D27",
  card:     "#21263A",
  border:   "#2D3552",
  accent:   "#6C8EFF",
  accentDk: "#4F72FF",
  success:  "#22C55E",
  error:    "#EF4444",
  warning:  "#F59E0B",
  text:     "#E8EAF0",
  sub:      "#A0A8C0",
  muted:    "#6A7090",
} as const;

const LOCAL_KEY = "nail_superadmin_key";
const API = "/api/nail";

function saFetch(url: string, key: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: {
      "X-Super-Admin-Key": key,
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d?.detail ?? `HTTP ${r.status}`);
    return d;
  });
}

function statusBadge(status: string) {
  const map: Record<string, [string, string, string]> = {
    pending:  ["รอตรวจสอบ",    S.warning, "#2A2010"],
    approved: ["อนุมัติแล้ว",  S.success, "#0F2014"],
    rejected: ["ปฏิเสธ",       S.error,   "#200F0F"],
  };
  const [label, color, bg] = map[status] ?? [status, S.muted, S.surface];
  return (
    <span style={{ background: bg, color, borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function paymentChannelBadge(channel?: string) {
  const isAngpao = channel === "angpao";
  const label = isAngpao ? "🧧 อั่งเปา" : "🏦 สลิปธนาคาร";
  const color = isAngpao ? "#F59E0B" : S.accent;
  return (
    <span style={{ background: `${color}22`, color, borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("th-TH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (k: string) => void }) {
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const tryAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true); setErr("");
    try {
      await saFetch(`${API}/superadmin/status`, key);
      localStorage.setItem(LOCAL_KEY, key);
      onAuth(key);
    } catch (e: any) {
      setErr(e.message ?? "Key ไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: 36, width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: `${S.accent}22`, borderRadius: 12, padding: 10 }}>
            <Shield size={24} color={S.accent} />
          </div>
          <div>
            <h1 style={{ color: S.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Super Admin</h1>
            <p style={{ color: S.muted, fontSize: 13, margin: 0 }}>ระบบเจ้าของ — Nail Booking</p>
          </div>
        </div>
        <form onSubmit={tryAuth}>
          <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 6 }}>NAIL_SUPER_ADMIN_KEY</label>
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input
              type={show ? "text" : "password"}
              name="superadmin-key"
              autoComplete="current-password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="กรอก Super Admin Key"
              autoFocus
              style={{
                width: "100%", background: S.card, border: `1.5px solid ${err ? S.error : S.border}`,
                borderRadius: 10, padding: "12px 44px 12px 14px", fontSize: 14, color: S.text,
                fontFamily: "inherit", boxSizing: "border-box", outline: "none",
              }}
            />
            <button type="button" onClick={() => setShow(!show)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: S.muted, padding: 2 }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {err && <p style={{ color: S.error, fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button type="submit" disabled={!key || loading}
            style={{ width: "100%", background: loading || !key ? S.card : `linear-gradient(135deg, ${S.accent}, ${S.accentDk})`, color: S.text, border: "none", borderRadius: 10, padding: "13px", fontSize: 15, fontWeight: 700, cursor: !key || loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !key ? 0.5 : 1 }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />}
            {loading ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Slip Modal ────────────────────────────────────────────────────────────────
function SlipModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <img src={src} alt="slip" style={{ maxHeight: "90vh", maxWidth: "90vw", borderRadius: 12 }} onClick={e => e.stopPropagation()} />
    </div>
  );
}

// ── Approve Modal ─────────────────────────────────────────────────────────────
function ApproveModal({ item, sKey, onDone, onClose }: { item: any; sKey: string; onDone: () => void; onClose: () => void }) {
  const [months, setMonths] = useState<number>(item.duration_months);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const approve = async () => {
    setLoading(true); setErr("");
    try {
      await saFetch(`${API}/superadmin/renewals/${item.id}/approve`, sKey, {
        method: "POST", body: JSON.stringify({ duration_months_override: months }),
      });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
        style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 380 }}>
        <h3 style={{ color: S.text, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>อนุมัติคำขอ #{item.id}</h3>
        <p style={{ color: S.muted, fontSize: 13, marginBottom: 20 }}>ยืนยันการต่ออายุ จะขยาย expired_at โดยอัตโนมัติ</p>
        <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 6 }}>จำนวนเดือน</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[1, 3, 6, 12].map(m => (
            <button key={m} onClick={() => setMonths(m)}
              style={{ flex: 1, background: months === m ? S.accent : S.card, color: months === m ? "#fff" : S.sub, border: `1px solid ${months === m ? S.accent : S.border}`, borderRadius: 8, padding: "8px 4px", cursor: "pointer", fontFamily: "inherit", fontWeight: months === m ? 700 : 400, fontSize: 13 }}>
              {m} เดือน
            </button>
          ))}
        </div>
        {err && <p style={{ color: S.error, fontSize: 13, marginBottom: 10 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: "11px", cursor: "pointer", color: S.sub, fontFamily: "inherit" }}>ยกเลิก</button>
          <button onClick={approve} disabled={loading}
            style={{ flex: 2, background: `linear-gradient(135deg, ${S.success}, #16A34A)`, border: "none", borderRadius: 10, padding: "11px", cursor: loading ? "not-allowed" : "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            อนุมัติ {months} เดือน
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Payment Info Editor (ข้อมูลบัญชีรับเงินของ super-admin) ──────────────────
function PaymentInfoSection({ sKey }: { sKey: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["sa-payment-info"],
    queryFn: () => saFetch(`${API}/superadmin/payment-info`, sKey),
    staleTime: 60000,
  });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (data) {
      setVals({
        sa_bank_name: data.sa_bank_name ?? "",
        sa_bank_account_number: data.sa_bank_account_number ?? "",
        sa_bank_account_name: data.sa_bank_account_name ?? "",
        sa_truemoney_phone: data.sa_truemoney_phone ?? "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saFetch(`${API}/superadmin/payment-info`, sKey, {
        method: "PUT",
        body: JSON.stringify({
          sa_bank_name: vals.sa_bank_name || undefined,
          sa_bank_account_number: vals.sa_bank_account_number || undefined,
          sa_bank_account_name: vals.sa_bank_account_name || undefined,
          sa_truemoney_phone: vals.sa_truemoney_phone || undefined,
        }),
      }),
    onSuccess: () => { setMsg("✓ บันทึกข้อมูลแล้ว"); qc.invalidateQueries({ queryKey: ["sa-payment-info"] }); },
    onError: (e: any) => setMsg(`⚠ ${e.message}`),
  });

  const fields = [
    { key: "sa_bank_name",           label: "ชื่อธนาคาร",        placeholder: "ธนาคารกสิกรไทย" },
    { key: "sa_bank_account_number", label: "เลขบัญชี",           placeholder: "0001234567" },
    { key: "sa_bank_account_name",   label: "ชื่อบัญชี",          placeholder: "นาย ..." },
    { key: "sa_truemoney_phone",     label: "เบอร์ TrueMoney 🧧", placeholder: "0812345678" },
  ];

  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Save size={18} color={S.accent} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>ข้อมูลรับชำระเงิน (admin ของคุณจะเห็นข้อมูลนี้ตอนต่ออายุ)</span>
        {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
      </div>
      <p style={{ color: S.muted, fontSize: 12, marginBottom: 16 }}>admin จะเห็นบัญชีนี้เพื่อรู้ว่าต้องโอนเงินค่าเช่าระบบไปที่ไหน</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
        {fields.map(f => (
          <div key={f.key}>
            <label style={{ color: S.sub, fontSize: 12, display: "block", marginBottom: 4 }}>{f.label}</label>
            <input
              type="text"
              placeholder={f.placeholder}
              value={vals[f.key] ?? ""}
              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        ))}
      </div>
      {msg && <p style={{ color: msg.startsWith("✓") ? S.success : S.error, fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ background: `linear-gradient(135deg, ${S.accent}, ${S.accentDk})`, border: "none", borderRadius: 10, padding: "10px 18px", cursor: saveMutation.isPending ? "not-allowed" : "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        บันทึก
      </button>
    </div>
  );
}

// ── Pricing Editor ────────────────────────────────────────────────────────────
function PricingSection({ sKey, shopId }: { sKey: string; shopId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["sa-pricing", shopId],
    queryFn: () => saFetch(`${API}/superadmin/pricing?shop_id=${shopId}`, sKey),
    staleTime: 15000,
  });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (data) {
      setVals({
        price_1m: data.custom.price_1m?.toString() ?? "",
        price_3m: data.custom.price_3m?.toString() ?? "",
        price_6m: data.custom.price_6m?.toString() ?? "",
        price_12m: data.custom.price_12m?.toString() ?? "",
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saFetch(`${API}/superadmin/pricing?shop_id=${shopId}`, sKey, {
        method: "PUT",
        body: JSON.stringify({
          price_1m: vals.price_1m ? Number(vals.price_1m) : null,
          price_3m: vals.price_3m ? Number(vals.price_3m) : null,
          price_6m: vals.price_6m ? Number(vals.price_6m) : null,
          price_12m: vals.price_12m ? Number(vals.price_12m) : null,
        }),
      }),
    onSuccess: () => { setMsg("✓ บันทึกราคาแล้ว"); qc.invalidateQueries({ queryKey: ["sa-pricing", shopId] }); },
    onError: (e: any) => setMsg(`⚠ ${e.message}`),
  });

  const plans = [
    { key: "price_1m", months: 1, def: data?.default?.["1"] },
    { key: "price_3m", months: 3, def: data?.default?.["3"] },
    { key: "price_6m", months: 6, def: data?.default?.["6"] },
    { key: "price_12m", months: 12, def: data?.default?.["12"] },
  ];

  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Tag size={18} color={S.accent} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>ราคาค่าเช่าระบบ (เฉพาะร้านนี้)</span>
        {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
      </div>
      <p style={{ color: S.muted, fontSize: 12, marginBottom: 16 }}>เว้นว่างไว้ = ใช้ราคากลาง</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        {plans.map(p => (
          <div key={p.key}>
            <label style={{ color: S.sub, fontSize: 12, display: "block", marginBottom: 4 }}>
              {p.months} เดือน <span style={{ color: S.muted }}>(กลาง ฿{p.def?.toLocaleString?.() ?? "-"})</span>
            </label>
            <input
              type="number" min={0} placeholder={p.def?.toString()}
              value={vals[p.key] ?? ""}
              onChange={e => setVals(v => ({ ...v, [p.key]: e.target.value }))}
              style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
            />
          </div>
        ))}
      </div>
      {msg && <p style={{ color: msg.startsWith("✓") ? S.success : S.error, fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ background: S.accent, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", color: "#fff", fontWeight: 600, fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} บันทึกราคา
      </button>
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function MiniBarChart({ data, color, label }: { data: { date: string; count: number }[]; color: string; label: string }) {
  const max = Math.max(1, ...data.map(d => d.count));
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: S.sub, fontSize: 12, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 52 }}>
        {data.map(d => (
          <div key={d.date} title={`${d.date}: ${d.count.toLocaleString()}`}
            style={{ flex: 1, background: color, borderRadius: "3px 3px 0 0", minHeight: 3, height: `${Math.max(3, (d.count / max) * 52)}px`, opacity: 0.85 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ color: S.muted, fontSize: 10 }}>{data[0]?.date?.slice(5) ?? ""}</span>
        <span style={{ color: S.muted, fontSize: 10 }}>{data[data.length - 1]?.date?.slice(5) ?? ""}</span>
      </div>
    </div>
  );
}

// ── Usage / Monitoring ────────────────────────────────────────────────────────
function UsageSection({ sKey }: { sKey: string }) {
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["sa-usage"],
    queryFn: () => saFetch(`${API}/superadmin/usage`, sKey),
    staleTime: 30000,
  });

  const bookingTrend: any[] = data?.booking_trend_14d ?? [];
  const apiTrend: any[] = data?.api_trend_14d ?? [];

  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Activity size={18} color={S.accent} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>การใช้งานระบบ / โหลด</span>
        {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
        <button onClick={() => refetch()} title="รีเฟรช"
          style={{ background: "none", border: `1px solid ${S.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: S.muted }}>
          <RefreshCw size={13} />
        </button>
      </div>
      {data && (
        <>
          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Database size={12} /> ขนาดฐานข้อมูล
              </div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{data.db_size_mb} <span style={{ fontSize: 12, fontWeight: 400, color: S.muted }}>MB</span></div>
            </div>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>API requests รวม</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {(data.total_api_calls ?? 0).toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 400, color: S.muted }}> ครั้ง</span>
              </div>
            </div>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>การจองทั้งหมด</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{data.total_bookings.toLocaleString()}</div>
            </div>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>ลูกค้าทั้งหมด</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{data.total_customers.toLocaleString()}</div>
            </div>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>จอง 30 วันล่าสุด</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{data.bookings_last_30d.toLocaleString()}</div>
            </div>
            <div style={{ background: S.card, borderRadius: 12, padding: 14 }}>
              <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>Transactions รวม</div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{(data.total_transactions ?? 0).toLocaleString()}</div>
            </div>
          </div>

          {/* Traffic chart — API requests */}
          {apiTrend.length > 0 && (
            <MiniBarChart data={apiTrend} color={S.accent} label="ทราฟฟิก 14 วัน (API requests/วัน)" />
          )}

          {/* Booking chart */}
          {bookingTrend.length > 0 && (
            <MiniBarChart data={bookingTrend} color={S.success} label="การจองใหม่ 14 วัน" />
          )}

          <p style={{ color: S.muted, fontSize: 11, marginTop: 4 }}>{data.note}</p>
        </>
      )}
    </div>
  );
}

// ── Shops Management ─────────────────────────────────────────────────────────
// ── Delete Shop Modal ─────────────────────────────────────────────────────────
function DeleteShopModal({ shop, sKey, onDone, onClose }: { shop: any; sKey: string; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<"confirm" | "otp">("confirm");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [msg, setMsg] = useState("");
  const [telegramSent, setTelegramSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestOtp = async () => {
    if (confirmSlug.trim() !== shop.slug) { setMsg("slug ไม่ตรง"); return; }
    setLoading(true); setMsg("");
    try {
      const d = await saFetch(`${API}/superadmin/shops/${shop.id}/delete-otp`, sKey, { method: "POST" });
      setTelegramSent(d.telegram_sent ?? false);
      setStep("otp");
    } catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  const confirmDelete = async () => {
    setLoading(true); setMsg("");
    try {
      await saFetch(`${API}/superadmin/shops/${shop.id}`, sKey, {
        method: "DELETE",
        body: JSON.stringify({ otp_code: otpCode.trim(), confirm_slug: confirmSlug.trim() }),
      });
      onDone();
    } catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: S.surface, border: `1.5px solid ${S.error}66`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Trash2 size={18} color={S.error} />
          <span style={{ fontWeight: 700, fontSize: 16, color: S.error, flex: 1 }}>ลบร้าน — {shop.name}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: S.muted }}><X size={18} /></button>
        </div>

        {step === "confirm" && (
          <>
            <div style={{ background: `${S.error}18`, border: `1px solid ${S.error}44`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <p style={{ color: S.error, fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                ⚠️ การลบร้านจะ<strong>ลบข้อมูลทั้งหมดถาวร</strong>รวมถึงการจอง บริการ พนักงาน และสถิติทั้งหมด ไม่สามารถกู้คืนได้
              </p>
            </div>
            <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 6 }}>
              พิมพ์ slug ร้าน <strong style={{ color: S.text }}>{shop.slug}</strong> เพื่อยืนยัน
            </label>
            <input value={confirmSlug} onChange={e => { setConfirmSlug(e.target.value); setMsg(""); }}
              placeholder={shop.slug} autoFocus
              style={{ width: "100%", background: S.card, border: `1.5px solid ${confirmSlug === shop.slug ? S.error : S.border}`, borderRadius: 8, padding: "10px 12px", color: S.text, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", marginBottom: 12 }} />
            {msg && <p style={{ color: S.error, fontSize: 13, marginBottom: 8 }}>{msg}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px", cursor: "pointer", color: S.sub, fontFamily: "inherit", fontSize: 13 }}>ยกเลิก</button>
              <button onClick={requestOtp} disabled={confirmSlug !== shop.slug || loading}
                style={{ flex: 1, background: confirmSlug === shop.slug ? S.error : S.card, border: "none", borderRadius: 8, padding: "10px", cursor: confirmSlug === shop.slug ? "pointer" : "not-allowed", color: confirmSlug === shop.slug ? "#fff" : S.muted, fontFamily: "inherit", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : null} ขอ OTP
              </button>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div style={{ background: S.card, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              {telegramSent
                ? <p style={{ color: S.success, fontSize: 13, margin: 0 }}>✅ ส่ง OTP ไปที่ <strong>Telegram Group</strong> แล้ว — ตรวจสอบได้เลย</p>
                : <p style={{ color: S.warning, fontSize: 13, margin: 0 }}>⚠️ ยังไม่ได้ตั้งค่า BOT_TOKEN / ADMIN_GROUP_ID — ดู OTP ได้จาก Render server logs</p>
              }
            </div>
            <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 6 }}>กรอก OTP 6 หลัก</label>
            <input value={otpCode} onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setMsg(""); }}
              placeholder="000000" maxLength={6} autoFocus inputMode="numeric"
              style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 12px", color: S.text, fontFamily: "'Courier New', monospace", fontSize: 20, letterSpacing: 6, textAlign: "center", boxSizing: "border-box", marginBottom: 12 }} />
            {msg && <p style={{ color: S.error, fontSize: 13, marginBottom: 8 }}>{msg}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setStep("confirm"); setOtpCode(""); setMsg(""); }} style={{ flex: 1, background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px", cursor: "pointer", color: S.sub, fontFamily: "inherit", fontSize: 13 }}>ย้อนกลับ</button>
              <button onClick={confirmDelete} disabled={otpCode.length !== 6 || loading}
                style={{ flex: 2, background: otpCode.length === 6 ? S.error : S.card, border: "none", borderRadius: 8, padding: "10px", cursor: otpCode.length === 6 ? "pointer" : "not-allowed", color: otpCode.length === 6 ? "#fff" : S.muted, fontFamily: "inherit", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ยืนยันลบร้านถาวร
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function ShopsSection({ sKey, selectedShopId, onSelectShop }: { sKey: string; selectedShopId: number; onSelectShop: (id: number) => void }) {
  const qc = useQueryClient();
  const { data: shops = [], isLoading } = useQuery<any[]>({
    queryKey: ["sa-shops"],
    queryFn: () => saFetch(`${API}/superadmin/shops`, sKey),
    staleTime: 15000,
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState("30");
  const [err, setErr] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteShop, setDeleteShop] = useState<any | null>(null);

  const copyLink = (e: React.MouseEvent, slug: string, id: number, isAdmin = false) => {
    e.stopPropagation();
    const path = isAdmin ? `/r/${slug}/admin` : `/r/${slug}`;
    const url = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id + (isAdmin ? 100000 : 0));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      saFetch(`${API}/superadmin/shops`, sKey, {
        method: "POST",
        body: JSON.stringify({ slug: newSlug.trim(), name: newName.trim(), expiry_days: newDays ? Number(newDays) : null }),
      }),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["sa-shops"] });
      setShowCreate(false); setNewSlug(""); setNewName(""); setNewDays("30"); setErr("");
      onSelectShop(d.id);
    },
    onError: (e: any) => setErr(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      saFetch(`${API}/superadmin/shops/${id}/active`, sKey, { method: "PUT", body: JSON.stringify({ is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sa-shops"] }),
  });

  const adjustDaysMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      saFetch(`${API}/superadmin/shops/${id}/expiry-days`, sKey, { method: "PUT", body: JSON.stringify({ days }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sa-shops"] }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      saFetch(`${API}/superadmin/shops/${id}/name`, sKey, { method: "PUT", body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sa-shops"] }); setEditingId(null); },
  });

  const inputStyle: React.CSSProperties = {
    background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8,
    padding: "7px 10px", color: S.text, fontFamily: "inherit", fontSize: 13,
  };

  return (
    <>
      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteShop && (
          <DeleteShopModal
            shop={deleteShop}
            sKey={sKey}
            onClose={() => setDeleteShop(null)}
            onDone={() => {
              qc.invalidateQueries({ queryKey: ["sa-shops"] });
              setDeleteShop(null);
              if (selectedShopId === deleteShop.id) onSelectShop(1);
            }}
          />
        )}
      </AnimatePresence>

      <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Store size={18} color={S.accent} />
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>ร้านทั้งหมด ({shops.length})</span>
          {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
          <button onClick={() => setShowCreate(v => !v)}
            style={{ background: S.accent, border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#fff", fontWeight: 600, fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <Plus size={13} /> สร้างร้านใหม่
          </button>
        </div>

        {showCreate && (
          <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ color: S.sub, fontSize: 12, display: "block", marginBottom: 4 }}>Slug (สำหรับ URL)</label>
                <input value={newSlug} onChange={e => setNewSlug(e.target.value)} placeholder="my-nail-shop"
                  style={{ width: "100%", ...inputStyle, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ color: S.sub, fontSize: 12, display: "block", marginBottom: 4 }}>ชื่อร้าน</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="ร้านทำเล็บ ABC"
                  style={{ width: "100%", ...inputStyle, boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: S.sub, fontSize: 12, display: "block", marginBottom: 4 }}>อายุการเช่าเริ่มต้น (วัน, เว้นว่าง = ไม่มีกำหนด)</label>
              <input value={newDays} onChange={e => setNewDays(e.target.value)} type="number" min={0}
                style={{ width: "100%", ...inputStyle, boxSizing: "border-box" }} />
            </div>
            {err && <p style={{ color: S.error, fontSize: 13, marginBottom: 8 }}>{err}</p>}
            <button onClick={() => createMutation.mutate()} disabled={!newSlug.trim() || !newName.trim() || createMutation.isPending}
              style={{ background: S.success, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} สร้างร้าน
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shops.map((sh: any) => (
            <div key={sh.id}
              onClick={() => editingId !== sh.id && onSelectShop(sh.id)}
              style={{
                background: selectedShopId === sh.id ? `${S.accent}18` : S.card,
                border: `1.5px solid ${selectedShopId === sh.id ? S.accent : S.border}`,
                borderRadius: 12, padding: 14, cursor: editingId === sh.id ? "default" : "pointer",
              }}>
              {/* Name row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                {editingId === sh.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      onClick={e => e.stopPropagation()} autoFocus
                      style={{ flex: 1, ...inputStyle }} />
                    <button onClick={e => { e.stopPropagation(); renameMutation.mutate({ id: sh.id, name: editName }); }}
                      disabled={!editName.trim() || renameMutation.isPending}
                      style={{ background: S.success, border: "none", borderRadius: 6, padding: "6px 10px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      {renameMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} บันทึก
                    </button>
                    <button onClick={e => { e.stopPropagation(); setEditingId(null); }}
                      style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: S.muted }}>
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{sh.name}</span>
                      <span style={{ color: S.muted, fontSize: 12, fontWeight: 400, marginLeft: 6 }}>/{sh.slug}</span>
                    </div>
                    <div style={{ color: sh.is_expired ? S.error : S.muted, fontSize: 12 }}>
                      {sh.is_active ? "" : "🚫 "}
                      {sh.expired_at ? (sh.is_expired ? "หมดอายุ" : `${sh.days_left}วัน`) : "∞"}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              {editingId !== sh.id && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                  <button onClick={e => copyLink(e, sh.slug, sh.id)} title="ลิงก์ร้าน"
                    style={{ background: copiedId === sh.id ? `${S.success}22` : S.surface, border: `1px solid ${copiedId === sh.id ? S.success : S.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: copiedId === sh.id ? S.success : S.accent, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <Copy size={12} /> {copiedId === sh.id ? "✓" : "ร้าน"}
                  </button>
                  <button onClick={e => copyLink(e, sh.slug, sh.id, true)} title="ลิงก์แอดมิน"
                    style={{ background: copiedId === sh.id + 100000 ? `${S.success}22` : S.surface, border: `1px solid ${copiedId === sh.id + 100000 ? S.success : S.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: copiedId === sh.id + 100000 ? S.success : S.muted, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <Key size={12} /> {copiedId === sh.id + 100000 ? "✓" : "Admin"}
                  </button>
                  <button onClick={() => adjustDaysMutation.mutate({ id: sh.id, days: 30 })} title="+30วัน"
                    style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: S.success, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <PlusCircle size={12} /> 30วัน
                  </button>
                  <button onClick={() => adjustDaysMutation.mutate({ id: sh.id, days: -30 })} title="-30วัน"
                    style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: S.warning, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <MinusCircle size={12} /> 30วัน
                  </button>
                  <button onClick={() => toggleActiveMutation.mutate({ id: sh.id, is_active: !sh.is_active })}
                    style={{ background: sh.is_active ? `${S.error}22` : `${S.success}22`, border: `1px solid ${sh.is_active ? S.error : S.success}55`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: sh.is_active ? S.error : S.success, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    {sh.is_active ? <Ban size={12} /> : <PlayCircle size={12} />} {sh.is_active ? "ระงับ" : "เปิด"}
                  </button>
                  {/* Rename */}
                  <button onClick={() => { setEditingId(sh.id); setEditName(sh.name); }}
                    style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: S.sub, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                    <Pencil size={12} /> แก้ชื่อ
                  </button>
                  {/* Delete — ไม่ให้ลบร้านหลัก */}
                  {sh.id !== 1 && (
                    <button onClick={() => setDeleteShop(sh)}
                      style={{ background: `${S.error}18`, border: `1px solid ${S.error}44`, borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: S.error, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <Trash2 size={12} /> ลบ
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Traffic Stats Section ─────────────────────────────────────────────────────
function TrafficSection({ sKey }: { sKey: string }) {
  const [days, setDays] = useState(30);
  const [filterShopId, setFilterShopId] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["sa-traffic", days],
    queryFn: () => saFetch(`${API}/superadmin/traffic?days=${days}`, sKey),
    staleTime: 120_000,
    retry: 1,
  });

  const allShops: any[] = data?.shops ?? [];
  const shops = filterShopId === null ? allShops : allShops.filter(s => s.shop_id === filterShopId);

  const grandTotal = allShops.reduce((sum: number, s: any) => sum + (s.total_requests || 0), 0);

  // รวม daily data ของทุกร้านสำหรับ aggregate chart
  const aggregateDaily: Record<string, number> = {};
  allShops.forEach((sh: any) => {
    (sh.daily ?? []).forEach((d: any) => {
      aggregateDaily[d.date] = (aggregateDaily[d.date] ?? 0) + d.count;
    });
  });
  const aggregateDailyArr = Object.entries(aggregateDaily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
    .slice(-14);
  const aggMax = Math.max(1, ...aggregateDailyArr.map(d => d.count));

  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Activity size={18} color={S.accent} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>แดชบอร์ดทราฟฟิก</span>
        {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
        <button onClick={() => refetch()} title="รีเฟรช"
          style={{ background: "none", border: `1px solid ${S.border}`, borderRadius: 6, padding: "4px 6px", cursor: "pointer", color: S.muted }}>
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[7, 14, 30, 60, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            style={{ background: days === d ? S.accent : S.card, color: days === d ? "#fff" : S.sub, border: `1px solid ${days === d ? S.accent : S.border}`, borderRadius: 100, padding: "4px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
            {d} วัน
          </button>
        ))}
      </div>

      {/* Shop filter tabs */}
      {allShops.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <button onClick={() => setFilterShopId(null)}
            style={{ background: filterShopId === null ? `${S.accent}22` : S.card, color: filterShopId === null ? S.accent : S.sub, border: `1px solid ${filterShopId === null ? S.accent : S.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: filterShopId === null ? 700 : 400 }}>
            ทุกร้าน
          </button>
          {allShops.map((sh: any) => (
            <button key={sh.shop_id} onClick={() => setFilterShopId(sh.shop_id)}
              style={{ background: filterShopId === sh.shop_id ? `${S.accent}22` : S.card, color: filterShopId === sh.shop_id ? S.accent : S.sub, border: `1px solid ${filterShopId === sh.shop_id ? S.accent : S.border}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: filterShopId === sh.shop_id ? 700 : 400 }}>
              {sh.shop_name}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Loader2 size={20} color={S.muted} className="animate-spin" /></div>
      ) : allShops.length === 0 ? (
        <p style={{ color: S.muted, fontSize: 13, textAlign: "center" }}>ยังไม่มีข้อมูลทราฟฟิก</p>
      ) : (
        <>
          {/* Aggregate summary (แสดงเฉพาะตอนดูทุกร้าน) */}
          {filterShopId === null && allShops.length > 1 && (
            <div style={{ background: S.card, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: S.text }}>รวมทุกร้าน</div>
                  <div style={{ color: S.muted, fontSize: 12 }}>{allShops.length} ร้าน</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 20, color: S.accent }}>{grandTotal.toLocaleString()}</div>
                  <div style={{ color: S.muted, fontSize: 11 }}>requests รวม {days} วัน</div>
                </div>
              </div>
              {/* Aggregate bar chart — daily data มาจาก backend 14 วันล่าสุดเสมอ (ไม่ขึ้นกับ period selector) */}
              {aggregateDailyArr.length > 0 && (
                <>
                  <div style={{ color: S.muted, fontSize: 11, marginBottom: 4 }}>14 วันล่าสุด (รวมทุกร้าน)</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40, marginBottom: 4 }}>
                    {aggregateDailyArr.map(d => (
                      <div key={d.date} title={`${d.date}: ${d.count.toLocaleString()}`}
                        style={{ flex: 1, background: S.accent, borderRadius: "2px 2px 0 0", minWidth: 3, height: `${Math.max(3, (d.count / aggMax) * 40)}px`, opacity: 0.8 }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: S.muted, fontSize: 10 }}>{aggregateDailyArr[0]?.date?.slice(5)}</span>
                    <span style={{ color: S.muted, fontSize: 10 }}>{aggregateDailyArr[aggregateDailyArr.length - 1]?.date?.slice(5)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Per-shop rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {shops.map((sh: any) => {
              const daily14 = (sh.daily ?? []).slice(-14);
              const maxCount = Math.max(1, ...daily14.map((d: any) => d.count));
              return (
                <div key={sh.shop_id} style={{ background: S.card, borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: S.text }}>{sh.shop_name}</div>
                      {sh.slug && <div style={{ color: S.muted, fontSize: 12 }}>/r/{sh.slug}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: S.accent }}>{sh.total_requests.toLocaleString()}</div>
                      <div style={{ color: S.muted, fontSize: 11 }}>{sh.active_days} วันที่มีคำขอ · peak {sh.peak_day}</div>
                    </div>
                  </div>
                  {daily14.length > 0 && (
                    <>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32, marginBottom: 4 }}>
                        {daily14.map((d: any) => (
                          <div key={d.date} title={`${d.date}: ${d.count.toLocaleString()}`}
                            style={{
                              flex: 1,
                              background: `${S.accent}${Math.max(40, Math.round((d.count / maxCount) * 255)).toString(16).padStart(2, "0")}`,
                              borderRadius: "2px 2px 0 0",
                              height: `${Math.max(3, Math.round((d.count / maxCount) * 32))}px`,
                              minWidth: 3,
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: S.muted, fontSize: 10 }}>{daily14[0]?.date?.slice(5)}</span>
                        <span style={{ color: S.muted, fontSize: 10 }}>{daily14[daily14.length - 1]?.date?.slice(5)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Shop API Keys Section ─────────────────────────────────────────────────────
function ShopKeysSection({ sKey, shopId, shops, onSelectShop }: { sKey: string; shopId: number; shops: any[]; onSelectShop: (id: number) => void }) {
  const qc = useQueryClient();
  const [adminGroupId, setAdminGroupId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botTokenChanged, setBotTokenChanged] = useState(false);
  const [slip2goKey, setSlip2goKey] = useState("");
  const [slip2goChanged, setSlip2goChanged] = useState(false);
  const [slipMode, setSlipMode] = useState("off");
  const [newPasscode, setNewPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [showSlip2go, setShowSlip2go] = useState(false);
  const [msg, setMsg] = useState("");
  const [passcodeMsg, setPasscodeMsg] = useState("");

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["sa-shop-keys", shopId],
    queryFn: () => saFetch(`${API}/superadmin/shops/${shopId}/api-keys`, sKey),
    staleTime: 30000,
    enabled: !!shopId,
  });

  useEffect(() => {
    if (data) {
      setAdminGroupId(data.admin_group_id ?? "");
      setSlipMode(data.slip_verify_mode ?? "off");
      setBotToken(""); setBotTokenChanged(false);
      setSlip2goKey(""); setSlip2goChanged(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: any = {
        admin_group_id: adminGroupId,
        slip_verify_mode: slipMode,
      };
      if (botTokenChanged) payload.telegram_bot_token = botToken;
      if (slip2goChanged) payload.slip2go_api_key = slip2goKey;
      return saFetch(`${API}/superadmin/shops/${shopId}/api-keys`, sKey, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: () => { setMsg("✓ บันทึก API keys แล้ว"); refetch(); },
    onError: (e: any) => setMsg(`⚠ ${e.message}`),
  });

  const passcodeMutation = useMutation({
    mutationFn: () =>
      saFetch(`${API}/superadmin/shops/${shopId}/passcode`, sKey, {
        method: "PUT", body: JSON.stringify({ new_passcode: newPasscode }),
      }),
    onSuccess: () => { setPasscodeMsg("✓ ตั้งรหัสผ่านแล้ว"); setNewPasscode(""); refetch(); qc.invalidateQueries({ queryKey: ["sa-shops"] }); },
    onError: (e: any) => setPasscodeMsg(`⚠ ${e.message}`),
  });

  const FieldRow = ({ label, hasValue, masked, showState, setShowState, value, setValue, onChange, placeholder }: any) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <label style={{ color: S.sub, fontSize: 13 }}>{label}</label>
        {hasValue && <span style={{ fontSize: 11, color: S.success, background: `${S.success}22`, borderRadius: 100, padding: "2px 8px" }}>✓ ตั้งค่าแล้ว</span>}
      </div>
      <div style={{ position: "relative" }}>
        <input
          type={showState ? "text" : "password"}
          value={value}
          onChange={e => { setValue(e.target.value); onChange && onChange(); }}
          placeholder={hasValue ? (masked || "••••••••") : placeholder}
          style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 44px 9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
        />
        <button type="button" onClick={() => setShowState(!showState)}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: S.muted, padding: 2 }}>
          {showState ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );

  const currentShop = shops.find((s: any) => s.id === shopId);

  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: shops.length > 1 ? 12 : 16 }}>
        <Key size={18} color={S.accent} />
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>
          API Keys & การเข้าถึง
          {currentShop && <span style={{ color: S.accent, fontWeight: 600 }}> — {currentShop.name}</span>}
        </span>
        {isLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
      </div>

      {/* Quick shop switcher — แสดงเฉพาะเมื่อมีมากกว่า 1 ร้าน */}
      {shops.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {shops.map((sh: any) => (
            <button key={sh.id} onClick={() => onSelectShop(sh.id)}
              style={{
                background: sh.id === shopId ? `${S.accent}22` : S.card,
                color: sh.id === shopId ? S.accent : S.sub,
                border: `1px solid ${sh.id === shopId ? S.accent : S.border}`,
                borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, fontWeight: sh.id === shopId ? 700 : 400,
              }}>
              {sh.name}
            </button>
          ))}
        </div>
      )}

      {/* Telegram Bot */}
      <h4 style={{ color: S.sub, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, borderBottom: `1px solid ${S.border}`, paddingBottom: 6 }}>Telegram Bot (OTP)</h4>
      <FieldRow
        label="Telegram Bot Token"
        hasValue={data?.has_telegram_bot_token}
        masked={data?.telegram_bot_token_masked}
        showState={showBotToken} setShowState={setShowBotToken}
        value={botToken} setValue={setBotToken}
        onChange={() => setBotTokenChanged(true)}
        placeholder="1234567890:AABBccddeeff..."
      />
      <div style={{ marginBottom: 14 }}>
        <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 5 }}>
          Admin Group ID <span style={{ fontSize: 11, color: S.muted }}>(-1001234567 หรือ -1001234567_3 สำหรับ thread)</span>
        </label>
        <input
          type="text"
          value={adminGroupId}
          onChange={e => setAdminGroupId(e.target.value)}
          placeholder="-1001234567"
          style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
        />
      </div>

      {/* Slip2Go */}
      <h4 style={{ color: S.sub, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginTop: 18 }}>Slip2Go (ตรวจสลิปอัตโนมัติ)</h4>
      <FieldRow
        label="Slip2Go API Key (ไม่บังคับ)"
        hasValue={data?.has_slip2go_api_key}
        masked={data?.slip2go_api_key_masked}
        showState={showSlip2go} setShowState={setShowSlip2go}
        value={slip2goKey} setValue={setSlip2goKey}
        onChange={() => setSlip2goChanged(true)}
        placeholder="sk-xxxxxxxxxxxx"
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>ตรวจสลิปอัตโนมัติ</div>
          <div style={{ fontSize: 11, color: S.muted }}>ต้องตั้ง Slip2Go API Key ก่อน</div>
        </div>
        <button onClick={() => setSlipMode(slipMode === "auto" ? "off" : "auto")}
          style={{ width: 44, height: 24, borderRadius: 100, border: "none", cursor: "pointer", background: slipMode === "auto" ? S.success : S.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
          <div style={{ position: "absolute", top: 3, left: slipMode === "auto" ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </button>
      </div>

      {msg && <p style={{ color: msg.startsWith("✓") ? S.success : S.error, fontSize: 13, marginBottom: 10 }}>{msg}</p>}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        style={{ width: "100%", background: saveMutation.isPending ? S.card : `linear-gradient(135deg, ${S.accent}, ${S.accentDk})`, border: "none", borderRadius: 10, padding: "12px", cursor: saveMutation.isPending ? "not-allowed" : "pointer", color: "#fff", fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 }}>
        {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} บันทึก API Keys
      </button>

      {/* Admin Passcode */}
      <h4 style={{ color: S.sub, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, borderBottom: `1px solid ${S.border}`, paddingBottom: 6 }}>
        รหัสผ่าน Admin (/r/&lbrace;slug&rbrace;/admin) {data?.has_admin_passcode && <span style={{ color: S.success, fontSize: 11, fontWeight: 400 }}>✓ ตั้งค่าแล้ว</span>}
      </h4>
      <div style={{ position: "relative", marginBottom: 10 }}>
        <input
          type={showPasscode ? "text" : "password"}
          value={newPasscode}
          onChange={e => setNewPasscode(e.target.value)}
          placeholder="กรอกรหัสผ่านใหม่ (ต้องมีอย่างน้อย 4 ตัว)"
          style={{ width: "100%", background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 44px 9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13, boxSizing: "border-box" }}
        />
        <button type="button" onClick={() => setShowPasscode(!showPasscode)}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: S.muted, padding: 2 }}>
          {showPasscode ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {passcodeMsg && <p style={{ color: passcodeMsg.startsWith("✓") ? S.success : S.error, fontSize: 13, marginBottom: 8 }}>{passcodeMsg}</p>}
      <button onClick={() => passcodeMutation.mutate()} disabled={!newPasscode.trim() || passcodeMutation.isPending}
        style={{ width: "100%", background: !newPasscode.trim() ? S.card : `linear-gradient(135deg, ${S.warning}, #D97706)`, border: "none", borderRadius: 10, padding: "11px", cursor: !newPasscode.trim() || passcodeMutation.isPending ? "not-allowed" : "pointer", color: newPasscode.trim() ? "#fff" : S.muted, fontWeight: 700, fontFamily: "inherit", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !newPasscode.trim() ? 0.5 : 1 }}>
        {passcodeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />} ตั้งรหัสผ่านใหม่
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function NailSuperAdminPage() {
  const [sKey, setSKey] = useState<string | null>(() => localStorage.getItem(LOCAL_KEY));
  const [slipSrc, setSlipSrc] = useState<string | null>(null);
  const [approveItem, setApproveItem] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState<"" | "pending" | "approved" | "rejected">("");

  // Direct expiry override
  const [newExpiry, setNewExpiry] = useState("");
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryMsg, setExpiryMsg] = useState("");

  // ร้านที่กำลังเลือกจัดการ (multi-shop) — ค่าเริ่มต้น 1 = ร้านหลัก
  const [selectedShopId, setSelectedShopId] = useState<number>(1);

  const qc = useQueryClient();

  // รายชื่อร้านทั้งหมด — ใช้ส่งไปยัง ShopKeysSection เพื่อ quick-switch
  const { data: allShops = [] } = useQuery<any[]>({
    queryKey: ["sa-shops"],
    queryFn: () => saFetch(`${API}/superadmin/shops`, sKey!),
    enabled: !!sKey,
    staleTime: 15000,
  });

  const { data: shopStatus, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } = useQuery({
    queryKey: ["sa-status", selectedShopId],
    queryFn: () => saFetch(`${API}/superadmin/status?shop_id=${selectedShopId}`, sKey!),
    enabled: !!sKey,
    retry: 1,
    staleTime: 30000,
  });

  const { data: renewals = [], isLoading: renewalsLoading, refetch: refetchRenewals } = useQuery<any[]>({
    queryKey: ["sa-renewals", filterStatus, selectedShopId],
    queryFn: () => saFetch(`${API}/superadmin/renewals?shop_id=${selectedShopId}${filterStatus ? `&status=${filterStatus}` : ""}`, sKey!),
    enabled: !!sKey,
    staleTime: 15000,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      saFetch(`${API}/superadmin/renewals/${id}/reject`, sKey!, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sa-renewals"] }); qc.invalidateQueries({ queryKey: ["sa-status"] }); qc.invalidateQueries({ queryKey: ["sa-shops"] }); },
  });

  useEffect(() => {
    if (shopStatus?.expired_at) {
      const d = new Date(shopStatus.expired_at);
      setNewExpiry(d.toISOString().slice(0, 16));
    }
  }, [shopStatus?.expired_at]);

  const setExpiry = async () => {
    setExpiryLoading(true); setExpiryMsg("");
    try {
      await saFetch(`${API}/superadmin/set-expiry?shop_id=${selectedShopId}`, sKey!, { method: "PUT", body: JSON.stringify({ expired_at: newExpiry || null }) });
      setExpiryMsg("✓ บันทึกแล้ว");
      refetchStatus();
      qc.invalidateQueries({ queryKey: ["sa-shops"] });
    } catch (e: any) { setExpiryMsg(`⚠ ${e.message}`); }
    finally { setExpiryLoading(false); }
  };

  const clearExpiry = async () => {
    if (!confirm("ยืนยันลบวันหมดอายุ? ร้านจะเปิดไม่มีกำหนด")) return;
    setExpiryLoading(true);
    try {
      await saFetch(`${API}/superadmin/set-expiry?shop_id=${selectedShopId}`, sKey!, { method: "PUT", body: JSON.stringify({ expired_at: null }) });
      setNewExpiry(""); setExpiryMsg("✓ ลบวันหมดอายุแล้ว");
      refetchStatus();
      qc.invalidateQueries({ queryKey: ["sa-shops"] });
    } catch (e: any) { setExpiryMsg(`⚠ ${e.message}`); }
    finally { setExpiryLoading(false); }
  };

  if (!sKey) return <AuthScreen onAuth={k => setSKey(k)} />;

  // Handle auth error (key revoked or changed)
  if (statusError) {
    return (
      <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: S.text }}>
        <AlertTriangle size={48} color={S.error} />
        <p style={{ fontSize: 16 }}>Key ไม่ถูกต้องหรือหมดอายุ</p>
        <button onClick={() => { localStorage.removeItem(LOCAL_KEY); setSKey(null); }}
          style={{ background: S.accent, border: "none", borderRadius: 10, padding: "10px 24px", color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          ล็อกอินใหม่
        </button>
      </div>
    );
  }

  const pendingCount = (renewals as any[]).filter(r => r.status === "pending").length;

  return (
    <div style={{ minHeight: "100vh", background: S.bg, fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif", color: S.text }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ background: `${S.accent}22`, borderRadius: 10, padding: 8 }}>
          <Shield size={20} color={S.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Super Admin</div>
          <div style={{ color: S.muted, fontSize: 12 }}>Nail Booking System</div>
        </div>
        {pendingCount > 0 && (
          <span style={{ background: S.warning, color: "#000", borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
            {pendingCount} รอดำเนินการ
          </span>
        )}
        <button onClick={() => { if (confirm("ออกจากระบบ?")) { localStorage.removeItem(LOCAL_KEY); setSKey(null); } }}
          style={{ background: "none", border: `1px solid ${S.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: S.muted }}>
          <LogOut size={16} />
        </button>
        <button onClick={() => { refetchStatus(); refetchRenewals(); }}
          style={{ background: "none", border: `1px solid ${S.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", color: S.muted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px" }}>
        {/* Shops management + selector */}
        <ShopsSection sKey={sKey} selectedShopId={selectedShopId} onSelectShop={setSelectedShopId} />

        {/* Shop Status Card */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Crown size={18} color={S.accent} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>สถานะร้าน #{selectedShopId}</span>
            {statusLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
          </div>
          {shopStatus && (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 120, background: S.card, borderRadius: 12, padding: 14 }}>
                  <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>ชื่อร้าน</div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{shopStatus.shop_name}</div>
                </div>
                <div style={{ flex: 1, minWidth: 120, background: S.card, borderRadius: 12, padding: 14 }}>
                  <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>วันหมดอายุ</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: shopStatus.is_expired ? S.error : (shopStatus.days_left !== null && shopStatus.days_left <= 7 ? S.warning : S.success) }}>
                    {shopStatus.expired_at ? fmtDate(shopStatus.expired_at) : "ไม่มีกำหนด"}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 120, background: S.card, borderRadius: 12, padding: 14 }}>
                  <div style={{ color: S.muted, fontSize: 12, marginBottom: 4 }}>สถานะ</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: shopStatus.is_expired ? S.error : S.success }}>
                    {shopStatus.is_expired ? "หมดอายุ" : shopStatus.days_left !== null ? `เหลือ ${shopStatus.days_left} วัน` : "ไม่มีกำหนด"}
                  </div>
                </div>
              </div>

              {/* Direct expiry control */}
              <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14 }}>
                <div style={{ color: S.sub, fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={13} /> ตั้งวันหมดอายุโดยตรง
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="datetime-local" value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                    style={{ flex: 1, background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 12px", color: S.text, fontFamily: "inherit", fontSize: 13 }} />
                  <button onClick={setExpiry} disabled={expiryLoading}
                    style={{ background: S.accent, border: "none", borderRadius: 8, padding: "9px 14px", cursor: "pointer", color: "#fff", fontWeight: 600, fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    {expiryLoading ? <Loader2 size={13} className="animate-spin" /> : null} บันทึก
                  </button>
                  <button onClick={clearExpiry}
                    style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer", color: S.muted, fontFamily: "inherit", fontSize: 12 }}>
                    ลบ
                  </button>
                </div>
                {expiryMsg && <p style={{ color: expiryMsg.startsWith("✓") ? S.success : S.error, fontSize: 13, marginTop: 8 }}>{expiryMsg}</p>}
              </div>
            </>
          )}
        </div>

        {/* Per-shop API keys */}
        <ShopKeysSection sKey={sKey} shopId={selectedShopId} shops={allShops} onSelectShop={setSelectedShopId} />

        {/* Usage / Monitoring */}
        <UsageSection sKey={sKey} />

        {/* Payment Info */}
        <PaymentInfoSection sKey={sKey} />

        {/* Pricing */}
        <PricingSection sKey={sKey} shopId={selectedShopId} />

        {/* Renewal Requests */}
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Clock size={18} color={S.accent} />
            <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>คำขอต่ออายุ</span>
            {renewalsLoading && <Loader2 size={14} color={S.muted} className="animate-spin" />}
          </div>

          {/* Filter */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {(["", "pending", "approved", "rejected"] as const).map(f => (
              <button key={f} onClick={() => setFilterStatus(f)}
                style={{ background: filterStatus === f ? S.accent : S.card, color: filterStatus === f ? "#fff" : S.sub, border: `1px solid ${filterStatus === f ? S.accent : S.border}`, borderRadius: 100, padding: "5px 14px", cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>
                {f === "" ? "ทั้งหมด" : f === "pending" ? "รอดำเนินการ" : f === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}
              </button>
            ))}
          </div>

          {renewals.length === 0 && !renewalsLoading && (
            <div style={{ textAlign: "center", padding: 40, color: S.muted, fontSize: 14 }}>
              <Clock size={32} style={{ margin: "0 auto 8px", display: "block" }} />
              ไม่มีคำขอ{filterStatus ? "ในสถานะนี้" : ""}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(renewals as any[]).map(r => (
              <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ background: S.card, border: `1px solid ${r.status === "pending" ? S.warning + "55" : S.border}`, borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      ต่ออายุ {r.duration_months} เดือน — ฿{r.amount.toLocaleString()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      {paymentChannelBadge(r.payment_channel)}
                    </div>
                    <div style={{ color: S.muted, fontSize: 12, marginTop: 4 }}>
                      ส่งคำขอเมื่อ {fmtDate(r.requested_at)}
                    </div>
                    {r.approved_at && (
                      <div style={{ color: S.success, fontSize: 12, marginTop: 2 }}>
                        อนุมัติเมื่อ {fmtDate(r.approved_at)} → หมดอายุ {fmtDate(r.new_expired_at)}
                      </div>
                    )}
                    {r.admin_note && r.status === "rejected" && (
                      <div style={{ color: S.error, fontSize: 12, marginTop: 2 }}>เหตุผล: {r.admin_note}</div>
                    )}
                  </div>
                  {statusBadge(r.status)}
                </div>

                {/* Slip image + actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => setSlipSrc(r.slip_image)}
                    style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: S.sub, fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                    <Eye size={13} /> ดูสลิป
                  </button>
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => setApproveItem(r)}
                        style={{ flex: 1, background: `${S.success}22`, border: `1px solid ${S.success}55`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: S.success, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <CheckCircle size={13} /> อนุมัติ
                      </button>
                      <button onClick={() => {
                        const reason = prompt("เหตุผลในการปฏิเสธ (กดยกเลิกเพื่อไม่ระบุ):");
                        if (reason !== null) rejectMutation.mutate({ id: r.id, reason: reason || "ไม่ผ่านการตรวจสอบ" });
                      }}
                        style={{ flex: 1, background: `${S.error}22`, border: `1px solid ${S.error}55`, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: S.error, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <XCircle size={13} /> ปฏิเสธ
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Traffic Dashboard */}
        <TrafficSection sKey={sKey!} />
      </div>

      {/* Modals */}
      <AnimatePresence>
        {slipSrc && <SlipModal src={slipSrc} onClose={() => setSlipSrc(null)} />}
        {approveItem && (
          <ApproveModal
            item={approveItem}
            sKey={sKey}
            onDone={() => { setApproveItem(null); qc.invalidateQueries({ queryKey: ["sa-renewals"] }); qc.invalidateQueries({ queryKey: ["sa-status"] }); refetchStatus(); }}
            onClose={() => setApproveItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
