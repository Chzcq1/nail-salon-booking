import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, ArrowDownLeft, ArrowUpRight, Gift, Upload, ChevronRight,
  Loader, CheckCircle, XCircle, Info, X,
  Lock, Eye, EyeOff, LogOut, ShieldCheck, ExternalLink,
  Mail, Copy, ChevronUp, Phone, User, Edit2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

/** Strip HTML tags → plain text (for clipboard copy) */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .trim();
}

// ── Session helpers ───────────────────────────────────────────────────────────
const SESSION_KEY = "wallet_token";
function getStoredToken(): string { return sessionStorage.getItem(SESSION_KEY) || ""; }
function setStoredToken(t: string) { sessionStorage.setItem(SESSION_KEY, t); }
function clearStoredToken() { sessionStorage.removeItem(SESSION_KEY); }

// ── Image compress → upload → return URL ─────────────────────────────────────
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

async function uploadSlipImage(file: File): Promise<string> {
  const base64 = await compressImage(file);
  const res = await fetch("/api/upload/slip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: base64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "อัปโหลดสลิปไม่สำเร็จ");
  }
  const { url } = await res.json();
  return url;
}

// ── PinInput component ────────────────────────────────────────────────────────
function PinInput({
  value, onChange, disabled = false, placeholder = "● ● ● ● ● ●",
}: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-center text-xl tracking-[0.5em] font-mono text-foreground placeholder:tracking-normal placeholder:text-sm placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:border-primary pr-10 disabled:opacity-50"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ── Order status helpers ──────────────────────────────────────────────────────
function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    approved: { label: "อนุมัติแล้ว", variant: "default" },
    pending: { label: "รอตรวจสอบ", variant: "secondary" },
    rejected: { label: "ไม่ผ่าน", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>;
}

function TxnIcon({ type }: { type: string }) {
  if (type === "topup") return <ArrowDownLeft size={16} className="text-green-400" />;
  if (type === "purchase") return <ArrowUpRight size={16} className="text-red-400" />;
  return <Gift size={16} className="text-muted-foreground" />;
}

function TxnBadge({ type }: { type: string }) {
  if (type === "topup") return <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30">เติมเงิน</Badge>;
  if (type === "purchase") return <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30">ซื้อสินค้า</Badge>;
  return <Badge variant="outline" className="text-[10px]">ปรับยอด</Badge>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface WalletData {
  email: string;
  display_name: string | null;
  phone_number: string | null;
  balance: number;
  transactions: Array<{
    id: number;
    type: string;
    amount: number;
    description: string;
    created_at: string | null;
  }>;
}

interface MyOrder {
  id: number;
  product_name: string;
  status: string;
  payment_type: string;
  invite_links: string[];
  created_at: string | null;
}

// ── Login Screen ──────────────────────────────────────────────────────────────
type LoginStep = "email" | "otp_entry" | "pin" | "create_pin" | "confirm_pin";

function LoginScreen({ onLoggedIn }: { onLoggedIn: (token: string, email: string) => void }) {
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [inputEmail, setInputEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionToken, setSessionToken] = useState("");
  const [verifiedToken, setVerifiedToken] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [isForgotPin, setIsForgotPin] = useState(false);
  const [otpSendCount, setOtpSendCount] = useState(0);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  function startCooldown(secs: number) {
    setOtpCooldown(secs);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((c) => {
        if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function checkEmailAndProceed() {
    const trimmed = inputEmail.trim().toLowerCase();
    if (!trimmed) { setError("กรุณาใส่อีเมล"); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) { setError("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/wallet/check?email=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      setEmail(trimmed);
      if (data.exists && data.has_pin) {
        setStep("pin");
      } else {
        await sendOtp(trimmed);
      }
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp(targetEmail?: string, mode = "login") {
    const toEmail = targetEmail || email;
    setLoading(true); setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000); // 20s timeout
    try {
      const res = await fetch("/api/wallet/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: toEmail, mode }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        const waitMatch = (data.detail || "").match(/(\d+)\s*วินาที/);
        if (waitMatch) startCooldown(parseInt(waitMatch[1]));
        throw new Error(data.detail || "ส่ง OTP ไม่สำเร็จ");
      }
      setSessionToken(data.session_token);
      setStep("otp_entry");
      setOtpSendCount((c) => c + 1);
      startCooldown(60);
    } catch (e: any) {
      if (e.name === "AbortError") {
        setError("การส่งอีเมลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง");
      } else {
        setError(e.message || "ส่ง OTP ไม่สำเร็จ");
      }
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (otpInput.length !== 6) { setError("กรุณาใส่ OTP 6 หลัก"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/wallet/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_token: sessionToken, otp: otpInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "OTP ไม่ถูกต้อง");
      setVerifiedToken(data.verified_token);
      setStep("create_pin");
      setPin(""); setConfirmPin("");
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function startForgotPin() {
    setIsForgotPin(true);
    await sendOtp(email, "reset");
  }

  async function doAuth() {
    setError(""); setLoading(true);
    try {
      if (step === "pin") {
        if (!pin) { setError("กรุณาใส่ PIN"); setLoading(false); return; }
        const res = await fetch("/api/wallet/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, pin }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "PIN ไม่ถูกต้อง");
        setStoredToken(data.token);
        onLoggedIn(data.token, email);

      } else if (step === "create_pin") {
        if (pin.length < 4) { setError("PIN ต้องมีอย่างน้อย 4 หลัก"); setLoading(false); return; }
        setStep("confirm_pin"); setLoading(false); return;

      } else if (step === "confirm_pin") {
        if (pin !== confirmPin) { setError("PIN ไม่ตรงกัน กรุณาลองใหม่"); setLoading(false); return; }

        if (isForgotPin) {
          const res = await fetch("/api/wallet/reset-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ verified_token: verifiedToken, new_pin: pin, confirm_pin: confirmPin }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
          setStoredToken(data.token);
          onLoggedIn(data.token, email);
        } else {
          const res = await fetch("/api/wallet/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, pin, verified_token: verifiedToken }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
          setStoredToken(data.token);
          onLoggedIn(data.token, email);
        }
      }
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  const stepTitle: Record<LoginStep, string> = {
    email: "เข้าสู่ระบบกระเป๋าเครดิต",
    otp_entry: isForgotPin ? "ยืนยัน OTP เพื่อรีเซ็ท PIN" : "ยืนยันอีเมล",
    pin: "ใส่ PIN",
    create_pin: isForgotPin ? "ตั้ง PIN ใหม่" : "ตั้ง PIN",
    confirm_pin: "ยืนยัน PIN",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={26} className="text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">{stepTitle[step]}</h1>
          {email && step !== "email" && (
            <p className="text-sm text-muted-foreground mt-1">{email}</p>
          )}
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={step + (isForgotPin ? "-forgot" : "")}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >

              {/* ── STEP: email ──────────────────────────────────────────────── */}
              {step === "email" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">
                      อีเมล
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="example@email.com"
                        value={inputEmail}
                        onChange={(e) => { setInputEmail(e.target.value); setError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && checkEmailAndProceed()}
                        disabled={loading}
                        className="w-full bg-muted border border-border rounded-xl px-4 py-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                      />
                    </div>
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <Button
                    className="w-full"
                    onClick={checkEmailAndProceed}
                    disabled={!inputEmail.trim() || loading}
                  >
                    {loading ? <Loader size={14} className="animate-spin" /> : <>ถัดไป <ChevronRight size={16} /></>}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    ใส่อีเมลเพื่อเข้าสู่ระบบหรือสร้างบัญชีใหม่
                  </p>
                </>
              )}

              {/* ── STEP: otp_entry ──────────────────────────────────────────── */}
              {step === "otp_entry" && (
                <>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs text-primary">
                    <p className="font-medium mb-0.5">📧 ตรวจสอบอีเมลของคุณ</p>
                    <p className="opacity-80">ส่งรหัส OTP 6 หลักไปที่ <strong>{email}</strong> แล้ว (หมดอายุใน 10 นาที)</p>
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 text-xs text-yellow-400 flex gap-2">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <p>หากไม่เจออีเมล ให้ตรวจสอบใน <strong>โฟลเดอร์สแปม / จดหมายขยะ</strong> ด้วยนะครับ</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">รหัส OTP (6 หลัก)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={otpInput}
                      onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                      disabled={loading}
                      className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono text-foreground placeholder:tracking-normal placeholder:text-base placeholder:font-sans focus:outline-none focus:border-primary disabled:opacity-50"
                    />
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <Button
                    className="w-full"
                    onClick={verifyOtp}
                    disabled={otpInput.length < 6 || loading}
                  >
                    {loading ? <Loader size={14} className="animate-spin" /> : "ยืนยัน OTP"}
                  </Button>
                  <button
                    onClick={() => { if (otpCooldown === 0) sendOtp(email, isForgotPin ? "reset" : "login"); }}
                    disabled={otpCooldown > 0 || loading}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors disabled:opacity-50"
                  >
                    {otpCooldown > 0 ? `ขอ OTP ใหม่ได้ใน ${otpCooldown} วินาที` : "📨 ส่ง OTP อีกครั้ง"}
                  </button>
                  <button
                    onClick={() => { setStep("email"); setOtpInput(""); setError(""); setIsForgotPin(false); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                  >
                    ← เปลี่ยนอีเมล
                  </button>
                </>
              )}

              {/* ── STEP: pin ────────────────────────────────────────────────── */}
              {step === "pin" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">PIN ของคุณ</label>
                    <PinInput value={pin} onChange={setPin} disabled={loading} />
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <Button className="w-full" onClick={doAuth} disabled={pin.length < 4 || loading}>
                    {loading ? <Loader size={14} className="animate-spin" /> : "เข้าสู่กระเป๋า"}
                  </Button>
                  <button
                    onClick={startForgotPin}
                    disabled={loading}
                    className="w-full text-xs text-primary/70 hover:text-primary text-center transition-colors"
                  >
                    {loading ? "กำลังโหลด..." : "🔑 ลืม PIN? รีเซ็ทผ่าน OTP อีเมล"}
                  </button>
                  <button
                    onClick={() => { setStep("email"); setPin(""); setError(""); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                  >
                    ← เปลี่ยนอีเมล
                  </button>
                </>
              )}

              {/* ── STEP: create_pin ─────────────────────────────────────────── */}
              {step === "create_pin" && (
                <>
                  <div className={`rounded-xl p-3 text-xs border ${isForgotPin ? "bg-amber-500/10 border-amber-500/20 text-amber-400" : "bg-primary/5 border-primary/20 text-primary"}`}>
                    <p className="font-medium mb-0.5">
                      {isForgotPin ? "🔑 ยืนยันตัวตนสำเร็จ! ตั้ง PIN ใหม่" : "✅ ยืนยันตัวตนสำเร็จ! ตั้ง PIN ของคุณ"}
                    </p>
                    <p className="opacity-80">PIN ใช้ล็อคอินทุกครั้ง ตัวเลข 4–6 หลัก อย่าบอกใคร</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">ตั้ง PIN (4–6 หลัก)</label>
                    <PinInput value={pin} onChange={setPin} placeholder="● ● ● ●" disabled={loading} />
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <Button className="w-full" onClick={doAuth} disabled={pin.length < 4 || loading}>
                    {loading ? <Loader size={14} className="animate-spin" /> : <>ถัดไป <ChevronRight size={16} /></>}
                  </Button>
                </>
              )}

              {/* ── STEP: confirm_pin ────────────────────────────────────────── */}
              {step === "confirm_pin" && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-1.5">ยืนยัน PIN อีกครั้ง</label>
                    <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="● ● ● ●" disabled={loading} />
                  </div>
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <Button className="w-full" onClick={doAuth} disabled={confirmPin.length < 4 || loading}>
                    {loading
                      ? <Loader size={14} className="animate-spin" />
                      : isForgotPin ? "บันทึก PIN ใหม่" : "สร้างบัญชีและเข้าสู่ระบบ"}
                  </Button>
                  <button
                    onClick={() => { setStep("create_pin"); setConfirmPin(""); setError(""); }}
                    className="w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
                  >
                    ← แก้ไข PIN
                  </button>
                </>
              )}

            </motion.div>
          </AnimatePresence>

          <button
            onClick={() => window.history.back()}
            className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground text-center transition-colors"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** ลบคำว่า "(API)" หรือ "API" ที่ติดมากับชื่อสินค้าออก ไม่ให้แสดงกับลูกค้า */
function cleanProductName(name: string): string {
  return name
    .replace(/\(\s*API\s*\)/gi, "")
    .replace(/\bAPI\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── My Orders tab ─────────────────────────────────────────────────────────────
// ── GafiwOrderCard — แสดงประวัติซื้อจาก API (พับ/กางดูรหัสสินค้าได้) ─────────
function GafiwOrderCard({ order }: { order: any }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textdb: string = order.textdb || order.text_db || "";
  const displayName = cleanProductName(order.name || "สินค้า");

  const copy = () => {
    if (!textdb) return;
    navigator.clipboard.writeText(stripHtml(textdb)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const dateStr = order.date
    ? (() => {
        try {
          return new Date(order.date).toLocaleDateString("th-TH", {
            day: "numeric", month: "short", year: "2-digit",
            hour: "2-digit", minute: "2-digit",
          });
        } catch { return String(order.date); }
      })()
    : "";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {order.imageapi && (
            <img src={order.imageapi} alt="" className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{dateStr}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 shrink-0">สำเร็จ</Badge>
      </div>

      {textdb ? (
        <div className="bg-muted/60 border border-border rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors"
          >
            <p className="text-[11px] font-medium text-muted-foreground">รหัสสินค้าที่ซื้อ</p>
            <ChevronUp
              size={14}
              className={`text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : "rotate-0"}`}
            />
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex items-center justify-end">
                    <button onClick={copy}
                      className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded transition-colors ${copied ? "text-green-400" : "text-primary hover:text-primary/80"}`}>
                      {copied ? <><CheckCircle size={11} /> คัดลอกแล้ว!</> : <><Copy size={11} /> คัดลอกรหัส</>}
                    </button>
                  </div>
                  <div className="text-xs text-foreground leading-relaxed bg-background/40 border border-border/50 rounded-lg p-2.5 whitespace-pre-wrap">
                    {stripHtml(textdb)}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <div className="bg-muted/30 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
          ไม่มีข้อมูลเพิ่มเติม
        </div>
      )}
    </motion.div>
  );
}


interface StoreSettings {
  topup_slip_enabled: string;
  topup_truemoney_enabled: string;
  bank_name?: string;
  bank_account?: string;
  bank_qr_url?: string;
}

// ── Main WalletPage ───────────────────────────────────────────────────────────
export default function WalletPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [token, setToken] = useState(getStoredToken);
  const [email, setEmail] = useState("");
  const [logoutMsg, setLogoutMsg] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupType, setTopupType] = useState<"slip" | "truemoney">("truemoney");
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [voucherLink, setVoucherLink] = useState("");
  const [topupResult, setTopupResult] = useState<{ ok: boolean; message: string; amount?: number } | null>(null);
  const [topupError, setTopupError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile setup state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  const { data: storeSettings } = useQuery<StoreSettings>({
    queryKey: ["store-settings-topup"],
    queryFn: () => fetch("/api/store-settings").then(r => r.json()),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  const slipEnabled = (storeSettings?.topup_slip_enabled ?? "on") === "on";
  const trueMoneyEnabled = (storeSettings?.topup_truemoney_enabled ?? "on") === "on";

  const walletQuery = useQuery<WalletData>({
    queryKey: ["wallet-me", token],
    queryFn: async () => {
      const res = await fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) { clearStoredToken(); setToken(""); throw new Error("session หมดอายุ"); }
      return res.json();
    },
    enabled: !!token,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (walletQuery.data?.email) setEmail(walletQuery.data.email);
    // Auto-open profile setup when name is missing
    if (walletQuery.data && !walletQuery.data.display_name) {
      setShowProfileModal(true);
    }
  }, [walletQuery.data?.email, walletQuery.data?.display_name]); // eslint-disable-line

  async function saveProfile() {
    if (!profileName.trim()) { setProfileError("กรุณาใส่ชื่อ"); return; }
    if (!profilePhone.trim()) { setProfileError("กรุณาใส่เบอร์โทร"); return; }
    setProfileLoading(true); setProfileError("");
    try {
      const res = await fetch("/api/wallet/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: profileName.trim(), phone_number: profilePhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "บันทึกไม่สำเร็จ");
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
      setShowProfileModal(false);
    } catch (e: any) {
      setProfileError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setProfileLoading(false);
    }
  }

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const slipMutation = useMutation({
    mutationFn: async () => {
      if (!slipFile) throw new Error("กรุณาแนบสลีป");
      const proofUrl = await uploadSlipImage(slipFile);
      const res = await fetch("/api/wallet/topup/slip", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ payment_proof: proofUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      return data;
    },
    onSuccess: (data) => {
      setTopupResult({ ok: true, message: data.auto_approved ? "เติมเงินสำเร็จ! เพิ่มเครดิตเรียบร้อย" : "ส่งคำขอแล้ว รอแอดมินอนุมัติ", amount: data.auto_approved ? data.balance : undefined });
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e: Error) => setTopupError(e.message),
  });

  const tmMutation = useMutation({
    mutationFn: async () => {
      const link = voucherLink.trim();
      if (!link) throw new Error("กรุณาใส่ลิงก์ซอง");
      // Validate: either exact TrueMoney gift URL or a bare 18+ alphanumeric voucher code
      let isValid = false;
      try {
        const u = new URL(link);
        isValid = u.hostname === "gift.truemoney.com" && u.pathname === "/campaign/" && /^[A-Za-z0-9]+$/.test(u.searchParams.get("v") ?? "");
      } catch {
        // Not a URL — try bare code format
        isValid = /^[A-Za-z0-9]{18,32}$/.test(link);
      }
      if (!isValid) throw new Error("ลิงก์ไม่ถูกต้อง ต้องเป็น https://gift.truemoney.com/campaign/?v=XXXX หรือรหัสซอง 18–32 ตัวอักษร");
      const res = await fetch("/api/wallet/topup/truemoney", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({ voucher: voucherLink.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      return data;
    },
    onSuccess: (data) => {
      setTopupResult({ ok: true, message: data.auto_approved ? `แลกซองสำเร็จ! ได้รับ ${data.amount} เครดิต` : (data.message || "ส่งคำขอแล้ว รอแอดมินอนุมัติ"), amount: data.amount });
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e: Error) => setTopupError(e.message),
  });

  const handleLogout = () => { clearStoredToken(); setToken(""); setEmail(""); qc.clear(); setLogoutMsg(true); };
  const handleTopupClose = () => {
    setTopupModal(false); setSlipFile(null); setSlipPreview(null);
    setVoucherLink(""); setTopupResult(null); setTopupError("");
  };
  const handleTopupOpen = () => {
    // Always reset to fresh form state when opening
    setTopupResult(null); setTopupError("");
    setSlipFile(null); setSlipPreview(null); setVoucherLink("");
    if (!slipEnabled && trueMoneyEnabled) setTopupType("truemoney");
    if (slipEnabled && !trueMoneyEnabled) setTopupType("slip");
    setTopupModal(true);
  };
  const handleTopupSubmit = () => { setTopupError(""); if (topupType === "slip") slipMutation.mutate(); else tmMutation.mutate(); };
  const isPending = slipMutation.isPending || tmMutation.isPending;
  const noTopupAvailable = !slipEnabled && !trueMoneyEnabled;

  if (!token) {
    return (
      <>
        {logoutMsg && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600/90 text-white text-sm px-4 py-2 rounded-full shadow-lg animate-in fade-in slide-in-from-top-2">
            ออกจากระบบแล้ว
          </div>
        )}
        <LoginScreen onLoggedIn={(tok, em) => { setToken(tok); setEmail(em); setLogoutMsg(false); }} />
      </>
    );
  }

  const balance = walletQuery.data?.balance ?? 0;
  const transactions = walletQuery.data?.transactions ?? [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => setLocation("/")} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
            <ChevronRight size={14} className="rotate-180" /> หน้าร้าน
          </button>
          <span className="text-sm font-semibold text-foreground truncate max-w-[180px]">{email || "..."}</span>
          <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <LogOut size={13} /> ออก
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Balance card */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary/20 via-primary/10 to-transparent border border-primary/30 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0 flex-1">
              {walletQuery.data?.display_name ? (
                <>
                  <p className="text-base font-bold text-foreground leading-tight">{walletQuery.data.display_name}</p>
                  {walletQuery.data?.phone_number && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone size={11} /> {walletQuery.data.phone_number}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-0.5">บัญชี</p>
                  <p className="text-sm font-semibold text-foreground truncate">{email || "..."}</p>
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
                <Wallet size={18} className="text-primary" />
              </div>
              <button onClick={() => {
                setProfileName(walletQuery.data?.display_name || "");
                setProfilePhone(walletQuery.data?.phone_number || "");
                setProfileError("");
                setShowProfileModal(true);
              }} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                <Edit2 size={10} /> แก้ไข
              </button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-1">ยอดเครดิตคงเหลือ</p>
          {walletQuery.isLoading ? (
            <div className="h-9 w-32 bg-muted/50 animate-pulse rounded" />
          ) : (
            <p className="text-3xl font-bold text-foreground">
              {balance.toLocaleString("th-TH")}
              <span className="text-base font-normal text-muted-foreground ml-1">เครดิต</span>
            </p>
          )}
          <div className="mt-4">
            <Button size="sm" className="w-full gap-1.5" onClick={handleTopupOpen} disabled={noTopupAvailable}>
              <Plus size={14} /> {noTopupAvailable ? "ปิดรับเติมเงินชั่วคราว" : "เติมเครดิต"}
            </Button>
          </div>
        </motion.div>

        {walletQuery.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400 flex items-center justify-between">
            <span>กรุณาเข้าสู่ระบบใหม่</span>
            <Button size="sm" variant="outline" onClick={handleLogout} className="text-xs">เข้าสู่ระบบ</Button>
          </div>
        )}

        {/* Transaction history (no unused orders tab) */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-3">ประวัติธุรกรรม</p>
          {walletQuery.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/30 animate-pulse rounded-xl" />)}</div>
          ) : transactions.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Wallet size={28} className="text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">ยังไม่มีธุรกรรม</p>
              <p className="text-xs text-muted-foreground mt-1">เติมเครดิตเพื่อใช้เป็นมัดจำการจองคิว</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map(t => (
                <motion.div key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${t.type === "topup" ? "bg-green-500/15" : t.type === "purchase" ? "bg-red-500/15" : "bg-muted"}`}>
                    <TxnIcon type={t.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{t.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <TxnBadge type={t.type} />
                      <span className="text-[11px] text-muted-foreground">
                        {t.created_at ? new Date(t.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {t.amount >= 0 ? "+" : ""}{t.amount.toLocaleString("th-TH")}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Top-up dialog */}
      <Dialog open={topupModal} onOpenChange={handleTopupClose}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90dvh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="text-base">เติมเครดิต</DialogTitle>
          </DialogHeader>

          {topupResult ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4 py-4 text-center px-6 pb-6">
              {topupResult.ok ? <CheckCircle size={48} className="text-green-400" /> : <XCircle size={48} className="text-red-400" />}
              <div>
                <p className="font-semibold text-foreground">{topupResult.message}</p>
                {topupResult.amount != null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    ยอดเครดิตปัจจุบัน: <span className="text-foreground font-medium">{walletQuery.data?.balance?.toLocaleString("th-TH")} เครดิต</span>
                  </p>
                )}
              </div>
              <Button onClick={handleTopupClose} className="w-full">ปิด</Button>
            </motion.div>
          ) : (
            <div className="overflow-y-auto flex-1 px-6 pb-6">
            <div className="space-y-4 pt-1">
              {slipEnabled && trueMoneyEnabled && (
                <div className="flex rounded-lg bg-muted p-1 gap-1">
                  {([
                    { key: "truemoney", label: "🧧 TrueMoney" },
                    { key: "slip", label: "🧾 โอนเงิน/สลีป" },
                  ] as const).map(({ key, label }) => (
                    <button key={key} onClick={() => setTopupType(key)}
                      className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${topupType === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {topupType === "truemoney" && (
                <div className="space-y-3">
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-xs text-orange-300">
                    <p className="font-medium mb-1">🧧 แลกซอง TrueMoney</p>
                    <p className="opacity-80">วางลิงก์ซองของขวัญ TrueMoney จาก Wallet App</p>
                  </div>
                  <input
                    type="url"
                    placeholder="https://gift.truemoney.com/campaign/?v=..."
                    value={voucherLink}
                    onChange={(e) => setVoucherLink(e.target.value)}
                    className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              {topupType === "slip" && (
                <div className="space-y-3">
                  {/* Bank info card */}
                  {(storeSettings?.bank_name || storeSettings?.bank_account) && (
                    <div className="bg-green-500/10 border border-green-500/25 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">📤 โอนเงินมาที่</p>
                      <div className="space-y-2">
                        {storeSettings?.bank_name && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">ธนาคาร / ชื่อบัญชี</p>
                            <p className="text-sm font-semibold text-foreground">{storeSettings.bank_name}</p>
                          </div>
                        )}
                        {storeSettings?.bank_account && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5">เลขบัญชี</p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-mono font-bold text-foreground tracking-wider">{storeSettings.bank_account}</p>
                              <button
                                onClick={() => navigator.clipboard.writeText(storeSettings.bank_account!)}
                                className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded hover:bg-green-500/30 transition-colors"
                              >
                                คัดลอก
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {storeSettings?.bank_qr_url && (
                        <div className="flex justify-center pt-1">
                          <img
                            src={storeSettings.bank_qr_url}
                            alt="QR PromptPay"
                            className="w-40 h-40 object-contain rounded-lg bg-white p-1"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                    <p className="font-medium mb-1">🧾 อัปโหลดสลีปการโอนเงิน</p>
                    <p className="opacity-80">โอนเงินแล้วอัปโหลดภาพสลีปหรือสกรีนช็อตที่นี่ ระบบจะตรวจยอดเงินจากสลีปอัตโนมัติ</p>
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setSlipFile(f);
                    const url = URL.createObjectURL(f);
                    setSlipPreview(url);
                  }} />
                  {slipPreview ? (
                    <div className="relative">
                      <img src={slipPreview} alt="slip" className="w-full rounded-xl max-h-48 object-contain bg-muted" />
                      <button onClick={() => { setSlipFile(null); setSlipPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                        className="absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-black/80">
                        <X size={14} className="text-white" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => fileRef.current?.click()}
                      className="w-full border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
                      <Upload size={24} className="text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">กดเพื่ออัปโหลดสลีป</p>
                    </button>
                  )}
                </div>
              )}

              {topupError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-400">{topupError}</div>
              )}

              <Button
                className="w-full"
                onClick={handleTopupSubmit}
                disabled={isPending || (topupType === "slip" && !slipFile) || (topupType === "truemoney" && !voucherLink.trim())}
              >
                {isPending ? <><Loader size={14} className="animate-spin mr-2" /> กำลังส่ง...</> : "ส่งคำขอเติมเงิน"}
              </Button>
            </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Profile Setup Modal ── */}
      <Dialog open={showProfileModal} onOpenChange={(open) => {
        // Allow closing only if profile is already set
        if (!open && walletQuery.data?.display_name) setShowProfileModal(false);
      }}>
        <DialogContent className="bg-card border-border max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-base flex items-center gap-2">
              <User size={16} className="text-primary" />
              {walletQuery.data?.display_name ? "แก้ไขโปรไฟล์" : "ตั้งค่าโปรไฟล์ก่อนใช้งาน"}
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            {!walletQuery.data?.display_name && (
              <p className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl p-3">
                แอดมินต้องทราบชื่อและเบอร์เพื่อยืนยันการเติมเงินของคุณ กรุณากรอกให้ครบก่อนใช้งาน
              </p>
            )}

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <User size={12} /> ชื่อ-นามสกุล <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="สมชาย ใจดี"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Phone size={12} /> เบอร์โทรศัพท์ <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={profilePhone}
                onChange={e => setProfilePhone(e.target.value)}
                placeholder="0812345678"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
            </div>

            {profileError && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <XCircle size={13} /> {profileError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              {walletQuery.data?.display_name && (
                <button onClick={() => setShowProfileModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition">
                  ยกเลิก
                </button>
              )}
              <Button className="flex-1 gap-1.5" onClick={saveProfile} disabled={profileLoading}>
                {profileLoading ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                บันทึก
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
