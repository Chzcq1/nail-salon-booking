/**
 * RegisterPage — หน้าสมัครร้านใหม่แบบ Self-service
 * Route: /register
 * Flow: เลือกแพ็กเกจ → กรอกข้อมูล → อัปโหลดสลิป → รอ Admin อนุมัติ → รับอีเมล + onboarding link
 *
 * Design: Playful Editorial (อ้างอิง Design.md)
 * — Cream bg, Sky-blue hero, bold Syne headline, solid ink buttons
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, CheckCircle, AlertCircle, Loader2, Upload,
  ArrowRight, Shield, Copy, Check, Zap, Clock, Users,
} from "lucide-react";

const API = "/api/nail";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  cream:    "#F7F3EC",   // page background
  sky:      "#4FBBDF",   // hero + step badge
  skyLight: "#E8F6FC",   // sky tint for selected cards
  sun:      "#FFD84D",   // highlight / badge
  ink:      "#1A1A1A",   // primary text + buttons
  snow:     "#FFFFFF",   // card background
  border:   "#E2E8F0",   // card border
  mist:     "#64748B",   // subtext
  cloud:    "#CBD5E1",   // placeholder / divider
  sage:     "#16A34A",   // success
  coral:    "#DC2626",   // error
  amber:    "#B45309",   // warning
  accentBg: "#F0FAFA",   // subtle sky tint bg
} as const;

// ── Shared input style ────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%",
  background: C.snow,
  border: `2px solid ${C.border}`,
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 15,
  color: C.ink,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color .15s",
};

// ── Compress image before upload ──────────────────────────────────────────────
function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Step badge ─────────────────────────────────────────────────────────────────
function StepBadge({ n }: { n: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 32, height: 32, borderRadius: "50%",
      background: C.sky, color: C.snow, fontSize: 14, fontWeight: 800,
      flexShrink: 0,
    }}>
      {n}
    </span>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────
function StepCard({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: C.snow,
        border: `2px solid ${C.border}`,
        borderRadius: 20,
        padding: "28px 28px 24px",
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <StepBadge n={step} />
        <h3 style={{ color: C.ink, fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

// ── Form label ────────────────────────────────────────────────────────────────
function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label style={{ color: C.mist, fontSize: 13, fontWeight: 600, display: "block", margin: "14px 0 6px" }}>
      {text}{required && <span style={{ color: C.coral, marginLeft: 3 }}>*</span>}
    </label>
  );
}

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, selected, onClick }: { plan: any; selected: boolean; onClick: () => void }) {
  const slotsLeft = plan.slots_left;
  const isFull = slotsLeft !== null && slotsLeft <= 0;
  const urgent = slotsLeft !== null && slotsLeft <= 5 && slotsLeft > 0;

  return (
    <motion.div
      whileHover={!isFull ? { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.10)" } : undefined}
      whileTap={!isFull ? { scale: 0.98 } : undefined}
      onClick={!isFull ? onClick : undefined}
      style={{
        background: selected ? C.skyLight : C.snow,
        border: `2px solid ${selected ? C.sky : isFull ? C.cloud : C.border}`,
        borderRadius: 16,
        padding: "20px 24px",
        cursor: isFull ? "not-allowed" : "pointer",
        opacity: isFull ? 0.5 : 1,
        transition: "all .2s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: 0, right: 0, background: C.sky,
          padding: "4px 14px 4px 18px", borderBottomLeftRadius: 12,
          fontSize: 11, fontWeight: 700, color: C.snow,
        }}>
          ✓ เลือกแล้ว
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ color: C.ink, fontWeight: 800, fontSize: 17 }}>{plan.name}</span>
            {urgent && (
              <span style={{ background: C.sun, color: C.ink, borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                เหลือ {slotsLeft} ที่!
              </span>
            )}
            {isFull && (
              <span style={{ background: "#FEE2E2", color: C.coral, borderRadius: 100, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                เต็มแล้ว
              </span>
            )}
          </div>
          <p style={{ color: C.mist, fontSize: 14, margin: 0, lineHeight: 1.6 }}>{plan.description}</p>
          {plan.expiry_days && (
            <p style={{ color: C.cloud, fontSize: 12, margin: "8px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> ใช้งานได้ {plan.expiry_days} วัน
            </p>
          )}
          {plan.total_slots && (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 4, color: C.cloud, fontSize: 12 }}>
              <Users size={11} />
              {plan.registered_count}/{plan.total_slots} ร้านค้า
              <div style={{ flex: 1, height: 4, background: "#F1F5F9", borderRadius: 2, marginLeft: 4, maxWidth: 80, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.min(100, (plan.registered_count / plan.total_slots) * 100)}%`,
                  background: urgent ? C.sun : C.sky,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: C.ink, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>฿{plan.price.toFixed(0)}</div>
          <div style={{ color: C.mist, fontSize: 12, marginTop: 2 }}>ต่อร้าน</div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Bank Info Box ─────────────────────────────────────────────────────────────
function BankBox({ bankInfo, price }: { bankInfo: any; price: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };

  const Row = ({ label, value, copyKey }: { label: string; value: string; copyKey: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.mist, fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: C.ink, fontWeight: 600, fontSize: 14 }}>{value}</span>
        <button onClick={() => copy(value, copyKey)}
          style={{ background: copied === copyKey ? "#DCFCE7" : "#F1F5F9", border: "none", borderRadius: 6, cursor: "pointer", color: copied === copyKey ? C.sage : C.mist, padding: "4px 8px", display: "flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 600, transition: "all .15s" }}>
          {copied === copyKey ? <><Check size={12} /> คัดลอกแล้ว</> : <><Copy size={12} /> คัดลอก</>}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.cream, border: `2px solid ${C.border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
      <p style={{ color: C.mist, fontSize: 12, fontWeight: 700, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: 1 }}>
        💳 โอนเงินมาที่
      </p>
      <Row label="ธนาคาร" value={bankInfo.kasikorn_bank} copyKey="bank" />
      <Row label="เลขบัญชี" value={bankInfo.kasikorn_account} copyKey="account" />
      <Row label="ชื่อบัญชี" value={bankInfo.kasikorn_name} copyKey="name" />
      <Row label="TrueMoney" value={bankInfo.truemoney_phone} copyKey="tm" />
      <div style={{ marginTop: 14, padding: "12px 16px", background: C.sky, borderRadius: 10, textAlign: "center" }}>
        <span style={{ color: C.snow, fontWeight: 800, fontSize: 22 }}>฿{price.toFixed(0)}</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}> — ยอดที่ต้องโอน</span>
      </div>
    </div>
  );
}

// ── Trust badges ──────────────────────────────────────────────────────────────
function TrustBar() {
  const items = [
    { icon: <Shield size={14} />, text: "ข้อมูลปลอดภัย" },
    { icon: <Clock size={14} />, text: "อนุมัติภายใน 24 ชม." },
    { icon: <Zap size={14} />, text: "ตั้งค่าเองได้ทันที" },
  ];
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginTop: 20, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, color: C.mist, fontSize: 13 }}>
          {item.icon} {item.text}
        </div>
      ))}
    </div>
  );
}

// ── Decorative geometric shapes for hero ────────────────────────────────────
function HeroDecorations() {
  return (
    <>
      {/* Large circle top-right */}
      <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.12)", pointerEvents: "none" }} />
      {/* Medium circle bottom-left */}
      <div style={{ position: "absolute", bottom: -20, left: 30, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.10)", pointerEvents: "none" }} />
      {/* Small rotated square */}
      <div style={{ position: "absolute", top: 30, right: 120, width: 28, height: 28, background: C.sun, transform: "rotate(18deg)", borderRadius: 4, opacity: 0.85, pointerEvents: "none" }} />
      {/* Tiny circle accent */}
      <div style={{ position: "absolute", bottom: 28, right: 60, width: 14, height: 14, borderRadius: "50%", background: C.snow, opacity: 0.5, pointerEvents: "none" }} />
    </>
  );
}

// ── FAQ Section (reused in error state + main form) ───────────────────────────
const FAQ_ITEMS = [
  {
    q: "หลังสมัครต้องรอนานแค่ไหน?",
    a: "ทีมงานตรวจสลิปและเปิดระบบให้ภายใน 1–2 ชั่วโมง (วันทำการ 9:00–20:00 น.) เมื่อเปิดแล้วจะได้รับอีเมลพร้อมลิงก์ตั้งค่าร้านทันที",
  },
  {
    q: "ต้องติดตั้งแอปไหม? ใช้ยากไหม?",
    a: "ไม่ต้องติดตั้งอะไรเลย เปิดผ่านเบราว์เซอร์บนมือถือหรือคอมพิวเตอร์ได้เลย ตั้งค่าร้านเสร็จภายใน 10 นาที",
  },
  {
    q: "ลูกค้าจองคิวผ่านช่องทางไหน?",
    a: "ร้านจะได้รับลิงก์จองคิวเฉพาะของตัวเอง เช่น /r/ชื่อร้าน ส่งให้ลูกค้าผ่าน LINE, IG หรือ Facebook ได้เลย ลูกค้าไม่ต้องโหลดแอปเพิ่ม",
  },
  {
    q: "จัดการตารางเวลาทำอะไรได้บ้าง?",
    a: "ตั้งตารางรายสัปดาห์ กำหนดวันหยุดพิเศษ เพิ่มบล็อกเวลาพิเศษ และล็อกจำนวนรับสูงสุดต่อสล็อตได้ ระบบสร้างสล็อตจองล่วงหน้าอัตโนมัติ 60 วัน",
  },
  {
    q: "ข้อมูลลูกค้าของร้านจะถูกเก็บอย่างไร?",
    a: "ข้อมูลของแต่ละร้านแยกเป็นอิสระจากกันอย่างสมบูรณ์ ร้านอื่นไม่มีทางเข้าถึงข้อมูลลูกค้าของคุณได้",
  },
];

function FaqSection() {
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 20px 80px" }}>
      {/* Divider + heading */}
      <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 52, marginBottom: 36 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{
            background: C.sun, color: C.ink, fontSize: 11, fontWeight: 800,
            letterSpacing: 1.2, textTransform: "uppercase" as const, borderRadius: 6,
            padding: "4px 10px",
          }}>FAQ</span>
        </div>
        <h2 style={{
          color: C.ink, fontSize: "clamp(22px, 5vw, 28px)", fontWeight: 800,
          fontFamily: "'Syne', 'Prompt', sans-serif",
          margin: "0 0 6px", letterSpacing: -0.3, lineHeight: 1.2,
        }}>
          คำถามที่พบบ่อย
        </h2>
        <p style={{ color: C.mist, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          สงสัยเรื่องอื่นเพิ่มเติม? ทักหาทีมงานได้เลยครับ
        </p>
      </div>

      {FAQ_ITEMS.map((item, i) => (
        <div key={i} style={{ borderTop: `1.5px solid ${C.border}`, padding: "24px 0" }}>
          <p style={{
            color: C.ink, fontSize: 16, fontWeight: 700,
            margin: "0 0 8px", lineHeight: 1.45,
            display: "flex", alignItems: "flex-start", gap: 10,
          }}>
            <span style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
              background: C.sky, color: C.snow,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 800, marginTop: 1,
            }}>Q</span>
            {item.q}
          </p>
          <p style={{ color: C.mist, fontSize: 15, margin: "0 0 0 32px", lineHeight: 1.75 }}>
            {item.a}
          </p>
        </div>
      ))}
      <div style={{ borderTop: `1.5px solid ${C.border}` }} />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [bankInfo, setBankInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [shopName, setShopName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<{ available?: boolean; reason?: string } | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [email, setEmail] = useState("");
  const [line, setLine] = useState("");
  const [payMethod, setPayMethod] = useState<"slip" | "truemoney">("slip");
  const [voucher, setVoucher] = useState("");
  const [slipFile, setSlipFile] = useState<string | null>(null);
  const [slipName, setSlipName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ message: string; auto_verified: boolean } | null>(null);
  const [fetchError, setFetchError] = useState("");

  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/register/plans`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
      fetch(`${API}/register/bank-info`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    ]).then(([p, b]) => {
      const planList = Array.isArray(p) ? p : [];
      setPlans(planList);
      setBankInfo(b);
      const available = planList.find((pl: any) => pl.is_available);
      if (available) setSelectedPlan(available);
    }).catch((err) => {
      setFetchError("โหลดข้อมูลไม่ได้ กรุณารีเฟรชหน้าใหม่ (" + (err?.message ?? "network error") + ")");
    }).finally(() => setLoading(false));
  }, []);

  const checkSlug = useCallback((val: string) => {
    if (slugTimer.current) clearTimeout(slugTimer.current);
    setSlugStatus(null);
    if (!val) return;
    setSlugChecking(true);
    slugTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/register/check-slug`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: val }),
        });
        setSlugStatus(await res.json());
      } catch { setSlugStatus({ available: false, reason: "ตรวจสอบไม่ได้" }); }
      finally { setSlugChecking(false); }
    }, 600);
  }, []);

  const onSlugChange = (v: string) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(clean);
    checkSlug(clean);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("กรุณาอัปโหลดไฟล์รูปภาพ"); return; }
    setSlipName(file.name);
    try {
      setSlipFile(await compressImage(file));
      setError("");
    } catch { setError("อ่านไฟล์รูปไม่ได้ กรุณาลองใหม่"); }
    e.target.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return setError("กรุณาเลือกแพ็กเกจ");
    if (!shopName.trim()) return setError("กรุณากรอกชื่อร้าน");
    if (!slug || !slugStatus?.available) return setError("กรุณาตรวจสอบ slug ให้ถูกต้อง");
    if (!email.includes("@")) return setError("กรุณากรอกอีเมลให้ถูกต้อง");
    if (payMethod === "slip" && !slipFile) return setError("กรุณาอัปโหลดสลิปการโอนเงิน");
    if (payMethod === "truemoney" && !voucher.trim()) return setError("กรุณากรอกลิงก์หรือรหัสซองอั่งเปา");
    setError(""); setSubmitting(true);
    try {
      const body: any = {
        plan_id: selectedPlan.id, shop_name: shopName.trim(),
        slug, owner_email: email.trim().toLowerCase(),
        owner_line: line.trim() || undefined,
        payment_channel: payMethod === "slip" ? "bank_slip" : "angpao",
      };
      if (payMethod === "slip") body.slip_image = slipFile;
      else body.voucher_code = voucher.trim();
      const res = await fetch(`${API}/register/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "ส่งคำขอไม่สำเร็จ");
      setSuccess({ message: d.message, auto_verified: d.auto_verified });
    } catch (err: any) {
      setError(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally { setSubmitting(false); }
  };

  const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Prompt:wght@300;400;500;600;700;800&display=swap');`;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.cream, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <style>{FONTS}</style>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: `4px solid ${C.border}`, borderTopColor: C.sky, animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: C.mist, fontSize: 14, fontFamily: "'Prompt', sans-serif" }}>กำลังโหลด…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── Fetch error — show hero + error card + FAQ so content is still useful ──
  if (fetchError) {
    return (
      <div style={{ minHeight: "100vh", background: C.cream, fontFamily: "'Prompt', sans-serif" }}>
        <style>{`${FONTS} @keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
        {/* Hero */}
        <div style={{ background: C.sky, padding: "52px 24px 64px", position: "relative", overflow: "hidden" }}>
          <HeroDecorations />
          <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.22)", borderRadius: 100, padding: "6px 16px", marginBottom: 24 }}>
              <Store size={14} color={C.snow} />
              <span style={{ color: C.snow, fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>CSC — Chain System Care</span>
            </div>
            <h1 style={{ color: C.snow, fontSize: "clamp(36px, 7vw, 56px)", fontWeight: 800, fontFamily: "'Syne', 'Prompt', sans-serif", lineHeight: 1.1, margin: "0 0 16px", letterSpacing: -0.5 }}>
              เปิดร้านของคุณ<br />กับ CSC
            </h1>
            <p style={{ color: "rgba(255,255,255,0.88)", fontSize: 18, lineHeight: 1.65, margin: 0, maxWidth: 480 }}>
              ระบบจองคิวครบวงจรสำหรับร้านนวด สปา ทำเล็บ และอื่นๆ
            </p>
          </div>
        </div>
        {/* Error card */}
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px 0" }}>
          <div style={{ background: C.snow, border: `2px solid #FEE2E2`, borderRadius: 20, padding: 32, textAlign: "center" }}>
            <AlertCircle size={36} color={C.coral} style={{ marginBottom: 10 }} />
            <p style={{ color: C.ink, fontSize: 16, fontWeight: 700, margin: "0 0 6px" }}>ไม่สามารถโหลดข้อมูลได้</p>
            <p style={{ color: C.mist, fontSize: 14, margin: "0 0 20px" }}>{fetchError}</p>
            <button onClick={() => window.location.reload()}
              style={{ background: C.ink, color: C.snow, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              รีเฟรชหน้า
            </button>
          </div>
        </div>
        <FaqSection />
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: success.auto_verified ? C.sun : C.cream, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Prompt', sans-serif" }}>
        <style>{FONTS}</style>
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          style={{ background: C.snow, border: `2px solid ${C.border}`, borderRadius: 24, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.10)" }}
        >
          <div style={{ fontSize: 64, marginBottom: 20 }}>{success.auto_verified ? "🎉" : "📬"}</div>
          <h2 style={{ color: C.ink, fontSize: 28, fontWeight: 800, margin: "0 0 14px", fontFamily: "'Syne', sans-serif" }}>
            {success.auto_verified ? "สมัครสำเร็จแล้ว!" : "รับคำขอเรียบร้อย!"}
          </h2>
          <p style={{ color: C.mist, fontSize: 16, lineHeight: 1.7, margin: 0 }}>{success.message}</p>
          {!success.auto_verified && (
            <p style={{ color: C.mist, fontSize: 14, marginTop: 20, padding: "14px 16px", background: C.cream, borderRadius: 10 }}>
              📧 เราจะส่งลิงก์ตั้งค่าร้านไปยัง <strong style={{ color: C.ink }}>{email}</strong> เมื่ออนุมัติแล้ว
            </p>
          )}
          <button onClick={() => window.location.reload()}
            style={{ marginTop: 28, background: C.ink, color: C.snow, border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            กลับหน้าหลัก
          </button>
        </motion.div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.cream, fontFamily: "'Prompt', sans-serif" }}>
      <style>{`
        ${FONTS}
        input:focus, textarea:focus { border-color: ${C.sky} !important; box-shadow: 0 0 0 3px ${C.skyLight}; }
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── Hero Band ────────────────────────────────────────────────────── */}
      <div style={{ background: C.sky, padding: "52px 24px 64px", position: "relative", overflow: "hidden" }}>
        <HeroDecorations />
        <div style={{ maxWidth: 600, margin: "0 auto", position: "relative", zIndex: 1 }}>
          {/* Brand pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.22)", borderRadius: 100, padding: "6px 16px", marginBottom: 24 }}>
            <Store size={14} color={C.snow} />
            <span style={{ color: C.snow, fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>CSC — Chain System Care</span>
          </div>

          {/* Headline */}
          <h1 style={{ color: C.snow, fontSize: "clamp(36px, 7vw, 56px)", fontWeight: 800, fontFamily: "'Syne', 'Prompt', sans-serif", lineHeight: 1.1, margin: "0 0 16px", letterSpacing: -0.5 }}>
            เปิดร้านของคุณ<br />กับ CSC
          </h1>
          <p style={{ color: "rgba(255,255,255,0.88)", fontSize: 18, lineHeight: 1.65, margin: "0 0 32px", maxWidth: 480 }}>
            ระบบจองคิวครบวงจรสำหรับร้านนวด สปา ทำเล็บ และอื่นๆ<br />
            ตั้งค่าเองได้ทันทีหลังอนุมัติ
          </p>

          {/* Step pills */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {["① เลือกแพ็กเกจ", "② ข้อมูลร้าน", "③ ชำระเงิน"].map((s, i) => (
              <span key={i} style={{ background: "rgba(255,255,255,0.18)", color: C.snow, borderRadius: 100, padding: "6px 14px", fontSize: 13, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form body ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 20px 60px" }}>
        <form onSubmit={handleSubmit}>

          {/* Step 1: Plan */}
          <StepCard step={1} title="เลือกแพ็กเกจ">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {plans.map(p => (
                <PlanCard key={p.id} plan={p} selected={selectedPlan?.id === p.id} onClick={() => setSelectedPlan(p)} />
              ))}
              {plans.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 20px", color: C.mist }}>
                  <Store size={32} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <p style={{ margin: 0 }}>ยังไม่มีแพ็กเกจที่เปิดรับสมัคร</p>
                </div>
              )}
            </div>
          </StepCard>

          {selectedPlan && (
            <>
              {/* Step 2: Shop info */}
              <StepCard step={2} title="ข้อมูลร้านของคุณ">
                <Label text="ชื่อร้าน" required />
                <input style={inp} placeholder="เช่น ร้านสาวสวยทำเล็บ" value={shopName} onChange={e => setShopName(e.target.value)} />

                <Label text="ชื่อย่อ URL (slug)" required />
                <div style={{ position: "relative" }}>
                  <input
                    style={{ ...inp, paddingRight: 40 }}
                    placeholder="เช่น my-nail-shop (ตัวอักษร a-z, 0-9, -)"
                    value={slug}
                    onChange={e => onSlugChange(e.target.value)}
                  />
                  {slugChecking && (
                    <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.sky, animation: "spin 0.8s linear infinite" }} />
                  )}
                </div>
                {slug && (
                  <p style={{ color: C.cloud, fontSize: 12, margin: "5px 0 0" }}>
                    URL ของคุณ: <span style={{ color: C.mist }}>yoursite.com/r/<strong>{slug}</strong></span>
                  </p>
                )}
                {slugStatus && (
                  <p style={{ color: slugStatus.available ? C.sage : C.coral, fontSize: 13, margin: "6px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
                    {slugStatus.available
                      ? <><CheckCircle size={14} /> slug นี้ว่างอยู่ ใช้ได้เลย</>
                      : <><AlertCircle size={14} /> {slugStatus.reason}</>}
                  </p>
                )}

                <Label text="อีเมล" required />
                <input style={inp} type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />

                <Label text="Line ID" />
                <input style={inp} placeholder="@lineid (ไม่บังคับ)" value={line} onChange={e => setLine(e.target.value)} />
              </StepCard>

              {/* Step 3: Payment */}
              <StepCard step={3} title="ชำระเงินค่าสมัคร">
                {/* Method toggle */}
                <div style={{ display: "flex", gap: 8, marginBottom: 20, background: C.cream, borderRadius: 12, padding: 4 }}>
                  {([["slip", "🏦 โอนสลิปธนาคาร"], ["truemoney", "🧧 TrueMoney อั่งเปา"]] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayMethod(m)}
                      style={{
                        flex: 1,
                        border: "none",
                        background: payMethod === m ? C.snow : "transparent",
                        borderRadius: 9,
                        padding: "10px 8px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 14,
                        fontWeight: payMethod === m ? 700 : 500,
                        color: payMethod === m ? C.ink : C.mist,
                        boxShadow: payMethod === m ? "0 1px 6px rgba(0,0,0,0.08)" : "none",
                        transition: "all .15s",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  {payMethod === "slip" ? (
                    <motion.div key="slip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {bankInfo && <BankBox bankInfo={bankInfo} price={selectedPlan.price} />}
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          border: `2px dashed ${slipFile ? C.sage : C.cloud}`,
                          borderRadius: 14,
                          padding: "28px 20px",
                          textAlign: "center",
                          cursor: "pointer",
                          background: slipFile ? "#F0FDF4" : C.cream,
                          transition: "all .2s",
                        }}
                      >
                        {slipFile ? (
                          <>
                            <CheckCircle size={32} color={C.sage} style={{ marginBottom: 10 }} />
                            <p style={{ color: C.sage, fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>อัปโหลดสลิปแล้ว ✓</p>
                            <p style={{ color: C.mist, fontSize: 13, margin: 0 }}>{slipName}</p>
                            <p style={{ color: C.cloud, fontSize: 12, margin: "6px 0 0" }}>กดเพื่อเปลี่ยนรูป</p>
                          </>
                        ) : (
                          <>
                            <Upload size={32} color={C.cloud} style={{ marginBottom: 10 }} />
                            <p style={{ color: C.ink, fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>กดเพื่ออัปโหลดสลิป</p>
                            <p style={{ color: C.mist, fontSize: 13, margin: 0 }}>รองรับ JPG, PNG (ไม่เกิน 10MB)</p>
                          </>
                        )}
                      </div>
                      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
                    </motion.div>
                  ) : (
                    <motion.div key="truemoney" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div style={{ background: "#FEF3C7", border: `2px solid #FDE68A`, borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                        <p style={{ color: C.amber, fontSize: 14, fontWeight: 700, margin: "0 0 4px" }}>💰 ยอดที่ต้องโอน ฿{selectedPlan.price.toFixed(0)}</p>
                        <p style={{ color: "#92400E", fontSize: 13, margin: 0 }}>ส่งซองอั่งเปา TrueMoney มูลค่าเท่ากับหรือมากกว่า</p>
                      </div>
                      <input
                        type="text"
                        value={voucher}
                        onChange={e => setVoucher(e.target.value)}
                        placeholder="https://gift.truemoney.com/campaign/?v=... หรือรหัสซอง"
                        style={inp}
                      />
                      <p style={{ color: C.mist, fontSize: 12, margin: "8px 0 0" }}>
                        วางลิงก์ซอง TrueMoney Gift จาก TrueMoney Wallet App — ระบบจะแลกอัตโนมัติ
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </StepCard>

              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{ background: "#FEF2F2", border: `2px solid #FECACA`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}
                >
                  <AlertCircle size={18} color={C.coral} />
                  <span style={{ color: C.coral, fontSize: 14, fontWeight: 600 }}>{error}</span>
                </motion.div>
              )}

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={submitting || !selectedPlan}
                whileHover={!submitting && selectedPlan ? { scale: 1.01 } : undefined}
                whileTap={!submitting && selectedPlan ? { scale: 0.99 } : undefined}
                style={{
                  width: "100%",
                  background: submitting || !selectedPlan ? C.cloud : C.ink,
                  color: C.snow,
                  border: "none",
                  borderRadius: 14,
                  padding: "16px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: submitting || !selectedPlan ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  transition: "background .2s",
                  letterSpacing: 0.2,
                }}
              >
                {submitting
                  ? <><div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.3)`, borderTopColor: C.snow, animation: "spin 0.8s linear infinite" }} /> กำลังส่งคำขอ…</>
                  : <><ArrowRight size={18} /> ยื่นสมัครร้าน</>
                }
              </motion.button>

              <TrustBar />
            </>
          )}
        </form>
      </div>

      <FaqSection />

    </div>
  );
}
