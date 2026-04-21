import { useMemo } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Shield, CalendarClock, RotateCcw, CheckCircle2, ListChecks } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import OperationalContingenciasPage from "./OperationalContingenciasPage";
import OperationalAprovacaoPage from "./OperationalAprovacaoPage";
import OperationalExecucaoPage from "./OperationalExecucaoPage";

const TABS = [
  { key: "pendentes", label: "Tarefas Pendentes", icon: AlertTriangle, color: "text-destructive" },
  { key: "aguardando", label: "Aguardando Avaliação", icon: Shield, color: "text-amber-600" },
  { key: "hoje", label: "Tarefas de Hoje", icon: CalendarClock, color: "text-primary" },
  { key: "devolvidas", label: "Devolvidas", icon: RotateCcw, color: "text-orange-600" },
  { key: "concluidas", label: "Concluídas", icon: CheckCircle2, color: "text-green-600" },
] as const;

const VALID_TABS = TABS.map((t) => t.key);

export default function MinhasTarefasHubPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab");
  const activeTab = useMemo(
    () => (tab && VALID_TABS.includes(tab as any) ? tab : "pendentes"),
    [tab]
  );

  if (!profile?.id) return <Navigate to="/login" replace />;

  const handleTabChange = (next: string) => {
    const sp = new URLSearchParams(params);
    sp.set("tab", next);
    setParams(sp, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hub header */}
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-2 max-w-7xl mx-auto">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" /> Minhas Tarefas
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Hub central das suas tarefas operacionais.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Sticky tab bar */}
        <div className="sticky top-0 z-30 bg-background border-b border-border px-2 md:px-4">
          <div className="max-w-7xl mx-auto">
            <TabsList className="w-full h-auto flex-wrap gap-1 bg-transparent p-1 justify-start">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger
                    key={t.key}
                    value={t.key}
                    className="flex items-center gap-1.5 text-xs md:text-sm data-[state=active]:bg-muted"
                  >
                    <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">{t.label.split(" ")[0]}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
        </div>

        {/* Tab content — embeds existing pages */}
        <TabsContent value="pendentes" className="mt-0 focus-visible:outline-none">
          <OperationalContingenciasPage />
        </TabsContent>

        <TabsContent value="aguardando" className="mt-0 focus-visible:outline-none">
          <OperationalAprovacaoPage />
        </TabsContent>

        <TabsContent value="hoje" className="mt-0 focus-visible:outline-none">
          <OperationalExecucaoPage />
        </TabsContent>

        <TabsContent value="devolvidas" className="mt-0 focus-visible:outline-none">
          <OperationalExecucaoPage />
        </TabsContent>

        <TabsContent value="concluidas" className="mt-0 focus-visible:outline-none">
          <OperationalExecucaoPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
