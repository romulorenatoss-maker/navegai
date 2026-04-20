import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_CONFIG, CONTINGENCY_STATUS, AUDIT_EVENT_LABELS } from "@/modules/operacional/hooks/useOperationalScoring";
import { BarChart3, AlertTriangle, CheckCircle2, Clock, Users, Shield, RotateCcw, History, ThumbsUp, ThumbsDown, Pencil } from "lucide-react";
import { useApprovalFlow } from "@/modules/operacional/hooks/useApprovalFlow";
import { useContingencyManagement } from "@/modules/operacional/hooks/useContingencyManagement";
import { useOperationalTransition } from "@/modules/operacional/hooks/useOperationalTransition";

export default function OperationalGestaoPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [periodoFim, setPeriodoFim] = useState(new Date().toISOString().slice(0, 10));
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroColaborador, setFiltroColaborador] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  // Dialogs
  const [approvalDialog, setApprovalDialog] = useState<{ open: boolean; assignment: any; action: "aprovar" | "reprovar" }>({ open: false, assignment: null, action: "aprovar" });
  const [reopenDialog, setReopenDialog] = useState<{ open: boolean; assignment: any }>({ open: false, assignment: null });
  const [auditDialog, setAuditDialog] = useState<{ open: boolean; assignmentId: string | null }>({ open: false, assignmentId: null });
  const [scoreDialog, setScoreDialog] = useState<{ open: boolean; assignment: any }>({ open: false, assignment: null });
  const [motivo, setMotivo] = useState("");
  const [newScore, setNewScore] = useState("");

  const { data: assignments = [] } = useQuery({
    queryKey: ["operational_gestao_assignments", periodoInicio, periodoFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao, setor_id, requer_aprovacao_gestor, bloquear_fechamento_com_contingencia, modo_pontuacao, destino_score, executor_setor_id, avaliador_setor_id, avaliado_setor_id, setores:setores!operational_templates_setor_id_fkey(nome), horario_limite_execucao), profiles!operational_assignments_responsavel_id_fkey(id, nome)")
        .gte("data_prevista", periodoInicio)
        .lte("data_prevista", periodoFim)
        .order("data_prevista", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: contingencies = [] } = useQuery({
    queryKey: ["operational_gestao_contingencies", periodoInicio, periodoFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*, operational_assignments(data_prevista, operational_templates(nome)), profiles!operational_contingencies_responsavel_id_fkey(nome)")
        .gte("created_at", periodoInicio)
        .lte("created_at", periodoFim + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ["operational_audit_trail", auditDialog.assignmentId],
    queryFn: async () => {
      if (!auditDialog.assignmentId) return [];
      const { data, error } = await (supabase as any).from("operational_audit_trail")
        .select("*, profiles:executado_por(nome)")
        .eq("assignment_id", auditDialog.assignmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!auditDialog.assignmentId,
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Use official approval flow for selected assignment
  const [approvalAssignmentId, setApprovalAssignmentId] = useState<string | null>(null);
  const approvalFlow = useApprovalFlow(approvalAssignmentId);

  // Use official contingency management
  const contingencyMgmt = useContingencyManagement();
  const { transition: centralTransition } = useOperationalTransition();

  // Reopen mutation — uses centralized transition
  const reopenAssignment = useMutation({
    mutationFn: async ({ assignmentId, motivo: m }: { assignmentId: string; motivo: string }) => {
      if (!m.trim()) throw new Error("Motivo é obrigatório para reabertura.");
      await centralTransition.mutateAsync({
        assignmentId,
        action: "reabrir",
        motivo: m,
        origem: "gestao",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_gestao_assignments"] });
      toast.success("Rotina reaberta!");
      setReopenDialog({ open: false, assignment: null });
      setMotivo("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Score adjustment mutation
  const adjustScore = useMutation({
    mutationFn: async ({ assignmentId, score, motivo: m }: { assignmentId: string; score: number; motivo: string }) => {
      if (!m.trim()) throw new Error("Justificativa é obrigatória para ajuste de score.");
      if (score < 0 || score > 100) throw new Error("Score deve estar entre 0 e 100.");
      const assignment = assignments.find((a: any) => a.id === assignmentId);
      const oldScore = assignment?.pontuacao_obtida;
      const { error } = await (supabase as any).from("operational_assignments")
        .update({ pontuacao_obtida: score, score_executor: score })
        .eq("id", assignmentId);
      if (error) throw error;
      await (supabase as any).from("operational_score_logs")
        .update({ score_final: score })
        .eq("assignment_id", assignmentId)
        .eq("tipo_score", "executor");
      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: assignmentId,
        tipo_evento: "ajuste_score",
        executado_por: profile?.id,
        motivo: m,
        dados_anteriores: { pontuacao_obtida: oldScore },
        dados_novos: { pontuacao_obtida: score },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_gestao_assignments"] });
      toast.success("Score ajustado com sucesso!");
      setScoreDialog({ open: false, assignment: null });
      setMotivo("");
      setNewScore("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    return assignments.filter((a: any) => {
      if (filtroSetor !== "todos" && a.operational_templates?.setor_id !== filtroSetor) return false;
      if (filtroColaborador !== "todos" && a.responsavel_id !== filtroColaborador) return false;
      if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
      return true;
    });
  }, [assignments, filtroSetor, filtroColaborador, filtroStatus]);

  const awaitingApproval = useMemo(() => assignments.filter((a: any) => a.status === "aguardando_aprovacao"), [assignments]);

  // Metrics
  const metrics = useMemo(() => {
    const total = filtered.length;
    const concluidas = filtered.filter((a: any) => ["concluida", "aprovada"].includes(a.status)).length;
    const atrasadas = filtered.filter((a: any) => a.status === "atrasada" || (a.data_prevista < new Date().toISOString().slice(0, 10) && !["concluida", "aprovada", "nao_executada"].includes(a.status))).length;
    const pendentesAprovacao = filtered.filter((a: any) => a.status === "aguardando_aprovacao").length;
    const contingenciasAbertas = contingencies.filter((c: any) => ["aberta", "em_andamento"].includes(c.status)).length;
    const contingenciasVencidas = contingencies.filter((c: any) => c.status === "aberta" && c.prazo_sla && new Date(c.prazo_sla) < new Date()).length;
    const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    return { total, concluidas, atrasadas, pendentesAprovacao, contingenciasAbertas, contingenciasVencidas, taxaConclusao };
  }, [filtered, contingencies]);

  // Rankings with triple score support
  const rankings = useMemo(() => {
    const byUser: Record<string, { nome: string; total: number; concluidas: number; scoreExecSum: number; scoreAvdoSum: number; scoreAvdrSum: number; countExec: number; countAvdo: number; countAvdr: number }> = {};
    filtered.forEach((a: any) => {
      // Executor
      const uid = a.responsavel_id;
      if (uid) {
        if (!byUser[uid]) byUser[uid] = { nome: a.profiles?.nome || "—", total: 0, concluidas: 0, scoreExecSum: 0, scoreAvdoSum: 0, scoreAvdrSum: 0, countExec: 0, countAvdo: 0, countAvdr: 0 };
        byUser[uid].total++;
        if (["concluida", "aprovada"].includes(a.status)) {
          byUser[uid].concluidas++;
          if (a.score_executor != null) { byUser[uid].scoreExecSum += Number(a.score_executor); byUser[uid].countExec++; }
        }
      }
      // Avaliado (can differ from executor)
      const avdoId = a.avaliado_id;
      if (avdoId && avdoId !== uid) {
        if (!byUser[avdoId]) byUser[avdoId] = { nome: "—", total: 0, concluidas: 0, scoreExecSum: 0, scoreAvdoSum: 0, scoreAvdrSum: 0, countExec: 0, countAvdo: 0, countAvdr: 0 };
      }
      if (avdoId && ["concluida", "aprovada"].includes(a.status) && a.score_avaliado != null) {
        if (!byUser[avdoId]) byUser[avdoId] = { nome: "—", total: 0, concluidas: 0, scoreExecSum: 0, scoreAvdoSum: 0, scoreAvdrSum: 0, countExec: 0, countAvdo: 0, countAvdr: 0 };
        byUser[avdoId].scoreAvdoSum += Number(a.score_avaliado);
        byUser[avdoId].countAvdo++;
      }
      // Avaliador
      const avdrId = a.avaliador_id;
      if (avdrId && ["concluida", "aprovada"].includes(a.status) && a.score_avaliador != null) {
        if (!byUser[avdrId]) byUser[avdrId] = { nome: "—", total: 0, concluidas: 0, scoreExecSum: 0, scoreAvdoSum: 0, scoreAvdrSum: 0, countExec: 0, countAvdo: 0, countAvdr: 0 };
        byUser[avdrId].scoreAvdrSum += Number(a.score_avaliador);
        byUser[avdrId].countAvdr++;
      }
    });
    return Object.entries(byUser)
      .map(([id, u]) => ({
        id, ...u,
        scoreExecMedio: u.countExec > 0 ? Math.round(u.scoreExecSum / u.countExec) : null,
        scoreAvdoMedio: u.countAvdo > 0 ? Math.round(u.scoreAvdoSum / u.countAvdo) : null,
        scoreAvdrMedio: u.countAvdr > 0 ? Math.round(u.scoreAvdrSum / u.countAvdr) : null,
        taxa: u.total > 0 ? Math.round((u.concluidas / u.total) * 100) : 0,
      }))
      .sort((a, b) => (b.scoreExecMedio ?? 0) - (a.scoreExecMedio ?? 0));
  }, [filtered]);

  const MetricCard = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-card border border-border rounded-lg p-4 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
        <span className="text-caption text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground font-tabular">{value}</p>
      {sub && <p className="text-caption text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Gestão Operacional</h1>
        <p className="text-body text-muted-foreground">Acompanhe performance, SLA, aprovações e conformidade das rotinas.</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-caption">De</Label>
            <Input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Até</Label>
            <Input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Setor</Label>
            <Select value={filtroSetor} onValueChange={setFiltroSetor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Colaborador</Label>
            <Select value={filtroColaborador} onValueChange={setFiltroColaborador}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(STATUS_CONFIG).filter(([k]) => !["reaberta", "atrasada", "bloqueada"].includes(k)).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <MetricCard icon={BarChart3} label="Total Rotinas" value={metrics.total} sub={`${metrics.taxaConclusao}% concluídas`} />
        <MetricCard icon={CheckCircle2} label="Concluídas" value={metrics.concluidas} color="text-green-600" />
        <MetricCard icon={Clock} label="Em Atraso" value={metrics.atrasadas} color="text-orange-600" />
        <MetricCard icon={Shield} label="Aguard. Aprovação" value={metrics.pendentesAprovacao} color="text-purple-600" />
        <MetricCard icon={AlertTriangle} label="Contingências" value={metrics.contingenciasAbertas} sub={`${metrics.contingenciasVencidas} vencidas`} color="text-red-600" />
      </div>

      <Tabs defaultValue={awaitingApproval.length > 0 ? "aprovacoes" : "ranking"}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {awaitingApproval.length > 0 && (
            <TabsTrigger value="aprovacoes">
              <Shield className="w-3 h-3 mr-1" />Aprovações
              <span className="ml-1 bg-purple-500/20 text-purple-600 px-1.5 rounded-full text-caption">{awaitingApproval.length}</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="ranking"><Users className="w-3 h-3 mr-1" />Ranking</TabsTrigger>
          <TabsTrigger value="rotinas"><BarChart3 className="w-3 h-3 mr-1" />Rotinas</TabsTrigger>
          <TabsTrigger value="contingencias"><AlertTriangle className="w-3 h-3 mr-1" />Contingências</TabsTrigger>
        </TabsList>

        {/* Aprovações */}
        <TabsContent value="aprovacoes">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Rotina</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Responsável</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Data</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Score</th>
                  <th className="text-right text-caption font-medium text-muted-foreground uppercase px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {awaitingApproval.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhuma rotina aguardando aprovação.</td></tr>
                ) : awaitingApproval.map((a: any) => (
                  <tr key={a.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-body font-medium text-foreground">{a.operational_templates?.nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{a.profiles?.nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{a.data_prevista}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                        {a.pontuacao_obtida != null ? Math.round(a.pontuacao_obtida) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" className="text-green-700" onClick={() => { setApprovalAssignmentId(a.id); setApprovalDialog({ open: true, assignment: a, action: "aprovar" }); setMotivo(""); }}>
                          <ThumbsUp className="w-3 h-3 mr-1" />Aprovar
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setApprovalAssignmentId(a.id); setApprovalDialog({ open: true, assignment: a, action: "reprovar" }); setMotivo(""); }}>
                          <ThumbsDown className="w-3 h-3 mr-1" />Reprovar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAuditDialog({ open: true, assignmentId: a.id }); }}>
                          <History className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Ranking */}
        <TabsContent value="ranking">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">#</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Total</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Taxa</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Executor</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Avaliado</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Avaliador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rankings.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>
                ) : rankings.map((r, i) => {
                  const renderScore = (v: number | null) => {
                    if (v == null) return <span className="text-caption text-muted-foreground">—</span>;
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${v >= 80 ? "badge-complete" : v >= 50 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200"}`}>
                        {v}
                      </span>
                    );
                  };
                  return (
                    <tr key={r.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-caption font-medium text-muted-foreground">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </td>
                      <td className="px-4 py-3 text-body font-medium text-foreground">{r.nome}</td>
                      <td className="px-4 py-3 text-center text-body font-tabular">{r.total}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${r.taxa >= 80 ? "badge-complete" : r.taxa >= 50 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200"}`}>
                          {r.taxa}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{renderScore(r.scoreExecMedio)}</td>
                      <td className="px-4 py-3 text-center">{renderScore(r.scoreAvdoMedio)}</td>
                      <td className="px-4 py-3 text-center">{renderScore(r.scoreAvdrMedio)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Rotinas */}
        <TabsContent value="rotinas">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Rotina</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Responsável</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Data</th>
                    <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Status</th>
                    <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Score</th>
                    <th className="text-right text-caption font-medium text-muted-foreground uppercase px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sem rotinas no período.</td></tr>
                  ) : filtered.slice(0, 100).map((a: any) => {
                    const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
                    const canReopen = ["concluida", "aprovada", "reprovada", "nao_executada"].includes(a.status);
                    return (
                      <tr key={a.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 text-body font-medium text-foreground">{a.operational_templates?.nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.profiles?.nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.data_prevista}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${sc.class}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-body font-tabular">
                          {a.pontuacao_obtida != null ? Math.round(a.pontuacao_obtida) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canReopen && (
                              <Button size="sm" variant="ghost" title="Reabrir" onClick={() => { setReopenDialog({ open: true, assignment: a }); setMotivo(""); }}>
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                            )}
                            {a.pontuacao_obtida != null && (
                              <Button size="sm" variant="ghost" title="Ajustar Score" onClick={() => { setScoreDialog({ open: true, assignment: a }); setNewScore(String(Math.round(a.pontuacao_obtida))); setMotivo(""); }}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" title="Trilha de Auditoria" onClick={() => setAuditDialog({ open: true, assignmentId: a.id })}>
                              <History className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Contingências */}
        <TabsContent value="contingencias">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Descrição</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Rotina</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Responsável</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">SLA</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Status</th>
                  <th className="text-right text-caption font-medium text-muted-foreground uppercase px-4 py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contingencies.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sem contingências no período.</td></tr>
                ) : contingencies.map((c: any) => {
                  const sc = CONTINGENCY_STATUS[c.status] || CONTINGENCY_STATUS.aberta;
                  const isVencida = c.prazo_sla && new Date(c.prazo_sla) < new Date() && c.status === "aberta";
                  return (
                    <tr key={c.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-body text-foreground max-w-[200px] truncate">{c.descricao}</td>
                      <td className="px-4 py-3 text-body text-muted-foreground">{c.operational_assignments?.operational_templates?.nome || "—"}</td>
                      <td className="px-4 py-3 text-body text-muted-foreground">{c.profiles?.nome || "—"}</td>
                      <td className="px-4 py-3 text-center text-caption">{c.prazo_sla ? new Date(c.prazo_sla).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${isVencida ? CONTINGENCY_STATUS.vencida.class : sc.class}`}>
                          {isVencida ? "Vencida" : sc.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.status === "resolvida" && (
                          <Button size="sm" variant="outline" onClick={() => contingencyMgmt.validateResolution.mutate({ contingencyId: c.id, approved: true, observacao: "Validado via gestão" })}>
                            <CheckCircle2 className="w-3 h-3 mr-1" />Validar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Approval/Rejection Dialog */}
      <Dialog open={approvalDialog.open} onOpenChange={o => { if (!o) setApprovalDialog({ open: false, assignment: null, action: "aprovar" }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approvalDialog.action === "aprovar" ? "Aprovar Rotina" : "Reprovar Rotina"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-body font-medium text-foreground">{approvalDialog.assignment?.operational_templates?.nome}</p>
              <p className="text-caption text-muted-foreground">Responsável: {approvalDialog.assignment?.profiles?.nome} | Data: {approvalDialog.assignment?.data_prevista}</p>
              {approvalDialog.assignment?.pontuacao_obtida != null && (
                <p className="text-caption text-muted-foreground">Score calculado: {Math.round(approvalDialog.assignment.pontuacao_obtida)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{approvalDialog.action === "reprovar" ? "Motivo da reprovação *" : "Observação (opcional)"}</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={approvalDialog.action === "reprovar" ? "Informe o motivo..." : "Observação..."} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApprovalDialog({ open: false, assignment: null, action: "aprovar" })}>Cancelar</Button>
            <Button
              disabled={approvalFlow.finalDecision.isPending || (approvalDialog.action === "reprovar" && !motivo.trim())}
              onClick={() => {
                setApprovalAssignmentId(approvalDialog.assignment?.id);
                approvalFlow.finalDecision.mutate({
                  assignment: approvalDialog.assignment,
                  action: approvalDialog.action === "aprovar" ? "aprovar" : "reprovar_devolver",
                  motivo: motivo || undefined,
                }, {
                  onSuccess: () => {
                    qc.invalidateQueries({ queryKey: ["operational_gestao_assignments"] });
                    toast.success(approvalDialog.action === "aprovar" ? "Rotina aprovada!" : "Rotina reprovada!");
                    setApprovalDialog({ open: false, assignment: null, action: "aprovar" });
                    setMotivo("");
                    setApprovalAssignmentId(null);
                  },
                });
              }}
              className={approvalDialog.action === "aprovar" ? "" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}
            >
              {approvalFlow.finalDecision.isPending ? "Processando..." : approvalDialog.action === "aprovar" ? "Confirmar Aprovação" : "Confirmar Reprovação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={reopenDialog.open} onOpenChange={o => { if (!o) setReopenDialog({ open: false, assignment: null }); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Rotina</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-body font-medium text-foreground">{reopenDialog.assignment?.operational_templates?.nome}</p>
              <p className="text-caption text-muted-foreground">Status atual: {STATUS_CONFIG[reopenDialog.assignment?.status]?.label || reopenDialog.assignment?.status}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo da reabertura *</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo da reabertura..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialog({ open: false, assignment: null })}>Cancelar</Button>
            <Button
              disabled={reopenAssignment.isPending || !motivo.trim()}
              onClick={() => reopenAssignment.mutate({ assignmentId: reopenDialog.assignment?.id, motivo })}
            >
              {reopenAssignment.isPending ? "Processando..." : "Confirmar Reabertura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Trail Dialog */}
      <Dialog open={auditDialog.open} onOpenChange={o => { if (!o) setAuditDialog({ open: false, assignmentId: null }); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><History className="w-4 h-4" />Trilha de Auditoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {auditLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">Nenhum registro de auditoria.</p>
            ) : auditLogs.map((log: any) => (
              <div key={log.id} className="bg-muted/50 rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border bg-card">
                    {AUDIT_EVENT_LABELS[log.tipo_evento] || log.tipo_evento}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="text-caption text-muted-foreground">Por: {log.profiles?.nome || "Sistema"}</p>
                {log.motivo && <p className="text-body text-foreground">Motivo: {log.motivo}</p>}
                {log.dados_anteriores && (
                  <p className="text-caption text-muted-foreground">Anterior: {JSON.stringify(log.dados_anteriores)}</p>
                )}
                {log.dados_novos && (
                  <p className="text-caption text-muted-foreground">Novo: {JSON.stringify(log.dados_novos)}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Score Adjustment Dialog */}
      <Dialog open={scoreDialog.open} onOpenChange={o => { if (!o) { setScoreDialog({ open: false, assignment: null }); setMotivo(""); setNewScore(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4" />Ajustar Score</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-body font-medium text-foreground">{scoreDialog.assignment?.operational_templates?.nome}</p>
              <p className="text-caption text-muted-foreground">
                Responsável: {scoreDialog.assignment?.profiles?.nome} | Data: {scoreDialog.assignment?.data_prevista}
              </p>
              <p className="text-caption text-muted-foreground">
                Score atual: <span className="font-medium text-foreground">{scoreDialog.assignment?.pontuacao_obtida != null ? Math.round(scoreDialog.assignment.pontuacao_obtida) : "—"}</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Novo Score (0-100) *</Label>
              <Input type="number" min={0} max={100} value={newScore} onChange={e => setNewScore(e.target.value)} placeholder="Ex: 85" />
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa *</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Informe o motivo do ajuste..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setScoreDialog({ open: false, assignment: null }); setMotivo(""); setNewScore(""); }}>Cancelar</Button>
            <Button
              disabled={adjustScore.isPending || !motivo.trim() || !newScore}
              onClick={() => adjustScore.mutate({ assignmentId: scoreDialog.assignment?.id, score: parseInt(newScore), motivo })}
            >
              {adjustScore.isPending ? "Processando..." : "Confirmar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
