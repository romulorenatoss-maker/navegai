import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { Menu, User, LogOut } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";

export function AppLayout() {
  const { profile, user, signOut, isAdmin, allowedScreens } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { endSession } = useSessionTracker(user?.id || null, profile?.id || null);

  const handleIdleLogout = useCallback(async () => {
    toast.info("Sessão encerrada por inatividade (10 min).");
    await endSession("inatividade");
    await signOut();
  }, [endSession, signOut]);

  useIdleTimeout(handleIdleLogout, 10 * 60 * 1000);

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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/80">
              <User className="w-3.5 h-3.5" />
              <span className="max-w-[120px] truncate">{userNameDisplay}</span>
            </div>
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-sidebar-border [&>button]:hidden">
            <AppSidebar
              userName={userNameDisplay}
              onSignOut={handleSignOut}
              mobile
              onNavigate={() => setMobileOpen(false)}
              isAdmin={isAdmin}
              allowedScreens={allowedScreens}
            />
          </SheetContent>
        </Sheet>

        <main className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>
      </div>
    );
  }

  // Desktop: horizontal top bar with navigation
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
            </div>
            <span className="font-semibold text-body whitespace-nowrap">Nexus Ops</span>
          </div>
          <div className="h-6 w-px bg-sidebar-border shrink-0" />
          <AppSidebar
            userName={userNameDisplay}
            onSignOut={handleSignOut}
            isAdmin={isAdmin}
            allowedScreens={allowedScreens}
          />
        </div>

        {/* Right: User info */}
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <div className="text-right">
            <p className="text-sm font-medium text-sidebar-foreground leading-tight">{userNameDisplay}</p>
            {userCargoDisplay && (
              <p className="text-[11px] text-sidebar-foreground/60 leading-tight">{userCargoDisplay}</p>
            )}
          </div>
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center">
            <User className="w-4 h-4 text-sidebar-accent-foreground" />
          </div>
          <button onClick={handleSignOut} className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground" title="Sair">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="min-h-[calc(100vh-3.5rem)]">
        <Outlet />
      </main>
    </div>
  );
}
