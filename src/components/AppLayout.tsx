import { useState } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 h-14 px-4 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
            </div>
            <span className="font-semibold text-sm">Nexus Ops</span>
          </div>
        </header>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[280px] bg-sidebar border-sidebar-border [&>button]:hidden">
            <AppSidebar
              userName={profile?.nome || "Usuário"}
              onSignOut={signOut}
              mobile
              onNavigate={() => setMobileOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <main className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar userName={profile?.nome || "Usuário"} onSignOut={signOut} />
      <main className="ml-[240px] min-h-screen transition-all duration-200">
        <Outlet />
      </main>
    </div>
  );
}
