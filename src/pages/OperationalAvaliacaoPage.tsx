import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, Play, CheckCircle2, XCircle, RotateCcw, AlertTriangle,
  Clock, ExternalLink, History, User, Users,
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
import { Switch } from "@/components/ui/switch";
import { STATUS_CONFIG, CONTINGENCY_STATUS, AUDIT_EVENT_LABELS } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { SnapshotField, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { useAssignmentReview, FieldReviewDraft } from "@/hooks/useAssignmentReview";

// ── Auto-question definitions (same as Aprovação) ──
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

  if (contingencies.length > 0) {
    questions.push({
      id: "auto_contingencia",
      label: "Houve contingência nesta tarefa?",
      autoValue: true,
      penalty: Number(snapshot?.penalidade_contingencia) || 0,
      detail: `${contingencies.length} contingência(s)`,
    });

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
    case "texto":
      return <p className="text-sm whitespace-pre-wrap">{answer.valor_texto || "—"}</p>;
    default:
      return <span className="text-sm">{answer.valor_texto || "—"}</span>;
  }
}

export default function OperationalAvaliacaoPage() {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("aguardando");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar" | null }>({ open: false, action: null });
  const [decisionMotivo, setDecisionMotivo] = useState("");
  const [contingencyModalOpen, setContingencyModalOpen] = useState(false);
  const [contingencyFieldId, setContingencyFieldId] = useState<string | null>(null);
  const [contingencyPrazo, setContingencyPrazo] = useState("");
  const [contingencyMotivo, setContingencyMotivo] = useState("");

  const now = new Date();
  const [filterStart, setFilterStart] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [filterEnd, setFilterEnd] = useState(() => new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["avaliador_assignments", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let query = (supabase as any).from("operational_assignments")
        .select(`*, operational_templates(nome, tipo_execucao),
          executor:profiles!operational_assignments_responsavel_id_fkey(nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(nome),
          avaliado:profiles!operational_assignments_avaliado_id_fkey(nome)`)
        .order("data_prevista", { ascending: true });
      if (!isAdmin) {
        query = query.or(`avaliador_id.eq.${profile.id}`);
      }
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

  const aguardando = filteredByDate.filter((a: any) => a.status === "aguardando_avaliacao");
  const emAvaliacao = filteredByDate.filter((a: any) => a.status === "em_avaliacao");
  const devolvidos = filteredByDate.filter((a: any) => a.status === "devolvida");
  const historico = filteredByDate.filter((a: any) => ["concluida", "aprovada", "aguardando_aprovacao", "reprovada"].includes(a.status)).slice(0, 50);

  const review = useAssignmentReview(selectedAssignment?.id || null);

  const snapshot = selectedAssignment?.template_snapshot;
  const snapshotSections: any[] = useMemo(() => snapshot?.sections?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);
  const snapshotFields: SnapshotField[] = useMemo(() => snapshot?.fields?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);

  const answersMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const a of review.fieldAnswers) {
      if (!map[a.field_id]) map[a.field_id] = a;
    }
    return map;
  }, [review.fieldAnswers]);

  const visibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  const autoQuestions = useMemo(() =>
    buildAutoQuestions(selectedAssignment, snapshot, review.contingencies),
    [selectedAssignment, snapshot, review.contingencies]
  );

  // ── Live score ──
  const liveScore = useMemo(() => {
    let totalPeso = 0, conquistado = 0, respondidas = 0, total = 0;
    let conformes = 0, naoConformes = 0, devolvidosCount = 0;

    for (const f of visibleFields) {
      const peso = f.peso ?? 1;
      const notaMax = f.nota_maxima ?? 10;
      totalPeso += peso * notaMax;
      total++;

      const draft = review.reviewDrafts[f.id];
      if (draft?.conforme === true) { conquistado += peso * notaMax; respondidas++; conformes++; }
      else if (draft?.conforme === false) { respondidas++; naoConformes++; if (draft?.devolvido) devolvidosCount++; }
    }

    let penaltyTotal = 0;
    for (const aq of autoQuestions) {
      if (aq.id === "auto_sla_contingencia") {
        if (!aq.autoValue) penaltyTotal += aq.penalty;
      } else {
        if (aq.autoValue) penaltyTotal += aq.penalty;
      }
    }

    const rawScore = totalPeso > 0 ? Math.round((conquistado / totalPeso) * 100) : 0;
    const finalScore = Math.max(0, rawScore - penaltyTotal);

    return { rawScore, finalScore, penaltyTotal, respondidas, total, conformes, naoConformes, devolvidosCount };
  }, [visibleFields, review.reviewDrafts, autoQuestions]);

  // Section scores
  const sectionScores = useMemo(() => {
    return snapshotSections.map((s: any) => {
      const sFields = visibleFields.filter(f => f.section_id === s.id);
      let peso = 0, acerto = 0, conformes = 0, naoConformes = 0;
      for (const f of sFields) {
        const p = f.peso ?? 1;
        const m = f.nota_maxima ?? 10;
        peso += p * m;
        const draft = review.reviewDrafts[f.id];
        if (draft?.conforme === true) { acerto += p * m; conformes++; }
        else if (draft?.conforme === false) naoConformes++;
      }
      return { ...s, score: peso > 0 ? Math.round((acerto / peso) * 100) : 0, conformes, naoConformes, total: sFields.length };
    });
  }, [snapshotSections, visibleFields, review.reviewDrafts]);

  const reviewComplete = useMemo(() =>
    review.isReviewComplete(visibleFields),
    [review.isReviewComplete, visibleFields]
  );

  // ── Build ordered items ──
  const orderedItems = useMemo(() => {
    const result: ({ type: "section"; data: any } | { type: "field"; data: SnapshotField } | { type: "auto"; data: AutoQuestion })[] = [];

    if (snapshotSections.length > 0) {
      for (const section of snapshotSections) {
        const sFields = visibleFields.filter(f => f.section_id === section.id);
        if (sFields.length === 0) continue;
        result.push({ type: "section", data: section });
        for (const f of sFields) result.push({ type: "field", data: f });
      }
    } else {
      for (const f of visibleFields) result.push({ type: "field", data: f });
    }

    for (const aq of autoQuestions) result.push({ type: "auto", data: aq });
    return result;
  }, [snapshotSections, visibleFields, autoQuestions]);

  const openReview = useCallback((a: any) => {
    setSelectedAssignment(a);
    setReviewDialogOpen(true);
  }, []);

  const closeReview = () => {
    setReviewDialogOpen(false);
    setSelectedAssignment(null);
  };

  const handleStartEvaluation = () => {
    if (selectedAssignment) review.startEvaluation.mutate(selectedAssignment.id);
  };

  const handleDecision = (action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar") => {
    if (action === "devolver_total") {
      for (const f of visibleFields) {
        const draft = review.reviewDrafts[f.id];
        if (draft?.conforme === false) review.updateReview(f.id, { devolvido: true });
      }
    }
    setDecisionDialog({ open: true, action });
    setDecisionMotivo("");
  };

  const confirmDecision = () => {
    if (!decisionDialog.action || !selectedAssignment) return;
    review.saveReviews.mutate(
      { assignment: selectedAssignment, fields: snapshotFields, action: decisionDialog.action, motivo: decisionMotivo || undefined },
      { onSuccess: () => { setDecisionDialog({ open: false, action: null }); closeReview(); } }
    );
  };

  const isReviewable = selectedAssignment && ["aguardando_avaliacao", "em_avaliacao"].includes(selectedAssignment.status);
  const isActive = isReviewable && selectedAssignment?.status !== "aguardando_avaliacao";

  const handleNaoConformeClick = (field: SnapshotField) => {
    review.updateReview(field.id, { conforme: false });
    const optionRules = Array.isArray((field as any).opcoes_regras) ? (field as any).opcoes_regras : [];
    const triggers = field.gera_contingencia || (
      field.tipo === "conforme"
        ? answersMap[field.id]?.valor_booleano === false && optionRules.some((r: any) => r?.valor === "nao_conforme" && r?.gera_contingencia)
        : field.tipo === "sim_nao"
          ? answersMap[field.id]?.valor_booleano === false && optionRules.some((r: any) => r?.valor === "nao" && r?.gera_contingencia)
          : false
    );
    if (triggers && review.registerContingencyData) {
      setContingencyFieldId(field.id);
      setContingencyPrazo(new Date(Date.now() + 24 * 3600000).toISOString().slice(0, 16));
      setContingencyMotivo("");
      setContingencyModalOpen(true);
    }
  };

  const handleContingencyConfirm = () => {
    if (!contingencyPrazo || !contingencyMotivo.trim() || !contingencyFieldId) return;
    review.registerContingencyData?.(contingencyFieldId, contingencyPrazo, contingencyMotivo);
    setContingencyModalOpen(false);
    setContingencyFieldId(null);
  };

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Avaliação Operacional
        </h1>
        <p className="text-sm text-muted-foreground">Revise formulários e atribua conformidade por campo.</p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Label className="text-xs text-muted-foreground">De:</Label>
        <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-[150px] h-9 text-sm" />
        <Label className="text-xs text-muted-foreground">Até:</Label>
        <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-[150px] h-9 text-sm" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="aguardando" className="flex-1 min-w-[70px]">
            Aguardando {aguardando.length > 0 && <span className="ml-1 bg-indigo-500/20 text-indigo-700 px-1.5 rounded-full text-[10px]">{aguardando.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="em_avaliacao" className="flex-1 min-w-[70px]">
            Em Avaliação {emAvaliacao.length > 0 && <span className="ml-1 bg-violet-500/20 text-violet-700 px-1.5 rounded-full text-[10px]">{emAvaliacao.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="devolvidos" className="flex-1 min-w-[70px]">
            Devolvidos {devolvidos.length > 0 && <span className="ml-1 bg-amber-500/20 text-amber-700 px-1.5 rounded-full text-[10px]">{devolvidos.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-[70px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="aguardando" className="space-y-3">
          {isLoading ? renderEmptyState("Carregando...") : aguardando.length === 0 ? renderEmptyState("Nenhuma avaliação pendente.") : aguardando.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openReview} />)}
        </TabsContent>
        <TabsContent value="em_avaliacao" className="space-y-3">
          {emAvaliacao.length === 0 ? renderEmptyState("Nenhuma avaliação em andamento.") : emAvaliacao.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openReview} />)}
        </TabsContent>
        <TabsContent value="devolvidos" className="space-y-3">
          {devolvidos.length === 0 ? renderEmptyState("Nenhum devolvido.") : devolvidos.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openReview} />)}
        </TabsContent>
        <TabsContent value="historico" className="space-y-3">
          {historico.length === 0 ? renderEmptyState("Nenhum histórico.") : historico.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openReview} />)}
        </TabsContent>
      </Tabs>

      {/* ── Detail Dialog ── */}
      <Dialog open={reviewDialogOpen} onOpenChange={v => { if (!v) closeReview(); }}>
        <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header with Avaliador / Avaliado */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeReview}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{snapshot?.nome || "Rotina"}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> Avaliador: <strong className="text-foreground">{selectedAssignment?.avaliador?.nome || "—"}</strong></span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> Avaliado: <strong className="text-foreground">{selectedAssignment?.avaliado?.nome || "—"}</strong></span>
                  <span>•</span>
                  <span>Executor: {selectedAssignment?.executor?.nome || "—"}</span>
                  {selectedAssignment?.rodada_atual > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <RotateCcw className="w-3 h-3" /> Rodada {selectedAssignment.rodada_atual}
                    </span>
                  )}
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
            {/* Start evaluation prompt */}
            {selectedAssignment?.status === "aguardando_avaliacao" && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Inicie a avaliação para revisar os campos.</p>
                <Button onClick={handleStartEvaluation} disabled={review.startEvaluation.isPending}>
                  <Play className="w-4 h-4 mr-2" /> Iniciar Avaliação
                </Button>
              </div>
            )}

            {/* Active review: score cards + questions + evidence */}
            {(isActive || !isReviewable) && (
              <>
                {/* ── Live Score Summary ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center col-span-2 md:col-span-1">
                    <p className={`text-3xl font-bold ${liveScore.finalScore >= 80 ? "text-green-600" : liveScore.finalScore >= 50 ? "text-amber-600" : "text-destructive"}`}>
                      {liveScore.finalScore}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Final</p>
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

                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Progresso da avaliação</span>
                    <span>{liveScore.respondidas}/{liveScore.total} perguntas</span>
                  </div>
                  <Progress value={liveScore.total > 0 ? (liveScore.respondidas / liveScore.total) * 100 : 0} className="h-2" />
                </div>

                {/* ── Checklist Questions Flow ── */}
                <div className="space-y-3">
                  {orderedItems.map((item) => {
                    if (item.type === "section") {
                      return (
                        <div key={item.data.id} className="flex items-center justify-between pt-3 pb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.data.cor || "#3b82f6" }} />
                            <h3 className="text-sm font-semibold text-foreground">{item.data.nome}</h3>
                          </div>
                          {isActive && (
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => {
                                const sFields = visibleFields.filter(f => f.section_id === item.data.id);
                                review.markSectionConforme(sFields);
                              }}
                              className="text-[10px] h-7 px-2">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Tudo Conforme
                            </Button>
                          )}
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
                              {penaltyApplied && <span className="text-xs font-mono text-destructive font-bold">-{aq.penalty}pts</span>}
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${isGood ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                                {aq.autoValue ? "SIM" : "NÃO"}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Field question
                    const f = item.data as SnapshotField;
                    const answer = answersMap[f.id];
                    const draft = review.reviewDrafts[f.id] || { field_id: f.id, conforme: null, observacao: "", devolvido: false, motivo_devolucao: "" };
                    const isConforme = draft.conforme === true;
                    const isNaoConforme = draft.conforme === false;
                    const executorNaoConforme = (f.tipo === "conforme" || f.tipo === "sim_nao") && answer?.valor_booleano === false;
                    const disabled = !isActive;

                    return (
                      <div key={f.id} className={`border rounded-lg overflow-hidden transition-colors ${isConforme ? "border-green-300 bg-green-50/30 dark:bg-green-950/20 dark:border-green-700" : isNaoConforme ? "border-destructive/30 bg-destructive/5" : executorNaoConforme ? "border-orange-300 bg-orange-50/20" : "border-border bg-card"}`}>
                        {/* Alert for executor não conforme */}
                        {executorNaoConforme && draft.conforme === null && (
                          <div className="bg-orange-100 border-b border-orange-200 px-3 py-1.5 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-700" />
                            <span className="text-[11px] font-medium text-orange-800">Executor marcou como Não Conforme — requer avaliação</span>
                          </div>
                        )}

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
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Resposta do Executor</p>
                            {renderAnswerValue(f, answer)}
                            {answer?.evidencia_url && f.tipo !== "foto" && (
                              <a href={answer.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1 mt-1">
                                <ExternalLink className="w-3 h-3" /> Ver evidência
                              </a>
                            )}
                          </div>

                          {/* Avaliação buttons */}
                          <div className="space-y-2">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Avaliação</p>
                            <div className="flex gap-2">
                              <button type="button" disabled={disabled}
                                onClick={() => review.updateReview(f.id, { conforme: true, devolvido: false, motivo_devolucao: "" })}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${isConforme ? "bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400/30" : "bg-card border-border text-muted-foreground hover:bg-green-50"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                                <CheckCircle2 className="w-3.5 h-3.5" /> Conforme
                              </button>
                              <button type="button" disabled={disabled}
                                onClick={() => handleNaoConformeClick(f)}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${isNaoConforme ? "bg-red-100 text-red-800 border-red-300 ring-2 ring-red-400/30" : "bg-card border-border text-muted-foreground hover:bg-red-50"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                                <XCircle className="w-3.5 h-3.5" /> Não Conforme
                              </button>
                            </div>

                            <Textarea placeholder="Observação do avaliador..." value={draft.observacao} disabled={disabled}
                              onChange={e => review.updateReview(f.id, { observacao: e.target.value })}
                              className="text-xs min-h-[40px]" maxLength={2000} />

                            {isNaoConforme && (
                              <div className="space-y-2 p-2 bg-amber-50 border border-amber-200 rounded">
                                <div className="flex items-center gap-2">
                                  <Switch checked={draft.devolvido} disabled={disabled}
                                    onCheckedChange={v => review.updateReview(f.id, { devolvido: v })} />
                                  <Label className="text-xs text-amber-800 flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Devolver campo</Label>
                                </div>
                                {draft.devolvido && (
                                  <Textarea placeholder="Motivo da devolução..." value={draft.motivo_devolucao} disabled={disabled}
                                    onChange={e => review.updateReview(f.id, { motivo_devolucao: e.target.value })}
                                    className="text-xs min-h-[30px] border-amber-300" />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── Detalhes da Tarefa (evidence, contingencies, history) ── */}
                <div className="border-t border-border pt-4 mt-4 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <History className="w-4 h-4" /> Detalhes da Tarefa
                  </h3>

                  {/* All field answers summary */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Respostas do Executor</h4>
                    <div className="space-y-2">
                      {visibleFields.map(f => {
                        const ans = answersMap[f.id];
                        return (
                          <div key={f.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-border/30 last:border-0">
                            <span className="text-xs font-medium text-foreground">{f.label}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {renderAnswerValue(f, ans)}
                              {ans?.evidencia_url && (
                                <a href={ans.evidencia_url} target="_blank" rel="noreferrer" className="text-primary">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Contingencies */}
                  {review.contingencies.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Contingências ({review.contingencies.length})
                      </h4>
                      <div className="space-y-1.5">
                        {review.contingencies.map((c: any) => (
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

                  {/* Assignment info */}
                  <div className="border rounded-lg p-3 space-y-1.5 text-xs">
                    <h4 className="font-semibold text-muted-foreground uppercase tracking-wider">Informações</h4>
                    <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                      <span>Data Prevista:</span><span className="text-foreground">{selectedAssignment?.data_prevista || "—"}</span>
                      <span>Início:</span><span className="text-foreground">{selectedAssignment?.inicio_em ? new Date(selectedAssignment.inicio_em).toLocaleString("pt-BR") : "—"}</span>
                      <span>Fim:</span><span className="text-foreground">{selectedAssignment?.fim_em ? new Date(selectedAssignment.fim_em).toLocaleString("pt-BR") : "—"}</span>
                      <span>Tempo Gasto:</span><span className="text-foreground">{selectedAssignment?.tempo_gasto_minutos ? `${selectedAssignment.tempo_gasto_minutos} min` : "—"}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Action Bar ── */}
          {isActive && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              {!reviewComplete && (
                <p className="text-[10px] text-amber-600 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Revise todos os campos obrigatórios antes de tomar uma decisão.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleDecision("devolver_parcial")}
                  disabled={!reviewComplete} className="text-amber-700 border-amber-300 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver Parcial
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDecision("devolver_total")}
                  disabled={!reviewComplete} className="text-amber-700 border-amber-300 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver Total
                </Button>
                <div className="flex-1" />
                <div className="text-sm font-bold mr-2">
                  Score: <span className={liveScore.finalScore >= 80 ? "text-green-600" : liveScore.finalScore >= 50 ? "text-amber-600" : "text-destructive"}>{liveScore.finalScore}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleDecision("reprovar")}
                  disabled={!reviewComplete} className="text-red-700 border-red-300 hover:bg-red-50">
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                </Button>
                <Button size="sm" onClick={() => handleDecision("aprovar")} disabled={!reviewComplete}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Decision Confirmation Dialog */}
      <Dialog open={decisionDialog.open} onOpenChange={v => { if (!v) setDecisionDialog({ open: false, action: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.action === "aprovar" && "Aprovar Avaliação"}
              {decisionDialog.action === "devolver_parcial" && "Devolver Parcialmente"}
              {decisionDialog.action === "devolver_total" && "Devolver Totalmente"}
              {decisionDialog.action === "reprovar" && "Reprovar Assignment"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.action === "aprovar" && "Confirma que todos os campos estão conformes?"}
              {decisionDialog.action === "devolver_parcial" && "Os campos marcados como devolvidos serão reenviados ao executor."}
              {decisionDialog.action === "devolver_total" && "Todos os campos não conformes serão devolvidos ao executor."}
              {decisionDialog.action === "reprovar" && "O assignment será marcado como reprovado permanentemente."}
            </DialogDescription>
          </DialogHeader>

          {(decisionDialog.action === "reprovar" || decisionDialog.action === "devolver_total" || decisionDialog.action === "devolver_parcial") && (
            <div className="space-y-2">
              <Label className="text-sm">Justificativa</Label>
              <Textarea value={decisionMotivo} onChange={e => setDecisionMotivo(e.target.value)}
                placeholder="Informe o motivo..." className="min-h-[60px]" />
            </div>
          )}

          <div className="bg-muted/50 rounded-lg p-3 text-sm text-center">
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
              <div><p className="text-green-600 font-semibold text-lg">{liveScore.conformes}</p><p className="text-muted-foreground">Conformes</p></div>
              <div><p className="text-red-600 font-semibold text-lg">{liveScore.naoConformes}</p><p className="text-muted-foreground">Não Conformes</p></div>
              <div><p className="text-amber-600 font-semibold text-lg">{liveScore.devolvidosCount}</p><p className="text-muted-foreground">Devolvidos</p></div>
            </div>
            <p className="font-semibold">Score: {liveScore.finalScore}%</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, action: null })}>Cancelar</Button>
            <Button onClick={confirmDecision} disabled={review.isSaving}
              variant={decisionDialog.action === "reprovar" ? "destructive" : "default"}>
              {review.isSaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contingency Modal */}
      <Dialog open={contingencyModalOpen} onOpenChange={setContingencyModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-600" /> Enviar para Contingência?
            </DialogTitle>
            <DialogDescription>
              O campo foi marcado como Não Conforme. Deseja criar uma contingência formal para correção?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Prazo de correção <span className="text-destructive">*</span></Label>
              <Input type="datetime-local" value={contingencyPrazo} onChange={e => setContingencyPrazo(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Motivo / Instrução de correção <span className="text-destructive">*</span></Label>
              <Textarea value={contingencyMotivo} onChange={e => setContingencyMotivo(e.target.value)}
                placeholder="Descreva o que deve ser corrigido..." className="min-h-[80px] text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContingencyModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleContingencyConfirm} disabled={!contingencyPrazo || !contingencyMotivo.trim()}
              className="bg-orange-600 hover:bg-orange-700 text-white">
              Criar Contingência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
