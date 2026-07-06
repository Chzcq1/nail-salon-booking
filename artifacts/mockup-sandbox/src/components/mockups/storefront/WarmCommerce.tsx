import { useState, useEffect } from "react";
import {
  ShoppingBag, Wallet, Bell, Home, History,
  Flame, Users, CheckCircle, Tv, Play, Star,
  Package, ArrowRight, Shield, Activity,
  TrendingUp, Clock
} from "lucide-react";

/* ─── palette ─────────────────────────────────────────── */
const C = {
  bg:       "#fdfcfb",          // warm off-white (touch of B)
  bgWarm:   "#f7f5f2",          // subtle warm section bg
  card:     "#ffffff",
  border:   "#e6e2dd",          // warm light border
  borderSt: "#d4cfc9",          // stronger border for dividers
  ink:      "#0f0e0d",          // near-black warm ink
  sub:      "#6b6560",          // secondary text
  muted:    "#a8a39d",          // muted
  indigo:   "#3730a3",          // CTA / accent ONLY
  indigoLt: "#eef2ff",          // indigo tint for hover / highlight
  red:      "#dc2626",
  green:    "#16a34a",
};

const FAKE_BASE = 12_847;
const REAL_EXTRA = 201;
const TOTAL_SOLD = FAKE_BASE + REAL_EXTRA;

const PRODUCTS = [
  { id:1, name:"Netflix 30 วัน",   sub:"สำหรับมือถือ", cat:"NETFLIX",  price:49,  old:139, stock:26, disc:65, Icon:Tv,   tag:"ขายดีที่สุด", tagRed:false, lowStock:false },
  { id:2, name:"Netflix 7 วัน",    sub:"สำหรับมือถือ", cat:"NETFLIX",  price:32,  old:49,  stock:4,  disc:35, Icon:Tv,   tag:"เหลือน้อย",   tagRed:true,  lowStock:true  },
  { id:3, name:"Disney+ 30 วัน",   sub:"ทุกอุปกรณ์",   cat:"DISNEY+",  price:69,  old:89,  stock:20, disc:22, Icon:Star, tag:"ใหม่",         tagRed:false, lowStock:false },
  { id:4, name:"YouTube Premium",  sub:"1 เดือน",      cat:"YOUTUBE",  price:59,  old:79,  stock:12, disc:25, Icon:Play, tag:null,           tagRed:false, lowStock:false },
];

const ACTIVITIES = [
  { masked:"ap***48", product:"Netflix 30 วัน",  time:"2 นาที" },
  { masked:"jd***88", product:"Netflix 7 วัน",   time:"18 นาที" },
  { masked:"ni***07", product:"Disney+ 30 วัน",  time:"24 นาที" },
  { masked:"pp***21", product:"YouTube Premium", time:"31 นาที" },
];

function useCountdown(s0: number) {
  const [s, setS] = useState(s0);
  useEffect(() => {
    const t = setInterval(() => setS(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (n: number) => String(n).padStart(2, "0");
  return `${fmt(Math.floor(s/3600))}:${fmt(Math.floor((s%3600)/60))}:${fmt(s%60)}`;
}

/* ─── tiny helper components ───────────────────────────── */
function RuleLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
      <span style={{ fontSize:11, fontWeight:700, color:C.sub, textTransform:"uppercase", letterSpacing:1.2, whiteSpace:"nowrap" }}>
        {children}
      </span>
      <div style={{ flex:1, height:1, background:C.border }} />
    </div>
  );
}

/* ─── main component ────────────────────────────────────── */
export function WarmCommerce() {
  const countdown = useCountdown(11*3600+35*60+24);
  const [tab, setTab] = useState("home");
  const [actIdx, setActIdx] = useState(0);
  const [actVis, setActVis] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setActVis(false);
      setTimeout(() => { setActIdx(i => (i+1) % ACTIVITIES.length); setActVis(true); }, 340);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const act = ACTIVITIES[actIdx];

  return (
    <div style={{ fontFamily:"'Sarabun','Noto Sans Thai',sans-serif", background:C.bg, minHeight:"100vh", color:C.ink, maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column" }}>

      {/* ── Header ── */}
      <header style={{ position:"sticky", top:0, zIndex:40, background:`${C.bg}f0`, backdropFilter:"blur(16px)", borderBottom:`1px solid ${C.border}`, padding:"0 16px", height:58, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:8, background:C.indigo, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <ShoppingBag size={15} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:C.ink, letterSpacing:"-0.5px" }}>DigitalStore</div>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:0.8, textTransform:"uppercase" }}>Automated · Trusted</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
          <button style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 11px", borderRadius:20, border:`1px solid ${C.border}`, background:C.card, color:C.ink, fontSize:12, fontWeight:700, cursor:"pointer" }}>
            <Wallet size={12} color={C.sub} />฿8,100
          </button>
          <button style={{ width:34, height:34, borderRadius:8, border:`1px solid ${C.border}`, background:C.card, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <Bell size={14} color={C.sub} />
          </button>
        </div>
      </header>

      {/* ── Flash Sale — white card, indigo left bar ── */}
      <div style={{ margin:"14px 14px 0", borderRadius:12, background:C.card, border:`1px solid ${C.border}`, overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,0.05)", display:"flex" }}>
        <div style={{ width:4, background:C.indigo, flexShrink:0 }} />
        <div style={{ flex:1, padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Flame size={16} color={C.indigo} />
            <div>
              <div style={{ fontWeight:900, fontSize:15, letterSpacing:0.5, color:C.ink }}>FLASH SALE</div>
              <div style={{ fontSize:10, color:C.sub, marginTop:1 }}>ลดสูงสุด 65% · วันนี้เท่านั้น</div>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:"uppercase", letterSpacing:0.6, marginBottom:3 }}>หมดเขต</div>
            <div style={{ fontFamily:"monospace", fontWeight:900, fontSize:18, color:C.indigo, letterSpacing:2 }}>{countdown}</div>
          </div>
        </div>
      </div>

      {/* ── Live Ticker ── */}
      <div style={{
        margin:"8px 14px 0",
        padding:"7px 12px",
        borderRadius:8,
        background:C.bgWarm,
        border:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:7,
        opacity: actVis ? 1 : 0,
        transform: actVis ? "none" : "translateY(-3px)",
        transition:"all 0.3s ease",
      }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:C.green, flexShrink:0 }} />
        <Activity size={11} color={C.muted} style={{ flexShrink:0 }} />
        <span style={{ fontSize:11, color:C.sub, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          <span style={{ color:C.indigo, fontWeight:700 }}>{act.masked}</span>
          {" "}เพิ่งซื้อ{" "}
          <span style={{ color:C.ink, fontWeight:600 }}>{act.product}</span>
        </span>
        <span style={{ fontSize:10, color:C.muted, flexShrink:0 }}>{act.time}ที่แล้ว</span>
      </div>

      {/* ── Trust stats — borderless numbers ── */}
      <div style={{ margin:"14px 14px 0", display:"grid", gridTemplateColumns:"repeat(3,1fr)", borderRadius:12, overflow:"hidden", border:`1px solid ${C.border}`, background:C.card }}>
        {[
          { Icon:Users,       value:"18,947",               label:"สมาชิก",         color:C.indigo },
          { Icon:Package,     value:TOTAL_SOLD.toLocaleString(), label:"ออเดอร์สำเร็จ",  color:C.ink },
          { Icon:CheckCircle, value:"99.8%",                label:"ความพอใจ",       color:C.green },
        ].map((s, i) => (
          <div key={s.label} style={{ padding:"11px 8px", textAlign:"center", borderRight: i<2 ? `1px solid ${C.border}` : "none" }}>
            <s.Icon size={14} color={s.color} style={{ margin:"0 auto 4px" }} />
            <div style={{ fontWeight:900, fontSize:14, color:C.ink, letterSpacing:"-0.4px" }}>{s.value}</div>
            <div style={{ fontSize:9, color:C.muted, marginTop:1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Products ── */}
      <div style={{ padding:"18px 14px 0" }}>
        <RuleLabel>สินค้าแนะนำ</RuleLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
          {PRODUCTS.map(p => (
            <div key={p.id} style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
              {/* Icon zone — warm bg */}
              <div style={{ height:84, background:C.bgWarm, display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
                <p.Icon size={30} color={C.sub} strokeWidth={1.3} />
                <div style={{ position:"absolute", top:7, left:7, background:C.red, color:"#fff", fontSize:9, fontWeight:800, padding:"2px 6px", borderRadius:4 }}>
                  -{p.disc}%
                </div>
                {p.tag && (
                  <div style={{ position:"absolute", top:7, right:7, background: p.tagRed ? "#fee2e2" : C.indigoLt, color: p.tagRed ? C.red : C.indigo, fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4 }}>
                    {p.tag}
                  </div>
                )}
              </div>

              <div style={{ padding:"10px 10px 12px" }}>
                <div style={{ fontSize:8, color:C.muted, textTransform:"uppercase", letterSpacing:1, fontWeight:600 }}>{p.cat}</div>
                <div style={{ fontSize:12, fontWeight:700, color:C.ink, marginTop:3, lineHeight:1.35 }}>{p.name}</div>
                <div style={{ fontSize:10, color:C.sub }}>{p.sub}</div>

                <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:8 }}>
                  <span style={{ fontSize:20, fontWeight:900, color:C.ink, letterSpacing:"-0.5px" }}>฿{p.price}</span>
                  <span style={{ fontSize:11, color:C.muted, textDecoration:"line-through" }}>฿{p.old}</span>
                </div>

                <div style={{ marginTop:4, display:"flex", alignItems:"center", gap:4 }}>
                  <Package size={9} color={ p.lowStock ? C.red : C.muted } />
                  <span style={{ fontSize:9, color: p.lowStock ? C.red : C.muted, fontWeight: p.lowStock ? 700 : 400 }}>
                    { p.lowStock ? `เหลือเพียง ${p.stock} ชิ้น` : `คงเหลือ ${p.stock} ชิ้น` }
                  </span>
                </div>

                <button style={{ marginTop:10, width:"100%", background:C.indigo, color:"#fff", fontSize:11, fontWeight:700, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  ซื้อเลย <ArrowRight size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <div style={{ padding:"18px 14px 0" }}>
        <RuleLabel>วิธีใช้งาน</RuleLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {[
            { n:"01", Icon:Users,       title:"สมัครสมาชิก",  desc:"ใช้อีเมลฟรี ไม่ต้องยืนยัน" },
            { n:"02", Icon:Wallet,      title:"เติมเครดิต",   desc:"โอนธนาคาร / TrueMoney" },
            { n:"03", Icon:ShoppingBag, title:"เลือกสินค้า",  desc:"ระบบส่งอัตโนมัติทันที" },
            { n:"04", Icon:Shield,      title:"รับสินค้า",    desc:"ลิงก์อยู่ในกระเป๋าของคุณ" },
          ].map(s => (
            <div key={s.n} style={{ display:"flex", alignItems:"flex-start", gap:9, padding:"11px 10px", background:C.card, border:`1px solid ${C.border}`, borderRadius:10 }}>
              <div style={{ fontSize:11, fontWeight:900, color:C.muted, fontFamily:"monospace", paddingTop:1, minWidth:20 }}>{s.n}</div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:C.ink }}>{s.title}</div>
                <div style={{ fontSize:9, color:C.muted, lineHeight:1.4, marginTop:2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height:96 }} />

      {/* ── Bottom Nav — floating pill, white + shadow (touch of B) ── */}
      <nav style={{ position:"fixed", bottom:16, left:"50%", transform:"translateX(-50%)", width:356, background:"rgba(255,255,255,0.96)", backdropFilter:"blur(20px)", borderRadius:32, boxShadow:"0 4px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", justifyContent:"space-around", padding:"6px 16px", zIndex:50 }}>
        {[
          { Icon:Home,       label:"หน้าแรก",   key:"home" },
          { Icon:Wallet,     label:"เติมเงิน",  key:"wallet" },
          { isMain:true,     key:"shop" },
          { Icon:History,    label:"ออเดอร์",   key:"orders" },
          { Icon:Bell,       label:"แจ้งเตือน", key:"notify" },
        ].map((n: any) => {
          const active = tab === n.key;
          if (n.isMain) return (
            <button key="shop" onClick={() => setTab("shop")} style={{ width:46, height:46, borderRadius:"50%", background:C.indigo, border:`3px solid ${C.bg}`, display:"flex", alignItems:"center", justifyContent:"center", marginTop:-18, boxShadow:"0 4px 14px rgba(55,48,163,0.35)", cursor:"pointer", flexShrink:0 }}>
              <ShoppingBag size={18} color="#fff" />
            </button>
          );
          return (
            <button key={n.key} onClick={() => setTab(n.key)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, color: active ? C.indigo : C.muted, background:"none", border:"none", cursor:"pointer", padding:"4px 0", minWidth:44 }}>
              <n.Icon size={17} />
              <span style={{ fontSize:9, fontWeight: active ? 700 : 400 }}>{n.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
