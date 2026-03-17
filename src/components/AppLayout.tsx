import { useState, useCallback, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { usePendingNotifications } from "@/hooks/usePendingNotifications";
import { Menu, User } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";

export function AppLayout() {
  const { profile, user, signOut, isAdmin, allowedScreens, canViewPath } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const { endSession } = useSessionTracker(user?.id || null, profile?.id || null);

  const handleIdleLogout = useCallback(async () => {
    toast.info("Sessão encerrada por inatividade (15 min).");
    await endSession("inatividade");
    await signOut();
  }, [endSession, signOut]);

  useIdleTimeout(handleIdleLogout);

  const handleSignOut = useCallback(async () => {
    await endSession("manual");
    await signOut();
  }, [endSession, signOut]);

  const userNameDisplay = profile?.nome || "Usuário";
  const userCargoDisplay = profile?.cargo
    ? profile.cargo.charAt(0).toUpperCase() + profile.cargo.slice(1)
    : "";

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
                <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
              </div>
              <span className="font-semibold text-sm">Nexus Ops</span>
            </div>
          </div>
          <span className="text-xs text-sidebar-foreground/80 max-w-[120px] truncate">{userNameDisplay}</span>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-sidebar-border [&>button]:hidden">
            <AppSidebar
              userName={userNameDisplay}
              onSignOut={handleSignOut}
              onNavigate={() => setMobileOpen(false)}
              isAdmin={isAdmin}
              allowedScreens={allowedScreens}
              canViewPath={canViewPath}
            />
          </SheetContent>
        </Sheet>

        <main className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop: vertical sidebar with collapse support
  return (
    <div className="min-h-screen bg-background flex">
      <aside
        className={`shrink-0 border-r border-sidebar-border sticky top-0 h-screen overflow-hidden transition-all duration-200 ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        <AppSidebar
          userName={userNameDisplay}
          onSignOut={handleSignOut}
          isAdmin={isAdmin}
          allowedScreens={allowedScreens}
          canViewPath={canViewPath}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(prev => !prev)}
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end h-12 px-6 bg-background border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span className="font-medium">{userNameDisplay}</span>
            {userCargoDisplay && (
              <span className="text-xs text-muted-foreground/60">· {userCargoDisplay}</span>
            )}
          </div>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
