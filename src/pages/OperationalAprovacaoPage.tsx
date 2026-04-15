import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, CheckCircle2, RotateCcw, AlertTriangle, Shield, Pencil, Lock, History, TrendingUp, TrendingDown, Clock, AlertCircle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG, CONTINGENCY_STATUS, AUDIT_EVENT_LABELS } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { SnapshotField, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { ReviewFieldCard } from "@/components/operational/ReviewFieldCard";
import { useApprovalFlow } from "@/hooks/useApprovalFlow";

export default function OperationalAprovacaoPage() {
  const { profile, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("pendentes");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<"formulario" | "score" | "historico" | "perguntas">("score");
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; action: "aprovar" | "reprovar_devolver" | "encerrar" | null }>({ open: false, action: null });
  const [decisionMotivo, setDecisionMotivo] = useState("");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["aprovacao_assignments", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let query = (supabase as any).from("operational_assignments")
        .select(`*, operational_templates(nome, tipo_execucao),
          executor:profiles!operational_assignments_responsavel_id_fkey(nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(nome),
          avaliado:profiles!operational_assignments_avaliado_id_fkey(nome)`)
        .in("status", ["aguardando_aprovacao", "aprovada", "reprovada", "concluida"])
        .order("updated_at", { ascending: false });

      // Filter by aprovador unless admin
      if (!isAdmin) {
        query = query.eq("aprovador_id", profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  const pendentes = assignments.filter((a: any) => a.status === "aguardando_aprovacao");
  const devolvidos = assignments.filter((a: any) => a.status === "devolvida" || (a.status === "aguardando_aprovacao" && approval.contingencies.some((c: any) => !["validada", "descartada"].includes(c.status))));
  const aprovados = assignments.filter((a: any) => a.status === "aprovada");
  const historico = assignments.filter((a: any) => ["concluida", "reprovada"].includes(a.status)).slice(0, 50);

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

  const visibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap)),
    [snapshotFields, answersMap]
  );

  const scoreBreakdown = useMemo(() =>
    selectedAssignment ? approval.calculateBreakdown(selectedAssignment, snapshotFields) : null,
    [selectedAssignment, approval.calculateBreakdown, snapshotFields]
  );

  const sectionScoresData = useMemo(() =>
    approval.sectionScores(snapshotFields, snapshotSections),
    [approval.sectionScores, snapshotFields, snapshotSections]
  );

  const blockingReasons = useMemo(() =>
    selectedAssignment ? approval.getBlockingReasons(selectedAssignment) : [],
    [selectedAssignment, approval.getBlockingReasons]
  );

  // Fields that have approver questions configured
  const approverFields = useMemo(() =>
    snapshotFields.filter(f => f.aprovador_pergunta && f.aprovador_pergunta.trim() !== ""),
    [snapshotFields]
  );

  const openApproval = useCallback((a: any) => {
    setSelectedAssignment(a);
    setApprovalDialogOpen(true);
    setActiveView("score");
  }, []);

  const closeApproval = () => {
    setApprovalDialogOpen(false);
    setSelectedAssignment(null);
  };

  const reviewDraftsMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of approval.fieldReviews) {
      if (!map[r.field_id]) {
        map[r.field_id] = {
          field_id: r.field_id,
          conforme: r.conforme,
          observacao: r.observacao || "",
          devolvido: r.devolvido,
          motivo_devolucao: r.motivo_devolucao || "",
        };
      }
    }
    return map;
  }, [approval.fieldReviews]);

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
        scoreFinal: scoreBreakdown?.finalConsolidado,
      },
      {
        onSuccess: () => {
          setDecisionDialog({ open: false, action: null });
          setApprovalDialogOpen(false);
          setSelectedAssignment(null);
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
    if (!approval.overrideDraft || !approval.overrideDraft.justificativa.trim()) {
      return;
    }
    approval.saveOverride.mutate(approval.overrideDraft, {
      onSuccess: () => setOverrideDialogOpen(false),
    });
  };

  const isPendente = selectedAssignment?.status === "aguardando_aprovacao";

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" /> Aprovação Final
        </h1>
        <p className="text-sm text-muted-foreground">Aprovação, override de score e consolidação de assignments.</p>
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
          {devolvidos.length === 0 ? renderEmptyState("Nenhuma tarefa devolvida ou aguardando reaprovação.") : devolvidos.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
        <TabsContent value="aprovados" className="space-y-3">
          {aprovados.length === 0 ? renderEmptyState("Nenhum aprovado recente.") : aprovados.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
        <TabsContent value="historico" className="space-y-3">
          {historico.length === 0 ? renderEmptyState("Nenhum histórico.") : historico.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openApproval} />)}
        </TabsContent>
      </Tabs>

      <Dialog open={approvalDialogOpen} onOpenChange={v => { if (!v) closeApproval(); }}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden flex flex-col p-0">
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
                  <span>Avaliador: {selectedAssignment?.avaliador?.nome || "—"}</span>
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

            <div className="flex gap-1.5 mt-3">
              {(["score", "perguntas", "formulario", "historico"] as const).map(v => (
                <button key={v} type="button" onClick={() => setActiveView(v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${activeView === v ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                  {v === "score" ? "Score & Breakdown" : v === "formulario" ? "Formulário" : v === "perguntas" ? `Perguntas (${approverFields.length})` : "Histórico"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeView === "score" && scoreBreakdown && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center col-span-2 md:col-span-1">
                    <p className="text-3xl font-bold text-primary">{scoreBreakdown.finalConsolidado}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Score Final</p>
                    {isPendente && (
                      <Button variant="outline" size="sm" className="mt-2 h-6 text-[10px] px-2"
                        onClick={() => startOverride("final", scoreBreakdown.finalConsolidado)}>
                        <Pencil className="w-3 h-3 mr-1" /> Override
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-blue-50/50 border-blue-200">
                    <p className="text-xl font-bold text-blue-700">{scoreBreakdown.executor?.final || 0}</p>
                    <p className="text-[10px] uppercase tracking-wider text-blue-600/70">Executor</p>
                    {isPendente && <button className="text-[10px] text-blue-600 underline mt-1" onClick={() => startOverride("executor", scoreBreakdown.executor?.final || 0)}>ajustar</button>}
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-amber-50/50 border-amber-200">
                    <p className="text-xl font-bold text-amber-700">{scoreBreakdown.avaliado?.final || 0}</p>
                    <p className="text-[10px] uppercase tracking-wider text-amber-600/70">Avaliado</p>
                    {isPendente && <button className="text-[10px] text-amber-600 underline mt-1" onClick={() => startOverride("avaliado", scoreBreakdown.avaliado?.final || 0)}>ajustar</button>}
                  </div>
                  <div className="rounded-lg border p-3 text-center bg-violet-50/50 border-violet-200">
                    <p className="text-xl font-bold text-violet-700">{scoreBreakdown.avaliador?.final || 0}</p>
                    <p className="text-[10px] uppercase tracking-wider text-violet-600/70">Avaliador</p>
                    {isPendente && <button className="text-[10px] text-violet-600 underline mt-1" onClick={() => startOverride("avaliador", scoreBreakdown.avaliador?.final || 0)}>ajustar</button>}
                  </div>
                </div>

                {sectionScoresData.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Score por Seção</h4>
                    <div className="space-y-2">
                      {sectionScoresData.map((s: any) => (
                        <div key={s.id} className="flex items-center gap-3 p-2 border border-border rounded-lg">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{s.nome}</p>
                            <Progress value={s.score} className="h-1.5 mt-1" />
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-sm font-bold ${s.score >= 80 ? "text-green-600" : s.score >= 50 ? "text-amber-600" : "text-red-600"}`}>{s.score}%</span>
                            <p className="text-[10px] text-muted-foreground">✓{s.conformes} ✗{s.naoConformes}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {approval.contingencies.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contingências ({approval.contingencies.length})</h4>
                    <div className="space-y-2">
                      {approval.contingencies.map((c: any) => {
                        const statusCfg = CONTINGENCY_STATUS[c.status] || { label: c.status, class: "bg-muted text-muted-foreground border-border" };
                        return (
                          <div key={c.id} className="p-2 border rounded text-xs flex items-center justify-between gap-2">
                            <span className="truncate">{c.descricao}</span>
                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${statusCfg.class}`}>{statusCfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {approval.existingOverrides.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-500" /> Overrides Aplicados
                    </h4>
                    <div className="space-y-2">
                      {approval.existingOverrides.map((o: any) => (
                        <div key={o.id} className="p-2 border border-amber-200 bg-amber-50/50 rounded text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{o.tipo}: {o.score_original} → {o.score_ajustado}</span>
                            <span className={`font-mono ${o.diferenca > 0 ? "text-green-600" : "text-red-600"}`}>
                              {o.diferenca > 0 ? "+" : ""}{o.diferenca}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-0.5">"{o.justificativa}"</p>
                          <p className="text-muted-foreground mt-0.5">Por: {o.aprovador?.nome || "—"} em {new Date(o.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {activeView === "formulario" && (
              <div className="space-y-4">
                {snapshotSections.length === 0 ? (
                  <div className="space-y-3">
                    {visibleFields.map(f => (
                      <ReviewFieldCard key={f.id} field={f}
                        answer={answersMap[f.id]}
                        review={reviewDraftsMap[f.id]}
                        disabled={true} onChange={() => {}} />
                    ))}
                  </div>
                ) : (
                  snapshotSections.map((section: any) => {
                    const sFields = snapshotFields.filter(f => f.section_id === section.id).filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap));
                    return (
                      <div key={section.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.cor || "#3b82f6" }} />
                          <h3 className="text-sm font-semibold text-foreground">{section.nome}</h3>
                        </div>
                        <div className="space-y-3">
                          {sFields.map(f => (
                            <ReviewFieldCard key={f.id} field={f}
                              answer={answersMap[f.id]}
                              review={reviewDraftsMap[f.id]}
                              disabled={true} onChange={() => {}} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeView === "perguntas" && (
              <div className="space-y-4">
                {/* Automatic system questions */}
                {snapshot?.habilitar_perguntas_automaticas !== false && approval.contingencies.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perguntas Automáticas do Sistema</h4>
                    <div className="border rounded-lg p-3 space-y-2 bg-blue-50/30 border-blue-200">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Houve contingência nesta tarefa?</p>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">SIM</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Resposta automática — {approval.contingencies.length} contingência(s) registrada(s)</p>
                    </div>
                    <div className="border rounded-lg p-3 space-y-2 bg-blue-50/30 border-blue-200">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">Contingência resolvida dentro do prazo?</p>
                        {(() => {
                          const resolved = approval.contingencies.filter((c: any) => c.resolvida_em);
                          const dentroPrazo = resolved.filter((c: any) => c.prazo_sla && new Date(c.resolvida_em) <= new Date(c.prazo_sla));
                          const allInTime = resolved.length > 0 && dentroPrazo.length === resolved.length;
                          return (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${allInTime ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                              {allInTime ? "SIM" : "NÃO"}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-[10px] text-muted-foreground">Resposta automática — permite override manual com justificativa</p>
                    </div>
                  </div>
                )}

                {/* Alert if contingencies are pending */}
                {!approval.canAnswerApproverQuestions && (
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Contingências pendentes ({approval.pendingContingencies.length})</p>
                      <p className="text-xs text-amber-700 mt-0.5">As perguntas do aprovador somente poderão ser respondidas após a conclusão de todas as contingências.</p>
                    </div>
                  </div>
                )}

                {approverFields.length === 0 ? (
                  renderEmptyState("Nenhuma pergunta do aprovador configurada neste template.")
                ) : (
                  <div className="space-y-3">
                    {approverFields.map(f => {
                      const draft = approval.approverAnswers[f.id];
                      const existing = approval.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
                      const resposta = draft?.resposta ?? existing?.resposta ?? "";
                      const observacao = draft?.observacao ?? existing?.observacao ?? "";
                      const isDisabled = !isPendente || !approval.canAnswerApproverQuestions;

                      // Show review info for this field
                      const fieldReview = reviewDraftsMap[f.id];
                      const fieldAnswer = answersMap[f.id];
                      const fieldContingency = approval.contingencies.find((c: any) => c.origin_field_id === f.id);

                      return (
                        <div key={f.id} className="border rounded-lg p-3 space-y-3 bg-card">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">{f.aprovador_pergunta}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Campo: {f.label} • Peso: {f.aprovador_peso || 1}</p>
                            </div>
                            {fieldContingency && (
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                fieldContingency.status === "validada" ? "bg-green-100 text-green-700 border-green-200" :
                                fieldContingency.status === "aberta" ? "bg-red-100 text-red-700 border-red-200" :
                                "bg-amber-100 text-amber-700 border-amber-200"
                              }`}>
                                Contingência: {fieldContingency.status}
                              </span>
                            )}
                          </div>

                          {/* Context: executor answer + reviewer decision */}
                          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 rounded p-2">
                            <div>
                              <span className="text-muted-foreground">Executor:</span>{" "}
                              <span className={fieldAnswer?.valor_booleano === false ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                                {fieldAnswer?.valor_booleano === true ? "Conforme" : fieldAnswer?.valor_booleano === false ? "Não Conforme" : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Avaliador:</span>{" "}
                              <span className={fieldReview?.conforme === false ? "text-red-600 font-medium" : fieldReview?.conforme === true ? "text-green-600 font-medium" : ""}>
                                {fieldReview?.conforme === true ? "Conforme" : fieldReview?.conforme === false ? "Não Conforme" : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Approver answer buttons */}
                          <div className="flex gap-2">
                            {["conforme", "nao_conforme", "na"].map(opt => (
                              <button key={opt} type="button" disabled={isDisabled}
                                onClick={() => approval.updateApproverAnswer(f.id, { resposta: opt })}
                                className={`flex-1 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                                  resposta === opt
                                    ? opt === "conforme" ? "bg-green-100 text-green-800 border-green-300 ring-2 ring-green-400/30"
                                    : opt === "nao_conforme" ? "bg-red-100 text-red-800 border-red-300 ring-2 ring-red-400/30"
                                    : "bg-muted text-muted-foreground border-border ring-2 ring-muted-foreground/30"
                                    : "bg-card border-border text-muted-foreground hover:bg-muted"
                                } ${isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                                {opt === "conforme" ? "Conforme" : opt === "nao_conforme" ? "Não Conforme" : "N/A"}
                              </button>
                            ))}
                          </div>

                          {/* Observation */}
                          <Textarea placeholder="Observação do aprovador..." value={observacao} disabled={isDisabled}
                            onChange={e => approval.updateApproverAnswer(f.id, { observacao: e.target.value })}
                            className="text-xs min-h-[40px]" />
                        </div>
                      );
                    })}

                    {isPendente && approval.canAnswerApproverQuestions && (
                      <Button size="sm" onClick={() => approval.saveApproverAnswers.mutate(snapshotFields)}
                        disabled={approval.isSaving}>
                        <MessageSquare className="w-3.5 h-3.5 mr-1" />
                        {approval.isSaving ? "Salvando..." : "Salvar Respostas do Aprovador"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeView === "historico" && (
              <div className="space-y-4">
                {/* Assignment timeline summary */}
                {selectedAssignment && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="border rounded p-2 text-center">
                      <p className="text-muted-foreground">Início</p>
                      <p className="font-medium">{selectedAssignment.inicio_em ? new Date(selectedAssignment.inicio_em).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                    <div className="border rounded p-2 text-center">
                      <p className="text-muted-foreground">Conclusão</p>
                      <p className="font-medium">{selectedAssignment.fim_em ? new Date(selectedAssignment.fim_em).toLocaleString("pt-BR") : "—"}</p>
                    </div>
                    <div className="border rounded p-2 text-center">
                      <p className="text-muted-foreground">Rodadas</p>
                      <p className="font-medium">{selectedAssignment.rodada_atual || 1}</p>
                    </div>
                    <div className={`border rounded p-2 text-center ${selectedAssignment.fim_em && selectedAssignment.horario_limite && new Date(selectedAssignment.fim_em) > new Date(selectedAssignment.data_prevista + "T" + selectedAssignment.horario_limite) ? "border-red-300 bg-red-50/30" : ""}`}>
                      <p className="text-muted-foreground">Status Prazo</p>
                      <p className="font-medium">
                        {selectedAssignment.fim_em && selectedAssignment.horario_limite
                          ? new Date(selectedAssignment.fim_em) > new Date(selectedAssignment.data_prevista + "T" + selectedAssignment.horario_limite) ? "⚠️ Atrasado" : "✅ No prazo"
                          : "—"}
                      </p>
                    </div>
                  </div>
                )}

                {/* Contingencies summary */}
                {approval.contingencies.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Contingências ({approval.contingencies.length})
                    </h4>
                    <div className="space-y-2">
                      {approval.contingencies.map((c: any) => {
                        const slaInfo = c.prazo_sla ? (() => {
                          const diff = new Date(c.prazo_sla).getTime() - Date.now();
                          const isExpired = diff < 0;
                          return { isExpired, label: isExpired ? `Vencido há ${Math.ceil(Math.abs(diff) / 86400000)}d` : `${Math.ceil(diff / 3600000)}h restantes` };
                        })() : null;

                        return (
                          <div key={c.id} className={`p-2 border rounded text-xs space-y-1 ${slaInfo?.isExpired ? "border-red-300 bg-red-50/30" : "border-border"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium">{c.descricao}</span>
                              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                c.status === "validada" ? "bg-green-100 text-green-700 border-green-200" :
                                c.status === "aberta" ? "bg-red-100 text-red-700 border-red-200" :
                                c.status === "resolvida" ? "bg-blue-100 text-blue-700 border-blue-200" :
                                "bg-muted text-muted-foreground border-border"
                              }`}>{c.status}</span>
                            </div>
                            {slaInfo && (
                              <p className={`flex items-center gap-1 ${slaInfo.isExpired ? "text-red-600" : "text-muted-foreground"}`}>
                                <Clock className="w-3 h-3" /> {slaInfo.label}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trilha de Auditoria</h4>
                {approval.auditTrail.length === 0 ? (
                  renderEmptyState("Nenhum registro de auditoria.")
                ) : (
                  <div className="space-y-2">
                    {approval.auditTrail.map((evt: any) => (
                      <div key={evt.id} className="p-2 border border-border rounded text-xs flex items-start gap-2">
                        <History className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{AUDIT_EVENT_LABELS[evt.tipo_evento] || evt.tipo_evento}</p>
                          {evt.motivo && <p className="text-muted-foreground">"{evt.motivo}"</p>}
                          <p className="text-muted-foreground">{evt.executor?.nome || "Sistema"} • {new Date(evt.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {isPendente && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              {blockingReasons.length > 0 && (
                <div className="mb-2 space-y-1">
                  {blockingReasons.map((r, i) => (
                    <p key={i} className="text-[10px] text-red-600 flex items-center gap-1">
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

      <Dialog open={decisionDialog.open} onOpenChange={v => { if (!v) setDecisionDialog({ open: false, action: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisionDialog.action === "aprovar" && "Aprovar Assignment"}
              {decisionDialog.action === "reprovar_devolver" && "Reprovar e Devolver"}
              {decisionDialog.action === "encerrar" && "Encerrar Manualmente"}
            </DialogTitle>
            <DialogDescription>
              {decisionDialog.action === "aprovar" && "O assignment será marcado como aprovado e o score consolidado."}
              {decisionDialog.action === "reprovar_devolver" && "O assignment será devolvido para nova avaliação."}
              {decisionDialog.action === "encerrar" && "O assignment será encerrado manualmente sem aprovação formal."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-sm">Justificativa {decisionDialog.action !== "aprovar" && <span className="text-destructive">*</span>}</Label>
            <Textarea value={decisionMotivo} onChange={e => setDecisionMotivo(e.target.value)}
              placeholder="Informe o motivo da decisão..." className="min-h-[60px]" />
          </div>

          {scoreBreakdown && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-center">
              <p className="font-medium">Score Final Consolidado: <span className="text-primary text-lg">{scoreBreakdown.finalConsolidado}</span></p>
            </div>
          )}

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

      <Dialog open={overrideDialogOpen} onOpenChange={v => { if (!v) { setOverrideDialogOpen(false); approval.setOverrideDraft(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Override de Score
            </DialogTitle>
            <DialogDescription>
              Ajuste manualmente o score. Uma justificativa obrigatória será registrada na trilha de auditoria.
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
                <div className={`flex items-center justify-center gap-2 p-2 rounded border ${approval.overrideDraft.score_ajustado > approval.overrideDraft.score_original ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
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
