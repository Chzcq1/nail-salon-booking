import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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

const queryClient = new QueryClient();

// ── ร้านหมดอายุ — หน้าแจ้งลูกค้า ────────────────────────────────────────────
function ExpiredShopScreen({ shopName }: { shopName?: string }) {
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
          marginBottom: 8,
        }}
      >
        ขออภัยในความไม่สะดวก
        <br />
        กรุณาติดต่อร้านโดยตรงเพื่อนัดหมาย
      </p>
      <p style={{ fontSize: 13, color: "#d1d5db", marginTop: 24 }}>
        ระบบปิดปรับปรุงชั่วคราว
      </p>
    </div>
  );
}

// ── ตรวจสอบวันหมดอายุ — ครอบทุกหน้าของลูกค้า ────────────────────────────────
const ADMIN_PATHS = ["/admin", "/nail-admin", "/superadmin"];

function ShopGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const isAdminPath = ADMIN_PATHS.some((p) => location.startsWith(p));

  const { data, isLoading, isError } = useQuery<any>({
    queryKey: ["shop-gate-settings"],
    queryFn: () =>
      fetch("/api/nail/settings").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 60_000,
    // retry once quickly so a brief cold-start doesn't block unnecessarily
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
    return <ExpiredShopScreen shopName={data.shop_name} />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <ShopGate>
      <Switch>
        <Route path="/" component={BookingPage} />
        <Route path="/shop" component={StoreFront} />
        <Route path="/announcements" component={AnnouncementPage} />
        <Route path="/wallet" component={WalletPage} />
        <Route path="/my-bookings" component={MyBookingsPage} />
        <Route path="/admin" component={NailAdminPage} />
        <Route path="/nail-admin" component={NailAdminPage} />
        <Route path="/superadmin" component={NailSuperAdminPage} />
        <Route component={NotFound} />
      </Switch>
    </ShopGate>
  );
}

function App() {
  return (
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
  );
}

export default App;
