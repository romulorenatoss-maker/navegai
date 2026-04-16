import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, Play, Send, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Eye, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { STATUS_CONFIG } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { SnapshotField, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { ReviewFieldCard } from "@/components/operational/ReviewFieldCard";
import { useAssignmentReview } from "@/hooks/useAssignmentReview";

export default function OperationalAvaliacaoPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState("aguardando");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<{ open: boolean; action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar" | null }>({ open: false, action: null });
  const [decisionMotivo, setDecisionMotivo] = useState("");

  // Load assignments where user is avaliador
  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["avaliador_assignments", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao), executor:profiles!operational_assignments_responsavel_id_fkey(nome)")
        .or(`avaliador_id.eq.${profile.id}`)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  const aguardando = assignments.filter((a: any) => a.status === "aguardando_avaliacao");
  const emAvaliacao = assignments.filter((a: any) => a.status === "em_avaliacao");
  const devolvidos = assignments.filter((a: any) => a.status === "devolvida");
  const historico = assignments.filter((a: any) => ["concluida", "aprovada", "aguardando_aprovacao", "reprovada"].includes(a.status)).slice(0, 50);

  const review = useAssignmentReview(selectedAssignment?.id || null);

  // Snapshot data
  const snapshot = selectedAssignment?.template_snapshot;
  const snapshotSections: any[] = useMemo(() => snapshot?.sections?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);
  const snapshotFields: SnapshotField[] = useMemo(() => snapshot?.fields?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);

  const fieldsBySection = useMemo(() => {
    const map: Record<string, SnapshotField[]> = {};
    for (const f of snapshotFields) {
      const key = f.section_id || "__nosection";
      (map[key] ??= []).push(f);
    }
    return map;
  }, [snapshotFields]);

  // Build answers map from fieldAnswers for visibility evaluation
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

  // Count executor "não conforme" fields
  const naoConformeFields = useMemo(() => {
    return visibleFields.filter(f => {
      if (f.tipo !== "conforme" && f.tipo !== "sim_nao") return false;
      const ans = answersMap[f.id];
      return ans?.valor_booleano === false;
    });
  }, [visibleFields, answersMap]);

  // FIX #1: Use weighted score preview
  const weightedScore = useMemo(() =>
    review.weightedScorePreview(snapshotFields),
    [review.weightedScorePreview, snapshotFields]
  );

  // FIX #5: Check review completeness
  const reviewComplete = useMemo(() =>
    review.isReviewComplete(visibleFields),
    [review.isReviewComplete, visibleFields]
  );

  const openReview = useCallback((a: any) => {
    setSelectedAssignment(a);
    setReviewDialogOpen(true);
    const sections = a.template_snapshot?.sections?.sort((x: any, y: any) => x.ordem - y.ordem);
    setActiveSection(sections?.[0]?.id || null);
  }, []);

  const closeReview = () => {
    setReviewDialogOpen(false);
    setSelectedAssignment(null);
  };

  // Review progress
  const reviewProgress = useMemo(() => {
    if (!visibleFields.length) return 0;
    const reviewed = visibleFields.filter(f => review.reviewDrafts[f.id]?.conforme !== null && review.reviewDrafts[f.id]?.conforme !== undefined).length;
    return Math.round((reviewed / visibleFields.length) * 100);
  }, [visibleFields, review.reviewDrafts]);

  const handleStartEvaluation = () => {
    if (selectedAssignment) review.startEvaluation.mutate(selectedAssignment.id);
  };

  // FIX #2: devolver_total only marks already non-conforme as devolvido, does NOT touch unreviewed
  const handleDecision = (action: "aprovar" | "devolver_parcial" | "devolver_total" | "reprovar") => {
    if (action === "devolver_total") {
      for (const f of visibleFields) {
        const draft = review.reviewDrafts[f.id];
        if (draft?.conforme === false) {
          review.updateReview(f.id, { devolvido: true });
        }
        // Unreviewed fields (conforme === null) are LEFT UNTOUCHED
      }
    }
    setDecisionDialog({ open: true, action });
    setDecisionMotivo("");
  };

  // FIX #6: Pass motivo to saveReviews
  const confirmDecision = () => {
    if (!decisionDialog.action || !selectedAssignment) return;
    review.saveReviews.mutate(
      {
        assignment: selectedAssignment,
        fields: snapshotFields,
        action: decisionDialog.action,
        motivo: decisionMotivo || undefined,
      },
      {
        onSuccess: () => {
          setDecisionDialog({ open: false, action: null });
          setReviewDialogOpen(false);
          setSelectedAssignment(null);
        },
      }
    );
  };

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-12 text-muted-foreground"><p className="text-sm">{msg}</p></div>
  );

  const isReviewable = selectedAssignment && ["aguardando_avaliacao", "em_avaliacao"].includes(selectedAssignment.status);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground">Avaliação Operacional</h1>
        <p className="text-sm text-muted-foreground">Revise formulários e atribua conformidade por campo.</p>
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

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={v => { if (!v) closeReview(); }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeReview}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{snapshot?.nome || "Rotina"}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>Executor: {selectedAssignment?.executor?.nome || "—"}</span>
                  <span>•</span>
                  <span>{selectedAssignment?.data_prevista}</span>
                  {selectedAssignment?.status && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CONFIG[selectedAssignment.status]?.class || ""}`}>
                      {STATUS_CONFIG[selectedAssignment.status]?.label}
                    </span>
                  )}
                  {selectedAssignment?.rodada_atual > 1 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <RotateCcw className="w-3 h-3" /> Rodada {selectedAssignment.rodada_atual}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progress & Score Preview */}
            <div className="mt-3 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>Progresso da Avaliação</span>
                  <span className="font-medium">{reviewProgress}%</span>
                </div>
                <Progress value={reviewProgress} className="h-2" />
              </div>
              {weightedScore && (
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">Score Ponderado</p>
                  <p className={`text-lg font-bold ${weightedScore.scoreEstimado >= 80 ? "text-green-600" : weightedScore.scoreEstimado >= 50 ? "text-amber-600" : "text-red-600"}`}>
                    {weightedScore.scoreEstimado}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    ✓{weightedScore.conformes} ✗{weightedScore.naoConformes} ↺{weightedScore.devolvidos}
                  </p>
                </div>
              )}
            </div>

            {/* Não conforme summary */}
            {naoConformeFields.length > 0 && (
              <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-orange-800">
                    {naoConformeFields.length} campo{naoConformeFields.length > 1 ? "s" : ""} marcado{naoConformeFields.length > 1 ? "s" : ""} como Não Conforme pelo executor
                  </p>
                  <p className="text-[10px] text-orange-600 truncate">
                    {naoConformeFields.map(f => f.label).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {/* Section nav */}
            {snapshotSections.length > 1 && (
              <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                {snapshotSections.map((s: any) => {
                  const sFields = (fieldsBySection[s.id] || []).filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap));
                  const reviewed = sFields.filter(f => review.reviewDrafts[f.id]?.conforme !== null && review.reviewDrafts[f.id]?.conforme !== undefined).length;
                  const allReviewed = reviewed === sFields.length && sFields.length > 0;
                  const hasNaoConforme = sFields.some(f => (f.tipo === "conforme" || f.tipo === "sim_nao") && answersMap[f.id]?.valor_booleano === false);
                  return (
                    <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${activeSection === s.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                      {s.nome || "Seção"}
                      {hasNaoConforme && !allReviewed && <AlertTriangle className="w-3 h-3 text-orange-500" />}
                      {allReviewed && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                      <span className="text-[10px] opacity-70">{reviewed}/{sFields.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {selectedAssignment?.status === "aguardando_avaliacao" && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Inicie a avaliação para revisar os campos.</p>
                <Button onClick={handleStartEvaluation} disabled={review.startEvaluation.isPending}>
                  <Play className="w-4 h-4 mr-2" /> Iniciar Avaliação
                </Button>
              </div>
            )}

            {isReviewable && selectedAssignment?.status !== "aguardando_avaliacao" && (
              <>
                {snapshotSections.length === 0 ? (
                  <div className="space-y-3">
                    {visibleFields.map(f => (
                      <ReviewFieldCard key={f.id} field={f} answer={review.getFieldAnswer(f.id)}
                        review={review.reviewDrafts[f.id]}
                        onChange={review.updateReview}
                        contingencyPrazoHoras={review.contingencyPrazos[f.id]}
                        onContingencyPrazoChange={review.updateContingencyPrazo}
                        onContingencyConfirm={review.registerContingencyData} />
                    ))}
                  </div>
                ) : (
                  snapshotSections.filter(s => !activeSection || s.id === activeSection).map((section: any) => {
                    const sFields = (fieldsBySection[section.id] || []).filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap));
                    return (
                      <div key={section.id}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.cor || "#3b82f6" }} />
                            <h3 className="text-sm font-semibold text-foreground">{section.nome}</h3>
                          </div>
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => review.markSectionConforme(sFields)}
                            className="text-[10px] h-7 px-2">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Tudo Conforme
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {sFields.map(f => (
                            <ReviewFieldCard key={f.id} field={f} answer={review.getFieldAnswer(f.id)}
                              review={review.reviewDrafts[f.id]}
                              onChange={review.updateReview}
                              contingencyPrazoHoras={review.contingencyPrazos[f.id]}
                              onContingencyPrazoChange={review.updateContingencyPrazo}
                              onContingencyConfirm={review.registerContingencyData} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Read-only for historical */}
            {!isReviewable && selectedAssignment && (
              <div className="space-y-3">
                {visibleFields.map(f => (
                  <ReviewFieldCard key={f.id} field={f} answer={review.getFieldAnswer(f.id)}
                    review={review.reviewDrafts[f.id]} disabled={true}
                    onChange={() => {}} />
                ))}
              </div>
            )}

            {/* Contingencies */}
            {review.contingencies.length > 0 && (
              <div className="mt-6">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contingências ({review.contingencies.length})</h4>
                <div className="space-y-2">
                  {review.contingencies.map((c: any) => (
                    <div key={c.id} className="p-2 border border-orange-200 bg-orange-50/50 rounded text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-orange-800">{c.descricao}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${c.status === "aberta" ? "bg-red-100 text-red-700 border-red-200" : c.status === "resolvida" ? "bg-green-100 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                          {c.status}
                        </span>
                      </div>
                      {c.prazo_sla && <p className="text-muted-foreground mt-1">SLA: {new Date(c.prazo_sla).toLocaleString("pt-BR")}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer - FIX #5: Disable actions when review is incomplete */}
          {isReviewable && selectedAssignment?.status !== "aguardando_avaliacao" && (
            <div className="border-t border-border p-3 bg-card safe-area-bottom">
              {!reviewComplete && (
                <p className="text-[10px] text-amber-600 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Revise todos os campos obrigatórios antes de tomar uma decisão.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => handleDecision("devolver_parcial")}
                  disabled={!reviewComplete}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver Parcial
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDecision("devolver_total")}
                  disabled={!reviewComplete}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50">
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver Total
                </Button>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={() => handleDecision("reprovar")}
                  disabled={!reviewComplete}
                  className="text-red-700 border-red-300 hover:bg-red-50">
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

          {weightedScore && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium mb-1">Resumo da avaliação:</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="text-green-600 font-semibold text-lg">{weightedScore.conformes}</p><p className="text-muted-foreground">Conformes</p></div>
                <div><p className="text-red-600 font-semibold text-lg">{weightedScore.naoConformes}</p><p className="text-muted-foreground">Não Conformes</p></div>
                <div><p className="text-amber-600 font-semibold text-lg">{weightedScore.devolvidos}</p><p className="text-muted-foreground">Devolvidos</p></div>
              </div>
              <p className="text-center mt-2 font-semibold">Score Ponderado: {weightedScore.scoreEstimado}%</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecisionDialog({ open: false, action: null })}>Cancelar</Button>
            <Button onClick={confirmDecision} disabled={review.isSaving}
              variant={decisionDialog.action === "reprovar" ? "destructive" : "default"}>
              {review.isSaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
