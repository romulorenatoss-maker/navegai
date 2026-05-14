import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, Target, AlertCircle, ChevronDown, ChevronUp,
  CalendarIcon, BarChart3, User, Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";


// ── helpers ──
const scoreColor = (v: number) => {
  if (v >= 90) return "text-emerald-600";
  if (v >= 70) return "text-amber-600";
  return "text-red-600";
};
const scoreBg = (v: number) => {
  if (v >= 90) return "bg-emerald-500";
  if (v >= 70) return "bg-amber-500";
  return "bg-red-500";
};

export default function DesempenhoOperacionalPage() {
  const { profile, isAdmin } = useAuth();
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(now));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const profileId = profile?.id;

  // ── Fetch score logs for logged user ──
  const { data: scoreLogs = [], isLoading } = useQuery({
    queryKey: ["op-score-logs", profileId, startDate.toISOString(), endDate.toISOString()],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("*, operational_assignments(data_prevista, status, operational_templates(nome, tipo_execucao))")
        .or(`target_profile_id.eq.${profileId},profile_id.eq.${profileId}`)
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch rankings (all users, current period) ──
  const { data: allScores = [] } = useQuery({
    queryKey: ["op-rankings-all", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("target_profile_id, score_final, tipo_score, target_setor_id")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .not("target_profile_id", "is", null);
      if (error) throw error;
      return data || [];
    },
  });

  // ── Fetch profile names for ranking ──
  const profileIds = useMemo(() => [...new Set(allScores.map((s: any) => s.target_profile_id).filter(Boolean))], [allScores]);
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["op-profiles", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").in("id", profileIds as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
  });

  // ── Computed stats ──
  // ── Computed stats (with weighted average using multiplicador) ──
  const myExecutorLogs = scoreLogs.filter((s: any) => s.tipo_score === "executor" && s.profile_id === profileId);
  const myAvaliadoLogs = scoreLogs.filter((s: any) => s.tipo_score === "avaliado" && s.target_profile_id === profileId);
  const myAvaliadorLogs = scoreLogs.filter((s: any) => s.tipo_score === "avaliador" && s.profile_id === profileId);

  const weightedAvg = (logs: any[]) => {
    if (logs.length === 0) return null;
    let sumWeighted = 0, sumWeights = 0;
    logs.forEach((l: any) => {
      const w = l.detalhe_calculo?.peso_recorrencia ?? 1;
      sumWeighted += (l.score_final || 0) * w;
      sumWeights += w;
    });
    return sumWeights > 0 ? Math.round(sumWeighted / sumWeights) : null;
  };

  const avgExecutor = weightedAvg(myExecutorLogs);
  const avgAvaliado = weightedAvg(myAvaliadoLogs);
  const avgAvaliador = weightedAvg(myAvaliadorLogs);

  // ── Rankings ──
  const rankings = useMemo(() => {
    const byProfile: Record<string, { sum: number; count: number }> = {};
    allScores.forEach((s: any) => {
      if (!s.target_profile_id) return;
      if (!byProfile[s.target_profile_id]) byProfile[s.target_profile_id] = { sum: 0, count: 0 };
      byProfile[s.target_profile_id].sum += s.score_final || 0;
      byProfile[s.target_profile_id].count += 1;
    });
    return Object.entries(byProfile)
      .map(([id, v]) => ({ id, nome: profilesMap[id] || "—", media: Math.round(v.sum / v.count), total: v.count }))
      .sort((a, b) => b.media - a.media);
  }, [allScores, profilesMap]);

  const myRankPosition = rankings.findIndex((r) => r.id === profileId) + 1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-section font-semibold text-foreground">📊 Meu Desempenho Operacional</h1>
          <p className="text-body text-muted-foreground">Transparência total: veja como suas notas são calculadas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(startDate, "dd/MM/yy", { locale: ptBR })} – {format(endDate, "dd/MM/yy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: startDate, to: endDate }}
                onSelect={(range) => { if (range?.from) setStartDate(range.from); if (range?.to) setEndDate(range.to); }}
                locale={ptBR} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon={<Target className="w-5 h-5" />} label="Média Executor" value={avgExecutor} />
        <SummaryCard icon={<User className="w-5 h-5" />} label="Média Avaliado" value={avgAvaliado} />
        <SummaryCard icon={<BarChart3 className="w-5 h-5" />} label="Média Avaliador" value={avgAvaliador} />
        <SummaryCard icon={<TrendingUp className="w-5 h-5" />} label="Nota Global" value={avgExecutor != null ? Math.round((avgExecutor || 0) * 0.4 + 0) : null} suffix="(Op 40%)" />
        <SummaryCard icon={<Trophy className="w-5 h-5" />} label="Posição Ranking" value={myRankPosition || null} suffix={`/ ${rankings.length}`} plain />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="execucoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="execucoes">Por Execução</TabsTrigger>
          <TabsTrigger value="avaliado">Como Avaliado</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>

        {/* ── Por Execução ── */}
        <TabsContent value="execucoes">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : myExecutorLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma execução no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {myExecutorLogs.map((log: any) => {
                  const det = log.detalhe_calculo || {};
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const expanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-foreground truncate">{template?.nome || "—"}</p>
                          <p className="text-caption text-muted-foreground">
                            {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "—"} · {template?.tipo_execucao || "—"}
                            {det.peso_recorrencia && det.peso_recorrencia !== 1 && (
                              <span className="ml-1 text-primary font-medium">×{det.peso_recorrencia}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-lg font-bold font-tabular", scoreColor(log.score_final || 0))}>{log.score_final ?? "—"}</span>
                          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {expanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-3 space-y-2">
                          <ScoreBar label="Pontualidade (40%)" value={det.pontualidade} />
                          <ScoreBar label="Conformidade (30%)" value={det.conformidade} />
                          <ScoreBar label="Evidência (20%)" value={det.evidencia} />
                          <ScoreBar label="SLA Correções (10%)" value={det.sla_correcoes} />
                          <p className="text-caption text-muted-foreground pt-1">Fórmula: {det.formula || "—"}</p>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Como Avaliado ── */}
        <TabsContent value="avaliado">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : myAvaliadoLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma avaliação recebida no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {myAvaliadoLogs.map((log: any) => {
                  const det = log.detalhe_calculo || {};
                  const itens = det.itens || [];
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const expanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-foreground truncate">{template?.nome || "—"}</p>
                          <p className="text-caption text-muted-foreground">
                            {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-lg font-bold font-tabular", scoreColor(log.score_final || 0))}>{log.score_final ?? "—"}</span>
                          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {expanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-3">
                          {det.herda_executor ? (
                            <p className="text-caption text-muted-foreground">Score herdado do executor (tarefa simples/etapas).</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-caption text-muted-foreground mb-2">
                                Soma ponderada: {det.soma_ponderada} / {det.soma_maxima} = {log.score_final}%
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-caption">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="text-left py-1 px-2 text-muted-foreground">Item</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Nota</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Máx</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Penalidade</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Conforme</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Nota</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {itens.map((item: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="py-1 px-2 text-foreground">{item.pergunta}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.peso}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.nota_maxima}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.penalidade}%</td>
                                        <td className="py-1 px-2 text-center">
                                          {item.conforme === true ? "✅" : item.conforme === false ? "❌" : "—"}
                                        </td>
                                        <td className={cn("py-1 px-2 text-center font-tabular font-medium", item.conforme === false ? "text-destructive" : "text-foreground")}>
                                          {item.nota_obtida}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Ranking ── */}
        <TabsContent value="ranking">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-16">#</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Execuções</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rankings.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>
                ) : rankings.map((r, i) => (
                  <tr key={r.id} className={cn("transition-colors", r.id === profileId ? "bg-primary/5 font-medium" : "hover:bg-muted/50")}>
                    <td className="px-4 py-3 text-center font-tabular">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-4 py-3 text-body text-foreground">
                      {r.nome} {r.id === profileId && <span className="text-caption text-primary">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-tabular text-muted-foreground">{r.total}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-bold font-tabular", scoreColor(r.media))}>{r.media}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Sub-components ──
function SummaryCard({ icon, label, value, suffix, plain }: { icon: React.ReactNode; label: string; value: number | null; suffix?: string; plain?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-4 shadow-card">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}<span className="text-caption font-medium uppercase tracking-wider">{label}</span></div>
      <p className={cn("text-2xl font-bold font-tabular", !plain && value != null ? scoreColor(value) : "text-foreground")}>
        {value != null ? value : "—"}{suffix && <span className="text-base font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </motion.div>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-caption text-muted-foreground w-40 shrink-0">{label}</span>
      <Progress value={v} className="h-2 flex-1" />
      <span className={cn("text-caption font-bold font-tabular w-10 text-right", scoreColor(v))}>{Math.round(v)}</span>
    </div>
  );
}
