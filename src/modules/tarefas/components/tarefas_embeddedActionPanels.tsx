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
  const { profile } = useAuth();
  const flow = useApprovalFlow(assignment?.id || null);
  const [step, setStep] = useState<"perguntas" | "plano">("perguntas");
  const [motivoFinal, setMotivoFinal] = useState("");
  const prazoPadraoHoras: number = Number(
    assignment?.template_snapshot?.prazo_plano_acao_padrao_horas
    ?? assignment?.prazo_plano_acao_padrao_horas
    ?? 24
  );
  const computeDefaultPrazo = () => {
    const d = new Date(Date.now() + prazoPadraoHoras * 3600 * 1000);
    // datetime-local precisa formato YYYY-MM-DDTHH:mm
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [planos, setPlanos] = useState<Record<string, {
    descricao_acao: string;
    prazo: string;
    prazo_padrao: string;
    justificativa_alteracao_prazo: string;
    criticidade: "baixa" | "media" | "alta";
  }>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, any>>({});

  const blockReasons = flow.getBlockingReasons(assignment);
  const approverFields = useMemo(() => fields.filter((f) => f.aprovador_verificar), [fields]);

  // Auto-save debounced (campo único)
  const scheduleAutoSave = (fieldId: string, payload: { resposta: string; observacao: string; peso: number; evidencia_url?: string | null }) => {
    if (saveTimers.current[fieldId]) clearTimeout(saveTimers.current[fieldId]);
    saveTimers.current[fieldId] = setTimeout(() => {
      flow.autoSaveApproverAnswer.mutate({
        fieldId,
        resposta: payload.resposta,
        observacao: payload.observacao,
        peso: payload.peso,
        evidenciaUrl: payload.evidencia_url ?? null,
      });
    }, 600);
  };

  const handleResposta = (f: SnapshotField, value: string) => {
    const draft = flow.approverAnswers[f.id];
    flow.updateApproverAnswer(f.id, { resposta: value, peso: f.aprovador_peso || 1 });
    scheduleAutoSave(f.id, {
      resposta: value,
      observacao: draft?.observacao ?? "",
      peso: f.aprovador_peso || 1,
      evidencia_url: draft?.evidencia_url ?? null,
    });
  };

  const handleObs = (f: SnapshotField, observacao: string) => {
    const draft = flow.approverAnswers[f.id];
    flow.updateApproverAnswer(f.id, { observacao, peso: f.aprovador_peso || 1 });
    scheduleAutoSave(f.id, {
      resposta: draft?.resposta ?? "",
      observacao,
      peso: f.aprovador_peso || 1,
      evidencia_url: draft?.evidencia_url ?? null,
    });
  };

  const handleEvidenceUpload = async (f: SnapshotField, file: File) => {
    if (!assignment?.id) return;
    setUploadingFor(f.id);
    try {
      const ext = file.name.split(".").pop();
      const path = `${assignment.id}/aprovador/${f.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("evidencias").upload(path, file);
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage.from("evidencias").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;
      const draft = flow.approverAnswers[f.id];
      flow.updateApproverAnswer(f.id, { evidencia_url: signed.signedUrl, peso: f.aprovador_peso || 1 });
      flow.autoSaveApproverAnswer.mutate({
        fieldId: f.id,
        resposta: draft?.resposta ?? "",
        observacao: draft?.observacao ?? "",
        peso: f.aprovador_peso || 1,
        evidenciaUrl: signed.signedUrl,
      });
      toast.success("Anexo salvo");
    } catch (e: any) {
      toast.error(`Falha no upload: ${e.message}`);
    } finally {
      setUploadingFor(null);
    }
  };

  // Quais perguntas estão marcadas como "nao_conforme"
  const naoConformes = useMemo(() => {
    return approverFields.filter(f => {
      const draft = flow.approverAnswers[f.id];
      const existing = flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const v = draft?.resposta ?? existing?.resposta;
      return v === "nao_conforme";
    });
  }, [approverFields, flow.approverAnswers, flow.existingApprovalAnswers]);

  const irParaPlano = () => {
    // Garante registros default no formulário
    const next: typeof planos = { ...planos };
    for (const f of naoConformes) {
      if (!next[f.id]) {
        const draft = flow.approverAnswers[f.id];
        next[f.id] = {
          descricao_acao: draft?.observacao ?? "",
          prazo: "",
          criticidade: "media",
        };
      }
    }
    setPlanos(next);
    setStep("plano");
  };

  const aprovarDireto = async () => {
    try {
      await flow.finalDecision.mutateAsync({ assignment, action: "aprovar" });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const submeterPlanos = async () => {
    const lista = naoConformes.map(f => {
      const p = planos[f.id];
      return {
        field_id: f.id,
        field_label: f.label,
        descricao_acao: p?.descricao_acao?.trim() || "",
        prazo_iso: p?.prazo ? new Date(p.prazo).toISOString() : "",
        criticidade: p?.criticidade || "media",
      };
    });
    const invalido = lista.find(p => !p.descricao_acao || !p.prazo_iso);
    if (invalido) { toast.error(`Preencha descrição e prazo para "${invalido.field_label}".`); return; }
    try {
      await flow.criarPlanosAcaoEDevolver.mutateAsync({ assignment, planos: lista, motivoGeral: motivoFinal });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const encerrarSemAprovar = async () => {
    if (!motivoFinal.trim()) { toast.error("Informe a justificativa para encerrar."); return; }
    try {
      await flow.finalDecision.mutateAsync({ assignment, action: "encerrar", motivo: motivoFinal });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  // ─── PASSO 2: PLANO DE AÇÃO FINAL ──────────────────────────────────
  if (step === "plano") {
    return (
      <div className="space-y-3">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
          <ClipboardList className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Plano de ação consolidado.</strong> Defina prazo, criticidade e descrição da ação para cada não conformidade. Ao confirmar, a tarefa retorna ao executor/setor.
          </div>
        </div>

        {naoConformes.map((f) => {
          const p = planos[f.id] || { descricao_acao: "", prazo: "", criticidade: "media" as const };
          return (
            <div key={f.id} className="border border-border rounded-lg p-3 bg-card space-y-2">
              <div className="text-sm font-medium text-foreground">{f.label}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Prazo</Label>
                  <Input
                    type="datetime-local"
                    value={p.prazo}
                    onChange={(e) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, prazo: e.target.value } }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Criticidade</Label>
                  <Select value={p.criticidade} onValueChange={(v) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, criticidade: v as any } }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Descrição da ação</Label>
                <Textarea
                  value={p.descricao_acao}
                  onChange={(e) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, descricao_acao: e.target.value } }))}
                  className="text-xs min-h-[50px]"
                  placeholder="O que precisa ser feito para corrigir..."
                />
              </div>
            </div>
          );
        })}

        <div className="space-y-1 pt-2 border-t border-border">
          <Label className="text-[11px]">Observação geral (opcional)</Label>
          <Textarea
            value={motivoFinal}
            onChange={(e) => setMotivoFinal(e.target.value)}
            className="text-xs min-h-[44px]"
            placeholder="Resumo da devolução..."
            maxLength={2000}
          />
        </div>

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setStep("perguntas")} disabled={flow.isSaving}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            size="sm"
            onClick={submeterPlanos}
            disabled={flow.isSaving}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Enviando..." : `Registrar ${naoConformes.length} plano(s) e devolver`}
          </Button>
        </div>
      </div>
    );
  }

  // ─── PASSO 1: PERGUNTAS DO APROVADOR ───────────────────────────────
  return (
    <div className="space-y-3">
      <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-purple-700 dark:text-purple-400 shrink-0 mt-0.5" />
        <div className="text-xs text-purple-800 dark:text-purple-300">
          <strong>Aprovação Final.</strong> Revise as respostas do executor. Toque em cada pergunta para confirmar, e marque "Não Conforme" para itens que precisam de plano de ação.
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Resumo</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Conformes</div>
            <div className="font-bold text-emerald-700">{approverFields.filter(f => {
              const v = flow.approverAnswers[f.id]?.resposta ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta;
              return v === "conforme";
            }).length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Não Conformes</div>
            <div className="font-bold text-red-700">{naoConformes.length}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Pendentes</div>
            <div className="font-bold text-amber-700">{approverFields.filter(f => {
              const v = flow.approverAnswers[f.id]?.resposta ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta;
              return !v;
            }).length}</div>
          </div>
        </div>
      </div>

      {approverFields.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Perguntas do Aprovador</p>
          {approverFields.map((f) => {
            const existing = flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
            const draft = flow.approverAnswers[f.id];
            const value = draft?.resposta ?? existing?.resposta ?? "";
            const obs = draft?.observacao ?? existing?.observacao ?? "";
            const evid = draft?.evidencia_url ?? existing?.evidencia_url ?? null;
            const execAnswer = (flow.fieldAnswers || []).find((a: any) => a.field_id === f.id);
            const exigeEvidNC = !!f.aprovador_exige_evidencia_nao;
            const isSavedHere = !!existing && (draft ? draft.resposta === existing.resposta && (draft.observacao ?? "") === (existing.observacao ?? "") : true);
            return (
              <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">{f.label}</div>
                  {isSavedHere && existing && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Salvo</span>
                  )}
                </div>

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
                      onClick={() => handleResposta(f, opt.v)}
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
                  value={obs}
                  onChange={(e) => handleObs(f, e.target.value)}
                />

                {/* Anexo do aprovador — só onde template exigir (NC) */}
                {exigeEvidNC && value === "nao_conforme" && (
                  <div className="space-y-1 border-t border-border/50 pt-2">
                    <Label className="text-[11px]">Anexo de comprovação (obrigatório)</Label>
                    {evid ? (
                      <div className="flex items-center gap-2">
                        <a href={evid} target="_blank" rel="noreferrer" className="text-xs text-primary underline inline-flex items-center gap-1 flex-1 truncate">
                          <ExternalLink className="w-3 h-3" /> Ver anexo enviado
                        </a>
                        <Button
                          type="button" size="sm" variant="ghost"
                          onClick={() => {
                            flow.updateApproverAnswer(f.id, { evidencia_url: null, peso: f.aprovador_peso || 1 });
                            flow.autoSaveApproverAnswer.mutate({
                              fieldId: f.id, resposta: value, observacao: obs,
                              peso: f.aprovador_peso || 1, evidenciaUrl: null,
                            });
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-xs cursor-pointer text-primary hover:underline">
                        <Upload className="w-3.5 h-3.5" />
                        {uploadingFor === f.id ? "Enviando..." : "Selecionar arquivo"}
                        <input
                          type="file"
                          className="hidden"
                          disabled={uploadingFor === f.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleEvidenceUpload(f, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}
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

      <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
        {profile && (assignment?.responsavel_id !== profile.id) && (
          <Button
            type="button" size="sm" variant="ghost"
            onClick={encerrarSemAprovar} disabled={flow.isSaving}
            className="text-muted-foreground"
            title="Encerrar sem aprovar (admin)"
          >
            Encerrar
          </Button>
        )}
        <div className="flex-1" />
        {naoConformes.length > 0 ? (
          <Button
            type="button" size="sm"
            onClick={irParaPlano}
            disabled={flow.isSaving || blockReasons.length > 0}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            Revisar e finalizar ({naoConformes.length} NC)
          </Button>
        ) : (
          <Button
            type="button" size="sm"
            onClick={aprovarDireto}
            disabled={blockReasons.length > 0 || flow.isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Salvando..." : "Aprovar Final"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * EmbeddedAuditPanel — usado quando current user é auditor
 *   status: aguardando_auditoria
 * ========================================================================= */
export function EmbeddedAuditPanel({ assignment, fields, onClose }: ApprovalProps) {
  // import lazy para evitar ciclo
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAuditFlow } = require("@/modules/tarefas/hooks/tarefas_useAuditFlow");
  const flow = useAuditFlow(assignment?.id || null);
  const [motivoFinal, setMotivoFinal] = useState("");
  const auditorFields = useMemo(() => fields.filter((f: any) => f.auditor_verificar), [fields]);
  const blockReasons = flow.getBlockingReasons(assignment);

  const saveTimers = useRef<Record<string, any>>({});
  const scheduleAutoSave = (fieldId: string, payload: any) => {
    if (saveTimers.current[fieldId]) clearTimeout(saveTimers.current[fieldId]);
    saveTimers.current[fieldId] = setTimeout(() => {
      flow.autoSaveAuditorAnswer.mutate({
        fieldId,
        resposta: payload.resposta,
        observacao: payload.observacao,
        evidenciaUrl: payload.evidencia_url ?? null,
        motivoAlteracao: payload.motivo_alteracao ?? null,
        herdada: payload.herdada ?? false,
      });
    }, 600);
  };

  const handleResposta = (f: any, value: string) => {
    const draft = flow.auditorAnswers[f.id];
    flow.updateAuditorAnswer(f.id, { resposta: value });
    scheduleAutoSave(f.id, {
      resposta: value, observacao: draft?.observacao ?? "",
      evidencia_url: draft?.evidencia_url ?? null,
      motivo_alteracao: draft?.motivo_alteracao ?? null,
      herdada: draft?.herdada ?? false,
    });
  };

  const handleObs = (f: any, observacao: string) => {
    const draft = flow.auditorAnswers[f.id];
    flow.updateAuditorAnswer(f.id, { observacao });
    scheduleAutoSave(f.id, {
      resposta: draft?.resposta ?? "", observacao,
      evidencia_url: draft?.evidencia_url ?? null,
      motivo_alteracao: draft?.motivo_alteracao ?? null,
      herdada: draft?.herdada ?? false,
    });
  };

  const aprovar = async () => {
    try { await flow.finalDecision.mutateAsync({ assignment, action: "aprovar" }); onClose(); }
    catch (e: any) { toast.error(e.message); }
  };
  const devolver = async () => {
    if (!motivoFinal.trim()) { toast.error("Justifique a devolução."); return; }
    try { await flow.finalDecision.mutateAsync({ assignment, action: "devolver", motivo: motivoFinal }); onClose(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground"><strong>Modo Auditor.</strong> Responda as perguntas de auditoria configuradas no template.</div>
      </div>

      {auditorFields.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhuma pergunta de auditoria configurada neste template.</p>
      ) : (
        auditorFields.map((f: any) => {
          const existing = flow.existingAuditAnswers.find((a: any) => a.field_id === f.id);
          const draft = flow.auditorAnswers[f.id];
          const value = draft?.resposta ?? existing?.resposta ?? "";
          const obs = draft?.observacao ?? existing?.observacao ?? "";
          const execAnswer = (flow.fieldAnswers || []).find((a: any) => a.field_id === f.id);
          return (
            <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
              <div className="text-sm font-medium text-foreground">{f.auditor_pergunta || `Auditar: ${f.label}`}</div>
              {execAnswer && (
                <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">Resposta executor: </span>
                  <strong>{execAnswer.valor_booleano === true ? "Conforme" : execAnswer.valor_booleano === false ? "Não Conforme" : execAnswer.valor_texto || "—"}</strong>
                </div>
              )}
              <div className="flex gap-2">
                {[
                  { v: "conforme", label: "Conforme", cls: "border-emerald-300 text-emerald-700" },
                  { v: "nao_conforme", label: "Não Conforme", cls: "border-red-300 text-red-700" },
                  { v: "na", label: "N/A", cls: "border-muted-foreground/30 text-muted-foreground" },
                ].map((opt) => (
                  <button key={opt.v} type="button" onClick={() => handleResposta(f, opt.v)}
                    className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                      value === opt.v ? `${opt.cls} ring-2 ring-current/20 font-semibold` : "border-border text-muted-foreground hover:bg-muted"
                    }`}>{opt.label}</button>
                ))}
              </div>
              <Textarea placeholder="Observação..." className="text-xs min-h-[40px]" value={obs} onChange={(e) => handleObs(f, e.target.value)} />
            </div>
          );
        })
      )}

      <div className="space-y-1 pt-2 border-t border-border">
        <Label className="text-[11px]">Justificativa (obrigatória para devolver)</Label>
        <Textarea value={motivoFinal} onChange={(e) => setMotivoFinal(e.target.value)} className="text-xs min-h-[44px]" maxLength={2000} />
      </div>

      {blockReasons.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
          {blockReasons.map((r: string, i: number) => <div key={i}>• {r}</div>)}
        </div>
      )}

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" size="sm" variant="outline" onClick={devolver} disabled={flow.isSaving}
          className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
        </Button>
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={aprovar} disabled={blockReasons.length > 0 || flow.isSaving}
          className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {flow.isSaving ? "Salvando..." : "Aprovar Final"}
        </Button>
      </div>
    </div>
  );
}
