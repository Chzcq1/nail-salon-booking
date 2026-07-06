import { useState, useEffect } from "react";
import {
  Zap, Wallet, Bell, ShoppingCart, Clock, TrendingUp,
  Star, ChevronRight, Shield, Flame, Users, Package
} from "lucide-react";

const PRODUCTS = [
  { id: 1, name: "Netflix 30 วัน (มือถือ)", category: "NETFLIX", price: 49, oldPrice: 139, stock: 26, sold: 6398, discount: -65, img: "🎬", badge: "ขายดีที่สุด", badgeColor: "#22c55e" },
  { id: 2, name: "Netflix 7 วัน (มือถือ)", category: "NETFLIX", price: 32, oldPrice: 49, stock: 4, sold: 10301, discount: -35, img: "🎬", badge: "เหลือน้อย!", badgeColor: "#ef4444" },
  { id: 3, name: "Disney+ 30 วัน", category: "DISNEY", price: 69, oldPrice: 89, stock: 20, sold: 3069, discount: -22, img: "✨", badge: "ใหม่", badgeColor: "#a855f7" },
  { id: 4, name: "YouTube Premium 30 วัน", category: "YOUTUBE", price: 59, oldPrice: 79, stock: 12, sold: 2100, discount: -25, img: "▶️", badge: null, badgeColor: "" },
];

const ACTIVITIES = [
  { name: "ap***48", product: "Netflix 30 วัน (มือถือ)", time: "2 นาทีที่แล้ว" },
  { name: "jd***88", product: "Netflix 7 วัน", time: "18 นาทีที่แล้ว" },
  { name: "Vi***33", product: "Disney+ 30 วัน", time: "21 นาทีที่แล้ว" },
];

function useCountdown(targetSeconds: number) {
  const [secs, setSecs] = useState(targetSeconds);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function DarkPro() {
  const countdown = useCountdown(11 * 3600 + 35 * 60 + 24);
  const [activityIdx, setActivityIdx] = useState(0);
  const [showActivity, setShowActivity] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setShowActivity(false);
      setTimeout(() => {
        setActivityIdx((i) => (i + 1) % ACTIVITIES.length);
        setShowActivity(true);
      }, 400);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const act = ACTIVITIES[activityIdx];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans flex flex-col" style={{ fontFamily: "'Inter', sans-serif", maxWidth: 430, margin: "0 auto" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur border-b border-white/8 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Zap size={15} className="text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">DigitalStore</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-medium">
            <Wallet size={12} /> ฿ 8,100
          </button>
          <button className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
            <Bell size={15} className="text-white/60" />
          </button>
        </div>
      </header>

      {/* Flash Sale Banner */}
      <div className="mx-3 mt-3 rounded-2xl overflow-hidden bg-gradient-to-r from-rose-600 via-orange-500 to-amber-500 p-0.5">
        <div className="bg-[#0f0f1a] rounded-[14px] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-rose-500/90 rounded-full px-2.5 py-1">
              <Flame size={12} className="text-white" />
              <span className="text-white text-xs font-bold tracking-wide">FLASH SALE</span>
            </div>
            <span className="text-white/60 text-xs">หมดเขต</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={13} className="text-amber-400" />
            <span className="text-amber-400 font-mono font-bold text-base tracking-widest">{countdown}</span>
          </div>
        </div>
      </div>

      {/* Live Activity */}
      <div className={`mx-3 mt-2 transition-all duration-300 ${showActivity ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}>
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-white/50 text-xs">🔥</span>
          <span className="text-white/80 text-xs flex-1 truncate">
            <span className="text-green-400 font-medium">{act.name}</span>
            {" "} เพิ่งซื้อ <span className="text-white font-medium">{act.product}</span>
          </span>
          <span className="text-white/30 text-xs shrink-0">{act.time}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="mx-3 mt-3 grid grid-cols-3 gap-2">
        {[
          { icon: <Users size={14} />, label: "สมาชิก", value: "18,947", color: "text-violet-400" },
          { icon: <Package size={14} />, label: "ออเดอร์", value: "103K+", color: "text-blue-400" },
          { icon: <Shield size={14} />, label: "ความพอใจ", value: "99.8%", color: "text-green-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/5 border border-white/8 rounded-xl p-2.5 flex flex-col items-center gap-1">
            <span className={s.color}>{s.icon}</span>
            <span className="text-white font-bold text-sm">{s.value}</span>
            <span className="text-white/40 text-[10px]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Products */}
      <div className="px-3 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-violet-400" />
            <span className="font-semibold text-white text-sm">สินค้า Flash Sale</span>
          </div>
          <button className="text-xs text-violet-400 flex items-center gap-0.5">ดูทั้งหมด <ChevronRight size={12} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {PRODUCTS.map((p) => (
            <div key={p.id} className="relative bg-white/5 border border-white/8 rounded-2xl overflow-hidden group">
              {/* Discount badge */}
              <div className="absolute top-2 left-2 z-10 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {p.discount}%
              </div>
              {/* Status badge */}
              {p.badge && (
                <div className="absolute top-2 right-2 z-10 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: p.badgeColor }}>
                  {p.badge}
                </div>
              )}
              {/* Image area */}
              <div className="h-24 bg-gradient-to-br from-white/8 to-white/3 flex items-center justify-center text-4xl">
                {p.img}
              </div>
              {/* Info */}
              <div className="p-2.5">
                <p className="text-[10px] text-violet-400 font-medium uppercase tracking-wide">{p.category}</p>
                <p className="text-white text-xs font-semibold leading-tight mt-0.5 line-clamp-2">{p.name}</p>
                <div className="flex items-baseline gap-1.5 mt-1.5">
                  <span className="text-violet-300 font-bold text-base">฿{p.price}</span>
                  <span className="text-white/30 text-xs line-through">฿{p.oldPrice}</span>
                </div>
                {/* Sold / Stock bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[9px] text-white/40 mb-1">
                    <span>ขายแล้ว {p.sold.toLocaleString()}</span>
                    <span>เหลือ {p.stock}</span>
                  </div>
                  <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400"
                      style={{ width: `${Math.min(95, (p.sold / (p.sold + p.stock)) * 100)}%` }}
                    />
                  </div>
                </div>
                <button className="mt-2 w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold py-1.5 rounded-xl transition-colors">
                  ซื้อเลย
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="mx-3 mt-5 bg-white/4 border border-white/8 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Star size={14} className="text-amber-400" />
          <span className="text-white font-semibold text-sm">วิธีใช้งาน 4 ขั้นตอน</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { step: 1, icon: "👤", title: "สมัครสมาชิก", desc: "ใช้อีเมลฟรี ไม่ต้องยืนยัน" },
            { step: 2, icon: "💳", title: "เติมเครดิต", desc: "โอนธนาคาร / TrueMoney" },
            { step: 3, icon: "🛒", title: "เลือกซื้อ", desc: "ระบบส่งอัตโนมัติ ไม่รอแอดมิน" },
            { step: 4, icon: "🎉", title: "รับสินค้า", desc: "รับลิงก์ทันทีในกระเป๋า" },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-2 p-2 rounded-xl bg-white/4">
              <span className="text-lg">{s.icon}</span>
              <div>
                <p className="text-white text-xs font-semibold">{s.title}</p>
                <p className="text-white/40 text-[10px] leading-tight">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-20" />

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-[430px] bg-[#0f0f1a]/95 backdrop-blur border-t border-white/8 flex items-center justify-around px-2 py-2 z-50">
        {[
          { icon: <ShoppingCart size={20} />, label: "ซื้อสินค้า", active: true },
          { icon: <Wallet size={20} />, label: "เติมเงิน" },
          { icon: <Package size={20} />, label: "ออเดอร์" },
          { icon: <Bell size={20} />, label: "แจ้งเตือน" },
        ].map((n) => (
          <button key={n.label} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-all ${n.active ? "text-violet-400" : "text-white/30"}`}>
            {n.icon}
            <span className="text-[10px] font-medium">{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
