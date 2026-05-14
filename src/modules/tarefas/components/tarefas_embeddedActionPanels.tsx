/**
 * Painéis embutidos de Avaliação e Aprovação para o drawer único de /tarefas/minhas.
 *
 * Reaproveitam, sem alterar:
 *   - useAssignmentReview     (lógica de avaliação)
 *   - useApprovalFlow         (lógica de aprovação final)
 *   - ReviewFieldCard         (UI do campo avaliado)
 *
 * Não tocam em banco, RPCs, triggers, scoring, builder ou execução.
 */
import { useMemo, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, RotateCcw, Send, Play, AlertTriangle, ShieldCheck, ExternalLink, Upload, ArrowLeft, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAssignmentReview } from "@/modules/tarefas/hooks/tarefas_useAssignmentReview";
import { useApprovalFlow } from "@/modules/tarefas/hooks/tarefas_useApprovalFlow";
import { ReviewFieldCard } from "@/modules/tarefas/components/tarefas_reviewFieldCard";
import { SnapshotField, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { VALIDADOR_PACOTE_PADRAO_DEFAULT } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";

/* =========================================================================
 * EmbeddedReviewPanel — usado quando current user é avaliador
 *   status: aguardando_avaliacao | em_avaliacao
 * ========================================================================= */
interface ReviewProps {
  assignment: any;
  fields: SnapshotField[];
  onClose: () => void;
}

export function EmbeddedReviewPanel({ assignment, fields, onClose }: ReviewProps) {
  const review = useAssignmentReview(assignment?.id || null);
  const [motivoGlobal, setMotivoGlobal] = useState("");

  const visibleFields = useMemo(() => {
    const answersMap: Record<string, any> = {};
    for (const a of review.fieldAnswers) answersMap[a.field_id] = a;
    return fields.filter(f => evaluateVisibility(f.condicao_visibilidade, answersMap));
  }, [fields, review.fieldAnswers]);

  // Saneamento 4 papéis: não há mais etapa "em_avaliacao". Aprovador decide direto sobre AGUARDANDO_APROVACAO.
  // Mantemos compat com legados aguardando_avaliacao/em_avaliacao (após migration já não devem ocorrer).
  const needsStart = false;
  const canDecide = ["aguardando_aprovacao", "em_avaliacao", "aguardando_avaliacao"].includes(assignment?.status) && review.isReviewComplete(visibleFields);

  const handleStart = async () => {
    try {
      await review.startEvaluation.mutateAsync(assignment.id);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAction = async (action: "aprovar" | "devolver_total" | "reprovar") => {
    if (action !== "aprovar" && !motivoGlobal.trim()) {
      toast.error("Justifique a devolução / reprovação.");
      return;
    }
    try {
      await review.saveReviews.mutateAsync({
        assignment,
        fields: visibleFields,
        action,
        motivo: motivoGlobal || undefined,
      });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-indigo-700 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-800 dark:text-indigo-300">
          <strong>Modo Avaliador.</strong>{" "}
          {needsStart
            ? "Inicie a avaliação para registrar conformidade campo a campo."
            : "Marque cada campo como Conforme ou Não Conforme. Devolva ou reprove se necessário."}
        </div>
      </div>

      {needsStart ? (
        <div className="text-center py-6">
          <Button onClick={handleStart} disabled={review.startEvaluation.isPending}>
            <Play className="w-4 h-4 mr-2" />
            {review.startEvaluation.isPending ? "Iniciando..." : "Iniciar Avaliação"}
          </Button>
        </div>
      ) : (
        <>
          {visibleFields.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhum campo para avaliar.</p>
          ) : (
            <div className="space-y-3">
              {visibleFields.map((f) => (
                <ReviewFieldCard
                  key={f.id}
                  field={f}
                  answer={review.getFieldAnswer(f.id)}
                  review={review.reviewDrafts[f.id]}
                  onChange={review.updateReview}
                  contingencyPrazoHoras={review.contingencyPrazos[f.id]}
                  onContingencyPrazoChange={review.updateContingencyPrazo}
                  onContingencyConfirm={review.registerContingencyData}
                />
              ))}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border">
            <Label className="text-xs">Justificativa (obrigatória para devolver/reprovar)</Label>
            <Textarea
              value={motivoGlobal}
              onChange={(e) => setMotivoGlobal(e.target.value)}
              placeholder="Motivo geral, se aplicável..."
              className="text-xs min-h-[60px]"
              maxLength={2000}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background pb-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleAction("reprovar")}
              disabled={review.isSaving}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleAction("devolver_total")}
              disabled={review.isSaving}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              size="sm"
              onClick={() => handleAction("aprovar")}
              disabled={!canDecide || review.isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {review.isSaving ? "Salvando..." : "Aprovar Avaliação"}
            </Button>
          </div>
          {!canDecide && !needsStart && (
            <p className="text-[11px] text-muted-foreground">
              Marque todos os campos obrigatórios para liberar a aprovação.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* =========================================================================
 * EmbeddedApprovalPanel — usado quando current user é aprovador
 *   status: aguardando_aprovacao
 * ========================================================================= */
interface ApprovalProps {
  assignment: any;
  fields: SnapshotField[];
  onClose: () => void;
}

export function EmbeddedApprovalPanel({ assignment, fields, onClose }: ApprovalProps) {
  const flow = useApprovalFlow(assignment?.id || null);
  const [motivo, setMotivo] = useState("");

  const blockReasons = flow.getBlockingReasons(assignment);
  const approverFields = useMemo(() => fields.filter((f) => f.aprovador_verificar), [fields]);

  const handleAction = async (action: "aprovar" | "reprovar_devolver") => {
    if (action !== "aprovar" && !motivo.trim()) {
      toast.error("Justifique a reprovação / devolução.");
      return;
    }
    try {
      await flow.finalDecision.mutateAsync({ assignment, action, motivo: motivo || undefined });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-purple-700 dark:text-purple-400 shrink-0 mt-0.5" />
        <div className="text-xs text-purple-800 dark:text-purple-300">
          <strong>Aprovação Final.</strong> Revise as respostas e a avaliação antes de decidir.
        </div>
      </div>

      {/* Resumo da avaliação anterior */}
      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Resumo da Avaliação</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Conformes</div>
            <div className="font-bold text-emerald-700">{flow.fieldReviews.filter((r: any) => r.conforme === true).length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Não Conformes</div>
            <div className="font-bold text-red-700">{flow.fieldReviews.filter((r: any) => r.conforme === false).length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Planos de Ação</div>
            <div className="font-bold text-orange-700">{flow.pendingContingencies.length}</div>
          </div>
        </div>
      </div>

      {/* Perguntas exclusivas do aprovador, se houver */}
      {approverFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Perguntas do Aprovador</p>
          {approverFields.map((f) => {
            const existing = flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
            const draft = flow.approverAnswers[f.id];
            const value = draft?.resposta ?? existing?.resposta ?? "";
            const execAnswer = (flow.fieldAnswers || []).find((a: any) => a.field_id === f.id);
            return (
              <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="text-sm font-medium text-foreground">{f.label}</div>

                {/* Resposta do executor (read-only) */}
                <div className="rounded-md border border-border/60 bg-muted/40 p-2 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Resposta do Executor</p>
                  {execAnswer ? (
                    <>
                      {(f.tipo === "conforme" || f.tipo === "sim_nao") && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${execAnswer.valor_booleano === true ? "bg-green-100 text-green-800" : execAnswer.valor_booleano === false ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>
                          {execAnswer.valor_booleano === true ? "Sim / Conforme" : execAnswer.valor_booleano === false ? "Não / Não Conforme" : "—"}
                        </span>
                      )}
                      {(f.tipo === "numero" || f.tipo === "nota_avaliacao") && (
                        <span className="font-mono text-sm">{execAnswer.valor_numero ?? "—"}</span>
                      )}
                      {f.tipo === "data" && (
                        <span className="text-sm">{execAnswer.valor_data?.slice(0, 10) || "—"}</span>
                      )}
                      {f.tipo === "multi_select" && Array.isArray(execAnswer.valor_json) && (
                        <div className="flex flex-wrap gap-1">
                          {(execAnswer.valor_json as string[]).map((i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">{i}</span>
                          ))}
                        </div>
                      )}
                      {!["conforme","sim_nao","numero","nota_avaliacao","data","multi_select"].includes(f.tipo) && (
                        <p className="text-sm whitespace-pre-wrap">{execAnswer.valor_texto || "—"}</p>
                      )}
                      {execAnswer.observacao && (
                        <p className="text-xs text-muted-foreground italic">Obs: {execAnswer.observacao}</p>
                      )}
                      {execAnswer.evidencia_url && (
                        <div className="mt-1">
                          {f.tipo === "foto" ? (
                            <img src={execAnswer.evidencia_url} alt="Evidência" className="max-h-28 rounded border border-border cursor-pointer" onClick={() => window.open(execAnswer.evidencia_url, "_blank")} />
                          ) : (
                            <a href={execAnswer.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline inline-flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />Ver anexo
                            </a>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic text-xs">Sem resposta do executor</span>
                  )}
                </div>

                {/* Pergunta do aprovador */}
                <div className="text-xs font-medium text-foreground pt-1">
                  {f.aprovador_pergunta || `Avaliar: ${f.label}`}
                </div>
                <div className="flex gap-2">
                  {[
                    { v: "conforme", label: "Conforme", cls: "border-emerald-300 text-emerald-700" },
                    { v: "nao_conforme", label: "Não Conforme", cls: "border-red-300 text-red-700" },
                    { v: "na", label: "N/A", cls: "border-muted-foreground/30 text-muted-foreground" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => flow.updateApproverAnswer(f.id, { resposta: opt.v, peso: f.aprovador_peso || 1 })}
                      className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                        value === opt.v ? `${opt.cls} ring-2 ring-current/20 font-semibold` : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <Textarea
                  placeholder="Observação..."
                  className="text-xs min-h-[40px]"
                  value={draft?.observacao ?? existing?.observacao ?? ""}
                  onChange={(e) => flow.updateApproverAnswer(f.id, { observacao: e.target.value, peso: f.aprovador_peso || 1 })}
                />
              </div>
            );
          })}
        </div>
      )}

      {blockReasons.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <ul className="list-disc list-inside space-y-0.5">
              {blockReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs">Justificativa (obrigatória para reprovar/devolver)</Label>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo da decisão..."
          className="text-xs min-h-[60px]"
          maxLength={2000}
        />
      </div>

      <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleAction("reprovar_devolver")}
          disabled={flow.isSaving}
          className="border-red-300 text-red-700 hover:bg-red-50"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reprovar / Devolver
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          size="sm"
          onClick={() => handleAction("aprovar")}
          disabled={blockReasons.length > 0 || flow.isSaving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          <Send className="w-3.5 h-3.5 mr-1" />
          {flow.isSaving ? "Salvando..." : "Aprovar Final"}
        </Button>
      </div>
    </div>
  );
}

export function EmbeddedAuditPanel({ assignment, onClose }: ApprovalProps) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, { resposta: string; observacao: string }>>({});
  const [saving, setSaving] = useState(false);
  const questions = useMemo(() => {
    const snapItems = (assignment?.template_snapshot as any)?.ada_config_snapshot?.checklists?.validador;
    const source = Array.isArray(snapItems) && snapItems.length > 0 ? snapItems : VALIDADOR_PACOTE_PADRAO_DEFAULT.filter((p) => p.ativo !== false);
    return source.map((q: any, index: number) => ({
      id: q.tempId || q.id || `auditoria-${index}`,
      pergunta: q.pergunta_padrao || q.pergunta || "Pergunta de auditoria",
      peso: Number(q.peso) || 1,
    }));
  }, [assignment?.template_snapshot]);

  const allAnswered = questions.every((q) => !!answers[q.id]?.resposta);
  const saveAudit = async () => {
    if (!profile?.id || !assignment?.id || !allAnswered) return;
    setSaving(true);
    const now = new Date().toISOString();
    const payload = questions.map((q) => ({ ...q, ...answers[q.id] }));
    const { error: historyError } = await (supabase as any).from("operational_assignment_history").insert({
      assignment_id: assignment.id,
      tipo_evento: "AUDITORIA_REGISTRADA",
      usuario_id: profile.id,
      etapa: "auditoria",
      detalhes_json: { respostas: payload },
    });
    if (historyError) { setSaving(false); toast.error(historyError.message); return; }
    const { error: updateError } = await (supabase as any).from("operational_assignments").update({
      auditor_fim_em: now,
      auditado_em: now,
      auditado_por: profile.id,
    }).eq("id", assignment.id);
    setSaving(false);
    if (updateError) { toast.error(updateError.message); return; }
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
    toast.success("Auditoria registrada.");
    onClose();
  };

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground"><strong>Modo Auditor.</strong> Responda as perguntas de validação final.</div>
      </div>
      {questions.map((q) => (
        <div key={q.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
          <div className="text-sm font-medium text-foreground">{q.pergunta}</div>
          <div className="flex gap-2">
            {["conforme", "nao_conforme", "na"].map((v) => (
              <Button key={v} type="button" size="sm" variant={answers[q.id]?.resposta === v ? "default" : "outline"} onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: { resposta: v, observacao: prev[q.id]?.observacao || "" } }))}>
                {v === "conforme" ? "Conforme" : v === "nao_conforme" ? "Não conforme" : "N/A"}
              </Button>
            ))}
          </div>
          <Textarea className="text-xs min-h-[44px]" placeholder="Observação..." value={answers[q.id]?.observacao || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: { resposta: prev[q.id]?.resposta || "", observacao: e.target.value } }))} />
        </div>
      ))}
      <Button type="button" size="sm" onClick={saveAudit} disabled={!allAnswered || saving}>{saving ? "Salvando..." : "Concluir Auditoria"}</Button>
    </div>
  );
}
