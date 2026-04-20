import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter, ListChecks, Plus, Eye, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { getScoreColorClass } from "@/lib/score-colors";
import { cn } from "@/lib/utils";
import AssignmentQuickViewDialog from "@/components/AssignmentQuickViewDialog";

const COMPLETED_STATUSES = ["concluida", "aprovada"];

const STATUS_LABELS: Record<string, { text: string; cls: string }> = {
  concluida: { text: "Concluída", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50" },
  aprovada: { text: "Aprovada", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50" },
};

export default function MinhasTarefasTab() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { can } = usePermissions(profile?.id ?? null);
  const canCreate = can("/operacional/execucao", "create");

  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [appliedStart, setAppliedStart] = useState<Date | undefined>(startOfMonth(now));
  const [appliedEnd, setAppliedEnd] = useState<Date | undefined>(endOfMonth(now));
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["minhas_tarefas_avaliado", profile?.id, appliedStart?.toISOString(), appliedEnd?.toISOString()],
    queryFn: async () => {
      if (!profile?.id) return [];
      const from = appliedStart ? startOfDay(appliedStart).toISOString().slice(0, 10) : startOfDay(startOfMonth(now)).toISOString().slice(0, 10);
      const to = appliedEnd ? endOfDay(appliedEnd).toISOString().slice(0, 10) : endOfDay(endOfMonth(now)).toISOString().slice(0, 10);

      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select(`
          id, numero_tarefa, status, data_prevista, fim_em,
          score_avaliado, score_final_ajustado, pontuacao_obtida,
          template_id,
          operational_templates(nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(id, nome)
        `)
        .eq("avaliado_id", profile.id)
        .in("status", COMPLETED_STATUSES)
        .gte("data_prevista", from)
        .lte("data_prevista", to)
        .order("data_prevista", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { avgScore, scored } = useMemo(() => {
    const notas = assignments
      .map((a: any) => a.score_final_ajustado ?? a.pontuacao_obtida ?? a.score_avaliado)
      .filter((n: any) => typeof n === "number");
    if (notas.length === 0) return { avgScore: null, scored: 0 };
    const sum = notas.reduce((s: number, n: number) => s + n, 0);
    return { avgScore: sum / notas.length, scored: notas.length };
  }, [assignments]);

  return (
    <div className="space-y-4 mt-4">
      {/* KPI no topo: Nota Média */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 shadow-card">
          <div className="flex items-center gap-2 text-caption text-muted-foreground uppercase tracking-wider mb-1">
            <Trophy className="w-3.5 h-3.5" /> Nota Média
          </div>
          <div className={cn("text-2xl font-bold font-tabular", avgScore != null ? getScoreColorClass(avgScore) : "text-muted-foreground")}>
            {avgScore != null ? `${avgScore.toFixed(1)}%` : "—"}
          </div>
          <div className="text-caption text-muted-foreground mt-0.5">{scored} tarefa(s) pontuada(s)</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-card">
          <div className="text-caption text-muted-foreground uppercase tracking-wider mb-1">Total Concluídas</div>
          <div className="text-2xl font-bold font-tabular text-foreground">{assignments.length}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-card flex items-center justify-between gap-3">
          <div>
            <div className="text-caption text-muted-foreground uppercase tracking-wider mb-1">Nova Tarefa</div>
            <div className="text-xs text-muted-foreground">Criar tarefa individual</div>
          </div>
          {canCreate ? (
            <Button onClick={() => navigate("/operacional/cadastro")} className="shrink-0">
              <Plus className="w-4 h-4 mr-1.5" /> Nova
            </Button>
          ) : (
            <Badge variant="outline" className="text-xs">Sem permissão</Badge>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={() => { setAppliedStart(startDate); setAppliedEnd(endDate); }} className="h-9">
            <Filter className="w-4 h-4 mr-1.5" /> Buscar
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <h2 className="text-body font-semibold text-foreground">Tarefas Concluídas (sou o avaliado)</h2>
          <Badge variant="secondary" className="ml-auto text-xs">{assignments.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">#</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tarefa</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Avaliador</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nota</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando…</td></tr>
              )}
              {!isLoading && assignments.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma tarefa concluída no período.</td></tr>
              )}
              {assignments.map((a: any) => {
                const nota = a.score_final_ajustado ?? a.pontuacao_obtida ?? a.score_avaliado;
                const sl = STATUS_LABELS[a.status] || { text: a.status, cls: "bg-muted text-muted-foreground" };
                return (
                  <tr key={a.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedAssignmentId(a.id)}>
                    <td className="px-4 py-3 text-body font-mono text-primary">#{a.numero_tarefa}</td>
                    <td className="px-4 py-3 text-body text-foreground">{a.operational_templates?.nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{a.avaliador?.nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{format(new Date(a.data_prevista), "dd/MM/yyyy")}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", sl.cls)}>{sl.text}</span>
                    </td>
                    <td className="px-4 py-3">
                      {typeof nota === "number" ? (
                        <span className={cn("font-bold font-tabular", getScoreColorClass(nota))}>{nota.toFixed(1)}%</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3"><Eye className="w-4 h-4 text-muted-foreground" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AssignmentQuickViewDialog
        assignmentId={selectedAssignmentId}
        open={!!selectedAssignmentId}
        onOpenChange={(o) => { if (!o) setSelectedAssignmentId(null); }}
      />
    </div>
  );
}
