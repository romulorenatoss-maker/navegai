import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, CheckCircle2, RotateCcw, AlertTriangle, Shield, Pencil,
  Lock, History, TrendingUp, TrendingDown, Clock, XCircle, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG, CONTINGENCY_STATUS, AUDIT_EVENT_LABELS } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { SnapshotField, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";

// ── Auto-question definitions ──
interface AutoQuestion {
  id: string;
  label: string;
  autoValue: boolean;
  penalty: number;
  detail?: string;
}

function buildAutoQuestions(assignment: any, snapshot: any, contingencies: any[]): AutoQuestion[] {
  if (snapshot?.habilitar_perguntas_automaticas === false) return [];
  const questions: AutoQuestion[] = [];

  // 1. Tarefa fora do prazo?
  const foraDoPrazo = assignment?.fim_em && assignment?.horario_limite && assignment?.data_prevista
    ? new Date(assignment.fim_em) > new Date(assignment.data_prevista + "T" + assignment.horario_limite)
    : false;
  questions.push({
    id: "auto_fora_prazo",
    label: "Tarefa executada fora do prazo?",
    autoValue: foraDoPrazo,
    penalty: Number(snapshot?.penalidade_fora_prazo) || 0,
    detail: foraDoPrazo
      ? `Concluída: ${new Date(assignment.fim_em).toLocaleString("pt-BR")} | Limite: ${assignment.data_prevista} ${assignment.horario_limite}`
      : undefined,
  });

  // 2. Houve contingência?
  if (contingencies.length > 0) {
    questions.push({
      id: "auto_contingencia",
      label: "Houve contingência nesta tarefa?",
      autoValue: true,
      penalty: Number(snapshot?.penalidade_contingencia) || 0,
      detail: `${contingencies.length} contingência(s)`,
    });

    // 3. Contingência resolvida dentro do prazo?
    const resolved = contingencies.filter((c: any) => c.resolvida_em);
    const allInTime = resolved.length > 0 && resolved.every((c: any) =>
      c.dentro_prazo === true || (c.prazo_sla && new Date(c.resolvida_em) <= new Date(c.prazo_sla))
    );
    questions.push({
      id: "auto_sla_contingencia",
      label: "Contingência resolvida dentro do prazo?",
      autoValue: allInTime,
      penalty: Number(snapshot?.penalidade_sla_contingencia) || 0,
      detail: allInTime ? "Todas dentro do SLA" : "Alguma fora do SLA",
    });
  }

  return questions;
}

// ── Answer value renderer ──
function renderAnswerValue(field: SnapshotField, answer: any) {
  if (!answer) return <span className="text-muted-foreground italic text-xs">Sem resposta</span>;
  switch (field.tipo) {
    case "conforme":
    case "sim_nao":
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${answer.valor_booleano === true ? "bg-green-100 text-green-800" : answer.valor_booleano === false ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>
          {answer.valor_booleano === true ? "Conforme" : answer.valor_booleano === false ? "Não Conforme" : "—"}
        </span>
      );
    case "nota_avaliacao":
    case "numero":
      return <span className="font-mono text-sm">{answer.valor_numero ?? "—"}</span>;
    case "foto":
      return answer.evidencia_url ? (
        <img src={answer.evidencia_url} alt="Foto" className="max-h-20 rounded border cursor-pointer" onClick={() => window.open(answer.evidencia_url, "_blank")} />
      ) : <span className="text-muted-foreground text-xs">Sem foto</span>;
    default:
      return <span className="text-sm">{answer.valor_texto || "—"}</span>;
  }
}

export default function OperationalAprovacaoPage() {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("pendentes");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; action: "aprovar" | "reprovar_devolver" | "encerrar" | null }>({ open: false, action: null });
  const [decisionMotivo, setDecisionMotivo] = useState("");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const now = new Date();
  const [filterStart, setFilterStart] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [filterEnd, setFilterEnd] = useState(() => new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["aprovacao_assignments", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let query = (supabase as any).from("operational_assignments")
        .select(`*, operational_templates(nome, tipo_execucao),
          executor:profiles!operational_assignments_responsavel_id_fkey(nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(nome),
          avaliado:profiles!operational_assignments_avaliado_id_fkey(nome)`)
        .in("status", ["aguardando_aprovacao", "aprovada", "reprovada", "concluida", "devolvida"])
        .order("updated_at", { ascending: false });
      if (!isAdmin) query = query.eq("aprovador_id", profile.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  const filteredByDate = useMemo(() => {
    return assignments.filter((a: any) => {
      const d = a.data_prevista;
      if (!d) return true;
      return d >= filterStart && d <= filterEnd;
    });
  }, [assignments, filterStart, filterEnd]);

  const pendentes = filteredByDate.filter((a: any) => a.status === "aguardando_aprovacao");
  const devolvidos = filteredByDate.filter((a: any) => a.status === "devolvida");
  const aprovados = filteredByDate.filter((a: any) => a.status === "aprovada");
  const historico = filteredByDate.filter((a: any) => ["concluida", "reprovada"].includes(a.status)).slice(0, 50);

  const approval = useApprovalFlow(selectedAssignment?.id || null);

  const snapshot = selectedAssignment?.template_snapshot;
  const snapshotSections: any[] = useMemo(() => snapshot?.sections?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);
  const snapshotFields: SnapshotField[] = useMemo(() => snapshot?.fields?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);

  const answersMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const a of approval.fieldAnswers) {
      if (!map[a.field_id]) map[a.field_id] = a;
    }
    return map;
  }, [approval.fieldAnswers]);

  const reviewsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of approval.fieldReviews) {
      if (!map[r.field_id]) map[r.field_id] = r;
    }
    return map;
  }, [approval.fieldReviews]);

  const visibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  const autoQuestions = useMemo(() =>
    buildAutoQuestions(selectedAssignment, snapshot, approval.contingencies),
    [selectedAssignment, snapshot, approval.contingencies]
  );

  // ── Live score calculation ──
  const liveScore = useMemo(() => {
    let totalPeso = 0;
    let conquistado = 0;
    let respondidas = 0;
    let total = 0;

    // Manual fields from reviews
    for (const f of visibleFields) {
      const peso = f.peso ?? 1;
      const notaMax = f.nota_maxima ?? 10;
      totalPeso += peso * notaMax;
      total++;

      const rev = reviewsMap[f.id];
      if (rev?.conforme === true) {
        conquistado += peso * notaMax;
        respondidas++;
      } else if (rev?.conforme === false) {
        respondidas++;
      }
    }

    // Auto penalties
    let penaltyTotal = 0;
    for (const aq of autoQuestions) {
      // autoValue === true means the bad condition IS true (e.g. "was late? YES"), so penalty applies
      // Exception: "resolved within SLA?" → autoValue true = good, so penalty when false
      if (aq.id === "auto_sla_contingencia") {
        if (!aq.autoValue) penaltyTotal += aq.penalty;
      } else {
        if (aq.autoValue) penaltyTotal += aq.penalty;
      }
    }

    const rawScore = totalPeso > 0 ? Math.round((conquistado / totalPeso) * 100) : 0;
    const finalScore = Math.max(0, rawScore - penaltyTotal);

    return { rawScore, finalScore, penaltyTotal, respondidas, total, totalPeso, conquistado };
  }, [visibleFields, reviewsMap, autoQuestions]);

  // Section-level scores
  const sectionScores = useMemo(() => {
    return snapshotSections.map((s: any) => {
      const sFields = visibleFields.filter(f => f.section_id === s.id);
      let peso = 0, acerto = 0, conformes = 0, naoConformes = 0;
      for (const f of sFields) {
        const p = f.peso ?? 1;
        const m = f.nota_maxima ?? 10;
        peso += p * m;
        const rev = reviewsMap[f.id];
        if (rev?.conforme === true) { acerto += p * m; conformes++; }
        else if (rev?.conforme === false) naoConformes++;
      }
      return { ...s, score: peso > 0 ? Math.round((acerto / peso) * 100) : 0, conformes, naoConformes, total: sFields.length };
    });
  }, [snapshotSections, visibleFields, reviewsMap]);

  const blockingReasons = useMemo(() =>
    selectedAssignment ? approval.getBlockingReasons(selectedAssignment) : [],
    [selectedAssignment, approval.getBlockingReasons]
  );

  const openApproval = useCallback((a: any) => {
    setSelectedAssignment(a);
    setApprovalDialogOpen(true);
  }, []);

  const closeApproval = () => {
    setApprovalDialogOpen(false);
    setSelectedAssignment(null);
  };

  const handleDecision = (action: "aprovar" | "reprovar_devolver" | "encerrar") => {
    setDecisionDialog({ open: true, action });
    setDecisionMotivo("");
  };

  const confirmDecision = () => {
    if (!decisionDialog.action || !selectedAssignment) return;
    approval.finalDecision.mutate(
      {
        assignment: selectedAssignment,
        action: decisionDialog.action,
        motivo: decisionMotivo || undefined,
        scoreFinal: liveScore.finalScore,
      },
      {
        onSuccess: () => {
          setDecisionDialog({ open: false, action: null });
          closeApproval();
        },
      }
    );
  };

  const startOverride = (tipo: string, scoreOriginal: number) => {
    approval.setOverrideDraft({
      tipo,
      score_original: scoreOriginal,
      score_ajustado: scoreOriginal,
      justificativa: "",
    });
    setOverrideDialogOpen(true);
  };

  const confirmOverride = () => {
    if (!approval.overrideDraft || !approval.overrideDraft.justificativa.trim()) return;
    approval.saveOverride.mutate(approval.overrideDraft, {
      onSuccess: () => setOverrideDialogOpen(false),
    });
  };

  const isPendente = selectedAssignment?.status === "aguardando_aprovacao";

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  // ── Build ordered items: sections → fields + auto questions interleaved ──
  const orderedItems = useMemo(() => {
    const items: { type: "section"; data: any }[] | { type: "field"; data: SnapshotField }[] | { type: "auto"; data: AutoQuestion }[] = [];
    const result: ({ type: "section"; data: any } | { type: "field"; data: SnapshotField } | { type: "auto"; data: AutoQuestion })[] = [];

    if (snapshotSections.length > 0) {
      for (const section of snapshotSections) {
        const sFields = visibleFields.filter(f => f.section_id === section.id);
        if (sFields.length === 0) continue;
        result.push({ type: "section", data: section });
        for (const f of sFields) {
          result.push({ type: "field", data: f });
        }
      }
    } else {
      for (const f of visibleFields) {
        result.push({ type: "field", data: f });
      }
    }

    // Append auto questions at the end (mixed in the flow)
    for (const aq of autoQuestions) {
      result.push({ type: "auto", data: aq });
    }

    return result;
  }, [snapshotSections, visibleFields, autoQuestions]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> Aprovação Final
        </h1>
        <p className="text-sm text-muted-foreground">Avalie as respostas do checklist e aprove ou devolva a tarefa.</p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Label className="text-xs text-muted-foreground">De:</Label>
        <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-[150px] h-9 text-sm" />
        <Label className="text-xs text-muted-foreground">Até:</Label>
        <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-[150px] h-9 text-sm" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="pendentes" className="flex-1 min-w-[70px]">
            Pendentes {pendentes.length > 0 && <span className="ml-1 bg-purple-500/20 text-purple-700 px-1.5 rounded-full text-[10px]">{pendentes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="devolvidos" className="flex-1 min-w-[70px]">
            Devolvidos {devolvidos.length > 0 && <span className="ml-1 bg-amber-500/20 text-amber-700 px-1.5 rounded-full text-[10px]">{devolvidos.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="aprovados" className="flex-1 min-w-[70px]">
            Aprovados {aprovados.length > 0 && <span className="ml-1 bg-emerald-500/20 text-emerald-700 px-1.5 rounded-full text-[10px]">{aprovados.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-[70px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3">
          {isLoading ? renderEmptyState("Carregando...") : pendentes.length === 0 ? renderEmptyState("Nenhuma aprovação pendente.") : pendentes.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
        <TabsContent value="devolvidos" className="space-y-3">
          {devolvidos.length === 0 ? renderEmptyState("Nenhuma tarefa devolvida.") : devolvidos.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
        <TabsContent value="aprovados" className="space-y-3">
          {aprovados.length === 0 ? renderEmptyState("Nenhum aprovado recente.") : aprovados.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
        <TabsContent value="historico" className="space-y-3">
          {historico.length === 0 ? renderEmptyState("Nenhum histórico.") : historico.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
      </Tabs>

      {/* ── Detail Dialog ── */}
      <Dialog open={approvalDialogOpen} onOpenChange={v => { if (!v) closeApproval(); }}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeApproval}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{snapshot?.nome || "Rotina"}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>Executor: {selectedAssignment?.executor?.nome || "—"}</span>
                  <span>•</span>
                  <span>Avaliado: {selectedAssignment?.avaliado?.nome || "—"}</span>
                  <span>•</span>
                  <span>Rodada {selectedAssignment?.rodada_atual || 1}</span>
                  {selectedAssignment?.status && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CONFIG[selectedAssignment.status]?.class || ""}`}>
                      {STATUS_CONFIG[selectedAssignment.status]?.label}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── Live Score Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center col-span-2 md:col-span-1">
                <p className={`text-3xl font-bold ${liveScore.finalScore >= 80 ? "text-green-600" : liveScore.finalScore >= 50 ? "text-amber-600" : "text-destructive"}`}>
                  {liveScore.finalScore}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Final</p>
                {isPendente && (
                  <Button variant="outline" size="sm" className="mt-2 h-6 text-[10px] px-2"
                    onClick={() => startOverride("final", liveScore.finalScore)}>
                    <Pencil className="w-3 h-3 mr-1" /> Override
                  </Button>
                )}
              </div>
              <div className="rounded-lg border p-3 text-center bg-muted/30">
                <p className="text-xl font-bold text-foreground">{liveScore.rawScore}%</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Conformidade</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-muted/30">
                <p className="text-xl font-bold text-destructive">-{liveScore.penaltyTotal}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Penalidades</p>
              </div>
              <div className="rounded-lg border p-3 text-center bg-muted/30">
                <p className="text-xl font-bold text-foreground">{liveScore.respondidas}/{liveScore.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Avaliadas</p>
              </div>
            </div>

            {/* Section scores */}
            {sectionScores.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {sectionScores.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                    <span className="font-medium">{s.nome}</span>
                    <span className={`font-bold ${s.score >= 80 ? "text-green-600" : s.score >= 50 ? "text-amber-600" : "text-destructive"}`}>{s.score}%</span>
                    <span className="text-muted-foreground">✓{s.conformes} ✗{s.naoConformes}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Progresso da avaliação</span>
                <span>{liveScore.respondidas}/{liveScore.total} perguntas</span>
              </div>
              <Progress value={liveScore.total > 0 ? (liveScore.respondidas / liveScore.total) * 100 : 0} className="h-2" />
            </div>

            {/* ── Checklist Questions Flow ── */}
            <div className="space-y-3">
              {orderedItems.map((item, idx) => {
                if (item.type === "section") {
                  return (
                    <div key={item.data.id} className="flex items-center gap-2 pt-3 pb-1">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.data.cor || "#3b82f6" }} />
                      <h3 className="text-sm font-semibold text-foreground">{item.data.nome}</h3>
                    </div>
                  );
                }

                if (item.type === "auto") {
                  const aq = item.data as AutoQuestion;
                  const isGood = aq.id === "auto_sla_contingencia" ? aq.autoValue : !aq.autoValue;
                  const penaltyApplied = !isGood && aq.penalty > 0;
                  return (
                    <div key={aq.id} className={`border rounded-lg p-3 ${penaltyApplied ? "border-destructive/30 bg-destructive/5" : "border-green-300 bg-green-50/30 dark:bg-green-950/20 dark:border-green-700"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <p className="text-sm font-medium">{aq.label}</p>
                            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">Automática</span>
                          </div>
                          {aq.detail && <p className="text-xs text-muted-foreground mt-0.5 ml-5">{aq.detail}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {penaltyApplied && (
                            <span className="text-xs font-mono text-destructive font-bold">-{aq.penalty}pts</span>
                          )}
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${isGood ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                            {aq.id === "auto_sla_contingencia"
                              ? (aq.autoValue ? "SIM" : "NÃO")
                              : (aq.autoValue ? "SIM" : "NÃO")
                            }
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Field question
                const f = item.data as SnapshotField;
                const answer = answersMap[f.id];
                const rev = reviewsMap[f.id];
                const isConforme = rev?.conforme === true;
                const isNaoConforme = rev?.conforme === false;

                return (
                  <div key={f.id} className={`border rounded-lg overflow-hidden transition-colors ${isConforme ? "border-green-300 bg-green-50/30 dark:bg-green-950/20 dark:border-green-700" : isNaoConforme ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isConforme ? "bg-green-500" : isNaoConforme ? "bg-red-500" : "bg-muted-foreground/30"}`} />
                        <Label className="text-sm font-medium truncate">{f.label}</Label>
                        {f.obrigatorio && <span className="text-destructive text-xs">*</span>}
                        {f.criticidade === "critica" && <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-1.5 py-0.5 rounded">Crítico</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        <span>Peso: {f.peso ?? 1}</span>
                        <span>Máx: {f.nota_maxima ?? 10}</span>
                        {isConforme && <span className="text-green-600 font-bold">+{(f.peso ?? 1) * (f.nota_maxima ?? 10)}</span>}
                        {isNaoConforme && <span className="text-destructive font-bold">0</span>}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-3">
                      {/* Executor answer */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Resposta do Executor</p>
                          {renderAnswerValue(f, answer)}
                          {answer?.evidencia_url && f.tipo !== "foto" && (
                            <a href={answer.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1 mt-1">
                              <ExternalLink className="w-3 h-3" /> Ver evidência
                            </a>
                          )}
                        </div>

                        {/* Reviewer decision if exists */}
                        {rev && (
                          <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Avaliador</p>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${rev.conforme === true ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {rev.conforme === true ? "✓ Conforme" : "✗ Não Conforme"}
                            </span>
                            {rev.observacao && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px]">"{rev.observacao}"</p>}
                          </div>
                        )}
                      </div>

                      {/* Approver question if configured */}
                      {f.aprovador_pergunta && (
                        <div className="border-t pt-3 space-y-2">
                          <p className="text-xs font-medium text-primary">{f.aprovador_pergunta}</p>
                          <div className="flex gap-2">
                            {["conforme", "nao_conforme", "na"].map(opt => {
                              const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
                              const draft = approval.approverAnswers[f.id];
                              const current = draft?.resposta ?? existing?.resposta ?? "";
                              return (
                                <button key={opt} type="button" disabled={!isPendente}
                                  onClick={() => approval.updateApproverAnswer(f.id, { resposta: opt })}
                                  className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                    current === opt
                                      ? opt === "conforme" ? "bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400/30"
                                      : opt === "nao_conforme" ? "bg-red-100 text-red-800 border-red-300 ring-2 ring-red-400/30"
                                      : "bg-muted text-muted-foreground border-border ring-2 ring-muted-foreground/30"
                                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                                  } ${!isPendente ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                                  {opt === "conforme" ? "Conforme" : opt === "nao_conforme" ? "Não Conforme" : "N/A"}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Contingencies summary */}
            {approval.contingencies.length > 0 && (
              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Contingências ({approval.contingencies.length})
                </h4>
                <div className="space-y-1.5">
                  {approval.contingencies.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 p-2 border rounded text-xs">
                      <span className="truncate">{c.descricao}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${CONTINGENCY_STATUS[c.status]?.class || ""}`}>
                        {CONTINGENCY_STATUS[c.status]?.label || c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overrides */}
            {approval.existingOverrides.length > 0 && (
              <div className="border border-amber-200 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20 space-y-2">
                <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Overrides Aplicados
                </h4>
                {approval.existingOverrides.map((o: any) => (
                  <div key={o.id} className="text-xs">
                    <span className="font-medium">{o.tipo}: {o.score_original} → {o.score_ajustado}</span>
                    <span className={`ml-2 font-mono ${o.diferenca > 0 ? "text-green-600" : "text-destructive"}`}>
                      {o.diferenca > 0 ? "+" : ""}{o.diferenca}
                    </span>
                    <p className="text-muted-foreground">"{o.justificativa}" — {o.aprovador?.nome}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Audit trail */}
            <div className="border rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <History className="w-3 h-3" /> Histórico
              </h4>
              {approval.auditTrail.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum registro.</p>
              ) : (
                <div className="space-y-1.5">
                  {approval.auditTrail.map((evt: any) => (
                    <div key={evt.id} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium">{AUDIT_EVENT_LABELS[evt.tipo_evento] || evt.tipo_evento}</span>
                        {evt.motivo && <span className="text-muted-foreground ml-1">— "{evt.motivo}"</span>}
                        <p className="text-muted-foreground">{evt.executor?.nome || "Sistema"} • {new Date(evt.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Action Bar ── */}
          {isPendente && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              {blockingReasons.length > 0 && (
                <div className="mb-2 space-y-1">
                  {blockingReasons.map((r, i) => (
                    <p key={i} className="text-[10px] text-destructive flex items-center gap-1">
                      <Lock className="w-3 h-3" /> {r}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleDecision("reprovar_devolver")}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDecision("encerrar")}
                  className="text-muted-foreground">
                  Encerrar Manual
                </Button>
                <div className="flex-1" />
                <div className="text-sm font-bold mr-2">
                  Score: <span className={liveScore.finalScore >= 80 ? "text-green-600" : liveScore.finalScore >= 50 ? "text-amber-600" : "text-destructive"}>{liveScore.finalScore}</span>
                </div>
                <Button size="sm" onClick={() => handleDecision("aprovar")}
                  disabled={blockingReasons.length > 0}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar Final
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Decision Dialog */}
      <Dialog open={decisionDialog.open} onOpenChange={v => { if (!v) setDecisionDialog({ open: false, action: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.action === "aprovar" && "Aprovar Tarefa"}
              {decisionDialog.action === "reprovar_devolver" && "Reprovar e Devolver"}
              {decisionDialog.action === "encerrar" && "Encerrar Manualmente"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.action === "aprovar" && "A tarefa será aprovada com o score consolidado."}
              {decisionDialog.action === "reprovar_devolver" && "A tarefa será devolvida para nova avaliação."}
              {decisionDialog.action === "encerrar" && "A tarefa será encerrada manualmente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-sm">Justificativa {decisionDialog.action !== "aprovar" && <span className="text-destructive">*</span>}</Label>
            <Textarea value={decisionMotivo} onChange={e => setDecisionMotivo(e.target.value)}
              placeholder="Informe o motivo da decisão..." className="min-h-[60px]" />
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm text-center">
            <p className="font-medium">Score Final: <span className={`text-lg ${liveScore.finalScore >= 80 ? "text-green-600" : liveScore.finalScore >= 50 ? "text-amber-600" : "text-destructive"}`}>{liveScore.finalScore}</span></p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, action: null })}>Cancelar</Button>
            <Button onClick={confirmDecision}
              disabled={approval.isSaving || (decisionDialog.action !== "aprovar" && !decisionMotivo.trim())}
              variant={decisionDialog.action === "reprovar_devolver" ? "destructive" : "default"}>
              {approval.isSaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={v => { if (!v) { setOverrideDialogOpen(false); approval.setOverrideDraft(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Override de Score
            </DialogTitle>
            <DialogDescription>
              Ajuste manualmente o score. Uma justificativa será registrada na trilha de auditoria.
            </DialogDescription>
          </DialogHeader>

          {approval.overrideDraft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Score Original</Label>
                  <Input type="number" value={approval.overrideDraft.score_original} disabled className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Novo Score</Label>
                  <Input type="number" min={0} max={100}
                    value={approval.overrideDraft.score_ajustado}
                    onChange={e => approval.setOverrideDraft({ ...approval.overrideDraft!, score_ajustado: Number(e.target.value) })}
                    className="mt-1" />
                </div>
              </div>

              {approval.overrideDraft.score_ajustado !== approval.overrideDraft.score_original && (
                <div className={`flex items-center justify-center gap-2 p-2 rounded border ${approval.overrideDraft.score_ajustado > approval.overrideDraft.score_original ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-destructive"}`}>
                  {approval.overrideDraft.score_ajustado > approval.overrideDraft.score_original ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span className="text-sm font-mono font-bold">
                    {approval.overrideDraft.score_ajustado - approval.overrideDraft.score_original > 0 ? "+" : ""}
                    {approval.overrideDraft.score_ajustado - approval.overrideDraft.score_original}
                  </span>
                </div>
              )}

              <div>
                <Label className="text-xs">Justificativa <span className="text-destructive">*</span></Label>
                <Textarea value={approval.overrideDraft.justificativa}
                  onChange={e => approval.setOverrideDraft({ ...approval.overrideDraft!, justificativa: e.target.value })}
                  placeholder="Descreva o motivo do ajuste..." className="mt-1 min-h-[80px]" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOverrideDialogOpen(false); approval.setOverrideDraft(null); }}>Cancelar</Button>
            <Button onClick={confirmOverride}
              disabled={approval.isSaving || !approval.overrideDraft?.justificativa.trim()}>
              {approval.isSaving ? "Salvando..." : "Aplicar Override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
