import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, CheckCircle2, RotateCcw, AlertTriangle, Shield,
  Lock, History, ExternalLink, Check, Users, User, MessageSquare, Pencil, X,
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
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, CONTINGENCY_STATUS, AUDIT_EVENT_LABELS } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { SnapshotField, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";

type ApprovalAnswer = "conforme" | "nao_conforme" | "na" | "";

// ── Segmented Control (same pattern as AvaliacaoOSPage) ──
const ApprovalSegmentedControl = ({ value, onChange, disabled }: { value: ApprovalAnswer; onChange: (v: ApprovalAnswer) => void; disabled?: boolean }) => {
  const options: { label: string; value: ApprovalAnswer; activeColor: string }[] = [
    { label: "Conforme", value: "conforme", activeColor: "bg-success text-success-foreground" },
    { label: "Não Conforme", value: "nao_conforme", activeColor: "bg-destructive text-destructive-foreground" },
    { label: "N/A", value: "na", activeColor: "bg-warning text-warning-foreground" },
  ];
  return (
    <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => !disabled && onChange(opt.value)} disabled={disabled}
          className={cn(
            "px-3 sm:px-4 py-2 rounded text-sm font-medium transition-all duration-150 press-effect min-w-[52px]",
            value === opt.value ? opt.activeColor : "text-foreground hover:bg-background/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}>
          {opt.label}
        </button>
      ))}
    </div>
  );
};

// ── Answer value renderer ──
function renderAnswerValue(field: SnapshotField, answer: any) {
  if (!answer) return <span className="text-muted-foreground italic text-xs">Sem resposta</span>;
  switch (field.tipo) {
    case "conforme":
    case "sim_nao":
      return (
        <span className={cn(
          "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
          answer.valor_booleano === true ? "border-success/40 bg-success/10 text-success" :
          answer.valor_booleano === false ? "border-destructive/40 bg-destructive/10 text-destructive" :
          "border-muted-foreground/30 bg-muted text-muted-foreground"
        )}>
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
  const now = new Date();
  const [filterStart, setFilterStart] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [filterEnd, setFilterEnd] = useState(() => new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));

  // Editable auto answers state: overrides + justifications
  const [autoOverrides, setAutoOverrides] = useState<Record<string, { resposta: ApprovalAnswer; justificativa: string }>>({});
  const [editingAutoId, setEditingAutoId] = useState<string | null>(null);
  const [editAutoJustificativa, setEditAutoJustificativa] = useState("");

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
  const aprovados = filteredByDate.filter((a: any) => a.status === "aprovada");
  const historico = filteredByDate.filter((a: any) => ["concluida", "reprovada", "devolvida"].includes(a.status)).slice(0, 50);

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

  // All visible fields (for full scoring summary display)
  const allVisibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  // Fields with aprovador_verificar (interactive approval questions)
  const approvalFields = useMemo(() =>
    allVisibleFields.filter(f => f.aprovador_verificar),
    [allVisibleFields]
  );

  // Auto-questions from template (when habilitar_perguntas_automaticas is enabled)
  const habilitarAuto = snapshot?.habilitar_perguntas_automaticas !== false;
  const autoQuestions = useMemo(() => {
    if (!habilitarAuto) return [];
    return [
      { id: "__auto_fora_prazo", label: "Tarefa executada fora do prazo?", pontos: snapshot?.penalidade_fora_prazo ?? 20, key: "fora_prazo" },
      { id: "__auto_contingencia", label: "Houve contingência nesta tarefa?", pontos: snapshot?.penalidade_contingencia ?? 10, key: "contingencia" },
      { id: "__auto_sla_contingencia", label: "Contingência resolvida dentro do prazo?", pontos: snapshot?.penalidade_sla_contingencia ?? 15, key: "sla_contingencia" },
    ];
  }, [habilitarAuto, snapshot]);

  // Auto-question pre-filled answers based on actual task data
  const autoComputedAnswers = useMemo(() => {
    const answers: Record<string, { resposta: ApprovalAnswer; detail: string }> = {};
    if (!selectedAssignment || !habilitarAuto) return answers;

    const foraDoP = selectedAssignment.fim_em && selectedAssignment.horario_limite
      ? new Date(selectedAssignment.fim_em).toTimeString().slice(0, 5) > selectedAssignment.horario_limite
      : false;
    answers["__auto_fora_prazo"] = {
      resposta: foraDoP ? "nao_conforme" : "conforme",
      detail: foraDoP ? "Tarefa finalizada após o horário limite" : "Tarefa finalizada dentro do prazo",
    };

    const hasContingency = approval.contingencies.length > 0;
    answers["__auto_contingencia"] = {
      resposta: hasContingency ? "nao_conforme" : "conforme",
      detail: hasContingency ? `${approval.contingencies.length} contingência(s) registrada(s)` : "Nenhuma contingência",
    };

    const openOrLate = approval.contingencies.filter((c: any) =>
      !["validada", "descartada"].includes(c.status) || c.dentro_prazo === false
    );
    answers["__auto_sla_contingencia"] = {
      resposta: !hasContingency ? "na" : openOrLate.length > 0 ? "nao_conforme" : "conforme",
      detail: !hasContingency ? "Sem contingências para avaliar" : openOrLate.length > 0 ? "Contingência(s) fora do prazo ou pendente(s)" : "Todas resolvidas dentro do SLA",
    };

    return answers;
  }, [selectedAssignment, habilitarAuto, approval.contingencies]);

  // Effective auto answers = computed merged with overrides
  const autoAnswers = useMemo(() => {
    const result: Record<string, { resposta: ApprovalAnswer; detail: string; overridden: boolean; justificativa?: string }> = {};
    for (const [key, val] of Object.entries(autoComputedAnswers)) {
      const override = autoOverrides[key];
      if (override) {
        result[key] = { resposta: override.resposta, detail: `Alterado manualmente`, overridden: true, justificativa: override.justificativa };
      } else {
        result[key] = { ...val, overridden: false };
      }
    }
    return result;
  }, [autoComputedAnswers, autoOverrides]);

  // Total items = auto questions + approval fields
  const totalQuestions = autoQuestions.length + approvalFields.length;

  // Score calculation: sum points from auto + manual
  const scoreCalc = useMemo(() => {
    let totalPontos = 0;
    let perdidos = 0;

    for (const aq of autoQuestions) {
      totalPontos += aq.pontos;
      const resp = autoAnswers[aq.id]?.resposta || "";
      if (resp === "nao_conforme") perdidos += aq.pontos;
    }

    for (const f of approvalFields) {
      const peso = f.aprovador_peso || f.peso || 1;
      totalPontos += peso;
      const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const draft = approval.approverAnswers[f.id];
      const resp = draft?.resposta || existing?.resposta || "";
      if (resp === "nao_conforme") perdidos += peso;
    }

    const score = totalPontos > 0 ? Math.max(0, Math.round(((totalPontos - perdidos) / totalPontos) * 100)) : 100;
    return { totalPontos, perdidos, score };
  }, [autoQuestions, autoAnswers, approvalFields, approval.approverAnswers, approval.existingApprovalAnswers]);

  // Progress
  const progress = useMemo(() => {
    let respondidas = autoQuestions.length, total = totalQuestions, conformes = 0, naoConformes = 0;
    for (const aq of autoQuestions) {
      const resp = autoAnswers[aq.id]?.resposta || "";
      if (resp === "conforme") conformes++;
      if (resp === "nao_conforme") naoConformes++;
    }
    for (const f of approvalFields) {
      const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const draft = approval.approverAnswers[f.id];
      const resp = draft?.resposta || existing?.resposta || "";
      if (resp) {
        respondidas++;
        if (resp === "conforme") conformes++;
        if (resp === "nao_conforme") naoConformes++;
      }
    }
    return { respondidas, total, conformes, naoConformes };
  }, [autoQuestions, autoAnswers, approvalFields, approval.approverAnswers, approval.existingApprovalAnswers, totalQuestions]);

  const progressPercent = progress.total > 0 ? Math.round((progress.respondidas / progress.total) * 100) : 0;

  const blockingReasons = useMemo(() =>
    selectedAssignment ? approval.getBlockingReasons(selectedAssignment) : [],
    [selectedAssignment, approval.getBlockingReasons]
  );

  // ── Build ordered items: auto questions first, then approval fields by section ──
  const orderedItems = useMemo(() => {
    const result: ({ type: "section"; data: any } | { type: "field"; data: SnapshotField } | { type: "auto"; data: any } | { type: "field_readonly"; data: SnapshotField })[] = [];

    // Auto questions section
    if (autoQuestions.length > 0) {
      result.push({ type: "section", data: { id: "__auto_section", nome: "Perguntas do Avaliador", cor: null } });
      for (const aq of autoQuestions) result.push({ type: "auto", data: aq });
    }

    // ALL template fields by section (like scoring summary)
    if (snapshotSections.length > 0) {
      for (const section of snapshotSections) {
        const sFields = allVisibleFields.filter(f => f.section_id === section.id);
        if (sFields.length === 0) continue;
        result.push({ type: "section", data: section });
        for (const f of sFields) {
          result.push(f.aprovador_verificar ? { type: "field", data: f } : { type: "field_readonly", data: f });
        }
      }
      const orphans = allVisibleFields.filter(f => !f.section_id || !snapshotSections.find((s: any) => s.id === f.section_id));
      if (orphans.length > 0) {
        result.push({ type: "section", data: { id: "__orphan", nome: "Perguntas do Template", cor: null } });
        for (const f of orphans) {
          result.push(f.aprovador_verificar ? { type: "field", data: f } : { type: "field_readonly", data: f });
        }
      }
    } else if (allVisibleFields.length > 0) {
      result.push({ type: "section", data: { id: "__all", nome: "Perguntas do Template", cor: null } });
      for (const f of allVisibleFields) {
        result.push(f.aprovador_verificar ? { type: "field", data: f } : { type: "field_readonly", data: f });
      }
    }
    return result;
  }, [autoQuestions, snapshotSections, allVisibleFields]);

  // Section scores (count all fields per section now)
  const sectionScores = useMemo(() => {
    const scores: Record<string, { answered: number; total: number; conformes: number; naoConformes: number }> = {};
    for (const section of snapshotSections) {
      const sFields = allVisibleFields.filter(f => f.section_id === section.id);
      if (sFields.length === 0) continue;
      let answered = 0, conformes = 0, naoConformes = 0;
      for (const f of sFields) {
        const answer = answersMap[f.id];
        const rev = reviewsMap[f.id];
        if (f.aprovador_verificar) {
          const resp = approval.approverAnswers[f.id]?.resposta || approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta || "";
          if (resp) { answered++; if (resp === "conforme") conformes++; if (resp === "nao_conforme") naoConformes++; }
        } else {
          // For read-only fields, use evaluator review
          if (rev) {
            answered++;
            if (rev.conforme === true) conformes++;
            if (rev.conforme === false) naoConformes++;
          } else if (answer) {
            answered++;
            if (answer.valor_booleano === true) conformes++;
            if (answer.valor_booleano === false) naoConformes++;
          }
        }
      }
      scores[section.id] = { answered, total: sFields.length, conformes, naoConformes };
    }
    return scores;
  }, [snapshotSections, allVisibleFields, answersMap, reviewsMap, approval.approverAnswers, approval.existingApprovalAnswers]);

  const openApproval = useCallback((a: any) => {
    setSelectedAssignment(a);
    setApprovalDialogOpen(true);
    setAutoOverrides({});
    setEditingAutoId(null);
  }, []);

  const closeApproval = () => {
    setApprovalDialogOpen(false);
    setSelectedAssignment(null);
    setAutoOverrides({});
    setEditingAutoId(null);
  };

  const handleDecision = (action: "aprovar" | "reprovar_devolver" | "encerrar") => {
    setDecisionDialog({ open: true, action });
    setDecisionMotivo("");
  };

  const confirmDecision = () => {
    if (!decisionDialog.action || !selectedAssignment) return;
    approval.finalDecision.mutate(
      { assignment: selectedAssignment, action: decisionDialog.action, motivo: decisionMotivo || undefined },
      { onSuccess: () => { setDecisionDialog({ open: false, action: null }); closeApproval(); } }
    );
  };

  const startEditAuto = (aqId: string) => {
    setEditingAutoId(aqId);
    setEditAutoJustificativa(autoOverrides[aqId]?.justificativa || "");
  };

  const confirmEditAuto = (aqId: string, newResposta: ApprovalAnswer) => {
    if (!editAutoJustificativa.trim()) return;
    setAutoOverrides(prev => ({
      ...prev,
      [aqId]: { resposta: newResposta, justificativa: editAutoJustificativa.trim() },
    }));
    setEditingAutoId(null);
    setEditAutoJustificativa("");
  };

  const cancelEditAuto = () => {
    setEditingAutoId(null);
    setEditAutoJustificativa("");
  };

  const isPendente = selectedAssignment?.status === "aguardando_aprovacao";

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  let globalQuestionIdx = 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> Aprovação Final
        </h1>
        <p className="text-sm text-muted-foreground">Avalie as perguntas do checklist e aprove ou devolva a tarefa.</p>
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
          <TabsTrigger value="aprovados" className="flex-1 min-w-[70px]">
            Aprovados {aprovados.length > 0 && <span className="ml-1 bg-emerald-500/20 text-emerald-700 px-1.5 rounded-full text-[10px]">{aprovados.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-[70px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3">
          {isLoading ? renderEmptyState("Carregando...") : pendentes.length === 0 ? renderEmptyState("Nenhuma aprovação pendente.") : pendentes.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
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
          <div className="bg-card border-b border-border p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 mt-0.5" onClick={closeApproval}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{snapshot?.nome || "Rotina"}</h2>
                  <p className="text-caption text-muted-foreground mt-0.5">
                    Tarefa #{selectedAssignment?.numero_tarefa} • Rodada {selectedAssignment?.rodada_atual || 1}
                  </p>
                </div>
              </div>
              {selectedAssignment?.status && (
                <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", STATUS_CONFIG[selectedAssignment.status]?.class || "")}>
                  {STATUS_CONFIG[selectedAssignment.status]?.label}
                </span>
              )}
            </div>

            {/* Avaliador + Avaliado info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-border text-sm">
              <div>
                <span className="text-muted-foreground">Executor:</span>
                <p className="font-medium text-foreground">{selectedAssignment?.executor?.nome || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Avaliador:</span>
                <p className="font-medium text-foreground">{selectedAssignment?.avaliador?.nome || "—"}</p>
                {selectedAssignment?.score_avaliador != null && (
                  <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold mt-0.5",
                    selectedAssignment.score_avaliador >= 85 ? "bg-success/10 text-success" :
                    selectedAssignment.score_avaliador >= 75 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                  )}>
                    Nota: {Number(selectedAssignment.score_avaliador).toFixed(1)}%
                  </span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Avaliado:</span>
                <p className="font-medium text-foreground">{selectedAssignment?.avaliado?.nome || "—"}</p>
                {selectedAssignment?.score_avaliado != null && (
                  <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold mt-0.5",
                    selectedAssignment.score_avaliado >= 85 ? "bg-success/10 text-success" :
                    selectedAssignment.score_avaliado >= 75 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                  )}>
                    Nota: {Number(selectedAssignment.score_avaliado).toFixed(1)}%
                  </span>
                )}
                {/* Score da aprovação (soma dos pontos) */}
                <div className="mt-1">
                  <span className={cn("inline-flex items-center px-2 py-1 rounded text-xs font-bold border",
                    scoreCalc.score >= 85 ? "border-success/40 bg-success/10 text-success" :
                    scoreCalc.score >= 75 ? "border-warning/40 bg-warning/10 text-warning" :
                    "border-destructive/40 bg-destructive/10 text-destructive"
                  )}>
                    Aprovação: {scoreCalc.score}% ({scoreCalc.totalPontos - scoreCalc.perdidos}/{scoreCalc.totalPontos} pts)
                  </span>
                </div>
              </div>
            </div>

            {/* Task info */}
            <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>Data Prevista:</span><span className="text-foreground">{selectedAssignment?.data_prevista || "—"}</span>
                <span>Início:</span><span className="text-foreground">{selectedAssignment?.inicio_em ? new Date(selectedAssignment.inicio_em).toLocaleString("pt-BR") : "—"}</span>
                <span>Fim:</span><span className="text-foreground">{selectedAssignment?.fim_em ? new Date(selectedAssignment.fim_em).toLocaleString("pt-BR") : "—"}</span>
                <span>Tempo Gasto:</span><span className="text-foreground">{selectedAssignment?.tempo_gasto_minutos ? `${selectedAssignment.tempo_gasto_minutos} min` : "—"}</span>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* Progress Bar */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Progresso da Aprovação</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground font-tabular">{progressPercent}%</span>
                  <span className="text-caption text-muted-foreground font-tabular">({progress.respondidas}/{progress.total} perguntas)</span>
                </div>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>

            {/* Empty state */}
            {orderedItems.length === 0 && (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground">Nenhuma pergunta de aprovação configurada neste template.</p>
                <p className="text-xs mt-1 text-muted-foreground">Habilite perguntas automáticas ou configure campos com "Pergunta do Aprovador" no template.</p>
              </div>
            )}

            {/* Resumo de Pontuação do Template — table format */}
            {orderedItems.length > 0 && (() => {
              globalQuestionIdx = 0;

              // Compute subtotals
              const subtotalPenalidades = autoQuestions.reduce((sum, aq) => {
                const resp = autoAnswers[aq.id]?.resposta || "";
                return sum + (resp === "nao_conforme" ? -aq.pontos : 0);
              }, 0);
              const subtotalCampos = allVisibleFields.reduce((sum, f) => sum + (f.aprovador_peso || f.peso || 1), 0);
              const pontosTotais = autoQuestions.reduce((s, aq) => s + aq.pontos, 0) + subtotalCampos;

              return (
                <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Resumo de Pontuação do Template</h3>
                  </div>

                  {/* Table header */}
                  <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
                    <span>#</span>
                    <span>Pergunta / Campo</span>
                    <span className="text-center">Tipo</span>
                    <span className="text-right">Pontos</span>
                  </div>

                  {/* Auto questions rows */}
                  {autoQuestions.map((aq) => {
                    globalQuestionIdx++;
                    const idx = globalQuestionIdx;
                    const autoAns = autoAnswers[aq.id];
                    const effectiveResp = autoAns?.resposta || "";
                    const isConf = effectiveResp === "conforme";
                    const isNaoConf = effectiveResp === "nao_conforme";
                    const isEditing = editingAutoId === aq.id;
                    const penaltyApplied = isNaoConf;

                    return (
                      <div key={aq.id} className={cn("border-b border-border transition-colors", isNaoConf ? "bg-destructive/5" : "")}>
                        <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-3">
                          <span className="text-sm text-muted-foreground font-medium">{idx}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{aq.label}</p>
                            {autoAns?.detail && !isEditing && (
                              <p className="text-xs text-muted-foreground mt-0.5 italic">{autoAns.detail}</p>
                            )}
                            {autoAns?.overridden && autoAns.justificativa && !isEditing && (
                              <p className="text-xs text-warning mt-0.5">Justificativa: "{autoAns.justificativa}"</p>
                            )}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-destructive text-destructive-foreground">Automática</span>
                            {autoAns?.overridden && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/10 text-warning border border-warning/20">Editada</span>
                            )}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <span className={cn("text-sm font-bold font-tabular", penaltyApplied ? "text-destructive" : "text-muted-foreground")}>
                              -{aq.pontos}
                            </span>
                            {isPendente && !isEditing && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => startEditAuto(aq.id)}>
                                <Pencil className="w-3 h-3 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Edit mode */}
                        <AnimatePresence>
                          {isEditing && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                              <div className="mx-4 mb-3 bg-muted/30 border border-border rounded-lg p-3 space-y-3">
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Alterar resposta:</Label>
                                  <ApprovalSegmentedControl
                                    value={autoOverrides[aq.id]?.resposta || autoComputedAnswers[aq.id]?.resposta || ""}
                                    onChange={(v) => {
                                      setAutoOverrides(prev => ({
                                        ...prev,
                                        [aq.id]: { resposta: v, justificativa: prev[aq.id]?.justificativa || editAutoJustificativa },
                                      }));
                                    }}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground mb-1 block">Justificativa <span className="text-destructive">*</span></Label>
                                  <Textarea
                                    placeholder="Informe o motivo da alteração..."
                                    value={editAutoJustificativa}
                                    onChange={e => setEditAutoJustificativa(e.target.value)}
                                    className="bg-card min-h-[50px] text-sm"
                                  />
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  <Button variant="ghost" size="sm" onClick={cancelEditAuto}>
                                    <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                                  </Button>
                                  <Button size="sm" disabled={!editAutoJustificativa.trim()}
                                    onClick={() => confirmEditAuto(aq.id, autoOverrides[aq.id]?.resposta || autoComputedAnswers[aq.id]?.resposta || "conforme")}>
                                    <Check className="w-3.5 h-3.5 mr-1" /> Confirmar
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  {/* Subtotal Penalidades */}
                  {autoQuestions.length > 0 && (
                    <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-2 border-b border-border bg-muted/20">
                      <span />
                      <span />
                      <span className="text-xs font-medium text-muted-foreground text-right">Subtotal Penalidades</span>
                      <span className="text-sm font-bold text-destructive text-right font-tabular">{subtotalPenalidades}</span>
                    </div>
                  )}

                  {/* All template fields rows */}
                  {allVisibleFields.map((f) => {
                    const isApproverField = f.aprovador_verificar;
                    globalQuestionIdx++;
                    const idx = globalQuestionIdx;
                    const fieldPeso = f.aprovador_peso || f.peso || 1;
                    const answer = answersMap[f.id];
                    const rev = reviewsMap[f.id];
                    const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
                    const draft = approval.approverAnswers[f.id];
                    const currentResposta: ApprovalAnswer = (draft?.resposta ?? existing?.resposta ?? "") as ApprovalAnswer;
                    const currentObs = draft?.observacao ?? existing?.observacao ?? "";
                    const isConforme = currentResposta === "conforme";
                    const isNaoConforme = currentResposta === "nao_conforme";

                    return (
                      <div key={f.id} className={cn("border-b border-border transition-colors",
                        isApproverField && isConforme ? "bg-success/5" : isApproverField && isNaoConforme ? "bg-destructive/5" :
                        !isApproverField && rev?.conforme === true ? "bg-success/5" : !isApproverField && rev?.conforme === false ? "bg-destructive/5" : ""
                      )}>
                        <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-3">
                          <span className="text-sm text-muted-foreground font-medium">{idx}</span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{isApproverField ? (f.aprovador_pergunta || f.label) : f.label}</p>
                            {isApproverField && f.aprovador_pergunta && f.aprovador_pergunta !== f.label && (
                              <p className="text-xs text-muted-foreground mt-0.5">Campo: {f.label}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-center">
                            {isApproverField ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-accent text-accent-foreground border border-accent">Aprovador</span>
                            ) : (
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                                rev?.conforme === true ? "bg-success/10 text-success" :
                                rev?.conforme === false ? "bg-destructive/10 text-destructive" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {rev?.conforme === true ? "Conforme" : rev?.conforme === false ? "Não Conforme" : "—"}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-foreground text-right font-tabular">{fieldPeso}</span>
                        </div>

                        {/* Context: Executor answer + Avaliador review */}
                        <div className="px-4 pb-2">
                          <div className="ml-10 bg-muted/30 border border-border rounded-lg p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Resposta do Executor</p>
                                {renderAnswerValue(f, answer)}
                                {answer?.evidencia_url && f.tipo !== "foto" && (
                                  <a href={answer.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1 mt-1">
                                    <ExternalLink className="w-3 h-3" /> Ver evidência
                                  </a>
                                )}
                              </div>
                              {rev && (
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Avaliador</p>
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
                                    rev.conforme === true ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"
                                  )}>
                                    {rev.conforme === true ? "✓ Conforme" : "✗ Não Conforme"}
                                  </span>
                                  {rev.observacao && <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px]">"{rev.observacao}"</p>}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Approver response controls — only for aprovador_verificar fields */}
                        {isApproverField && (
                          <>
                            <div className="px-4 pb-3">
                              <div className="ml-10">
                                <ApprovalSegmentedControl
                                  value={currentResposta}
                                  onChange={v => approval.updateApproverAnswer(f.id, { resposta: v })}
                                  disabled={!isPendente}
                                />
                              </div>
                            </div>

                            <AnimatePresence>
                              {isNaoConforme && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                  <div className="mx-4 ml-14 mb-3 bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                                      <AlertTriangle className="w-3.5 h-3.5" /> Observação do aprovador
                                    </div>
                                    <Textarea
                                      placeholder="Descreva o motivo da não conformidade..."
                                      value={currentObs}
                                      onChange={e => approval.updateApproverAnswer(f.id, { observacao: e.target.value })}
                                      disabled={!isPendente}
                                      className="bg-card min-h-[60px] text-sm"
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <AnimatePresence>
                              {isConforme && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                  <div className="mx-4 ml-14 mb-3 bg-success/5 border border-success/20 rounded-lg p-3 space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-success font-medium">
                                      <MessageSquare className="w-3.5 h-3.5" /> Observação (opcional)
                                    </div>
                                    <Textarea
                                      placeholder="Adicione uma observação se necessário..."
                                      value={currentObs}
                                      onChange={e => approval.updateApproverAnswer(f.id, { observacao: e.target.value })}
                                      disabled={!isPendente}
                                      className="bg-card min-h-[60px] text-sm"
                                    />
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* Subtotal Campos */}
                  {allVisibleFields.length > 0 && (
                    <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-2 border-b border-border bg-muted/20">
                      <span />
                      <span />
                      <span className="text-xs font-medium text-muted-foreground text-right">Subtotal Campos</span>
                      <span className="text-sm font-bold text-foreground text-right font-tabular">{subtotalCampos}</span>
                    </div>
                  )}

                  {/* Pontos Totais */}
                  <div className="grid grid-cols-[40px_1fr_120px_80px] items-center px-4 py-3 bg-muted/40">
                    <span />
                    <span />
                    <span className="text-sm font-semibold text-foreground text-right">Pontos Totais</span>
                    <span className="text-sm font-bold text-foreground text-right font-tabular">{pontosTotais}</span>
                  </div>
                </div>
              );
            })()}
            {/* Contingencies summary */}
            {approval.contingencies.length > 0 && (
              <div className="bg-card border border-border rounded-lg shadow-card">
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <h3 className="text-sm font-semibold text-foreground">Contingências ({approval.contingencies.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {approval.contingencies.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-3 text-xs">
                      <span className="truncate">{c.descricao}</span>
                      <span className={cn("shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border", CONTINGENCY_STATUS[c.status]?.class || "")}>
                        {CONTINGENCY_STATUS[c.status]?.label || c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Audit trail */}
            <div className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <History className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Histórico</h3>
              </div>
              <div className="p-4">
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
                <Button size="sm" onClick={() => handleDecision("aprovar")}
                  disabled={blockingReasons.length > 0} className="press-effect">
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
              {decisionDialog.action === "aprovar" && "A tarefa será aprovada definitivamente."}
              {decisionDialog.action === "reprovar_devolver" && "A tarefa será devolvida para nova avaliação."}
              {decisionDialog.action === "encerrar" && "A tarefa será encerrada manualmente."}
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/50 rounded-lg p-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="text-green-600 font-semibold text-lg">{progress.conformes}</p><p className="text-muted-foreground">Conformes</p></div>
              <div><p className="text-red-600 font-semibold text-lg">{progress.naoConformes}</p><p className="text-muted-foreground">Não Conformes</p></div>
              <div><p className="text-muted-foreground font-semibold text-lg">{progress.total - progress.respondidas}</p><p className="text-muted-foreground">Pendentes</p></div>
            </div>
            <div className="mt-2 pt-2 border-t border-border text-center">
              <span className={cn("text-sm font-bold",
                scoreCalc.score >= 85 ? "text-success" : scoreCalc.score >= 75 ? "text-warning" : "text-destructive"
              )}>
                Nota Aprovação: {scoreCalc.score}%
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Justificativa {decisionDialog.action !== "aprovar" && <span className="text-destructive">*</span>}</Label>
            <Textarea value={decisionMotivo} onChange={e => setDecisionMotivo(e.target.value)}
              placeholder="Informe o motivo da decisão..." className="min-h-[60px]" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, action: null })}>Cancelar</Button>
            <Button onClick={confirmDecision}
              disabled={approval.isSaving || (decisionDialog.action !== "aprovar" && !decisionMotivo.trim())}
              variant={decisionDialog.action === "reprovar_devolver" ? "destructive" : "default"}
              className="press-effect">
              {approval.isSaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
