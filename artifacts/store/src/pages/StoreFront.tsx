import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShoppingBag, Upload, Link, Clock, ChevronRight, ChevronLeft, Zap, Megaphone, Search, CheckCircle, XCircle, Loader, Building2, CreditCard, Wallet, HelpCircle, X, Lock, Eye, EyeOff, Store, Package, Mail, Smartphone, RefreshCw, Copy, Flame, Users, Activity, Shield, ArrowRight, Home, History, Bell, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { useShopSlug, shopQs } from "@/lib/shopSlugContext";

/** ต้องตรงกับ WalletPage.tsx — ห้ามใช้ key "wallet_token" เดี่ยวๆ เพราะจะปนกันข้ามร้าน */
function sessionKey(slug: string | null | undefined) { return `wallet_token_${slug || "default"}`; }
/** เส้นทางไปหน้ากระเป๋าเงินของร้านนี้ */
function walletPath(slug: string | null | undefined) { return slug ? `/r/${slug}/wallet` : "/wallet"; }

const C = {
  bg:       "#0f1311",
  bgWarm:   "#131714",
  card:     "#141914",
  border:   "#1f2920",
  ink:      "#eceeed",
  sub:      "#909593",
  muted:    "#5e6260",
  indigo:   "#29a356",
  indigoLt: "#29a35620",
  red:      "#ef4444",
  green:    "#4ade80",
} as const;

/** Strip HTML tags and convert common HTML entities to plain text */
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

/** Product credential box: renders HTML content + one-tap copy button */
function CredentialBox({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(stripHtml(html));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="w-full bg-muted/50 border border-border rounded-xl p-4 text-left space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">รายละเอียดสินค้า</p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
        >
          {copied ? (
            <><CheckCircle size={12} /> คัดลอกแล้ว!</>
          ) : (
            <><Copy size={12} /> คัดลอกรหัส</>
          )}
        </button>
      </div>
      <div
        className="text-sm text-foreground leading-relaxed"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function useFlashSaleCountdown() {
  const getSecsToMidnight = () => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  };
  const [secs, setSecs] = useState(getSecsToMidnight);
  useEffect(() => {
    const t = setInterval(() => setSecs(getSecsToMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function RuleLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase" as const, letterSpacing: 1.2, whiteSpace: "nowrap" as const }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

async function _compressToBase64(file: File, maxPx = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round((height * maxPx) / width); width = maxPx; }
          else { width = Math.round((width * maxPx) / height); height = maxPx; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas ctx null")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadSlipImage(file: File): Promise<string> {
  const base64 = await _compressToBase64(file);
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

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  fake_discount_price: string | null;
  image_url: string | null;
  image_urls: string | null;
  is_active: boolean;
  is_featured: boolean;
  badge_text: string | null;
  badge_color: string | null;
  sales_count: number;
  sort_order: number;
}

interface StoreSettings {
  hero_title: string;
  hero_subtitle: string;
  announcement: string;
  store_name: string;
  bot_username: string;
  bank_name: string;
  bank_account: string;
  bank_qr_url: string;
  gafiw_section_title: string;
  logo_url: string;
  fake_sold_base: string;
  fake_member_count: string;
}

function getProductImages(product: Product): string[] {
  if (product.image_urls) {
    try {
      const parsed = JSON.parse(product.image_urls);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  if (product.image_url) return [product.image_url];
  return [];
}

function ImageCarousel({ images, aspectClass = "aspect-video" }: { images: string[]; aspectClass?: string }) {
  const [current, setCurrent] = useState(0);
  if (images.length === 0) return null;
  return (
    <div className={`relative ${aspectClass} bg-muted overflow-hidden`}>
      <img
        src={images[current]}
        alt=""
        className="w-full h-full object-cover transition-opacity duration-300"
        key={current}
      />
      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c - 1 + images.length) % images.length); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          >
            <ChevronLeft size={14} className="text-white" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setCurrent((c) => (c + 1) % images.length); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center transition-colors"
          >
            <ChevronRight size={14} className="text-white" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setCurrent(i); }}
                className={`rounded-full transition-all ${i === current ? "w-4 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface OrderStatus {
  id: number;
  product_name: string;
  payment_type: string;
  status: string;
  link_sent: boolean;
  invite_links: string | null;
  created_at: string;
}

function useCountdown(productId: number) {
  const storageKey = `fomo_timer_${productId}`;
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const end = parseInt(stored, 10);
      const remaining = end - Date.now();
      return remaining > 0 ? remaining : 0;
    }
    const end = Date.now() + 15 * 60 * 1000;
    localStorage.setItem(storageKey, end.toString());
    return 15 * 60 * 1000;
  });

  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1000;
        if (next <= 0) {
          clearInterval(interval);
          localStorage.removeItem(storageKey);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [storageKey]);

  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  return { minutes, seconds, expired: timeLeft <= 0 };
}

function CountdownBadge({ productId }: { productId: number }) {
  const { minutes, seconds, expired } = useCountdown(productId);
  if (expired) return null;
  return (
    <div className="flex items-center gap-1 text-xs font-mono text-red-400 bg-red-950/40 border border-red-800/40 rounded px-2 py-0.5">
      <Clock size={10} className="shrink-0" />
      <span>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} left
      </span>
    </div>
  );
}

function ProductCard({ product, onBuy }: { product: Product; onBuy: (p: Product) => void }) {
  const hasDiscount = product.fake_discount_price != null;
  const price = parseFloat(product.price);
  const fakePrice = product.fake_discount_price ? parseFloat(product.fake_discount_price) : null;
  const discountPct = fakePrice ? Math.round((1 - price / fakePrice) * 100) : 0;
  const images = getProductImages(product);
  const badgeColor = product.badge_color || C.indigo;

  return (
    <div
      className="product-card-hover"
      style={{
        background: C.card,
        border: product.is_featured ? `2px solid ${badgeColor}` : `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: product.is_featured ? `0 0 20px ${badgeColor}20` : "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {product.is_featured && product.badge_text && (
        <div style={{ position: "absolute", top: 0, right: 0, width: 72, height: 72, overflow: "hidden", zIndex: 20, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: 18, right: -20, fontSize: 10, fontWeight: 700, padding: "3px 28px", transform: "rotate(45deg)", color: "#fff", backgroundColor: badgeColor }}>
            {product.badge_text}
          </div>
        </div>
      )}

      <div style={{ position: "relative", aspectRatio: "16/9", background: C.bgWarm, overflow: "hidden" }}>
        {images.length > 0 ? (
          <ImageCarousel images={images} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            <Package size={32} color={C.muted} strokeWidth={1.2} />
          </div>
        )}
        {hasDiscount && discountPct > 0 && (
          <div style={{ position: "absolute", top: 8, left: 8, background: C.red, color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 5 }}>
            -{discountPct}%
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <h3 style={{ fontWeight: 700, color: C.ink, lineHeight: 1.35, fontSize: 14, margin: 0 }}>{product.name}</h3>
          {product.description && (
            <p style={{ fontSize: 12, color: C.sub, marginTop: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{product.description}</p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: C.ink, letterSpacing: "-0.5px" }}>฿{price.toLocaleString()}</span>
              {fakePrice && <span style={{ fontSize: 12, color: C.muted, textDecoration: "line-through" }}>฿{fakePrice.toLocaleString()}</span>}
            </div>
            {hasDiscount && <CountdownBadge productId={product.id} />}
          </div>
          <button
            onClick={() => onBuy(product)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: C.indigo, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: "none", cursor: "pointer" }}
          >
            ซื้อเลย <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BuyModal({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const slug = useShopSlug();

  // Read token from sessionStorage (set by WalletPage after PIN login) — scoped per-shop
  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey(slug)) || "");
  const [result, setResult] = useState<{ order_id: number; invite_links: string[]; balance: number } | null>(null);
  const [error, setError] = useState("");

  // Mini login state (used when not yet logged in)
  const [miniStep, setMiniStep] = useState<"email" | "pin">("email");
  const [inputEmail, setInputEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [miniError, setMiniError] = useState("");
  const [miniLoading, setMiniLoading] = useState(false);

  const walletQuery = useQuery<{ email: string; balance: number }>({
    queryKey: ["wallet-me-modal", token],
    queryFn: async () => {
      const res = await fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    },
    enabled: !!token && !!product,
    retry: false,
  });

  // If token is invalid, clear it so mini-login shows
  const isTokenValid = !!token && !walletQuery.isError;

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("ไม่พบสินค้า");
      const res = await fetch("/api/wallet/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: product.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["wallet-my-orders"] });
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleClose = () => {
    setResult(null); setError(""); setMiniError(""); setPin("");
    onClose();
  };

  // Mini login: check email then authenticate
  const handleMiniCheckUser = async () => {
    const em = inputEmail.trim().toLowerCase();
    if (!em) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setMiniError("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    setMiniLoading(true); setMiniError("");
    try {
      const res = await fetch(`/api/wallet/check?email=${encodeURIComponent(em)}${shopQs(slug).replace("?", "&")}`);
      const data = await res.json();
      if (!data.has_pin) {
        // No PIN yet → redirect to wallet page to set up
        handleClose();
        setLocation(walletPath(slug));
        return;
      }
      setMiniStep("pin");
    } catch {
      setMiniError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setMiniLoading(false);
    }
  };

  const handleMiniAuth = async () => {
    const em = inputEmail.trim().toLowerCase();
    setMiniLoading(true); setMiniError("");
    try {
      const res = await fetch("/api/wallet/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, pin, shop_slug: slug || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      sessionStorage.setItem(sessionKey(slug), data.token);
      window.dispatchEvent(new CustomEvent("wallet-token-updated"));
      setToken(data.token);
      setPin(""); setMiniStep("email");
    } catch (e: any) {
      setMiniError(e.message);
      setPin("");
    } finally {
      setMiniLoading(false);
    }
  };

  const price = product ? parseFloat(product.price) : 0;
  const balance = walletQuery.data?.balance ?? 0;
  const walletEmail = walletQuery.data?.email ?? "";
  const hasEnough = balance >= price;

  return (
    <Dialog open={!!product} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        {result ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle size={52} className="text-green-400" />
            <div>
              <h3 className="font-bold text-lg text-foreground">ซื้อสำเร็จ!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                เครดิตคงเหลือ <span className="text-foreground font-semibold">{result.balance.toLocaleString("th-TH")} เครดิต</span>
              </p>
            </div>
            {result.invite_links.length > 0 && (
              <div className="w-full bg-muted/50 border border-border rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-medium text-muted-foreground">ลิงก์เข้ากลุ่ม (ใช้ได้ครั้งเดียว)</p>
                {result.invite_links.map((link, i) => (
                  <a key={i} href={link} target="_blank" rel="noopener noreferrer"
                    className="block w-full text-center bg-primary text-primary-foreground rounded-lg py-2 text-sm font-semibold hover:bg-primary/90 transition-colors">
                    เข้ากลุ่ม {result.invite_links.length > 1 ? `(${i + 1})` : ""}
                  </a>
                ))}
              </div>
            )}
            {result.invite_links.length === 0 && (
              <div className="w-full bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300">
                แอดมินจะส่งลิงก์ให้เร็วๆ นี้ ออเดอร์ #{result.order_id}
              </div>
            )}
            <Button onClick={handleClose} className="w-full">ปิด</Button>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground">{product?.name}</DialogTitle>
              <p className="text-primary font-bold text-xl">{price.toLocaleString("th-TH")} เครดิต</p>
            </DialogHeader>

            {/* Not logged in → mini login */}
            {!isTokenValid && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <Lock size={12} className="shrink-0" />
                  <span>กรุณาเข้าสู่ระบบกระเป๋าเครดิตก่อนซื้อ</span>
                </div>

                {miniStep === "email" && (
                  <>
                    <input
                      type="email"
                      inputMode="email"
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="อีเมลของคุณ"
                      value={inputEmail}
                      onChange={e => { setInputEmail(e.target.value); setMiniError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleMiniCheckUser()}
                      disabled={miniLoading}
                    />
                    {miniError && <p className="text-red-400 text-xs">{miniError}</p>}
                    <Button className="w-full" onClick={handleMiniCheckUser} disabled={!inputEmail.trim() || miniLoading}>
                      {miniLoading ? <Loader size={14} className="animate-spin" /> : "ต่อไป"}
                    </Button>
                    <button onClick={() => { handleClose(); setLocation(walletPath(slug)); }}
                      className="w-full text-xs text-muted-foreground hover:text-primary text-center transition-colors">
                      ยังไม่มีบัญชี? สมัครที่กระเป๋าเครดิต →
                    </button>
                  </>
                )}

                {miniStep === "pin" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                        PIN ของ {inputEmail}
                      </label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          className="w-full bg-muted border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-foreground tracking-widest focus:outline-none focus:ring-1 focus:ring-primary"
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="● ● ● ●"
                          value={pin}
                          disabled={miniLoading}
                          onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          onKeyDown={e => e.key === "Enter" && handleMiniAuth()}
                          autoFocus
                        />
                        <button type="button" tabIndex={-1}
                          onClick={() => setShowPin(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    {miniError && <p className="text-red-400 text-xs">{miniError}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setMiniStep("email"); setPin(""); setMiniError(""); }}>
                        ← กลับ
                      </Button>
                      <Button className="flex-1" onClick={handleMiniAuth} disabled={pin.length < 4 || miniLoading}>
                        {miniLoading ? <Loader size={14} className="animate-spin" /> : "เข้าสู่ระบบ"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Logged in → show balance and buy button */}
            {isTokenValid && (
              <div className="space-y-4 pt-1">
                {walletQuery.isLoading ? (
                  <div className="h-16 bg-muted animate-pulse rounded-xl" />
                ) : (
                  <div className="bg-muted rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 truncate">{walletEmail}</p>
                      <p className={`text-lg font-bold ${hasEnough ? "text-foreground" : "text-red-400"}`}>
                        {balance.toLocaleString("th-TH")} เครดิต
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-0.5">ราคาสินค้า</p>
                      <p className="text-lg font-bold text-primary">{price.toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                )}

                {!hasEnough && !walletQuery.isLoading && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 flex items-center justify-between">
                    <span>เครดิตไม่พอ (ขาด {(price - balance).toLocaleString("th-TH")} เครดิต)</span>
                    <button onClick={() => { handleClose(); setLocation(walletPath(slug)); }} className="text-xs underline whitespace-nowrap ml-2">
                      เติมเงิน
                    </button>
                  </div>
                )}

                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs"
                    onClick={() => { sessionStorage.removeItem(sessionKey(slug)); window.dispatchEvent(new CustomEvent("wallet-token-updated")); setToken(""); setMiniStep("email"); setError(""); }}>
                    เปลี่ยนบัญชี
                  </Button>
                  <Button className="flex-1 font-bold"
                    disabled={!hasEnough || purchaseMutation.isPending || walletQuery.isLoading}
                    onClick={() => { setError(""); purchaseMutation.mutate(); }}>
                    {purchaseMutation.isPending ? <Loader size={14} className="animate-spin" /> : <ShoppingBag size={14} />}
                    {purchaseMutation.isPending ? "กำลังดำเนินการ..." : `ซื้อ ${price.toLocaleString()} เครดิต`}
                  </Button>
                </div>

                <button onClick={() => { handleClose(); setLocation(walletPath(slug)); }}
                  className="w-full text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 transition-colors">
                  <Wallet size={12} /> ดูกระเป๋าเครดิต / เติมเงิน
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Gafiw Product types ───────────────────────────────────────────────────────
interface GafiwProduct {
  type_id: string;
  name: string;
  imageapi: string;
  api_price: number;
  price: number;
  price_markup: number;
  fake_price?: number | null;
  pricevip: string;
  stock: string;
  type_menu: string;
  details: string;
  is_enabled: boolean;
  source: "gafiw";
}

// ── Hero Banner Carousel ──────────────────────────────────────────────────────
interface HeroBanner {
  id: number;
  title?: string | null;
  subtitle?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  sort_order: number;
}

function HeroBannerCarousel() {
  const { data: banners = [] } = useQuery<HeroBanner[]>({
    queryKey: ["banners-public"],
    queryFn: () => fetch("/api/banners").then((r) => r.json()),
    staleTime: 120_000,
  });
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (banners.length < 2) return;
    timerRef.current = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % banners.length);
        setFade(true);
      }, 300);
    }, 4500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[idx];
  const go = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setFade(false);
    setTimeout(() => { setIdx(i); setFade(true); }, 200);
  };

  return (
    <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: C.card, border: `1px solid ${C.border}`, aspectRatio: "16/6", minHeight: 120, maxHeight: 280, cursor: banner.link_url ? "pointer" : "default" }}
      onClick={() => { if (banner.link_url) window.open(banner.link_url, "_blank", "noopener"); }}>
      {/* Image */}
      {banner.image_url ? (
        <img
          src={banner.image_url}
          alt={banner.title || ""}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: fade ? 1 : 0, transition: "opacity 0.3s ease" }}
        />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${C.bgWarm}, ${C.card})` }} />
      )}

      {/* Gradient overlay */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)" }} />

      {/* Text */}
      {(banner.title || banner.subtitle) && (
        <div style={{ position: "absolute", bottom: banners.length > 1 ? 30 : 12, left: 16, right: 16, opacity: fade ? 1 : 0, transition: "opacity 0.3s ease" }}>
          {banner.title && <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.8)", marginBottom: 2 }}>{banner.title}</div>}
          {banner.subtitle && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>{banner.subtitle}</div>}
        </div>
      )}

      {/* Dot indicators */}
      {banners.length > 1 && (
        <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); go(i); }}
              style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? "#fff" : "rgba(255,255,255,0.4)", border: "none", padding: 0, cursor: "pointer", transition: "all 0.3s ease" }}
            />
          ))}
        </div>
      )}

      {/* Arrows (only if > 1) */}
      {banners.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go((idx - 1 + banners.length) % banners.length); }}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronLeft size={14} color="#fff" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go((idx + 1) % banners.length); }}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <ChevronRight size={14} color="#fff" />
          </button>
        </>
      )}
    </div>
  );
}

function GafiwProductCard({ product, onBuy }: { product: GafiwProduct; onBuy: (p: GafiwProduct) => void }) {
  const price = parseFloat(String(product.price).replace(/,/g, "")) || 0;
  const stock = parseInt(String(product.stock).replace(/,/g, "")) || 0;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        opacity: stock <= 0 ? 0.6 : 1,
      }}
    >
      <div style={{ position: "relative", aspectRatio: "16/9", background: C.bgWarm, overflow: "hidden", minHeight: 120 }}>
        {product.imageapi ? (
          <img src={product.imageapi} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={32} color={C.muted} strokeWidth={1.2} />
          </div>
        )}
        {stock <= 0 && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>หมดสต็อก</span>
          </div>
        )}
      </div>

      <div style={{ flex: 1, padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <h3 style={{ fontWeight: 700, color: C.ink, lineHeight: 1.35, fontSize: 14, margin: 0 }}>{product.name}</h3>
          {product.type_menu && <p style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{product.type_menu}</p>}
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
          <div>
            {product.fake_price && product.fake_price > price ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: C.muted, textDecoration: "line-through" }}>฿{product.fake_price.toLocaleString()}</span>
                <span style={{ fontSize: 10, fontWeight: 700, background: "#ef444420", color: "#ef4444", borderRadius: 4, padding: "1px 5px" }}>
                  -{Math.round((product.fake_price - price) / product.fake_price * 100)}%
                </span>
              </div>
            ) : null}
            <span style={{ fontSize: 20, fontWeight: 900, color: C.indigo, letterSpacing: "-0.5px" }}>฿{price.toLocaleString()}</span>
            {stock > 0 && <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>คงเหลือ {stock}</p>}
          </div>
          <button
            disabled={stock <= 0}
            onClick={() => onBuy(product)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: stock <= 0 ? C.muted : C.indigo, color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 9, border: "none", cursor: stock <= 0 ? "not-allowed" : "pointer" }}
          >
            ซื้อเลย <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gafiw Buy Modal ───────────────────────────────────────────────────────────
function GafiwBuyModal({ product, onClose }: { product: GafiwProduct | null; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const slug = useShopSlug();

  const [token, setToken] = useState(() => sessionStorage.getItem(sessionKey(slug)) || "");
  const [result, setResult] = useState<{ product_name: string; price: number; balance: number; data: any } | null>(null);
  const [error, setError] = useState("");
  const [miniStep, setMiniStep] = useState<"email" | "pin">("email");
  const [inputEmail, setInputEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [miniError, setMiniError] = useState("");
  const [miniLoading, setMiniLoading] = useState(false);

  const walletQuery = useQuery<{ email: string; balance: number }>({
    queryKey: ["wallet-me-gafiw-modal", token],
    queryFn: async () => {
      const res = await fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    },
    enabled: !!token && !!product,
    retry: false,
  });

  const isTokenValid = !!token && !walletQuery.isError;
  const price = product ? parseFloat(String(product.price).replace(/,/g, "")) || 0 : 0;
  const balance = walletQuery.data?.balance ?? 0;
  const walletEmail = walletQuery.data?.email ?? "";
  const hasEnough = balance >= price;

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("ไม่พบสินค้า");
      const res = await fetch("/api/gafiw/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type_id: product.type_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
      qc.invalidateQueries({ queryKey: ["wallet-me-gafiw-modal"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const handleClose = () => {
    setResult(null); setError(""); setMiniError(""); setPin("");
    onClose();
  };

  const handleMiniCheckUser = async () => {
    const em = inputEmail.trim().toLowerCase();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setMiniError("รูปแบบอีเมลไม่ถูกต้อง"); return; }
    setMiniLoading(true); setMiniError("");
    try {
      const res = await fetch(`/api/wallet/check?email=${encodeURIComponent(em)}${shopQs(slug).replace("?", "&")}`);
      const data = await res.json();
      if (!data.has_pin) { handleClose(); setLocation(walletPath(slug)); return; }
      setMiniStep("pin");
    } catch { setMiniError("เกิดข้อผิดพลาด"); } finally { setMiniLoading(false); }
  };

  const handleMiniAuth = async () => {
    const em = inputEmail.trim().toLowerCase();
    setMiniLoading(true); setMiniError("");
    try {
      const res = await fetch("/api/wallet/auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, pin, shop_slug: slug || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "เกิดข้อผิดพลาด");
      sessionStorage.setItem(sessionKey(slug), data.token);
      window.dispatchEvent(new CustomEvent("wallet-token-updated"));
      setToken(data.token); setPin(""); setMiniStep("email");
    } catch (e: any) { setMiniError(e.message); setPin(""); } finally { setMiniLoading(false); }
  };

  return (
    <Dialog open={!!product} onOpenChange={handleClose}>
      <DialogContent className="bg-card border-border max-w-md">
        {result ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle size={52} className="text-green-400" />
            <div>
              <h3 className="font-bold text-lg text-foreground">ซื้อสำเร็จ!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                เครดิตคงเหลือ <span className="text-foreground font-semibold">{result.balance.toLocaleString("th-TH")} เครดิต</span>
              </p>
            </div>
            {result.data?.textdb && (
              <CredentialBox html={result.data.textdb} />
            )}
            <Button onClick={handleClose} className="w-full">ปิด</Button>
          </motion.div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Store size={16} className="text-primary" /> {product?.name}
              </DialogTitle>
              <p className="text-primary font-bold text-xl">{price.toLocaleString("th-TH")} เครดิต</p>
            </DialogHeader>

            {!isTokenValid && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
                  <Lock size={12} className="shrink-0" />
                  <span>กรุณาเข้าสู่ระบบกระเป๋าเครดิตก่อนซื้อ</span>
                </div>
                {miniStep === "email" ? (
                  <>
                    <input type="email" inputMode="email"
                      className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="อีเมลของคุณ" value={inputEmail}
                      onChange={e => { setInputEmail(e.target.value); setMiniError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleMiniCheckUser()} disabled={miniLoading} />
                    {miniError && <p className="text-red-400 text-xs">{miniError}</p>}
                    <Button className="w-full" onClick={handleMiniCheckUser} disabled={!inputEmail.trim() || miniLoading}>
                      {miniLoading ? <Loader size={14} className="animate-spin" /> : "ต่อไป"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className="w-full bg-muted border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm text-foreground tracking-widest focus:outline-none focus:ring-1 focus:ring-primary"
                        type={showPin ? "text" : "password"} inputMode="numeric" maxLength={6} placeholder="● ● ● ●"
                        value={pin} disabled={miniLoading}
                        onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        onKeyDown={e => e.key === "Enter" && handleMiniAuth()} autoFocus />
                      <button type="button" onClick={() => setShowPin(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {miniError && <p className="text-red-400 text-xs">{miniError}</p>}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setMiniStep("email"); setPin(""); setMiniError(""); }}>← กลับ</Button>
                      <Button className="flex-1" onClick={handleMiniAuth} disabled={pin.length < 4 || miniLoading}>
                        {miniLoading ? <Loader size={14} className="animate-spin" /> : "เข้าสู่ระบบ"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {isTokenValid && (
              <div className="space-y-4 pt-1">
                {walletQuery.isLoading ? (
                  <div className="h-16 bg-muted animate-pulse rounded-xl" />
                ) : (
                  <div className="bg-muted rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5 truncate">{walletEmail}</p>
                      <p className={`text-lg font-bold ${hasEnough ? "text-foreground" : "text-red-400"}`}>
                        {balance.toLocaleString("th-TH")} เครดิต
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-0.5">ราคาสินค้า</p>
                      <p className="text-lg font-bold text-primary">{price.toLocaleString("th-TH")}</p>
                    </div>
                  </div>
                )}
                {!hasEnough && !walletQuery.isLoading && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 flex items-center justify-between">
                    <span>เครดิตไม่พอ (ขาด {(price - balance).toLocaleString("th-TH")} เครดิต)</span>
                    <button onClick={() => { handleClose(); setLocation(walletPath(slug)); }} className="text-xs underline ml-2">เติมเงิน</button>
                  </div>
                )}
                {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs"
                    onClick={() => { sessionStorage.removeItem(sessionKey(slug)); window.dispatchEvent(new CustomEvent("wallet-token-updated")); setToken(""); setMiniStep("email"); setError(""); }}>
                    เปลี่ยนบัญชี
                  </Button>
                  <Button className="flex-1 font-bold"
                    disabled={!hasEnough || purchaseMutation.isPending || walletQuery.isLoading}
                    onClick={() => { setError(""); purchaseMutation.mutate(); }}>
                    {purchaseMutation.isPending ? <Loader size={14} className="animate-spin" /> : <ShoppingBag size={14} />}
                    {purchaseMutation.isPending ? "กำลังดำเนินการ..." : `ซื้อ ${price.toLocaleString()} เครดิต`}
                  </Button>
                </div>
                <button onClick={() => { handleClose(); setLocation(walletPath(slug)); }}
                  className="w-full text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1.5 transition-colors">
                  <Wallet size={12} /> ดูกระเป๋าเครดิต / เติมเงิน
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteLinksList({ inviteLinks }: { inviteLinks: string }) {
  let links: string[] = [];
  try { links = JSON.parse(inviteLinks); } catch {}
  if (links.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-green-300 flex items-center gap-1.5">
        <CheckCircle size={15} /> ลิงก์เข้ากลุ่มพร้อมแล้ว!
      </p>
      <p className="text-xs text-muted-foreground">กดลิงก์ด้านล่างเพื่อเข้ากลุ่ม (ใช้ได้ครั้งเดียว ห้ามแชร์)</p>
      {links.map((link, i) => (
        <a key={i} href={link} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-[#229ED9]/15 border border-[#229ED9]/40 hover:border-[#229ED9] rounded-lg px-4 py-3 transition-colors">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-[#229ED9] shrink-0">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.29 13.91l-2.957-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.855.649z" />
          </svg>
          <span className="text-[#229ED9] font-medium text-sm">
            {links.length > 1 ? `เข้ากลุ่มที่ ${i + 1}` : "กดเพื่อเข้ากลุ่ม Telegram"}
          </span>
          <ChevronRight size={14} className="ml-auto text-[#229ED9]" />
        </a>
      ))}
    </div>
  );
}

function OrderStatusCard({ result }: { result: OrderStatus }) {
  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; desc: string }> = {
    pending: { icon: <Loader size={28} className="animate-spin text-yellow-400" />, label: "รอการยืนยัน", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", desc: "แอดมินกำลังตรวจสอบหลักฐานการชำระเงิน กรุณารอสักครู่" },
    approved: { icon: <CheckCircle size={28} className="text-green-400" />, label: "อนุมัติแล้ว", color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", desc: "" },
    rejected: { icon: <XCircle size={28} className="text-red-400" />, label: "ไม่ได้รับการอนุมัติ", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", desc: "กรุณาติดต่อแอดมินหากคิดว่าเกิดข้อผิดพลาด" },
  };
  const cfg = statusConfig[result.status] ?? statusConfig.pending;
  const hasLinks = result.invite_links && (() => { try { return JSON.parse(result.invite_links!).length > 0; } catch { return false; } })();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl p-4 flex flex-col gap-3 ${cfg.bg}`}>
      <div className="flex items-center gap-3">
        {cfg.icon}
        <div>
          <p className={`font-bold text-lg ${cfg.color}`}>{cfg.label}</p>
          <p className="text-xs text-muted-foreground">ออเดอร์ #{result.id} · {result.product_name}</p>
        </div>
      </div>
      {result.status === "approved" && (
        <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
          {hasLinks ? (
            <InviteLinksList inviteLinks={result.invite_links!} />
          ) : (
            <div className="flex items-start gap-2">
              <Loader size={16} className="text-yellow-400 shrink-0 mt-0.5 animate-spin" />
              <div>
                <p className="text-sm text-yellow-300 font-medium">กำลังเตรียมลิงก์เข้ากลุ่ม</p>
                <p className="text-xs text-muted-foreground mt-0.5">ลองกดตรวจสอบใหม่สักครู่ หากรอนานกว่า 10 นาที ติดต่อแอดมิน</p>
              </div>
            </div>
          )}
        </div>
      )}
      {(result.status === "rejected" || result.status === "pending") && cfg.desc && (
        <p className="text-sm text-muted-foreground pt-1 border-t border-border/50">{cfg.desc}</p>
      )}
      <p className="text-xs text-muted-foreground/60">
        สั่งซื้อเมื่อ: {result.created_at ? new Date(result.created_at).toLocaleString("th-TH") : "—"}
      </p>
    </motion.div>
  );
}

function OrderStatusModal({ open, initialOrderId, initialName, initialPhone, onClose }: {
  open: boolean;
  initialOrderId?: number | null;
  initialName?: string;
  initialPhone?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"id" | "phone">("id");
  const [orderId, setOrderId] = useState(initialOrderId ? String(initialOrderId) : "");
  const [name, setName] = useState(initialName || "");
  const [phone, setPhone] = useState(initialPhone || "");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [result, setResult] = useState<OrderStatus | null>(null);
  const [phoneResults, setPhoneResults] = useState<OrderStatus[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialOrderId) {
        setOrderId(String(initialOrderId));
        setName(initialName || "");
        setPhone(initialPhone || "");
      }
      setResult(null); setPhoneResults([]); setError("");
    }
  }, [open, initialOrderId, initialName, initialPhone]);

  const handleCheck = async () => {
    setError(""); setResult(null);
    if (!orderId.trim()) { setError("กรุณากรอกหมายเลขออเดอร์"); return; }
    if (!name.trim() && !phone.trim()) { setError("กรุณากรอกชื่อหรือเบอร์โทรเพื่อยืนยัน"); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (name.trim()) params.append("name", name.trim());
      if (phone.trim()) params.append("phone", phone.trim());
      const res = await fetch(`/api/orders/${orderId}/status?${params}`);
      if (res.status === 404) { setError("ไม่พบออเดอร์นี้ กรุณาตรวจสอบหมายเลขออเดอร์"); setLoading(false); return; }
      if (res.status === 403) { setError("ชื่อหรือเบอร์โทรไม่ตรงกับออเดอร์นี้"); setLoading(false); return; }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || "เกิดข้อผิดพลาด กรุณาลองใหม่"); setLoading(false); return; }
      setResult(await res.json());
    } catch { setError("เกิดข้อผิดพลาด กรุณาลองใหม่"); }
    setLoading(false);
  };

  const handlePhoneSearch = async () => {
    setError(""); setPhoneResults([]);
    if (!phoneSearch.trim()) { setError("กรุณากรอกเบอร์โทร"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/by-phone?phone=${encodeURIComponent(phoneSearch.trim())}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || "เกิดข้อผิดพลาด"); setLoading(false); return; }
      const data = await res.json();
      if (data.length === 0) setError("ไม่พบออเดอร์ที่ใช้เบอร์นี้");
      else setPhoneResults(data);
    } catch { setError("เกิดข้อผิดพลาด กรุณาลองใหม่"); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Search size={18} className="text-primary" />
            ตรวจสอบสถานะออเดอร์
          </DialogTitle>
        </DialogHeader>

        <div className="flex rounded-lg bg-muted p-1 gap-1 mb-1">
          <button onClick={() => { setMode("id"); setError(""); setPhoneResults([]); setResult(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "id" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            ค้นหาด้วยเลขออเดอร์
          </button>
          <button onClick={() => { setMode("phone"); setError(""); setResult(null); }}
            className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${mode === "phone" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
            ค้นหาด้วยเบอร์โทร
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {mode === "id" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">หมายเลขออเดอร์</label>
                  <input type="number" placeholder="เช่น 42" value={orderId}
                    onChange={(e) => { setOrderId(e.target.value); setResult(null); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ชื่อ หรือ เบอร์โทร</label>
                  <input type="text" placeholder="ชื่อ หรือ 0812345678" value={name || phone}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^\d/.test(v)) { setPhone(v); setName(""); }
                      else { setName(v); setPhone(""); }
                      setResult(null); setError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleCheck()}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
                </div>
              </div>
              <Button onClick={handleCheck} disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2">
                {loading ? <><Loader size={14} className="animate-spin" /> กำลังตรวจสอบ...</> : <><Search size={14} /> ตรวจสอบสถานะ</>}
              </Button>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"><p className="text-red-400 text-sm">{error}</p></div>}
              {result && <OrderStatusCard result={result} />}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">เบอร์โทรที่ใช้สั่ง</label>
                <input type="tel" placeholder="0812345678" value={phoneSearch}
                  onChange={(e) => { setPhoneSearch(e.target.value); setPhoneResults([]); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handlePhoneSearch()}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
              </div>
              <Button onClick={handlePhoneSearch} disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-2">
                {loading ? <><Loader size={14} className="animate-spin" /> กำลังค้นหา...</> : <><Search size={14} /> ค้นหาออเดอร์</>}
              </Button>
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3"><p className="text-red-400 text-sm">{error}</p></div>}
              {phoneResults.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground">พบ {phoneResults.length} ออเดอร์</p>
                  {phoneResults.map((r) => <OrderStatusCard key={r.id} result={r} />)}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── OTP YouKu Card ────────────────────────────────────────────────────────────
function OtpYoukuCard() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetch_ = async () => {
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/gafiw/otp/youku");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "ดึง OTP ไม่ได้");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const otpCode = result?.otp || result?.code || result?.data?.otp || result?.data?.code || "";

  const handleCopy = () => {
    if (!otpCode) return;
    navigator.clipboard.writeText(String(otpCode)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
          <Mail size={18} className="text-red-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">YouKu OTP</h3>
          <p className="text-xs text-muted-foreground">ดึง OTP ล่าสุดจากกล่องเมล (ย้อนหลัง 30 นาที)</p>
        </div>
      </div>

      {result && otpCode && (
        <div className="bg-muted/60 border border-border rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">รหัส OTP</p>
            <p className="text-2xl font-bold text-primary font-mono tracking-widest">{otpCode}</p>
            {(result?.data?.email || result?.email) && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{result?.data?.email || result?.email}</p>
            )}
            {(result?.data?.time || result?.time) && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">{result?.data?.time || result?.time}</p>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors p-2"
          >
            {copied ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
            <span className="text-[10px]">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
          </button>
        </div>
      )}

      {result && !otpCode && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-300">
          {result?.msg || result?.message || "ไม่พบ OTP ในช่วง 30 นาทีที่ผ่านมา"}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>
      )}

      <Button onClick={fetch_} disabled={loading} className="w-full gap-2" variant="outline">
        {loading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {loading ? "กำลังดึง OTP..." : "ดึง OTP YouKu"}
      </Button>
    </div>
  );
}

// ── OTP Disney+ Card ──────────────────────────────────────────────────────────
function OtpDisneyCard() {
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetch_ = async () => {
    const p = phone.trim();
    if (!p) { setError("กรุณากรอกเบอร์โทร"); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch(`/api/gafiw/otp/disney?phone=${encodeURIComponent(p)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "ดึง OTP ไม่ได้");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const otpCode = result?.otp || result?.code || result?.data?.otp || result?.data?.code || "";

  const handleCopy = () => {
    if (!otpCode) return;
    navigator.clipboard.writeText(String(otpCode)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-sm">Disney+ OTP</h3>
          <p className="text-xs text-muted-foreground">ขอ OTP อัตโนมัติสำหรับบัญชี Disney+ โดยใช้เบอร์โทร</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          placeholder="เบอร์โทร เช่น 0812345678"
          value={phone}
          onChange={e => { setPhone(e.target.value); setError(""); setResult(null); }}
          onKeyDown={e => e.key === "Enter" && fetch_()}
          disabled={loading}
          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button onClick={fetch_} disabled={loading || !phone.trim()} className="gap-1.5 px-4" variant="outline">
          {loading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {loading ? "..." : "ดึง OTP"}
        </Button>
      </div>

      {result && otpCode && (
        <div className="bg-muted/60 border border-border rounded-xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">รหัส OTP</p>
            <p className="text-2xl font-bold text-primary font-mono tracking-widest">{otpCode}</p>
            {(result?.data?.phone || result?.phone) && (
              <p className="text-xs text-muted-foreground mt-1">{result?.data?.phone || result?.phone}</p>
            )}
            {(result?.data?.time || result?.time || result?.data?.expire || result?.expire) && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {result?.data?.time || result?.time || `หมดอายุ: ${result?.data?.expire || result?.expire}`}
              </p>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary transition-colors p-2"
          >
            {copied ? <CheckCircle size={18} className="text-green-400" /> : <Copy size={18} />}
            <span className="text-[10px]">{copied ? "คัดลอกแล้ว" : "คัดลอก"}</span>
          </button>
        </div>
      )}

      {result && !otpCode && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-sm text-yellow-300">
          {result?.msg || result?.message || "ไม่พบ OTP หรือเบอร์โทรไม่ถูกต้อง"}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">{error}</div>
      )}
    </div>
  );
}

const FAKE_MASKED = ["ap***48","jd***88","ni***07","pp***21","kk***33","ta***91","mu***55","wi***77","so***14","ch***62"];

export default function StoreFront() {
  const [, setLocation] = useLocation();
  const slug = useShopSlug();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedGafiwProduct, setSelectedGafiwProduct] = useState<GafiwProduct | null>(null);
  const [showOrderStatus, setShowOrderStatus] = useState(false);
  const [checkOrderId, setCheckOrderId] = useState<number | null>(null);
  const [checkName, setCheckName] = useState("");
  const [checkPhone, setCheckPhone] = useState("");
  const [navTab, setNavTab] = useState("home");
  const [actIdx, setActIdx] = useState(0);
  const [actVis, setActVis] = useState(true);

  const flashSaleCountdown = useFlashSaleCountdown();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: () => fetch("/api/products").then((r) => r.json()),
    staleTime: 300_000, // 5 นาที — ไม่ refetch ทุกครั้งที่ focus
  });

  const { data: gafiwData } = useQuery<{ ok: boolean; data: GafiwProduct[] }>({
    queryKey: ["gafiw-products"],
    queryFn: () => fetch("/api/gafiw/products").then((r) => r.json()),
    staleTime: 120_000,
  });
  const gafiwProducts = (gafiwData?.data ?? []).filter(p => p.is_enabled);

  const { data: settings } = useQuery<StoreSettings>({
    queryKey: ["store-settings"],
    queryFn: () => fetch("/api/store-settings").then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: storeStats } = useQuery<{ total_orders: number; fake_base: number; member_count: number }>({
    queryKey: ["store-stats"],
    queryFn: () => fetch("/api/store-stats").then((r) => r.json()),
    staleTime: 120_000,
  });

  const { data: announcements = [] } = useQuery<{ id: number }[]>({
    queryKey: ["announcements"],
    queryFn: () => fetch("/api/announcements").then((r) => r.json()),
    staleTime: 120_000,
  });

  const [seenIds, setSeenIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("seen_announcements") || "[]"); } catch { return []; }
  });
  const hasUnread = announcements.some((a) => !seenIds.includes(a.id));
  const markAllSeen = () => {
    const ids = announcements.map((a) => a.id);
    setSeenIds(ids);
    localStorage.setItem("seen_announcements", JSON.stringify(ids));
  };

  const storeName = settings?.store_name || "DigitalStore";
  const logoUrl = settings?.logo_url || "";
  const announcement = settings?.announcement || "";
  const totalSold = (storeStats?.total_orders ?? 0) + (storeStats?.fake_base ?? 12847);
  const memberCount = storeStats?.member_count ?? 18947;

  const [headerToken, setHeaderToken] = useState(() => sessionStorage.getItem(sessionKey(slug)) || "");
  useEffect(() => {
    const onTokenUpdate = () => setHeaderToken(sessionStorage.getItem(sessionKey(slug)) || "");
    window.addEventListener("wallet-token-updated", onTokenUpdate);
    return () => window.removeEventListener("wallet-token-updated", onTokenUpdate);
  }, [slug]);
  const { data: headerWallet } = useQuery<{ balance: number }>({
    queryKey: ["wallet-header", headerToken],
    queryFn: async () => {
      const res = await fetch("/api/wallet/me", { headers: { Authorization: `Bearer ${headerToken}` } });
      if (!res.ok) throw new Error("no wallet");
      return res.json();
    },
    enabled: !!headerToken,
    staleTime: 60_000,
    retry: false,
  });

  const allProductNames = [
    ...products.map(p => p.name),
    ...gafiwProducts.map(p => p.name),
    "Netflix 30 วัน", "Disney+ 30 วัน", "YouTube Premium",
  ].filter(Boolean);

  useEffect(() => {
    const t = setInterval(() => {
      setActVis(false);
      setTimeout(() => { setActIdx(i => (i + 1) % Math.max(FAKE_MASKED.length, 1)); setActVis(true); }, 350);
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const actName = FAKE_MASKED[actIdx % FAKE_MASKED.length];
  const actProduct = allProductNames[actIdx % Math.max(allProductNames.length, 1)] || "สินค้า";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Sarabun','Noto Sans Thai',system-ui,sans-serif", color: C.ink }}>

      {/* ── Header ── */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: `${C.bg}f0`, backdropFilter: "blur(16px)", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {logoUrl
              ? <img src={logoUrl} alt="logo" style={{ width: 34, height: 34, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
              : <div style={{ width: 34, height: 34, borderRadius: 8, background: C.indigo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><ShoppingBag size={15} color="#fff" /></div>
            }
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.ink, letterSpacing: "-0.4px" }}>{storeName}</div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.8 }}>Automated · Trusted</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setLocation(walletPath(slug))}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20, border: `1px solid ${headerWallet ? C.indigo + "60" : C.border}`, background: headerWallet ? C.indigoLt : C.card, color: headerWallet ? C.indigo : C.sub, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              <Wallet size={12} />
              {headerWallet ? `฿${headerWallet.balance.toLocaleString("th-TH")}` : "กระเป๋า"}
            </button>
            <button
              onClick={() => { markAllSeen(); setLocation(slug ? `/r/${slug}/announcements` : "/announcements"); }}
              style={{ position: "relative", width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <Megaphone size={14} color={C.sub} />
              {hasUnread && <span style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: "50%", background: C.red, border: `2px solid ${C.bg}` }} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Announcement ticker ── */}
      {announcement && (
        <button
          onClick={() => setLocation(slug ? `/r/${slug}/announcements` : "/announcements")}
          style={{ width: "100%", background: "#1f1a0a", borderBottom: "1px solid #3a2f0a", display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", textAlign: "left" as const, cursor: "pointer" }}
        >
          <Megaphone size={13} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "#fbbf24", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{announcement}</span>
          <ChevronRight size={12} color="#f59e0b" style={{ flexShrink: 0 }} />
        </button>
      )}

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>

        {/* ── Hero Banner Carousel ── */}
        <div style={{ marginTop: 16 }}>
          <HeroBannerCarousel />
        </div>

        {/* ── Flash Sale ── */}
        <div style={{ marginTop: 16, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", display: "flex" }}>
          <div style={{ width: 4, background: C.indigo, flexShrink: 0 }} />
          <div style={{ flex: 1, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Flame size={16} color={C.indigo} />
              <div>
                <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5, color: C.ink }}>FLASH SALE</div>
                <div style={{ fontSize: 10, color: C.sub }}>ลดสูงสุด 65% · วันนี้เท่านั้น</div>
              </div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" as const, letterSpacing: 0.6, marginBottom: 2 }}>หมดเขต</div>
              <div style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 18, color: C.indigo, letterSpacing: 2 }}>{flashSaleCountdown}</div>
            </div>
          </div>
        </div>

        {/* ── Live Ticker ── */}
        <div style={{
          marginTop: 8, padding: "7px 12px", borderRadius: 8,
          background: C.bgWarm, border: `1px solid ${C.border}`,
          display: "flex", alignItems: "center", gap: 7,
          opacity: actVis ? 1 : 0,
          transform: actVis ? "none" : "translateY(-3px)",
          transition: "all 0.3s ease",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }} />
          <Activity size={11} color={C.muted} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: C.sub, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            <span style={{ color: C.indigo, fontWeight: 700 }}>{actName}</span>{" "}เพิ่งซื้อ{" "}
            <span style={{ color: C.ink, fontWeight: 600 }}>{actProduct}</span>
          </span>
          <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>เมื่อสักครู่</span>
        </div>

        {/* ── Trust Stats ── */}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}`, background: C.card }}>
          {[
            { Icon: Users, value: memberCount.toLocaleString(), label: "สมาชิก", color: C.indigo },
            { Icon: Package, value: totalSold.toLocaleString(), label: "ออเดอร์สำเร็จ", color: C.ink },
            { Icon: CheckCircle, value: "99.8%", label: "ความพอใจ", color: C.green },
          ].map((s, i) => (
            <div key={s.label} style={{ padding: "11px 8px", textAlign: "center" as const, borderRight: i < 2 ? `1px solid ${C.border}` : "none" }}>
              <s.Icon size={14} color={s.color} style={{ margin: "0 auto 4px", display: "block" }} />
              <div style={{ fontWeight: 900, fontSize: 14, color: C.ink, letterSpacing: "-0.4px" }}>{s.value}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Main content ── */}
        <main style={{ paddingTop: 24, paddingBottom: 96 }}>

          {/* Local products */}
          {isLoading ? (
            <section style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{ height: 12, width: 80, borderRadius: 6, background: C.bgWarm }} />
                <div style={{ flex: 1, height: 1, background: C.border }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                {[...Array(3)].map((_, i) => (
                  <div key={i} style={{ borderRadius: 14, background: C.card, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div className="skeleton-shimmer" style={{ aspectRatio: "16/9" }} />
                    <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div className="skeleton-shimmer" style={{ height: 14, width: "70%" }} />
                      <div className="skeleton-shimmer" style={{ height: 10, width: "90%" }} />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <div className="skeleton-shimmer" style={{ height: 22, width: 60, borderRadius: 6 }} />
                        <div className="skeleton-shimmer" style={{ height: 32, width: 80, borderRadius: 9 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : products.length > 0 ? (
            <section style={{ marginBottom: 32 }}>
              <RuleLabel>สินค้าแนะนำ</RuleLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                {products.map((p) => <ProductCard key={p.id} product={p} onBuy={setSelectedProduct} />)}
              </div>
            </section>
          ) : null}

          {/* Gafiw products */}
          {gafiwProducts.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <RuleLabel>{settings?.gafiw_section_title || "สินค้า"}</RuleLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                {gafiwProducts.map((p) => <GafiwProductCard key={p.type_id} product={p} onBuy={setSelectedGafiwProduct} />)}
              </div>
            </section>
          )}

          {products.length === 0 && gafiwProducts.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ textAlign: "center" as const, padding: "80px 24px" }}
            >
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <ShoppingBag size={28} color={C.muted} strokeWidth={1.2} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.ink, marginBottom: 6 }}>ยังไม่มีสินค้าในขณะนี้</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>ร้านกำลังเตรียมสินค้าสำหรับคุณ<br />กลับมาใหม่เร็วๆ นี้นะครับ 🙏</div>
            </motion.div>
          )}

          {/* OTP Tools */}
          <section style={{ marginBottom: 32 }}>
            <RuleLabel>เครื่องมือดึง OTP</RuleLabel>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>สำหรับลูกค้าที่ซื้อบัญชี YouKu หรือ Disney+ — ดึง OTP ได้ที่นี่โดยตรง</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 16 }}>
              <OtpYoukuCard />
              <OtpDisneyCard />
            </div>
          </section>

          {/* How it works */}
          <section>
            <RuleLabel>วิธีใช้งาน</RuleLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
              {[
                { n:"01", Icon: Users,       title:"สมัครสมาชิก",  desc:"ใช้อีเมลฟรี ไม่ต้องยืนยัน" },
                { n:"02", Icon: Wallet,      title:"เติมเครดิต",   desc:"โอนธนาคาร / TrueMoney" },
                { n:"03", Icon: ShoppingBag, title:"เลือกสินค้า",  desc:"ระบบส่งอัตโนมัติทันที" },
                { n:"04", Icon: Shield,      title:"รับสินค้า",    desc:"ลิงก์อยู่ในกระเป๋าของคุณ" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: C.muted, fontFamily: "monospace", paddingTop: 1, minWidth: 22 }}>{s.n}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* ── Mobile floating bottom nav ── */}
      <nav className="sm:hidden" style={{ position: "fixed", bottom: 14, left: "50%", transform: "translateX(-50%)", width: "calc(100vw - 32px)", maxWidth: 380, background: "rgba(15,19,17,0.95)", backdropFilter: "blur(20px)", borderRadius: 32, border: `1px solid ${C.border}`, boxShadow: "0 4px 24px rgba(0,0,0,0.40)", display: "flex", alignItems: "center", justifyContent: "space-around", padding: "6px 12px", zIndex: 50 }}>
        {[
          { Icon: Home,      label: "หน้าแรก",  key: "home",   action: () => setNavTab("home") },
          { Icon: Wallet,    label: "เติมเงิน", key: "wallet", action: () => { setNavTab("wallet"); setLocation(walletPath(slug)); } },
          { isMain: true,    key: "shop" },
          { Icon: History,   label: "ออเดอร์",  key: "orders", action: () => { setNavTab("orders"); setLocation(walletPath(slug)); } },
          { Icon: Megaphone, label: "ประกาศ",   key: "notify", action: () => { setNavTab("notify"); markAllSeen(); setLocation(slug ? `/r/${slug}/announcements` : "/announcements"); } },
        ].map((n: any) => {
          if (n.isMain) return (
            <button key="shop" onClick={() => setNavTab("shop")} style={{ width: 46, height: 46, borderRadius: "50%", background: C.indigo, border: `3px solid ${C.bg}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: -18, boxShadow: `0 4px 14px ${C.indigo}60`, cursor: "pointer", flexShrink: 0 }}>
              <ShoppingBag size={18} color="#fff" />
            </button>
          );
          const active = navTab === n.key;
          return (
            <button key={n.key} onClick={n.action} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, color: active ? C.indigo : C.muted, background: "none", border: "none", cursor: "pointer", padding: "4px 0", minWidth: 40 }}>
              <n.Icon size={17} />
              <span style={{ fontSize: 9, fontWeight: active ? 700 : 400 }}>{n.label}</span>
            </button>
          );
        })}
      </nav>

      <BuyModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      <GafiwBuyModal product={selectedGafiwProduct} onClose={() => setSelectedGafiwProduct(null)} />
      <OrderStatusModal
        open={showOrderStatus}
        initialOrderId={checkOrderId}
        initialName={checkName}
        initialPhone={checkPhone}
        onClose={() => { setShowOrderStatus(false); setCheckOrderId(null); setCheckName(""); setCheckPhone(""); }}
      />
    </div>
  );
}
