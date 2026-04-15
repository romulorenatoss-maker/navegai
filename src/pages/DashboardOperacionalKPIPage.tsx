import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalDashboard } from "@/hooks/useOperationalDashboard";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon, Activity, CheckCircle2, ShieldAlert, Clock, AlertTriangle,
  TrendingUp, BarChart3, Target, XCircle, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CONTINGENCY_STATUS } from "@/hooks/useOperationalScoring";

const scoreColor = (v: number) => {
  if (v >= 90) return "text-emerald-600";
  if (v >= 70) return "text-amber-600";
  return "text-red-600";
};

export default function DashboardOperacionalKPIPage() {
  const { isAdmin } = useAuth();
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(now));
  const [templateId, setTemplateId] = useState<string>("");
  const [setorId, setSetorId] = useState<string>("");
  const [executorId, setExecutorId] = useState<string>("");
  const [avaliadoId, setAvaliadoId] = useState<string>("");
  const [avaliadorId, setAvaliadorId] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const dash = useOperationalDashboard({
    startDate, endDate,
    templateId: templateId && templateId !== "all" ? templateId : undefined,
    setorId: setorId && setorId !== "all" ? setorId : undefined,
    executorId: executorId && executorId !== "all" ? executorId : undefined,
    avaliadoId: avaliadoId && avaliadoId !== "all" ? avaliadoId : undefined,
    avaliadorId: avaliadorId && avaliadorId !== "all" ? avaliadorId : undefined,
  });

  const clearFilters = () => {
    setTemplateId(""); setSetorId(""); setExecutorId(""); setAvaliadoId(""); setAvaliadorId("");
  };
  const hasFilters = !!(templateId || setorId || executorId || avaliadoId || avaliadorId);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Dashboard Operacional
          </h1>
          <p className="text-sm text-muted-foreground">KPIs, analytics e análise de não conformidades.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}
            className={cn(hasFilters && "border-primary text-primary")}>
            <Filter className="w-4 h-4 mr-1" />
            Filtros {hasFilters && "●"}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="w-4 h-4 mr-1" />
                {format(startDate, "dd/MM/yy", { locale: ptBR })} – {format(endDate, "dd/MM/yy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: startDate, to: endDate }}
                onSelect={(range) => { if (range?.from) setStartDate(range.from); if (range?.to) setEndDate(range.to); }}
                locale={ptBR} className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-card border border-border rounded-lg p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Template</label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {dash.templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Setor</label>
            <Select value={setorId} onValueChange={setSetorId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {dash.setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Executor</label>
            <Select value={executorId} onValueChange={setExecutorId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {dash.profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Avaliado</label>
            <Select value={avaliadoId} onValueChange={setAvaliadoId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {dash.profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground mb-1 block">Avaliador</label>
            <div className="flex gap-2 items-end flex-1">
              <Select value={avaliadorId} onValueChange={setAvaliadorId}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {dash.profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>Limpar</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {dash.isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard icon={<Activity className="w-4 h-4" />} label="Total Assignments" value={dash.kpis.total} />
          <KPICard icon={<CheckCircle2 className="w-4 h-4" />} label="Taxa Conclusão" value={dash.kpis.taxaConclusao} suffix="%" color={dash.kpis.taxaConclusao >= 80 ? "emerald" : dash.kpis.taxaConclusao >= 60 ? "amber" : "red"} />
          <KPICard icon={<Target className="w-4 h-4" />} label="Taxa Conformidade" value={dash.kpis.taxaConformidade} suffix="%" color={dash.kpis.taxaConformidade != null && dash.kpis.taxaConformidade >= 90 ? "emerald" : "amber"} />
          <KPICard icon={<TrendingUp className="w-4 h-4" />} label="Score Médio" value={dash.kpis.scoreMedio} color={dash.kpis.scoreMedio != null && dash.kpis.scoreMedio >= 80 ? "emerald" : "amber"} />
          <KPICard icon={<ShieldAlert className="w-4 h-4" />} label="Contingências" value={dash.kpis.totalContingencias} />
          <KPICard icon={<AlertTriangle className="w-4 h-4" />} label="Vencidas" value={dash.kpis.vencidas} color={dash.kpis.vencidas > 0 ? "red" : "emerald"} />
          <KPICard icon={<Clock className="w-4 h-4" />} label="SLA Cumprido" value={dash.kpis.slaMedio} suffix="%" color={dash.kpis.slaMedio != null && dash.kpis.slaMedio >= 80 ? "emerald" : "red"} />
          <KPICard icon={<Clock className="w-4 h-4" />} label="MTTR" value={dash.kpis.mttrHours} suffix="h" />
        </div>
      )}

      {/* Charts & Analysis */}
      <Tabs defaultValue="evolucao" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="evolucao" className="text-xs">Evolução Score</TabsTrigger>
          <TabsTrigger value="contingencias" className="text-xs">Contingências</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs">Por Template</TabsTrigger>
          <TabsTrigger value="naoconformidades" className="text-xs">Não Conformidades</TabsTrigger>
        </TabsList>

        {/* Score Evolution */}
        <TabsContent value="evolucao">
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Evolução do Score Médio</h3>
            {dash.scoreEvolution.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Sem dados de score no período.</p>
            ) : (
              <div className="space-y-2">
                {dash.scoreEvolution.map((point) => (
                  <div key={point.date} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0 font-mono">
                      {format(new Date(point.date + "T12:00:00"), "dd/MM", { locale: ptBR })}
                    </span>
                    <div className="flex-1 h-6 bg-muted/30 rounded relative overflow-hidden">
                      <div
                        className={cn("h-full rounded transition-all", point.media >= 90 ? "bg-emerald-500/70" : point.media >= 70 ? "bg-amber-500/70" : "bg-red-500/70")}
                        style={{ width: `${Math.min(point.media, 100)}%` }}
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-xs font-bold text-foreground">
                        {point.media}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Contingencies by status */}
        <TabsContent value="contingencias">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Contingências por Status</h3>
              {dash.contingenciesByStatus.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">Nenhuma contingência no período.</p>
              ) : (
                <div className="space-y-3">
                  {dash.contingenciesByStatus.map((item) => {
                    const cfg = CONTINGENCY_STATUS[item.status] || { label: item.status, class: "bg-muted text-muted-foreground" };
                    const maxCount = Math.max(...dash.contingenciesByStatus.map((i) => i.count));
                    return (
                      <div key={item.status} className="flex items-center gap-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border w-24 justify-center", cfg.class)}>
                          {cfg.label}
                        </span>
                        <div className="flex-1 h-5 bg-muted/30 rounded relative overflow-hidden">
                          <div className="h-full bg-primary/50 rounded" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                        </div>
                        <span className="text-sm font-bold text-foreground w-8 text-right">{item.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Templates com mais Contingências</h3>
              {dash.templatesWithMostContingencies.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-8">Nenhuma contingência no período.</p>
              ) : (
                <div className="space-y-2">
                  {dash.templatesWithMostContingencies.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border border-border rounded text-sm">
                      <span className="text-foreground truncate flex-1">{item.nome}</span>
                      <span className="font-bold text-destructive ml-2">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Performance by template */}
        <TabsContent value="templates">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2 text-muted-foreground text-xs font-medium">Template</th>
                  <th className="text-center px-4 py-2 text-muted-foreground text-xs font-medium">Total</th>
                  <th className="text-center px-4 py-2 text-muted-foreground text-xs font-medium">Contingências</th>
                  <th className="text-center px-4 py-2 text-muted-foreground text-xs font-medium">Score Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dash.performanceByTemplate.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Sem dados.</td></tr>
                ) : dash.performanceByTemplate.map((t, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-foreground">{t.nome}</td>
                    <td className="px-4 py-2 text-center font-mono">{t.count}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("font-mono", t.contingencias > 0 ? "text-destructive font-bold" : "text-muted-foreground")}>{t.contingencias}</span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      {t.media != null ? (
                        <span className={cn("font-bold font-mono", scoreColor(t.media))}>{t.media}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Non-conformities */}
        <TabsContent value="naoconformidades">
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-destructive" /> Top Campos com mais Reprovações
            </h3>
            {dash.topRejectedFields.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Nenhuma reprovação no período.</p>
            ) : (
              <div className="space-y-2">
                {dash.topRejectedFields.map((item, i) => {
                  const max = dash.topRejectedFields[0]?.count || 1;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.template}</p>
                      </div>
                      <div className="w-24 h-4 bg-muted/30 rounded overflow-hidden shrink-0">
                        <div className="h-full bg-destructive/60 rounded" style={{ width: `${(item.count / max) * 100}%` }} />
                      </div>
                      <span className="text-sm font-bold text-destructive w-8 text-right shrink-0">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── KPI Card Component ──
function KPICard({ icon, label, value, suffix, color }: {
  icon: React.ReactNode; label: string; value: number | null; suffix?: string;
  color?: "emerald" | "amber" | "red";
}) {
  const colorClass = color === "emerald" ? "text-emerald-600" : color === "red" ? "text-destructive" : color === "amber" ? "text-amber-600" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-2xl font-bold font-mono", colorClass)}>
        {value != null ? value : "—"}
        {value != null && suffix && <span className="text-sm font-normal ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
