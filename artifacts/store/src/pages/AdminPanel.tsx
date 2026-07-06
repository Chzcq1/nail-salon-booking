import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Pencil, Trash2, Package, ClipboardList, LogOut, Shield, ChevronRight, Settings, Megaphone, ExternalLink, CheckCircle, XCircle, Loader, ArrowUp, ArrowDown, Star, Wallet, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Activity, UserCheck, Users, Gift, Upload, CreditCard, BookOpen, FlipHorizontal, Store, ToggleLeft, ToggleRight, ImageIcon, Link, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import AnnouncementsTab from "@/components/AnnouncementsTab";

// ── Customers Tab ─────────────────────────────────────────────────────────────
function CustomersTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [adjustId, setAdjustId] = useState<number | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustError, setAdjustError] = useState("");

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-customers"],
    queryFn: () => fetch("/api/admin/customers", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
  });

  const adjustMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/customers/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: parseFloat(adjustAmount), reason: adjustReason || "แอดมินปรับยอด" }),
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
      setAdjustId(null); setAdjustAmount(""); setAdjustReason(""); setAdjustError("");
    },
    onError: () => setAdjustError("เกิดข้อผิดพลาด"),
  });

  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-4">บัญชีลูกค้า ({customers.length})</h2>
      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><Users size={28} className="mx-auto mb-2 opacity-40" /><p>ยังไม่มีลูกค้า</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left py-2 px-3">Username</th>
                <th className="text-right py-2 px-3">เครดิต</th>
                <th className="text-right py-2 px-3">ธุรกรรม</th>
                <th className="text-right py-2 px-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-foreground">{c.email || c.telegram_username || `#${c.id}`}</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-primary">
                    {c.balance.toLocaleString("th-TH")}
                  </td>
                  <td className="py-2.5 px-3 text-right text-muted-foreground">{c.transaction_count}</td>
                  <td className="py-2.5 px-3 text-right">
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
                      onClick={() => { setAdjustId(c.id); setAdjustAmount(""); setAdjustReason(""); setAdjustError(""); }}>
                      ปรับยอด
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={adjustId !== null} onOpenChange={() => setAdjustId(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">ปรับยอดเครดิต</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">จำนวน (+ เพิ่ม / - ลด)</label>
              <input className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                type="number" placeholder="เช่น 100 หรือ -50" value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">เหตุผล</label>
              <input className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="เช่น โปรโมชั่น, คืนเงิน" value={adjustReason}
                onChange={e => setAdjustReason(e.target.value)} />
            </div>
            {adjustError && <p className="text-red-400 text-xs">{adjustError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAdjustId(null)}>ยกเลิก</Button>
              <Button className="flex-1" disabled={!adjustAmount || adjustMutation.isPending}
                onClick={() => adjustId !== null && adjustMutation.mutate(adjustId)}>
                {adjustMutation.isPending ? <Loader size={13} className="animate-spin" /> : "ยืนยัน"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Topup Requests Tab ────────────────────────────────────────────────────────
function TopupTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  // slip approve dialog
  const [approveItem, setApproveItem] = useState<any | null>(null);
  const [approveAmount, setApproveAmount] = useState("");
  const [approveError, setApproveError] = useState("");
  // slip image lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const { data: topups = [], isLoading } = useQuery<any[]>({
    queryKey: ["admin-topups", filter],
    queryFn: () => fetch(`/api/admin/topup-requests?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    refetchInterval: 15000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/topup-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: parseFloat(approveAmount) }),
      }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.detail); return d; }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-topups"] });
      setApproveItem(null); setApproveAmount(""); setApproveError("");
    },
    onError: (e: Error) => setApproveError(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/topup-requests/${id}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-topups"] }),
  });

  const pendingCount = topups.filter(t => t.status === "pending").length;

  // Separate by type
  const slipItems = topups.filter(t => t.topup_type === "slip");
  const tmItems = topups.filter(t => t.topup_type === "truemoney");

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
      status === "approved" ? "bg-green-500/15 text-green-400 border-green-500/30"
      : status === "rejected" ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30"
    }`}>
      {status === "approved" ? "อนุมัติแล้ว" : status === "rejected" ? "ปฏิเสธ" : "รอดำเนินการ"}
    </span>
  );

  const VerifyChip = ({ status }: { status?: string }) => {
    if (!status) return null;
    const map: Record<string, { label: string; cls: string }> = {
      verified:       { label: "✓ Slip2Go ยืนยัน", cls: "bg-green-500/15 text-green-400" },
      no_config:      { label: "⚠ ยังไม่ตั้งค่า API", cls: "bg-yellow-500/15 text-yellow-400" },
      failed:         { label: "✗ ตรวจไม่ผ่าน", cls: "bg-red-500/15 text-red-400" },
      error:          { label: "✗ API Error", cls: "bg-red-500/15 text-red-400" },
      fraud:          { label: "🚨 สลีปปลอม", cls: "bg-red-500/20 text-red-400 font-bold" },
      duplicate:      { label: "⚠ สลีปซ้ำ", cls: "bg-orange-500/15 text-orange-400" },
      wrong_receiver: { label: "✗ บัญชีไม่ตรง", cls: "bg-red-500/15 text-red-400" },
    };
    const cfg = map[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
    return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.cls}`}>{cfg.label}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          คำขอเติมเครดิต
          {filter === "pending" && pendingCount > 0 && (
            <span className="ml-2 bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </h2>
        <div className="flex gap-1">
          {["pending","approved","rejected","all"].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${filter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {s === "pending" ? "รอดำเนินการ" : s === "approved" ? "อนุมัติแล้ว" : s === "rejected" ? "ปฏิเสธแล้ว" : "ทั้งหมด"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : topups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><CreditCard size={28} className="mx-auto mb-2 opacity-40" /><p>ไม่มีรายการ</p></div>
      ) : (
        <div className="space-y-5">

          {/* ── Bank Transfer / Slip section ──────────────────────────── */}
          {slipItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Upload size={13} className="text-blue-400" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">โอนเงินธนาคาร</span>
                <span className="text-xs text-muted-foreground">({slipItems.length})</span>
              </div>
              <div className="space-y-2">
                {slipItems.map(t => (
                  <div key={t.id} className="bg-card border border-blue-500/20 rounded-xl p-4">
                    {/* Top row */}
                    <div className="flex items-start gap-3">
                      {/* Slip thumbnail */}
                      {t.payment_proof ? (
                        <button
                          onClick={() => setLightboxSrc(t.payment_proof)}
                          className="w-14 h-14 rounded-lg border border-border bg-muted overflow-hidden shrink-0 hover:opacity-80 transition-opacity relative group"
                          title="คลิกเพื่อดูสลีป"
                        >
                          <img src={t.payment_proof} alt="slip" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ImageIcon size={16} className="text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-14 h-14 rounded-lg border border-border bg-muted shrink-0 flex items-center justify-center">
                          <Upload size={18} className="text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.customer_email}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {t.amount && (
                            <span className="text-sm font-bold text-foreground">฿{Number(t.amount).toLocaleString("th-TH")}</span>
                          )}
                          <VerifyChip status={t.slip_verify_status} />
                          {t.verify_detail?.sender_name && (
                            <span className="text-[10px] text-muted-foreground">ผู้โอน: {t.verify_detail.sender_name}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          #{t.id} · {t.created_at ? new Date(t.created_at).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : ""}
                        </p>
                        {t.verify_detail?.error_message && (
                          <p className="text-[10px] text-red-400 mt-0.5">{t.verify_detail.error_message}</p>
                        )}
                      </div>

                      {/* Status / Actions */}
                      <div className="shrink-0">
                        {t.status === "pending" ? (
                          <div className="flex flex-col gap-1 items-end">
                            <Button size="sm" className="text-xs h-7 px-3 bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => { setApproveItem(t); setApproveAmount(t.amount ? String(t.amount) : ""); setApproveError(""); }}>
                              ตรวจ &amp; อนุมัติ
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs h-7 px-3 text-red-400 border-red-500/30 hover:bg-red-500/10"
                              disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(t.id)}>
                              ปฏิเสธ
                            </Button>
                          </div>
                        ) : (
                          <StatusBadge status={t.status} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TrueMoney section ─────────────────────────────────────── */}
          {tmItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Gift size={13} className="text-orange-400" />
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">TrueMoney Wallet</span>
                <span className="text-[10px] bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded">อัตโนมัติถาวร</span>
                <span className="text-xs text-muted-foreground">({tmItems.length})</span>
              </div>
              <div className="space-y-2">
                {tmItems.map(t => (
                  <div key={t.id} className="bg-card border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-500/15 flex items-center justify-center shrink-0">
                      <Gift size={15} className="text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{t.customer_email}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        {t.amount && (
                          <span className="text-sm font-bold text-foreground">฿{Number(t.amount).toLocaleString("th-TH")}</span>
                        )}
                        {t.voucher_code && (
                          <a
                            href={`https://gift.truemoney.com/campaign/?v=${t.voucher_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 transition-colors underline underline-offset-2"
                          >
                            <ExternalLink size={10} />
                            ดูซอง
                          </a>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          #{t.id} · {t.created_at ? new Date(t.created_at).toLocaleString("th-TH", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }) : ""}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {t.status === "pending" ? (
                        <div className="flex flex-col gap-1 items-end">
                          <Button size="sm" className="text-xs h-7 px-3 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => { setApproveItem(t); setApproveAmount(t.amount ? String(t.amount) : ""); setApproveError(""); }}>
                            อนุมัติ
                          </Button>
                          <Button size="sm" variant="outline" className="text-xs h-7 px-3 text-red-400 border-red-500/30 hover:bg-red-500/10"
                            disabled={rejectMutation.isPending} onClick={() => rejectMutation.mutate(t.id)}>
                            ปฏิเสธ
                          </Button>
                        </div>
                      ) : (
                        <StatusBadge status={t.status} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Slip approve dialog ────────────────────────────────────────── */}
      <Dialog open={approveItem !== null} onOpenChange={() => { setApproveItem(null); setApproveAmount(""); setApproveError(""); }}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90dvh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-sm">
              {approveItem?.topup_type === "slip" ? "ตรวจสลีป & อนุมัติเครดิต" : "อนุมัติเครดิต"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-4">
            {/* Slip image (bank only) */}
            {approveItem?.payment_proof && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">ภาพสลีปที่ลูกค้าแนบมา</p>
                <img
                  src={approveItem.payment_proof}
                  alt="slip"
                  className="w-full rounded-xl border border-border object-contain bg-muted max-h-72 cursor-zoom-in"
                  onClick={() => setLightboxSrc(approveItem.payment_proof)}
                />
                {approveItem.slip_verify_status && (
                  <div className="mt-2 flex items-center gap-2">
                    <VerifyChip status={approveItem.slip_verify_status} />
                    {approveItem.verify_detail?.sender_name && (
                      <span className="text-xs text-muted-foreground">ผู้โอน: {approveItem.verify_detail.sender_name} ({approveItem.verify_detail.sender_bank})</span>
                    )}
                    {approveItem.verify_detail?.trans_ref && (
                      <span className="text-xs text-muted-foreground font-mono">ref: {approveItem.verify_detail.trans_ref}</span>
                    )}
                  </div>
                )}
                {approveItem.verify_detail?.error_message && (
                  <p className="text-xs text-yellow-400 mt-1">⚠ {approveItem.verify_detail.error_message}</p>
                )}
              </div>
            )}

            {/* TrueMoney voucher link */}
            {approveItem?.topup_type === "truemoney" && approveItem?.voucher_code && (
              <a
                href={`https://gift.truemoney.com/campaign/?v=${approveItem.voucher_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 text-sm text-orange-400 hover:bg-orange-500/15 transition-colors"
              >
                <Gift size={14} />
                <span className="flex-1 truncate">ดูซอง TrueMoney</span>
                <ExternalLink size={13} />
              </a>
            )}

            {/* Customer info */}
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-xs text-muted-foreground">
              ลูกค้า: <span className="text-foreground font-medium">{approveItem?.customer_email}</span>
              <span className="ml-3">#{approveItem?.id}</span>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">
                จำนวนเครดิตที่จะเพิ่ม <span className="text-muted-foreground/60">(1 บาท = 1 เครดิต)</span>
              </label>
              <input
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                type="number" placeholder="เช่น 100" value={approveAmount}
                onChange={e => setApproveAmount(e.target.value)}
              />
            </div>

            {approveError && <p className="text-red-400 text-xs">{approveError}</p>}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setApproveItem(null)}>ยกเลิก</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                disabled={!approveAmount || approveMutation.isPending}
                onClick={() => approveItem !== null && approveMutation.mutate(approveItem.id)}>
                {approveMutation.isPending ? <Loader size={13} className="animate-spin" /> : "อนุมัติ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Lightbox ───────────────────────────────────────────────────── */}
      <Dialog open={lightboxSrc !== null} onOpenChange={() => setLightboxSrc(null)}>
        <DialogContent className="bg-black/90 border-white/10 max-w-2xl p-2">
          <button onClick={() => setLightboxSrc(null)}
            className="absolute top-3 right-3 z-10 bg-black/60 rounded-full p-1.5 hover:bg-black/80">
            <X size={16} className="text-white" />
          </button>
          {lightboxSrc && (
            <img src={lightboxSrc} alt="slip full" className="w-full max-h-[85vh] object-contain rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const from = fromRef.current;
    const diff = target - from;
    if (diff === 0) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(from + diff * ease);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string;
  cost: string | null;
  fake_discount_price: string | null;
  image_url: string | null;
  image_urls: string | null;
  telegram_group_ids: string | null;
  is_active: boolean;
  sort_order: number;
  is_featured: boolean;
  badge_text: string | null;
  badge_color: string | null;
  sales_count: number;
  catalog_group: string;
}

interface Order {
  id: number;
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_first_name: string | null;
  phone_number: string | null;
  product_name: string;
  payment_type: string;
  payment_proof: string | null;
  status: string;
  link_sent: boolean;
  invite_links: string | null;
  slip_verify_status: string | null;
  slip_verify_result: string | null;
  created_at: string;
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
  finance_admin_names: string;
  slip_verify_mode: string;
  receiver_bank_code: string;
  truemoney_phone: string;
  topup_slip_enabled: string;
  topup_truemoney_enabled: string;
  gafiw_section_title: string;
  logo_url: string;
  fake_sold_base: string;
  fake_member_count: string;
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    approved: "bg-green-500/20 text-green-400 border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${map[status] || ""}`}>
      {status}
    </span>
  );
}

function ProductFormModal({
  product,
  token,
  onClose,
}: {
  product: Product | null;
  token: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!product;

  let initialImageUrls: string[] = [];
  try {
    if (product?.image_urls) initialImageUrls = JSON.parse(product.image_urls);
  } catch {}

  const [form, setForm] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price: product?.price ?? "",
    cost: product?.cost ?? "",
    fake_discount_price: product?.fake_discount_price ?? "",
    telegram_group_ids: product?.telegram_group_ids ?? "",
    is_active: product?.is_active ?? true,
    is_featured: product?.is_featured ?? false,
    badge_text: product?.badge_text ?? "แนะนำ",
    badge_color: product?.badge_color ?? "#f59e0b",
    sales_count: product?.sales_count ?? 0,
    catalog_group: product?.catalog_group ?? "A",
  });
  const [imageUrls, setImageUrls] = useState<string[]>(initialImageUrls.length > 0 ? initialImageUrls : [product?.image_url ?? ""]);
  const [error, setError] = useState("");

  const addImageUrl = () => setImageUrls((prev) => [...prev, ""]);
  const removeImageUrl = (i: number) => setImageUrls((prev) => prev.filter((_, idx) => idx !== i));
  const updateImageUrl = (i: number, val: string) => setImageUrls((prev) => prev.map((u, idx) => idx === i ? val : u));

  const mutation = useMutation({
    mutationFn: async () => {
      const validUrls = imageUrls.map((u) => u.trim()).filter(Boolean);
      const body = {
        name: form.name,
        description: form.description || null,
        price: parseFloat(form.price),
        cost: form.cost ? parseFloat(form.cost) : null,
        fake_discount_price: form.fake_discount_price ? parseFloat(form.fake_discount_price) : null,
        image_url: validUrls[0] || null,
        image_urls: validUrls.length > 0 ? JSON.stringify(validUrls) : null,
        telegram_group_ids: form.telegram_group_ids || null,
        is_active: form.is_active,
        is_featured: form.is_featured,
        badge_text: form.is_featured ? (form.badge_text || "แนะนำ") : null,
        badge_color: form.is_featured ? (form.badge_color || "#f59e0b") : null,
        sales_count: form.sales_count,
        catalog_group: form.catalog_group,
      };
      const url = isEdit ? `/api/admin/products/${product!.id}` : "/api/admin/products";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: authHeaders(token), body: JSON.stringify(body) });
      if (!res.ok) throw new Error("Failed to save product");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      onClose();
    },
    onError: () => setError("Failed to save product. Check all required fields."),
  });

  const field = (label: string, key: keyof typeof form, placeholder = "", type = "text") => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={form[key] as string}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {field("ชื่อสินค้า *", "name", "เช่น กลุ่มสัญญาณเทรด")}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">รายละเอียด</label>
            <textarea
              placeholder="อธิบายสิ่งที่ลูกค้าจะได้รับ..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("ราคาขาย (฿) *", "price", "500", "number")}
            {field("ราคาเดิม (฿)", "fake_discount_price", "799", "number")}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              ต้นทุน / ราคา Gafiw (฿)
            </label>
            <input
              type="number"
              placeholder="เช่น 350 — กำไร = ราคาขาย − ต้นทุน"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {form.price && form.cost && parseFloat(form.cost) > 0 && (
              <p className="text-xs text-green-400 mt-0.5">
                กำไรต่อชิ้น: ฿{(parseFloat(form.price) - parseFloat(form.cost)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                {" "}({Math.round(((parseFloat(form.price) - parseFloat(form.cost)) / parseFloat(form.price)) * 100)}%)
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                รูปภาพสินค้า ({imageUrls.filter(u => u.trim()).length} ภาพ)
              </label>
              <button type="button" onClick={addImageUrl}
                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium">
                <Plus size={12} /> เพิ่มรูป
              </button>
            </div>
            {imageUrls.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder={`URL รูปภาพที่ ${i + 1}`}
                  value={url}
                  onChange={(e) => updateImageUrl(i, e.target.value)}
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                {url.trim() && (
                  <img src={url} alt="" className="w-8 h-8 rounded object-cover shrink-0 border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
                {imageUrls.length > 1 && (
                  <button type="button" onClick={() => removeImageUrl(i)}
                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">รูปแรกจะเป็นรูปหลัก รูปที่เหลือสลับได้ในการ์ดสินค้า</p>
          </div>

          {field("Telegram Group IDs", "telegram_group_ids", "-100123456789,-100987654321")}
          <p className="text-xs text-muted-foreground -mt-1">
            คั่นด้วยคอมมาสำหรับหลายกลุ่ม บอตจะสร้างลิงก์เชิญใช้ครั้งเดียวให้แต่ละกลุ่ม
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">แคตตาล็อค</label>
            <div className="flex gap-2">
              {(["A", "B"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, catalog_group: g }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-bold transition-colors ${
                    form.catalog_group === g
                      ? g === "A"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-purple-600 border-purple-600 text-white"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  ชุด {g}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">สินค้าจะแสดงบนหน้าร้านเมื่อแคตตาล็อคชุดนี้ถูกเปิดใช้งาน</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_active ? "translate-x-5" : ""}`} />
            </button>
            <span className="text-sm text-foreground">{form.is_active ? "เปิดขาย" : "ปิดขาย"}</span>
          </div>

          <div className="border border-border rounded-lg p-3 flex flex-col gap-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_featured: !f.is_featured }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_featured ? "bg-yellow-500" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${form.is_featured ? "translate-x-5" : ""}`} />
              </button>
              <Star size={13} className={form.is_featured ? "text-yellow-400" : "text-muted-foreground"} />
              <span className="text-sm text-foreground font-medium">สินค้าแนะนำ / ยอดนิยม</span>
            </div>
            {form.is_featured && (
              <div className="flex flex-col gap-2 pl-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ข้อความบนป้าย</label>
                    <input
                      type="text"
                      placeholder="เช่น แนะนำ, นิยม, HOT"
                      value={form.badge_text}
                      onChange={(e) => setForm((f) => ({ ...f, badge_text: e.target.value }))}
                      className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">สีกรอบ / ป้าย</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.badge_color}
                        onChange={(e) => setForm((f) => ({ ...f, badge_color: e.target.value }))}
                        className="w-10 h-9 rounded cursor-pointer border border-border bg-muted p-0.5"
                      />
                      <span className="text-xs text-muted-foreground font-mono">{form.badge_color}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">ตัวอย่างป้าย:</span>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: form.badge_color }}
                  >
                    {form.badge_text || "แนะนำ"}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ยอดขาย (ครั้ง)</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sales_count: Math.max(0, f.sales_count - 1) }))}
                className="w-8 h-8 rounded bg-muted border border-border text-foreground hover:bg-muted-foreground/20 flex items-center justify-center text-lg font-bold"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={form.sales_count}
                onChange={(e) => setForm((f) => ({ ...f, sales_count: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="w-24 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground text-center focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, sales_count: f.sales_count + 1 }))}
                className="w-8 h-8 rounded bg-muted border border-border text-foreground hover:bg-muted-foreground/20 flex items-center justify-center text-lg font-bold"
              >
                +
              </button>
              <span className="text-xs text-muted-foreground">แสดงบนหน้าร้านว่า "ซื้อไปแล้ว X ครั้ง"</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !form.name || !form.price}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold mt-1"
          >
            {mutation.isPending ? "กำลังบันทึก..." : isEdit ? "บันทึกการแก้ไข" : "เพิ่มสินค้า"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CatalogFlipBanner({ token }: { token: string }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: status } = useQuery<{ active_catalog: string; count_a: number; count_b: number }>({
    queryKey: ["catalog-status"],
    queryFn: () => fetch("/api/admin/catalog/status", { headers: authHeaders(token) }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const flipMutation = useMutation({
    mutationFn: () => fetch("/api/admin/catalog/flip", { method: "POST", headers: authHeaders(token) }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-status"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      setConfirmOpen(false);
    },
  });

  const active = status?.active_catalog ?? "A";
  const next = active === "A" ? "B" : "A";
  const activeCount = active === "A" ? (status?.count_a ?? 0) : (status?.count_b ?? 0);
  const nextCount = next === "A" ? (status?.count_a ?? 0) : (status?.count_b ?? 0);

  return (
    <>
      <div className={`rounded-xl border p-4 mb-5 flex items-center justify-between gap-4 ${active === "A" ? "bg-blue-600/10 border-blue-600/30" : "bg-purple-600/10 border-purple-600/30"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${active === "A" ? "bg-blue-600/20" : "bg-purple-600/20"}`}>
            <BookOpen size={18} className={active === "A" ? "text-blue-400" : "text-purple-400"} />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">
              แคตตาล็อคที่เปิดอยู่: <span className={active === "A" ? "text-blue-400" : "text-purple-400"}>ชุด {active}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              ชุด {active}: {activeCount} สินค้า · ชุด {next}: {nextCount} สินค้า
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          className={`gap-1.5 font-bold shrink-0 ${next === "A" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}`}
        >
          <FlipHorizontal size={13} /> พลิกเป็นชุด {next}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">ยืนยันการพลิกแคตตาล็อค</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">
              หน้าร้านจะแสดงสินค้า<span className={`font-bold mx-1 ${next === "A" ? "text-blue-400" : "text-purple-400"}`}>ชุด {next}</span>
              ทันที ({nextCount} สินค้า) แทนที่ชุด {active}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>ยกเลิก</Button>
              <Button
                className={`flex-1 font-bold ${next === "A" ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-purple-600 hover:bg-purple-700 text-white"}`}
                disabled={flipMutation.isPending}
                onClick={() => flipMutation.mutate()}
              >
                {flipMutation.isPending ? <Loader size={13} className="animate-spin" /> : `พลิกเป็นชุด ${next}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Product | null | "new">(null);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "A" | "B">("all");

  const { data: allProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: ["admin-products"],
    queryFn: () =>
      fetch("/api/admin/products", { headers: authHeaders(token) }).then((r) => {
        if (r.status === 401) throw new Error("Unauthorized");
        return r.json();
      }),
  });

  const products = catalogFilter === "all" ? allProducts : allProducts.filter(p => p.catalog_group === catalogFilter);

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/products/${id}`, { method: "DELETE", headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  const moveMutation = useMutation({
    mutationFn: ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      fetch(`/api/admin/products/${id}/move?direction=${direction}`, { method: "POST", headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  const countA = allProducts.filter(p => p.catalog_group === "A").length;
  const countB = allProducts.filter(p => p.catalog_group === "B").length;

  return (
    <div>
      <CatalogFlipBanner token={token} />

      <div className="flex justify-between items-center mb-3">
        <div className="flex gap-1">
          {([["all", `ทั้งหมด (${allProducts.length})`], ["A", `ชุด A (${countA})`], ["B", `ชุด B (${countB})`]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setCatalogFilter(val)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors font-medium ${
                catalogFilter === val
                  ? val === "A" ? "bg-blue-600 text-white" : val === "B" ? "bg-purple-600 text-white" : "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}>
              {label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setEditing("new")} className="bg-primary text-primary-foreground gap-1">
          <Plus size={14} /> เพิ่มสินค้า
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีสินค้า{catalogFilter !== "all" ? `ในชุด ${catalogFilter}` : ""}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p, idx) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`flex items-center gap-3 bg-card border rounded-lg px-3 py-3 hover:border-primary/30 transition-colors ${p.is_featured ? "border-yellow-500/50" : "border-border"}`}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveMutation.mutate({ id: p.id, direction: "up" })}
                  disabled={idx === 0 || moveMutation.isPending}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  onClick={() => moveMutation.mutate({ id: p.id, direction: "down" })}
                  disabled={idx === products.length - 1 || moveMutation.isPending}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown size={13} />
                </button>
              </div>
              {p.image_url ? (
                <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <Package size={16} className="text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-foreground text-sm truncate">{p.name}</p>
                  {p.is_featured && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white shrink-0"
                      style={{ backgroundColor: p.badge_color || "#f59e0b" }}
                    >
                      {p.badge_text || "แนะนำ"}
                    </span>
                  )}
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${p.catalog_group === "A" ? "bg-blue-600/20 text-blue-400" : "bg-purple-600/20 text-purple-400"}`}>
                    ชุด {p.catalog_group}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ฿{parseFloat(p.price).toLocaleString()}
                  {p.sales_count > 0 && <span className="ml-2 text-muted-foreground/60">· ขายแล้ว {p.sales_count} ครั้ง</span>}
                </p>
              </div>
              {!p.is_active && (
                <Badge variant="outline" className="text-xs border-muted text-muted-foreground">
                  ปิดขาย
                </Badge>
              )}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                  <Pencil size={13} />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { if (confirm(`ลบ "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {editing && (
        <ProductFormModal
          product={editing === "new" ? null : editing}
          token={token}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PaymentTypeBadge({ type }: { type: string }) {
  if (type === "truemoney") {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">TrueMoney</span>;
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">สลีป</span>;
}

function SlipVerifyBadge({ status, result }: { status: string | null; result: string | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!status) return null;

  let parsed: Record<string, unknown> = {};
  try { if (result) parsed = JSON.parse(result); } catch {}

  const cfg: Record<string, { label: string; pill: string; bar: string }> = {
    verified:       { label: "ยืนยันสลีปแล้ว",    pill: "bg-green-500/15 text-green-400 border-green-500/30",   bar: "border-l-green-500"   },
    wrong_receiver: { label: "บัญชีผู้รับไม่ตรง",  pill: "bg-red-500/15 text-red-400 border-red-500/30",         bar: "border-l-red-500"     },
    duplicate:      { label: "สลีปซ้ำ",             pill: "bg-orange-500/15 text-orange-400 border-orange-500/30",bar: "border-l-orange-500"  },
    no_qr:          { label: "อ่าน QR ไม่ได้",      pill: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",bar: "border-l-yellow-500"  },
    failed:         { label: "ตรวจไม่ผ่าน",         pill: "bg-red-500/15 text-red-400 border-red-500/30",         bar: "border-l-red-500"     },
    error:          { label: "เชื่อมต่อล้มเหลว",    pill: "bg-red-500/15 text-red-400 border-red-500/30",         bar: "border-l-red-500"     },
    no_config:      { label: "ยังไม่ตั้งค่า API",   pill: "bg-muted text-muted-foreground border-border",         bar: "border-l-border"      },
  };
  const c = cfg[status] ?? { label: status, pill: "bg-muted text-muted-foreground border-border", bar: "border-l-border" };

  const amount         = parsed.amount        as number  | null | undefined;
  const expectedAmount = parsed.expected_amount as number | null | undefined;
  const amountMatch    = parsed.amount_match  as boolean | null | undefined;
  const senderName     = parsed.sender_name   as string  | undefined;
  const senderBank     = parsed.sender_bank   as string  | undefined;
  const rcvName        = parsed.receiver_name as string  | undefined;
  const rcvBank        = parsed.receiver_bank as string  | undefined;
  const transRef       = parsed.trans_ref     as string  | undefined;
  const dateTime       = parsed.date_time     as string  | undefined;
  const rcvChecked     = parsed.receiver_checked as boolean | undefined;
  const rcvMatch       = parsed.receiver_match   as boolean | null | undefined;
  const errMsg         = parsed.error_message as string  | undefined;

  const hasDetail = amount != null || senderName || rcvName || transRef || errMsg || dateTime;

  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); }
    catch { return s; }
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {/* ── status pill + toggle ── */}
      <button
        onClick={() => hasDetail && setExpanded(v => !v)}
        className={`inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${c.pill} ${hasDetail ? "cursor-pointer hover:opacity-80 transition-opacity" : "cursor-default"}`}
      >
        {c.label}
        {hasDetail && <span className="opacity-50 text-[9px]">{expanded ? "▲" : "▼"}</span>}
      </button>

      {/* ── always-visible quick row (when verified) ── */}
      {status === "verified" && amount != null && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className={`px-1.5 py-0.5 rounded border font-medium ${amountMatch === false ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-green-500/10 text-green-400 border-green-500/30"}`}>
            {Number(amount).toLocaleString("th-TH")} บาท{amountMatch === false ? " — ยอดไม่ตรง" : amountMatch === true ? " — ตรง" : ""}
          </span>
          {senderName && (
            <span className="px-1.5 py-0.5 rounded border bg-muted text-foreground border-border">
              {senderName}{senderBank ? ` · ${senderBank}` : ""}
            </span>
          )}
        </div>
      )}

      {/* ── amount mismatch pill on non-verified ── */}
      {status !== "verified" && amountMatch === false && (
        <span className="self-start text-[11px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/30">ยอดไม่ตรง</span>
      )}

      {/* ── expandable detail card ── */}
      {expanded && hasDetail && (
        <div className={`border-l-4 ${c.bar} bg-muted/50 border border-border rounded-r-lg pl-3 pr-3 py-2.5 text-xs flex flex-col gap-1.5`}>

          {/* amount row */}
          {amount != null && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-muted-foreground w-16 shrink-0">ยอดเงิน</span>
              <span className={`font-semibold ${amountMatch === false ? "text-red-400" : "text-foreground"}`}>
                {Number(amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
              </span>
              {expectedAmount != null && (
                <span className="text-muted-foreground text-[10px]">
                  (ราคาสินค้า {Number(expectedAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท)
                </span>
              )}
              {amountMatch === true  && <span className="text-green-400 text-[10px] font-medium">ตรง</span>}
              {amountMatch === false && <span className="text-red-400   text-[10px] font-medium">ไม่ตรง</span>}
            </div>
          )}

          {/* sender */}
          {senderName && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-muted-foreground w-16 shrink-0">ผู้โอน</span>
              <span className="text-foreground font-medium">{senderName}</span>
              {senderBank && <span className="text-muted-foreground text-[10px]">{senderBank}</span>}
            </div>
          )}

          {/* receiver */}
          {rcvName && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-muted-foreground w-16 shrink-0">ผู้รับ</span>
              <span className="text-foreground font-medium">{rcvName}</span>
              {rcvBank && <span className="text-muted-foreground text-[10px]">{rcvBank}</span>}
              {rcvChecked && rcvMatch === true  && <span className="text-green-400 text-[10px]">ตรง</span>}
              {rcvChecked && rcvMatch === false && <span className="text-red-400   text-[10px]">ไม่ตรง</span>}
            </div>
          )}

          {/* date/time */}
          {dateTime && (
            <div className="flex items-baseline gap-2">
              <span className="text-muted-foreground w-16 shrink-0">วันเวลา</span>
              <span className="text-foreground">{fmtDate(dateTime)}</span>
            </div>
          )}

          {/* trans ref */}
          {transRef && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-muted-foreground w-16 shrink-0">Ref</span>
              <span className="font-mono text-[10px] text-muted-foreground break-all">{transRef}</span>
            </div>
          )}

          {/* error */}
          {errMsg && status !== "verified" && (
            <div className="flex items-start gap-2 mt-0.5">
              <span className="text-muted-foreground w-16 shrink-0">เหตุผล</span>
              <span className="text-red-400 leading-snug">{errMsg}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderProofViewer({ proof, type, verifyStatus, verifyResult }: { proof: string | null; type: string; verifyStatus: string | null; verifyResult: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <PaymentTypeBadge type={type} />
      {type === "truemoney" && proof ? (
        <a href={proof} target="_blank" rel="noopener noreferrer" className="text-primary text-xs flex items-center gap-1 hover:underline">
          ดูลิงก์ <ExternalLink size={10} />
        </a>
      ) : proof && proof.startsWith("data:image") ? (
        <>
          <button onClick={() => setOpen(true)} className="text-primary text-xs flex items-center gap-1 hover:underline cursor-pointer">
            ดูสลีป <ExternalLink size={10} />
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-lg p-3">
              <DialogHeader>
                <DialogTitle className="text-sm">หลักฐานการชำระเงิน</DialogTitle>
              </DialogHeader>
              <img src={proof} alt="slip" className="w-full rounded-lg object-contain max-h-[70vh]" />
            </DialogContent>
          </Dialog>
        </>
      ) : !proof ? (
        <span className="text-muted-foreground text-xs">—</span>
      ) : null}
      {type === "slip" && <SlipVerifyBadge status={verifyStatus} result={verifyResult} />}
    </div>
  );
}

function SetLinksModal({ order, token, onClose }: { order: Order; token: string; onClose: () => void }) {
  const qc = useQueryClient();
  const existingLinks: string[] = (() => {
    try { return order.invite_links ? JSON.parse(order.invite_links) : []; } catch { return []; }
  })();
  const [lines, setLines] = useState(existingLinks.join("\n"));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const links = lines.split("\n").map((l) => l.trim()).filter(Boolean);
      if (links.length === 0) throw new Error("กรุณากรอกลิงก์อย่างน้อย 1 ลิงก์");
      const res = await fetch(`/api/admin/orders/${order.id}/links`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ invite_links: links }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail || "บันทึกไม่สำเร็จ"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      setSaved(true);
      setTimeout(() => onClose(), 1500);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">ใส่ลิงก์เชิญ — ออเดอร์ #{order.id}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">{order.product_name} · {order.telegram_first_name || "—"}</p>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              ลิงก์ Telegram (1 ลิงก์ต่อบรรทัด)
            </label>
            <textarea
              rows={5}
              placeholder={"https://t.me/+xxxxxxxxxxxx\nhttps://t.me/+yyyyyyyyyyyy"}
              value={lines}
              onChange={(e) => { setLines(e.target.value); setError(""); setSaved(false); }}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-none font-mono"
            />
            <p className="text-xs text-muted-foreground">จำนวน: {lines.split("\n").filter((l) => l.trim()).length} ลิงก์</p>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {saved && <p className="text-green-400 text-sm">✓ บันทึกสำเร็จ สถานะจะเปลี่ยนเป็น approved</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">ยกเลิก</Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold">
              {mutation.isPending ? "กำลังบันทึก..." : "บันทึกลิงก์"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = "ยืนยัน",
  variant = "danger",
  children,
}: {
  title: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  variant?: "danger" | "default";
  children?: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} />
            <DialogTitle className="text-foreground">{title}</DialogTitle>
          </div>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
        <div className="flex gap-2 mt-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">ยกเลิก</Button>
          <Button
            onClick={onConfirm}
            className={`flex-1 font-bold ${variant === "danger" ? "bg-red-600 hover:bg-red-500 text-white border-0" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OrdersTab({ token }: { token: string }) {
  const [setLinksOrder, setSetLinksOrder] = useState<Order | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleteAdmin, setDeleteAdmin] = useState<string>(() => localStorage.getItem("admin_current_name") || "");
  const qc = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["admin-orders"],
    queryFn: () =>
      fetch("/api/admin/orders", { headers: authHeaders(token) }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: number) =>
      fetch(`/api/admin/orders/${orderId}/approve`, { method: "POST", headers: authHeaders(token) }).then(async (r) => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "อนุมัติไม่สำเร็จ"); }
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["finance-entries"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (orderId: number) =>
      fetch(`/api/admin/orders/${orderId}/reject`, { method: "POST", headers: authHeaders(token) }).then(async (r) => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "ปฏิเสธไม่สำเร็จ"); }
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const r = await fetch(`/api/admin/orders/${orderId}`, { method: "DELETE", headers: authHeaders(token) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "ลบไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      const who = deleteAdmin || localStorage.getItem("admin_current_name") || "แอดมิน";
      fetch("/api/admin/logs", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ admin_name: who, action: "delete_order", details: `ลบออเดอร์ #${orderId}` }),
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["admin-logs"] });
      setDeleteConfirm(null);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (orderId: number) =>
      fetch(`/api/admin/orders/${orderId}/verify-slip`, { method: "POST", headers: authHeaders(token) }).then(async (r) => {
        if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || "ตรวจสลีปไม่สำเร็จ"); }
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orders"] }),
  });

  const pendingCount = orders.filter((o) => o.status === "pending").length;

  return (
    <div>
      {deleteConfirm !== null && (
        <ConfirmDialog
          title="ลบออเดอร์นี้?"
          description={`ออเดอร์ #${deleteConfirm} จะถูกลบถาวร ไม่สามารถกู้คืนได้`}
          confirmLabel={deleteMutation.isPending ? "กำลังลบ..." : "ลบออเดอร์"}
          onConfirm={() => deleteMutation.mutate(deleteConfirm)}
          onCancel={() => { setDeleteConfirm(null); setDeleteAdmin(""); }}
        >
          {(() => {
            const names = (localStorage.getItem("admin_finance_names") || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (names.length === 0) return (
              <div className="mt-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ดำเนินการโดย (ไม่บังคับ)</label>
                <input
                  value={deleteAdmin}
                  onChange={(e) => setDeleteAdmin(e.target.value)}
                  placeholder="ชื่อแอดมิน"
                  className="bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            );
            return (
              <div className="mt-2 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">ดำเนินการโดย</label>
                <div className="flex gap-1 flex-wrap">
                  {names.map((n) => (
                    <button key={n} onClick={() => setDeleteAdmin(n)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${deleteAdmin === n ? "bg-red-600 border-red-600 text-white font-bold" : "border-border bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    >{n}</button>
                  ))}
                </div>
              </div>
            );
          })()}
        </ConfirmDialog>
      )}
      {setLinksOrder && (
        <SetLinksModal order={setLinksOrder} token={token} onClose={() => setSetLinksOrder(null)} />
      )}
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm text-muted-foreground">{orders.length} ออเดอร์</h2>
        {pendingCount > 0 && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            {pendingCount} รอดำเนินการ
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 bg-card border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีออเดอร์</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">ลูกค้า</th>
                <th className="px-4 py-3 text-left">สินค้า</th>
                <th className="px-4 py-3 text-left">หลักฐาน</th>
                <th className="px-4 py-3 text-left">สถานะ</th>
                <th className="px-4 py-3 text-left">วันที่</th>
                <th className="px-4 py-3 text-left">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isActing = (approveMutation.isPending && approveMutation.variables === o.id) ||
                                 (rejectMutation.isPending && rejectMutation.variables === o.id);
                return (
                  <tr key={o.id} className={`border-b border-border last:border-0 transition-colors ${o.status === "pending" ? "bg-yellow-500/5 hover:bg-yellow-500/10" : "hover:bg-muted/10"}`}>
                    <td className="px-4 py-3 font-mono text-muted-foreground">#{o.id}</td>
                    <td className="px-4 py-3">
                      <p className="text-foreground font-medium">{o.telegram_first_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.telegram_username ? `${o.telegram_username}` : ""}
                        {o.phone_number ? ` · ${o.phone_number}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-foreground">{o.product_name}</td>
                    <td className="px-4 py-3">
                      <OrderProofViewer proof={o.payment_proof ?? null} type={o.payment_type} verifyStatus={o.slip_verify_status} verifyResult={o.slip_verify_result} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge status={o.status} />
                        {o.status === "approved" && (
                          <span className={`text-xs ${o.link_sent ? "text-green-400" : "text-yellow-400"}`}>
                            {o.link_sent ? "ส่งลิงก์แล้ว" : "ยังไม่ได้ส่งลิงก์"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {o.created_at ? new Date(o.created_at).toLocaleDateString("th-TH") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === "pending" ? (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              disabled={isActing}
                              onClick={() => approveMutation.mutate(o.id)}
                              className="text-xs h-7 px-2.5 gap-1 bg-green-600 hover:bg-green-500 text-white border-0"
                            >
                              {isActing && approveMutation.variables === o.id
                                ? <Loader size={11} className="animate-spin" />
                                : <CheckCircle size={11} />}
                              อนุมัติ
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={isActing}
                              onClick={() => rejectMutation.mutate(o.id)}
                              className="text-xs h-7 px-2.5 gap-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                            >
                              {isActing && rejectMutation.variables === o.id
                                ? <Loader size={11} className="animate-spin" />
                                : <XCircle size={11} />}
                              ปฏิเสธ
                            </Button>
                          </div>
                          {o.payment_type === "slip" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={verifyMutation.isPending && verifyMutation.variables === o.id}
                              onClick={() => verifyMutation.mutate(o.id)}
                              className="text-xs h-7 px-2.5 gap-1 border-primary/40 text-primary hover:bg-primary/10 whitespace-nowrap"
                            >
                              {verifyMutation.isPending && verifyMutation.variables === o.id
                                ? <Loader size={11} className="animate-spin" />
                                : <RefreshCw size={11} />}
                              ตรวจสลีป
                            </Button>
                          )}
                        </div>
                      ) : o.status === "approved" ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSetLinksOrder(o)}
                            className="text-xs h-7 px-2 gap-1"
                          >
                            <ExternalLink size={11} />
                            {o.invite_links && (() => { try { return JSON.parse(o.invite_links).length > 0; } catch { return false; } })()
                              ? "แก้ลิงก์"
                              : "ใส่ลิงก์"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(o.id)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                            title="ลบออเดอร์"
                          >
                            <Trash2 size={11} />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirm(o.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                          title="ลบออเดอร์"
                        >
                          <Trash2 size={11} />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GafiwBalanceCard({ token }: { token: string }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkBalance = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/gafiw/wallet-balance", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "ดึงยอดไม่ได้");
      setBalance(data.balance);
      setLastChecked(new Date());
    } catch (e: any) {
      setError(e.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 bg-card border border-orange-500/30 rounded-xl p-5">
      <div className="flex items-center gap-2">
        <span className="text-lg">🏦</span>
        <h3 className="font-semibold text-foreground text-sm">ยอดเงินกระเป๋า Gafiw</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        ยอดเงินที่คุณเติมไว้กับร้าน Gafiw สำหรับซื้อสินค้าให้ลูกค้า
      </p>

      {balance !== null && (
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-orange-400">
            ฿{balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </span>
          {balance < 100 && (
            <span className="text-xs text-red-400 font-medium">⚠️ ยอดต่ำ ควรเติมเงิน</span>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {lastChecked && (
        <p className="text-xs text-muted-foreground">
          อัปเดตล่าสุด: {lastChecked.toLocaleTimeString("th-TH")}
        </p>
      )}

      <button
        onClick={checkBalance}
        disabled={loading}
        className="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-medium hover:bg-orange-500/20 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            กำลังโหลด...
          </>
        ) : (
          <>🔄 {balance !== null ? "รีเฟรช" : "เช็คยอดเงิน"}</>
        )}
      </button>
    </div>
  );
}

function SettingsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery<StoreSettings>({
    queryKey: ["store-settings"],
    queryFn: () => fetch("/api/store-settings").then((r) => r.json()),
  });

  const [form, setForm] = useState<StoreSettings>({
    store_name: "",
    hero_title: "",
    hero_subtitle: "",
    announcement: "",
    bot_username: "",
    bank_name: "",
    bank_account: "",
    bank_qr_url: "",
    finance_admin_names: "",
    slip_verify_mode: "off",
    receiver_bank_code: "",
    truemoney_phone: "",
    topup_slip_enabled: "on",
    topup_truemoney_enabled: "on",
    gafiw_section_title: "",
    logo_url: "",
    fake_sold_base: "12847",
    fake_member_count: "18947",
  });

  const [logoUploading, setLogoUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, token: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setForm((f) => ({ ...f, logo_url: data.url }));
    } catch {
      alert("อัปโหลดไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setLogoUploading(false);
    }
  };

  const [initialized, setInitialized] = useState(false);
  if (settings && !initialized) {
    setForm(settings);
    setInitialized(true);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/store-settings", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading) {
    return <div className="h-40 animate-pulse bg-card border border-border rounded-lg" />;
  }

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-foreground">ตั้งค่าหน้าร้าน</h2>
        <p className="text-sm text-muted-foreground">แก้ไขข้อความที่แสดงบนหน้าหลักของร้าน</p>
      </div>

      {/* Telegram Bot Settings */}
      <div className="flex flex-col gap-4 bg-card border border-[#229ED9]/30 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#229ED9]">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.29 13.91l-2.957-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.855.649z" />
          </svg>
          <h3 className="font-semibold text-foreground text-sm">ตั้งค่า Telegram Bot</h3>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bot Username</label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">@</span>
            <input
              type="text"
              value={form.bot_username.replace(/^@/, "")}
              onChange={(e) => setForm((f) => ({ ...f, bot_username: e.target.value.replace(/^@/, "") }))}
              placeholder="YourBotUsername"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#229ED9]/60"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            ใส่ username บอท (ไม่ต้องมี @) — ใช้สร้างปุ่ม "รับสินค้าทาง Telegram" ให้ลูกค้ากดหลังสั่งซื้อ
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">โลโก้ร้าน</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-muted-foreground text-xs text-center px-1">ไม่มี<br/>โลโก้</span>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <label className={`cursor-pointer inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted text-sm font-medium text-foreground hover:border-primary transition-colors ${logoUploading ? "opacity-50 pointer-events-none" : ""}`}>
                {logoUploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปโลโก้"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleLogoUpload(e, token)} />
              </label>
              {form.logo_url && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, logo_url: "" }))}
                  className="text-xs text-destructive hover:underline text-left"
                >
                  ลบโลโก้
                </button>
              )}
              <p className="text-xs text-muted-foreground">อัตราส่วน 1:1 — รองรับ JPG, PNG, WebP หรือวางลิงก์ URL ด้านล่าง</p>
            </div>
          </div>
          {/* Logo URL input */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">หรือวางลิงก์ URL รูปโลโก้</label>
            <input
              type="url"
              placeholder="https://example.com/logo.png"
              value={form.logo_url}
              onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ชื่อร้าน</label>
          <input
            type="text"
            value={form.store_name}
            onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
            placeholder="DigitalStore"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">หัวข้อหลัก (Hero Title)</label>
          <input
            type="text"
            value={form.hero_title}
            onChange={(e) => setForm((f) => ({ ...f, hero_title: e.target.value }))}
            placeholder="สินค้าดิจิทัลพรีเมียม"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">คำอธิบายใต้หัวข้อ (Hero Subtitle)</label>
          <input
            type="text"
            value={form.hero_subtitle}
            onChange={(e) => setForm((f) => ({ ...f, hero_subtitle: e.target.value }))}
            placeholder="รับสิทธิ์ทันทีผ่าน Telegram..."
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ชื่อหมวดสินค้า (Section Title)</label>
          <input
            type="text"
            value={form.gafiw_section_title}
            onChange={(e) => setForm((f) => ({ ...f, gafiw_section_title: e.target.value }))}
            placeholder="เช่น สินค้าแนะนำ, สินค้าพรีเมียม"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-0.5">ข้อความหัวข้อที่แสดงเหนือรายการสินค้าบนหน้าร้าน</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ยอดขายเริ่มต้น (สถิติหน้าร้าน)</label>
          <input
            type="number"
            value={form.fake_sold_base}
            onChange={(e) => setForm((f) => ({ ...f, fake_sold_base: e.target.value }))}
            placeholder="12847"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-0.5">ตัวเลขฐาน + ออเดอร์จริง = จำนวนออเดอร์สำเร็จที่แสดงหน้าร้าน</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">จำนวนสมาชิก (สถิติหน้าร้าน)</label>
          <input
            type="number"
            value={form.fake_member_count}
            onChange={(e) => setForm((f) => ({ ...f, fake_member_count: e.target.value }))}
            placeholder="18947"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-0.5">จำนวนสมาชิกที่แสดงบนหน้าร้าน (ปรับได้อิสระ)</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card border border-primary/20 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground text-sm">💳 ข้อมูลการชำระเงิน</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">แสดงให้ลูกค้าเห็นตอนกดชำระเงิน (ชื่อธนาคาร เลขบัญชี และ QR Code)</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ชื่อธนาคาร / ชื่อบัญชี</label>
          <input
            type="text"
            value={form.bank_name}
            onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
            placeholder="เช่น กสิกรไทย — นายสมชาย ใจดี"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">เลขบัญชี</label>
          <input
            type="text"
            value={form.bank_account}
            onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))}
            placeholder="เช่น 123-4-56789-0"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL รูป QR Code (ถ้ามี)</label>
          <input
            type="text"
            value={form.bank_qr_url}
            onChange={(e) => setForm((f) => ({ ...f, bank_qr_url: e.target.value }))}
            placeholder="https://..."
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {form.bank_qr_url && (
            <img src={form.bank_qr_url} alt="QR Preview" className="mt-2 w-24 h-24 rounded-lg border border-border object-contain bg-white" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">🧧 เบอร์ TrueMoney Wallet (รับเงินซองอั่งเปา)</label>
          <input
            type="tel"
            value={form.truemoney_phone}
            onChange={(e) => setForm((f) => ({ ...f, truemoney_phone: e.target.value }))}
            placeholder="เช่น 0812345678"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            เบอร์นี้จะใช้รับเงินเมื่อลูกค้าส่งซองอั่งเปา — ลูกค้าไม่ต้องกรอกเบอร์เอง
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ธนาคารผู้รับ (สำหรับตรวจสลีป Slip2Go)</label>
          <p className="text-[11px] text-muted-foreground">ระบุเพื่อให้ Slip2Go ตรวจว่าลูกค้าโอนมาถูกบัญชีหรือเปล่า — ถ้าไม่ระบุ จะข้ามการตรวจบัญชี</p>
          <select
            value={form.receiver_bank_code}
            onChange={(e) => setForm((f) => ({ ...f, receiver_bank_code: e.target.value }))}
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary"
          >
            <option value="">— ไม่ตรวจบัญชีผู้รับ —</option>
            <option value="promptpay">🏧 พร้อมเพย์ (PromptPay)</option>
            <option value="01002">ธนาคารกรุงเทพ (BBL)</option>
            <option value="01004">ธนาคารกสิกรไทย (KBANK)</option>
            <option value="01006">ธนาคารกรุงไทย (KTB)</option>
            <option value="01011">ธนาคารทหารไทยธนชาต (TTB)</option>
            <option value="01014">ธนาคารไทยพาณิชย์ (SCB)</option>
            <option value="01017">ซิตี้แบงก์ (CITI)</option>
            <option value="01022">ธนาคารซีไอเอ็มบีไทย (CIMB)</option>
            <option value="01024">ธนาคารยูโอบี (UOB)</option>
            <option value="01025">ธนาคารกรุงศรีอยุธยา (BAY)</option>
            <option value="01030">ธนาคารออมสิน (GSB)</option>
            <option value="01033">ธนาคารอาคารสงเคราะห์ (GHB)</option>
            <option value="01034">ธ.ก.ส. (BAAC)</option>
          </select>
          {form.receiver_bank_code && (
            <p className="text-[11px] text-primary/80 bg-primary/5 border border-primary/20 rounded-lg px-2 py-1.5">
              ✅ จะตรวจว่าผู้รับในสลีปตรงกับเลขบัญชี <strong>{form.bank_account || "(กรอกเลขบัญชีด้านบน)"}</strong>
            </p>
          )}
        </div>
      </div>

      {/* Topup method toggles */}
      <div className="flex flex-col gap-4 bg-card border border-orange-500/20 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <span className="text-base">💳</span>
          <h3 className="font-semibold text-foreground text-sm">เปิด/ปิดช่องทางเติมเงิน</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">ปิดชั่วคราวได้ทันที ลูกค้าจะเห็นว่าช่องทางนั้นไม่พร้อมให้บริการ</p>
        <div className="flex flex-col gap-3">
          {([
            { key: "topup_slip_enabled" as const, label: "🏦 สลีปโอนเงิน (ธนาคาร)", desc: "ลูกค้าแนบสลีปแล้วรอแอดมินอนุมัติ" },
            { key: "topup_truemoney_enabled" as const, label: "🧧 ซองอั่งเปา (TrueMoney)", desc: "ลูกค้าวางลิงก์ซอง แลกเครดิตอัตโนมัติ" },
          ] as const).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-3 bg-muted/50 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <button
                onClick={() => setForm((f) => ({ ...f, [key]: f[key] === "on" ? "off" : "on" }))}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form[key] === "on" ? "bg-green-500" : "bg-muted-foreground/30"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form[key] === "on" ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card border border-green-500/20 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-green-400" />
          <h3 className="font-semibold text-foreground text-sm">ตั้งค่าระบบการเงิน</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">ชื่อแอดมินสำหรับแบ่งรายได้อัตโนมัติเมื่ออนุมัติออเดอร์</p>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">ชื่อแอดมิน (คั่นด้วยคอมมา)</label>
          <input
            type="text"
            value={form.finance_admin_names}
            onChange={(e) => setForm((f) => ({ ...f, finance_admin_names: e.target.value }))}
            placeholder="เช่น เชน,ปักเป้า"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-green-500/50"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            ระบบจะแบ่งรายได้เท่ากันให้ทุกคนในรายการนี้ เมื่ออนุมัติออเดอร์ — ปล่อยว่างเพื่อไม่แบ่ง
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card border border-primary/20 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <UserCheck size={15} className="text-primary" />
          <h3 className="font-semibold text-foreground text-sm">ระบบตรวจสลีปอัตโนมัติ (Slip2Go)</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          ตรวจสอบสลีปธนาคารด้วย Slip2Go API — แอดมินทุกคนจะเห็นผลตรวจสอบเหมือนกัน ต้องตั้งค่า <code className="bg-muted px-1 rounded">SLIP2GO_API_KEY</code> ใน Secrets ก่อน
        </p>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">โหมดตรวจสลีป</label>
          <div className="flex gap-2">
            {[
              { value: "auto",   label: "🤖 อัตโนมัติ",  desc: "ตรวจทันทีเมื่อลูกค้าส่งสลีป" },
              { value: "manual", label: "👆 แมนวล",       desc: "แอดมินกด 'ตรวจสลีป' เอง" },
              { value: "off",    label: "⛔ ปิด",          desc: "ไม่ใช้ API (ตรวจสลีปเอง)" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm((f) => ({ ...f, slip_verify_mode: opt.value }))}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors flex-1 ${
                  form.slip_verify_mode === opt.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <span className="text-xs font-semibold">{opt.label}</span>
                <span className="text-[10px] mt-0.5 opacity-70">{opt.desc}</span>
              </button>
            ))}
          </div>
          {form.slip_verify_mode !== "off" && (
            <p className="text-xs text-primary/80 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              ✅ โหมด <strong>{form.slip_verify_mode === "auto" ? "อัตโนมัติ" : "แมนวล"}</strong> — ปุ่ม "ตรวจสลีป" จะปรากฏในหน้าออเดอร์ แอดมินทุกคนจะเห็นผลเหมือนกัน
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-card border border-yellow-500/30 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Megaphone size={15} className="text-yellow-400" />
          <h3 className="font-semibold text-foreground text-sm">ข้อความประกาศ</h3>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          แสดงแถบประกาศสีเหลืองด้านบนหน้าร้าน ปล่อยว่างเพื่อซ่อน
        </p>
        <textarea
          rows={5}
          value={form.announcement}
          onChange={(e) => setForm((f) => ({ ...f, announcement: e.target.value }))}
          placeholder={`⚠️ ประกาศสำคัญ\n\nห้ามปลอมแปลงสลีปโอนเงิน ขีดค่า ขีดชื่อ หรือแก้ไขคิวอาร์โค้ดใดๆ ทั้งสิ้น\nแอดมินไม่สามารถตรวจสอบสลีปที่ถูกแก้ไขได้ และจะถูกดำเนินคดีตามกฎหมาย`}
          className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-500/50 resize-none"
        />
      </div>

      <Button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold self-start px-8"
      >
        {mutation.isPending ? "กำลังบันทึก..." : saved ? "✓ บันทึกแล้ว!" : "บันทึกการตั้งค่า"}
      </Button>
    </div>
  );
}

function LoginView({ onLogin }: { onLogin: (token: string) => void }) {
  const [step, setStep] = useState<"passcode" | "otp">("passcode");
  const [passcode, setPasscode] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async () => {
    if (!passcode) { setError("กรุณากรอกรหัสผ่าน"); return; }
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/request-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setLoading(false);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      setError(errData.detail || "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
      return;
    }
    setStep("otp");
  };

  const verifyOtp = async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/admin/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp_code: otp }),
    });
    setLoading(false);
    if (!res.ok) { setError("OTP ไม่ถูกต้องหรือหมดอายุ"); return; }
    const data = await res.json();
    localStorage.setItem("admin_token", data.access_token);
    onLogin(data.access_token);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl p-8"
      >
        <div className="flex items-center gap-2 mb-8">
          <Shield size={20} className="text-primary" />
          <span className="font-bold text-foreground">เข้าสู่ระบบแอดมิน</span>
        </div>

        {step === "passcode" ? (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                รหัสผ่านแอดมิน
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestOtp()}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1.5">ระบบจะส่ง OTP ไปที่กลุ่ม Telegram แอดมิน</p>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <Button
              onClick={requestOtp}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1"
            >
              {loading ? "กำลังส่ง OTP..." : <>ส่ง OTP <ChevronRight size={14} /></>}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                รหัส OTP
              </label>
              <input
                type="text"
                placeholder="123456"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                maxLength={8}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-lg text-center font-mono tracking-widest text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground mt-1.5 text-center">
                ตรวจสอบ OTP ในกลุ่มแอดมิน
              </p>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <Button
              onClick={verifyOtp}
              disabled={loading}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
            >
              {loading ? "กำลังตรวจสอบ..." : "ยืนยัน & เข้าสู่ระบบ"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStep("passcode"); setError(""); }} className="text-muted-foreground">
              ย้อนกลับ
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

interface FinanceEntry {
  id: number;
  amount: string;
  description: string;
  admin_name: string;
  entry_type: string;
  order_id: number | null;
  created_at: string;
}

interface FinanceSummary {
  total_balance: number;
  admin_balances: Record<string, number>;
  daily_chart: { date: string; amount: number }[];
  monthly_goal: number;
}

interface AdminLog {
  id: number;
  admin_name: string;
  action: string;
  details: string | null;
  created_at: string;
}

function AddEntryModal({
  token,
  onClose,
  defaultType = "income",
  defaultAdminName = "",
}: {
  token: string;
  onClose: () => void;
  defaultType?: "income" | "withdrawal";
  defaultAdminName?: string;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amount: "",
    description: "",
    entry_type: defaultType,
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.amount || !form.description)
        throw new Error("กรุณากรอกข้อมูลให้ครบ");
      const amount =
        form.entry_type === "withdrawal"
          ? -Math.abs(parseFloat(form.amount))
          : Math.abs(parseFloat(form.amount));
      const res = await fetch("/api/admin/finance/entries", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ ...form, amount, admin_name: "ระบบ" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "บันทึกไม่สำเร็จ");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["finance-entries"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {form.entry_type === "withdrawal" ? "💸 บันทึกการถอนเงิน" : "💰 บันทึกรายได้"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${form.entry_type === "income" ? "bg-green-600 text-white" : "bg-muted text-muted-foreground"}`}
              onClick={() => setForm((f) => ({ ...f, entry_type: "income" }))}
            >
              + รายได้
            </button>
            <button
              className={`flex-1 py-2 text-sm font-medium transition-colors ${form.entry_type === "withdrawal" ? "bg-red-600 text-white" : "bg-muted text-muted-foreground"}`}
              onClick={() => setForm((f) => ({ ...f, entry_type: "withdrawal" }))}
            >
              − ถอนเงิน
            </button>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">จำนวนเงิน (฿)</label>
            <input
              type="number"
              min="0"
              placeholder="เช่น 219"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">รายละเอียด</label>
            <input
              type="text"
              placeholder="เช่น กลุ่มเด็กรับของทรู"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">ยกเลิก</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {mutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FinanceTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addType, setAddType] = useState<"income" | "withdrawal">("income");
  const [deleteEntryId, setDeleteEntryId] = useState<number | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<FinanceSummary>({
    queryKey: ["finance-summary"],
    queryFn: () => fetch("/api/admin/finance/summary", { headers: authHeaders(token) }).then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: entries = [], isLoading: entriesLoading, refetch: refetchEntries } = useQuery<FinanceEntry[]>({
    queryKey: ["finance-entries"],
    queryFn: () => fetch("/api/admin/finance/entries", { headers: authHeaders(token) }).then((r) => r.json()),
    refetchInterval: 60000,
  });

  const { data: logs = [], refetch: refetchLogs } = useQuery<AdminLog[]>({
    queryKey: ["admin-logs"],
    queryFn: () => fetch("/api/admin/logs", { headers: authHeaders(token) }).then((r) => r.json()),
    refetchInterval: 60000,
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/admin/finance/entries/${id}`, { method: "DELETE", headers: authHeaders(token) }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      qc.invalidateQueries({ queryKey: ["finance-entries"] });
      setDeleteEntryId(null);
    },
  });

  const goalMutation = useMutation({
    mutationFn: () =>
      fetch("/api/admin/finance/goal", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ goal: parseFloat(goalInput) || 0 }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
      setGoalSaved(true);
      setTimeout(() => setGoalSaved(false), 2000);
    },
  });

  const totalBalance = summary?.total_balance ?? 0;
  const monthlyGoal = summary?.monthly_goal ?? 0;
  const goalPct = monthlyGoal > 0 ? Math.min(100, (totalBalance / monthlyGoal) * 100) : 0;
  const adminBalances = summary?.admin_balances ?? {};
  const dailyChart = summary?.daily_chart ?? [];

  // Animated counters
  const animBalance = useCountUp(totalBalance);
  const animGoalPct = useCountUp(goalPct);

  const fmtMoney = (n: number) =>
    `฿${Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmtAnimMoney = (n: number) =>
    `฿${Math.round(Math.abs(n)).toLocaleString("th-TH")}`;

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const handleRefresh = () => {
    refetchSummary();
    refetchEntries();
    refetchLogs();
  };

  const ACTION_LABELS: Record<string, string> = {
    delete_order: "🗑 ลบออเดอร์",
    approve_order: "✅ อนุมัติออเดอร์",
    reject_order: "❌ ปฏิเสธออเดอร์",
    add_income: "💰 เพิ่มรายได้",
    withdrawal: "💸 ถอนเงิน",
  };

  if (summaryLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 bg-card border border-border rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {deleteEntryId !== null && (
        <ConfirmDialog
          title="ลบรายการนี้?"
          description="รายการนี้จะถูกลบถาวร ยอดเงินจะถูกปรับตามไปด้วย"
          confirmLabel={deleteEntryMutation.isPending ? "กำลังลบ..." : "ลบรายการ"}
          onConfirm={() => deleteEntryMutation.mutate(deleteEntryId)}
          onCancel={() => setDeleteEntryId(null)}
        />
      )}

      {showAdd && (
        <AddEntryModal
          token={token}
          onClose={() => setShowAdd(false)}
          defaultType={addType}
        />
      )}

      <div className="flex justify-end">
        <button onClick={handleRefresh} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/50">
          <RefreshCw size={12} /> รีเฟรช
        </button>
      </div>

      {/* Balance Card — credit card style */}
      <div
        className="rounded-2xl p-5 text-white relative overflow-hidden shadow-xl"
        style={{ background: "linear-gradient(135deg, #1a2a6e 0%, #1e3a8a 40%, #2563eb 100%)" }}
      >
        {/* Diagonal shine */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.18) 52%, rgba(255,255,255,0.08) 59%, transparent 74%)" }}
        />
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }} />
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }} />
        {/* Chip */}
        <div className="absolute top-4 right-5 w-9 h-7 rounded-md border border-yellow-300/40 flex flex-col justify-center items-center gap-0.5"
          style={{ background: "linear-gradient(135deg, rgba(250,204,21,0.35), rgba(250,204,21,0.15))" }}>
          <div className="w-6 h-0.5 rounded bg-yellow-300/50" />
          <div className="w-6 h-0.5 rounded bg-yellow-300/50" />
        </div>

        <p className="text-[10px] text-blue-200/70 uppercase tracking-[0.15em] mb-0.5 relative">ยอดเงินรวม · Balance</p>
        <p className="text-4xl font-bold mb-4 relative tabular-nums">
          {totalBalance < 0 ? "-" : ""}{fmtAnimMoney(animBalance)}
        </p>

        {monthlyGoal > 0 && (
          <div className="relative">
            <div className="w-full rounded-full h-1.5 mb-1.5" style={{ background: "rgba(255,255,255,0.15)" }}>
              <div
                className="h-1.5 rounded-full transition-none"
                style={{
                  width: `${animGoalPct}%`,
                  background: "linear-gradient(90deg, #60a5fa, #a78bfa)",
                  boxShadow: "0 0 8px rgba(96,165,250,0.6)",
                }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-blue-200/70">
              <span>ความคืบหน้า {animGoalPct.toFixed(1)}%</span>
              <span>เป้าหมาย {fmtMoney(monthlyGoal)}</span>
            </div>
          </div>
        )}
      </div>


      {/* Gafiw Wallet Balance */}
      <GafiwBalanceCard token={token} />

      {/* Daily Chart */}
      {dailyChart.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-foreground mb-4">สถิติ 7 วันย้อนหลัง</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={dailyChart} barSize={22} barCategoryGap="35%">
              <defs>
                <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={1} />
                  <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f87171" stopOpacity={1} />
                  <stop offset="100%" stopColor="#b91c1c" stopOpacity={0.9} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #1e3a5f",
                  borderRadius: 10,
                  fontSize: 12,
                  padding: "6px 10px",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                }}
                labelStyle={{ color: "#94a3b8", marginBottom: 2 }}
                itemStyle={{ color: "#e2e8f0" }}
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                formatter={(v: number) => [`฿${Math.abs(v).toLocaleString("th-TH")}`, "ยอด"]}
              />
              <Bar dataKey="amount" radius={[6, 6, 2, 2]}>
                {dailyChart.map((entry, idx) => (
                  <Cell key={idx} fill={entry.amount >= 0 ? "url(#incGrad)" : "url(#expGrad)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => { setAddType("income"); setShowAdd(true); }}
          className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold gap-2 shadow-lg shadow-green-900/30"
        >
          <TrendingUp size={15} /> เพิ่มรายได้
        </Button>
        <Button
          onClick={() => { setAddType("withdrawal"); setShowAdd(true); }}
          className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold gap-2 shadow-lg shadow-red-900/30"
        >
          <TrendingDown size={15} /> ถอนเงิน
        </Button>
      </div>

      {/* Monthly Goal Setting */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm font-semibold text-foreground mb-3">เป้าหมายรายเดือน</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder={monthlyGoal > 0 ? String(monthlyGoal) : "เช่น 2500"}
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <Button
            onClick={() => goalMutation.mutate()}
            disabled={goalMutation.isPending || !goalInput}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold px-4"
          >
            {goalSaved ? "✓ บันทึกแล้ว" : "บันทึก"}
          </Button>
        </div>
        {monthlyGoal > 0 && (
          <p className="text-xs text-muted-foreground mt-1.5">เป้าหมายปัจจุบัน: {fmtMoney(monthlyGoal)}</p>
        )}
      </div>

      {/* Transaction List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">รายการธุรกรรม</p>
          <span className="text-xs text-muted-foreground">{entries.length} รายการ</span>
        </div>
        {entriesLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Wallet size={28} className="mx-auto mb-2 opacity-30" />
            ยังไม่มีรายการ กดเพิ่มรายได้เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => {
              const amt = parseFloat(entry.amount);
              const isPos = amt >= 0;
              return (
                <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPos ? "bg-green-500/15" : "bg-red-500/15"}`}>
                    {isPos ? <TrendingUp size={14} className="text-green-400" /> : <TrendingDown size={14} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{entry.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(entry.created_at)} · <span className="text-primary/70">{entry.admin_name}</span>
                      {entry.order_id && <span className="ml-1 opacity-50">· ออเดอร์ #{entry.order_id}</span>}
                    </p>
                  </div>
                  <span className={`font-bold text-sm shrink-0 tabular-nums ${isPos ? "text-green-400" : "text-red-400"}`}>
                    {isPos ? "+" : ""}{fmtMoney(amt)}
                  </span>
                  <button
                    onClick={() => setDeleteEntryId(entry.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors shrink-0 ml-1"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Activity size={13} className="text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground flex-1">ประวัติกิจกรรม</p>
          <span className="text-xs text-muted-foreground">{logs.length} รายการ</span>
        </div>
        {logs.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-xs">
            ยังไม่มีกิจกรรม กิจกรรมจะถูกบันทึกเมื่อมีการลบออเดอร์
          </div>
        ) : (
          <div className="divide-y divide-border max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/10 transition-colors">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={11} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground">{ACTION_LABELS[log.action] ?? log.action}{log.details ? ` — ${log.details}` : ""}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDate(log.created_at)} · <span className="text-primary/70">{log.admin_name}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Banners Tab ───────────────────────────────────────────────────────────────
interface Banner {
  id: number;
  title?: string;
  subtitle?: string;
  image_url?: string;
  link_url?: string;
  is_active: boolean;
  sort_order: number;
}

const BANNER_EMPTY = { title: "", subtitle: "", image_url: "", link_url: "", is_active: true, sort_order: 0 };

function BannersTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<typeof BANNER_EMPTY>(BANNER_EMPTY);
  const [editId, setEditId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: banners = [], isLoading } = useQuery<Banner[]>({
    queryKey: ["admin-banners"],
    queryFn: () => fetch("/api/admin/banners", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
  });

  const resetForm = () => { setForm(BANNER_EMPTY); setEditId(null); };

  const startEdit = (b: Banner) => {
    setEditId(b.id);
    setForm({ title: b.title || "", subtitle: b.subtitle || "", image_url: b.image_url || "", link_url: b.link_url || "", is_active: b.is_active, sort_order: b.sort_order });
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/banners/upload-image", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) throw new Error("upload failed");
      const data = await res.json();
      setForm(f => ({ ...f, image_url: data.url }));
    } catch { alert("อัปโหลดรูปไม่สำเร็จ"); } finally { setUploading(false); }
  };

  const saveBanner = async () => {
    setSaving(true);
    try {
      const url = editId ? `/api/admin/banners/${editId}` : "/api/admin/banners";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, sort_order: Number(form.sort_order) }),
      });
      if (!res.ok) throw new Error("save failed");
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      qc.invalidateQueries({ queryKey: ["banners-public"] });
      resetForm();
    } catch { alert("บันทึกไม่สำเร็จ"); } finally { setSaving(false); }
  };

  const deleteBanner = async (id: number) => {
    if (!confirm("ลบแบนเนอร์นี้?")) return;
    await fetch(`/api/admin/banners/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    qc.invalidateQueries({ queryKey: ["admin-banners"] });
    qc.invalidateQueries({ queryKey: ["banners-public"] });
  };

  const toggleActive = async (b: Banner) => {
    await fetch(`/api/admin/banners/${b.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !b.is_active }),
    });
    qc.invalidateQueries({ queryKey: ["admin-banners"] });
    qc.invalidateQueries({ queryKey: ["banners-public"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <ImageIcon size={15} className="text-primary" /> จัดการ Hero Banner
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">แบนเนอร์แสดงที่ด้านบนหน้าร้าน — เรียงตาม sort_order จากน้อยไปมาก</p>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{editId ? "แก้ไขแบนเนอร์" : "เพิ่มแบนเนอร์ใหม่"}</h3>

        {/* Image preview + upload */}
        <div className="flex items-start gap-3">
          <div className="relative w-32 h-20 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center shrink-0">
            {form.image_url ? (
              <img src={form.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={20} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
              {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูป"}
            </Button>
            <input
              type="text"
              value={form.image_url}
              onChange={(e) => setForm(f => ({ ...f, image_url: e.target.value }))}
              placeholder="หรือวาง URL รูปภาพ"
              className="bg-muted/60 border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-primary w-52"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">หัวข้อ (title)</label>
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="เช่น โปรโมชั่นพิเศษ" className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">คำอธิบาย (subtitle)</label>
            <input value={form.subtitle} onChange={(e) => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="เช่น ลดสูงสุด 50%" className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ลิงก์เมื่อคลิก (link_url)</label>
            <input value={form.link_url} onChange={(e) => setForm(f => ({ ...f, link_url: e.target.value }))} placeholder="https://..." className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ลำดับ (sort_order, น้อยขึ้นก่อน)</label>
            <input type="number" value={form.sort_order} onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} className="w-full bg-muted/60 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-border" />
            แสดงแบนเนอร์นี้
          </label>
          <div className="flex-1" />
          {editId && (
            <Button size="sm" variant="ghost" onClick={resetForm} className="text-xs gap-1 text-muted-foreground">
              <X size={11} /> ยกเลิก
            </Button>
          )}
          <Button size="sm" onClick={saveBanner} disabled={saving} className="text-xs gap-1.5">
            {saving ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
            {editId ? "บันทึกการแก้ไข" : "เพิ่มแบนเนอร์"}
          </Button>
        </div>
      </div>

      {/* Banner list */}
      {isLoading ? (
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : banners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีแบนเนอร์ — เพิ่มได้จากฟอร์มด้านบน</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {banners.map((b) => (
            <div key={b.id} className={`flex items-center gap-3 p-3 transition-colors hover:bg-muted/10 ${!b.is_active ? "opacity-50" : ""}`}>
              {b.image_url ? (
                <img src={b.image_url} alt="" className="w-16 h-10 rounded-lg object-cover border border-border shrink-0" />
              ) : (
                <div className="w-16 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <ImageIcon size={14} className="text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{b.title || <span className="text-muted-foreground italic">ไม่มีหัวข้อ</span>}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">#{b.sort_order}</span>
                  {b.link_url && <span className="text-xs text-primary/70 truncate max-w-32"><Link size={9} className="inline mr-0.5" />{b.link_url}</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${b.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {b.is_active ? "แสดงอยู่" : "ซ่อนอยู่"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleActive(b)}
                  className={`p-1.5 rounded-lg text-xs border transition-all ${b.is_active ? "bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/25" : "bg-muted text-muted-foreground border-border hover:text-foreground"}`}
                  title={b.is_active ? "ซ่อน" : "แสดง"}
                >
                  {b.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                </button>
                <button onClick={() => startEdit(b)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-all" title="แก้ไข">
                  <Pencil size={12} />
                </button>
                <button onClick={() => deleteBanner(b.id)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 transition-all" title="ลบ">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Gafiw Products Tab ────────────────────────────────────────────────────────
function GafiwProductRow({
  p, enabled, token, globalPct, onToggle, togglePending, onMarkupSaved,
}: {
  p: any; enabled: boolean; token: string; globalPct: number;
  onToggle: () => void; togglePending: boolean; onMarkupSaved: () => void;
}) {
  const apiPrice = typeof p.api_price === "number" ? p.api_price : parseFloat(String(p.api_price || p.price || "0").replace(/,/g, "")) || 0;
  const stock = parseInt(String(p.stock || "0").replace(/,/g, "")) || 0;

  // markup_percent_custom: null = ใช้ global, >= 0 = override รายตัว
  const hasCustom = p.markup_percent_custom != null && p.markup_percent_custom >= 0;
  const [useCustom, setUseCustom] = useState<boolean>(hasCustom);
  const [pctStr, setPctStr] = useState<string>(hasCustom ? String(p.markup_percent_custom) : String(globalPct));
  const [fakePriceStr, setFakePriceStr] = useState<string>(p.fake_price != null ? String(p.fake_price) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSavedState] = useState(false);

  const effectivePct = useCustom ? (parseFloat(pctStr) || 0) : globalPct;
  const sellPrice = Math.round(apiPrice * (1 + effectivePct / 100));
  const profit = sellPrice - apiPrice;

  const saveMarkup = async () => {
    setSaving(true);
    try {
      const markupPct = useCustom ? (parseFloat(pctStr) || 0) : -1;
      const fakePriceVal = fakePriceStr.trim() ? parseFloat(fakePriceStr) || 0 : 0;
      const res = await fetch("/api/admin/gafiw/markup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type_id: p.type_id, markup_percent: markupPct, fake_price: fakePriceVal || null }),
      });
      if (!res.ok) throw new Error("save failed");
      setSavedState(true);
      setTimeout(() => setSavedState(false), 2000);
      onMarkupSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 px-4 py-3 transition-colors ${!enabled ? "opacity-50 bg-muted/30" : "hover:bg-muted/10"}`}>
      <div className="flex items-center gap-3">
        {p.imageapi ? (
          <img src={p.imageapi} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Package size={14} className="text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">ต้นทุน: <span className="text-yellow-400 font-semibold">฿{apiPrice.toLocaleString("th-TH")}</span></span>
            <span className="text-xs text-primary font-semibold">ขาย: ฿{sellPrice.toLocaleString("th-TH")}</span>
            <span className="text-xs text-green-400/70">กำไร: +฿{profit.toLocaleString("th-TH")}</span>
            <span className={`text-xs ${stock <= 0 ? "text-red-400" : "text-muted-foreground"}`}>สต็อก: {stock <= 0 ? "หมด" : stock}</span>
          </div>
        </div>
        <button
          onClick={onToggle}
          disabled={togglePending}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            enabled
              ? "bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25"
              : "bg-muted text-muted-foreground border border-border hover:text-foreground"
          }`}
        >
          {enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
          {enabled ? "เปิด" : "ปิด"}
        </button>
      </div>

      {/* Markup % editor */}
      <div className="flex items-center gap-2 pl-13 flex-wrap">
        {/* toggle: ใช้ global vs custom */}
        <button
          onClick={() => setUseCustom(v => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all ${
            useCustom
              ? "bg-orange-500/15 text-orange-400 border-orange-500/30"
              : "bg-muted text-muted-foreground border-border"
          }`}
        >
          {useCustom ? "กำหนดเอง" : `Global ${globalPct}%`}
        </button>

        {useCustom && (
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg px-2 py-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">markup</span>
            <input
              type="number"
              value={pctStr}
              onChange={(e) => setPctStr(e.target.value)}
              placeholder="0"
              min="0"
              step="0.5"
              className="bg-transparent text-sm text-foreground font-mono text-right focus:outline-none w-16"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        )}

        {/* Fake price (ราคาหลอกตา) */}
        <div className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg px-2 py-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">ราคาเดิม</span>
          <input
            type="number"
            value={fakePriceStr}
            onChange={(e) => setFakePriceStr(e.target.value)}
            placeholder="ไม่ระบุ"
            min="0"
            step="1"
            className="bg-transparent text-sm text-foreground font-mono text-right focus:outline-none w-20"
          />
          <span className="text-xs text-muted-foreground">฿</span>
        </div>

        <button
          onClick={saveMarkup}
          disabled={saving}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            saved
              ? "bg-green-500/15 text-green-400 border-green-500/30"
              : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
          }`}
        >
          {saving ? <Loader size={11} className="animate-spin" /> : saved ? <CheckCircle size={11} /> : null}
          {saved ? "บันทึกแล้ว" : "บันทึก"}
        </button>

        <span className="text-xs text-muted-foreground">
          ฿{apiPrice} × {(1 + effectivePct / 100).toFixed(effectivePct % 1 === 0 ? 2 : 3)} = <span className="text-primary font-semibold">฿{sellPrice.toLocaleString("th-TH")}</span>
        </span>
      </div>
    </div>
  );
}

function GlobalMarkupCard({ token, onSaved }: { token: string; onSaved: (pct: number) => void }) {
  const { data } = useQuery<{ ok: boolean; markup_percent: number }>({
    queryKey: ["gafiw-global-markup"],
    queryFn: () => fetch("/api/admin/gafiw/global-markup", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
  });

  const [pct, setPct] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSavedState] = useState(false);

  useEffect(() => {
    if (data?.markup_percent != null) setPct(String(data.markup_percent));
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/gafiw/global-markup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markup_percent: parseFloat(pct) || 0 }),
      });
      if (!res.ok) throw new Error("failed");
      setSavedState(true);
      onSaved(parseFloat(pct) || 0);
      setTimeout(() => setSavedState(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp size={14} className="text-primary" /> Global Markup %
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            ใช้กับทุกสินค้าที่ไม่ได้กำหนด % รายตัว — เปลี่ยนที่นี่จะอัปเดตราคาทันที
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-muted/60 border border-border rounded-lg px-3 py-2">
            <input
              type="number"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="0"
              min="0"
              step="0.5"
              className="bg-transparent text-base font-mono font-semibold text-foreground focus:outline-none w-16 text-right"
            />
            <span className="text-sm text-muted-foreground font-semibold">%</span>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              saved
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
            }`}
          >
            {saving ? <Loader size={13} className="animate-spin" /> : saved ? <CheckCircle size={13} /> : null}
            {saved ? "บันทึกแล้ว" : "บันทึก"}
          </button>
        </div>
      </div>
      {pct && parseFloat(pct) > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>ตัวอย่าง:</span>
          <span className="text-yellow-400">฿100</span>
          <span>→</span>
          <span className="text-primary font-semibold">฿{Math.round(100 * (1 + (parseFloat(pct) || 0) / 100))}</span>
          <span className="text-green-400/70">(+฿{Math.round(100 * (parseFloat(pct) || 0) / 100)} กำไร)</span>
        </div>
      )}
    </div>
  );
}

function GafiwProductsTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [globalPct, setGlobalPct] = useState<number>(0);

  const { data: gafiwData, isLoading, error, refetch } = useQuery<{ ok: boolean; data: any[] }>({
    queryKey: ["gafiw-products-admin"],
    queryFn: () => fetch("/api/gafiw/products").then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: toggles = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["gafiw-toggles"],
    queryFn: () => fetch("/api/admin/gafiw/toggles", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
  });

  useEffect(() => {
    if (gafiwData?.data?.length) {
      const first = gafiwData.data[0];
      if (first?.global_markup_percent != null) setGlobalPct(first.global_markup_percent);
    }
  }, [gafiwData]);

  const toggleMutation = useMutation({
    mutationFn: ({ type_id, is_enabled }: { type_id: string; is_enabled: boolean }) =>
      fetch("/api/admin/gafiw/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type_id, is_enabled }),
      }).then(r => r.json()),
    // Optimistic update: อัปเดต UI ทันทีก่อน server ตอบ
    onMutate: async ({ type_id, is_enabled }) => {
      await qc.cancelQueries({ queryKey: ["gafiw-toggles"] });
      const prev = qc.getQueryData<Record<string, boolean>>(["gafiw-toggles"]);
      qc.setQueryData<Record<string, boolean>>(["gafiw-toggles"], (old) => ({
        ...(old ?? {}),
        [type_id]: is_enabled,
      }));
      // patch gafiw-products-admin cache โดยไม่ refetch
      qc.setQueryData<{ ok: boolean; data: any[] }>(["gafiw-products-admin"], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) => p.type_id === type_id ? { ...p, is_enabled } : p),
        };
      });
      return { prev };
    },
    onError: (_err, { type_id }, ctx) => {
      // rollback ถ้า server ตอบผิดพลาด
      if (ctx?.prev) qc.setQueryData(["gafiw-toggles"], ctx.prev);
      qc.setQueryData<{ ok: boolean; data: any[] }>(["gafiw-products-admin"], (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((p) =>
            p.type_id === type_id ? { ...p, is_enabled: !p.is_enabled } : p,
          ),
        };
      });
    },
  });

  const products = gafiwData?.data ?? [];
  const byCategory = products.reduce<Record<string, any[]>>((acc, p) => {
    const cat = p.type_menu || "อื่นๆ";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Store size={15} className="text-primary" /> สินค้า API
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">ปรับ markup % ทีเดียวทุกตัว หรือกำหนดรายตัวได้</p>
        </div>
        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => refetch()}>
          <RefreshCw size={12} /> รีเฟรช
        </Button>
      </div>

      <GlobalMarkupCard
        token={token}
        onSaved={(pct) => {
          setGlobalPct(pct);
          qc.invalidateQueries({ queryKey: ["gafiw-products-admin"] });
          qc.invalidateQueries({ queryKey: ["gafiw-global-markup"] });
        }}
      />

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
          ดึงสินค้าไม่ได้ — ตรวจสอบ GAFIWSHOP_KEY_API และการเชื่อมต่อ
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Store size={28} className="mx-auto mb-2 opacity-40" /><p>ไม่พบสินค้า</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{cat} ({items.length})</h3>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {items.map((p) => (
                  <GafiwProductRow
                    key={p.type_id}
                    p={p}
                    enabled={p.type_id in toggles ? toggles[p.type_id] : p.is_enabled}
                    token={token}
                    globalPct={globalPct}
                    onToggle={() => toggleMutation.mutate({ type_id: p.type_id, is_enabled: !(p.type_id in toggles ? toggles[p.type_id] : p.is_enabled) })}
                    togglePending={toggleMutation.isPending}
                    onMarkupSaved={() => { qc.invalidateQueries({ queryKey: ["gafiw-products-admin"] }); }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("admin_token"));

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken(null);
  };

  if (!token) {
    return <LoginView onLogin={setToken} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <span className="font-bold text-foreground text-sm">Store Admin</span>
          </div>
          <Button size="sm" variant="ghost" onClick={handleLogout} className="text-muted-foreground gap-1.5 text-xs">
            <LogOut size={13} /> ออกจากระบบ
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <Tabs defaultValue="products">
          <div className="overflow-x-auto mb-6 -mx-4 px-4">
            <TabsList className="bg-muted h-auto gap-0.5 flex-nowrap w-max min-w-full">
              <TabsTrigger value="products" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Package size={13} /> สินค้า
              </TabsTrigger>
              <TabsTrigger value="topup" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <CreditCard size={13} /> เติมเครดิต
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Users size={13} /> ลูกค้า
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <ClipboardList size={13} /> ออเดอร์
              </TabsTrigger>
              <TabsTrigger value="finance" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Wallet size={13} /> การเงิน
              </TabsTrigger>
              <TabsTrigger value="announcements" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Megaphone size={13} /> ประกาศ
              </TabsTrigger>
              <TabsTrigger value="banners" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <ImageIcon size={13} /> แบนเนอร์
              </TabsTrigger>
              <TabsTrigger value="gafiw" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Store size={13} /> Gafiw
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-1.5 text-xs px-3 py-2 whitespace-nowrap">
                <Settings size={13} /> ตั้งค่าร้าน
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="products">
            <ProductsTab token={token} />
          </TabsContent>
          <TabsContent value="topup">
            <TopupTab token={token} />
          </TabsContent>
          <TabsContent value="customers">
            <CustomersTab token={token} />
          </TabsContent>
          <TabsContent value="orders">
            <OrdersTab token={token} />
          </TabsContent>
          <TabsContent value="finance">
            <FinanceTab token={token} />
          </TabsContent>
          <TabsContent value="announcements">
            <AnnouncementsTab token={token} />
          </TabsContent>
          <TabsContent value="banners">
            <BannersTab token={token} />
          </TabsContent>
          <TabsContent value="gafiw">
            <GafiwProductsTab token={token} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab token={token} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
