/**
 * MyBookingsPage — ประวัติการจองของลูกค้า (กันลืมวันเวลาที่จองไว้)
 * Route: /my-bookings
 */
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, Loader2, Lock, ArrowLeft, Scissors, Banknote } from "lucide-react";

const P = {
  pink: "#FF6B9D",
  pinkPale: "#FFF0F7",
  pinkBorder: "#FFD6EC",
  text: "#1A1A2E",
  sub: "#505068",
  muted: "#707080",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#B45309",
} as const;

const WALLET_SESSION_KEY = "wallet_token";
function getWalletToken(): string {
  return sessionStorage.getItem(WALLET_SESSION_KEY) || "";
}

const statusLabel: Record<string, { label: string; color: string; bg: string }> = {
  held: { label: "รอชำระเงิน", color: P.warning, bg: "#FFF3E0" },
  pending_payment: { label: "รอแอดมินตรวจสลิป", color: "#1565C0", bg: "#E3F2FD" },
  confirmed: { label: "ยืนยันแล้ว", color: P.success, bg: "#E8F5E9" },
  cancelled: { label: "ยกเลิกแล้ว", color: P.error, bg: "#FFEBEE" },
  completed: { label: "เสร็จสิ้น", color: "#6A1B9A", bg: "#F3E5F5" },
  walkin: { label: "Walk-in", color: P.warning, bg: "#FFF3E0" },
};

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T00:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function MyBookingsPage() {
  const token = getWalletToken();

  const { data: bookings, isLoading, isError } = useQuery<any[]>({
    queryKey: ["my-nail-bookings"],
    queryFn: () =>
      fetch("/api/nail/booking/my", { headers: { Authorization: `Bearer ${token}` } }).then(r => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      }),
    enabled: !!token,
    retry: 1,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#FFF8FC", fontFamily: "'Prompt', sans-serif" }}>
      <div style={{ background: `linear-gradient(135deg, ${P.pink} 0%, #FF85B3 100%)`, padding: "28px 20px 24px", borderRadius: "0 0 24px 24px" }}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.9)", textDecoration: "none", fontSize: 13, marginBottom: 10 }}>
          <ArrowLeft size={16} /> กลับหน้าหลัก
        </a>
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          <Calendar size={22} /> การจองของฉัน
        </h1>
      </div>

      <div style={{ padding: "20px 16px", maxWidth: 480, margin: "0 auto" }}>
        {!token ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <Lock size={32} color={P.muted} style={{ margin: "0 auto 12px" }} />
            <p style={{ color: P.sub, fontSize: 14, marginBottom: 16 }}>
              กรุณาเข้าสู่ระบบกระเป๋าเงินก่อน เพื่อดูประวัติการจองของคุณ
            </p>
            <a href="/wallet" style={{ display: "inline-block", background: P.pink, color: "#fff", borderRadius: 100, padding: "10px 24px", textDecoration: "none", fontWeight: 700, fontSize: 14 }}>
              เข้าสู่ระบบ
            </a>
          </div>
        ) : isLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Loader2 size={28} color={P.pink} className="animate-spin" />
          </div>
        ) : isError ? (
          <div style={{ textAlign: "center", padding: 30, background: "#FFEBEE", borderRadius: 16, color: P.error, fontSize: 14 }}>
            โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่ หรือเข้าสู่ระบบใหม่อีกครั้ง
          </div>
        ) : !bookings || bookings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", background: "#fff", borderRadius: 16, border: `1px solid ${P.pinkBorder}` }}>
            <Calendar size={32} color={P.muted} style={{ margin: "0 auto 12px" }} />
            <p style={{ color: P.muted, fontSize: 14 }}>ยังไม่มีประวัติการจอง</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {bookings.map(b => {
              const st = statusLabel[b.status] || { label: b.status, color: P.sub, bg: "#F0F0F8" };
              return (
                <div key={b.id} style={{ background: "#fff", border: `1.5px solid ${P.pinkBorder}`, borderRadius: 16, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: P.muted }}>{b.booking_ref}</span>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 100, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.text, fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                    <Calendar size={15} /> {fmtDate(b.slot_date)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.sub, fontSize: 13, marginBottom: 4 }}>
                    <Clock size={14} /> {b.start_time}{b.end_time ? ` – ${b.end_time}` : ""}
                  </div>
                  {b.service_name && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.sub, fontSize: 13, marginBottom: 4 }}>
                      <Scissors size={14} /> {b.service_name}
                    </div>
                  )}
                  {b.deposit_total > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: P.sub, fontSize: 13 }}>
                      <Banknote size={14} /> มัดจำ ฿{b.deposit_total.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
