import { useState, useCallback, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { useRealtimeConnectionMonitor } from "@/hooks/useRealtimeConnectionMonitor";
import { usePendingNotifications } from "@/hooks/usePendingNotifications";
import { Menu, User, Settings } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import SessoesUsuarioTab from "@/components/SessoesUsuarioTab";
import MfaEnrollSection from "@/components/MfaEnrollSection";

export function AppLayout() {
  const { profile, user, signOut, isAdmin, allowedScreens, canViewPath } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const { endSession } = useSessionTracker(user?.id || null, profile?.id || null);
  const { pendingEvaluations, pendingLeadDecisions, pendingMyLeads } = usePendingNotifications();

  const badgeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (pendingEvaluations > 0) counts["/avaliacoes/pesquisa"] = pendingEvaluations;
    if (pendingLeadDecisions > 0) counts["/leads/fila"] = pendingLeadDecisions;
    if (pendingMyLeads > 0) counts["/leads"] = pendingMyLeads;
    return counts;
  }, [pendingEvaluations, pendingLeadDecisions, pendingMyLeads]);

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

  const handleChangePassword = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      toast.error("Erro ao alterar senha: " + error.message);
    } else {
      toast.success("Senha alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [newPassword, confirmPassword]);

  const userNameDisplay = profile?.nome || "Usuário";
  const userCargoDisplay = profile?.cargo
    ? profile.cargo.charAt(0).toUpperCase() + profile.cargo.slice(1)
    : "";

  const settingsDialog = (
    <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (!open) { setNewPassword(""); setConfirmPassword(""); } }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações da Conta</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="senha" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="senha" className="flex-1">Editar Senha</TabsTrigger>
            <TabsTrigger value="2fa" className="flex-1">2FA</TabsTrigger>
            <TabsTrigger value="sessoes" className="flex-1">Sessões</TabsTrigger>
          </TabsList>
          <TabsContent value="senha" className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium">Nova Senha</label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
            </div>
            <div>
              <label className="text-sm font-medium">Confirmar Senha</label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repita a nova senha" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancelar</Button>
              <Button onClick={handleChangePassword} disabled={changingPassword}>
                {changingPassword ? "Salvando..." : "Salvar Senha"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="2fa" className="pt-4">
            <MfaEnrollSection />
          </TabsContent>
          <TabsContent value="sessoes" className="pt-4">
            {user?.id && profile?.id ? (
              <SessoesUsuarioTab profileId={profile.id} userId={user.id} />
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Dados do usuário não disponíveis.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );

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
            <span className="text-xs text-sidebar-foreground/80 max-w-[100px] truncate">{userNameDisplay}</span>
            <button onClick={() => setSettingsOpen(true)} className="p-1 rounded-md hover:bg-sidebar-accent/50 transition-colors">
              <Settings className="w-4 h-4 text-sidebar-foreground/70" />
            </button>
          </div>
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
              badgeCounts={badgeCounts}
            />
          </SheetContent>
        </Sheet>

        <main className="min-h-[calc(100vh-3.5rem)]">
          <Outlet />
        </main>
        {settingsDialog}
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
          badgeCounts={badgeCounts}
          isAdmin={isAdmin}
          allowedScreens={allowedScreens}
          canViewPath={canViewPath}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(prev => !prev)}
        />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-end h-12 px-6 bg-background border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="w-4 h-4" />
              <span className="font-medium">{userNameDisplay}</span>
              {userCargoDisplay && (
                <span className="text-xs text-muted-foreground/60">· {userCargoDisplay}</span>
              )}
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Configurações da conta"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>

      {settingsDialog}
    </div>
  );
}
