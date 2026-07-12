import React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";

// ── Error Boundary — ป้องกันหน้าขาวเมื่อ component crash ────────────────────
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#0B0F1A", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
          <div style={{ background: "#131929", border: "1px solid #EF444440", borderRadius: 16, padding: 32, maxWidth: 440, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <p style={{ color: "#E8EAF0", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>เกิดข้อผิดพลาดในแอป</p>
            <p style={{ color: "#9AA5C0", fontSize: 13, marginBottom: 20 }}>{this.state.error.message}</p>
            <button onClick={() => window.location.reload()} style={{ background: "linear-gradient(135deg,#6C8EFF,#4F72FF)", color: "#fff", border: "none", borderRadius: 10, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
              รีเฟรชหน้า
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { ShopSlugContext } from "@/lib/shopSlugContext";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import StoreFront from "@/pages/StoreFront";
import AnnouncementPage from "@/pages/AnnouncementPage";
import WalletPage from "@/pages/WalletPage";
import BookingPage from "@/pages/BookingPage";
import MyBookingsPage from "@/pages/MyBookingsPage";
import NailAdminPage from "@/pages/NailAdminPage";
import NailSuperAdminPage from "@/pages/NailSuperAdminPage";
import RegisterPage from "@/pages/RegisterPage";
import OnboardingPage from "@/pages/OnboardingPage";
import SuperAdminTOTPSetupPage from "@/pages/SuperAdminTOTPSetupPage";

const queryClient = new QueryClient();

// ── ร้านหมดอายุ — หน้าแจ้งลูกค้า ────────────────────────────────────────────
function ExpiredShopScreen({ shopName, onRefetch }: { shopName?: string; onRefetch?: () => void }) {
  const [checking, setChecking] = React.useState(false);
  const handleCheck = async () => {
    setChecking(true);
    await onRefetch?.();
    setTimeout(() => setChecking(false), 2000);
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #fff0f5 0%, #fff 60%)",
        padding: "32px 20px",
        textAlign: "center",
        fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
      }}
    >
      <div style={{ fontSize: 56, marginBottom: 16 }}>🌸</div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#be185d",
          marginBottom: 10,
        }}
      >
        {shopName || "ร้านนี้"}ปิดให้บริการชั่วคราว
      </h1>
      <p
        style={{
          fontSize: 15,
          color: "#6b7280",
          maxWidth: 320,
          lineHeight: 1.7,
          marginBottom: 24,
        }}
      >
        ขออภัยในความไม่สะดวก
        <br />
        กรุณาติดต่อร้านโดยตรงเพื่อนัดหมาย
      </p>
      {onRefetch && (
        <button
          onClick={handleCheck}
          disabled={checking}
          style={{
            background: "#be185d",
            color: "#fff",
            border: "none",
            borderRadius: 100,
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 700,
            cursor: checking ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: checking ? 0.7 : 1,
            marginBottom: 16,
          }}
        >
          {checking ? "กำลังตรวจสอบ…" : "🔄 เช็คการเปิดร้านใหม่"}
        </button>
      )}
      <p style={{ fontSize: 13, color: "#d1d5db" }}>
        ระบบตรวจสอบอัตโนมัติทุก 30 วินาที
      </p>
    </div>
  );
}

// ── อ่าน slug ร้านจาก URL path /r/:slug/... ──────────────────────────────────
function useCurrentSlug(): string | null {
  const [location] = useLocation();
  const m = location.match(/^\/r\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── ตรวจสอบวันหมดอายุ — ครอบทุกหน้าของลูกค้า ────────────────────────────────
const ADMIN_PATHS = ["/admin", "/nail-admin", "/superadmin", "/register", "/onboarding"];

function ShopGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const slug = useCurrentSlug();
  const isAdminPath =
    ADMIN_PATHS.some((p) => location.startsWith(p)) ||
    /\/r\/[^/]+(\/nail-admin|\/admin|\/superadmin)/.test(location);

  const slugParam = slug ? `?shop_slug=${encodeURIComponent(slug)}` : "";

  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ["shop-gate-settings", slug],
    queryFn: () =>
      fetch(`/api/nail/settings${slugParam}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 60_000,
    // Auto-poll every 30s when shop is expired so page unblocks automatically after renewal
    refetchInterval: (query) => (query.state.data?.expired ? 30_000 : false),
    retry: 1,
    retryDelay: 1500,
    enabled: !isAdminPath,
  });

  // Admin paths are always exempt — render immediately
  if (isAdminPath) return <>{children}</>;

  // Block while the settings fetch is in-flight — prevents flash of content for expired shops
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fff0f5",
          fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif",
        }}
      >
        <div style={{ fontSize: 32, animation: "pulse 1.5s infinite" }}>🌸</div>
      </div>
    );
  }

  // If fetch fails after retry, fail-closed: show expired screen rather than letting
  // an expired shop appear to work due to a network hiccup
  if (isError) {
    return <ExpiredShopScreen />;
  }

  if (data?.expired) {
    return <ExpiredShopScreen shopName={data.shop_name} onRefetch={refetch} />;
  }

  return <>{children}</>;
}

function Router() {
  const slug = useCurrentSlug();
  return (
    <ShopSlugContext.Provider value={slug}>
      <ShopGate>
        <Switch>
          {/* Default routes — ร้านหลัก (slug=null → shop 1) */}
          <Route path="/" component={BookingPage} />
          <Route path="/shop" component={StoreFront} />
          <Route path="/announcements" component={AnnouncementPage} />
          <Route path="/wallet" component={WalletPage} />
          <Route path="/my-bookings" component={MyBookingsPage} />
          <Route path="/admin" component={NailAdminPage} />
          <Route path="/nail-admin" component={NailAdminPage} />
          <Route path="/superadmin" component={NailSuperAdminPage} />
          {/* Per-shop slug routes — /r/:slug/... */}
          <Route path="/r/:slug" component={BookingPage} />
          <Route path="/r/:slug/shop" component={StoreFront} />
          <Route path="/r/:slug/announcements" component={AnnouncementPage} />
          <Route path="/r/:slug/wallet" component={WalletPage} />
          <Route path="/r/:slug/my-bookings" component={MyBookingsPage} />
          <Route path="/r/:slug/admin" component={NailAdminPage} />
          <Route path="/r/:slug/nail-admin" component={NailAdminPage} />
          <Route path="/r/:slug/admin/onboarding" component={OnboardingPage} />
          <Route path="/register" component={RegisterPage} />
          <Route path="/superadmin/setup-totp" component={SuperAdminTOTPSetupPage} />
          <Route component={NotFound} />
        </Switch>
      </ShopGate>
    </ShopSlugContext.Provider>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <div className="min-h-screen bg-background text-foreground">
              <Router />
            </div>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default App;
