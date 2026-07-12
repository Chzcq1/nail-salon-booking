/**
 * RegisterPage — หน้าสมัครร้านใหม่แบบ Self-service
 * Route: /register
 * Flow: เลือกแพ็กเกจ → กรอกข้อมูล → อัปโหลดสลิป → รอ Admin อนุมัติ → รับอีเมล + onboarding link
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store, CheckCircle, AlertCircle, Loader2, Upload, Eye, EyeOff,
  QrCode, CreditCard, Copy, Check, ArrowRight, Shield,
} from "lucide-react";

const API = "/api/nail";

const C = {
  bg: "#0B0F1A",
  surface: "#131929",
  card: "#1A2236",
  border: "#253050",
  accent: "#6C8EFF",
  accentDk: "#4F72FF",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
  text: "#E8EAF0",
  sub: "#9AA5C0",
  muted: "#5A6480",
} as const;

const inp: React.CSSProperties = {
  width: "100%", background: C.card, border: `1.5px solid ${C.border}`,
  borderRadius: 10, padding: "11px 14px", fontSize: 14, color: C.text,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};
const btn = (disabled = false): React.CSSProperties => ({
  width: "100%", background: disabled ? C.card : `linear-gradient(135deg, ${C.accent}, ${C.accentDk})`,
  color: disabled ? C.muted : C.text, border: "none", borderRadius: 10,
  padding: "13px", fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  opacity: disabled ? 0.5 : 1,
});

// ── compress image before upload ──────────────────────────────────────────────
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

// ── Plan Card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, selected, onClick }: { plan: any; selected: boolean; onClick: () => void }) {
  const slotsLeft = plan.slots_left;
  const isFull = slotsLeft !== null && slotsLeft <= 0;
  const urgent = slotsLeft !== null && slotsLeft <= 5 && slotsLeft > 0;

  return (
    <motion.div whileHover={!isFull ? { scale: 1.01 } : undefined} onClick={!isFull ? onClick : undefined}
      style={{
        background: selected ? `${C.accent}18` : C.card,
        border: `2px solid ${selected ? C.accent : isFull ? C.muted : C.border}`,
        borderRadius: 16, padding: "20px 24px", cursor: isFull ? "not-allowed" : "pointer",
        opacity: isFull ? 0.5 : 1, transition: "border-color .2s",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {selected && <CheckCircle size={16} color={C.accent} />}
            <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{plan.name}</span>
            {urgent && (
              <span style={{ background: `${C.warning}22`, color: C.warning, borderRadius: 100, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                เหลือ {slotsLeft} ที่!
              </span>
            )}
            {isFull && (
              <span style={{ background: `${C.error}22`, color: C.error, borderRadius: 100, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>เต็มแล้ว</span>
            )}
          </div>
          <p style={{ color: C.sub, fontSize: 13, margin: 0, lineHeight: 1.5 }}>{plan.description}</p>
          {plan.expiry_days && (
            <p style={{ color: C.muted, fontSize: 12, margin: "6px 0 0" }}>
              ใช้งานได้ {plan.expiry_days} วัน
            </p>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
          <div style={{ color: C.accent, fontSize: 22, fontWeight: 800 }}>฿{plan.price.toFixed(0)}</div>
          {plan.total_slots && (
            <div style={{ color: C.muted, fontSize: 12 }}>{plan.registered_count}/{plan.total_slots} ที่</div>
          )}
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ color: C.muted, fontSize: 13 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{value}</span>
        <button onClick={() => copy(value, copyKey)}
          style={{ background: "none", border: "none", cursor: "pointer", color: copied === copyKey ? C.success : C.muted, padding: 2 }}>
          {copied === copyKey ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 20 }}>
      <p style={{ color: C.sub, fontSize: 13, fontWeight: 700, margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>
        💳 โอนเงินมาที่
      </p>
      <Row label="ธนาคาร" value={bankInfo.kasikorn_bank} copyKey="bank" />
      <Row label="เลขบัญชี" value={bankInfo.kasikorn_account} copyKey="account" />
      <Row label="ชื่อบัญชี" value={bankInfo.kasikorn_name} copyKey="name" />
      <Row label="TrueMoney" value={bankInfo.truemoney_phone} copyKey="tm" />
      <div style={{ marginTop: 12, padding: "10px 14px", background: `${C.accent}12`, borderRadius: 10, textAlign: "center" }}>
        <span style={{ color: C.accent, fontWeight: 700, fontSize: 18 }}>฿{price.toFixed(0)}</span>
        <span style={{ color: C.sub, fontSize: 13 }}> — ยอดที่ต้องโอน</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [bankInfo, setBankInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // form state
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
        const d = await res.json();
        setSlugStatus(d);
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
      const compressed = await compressImage(file);
      setSlipFile(compressed);
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

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={32} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Prompt', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@400;600;700&display=swap');`}</style>
        <div style={{ background: C.surface, border: `1px solid ${C.error}40`, borderRadius: 16, padding: 32, maxWidth: 400, textAlign: "center" }}>
          <AlertCircle size={40} color={C.error} style={{ marginBottom: 12 }} />
          <p style={{ color: C.text, fontSize: 15, marginBottom: 8 }}>ไม่สามารถโหลดข้อมูลได้</p>
          <p style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>{fetchError}</p>
          <button onClick={() => window.location.reload()} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.accentDk})`, color: C.text, border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            รีเฟรชหน้า
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Prompt', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');`}</style>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          style={{ background: C.surface, border: `1px solid ${success.auto_verified ? C.success : C.warning}`, borderRadius: 20, padding: 40, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{success.auto_verified ? "🎉" : "📬"}</div>
          <h2 style={{ color: C.text, fontSize: 22, fontWeight: 700, margin: "0 0 12px" }}>
            {success.auto_verified ? "ส่งคำขอสำเร็จ!" : "รับคำขอแล้ว!"}
          </h2>
          <p style={{ color: C.sub, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{success.message}</p>
          {!success.auto_verified && (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>
              📧 เราจะส่งลิงก์ตั้งค่าร้านไปยัง <strong style={{ color: C.sub }}>{email}</strong> เมื่ออนุมัติแล้ว
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Prompt', sans-serif", padding: "40px 16px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        input:focus,textarea:focus{border-color:${C.accent}!important;}`}</style>

      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: `${C.accent}15`, border: `1px solid ${C.accent}30`, borderRadius: 100, padding: "8px 20px", marginBottom: 20 }}>
            <Store size={16} color={C.accent} />
            <span style={{ color: C.accent, fontSize: 14, fontWeight: 600 }}>CSC — Chain System Care</span>
          </div>
          <h1 style={{ color: C.text, fontSize: 28, fontWeight: 800, margin: "0 0 8px" }}>สมัครเปิดร้าน</h1>
          <p style={{ color: C.sub, fontSize: 15, margin: 0 }}>ระบบจองคิวสำหรับร้านของคุณ — ตั้งค่าเองได้เลยหลังอนุมัติ</p>
        </motion.div>

        <form onSubmit={handleSubmit}>
          {/* Step 1: Choose plan */}
          <Section title="1. เลือกแพ็กเกจ">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {plans.map(p => (
                <PlanCard key={p.id} plan={p} selected={selectedPlan?.id === p.id} onClick={() => setSelectedPlan(p)} />
              ))}
              {plans.length === 0 && (
                <p style={{ color: C.muted, textAlign: "center", padding: 20 }}>ยังไม่มีแพ็กเกจที่เปิดรับสมัคร</p>
              )}
            </div>
          </Section>

          {selectedPlan && (
            <>
              {/* Step 2: Shop info */}
              <Section title="2. ข้อมูลร้าน">
                <Label text="ชื่อร้าน *" />
                <input style={inp} placeholder="เช่น ร้านทำเล็บสาวสวย" value={shopName} onChange={e => setShopName(e.target.value)} />

                <Label text="ชื่อย่อ URL (slug) *" />
                <div style={{ position: "relative" }}>
                  <input style={{ ...inp, paddingRight: 36 }} placeholder="เช่น my-nail-shop"
                    value={slug} onChange={e => onSlugChange(e.target.value)} />
                  {slugChecking && (
                    <Loader2 size={14} color={C.muted} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />
                  )}
                </div>
                {slug && (
                  <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>
                    URL ร้านของคุณ: <span style={{ color: C.sub }}>yoursite.com/r/<strong>{slug}</strong></span>
                  </p>
                )}
                {slugStatus && (
                  <p style={{ color: slugStatus.available ? C.success : C.error, fontSize: 13, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                    {slugStatus.available ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                    {slugStatus.available ? "slug นี้ว่างอยู่ ใช้ได้เลย" : slugStatus.reason}
                  </p>
                )}

                <Label text="อีเมล *" />
                <input style={inp} type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />

                <Label text="Line ID (ไม่บังคับ)" />
                <input style={inp} placeholder="@lineid" value={line} onChange={e => setLine(e.target.value)} />
              </Section>

              {/* Step 3: Payment method */}
              <Section title="3. ชำระเงินค่าสมัคร">
                {/* Method selector */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {([["slip", "🏦 โอนสลิป"], ["truemoney", "🧧 อั่งเปา TrueMoney"]] as const).map(([m, label]) => (
                    <button key={m} type="button" onClick={() => setPayMethod(m)} style={{
                      flex: 1, border: `1.5px solid ${payMethod === m ? C.accent : C.border}`,
                      background: payMethod === m ? `${C.accent}18` : C.card,
                      borderRadius: 10, padding: "10px 6px", cursor: "pointer",
                      fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                      color: payMethod === m ? C.accent : C.sub,
                    }}>{label}</button>
                  ))}
                </div>

                {payMethod === "slip" ? (
                  <>
                    {bankInfo && <BankBox bankInfo={bankInfo} price={selectedPlan.price} />}
                    <div onClick={() => fileInputRef.current?.click()} style={{
                      border: `2px dashed ${slipFile ? C.success : C.border}`, borderRadius: 12,
                      padding: "24px 20px", textAlign: "center", cursor: "pointer",
                      background: slipFile ? `${C.success}08` : "transparent", transition: "all .2s",
                    }}>
                      {slipFile ? (
                        <>
                          <CheckCircle size={28} color={C.success} style={{ marginBottom: 8 }} />
                          <p style={{ color: C.success, fontWeight: 600, margin: "0 0 4px" }}>อัปโหลดสลิปแล้ว</p>
                          <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>{slipName}</p>
                          <p style={{ color: C.muted, fontSize: 12, margin: "4px 0 0" }}>กดเพื่อเปลี่ยนรูป</p>
                        </>
                      ) : (
                        <>
                          <Upload size={28} color={C.muted} style={{ marginBottom: 8 }} />
                          <p style={{ color: C.sub, fontWeight: 600, margin: "0 0 4px" }}>กดเพื่ออัปโหลดสลิป</p>
                          <p style={{ color: C.muted, fontSize: 12, margin: 0 }}>รองรับ JPG, PNG (ไม่เกิน 10MB)</p>
                        </>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
                  </>
                ) : (
                  <div>
                    <div style={{ background: `${C.warning}12`, border: `1px solid ${C.warning}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                      <p style={{ color: C.warning, fontSize: 13, fontWeight: 600, margin: "0 0 6px" }}>💰 ยอดที่ต้องโอน ฿{selectedPlan.price.toFixed(0)}</p>
                      <p style={{ color: C.sub, fontSize: 12, margin: 0 }}>ส่งซองอั่งเปา TrueMoney มูลค่าเท่ากับหรือมากกว่า ฿{selectedPlan.price.toFixed(0)}</p>
                    </div>
                    <input
                      type="text"
                      value={voucher}
                      onChange={e => setVoucher(e.target.value)}
                      placeholder="https://gift.truemoney.com/campaign/?v=... หรือรหัสซอง"
                      style={{ ...inp }}
                    />
                    <p style={{ color: C.muted, fontSize: 12, margin: "6px 0 0" }}>
                      วางลิงก์ซอง TrueMoney Gift จาก TrueMoney Wallet App — ระบบจะแลกอัตโนมัติ
                    </p>
                  </div>
                )}
              </Section>

              {/* Submit */}
              {error && (
                <div style={{ background: `${C.error}15`, border: `1px solid ${C.error}40`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} color={C.error} />
                  <span style={{ color: C.error, fontSize: 14 }}>{error}</span>
                </div>
              )}
              <button type="submit" disabled={submitting || !selectedPlan} style={btn(submitting || !selectedPlan)}>
                {submitting ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> กำลังส่งคำขอ…</> : <><ArrowRight size={16} /> ยื่นสมัครร้าน</>}
              </button>
              <p style={{ color: C.muted, fontSize: 12, textAlign: "center", marginTop: 12 }}>
                <Shield size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                ข้อมูลของคุณปลอดภัย — ทีมงานจะติดต่อกลับทางอีเมลภายใน 24 ชั่วโมง
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, marginBottom: 16 }}>
      <h3 style={{ color: C.sub, fontSize: 13, fontWeight: 700, margin: "0 0 16px", textTransform: "uppercase", letterSpacing: 1 }}>{title}</h3>
      {children}
    </motion.div>
  );
}

function Label({ text }: { text: string }) {
  return <label style={{ color: C.sub, fontSize: 13, display: "block", margin: "12px 0 5px" }}>{text}</label>;
}
