import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

function Router() {
  return (
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
