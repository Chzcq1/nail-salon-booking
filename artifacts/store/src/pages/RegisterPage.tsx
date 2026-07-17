/**
 * RegisterPage — หน้าสมัครร้านใหม่ (3-Step Wizard)
 * Design: Cinematic split-panel — Instrument Serif / Inter, black & white
 * Route: /register
 * Flow: Step1 เลือกแพ็กเกจ → Step2 กรอกข้อมูล → Step3 ชำระเงิน
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Typewriter } from "@/components/Typewriter";
import {
  CheckCircle, AlertCircle, Upload, ArrowRight, ArrowLeft,
  ShieldCheck, Clock, Zap, Copy, Check, Lock, CreditCard,
  Smartphone, Calendar, Bell, Palette, BarChart2, Users, Wifi,
  Store, Loader2, ChevronDown,
} from "lucide-react";

const API = "/api/nail";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  black:     "#000000",
  white:     "#FFFFFF",
  gray:      "#6F6F6F",
  grayLight: "#F5F5F5",
  border:    "#E5E5E5",
  sage:      "#16A34A",
  coral:     "#DC2626",
  muted:     "#9CA3AF",
  ink:       "#1A1A1A",
} as const;

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4";

const TYPEWRITER_WORDS = ["ร้านทำเล็บ", "ร้านนวด", "ร้านสปา", "ร้านความงาม", "ธุรกิจในฝัน"];

const FEATURES = [
  { icon: <Calendar size={14} />,   text: "ระบบจองคิวออนไลน์ 24/7" },
  { icon: <Smartphone size={14} />, text: "รองรับทุกอุปกรณ์ (iOS, Android, PC)" },
  { icon: <Bell size={14} />,       text: "แจ้งเตือนลูกค้าอัตโนมัติ" },
  { icon: <Palette size={14} />,    text: "ปรับสี ธีม โลโก้ร้านได้เอง" },
  { icon: <BarChart2 size={14} />,  text: "รายงานสถิติและรายได้" },
  { icon: <CreditCard size={14} />, text: "กระเป๋าเงินลูกค้า + มัดจำ" },
  { icon: <Users size={14} />,      text: "จัดการพนักงานหลายคน" },
  { icon: <Wifi size={14} />,       text: "อัปเดตฟีเจอร์ใหม่ฟรีตลอด" },
];

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes reg-spin  { to { transform: rotate(360deg) } }
  @keyframes reg-blink { 0%,100%{opacity:1} 50%{opacity:0} }
  .reg-inp:focus { border-color: ${C.black} !important; outline: none; }
  @media (max-width: 767px) {
    .reg-split  { flex-direction: column !important; }
    .reg-hero   { width: 100% !important; min-height: unset !important; height: auto !important; }
    .reg-hero-body {
      min-height: unset !important;
      padding: 22px 22px 26px !important;
      justify-content: flex-start !important;
      gap: 18px !important;
    }
    .reg-hero-compact  { display: none !important; }
    .reg-hero-badges   { display: none !important; }
    .reg-hero-copy     { display: none !important; }
    .reg-hero-headline h1 { font-size: 28px !important; margin-bottom: 0 !important; }
    .reg-hero-headline p  { display: none !important; }
    .reg-form   { padding: 24px 18px 60px !important; }
    .reg-topbar { display: none !important; }
    .reg-feat-grid { grid-template-columns: 1fr !important; }
    .reg-bank-row  { flex-direction: column !important; align-items: flex-start !important; gap: 6px !important; }
    .reg-bank-acct { width: 100% !important; justify-content: space-between !important; }
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .reg-hero { width: 38% !important; }
    .reg-form { padding: 36px 36px 60px !important; }
  }
`;

// ── Utilities ─────────────────────────────────────────────────────────────────
function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = img.width  * scale;
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

// ── Cinematic video with fade loop ────────────────────────────────────────────
function CinematicVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const FADE = 0.5;

    const tick = () => {
      if (v.duration && !isNaN(v.duration)) {
        const t = v.currentTime, d = v.duration;
        v.style.opacity =
          t < FADE      ? String(t / FADE)
          : t > d - FADE ? String((d - t) / FADE)
          : "1";
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const onEnded = () => {
      v.style.opacity = "0";
      setTimeout(() => { v.currentTime = 0; v.play().catch(() => {}); }, 100);
    };

    v.play().catch(() => {});
    rafRef.current = requestAnimationFrame(tick);
    v.addEventListener("ended", onEnded);
    return () => {
      cancelAnimationFrame(rafRef.current);
      v.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={VIDEO_URL}
      muted playsInline loop={false}
      style={{
        position: "absolute", top: "15%", left: 0, right: 0, bottom: 0,
        width: "100%", height: "85%", objectFit: "cover", opacity: 0,
      }}
    />
  );
}

// ── Left hero panel ───────────────────────────────────────────────────────────
function HeroPanel() {
  return (
    <div
      className="reg-hero"
      style={{
        position: "relative", width: "42%", minHeight: "100vh",
        background: "#080808", overflow: "hidden", flexShrink: 0,
      }}
    >
      <CinematicVideo />

      {/* Gradient overlays */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,#000 0%,rgba(0,0,0,0.06) 35%,rgba(0,0,0,0.06) 65%,#000 100%)", zIndex: 1 }} />
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.36)", zIndex: 1 }} />

      {/* Mobile compact bar (hidden on desktop via CSS) */}
      <div className="reg-hero-compact" style={{
        display: "none", position: "relative", zIndex: 2,
        alignItems: "center", gap: 10, padding: "14px 20px",
      }}>
        <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, color: C.white, letterSpacing: "-0.3px" }}>
          CSC<sup style={{ fontSize: 10, verticalAlign: "super" }}>®</sup>
        </span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10.5, fontFamily: "'Inter',sans-serif", borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: 10 }}>
          Chain System Care
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontFamily: "'Inter',sans-serif", color: "rgba(255,255,255,0.55)" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
          เปิดรับสมัครอยู่
        </span>
      </div>

      {/* Desktop/tablet full content */}
      <div className="reg-hero-body" style={{
        position: "relative", zIndex: 2,
        height: "100%", minHeight: "100vh",
        display: "flex", flexDirection: "column",
        justifyContent: "space-between",
        padding: "44px 44px", boxSizing: "border-box",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, color: C.white, letterSpacing: "-0.3px", lineHeight: 1 }}>
            CSC<sup style={{ fontSize: 12, verticalAlign: "super" }}>®</sup>
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "'Inter',sans-serif", borderLeft: "1px solid rgba(255,255,255,0.15)", paddingLeft: 10 }}>
            Chain System Care
          </span>
        </div>

        {/* Headline */}
        <div className="reg-hero-headline">
          {/* Live badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 100, padding: "5px 14px", marginBottom: 24,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block", boxShadow: "0 0 8px #4ade80" }} />
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11.5, fontFamily: "'Inter',sans-serif", fontWeight: 500, letterSpacing: "0.04em" }}>
              เปิดรับสมัครร้านใหม่แล้ว
            </span>
          </div>

          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontSize: "clamp(34px, 3vw, 50px)",
            color: C.white, lineHeight: 1.06,
            letterSpacing: "-1.5px", margin: "0 0 20px", fontWeight: 400,
          }}>
            เปิด{" "}
            <Typewriter
              texts={TYPEWRITER_WORDS}
              typedColor="rgba(255,255,255,0.6)"
              cursorColor="rgba(255,255,255,0.8)"
              cursorChar="|"
              typeSpeed={70}
              deleteSpeed={35}
              holdMs={1800}
            />
            <br />ของคุณ<br />กับ CSC
          </h1>

          <p style={{
            color: "rgba(255,255,255,0.52)", fontSize: 13.5,
            fontFamily: "'Inter',sans-serif", lineHeight: 1.75,
            margin: "0 0 32px", maxWidth: 270, fontWeight: 400,
          }}>
            ระบบจองคิวออนไลน์ครบวงจร สำหรับร้านทำเล็บ สปา และ beauty ทุกประเภท
          </p>

          {/* Trust badges */}
          <div className="reg-hero-badges" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: <ShieldCheck size={13} />, label: "ข้อมูลปลอดภัย SSL 100%",      color: "#4ade80" },
              { icon: <Clock size={13} />,       label: "อนุมัติภายใน 24 ชั่วโมง",      color: "#60a5fa" },
              { icon: <Zap size={13} />,         label: "ตั้งค่าเองได้ ไม่ต้องรอ IT",   color: "#f9a8d4" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
                <span style={{ color: item.color, flexShrink: 0 }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        <div className="reg-hero-copy" style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, fontFamily: "'Inter',sans-serif" }}>
          © 2025 Chain System Care. All rights reserved.
        </div>
      </div>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: "ค่าบริการเท่าไหร่ มีค่าใช้จ่ายแอบแฝงไหม?",
    a: "ขณะนี้ ฿99/เดือน สำหรับ 20 ร้านแรกที่สมัครเข้ามา — ราคานี้อาจปรับสูงขึ้นในอนาคต ไม่มีค่า setup ไม่มีค่าคอมมิชชัน และไม่มีสัญญาระยะยาวผูกมัด",
  },
  {
    q: "ชำระผ่านช่องทางไหนได้บ้าง?",
    a: "โอนผ่านธนาคาร หรือส่งซอง TrueMoney Gift ระบบจะตรวจสอบยอดให้อัตโนมัติ",
  },
  {
    q: "ยกเลิกได้ไหม ถ้าไม่อยากใช้ต่อ?",
    a: "ยกเลิกได้ทุกเวลา ไม่มีสัญญาผูกมัด ไม่มีค่าปรับ",
  },
  {
    q: "หลังสมัครแล้วต้องรอนานไหมกว่าจะใช้งานได้?",
    a: "ทีมงานตรวจสอบสลิปและเปิดร้านให้ภายใน 24 ชั่วโมง หลังจากนั้นคุณตั้งค่าร้านได้เลยทันที",
  },
  {
    q: "ต้องมีความรู้ด้าน IT หรือคอมพิวเตอร์ไหม?",
    a: "ไม่ต้องเลย ใช้งานผ่านมือถือได้ทุกขั้นตอน หน้าจอออกแบบมาเพื่อให้เจ้าของร้านใช้ได้ง่ายที่สุด",
  },
  {
    q: "ลูกค้าของเราจองผ่านช่องทางไหน?",
    a: "ร้านของคุณจะได้ลิงก์ส่วนตัว เช่น csc.app/ชื่อร้าน ลูกค้าเปิดจากมือถือแล้วจองได้เลย ไม่ต้องโหลดแอปใดๆ",
  },
  {
    q: "รองรับหลายสาขาไหม?",
    a: "1 บัญชีใช้สำหรับ 1 สาขา ถ้าต้องการหลายสาขาสมัครแยกได้ หรือติดต่อทีมงานเพื่อสอบถามแพ็กเกจพิเศษ",
  },
  {
    q: "ข้อมูลลูกค้าและการจองปลอดภัยไหม? ต้องการความช่วยเหลือเพิ่มเติมได้ที่ไหน?",
    a: "ข้อมูลทั้งหมดเข้ารหัสและเก็บบนเซิร์ฟเวอร์ที่ปลอดภัย เจ้าของร้านเท่านั้นที่เข้าถึงข้อมูลร้านตัวเองได้ สอบถามเพิ่มเติมหรือขอความช่วยเหลือได้ที่ Facebook: CSC Connect-System-Customer",
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div style={{ width: "100%", background: C.grayLight, borderBottom: `1px solid ${C.border}`, padding: "52px 24px 60px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {/* Header */}
        <p style={{
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em",
          color: C.muted, textTransform: "uppercase",
          fontFamily: "'Inter',sans-serif", margin: "0 0 8px",
        }}>
          คำถามที่พบบ่อย
        </p>
        <h2 style={{
          fontFamily: "'Instrument Serif',Georgia,serif",
          fontSize: 28, fontWeight: 400, color: C.ink,
          margin: "0 0 32px", letterSpacing: "-0.6px", lineHeight: 1.2,
        }}>
          มีข้อสงสัยก่อนสมัคร?
        </h2>

        {/* Accordion */}
        <div>
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} style={{ borderTop: `1px solid ${C.border}`, ...(i === FAQ_ITEMS.length - 1 ? { borderBottom: `1px solid ${C.border}` } : {}) }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", padding: "18px 2px",
                  background: "transparent", border: "none", cursor: "pointer",
                  textAlign: "left", gap: 14,
                }}
              >
                <span style={{
                  fontSize: 14, fontWeight: 600, color: C.ink,
                  fontFamily: "'Inter',sans-serif", lineHeight: 1.45,
                }}>
                  {item.q}
                </span>
                <ChevronDown
                  size={17}
                  color={C.gray}
                  style={{
                    flexShrink: 0, marginTop: 2,
                    transition: "transform 0.22s ease",
                    transform: open === i ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    key="body"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <p style={{
                      fontSize: 13.5, color: C.gray,
                      fontFamily: "'Inter',sans-serif", lineHeight: 1.72,
                      margin: "0 2px 18px", paddingRight: 28,
                    }}>
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step dots ─────────────────────────────────────────────────────────────────
const STEP_LABELS = ["เลือกแพ็กเกจ", "ข้อมูลร้าน", "ชำระเงิน"];

function StepDots({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 36 }}>
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <motion.div
                animate={{
                  background: done || active ? C.black : "transparent",
                  borderColor: done || active ? C.black : C.border,
                }}
                transition={{ duration: 0.25 }}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "1.5px solid",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: done || active ? C.white : C.muted,
                  fontSize: 12, fontFamily: "'Inter',sans-serif", fontWeight: 600,
                }}
              >
                {done ? <Check size={12} /> : n}
              </motion.div>
              <span style={{ fontSize: 10.5, fontFamily: "'Inter',sans-serif", fontWeight: active ? 600 : 400, color: active ? C.black : C.muted, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <motion.div
                animate={{ background: done ? C.black : C.border }}
                transition={{ duration: 0.3 }}
                style={{ height: 1.5, width: 44, margin: "0 4px", marginBottom: 18 }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Section label (motivational surtitle) ─────────────────────────────────────
function SurTitle({ text }: { text: string }) {
  return (
    <p style={{
      fontSize: 11.5, fontFamily: "'Inter',sans-serif", fontWeight: 600,
      color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase",
      margin: "0 0 10px",
    }}>
      {text}
    </p>
  );
}

// ── Slide variants ────────────────────────────────────────────────────────────
const slideV = {
  enter: (d: number) => ({ x: d > 0 ? 56 : -56, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (d: number) => ({ x: d > 0 ? -56 : 56, opacity: 0 }),
};

// ── Error message ─────────────────────────────────────────────────────────────
function ErrMsg({ msg }: { msg: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 10,
        padding: "12px 16px", marginTop: 16, display: "flex", alignItems: "center", gap: 10,
      }}
    >
      <AlertCircle size={16} color={C.coral} />
      <span style={{ color: C.coral, fontSize: 13.5, fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>{msg}</span>
    </motion.div>
  );
}

// ── Form label ────────────────────────────────────────────────────────────────
function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label style={{ display: "block", fontSize: 12.5, fontFamily: "'Inter',sans-serif", fontWeight: 500, color: C.ink, marginBottom: 7, letterSpacing: "0.01em" }}>
      {text}{required && <span style={{ color: C.coral, marginLeft: 2 }}>*</span>}
    </label>
  );
}

const INP: React.CSSProperties = {
  width: "100%", background: C.white,
  border: `1.5px solid ${C.border}`, borderRadius: 9,
  padding: "12px 14px", fontSize: 14, color: C.ink,
  fontFamily: "'Inter',sans-serif", boxSizing: "border-box",
  transition: "border-color .15s",
};

// ── Nav row (back / next buttons) ─────────────────────────────────────────────
function NavRow({ onBack, onNext, nextLabel = "ไปต่อ", nextDisabled = false, loading = false }: {
  onBack?: () => void; onNext?: () => void;
  nextLabel?: string; nextDisabled?: boolean; loading?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
      {onBack && (
        <motion.button
          type="button" onClick={onBack}
          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
          style={{
            background: C.white, color: C.ink, border: `1.5px solid ${C.border}`,
            borderRadius: 10, padding: "14px 20px",
            fontSize: 14, fontWeight: 500, fontFamily: "'Inter',sans-serif",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
          }}
        >
          <ArrowLeft size={14} /> ย้อนกลับ
        </motion.button>
      )}
      <motion.button
        type="button" onClick={onNext}
        disabled={nextDisabled || loading}
        whileHover={!nextDisabled && !loading ? { scale: 1.01 } : undefined}
        whileTap={!nextDisabled && !loading   ? { scale: 0.99 } : undefined}
        style={{
          flex: 1, background: nextDisabled || loading ? "#D1D5DB" : C.black,
          color: C.white, border: "none", borderRadius: 10,
          padding: "14px 24px", fontSize: 15, fontWeight: 600,
          fontFamily: "'Inter',sans-serif",
          cursor: nextDisabled || loading ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          transition: "background .2s",
        }}
      >
        {loading
          ? <><div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: C.white, animation: "reg-spin 0.8s linear infinite" }} /> กำลังส่ง…</>
          : <>{nextLabel} <ArrowRight size={16} /></>}
      </motion.button>
    </div>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, selected, onClick }: { plan: any; selected: boolean; onClick: () => void }) {
  const isFull  = plan.slots_left !== null && plan.slots_left <= 0;
  const urgent  = plan.slots_left !== null && plan.slots_left <= 5 && plan.slots_left > 0;

  return (
    <motion.div
      whileHover={!isFull ? { y: -1, boxShadow: "0 6px 20px rgba(0,0,0,0.09)" } : undefined}
      whileTap={!isFull ? { scale: 0.99 } : undefined}
      onClick={!isFull ? onClick : undefined}
      style={{
        background: selected ? C.black : C.white,
        border: `2px solid ${selected ? C.black : isFull ? C.border : C.border}`,
        borderRadius: 12, padding: "20px 22px",
        cursor: isFull ? "not-allowed" : "pointer",
        opacity: isFull ? 0.5 : 1, position: "relative", overflow: "hidden",
        transition: "all .18s",
      }}
    >
      {selected && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          background: C.white, color: C.black,
          fontSize: 10.5, fontWeight: 700, fontFamily: "'Inter',sans-serif",
          padding: "3px 12px", borderBottomLeftRadius: 8, letterSpacing: "0.03em",
        }}>
          ✓ เลือกแล้ว
        </div>
      )}

      {/* Big price */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 16 }}>
        <span style={{ fontSize: 44, fontWeight: 800, fontFamily: "'Inter',sans-serif", color: selected ? C.white : C.black, lineHeight: 1 }}>
          ฿{plan.price.toFixed(0)}
        </span>
        <span style={{ fontSize: 13, color: selected ? "rgba(255,255,255,0.55)" : C.gray, fontFamily: "'Inter',sans-serif", marginBottom: 5 }}>
          /เดือน
        </span>
        {urgent && (
          <span style={{ marginLeft: 8, background: "#FEF9C3", color: "#854D0E", fontSize: 10.5, fontWeight: 700, fontFamily: "'Inter',sans-serif", borderRadius: 100, padding: "2px 9px", marginBottom: 5 }}>
            เหลือ {plan.slots_left} ที่!
          </span>
        )}
        {isFull && (
          <span style={{ marginLeft: 8, background: "#FEE2E2", color: C.coral, fontSize: 10.5, fontWeight: 700, fontFamily: "'Inter',sans-serif", borderRadius: 100, padding: "2px 9px", marginBottom: 5 }}>
            เต็มแล้ว
          </span>
        )}
      </div>

      <p style={{ fontSize: 13.5, color: selected ? "rgba(255,255,255,0.65)" : C.gray, fontFamily: "'Inter',sans-serif", margin: "0 0 14px", lineHeight: 1.55 }}>
        {plan.description}
      </p>

      {/* Feature grid */}
      <div className="reg-feat-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 14px" }}>
        {FEATURES.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: selected ? "rgba(255,255,255,0.7)" : C.black, flexShrink: 0 }}>{f.icon}</span>
            <span style={{ fontSize: 12.5, fontFamily: "'Inter',sans-serif", color: selected ? "rgba(255,255,255,0.75)" : C.ink, lineHeight: 1.35 }}>{f.text}</span>
          </div>
        ))}
      </div>

      {/* Slots bar */}
      {plan.total_slots && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: selected ? "rgba(255,255,255,0.2)" : C.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (plan.registered_count / plan.total_slots) * 100)}%`, background: selected ? C.white : C.black, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, fontFamily: "'Inter',sans-serif", color: selected ? "rgba(255,255,255,0.5)" : C.muted, whiteSpace: "nowrap" }}>
            {plan.registered_count}/{plan.total_slots} ร้าน
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── Bank copy box ─────────────────────────────────────────────────────────────
function BankBox({ bankInfo, price }: { bankInfo: any; price: number }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 2000); });
  };
  const CopyBtn = ({ value, id }: { value: string; id: string }) => (
    <button
      type="button" onClick={() => copy(value, id)}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 500,
        color: copied === id ? C.sage : C.gray,
        background: copied === id ? "#DCFCE7" : C.grayLight,
        border: "none", borderRadius: 5, padding: "3px 9px", cursor: "pointer",
        transition: "all .15s", flexShrink: 0,
      }}
    >
      {copied === id ? <><Check size={10} /> คัดลอกแล้ว</> : <><Copy size={10} /> คัดลอก</>}
    </button>
  );

  return (
    <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "4px 16px 0", marginBottom: 18 }}>
      {/* Bank row */}
      <div className="reg-bank-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <CreditCard size={13} color={C.muted} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "'Inter',sans-serif", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {bankInfo.kasikorn_bank}
            </div>
            <div style={{ fontSize: 11, fontFamily: "'Inter',sans-serif", color: C.gray, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {bankInfo.kasikorn_name}
            </div>
          </div>
        </div>
        <div className="reg-bank-acct" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'Inter',sans-serif", color: C.ink, letterSpacing: "0.04em" }}>{bankInfo.kasikorn_account}</span>
          <CopyBtn value={bankInfo.kasikorn_account} id="account" />
        </div>
      </div>

      {/* TrueMoney row */}
      <div className="reg-bank-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Smartphone size={13} color={C.muted} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "'Inter',sans-serif", color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              ทรูมันนี่วอลเล็ต
            </div>
            <div style={{ fontSize: 11, fontFamily: "'Inter',sans-serif", color: C.gray, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {bankInfo.kasikorn_name}
            </div>
          </div>
        </div>
        <div className="reg-bank-acct" style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, fontFamily: "'Inter',sans-serif", color: C.ink, letterSpacing: "0.04em" }}>{bankInfo.truemoney_phone}</span>
          <CopyBtn value={bankInfo.truemoney_phone} id="truemoney" />
        </div>
      </div>

      {/* Amount */}
      <div style={{ margin: "12px 0 14px", background: C.black, borderRadius: 8, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", fontFamily: "'Inter',sans-serif" }}>ยอดที่ต้องโอน</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: C.white, fontFamily: "'Inter',sans-serif" }}>฿{price.toFixed(0)}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const [plans,      setPlans]      = useState<any[]>([]);
  const [bankInfo,   setBankInfo]   = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [step, setStep]   = useState(1);
  const [dir,  setDir]    = useState(1);

  // form state
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [shopName,     setShopName]     = useState("");
  const [slug,         setSlug]         = useState("");
  const [slugStatus,   setSlugStatus]   = useState<{ available?: boolean; reason?: string } | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [email,        setEmail]        = useState("");
  const [line,         setLine]         = useState("");
  const [payMethod,    setPayMethod]    = useState<"slip" | "truemoney">("slip");
  const [voucher,      setVoucher]      = useState("");
  const [slipFile,     setSlipFile]     = useState<string | null>(null);
  const [slipName,     setSlipName]     = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState<{ message: string; auto_verified: boolean } | null>(null);

  const slugTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // load plans + bank info
  useEffect(() => {
    Promise.all([
      fetch(`${API}/register/plans`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
      fetch(`${API}/register/bank-info`).then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }),
    ]).then(([p, b]) => {
      const list = Array.isArray(p) ? p : [];
      setPlans(list);
      setBankInfo(b);
      const avail = list.find((pl: any) => pl.is_available);
      if (avail) setSelectedPlan(avail);
    }).catch(err => setFetchError("โหลดข้อมูลไม่ได้ กรุณารีเฟรชหน้าใหม่ (" + (err?.message ?? "network error") + ")"))
      .finally(() => setLoading(false));
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
    setSlug(clean); checkSlug(clean);
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("กรุณาอัปโหลดไฟล์รูปภาพ"); return; }
    setSlipName(file.name);
    try { setSlipFile(await compressImage(file)); setError(""); }
    catch { setError("อ่านไฟล์รูปไม่ได้ กรุณาลองใหม่"); }
    e.target.value = "";
  };

  const goTo = (n: number) => { setDir(n > step ? 1 : -1); setError(""); setStep(n); };

  const validateStep1 = () => { if (!selectedPlan) { setError("กรุณาเลือกแพ็กเกจ"); return false; } return true; };
  const validateStep2 = () => {
    if (!shopName.trim())            { setError("กรุณากรอกชื่อร้าน"); return false; }
    if (!slug || !slugStatus?.available) { setError("กรุณาตรวจสอบ slug ให้ถูกต้อง"); return false; }
    if (!email.includes("@"))        { setError("กรุณากรอกอีเมลให้ถูกต้อง"); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (payMethod === "slip"      && !slipFile)        { setError("กรุณาอัปโหลดสลิปการโอนเงิน"); return; }
    if (payMethod === "truemoney" && !voucher.trim())   { setError("กรุณากรอกลิงก์หรือรหัสซองอั่งเปา"); return; }
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
      const res  = await fetch(`${API}/register/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "ส่งคำขอไม่สำเร็จ");
      setSuccess({ message: data.message, auto_verified: data.auto_verified });
    } catch (err: any) { setError(err.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่"); }
    finally { setSubmitting(false); }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.grayLight, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
      <style>{`@keyframes reg-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 44, height: 44, borderRadius: "50%", border: `3px solid ${C.border}`, borderTopColor: C.black, animation: "reg-spin 0.8s linear infinite" }} />
      <p style={{ color: C.gray, fontSize: 14, fontFamily: "'Inter',sans-serif" }}>กำลังโหลด…</p>
    </div>
  );

  // ── Fetch error ───────────────────────────────────────────────────────────
  if (fetchError) return (
    <div style={{ minHeight: "100vh", background: C.grayLight, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.white, border: `1.5px solid #FECACA`, borderRadius: 16, padding: 36, maxWidth: 400, textAlign: "center" }}>
        <AlertCircle size={36} color={C.coral} style={{ marginBottom: 12 }} />
        <p style={{ color: C.ink, fontSize: 15, fontWeight: 700, marginBottom: 8, fontFamily: "'Inter',sans-serif" }}>ไม่สามารถโหลดข้อมูลได้</p>
        <p style={{ color: C.gray, fontSize: 13.5, marginBottom: 22, fontFamily: "'Inter',sans-serif" }}>{fetchError}</p>
        <button onClick={() => window.location.reload()} style={{ background: C.black, color: C.white, border: "none", borderRadius: 9, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
          รีเฟรชหน้า
        </button>
      </div>
    </div>
  );

  // ── Success ───────────────────────────────────────────────────────────────
  if (success) return (
    <div style={{ minHeight: "100vh", background: success.auto_verified ? "#F0FDF4" : C.grayLight, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "48px 40px", maxWidth: 460, width: "100%", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.07)" }}
      >
        <CheckCircle size={52} color={C.sage} style={{ marginBottom: 20 }} />
        <h2 style={{ color: C.ink, fontSize: 26, fontWeight: 800, margin: "0 0 12px", fontFamily: "'Instrument Serif',Georgia,serif", letterSpacing: "-0.5px" }}>
          {success.auto_verified ? "สมัครสำเร็จแล้ว!" : "รับคำขอเรียบร้อย!"}
        </h2>
        <p style={{ color: C.gray, fontSize: 15, lineHeight: 1.7, margin: 0, fontFamily: "'Inter',sans-serif" }}>{success.message}</p>
        {!success.auto_verified && (
          <p style={{ color: C.gray, fontSize: 13.5, marginTop: 18, padding: "13px 16px", background: C.grayLight, borderRadius: 9, fontFamily: "'Inter',sans-serif" }}>
            เราจะส่งลิงก์ตั้งค่าร้านไปยัง <strong style={{ color: C.ink }}>{email}</strong> เมื่ออนุมัติแล้ว
          </p>
        )}
        <button onClick={() => window.location.reload()} style={{ marginTop: 26, background: C.black, color: C.white, border: "none", borderRadius: 10, padding: "13px 30px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter',sans-serif" }}>
          กลับหน้าหลัก
        </button>
      </motion.div>
    </div>
  );

  // ── Main wizard ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.white, fontFamily: "'Inter',sans-serif" }}>
      <style>{GLOBAL_CSS}</style>

      <div className="reg-split" style={{ display: "flex", minHeight: "100vh" }}>

        {/* ── LEFT: Cinematic hero ────────────────────────────────────────── */}
        <HeroPanel />

        {/* ── RIGHT: Wizard form ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.white, overflowY: "auto", minHeight: "100vh" }}>

          {/* Top bar */}
          <div className="reg-topbar" style={{ padding: "18px 52px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontFamily: "'Inter',sans-serif", color: C.muted }}>
              <Lock size={11} /> ปลอดภัย SSL
            </div>
          </div>

          {/* FAQ — above the wizard */}
          <FaqSection />

          {/* Form body */}
          <div
            className="reg-form"
            style={{ flex: 1, padding: "44px 52px 64px", maxWidth: 560, width: "100%", margin: "0 auto", boxSizing: "border-box" }}
          >
            <StepDots current={step} />

            <AnimatePresence mode="wait" custom={dir}>
              {/* ── Step 1: เลือกแพ็กเกจ ───────────────────────────────── */}
              {step === 1 && (
                <motion.div key="s1" custom={dir} variants={slideV} initial="enter" animate="center" exit="exit"
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}>
                  <SurTitle text="เลือกแพ็กเกจที่ใช่สำหรับคุณ" />
                  <h2 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 30, fontWeight: 400, color: C.ink, margin: "0 0 6px", letterSpacing: "-0.7px", lineHeight: 1.12 }}>
                    เริ่มต้นธุรกิจของคุณ
                  </h2>
                  <p style={{ fontSize: 14, color: C.gray, fontFamily: "'Inter',sans-serif", margin: "0 0 26px", lineHeight: 1.65 }}>
                    ครบทุกฟีเจอร์ ใช้ได้ทันที ไม่มีค่าธรรมเนียมแอบแฝง
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {plans.length === 0
                      ? (
                        <div style={{ textAlign: "center", padding: "36px 20px", color: C.gray, border: `1.5px dashed ${C.border}`, borderRadius: 12 }}>
                          <Store size={30} style={{ marginBottom: 10, opacity: 0.35 }} />
                          <p style={{ margin: 0, fontFamily: "'Inter',sans-serif" }}>ยังไม่มีแพ็กเกจที่เปิดรับสมัคร</p>
                        </div>
                      )
                      : plans.map(p => (
                        <PlanCard key={p.id} plan={p} selected={selectedPlan?.id === p.id}
                          onClick={() => { setSelectedPlan(p); setError(""); }} />
                      ))
                    }
                  </div>

                  {error && <ErrMsg msg={error} />}
                  <NavRow onNext={() => { if (validateStep1()) goTo(2); }} nextDisabled={!selectedPlan} />

                  <p style={{ fontSize: 11.5, fontFamily: "'Inter',sans-serif", color: C.muted, textAlign: "center", marginTop: 16 }}>
                    ยกเลิกได้ทุกเมื่อ · ไม่มีสัญญาผูกมัด
                  </p>
                </motion.div>
              )}

              {/* ── Step 2: ข้อมูลร้าน ─────────────────────────────────── */}
              {step === 2 && (
                <motion.div key="s2" custom={dir} variants={slideV} initial="enter" animate="center" exit="exit"
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}>
                  <SurTitle text="กรอกข้อมูลร้านของคุณ" />
                  <h2 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 30, fontWeight: 400, color: C.ink, margin: "0 0 6px", letterSpacing: "-0.7px", lineHeight: 1.12 }}>
                    ข้อมูลร้านของคุณ
                  </h2>
                  <p style={{ fontSize: 14, color: C.gray, fontFamily: "'Inter',sans-serif", margin: "0 0 26px", lineHeight: 1.65 }}>
                    กรอกข้อมูลพื้นฐานเพื่อสร้างร้านของคุณ
                  </p>

                  <Label text="ชื่อร้าน" required />
                  <input className="reg-inp" style={INP} placeholder="เช่น ร้านสาวสวยทำเล็บ" value={shopName} onChange={e => setShopName(e.target.value)} />

                  <Label text="ชื่อย่อ URL (slug)" required />
                  <div style={{ position: "relative" }}>
                    <input
                      className="reg-inp"
                      style={{ ...INP, paddingRight: 40, borderColor: slugStatus ? (slugStatus.available ? C.sage : C.coral) : C.border }}
                      placeholder="เช่น my-nail-shop (a-z, 0-9, -)"
                      value={slug}
                      onChange={e => onSlugChange(e.target.value)}
                    />
                    {slugChecking && (
                      <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.black, animation: "reg-spin 0.8s linear infinite" }} />
                    )}
                  </div>
                  {slug && (
                    <p style={{ color: C.muted, fontSize: 11.5, margin: "5px 0 0", fontFamily: "'Inter',sans-serif" }}>
                      yoursite.com/r/<strong style={{ color: C.ink }}>{slug}</strong>
                    </p>
                  )}
                  {slugStatus && (
                    <p style={{ display: "flex", alignItems: "center", gap: 5, color: slugStatus.available ? C.sage : C.coral, fontSize: 12.5, margin: "5px 0 0", fontFamily: "'Inter',sans-serif" }}>
                      {slugStatus.available
                        ? <><CheckCircle size={13} /> slug นี้ว่างอยู่ ใช้ได้เลย</>
                        : <><AlertCircle size={13} /> {slugStatus.reason}</>}
                    </p>
                  )}

                  <Label text="อีเมล" required />
                  <input className="reg-inp" style={INP} type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} />

                  <Label text="Line ID" />
                  <input className="reg-inp" style={INP} placeholder="@lineid (ไม่บังคับ)" value={line} onChange={e => setLine(e.target.value)} />

                  {error && <ErrMsg msg={error} />}
                  <NavRow
                    onBack={() => goTo(1)}
                    onNext={() => { if (validateStep2()) goTo(3); }}
                    nextDisabled={!shopName || !slug || !email || slugChecking}
                  />
                </motion.div>
              )}

              {/* ── Step 3: ชำระเงิน ───────────────────────────────────── */}
              {step === 3 && (
                <motion.div key="s3" custom={dir} variants={slideV} initial="enter" animate="center" exit="exit"
                  transition={{ type: "spring", stiffness: 340, damping: 30 }}>
                  <SurTitle text="ใกล้เสร็จแล้ว อีกนิดเดียว" />
                  <h2 style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 30, fontWeight: 400, color: C.ink, margin: "0 0 6px", letterSpacing: "-0.7px", lineHeight: 1.12 }}>
                    ชำระเงิน
                  </h2>
                  <p style={{ fontSize: 14, color: C.gray, fontFamily: "'Inter',sans-serif", margin: "0 0 22px", lineHeight: 1.65 }}>
                    แพ็กเกจ {selectedPlan?.name} — <strong style={{ color: C.ink }}>฿{selectedPlan?.price.toFixed(0)}/เดือน</strong>
                  </p>

                  {/* Payment toggle */}
                  <div style={{ display: "flex", background: C.grayLight, borderRadius: 9, padding: 4, marginBottom: 20 }}>
                    {([["slip", <CreditCard size={13} />, "โอนสลิปธนาคาร"], ["truemoney", <Smartphone size={13} />, "TrueMoney อั่งเปา"]] as const).map(([m, icon, label]) => (
                      <button
                        key={m} type="button" onClick={() => setPayMethod(m)}
                        style={{
                          flex: 1, background: payMethod === m ? C.white : "transparent",
                          border: "none", borderRadius: 7, padding: "10px 10px",
                          fontSize: 13, fontFamily: "'Inter',sans-serif",
                          fontWeight: payMethod === m ? 600 : 400,
                          color: payMethod === m ? C.ink : C.gray,
                          cursor: "pointer", boxShadow: payMethod === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                          transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {payMethod === "slip" ? (
                      <motion.div key="slip" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {bankInfo && <BankBox bankInfo={bankInfo} price={selectedPlan?.price ?? 0} />}
                        {/* Upload */}
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            border: `1.5px dashed ${slipFile ? C.sage : C.border}`,
                            borderRadius: 12, padding: "26px 20px", textAlign: "center",
                            cursor: "pointer", background: slipFile ? "#F0FDF4" : C.grayLight,
                            transition: "all .2s", marginBottom: 4,
                          }}
                        >
                          {slipFile ? (
                            <>
                              <CheckCircle size={28} color={C.sage} style={{ marginBottom: 10 }} />
                              <p style={{ color: C.sage, fontWeight: 700, fontSize: 14, margin: "0 0 3px", fontFamily: "'Inter',sans-serif" }}>อัปโหลดสลิปแล้ว</p>
                              <p style={{ color: C.gray, fontSize: 12.5, margin: 0, fontFamily: "'Inter',sans-serif" }}>{slipName}</p>
                              <p style={{ color: C.muted, fontSize: 11.5, margin: "5px 0 0", fontFamily: "'Inter',sans-serif" }}>กดเพื่อเปลี่ยนรูป</p>
                            </>
                          ) : (
                            <>
                              <Upload size={26} color={C.muted} style={{ marginBottom: 10 }} />
                              <p style={{ color: C.ink, fontWeight: 600, fontSize: 14, margin: "0 0 5px", fontFamily: "'Inter',sans-serif" }}>กดเพื่ออัปโหลดสลิป</p>
                              <p style={{ color: C.gray, fontSize: 12.5, margin: 0, fontFamily: "'Inter',sans-serif" }}>รองรับ JPG, PNG (ไม่เกิน 10MB)</p>
                            </>
                          )}
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
                      </motion.div>
                    ) : (
                      <motion.div key="truemoney" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <div style={{ background: "#FEF3C7", border: "1.5px solid #FDE68A", borderRadius: 10, padding: "13px 16px", marginBottom: 14 }}>
                          <p style={{ color: "#92400E", fontSize: 13.5, fontWeight: 700, margin: "0 0 3px", fontFamily: "'Inter',sans-serif" }}>
                            ยอดที่ต้องโอน ฿{selectedPlan?.price.toFixed(0)}
                          </p>
                          <p style={{ color: "#B45309", fontSize: 12.5, margin: 0, fontFamily: "'Inter',sans-serif" }}>
                            ส่งซองอั่งเปา TrueMoney มูลค่าเท่ากับหรือมากกว่า
                          </p>
                        </div>
                        <input
                          className="reg-inp" style={INP} type="text"
                          value={voucher} onChange={e => setVoucher(e.target.value)}
                          placeholder="https://gift.truemoney.com/campaign/?v=... หรือรหัสซอง"
                        />
                        <p style={{ color: C.muted, fontSize: 12, margin: "7px 0 0", fontFamily: "'Inter',sans-serif" }}>
                          วางลิงก์ซอง TrueMoney Gift จาก TrueMoney Wallet App — ระบบจะแลกอัตโนมัติ
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && <ErrMsg msg={error} />}
                  <NavRow onBack={() => goTo(2)} onNext={handleSubmit} nextLabel="ยื่นสมัครร้าน" loading={submitting} />

                  {/* Trust strip */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                    {[
                      { icon: <Lock size={12} />,       label: "ข้อมูลปลอดภัย" },
                      { icon: <Clock size={12} />,      label: "อนุมัติ 24 ชม." },
                      { icon: <Zap size={12} />,        label: "ตั้งค่าได้ทันที" },
                    ].map((t, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.gray, fontFamily: "'Inter',sans-serif" }}>
                        {t.icon} {t.label}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
