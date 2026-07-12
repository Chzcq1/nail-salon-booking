/**
 * OnboardingPage — ตั้งค่าร้านครั้งแรก (เฉพาะร้านใหม่ที่สมัครผ่านระบบ)
 * Route: /r/:slug/admin/onboarding?token=...
 * Flow: step 1 ตั้ง PIN → step 2 scan QR + ยืนยัน TOTP → เข้าหลังร้านทันที
 */
import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Eye, EyeOff, CheckCircle, Loader2, QrCode, Copy, Check, AlertCircle } from "lucide-react";

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
  text: "#E8EAF0",
  sub: "#9AA5C0",
  muted: "#5A6480",
} as const;

const inp: React.CSSProperties = {
  width: "100%", background: C.card, border: `1.5px solid ${C.border}`,
  borderRadius: 10, padding: "12px 14px", fontSize: 15, color: C.text,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none", marginBottom: 12,
};

export default function OnboardingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [, navigate] = useLocation();

  // parse token from URL
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [step, setStep] = useState<"loading" | "error" | "pin" | "totp" | "done">("loading");
  const [shopInfo, setShopInfo] = useState<{ shop_name: string; qr_code: string; totp_secret: string } | null>(null);
  const [errMsg, setErrMsg] = useState("");

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    if (!token) { setStep("error"); setErrMsg("ไม่พบ token กรุณาใช้ลิงก์จากอีเมลที่ได้รับ"); return; }
    fetch(`${API}/admin/onboarding?setup_token=${encodeURIComponent(token)}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail ?? "ลิงก์ไม่ถูกต้อง");
        setShopInfo(d);
        setStep("pin");
      })
      .catch(e => { setStep("error"); setErrMsg(e.message); });
  }, [token]);

  const handlePinNext = () => {
    if (pin.length < 4) return setErrMsg("PIN ต้องมีอย่างน้อย 4 ตัวอักษร");
    if (pin !== pinConfirm) return setErrMsg("PIN ทั้งสองช่องไม่ตรงกัน");
    setErrMsg("");
    setStep("totp");
  };

  const handleComplete = async () => {
    if (totpCode.length !== 6) return setErrMsg("กรุณากรอกรหัส 6 หลักจาก Google Authenticator");
    setErrMsg(""); setLoading(true);
    try {
      const res = await fetch(`${API}/admin/onboarding/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_token: token, pin, totp_code: totpCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "เกิดข้อผิดพลาด");
      // save token + go to admin
      const storageKey = `nail_admin_token_${slug}`;
      localStorage.setItem(storageKey, d.access_token);
      setStep("done");
      setTimeout(() => navigate(`/r/${slug}/admin`), 2000);
    } catch (e: any) {
      setErrMsg(e.message ?? "เกิดข้อผิดพลาด");
    } finally { setLoading(false); }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(shopInfo?.totp_secret ?? "").then(() => {
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Prompt', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        input:focus{border-color:${C.accent}!important;}`}</style>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 440 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: `${C.accent}22`, borderRadius: 12, padding: 10 }}>
            <Shield size={24} color={C.accent} />
          </div>
          <div>
            <h1 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>
              {shopInfo?.shop_name ?? "ตั้งค่าร้านครั้งแรก"}
            </h1>
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>CSC — ตั้งค่า PIN + Google Authenticator</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* Loading */}
          {step === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: "center", padding: "32px 0" }}>
              <Loader2 size={32} color={C.accent} style={{ animation: "spin 1s linear infinite" }} />
              <p style={{ color: C.sub, marginTop: 12 }}>กำลังโหลด...</p>
              <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            </motion.div>
          )}

          {/* Error */}
          {step === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: "center", padding: "24px 0" }}>
              <AlertCircle size={40} color={C.error} style={{ marginBottom: 12 }} />
              <p style={{ color: C.error, fontWeight: 600, marginBottom: 8 }}>ลิงก์ไม่ถูกต้อง</p>
              <p style={{ color: C.sub, fontSize: 14 }}>{errMsg}</p>
              <p style={{ color: C.muted, fontSize: 13 }}>กรุณาตรวจสอบอีเมลและใช้ลิงก์จากอีเมลล่าสุด</p>
            </motion.div>
          )}

          {/* Step 1: Set PIN */}
          {step === "pin" && (
            <motion.div key="pin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <StepIndicator current={1} total={2} />
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>ตั้งรหัส PIN</h2>
              <p style={{ color: C.sub, fontSize: 13, margin: "0 0 20px", lineHeight: 1.5 }}>
                PIN ใช้สำหรับ login เข้าหลังร้าน — อย่างน้อย 4 ตัวอักษร
              </p>

              <label style={{ color: C.sub, fontSize: 13, display: "block", marginBottom: 5 }}>ตั้ง PIN</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPin ? "text" : "password"}
                  style={{ ...inp, paddingRight: 44 }}
                  placeholder="อย่างน้อย 4 ตัวอักษร"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPin(!showPin)}
                  style={{ position: "absolute", right: 12, top: 14, background: "none", border: "none", cursor: "pointer", color: C.muted }}>
                  {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <label style={{ color: C.sub, fontSize: 13, display: "block", marginBottom: 5 }}>ยืนยัน PIN อีกครั้ง</label>
              <input
                type="password"
                style={inp}
                placeholder="กรอก PIN ซ้ำ"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handlePinNext()}
              />

              {errMsg && <ErrMsg text={errMsg} />}

              <Btn onClick={handlePinNext} disabled={pin.length < 4 || !pinConfirm}>
                ถัดไป — ตั้ง Google Authenticator →
              </Btn>
            </motion.div>
          )}

          {/* Step 2: TOTP Setup */}
          {step === "totp" && shopInfo && (
            <motion.div key="totp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <StepIndicator current={2} total={2} />
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: "0 0 6px" }}>ตั้ง Google Authenticator</h2>
              <p style={{ color: C.sub, fontSize: 13, margin: "0 0 16px", lineHeight: 1.5 }}>
                เปิด Google Authenticator แล้ว scan QR Code ด้านล่าง
              </p>

              {/* QR Code */}
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <img src={shopInfo.qr_code} alt="TOTP QR Code"
                  style={{ width: 180, height: 180, borderRadius: 12, border: `2px solid ${C.border}` }} />
              </div>

              {/* Manual secret */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ color: C.muted, fontSize: 11, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 1 }}>กรอก manual ได้ที่</p>
                  <span style={{ color: C.sub, fontSize: 13, fontFamily: "monospace", letterSpacing: 2 }}>
                    {shopInfo.totp_secret}
                  </span>
                </div>
                <button onClick={copySecret}
                  style={{ background: "none", border: "none", cursor: "pointer", color: secretCopied ? C.success : C.muted, marginLeft: 8 }}>
                  {secretCopied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>

              <label style={{ color: C.sub, fontSize: 13, display: "block", marginBottom: 5 }}>กรอกรหัส 6 หลักจาก Google Authenticator</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                style={{ ...inp, textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }}
                placeholder="000000"
                value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && handleComplete()}
                autoFocus
              />

              {errMsg && <ErrMsg text={errMsg} />}

              <Btn onClick={handleComplete} disabled={totpCode.length !== 6 || loading} loading={loading}>
                {loading ? "กำลังยืนยัน…" : "ยืนยันและเข้าสู่ระบบ"}
              </Btn>

              <button type="button" onClick={() => { setStep("pin"); setTotpCode(""); setErrMsg(""); }}
                style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                ← กลับแก้ PIN
              </button>
            </motion.div>
          )}

          {/* Done */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle size={48} color={C.success} style={{ marginBottom: 12 }} />
              <h2 style={{ color: C.text, fontWeight: 700, margin: "0 0 8px" }}>ตั้งค่าเสร็จสมบูรณ์!</h2>
              <p style={{ color: C.sub, fontSize: 14 }}>กำลังพาไปยังหลังร้าน…</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height: 4, flex: 1, borderRadius: 2,
          background: i < current ? C.accent : C.border,
          transition: "background .3s",
        }} />
      ))}
    </div>
  );
}

function ErrMsg({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <AlertCircle size={14} color={C.error} />
      <span style={{ color: C.error, fontSize: 13 }}>{text}</span>
    </div>
  );
}

function Btn({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        width: "100%", background: disabled ? C.card : `linear-gradient(135deg, ${C.accent}, ${C.accentDk})`,
        color: disabled ? C.muted : C.text, border: "none", borderRadius: 10,
        padding: "13px", fontSize: 15, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}>
      {loading && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
      {children}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </button>
  );
}
