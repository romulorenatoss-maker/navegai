import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, CheckCircle2, RotateCcw, AlertTriangle, Shield,
  Lock, History, ExternalLink,
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

  // Only fields with aprovador_verificar + aprovador_pergunta are approval questions
  const approvalFields = useMemo(() =>
    snapshotFields
      .filter(f => f.aprovador_verificar && f.aprovador_pergunta?.trim() && evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  // All visible fields for details
  const allVisibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  // Progress
  const progress = useMemo(() => {
    let respondidas = 0, total = approvalFields.length;
    for (const f of approvalFields) {
      const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const draft = approval.approverAnswers[f.id];
      if (draft?.resposta || existing?.resposta) respondidas++;
    }
    return { respondidas, total };
  }, [approvalFields, approval.approverAnswers, approval.existingApprovalAnswers]);

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
      { assignment: selectedAssignment, action: decisionDialog.action, motivo: decisionMotivo || undefined },
      { onSuccess: () => { setDecisionDialog({ open: false, action: null }); closeApproval(); } }
    );
  };

  const isPendente = selectedAssignment?.status === "aguardando_aprovacao";

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  // ── Build ordered items (only approval fields) ──
  const orderedItems = useMemo(() => {
    const result: ({ type: "section"; data: any } | { type: "field"; data: SnapshotField })[] = [];
    if (snapshotSections.length > 0) {
      for (const section of snapshotSections) {
        const sFields = approvalFields.filter(f => f.section_id === section.id);
        if (sFields.length === 0) continue;
        result.push({ type: "section", data: section });
        for (const f of sFields) result.push({ type: "field", data: f });
      }
    } else {
      for (const f of approvalFields) result.push({ type: "field", data: f });
    }
    return result;
  }, [snapshotSections, approvalFields]);

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
            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Progresso da aprovação</span>
                <span>{progress.respondidas}/{progress.total} perguntas</span>
              </div>
              <Progress value={progress.total > 0 ? (progress.respondidas / progress.total) * 100 : 0} className="h-2" />
            </div>

            {/* ── Checklist Questions (only aprovador_verificar fields) ── */}
            {orderedItems.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">Nenhuma pergunta de aprovação configurada neste template.</p>
                <p className="text-xs mt-1">Configure campos com "Pergunta do Aprovador" na aba Formulário do template.</p>
              </div>
            )}

            <div className="space-y-3">
              {orderedItems.map((item) => {
                if (item.type === "section") {
                  return (
                    <div key={item.data.id} className="flex items-center gap-2 pt-3 pb-1">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.data.cor || "hsl(var(--primary))" }} />
                      <h3 className="text-sm font-semibold text-foreground">{item.data.nome}</h3>
                    </div>
                  );
                }

                const f = item.data as SnapshotField;
                const answer = answersMap[f.id];
                const rev = reviewsMap[f.id];
                const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
                const draft = approval.approverAnswers[f.id];
                const currentResposta = draft?.resposta ?? existing?.resposta ?? "";
                const isConforme = currentResposta === "conforme";
                const isNaoConforme = currentResposta === "nao_conforme";

                return (
                  <div key={f.id} className={`border rounded-lg overflow-hidden transition-colors ${isConforme ? "border-green-300 bg-green-50/30 dark:bg-green-950/20 dark:border-green-700" : isNaoConforme ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${isConforme ? "bg-green-500" : isNaoConforme ? "bg-red-500" : "bg-muted-foreground/30"}`} />
                        <Label className="text-sm font-medium truncate">{f.aprovador_pergunta || f.label}</Label>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-3">
                      {/* Executor answer + reviewer decision */}
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

                      {/* Approver answer buttons */}
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-primary">{f.aprovador_pergunta}</p>
                        <div className="flex gap-2">
                          {["conforme", "nao_conforme", "na"].map(opt => (
                            <button key={opt} type="button" disabled={!isPendente}
                              onClick={() => approval.updateApproverAnswer(f.id, { resposta: opt })}
                              className={`flex-1 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                                currentResposta === opt
                                  ? opt === "conforme" ? "bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400/30"
                                  : opt === "nao_conforme" ? "bg-red-100 text-red-800 border-red-300 ring-2 ring-red-400/30"
                                  : "bg-muted text-muted-foreground border-border ring-2 ring-muted-foreground/30"
                                  : "bg-card border-border text-muted-foreground hover:bg-muted"
                              } ${!isPendente ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                              {opt === "conforme" ? "Conforme" : opt === "nao_conforme" ? "Não Conforme" : "N/A"}
                            </button>
                          ))}
                        </div>
                      </div>
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

            {/* Detalhes da Tarefa */}
            <div className="border-t border-border pt-4 mt-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <History className="w-4 h-4" /> Detalhes da Tarefa
              </h3>

              <div className="border rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Respostas do Executor</h4>
                <div className="space-y-2">
                  {allVisibleFields.map(f => {
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
              {decisionDialog.action === "aprovar" && "A tarefa será aprovada definitivamente."}
              {decisionDialog.action === "reprovar_devolver" && "A tarefa será devolvida para nova avaliação."}
              {decisionDialog.action === "encerrar" && "A tarefa será encerrada manualmente."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-sm">Justificativa {decisionDialog.action !== "aprovar" && <span className="text-destructive">*</span>}</Label>
            <Textarea value={decisionMotivo} onChange={e => setDecisionMotivo(e.target.value)}
              placeholder="Informe o motivo da decisão..." className="min-h-[60px]" />
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
    </div>
  );
}
