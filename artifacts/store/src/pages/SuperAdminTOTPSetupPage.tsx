/**
 * SuperAdminTOTPSetupPage — ตั้งค่า TOTP สำหรับ Superadmin ครั้งแรก
 * Route: /superadmin/setup-totp
 * ต้องกรอก PIN ก่อน → scan QR → ยืนยัน code → เสร็จ
 */
import React, { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Shield, Copy, Check, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

const API = "/api/nail";

const S = {
  bg: "#0F1117", surface: "#1A1D27", card: "#21263A", border: "#2D3552",
  accent: "#6C8EFF", accentDk: "#4F72FF", success: "#22C55E",
  error: "#EF4444", text: "#E8EAF0", sub: "#A0A8C0", muted: "#6A7090",
} as const;

const inp: React.CSSProperties = {
  width: "100%", background: S.card, border: `1.5px solid ${S.border}`,
  borderRadius: 10, padding: "12px 14px", fontSize: 14, color: S.text,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};

export default function SuperAdminTOTPSetupPage() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<"pin" | "qr" | "done">("pin");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [qrData, setQrData] = useState<{ qr_code: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setErr(""); setLoading(true);
    try {
      const res = await fetch(`${API}/superadmin/totp/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "PIN ไม่ถูกต้อง");
      setQrData(d);
      setStep("qr");
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return setErr("กรุณากรอกรหัส 6 หลัก");
    setErr(""); setLoading(true);
    try {
      const res = await fetch(`${API}/superadmin/totp/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, totp_code: totpCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail ?? "รหัส TOTP ไม่ถูกต้อง");
      setStep("done");
      setTimeout(() => navigate("/superadmin"), 2500);
    } catch (e: any) {
      setErr(e.message);
    } finally { setLoading(false); }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(qrData?.secret ?? "").then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: "36px 32px", width: "100%", maxWidth: 420 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ background: `${S.accent}22`, borderRadius: 12, padding: 10 }}>
            <Shield size={24} color={S.accent} />
          </div>
          <div>
            <h1 style={{ color: S.text, fontSize: 18, fontWeight: 700, margin: 0 }}>ตั้งค่า TOTP</h1>
            <p style={{ color: S.muted, fontSize: 13, margin: 0 }}>CSC Super Admin — Google Authenticator</p>
          </div>
        </div>

        {step === "pin" && (
          <form onSubmit={handlePinSubmit}>
            <p style={{ color: S.sub, fontSize: 14, margin: "0 0 20px", lineHeight: 1.6 }}>
              กรอก PIN (NAIL_SUPER_ADMIN_KEY) ก่อนเพื่อสร้าง QR Code
            </p>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input type={showPin ? "text" : "password"} style={{ ...inp, paddingRight: 44 }}
                placeholder="PIN ของ superadmin" value={pin}
                onChange={e => setPin(e.target.value)} autoFocus />
              <button type="button" onClick={() => setShowPin(!showPin)}
                style={{ position: "absolute", right: 12, top: 14, background: "none", border: "none", cursor: "pointer", color: S.muted }}>
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {err && <p style={{ color: S.error, fontSize: 13, marginBottom: 12 }}>{err}</p>}
            <button type="submit" disabled={!pin || loading}
              style={{ width: "100%", background: !pin || loading ? S.card : `linear-gradient(135deg,${S.accent},${S.accentDk})`, color: S.text, border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: !pin || loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: !pin ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />กำลังสร้าง QR…</> : "สร้าง QR Code →"}
            </button>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </form>
        )}

        {step === "qr" && qrData && (
          <form onSubmit={handleConfirm}>
            <p style={{ color: S.sub, fontSize: 14, margin: "0 0 16px", lineHeight: 1.6 }}>
              เปิด Google Authenticator → กด + → Scan QR Code
            </p>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img src={qrData.qr_code} alt="TOTP QR" style={{ width: 180, height: 180, borderRadius: 12, border: `2px solid ${S.border}` }} />
            </div>
            <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ color: S.muted, fontSize: 11, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: 1 }}>หรือกรอก manual</p>
                <span style={{ color: S.sub, fontSize: 12, fontFamily: "monospace", letterSpacing: 2 }}>{qrData.secret}</span>
              </div>
              <button type="button" onClick={copySecret} style={{ background: "none", border: "none", cursor: "pointer", color: copied ? S.success : S.muted }}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <label style={{ color: S.sub, fontSize: 13, display: "block", marginBottom: 6 }}>กรอกรหัส 6 หลักจาก Google Authenticator เพื่อยืนยัน</label>
            <input type="text" inputMode="numeric" maxLength={6} style={{ ...inp, textAlign: "center", fontSize: 22, letterSpacing: 8, fontWeight: 700, marginBottom: 12 }}
              placeholder="000000" value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))} autoFocus />
            {err && <p style={{ color: S.error, fontSize: 13, marginBottom: 12 }}>{err}</p>}
            <button type="submit" disabled={totpCode.length !== 6 || loading}
              style={{ width: "100%", background: totpCode.length !== 6 || loading ? S.card : `linear-gradient(135deg,${S.accent},${S.accentDk})`, color: S.text, border: "none", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: totpCode.length !== 6 || loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: totpCode.length !== 6 ? 0.5 : 1 }}>
              {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />กำลังยืนยัน…</> : "ยืนยันการตั้งค่า TOTP"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <CheckCircle size={48} color={S.success} style={{ marginBottom: 12 }} />
            <h2 style={{ color: S.text, fontWeight: 700, margin: "0 0 8px" }}>ตั้งค่าสำเร็จ!</h2>
            <p style={{ color: S.sub, fontSize: 14 }}>กำลังพาไปยัง Superadmin…</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
