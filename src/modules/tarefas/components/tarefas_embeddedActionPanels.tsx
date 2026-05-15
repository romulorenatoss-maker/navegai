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
import { useMemo, useState, useRef, useCallback } from "react";
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

type ReviewRule = {
  valor: string;
  label?: string;
  exige_observacao?: boolean;
  exige_evidencia?: boolean;
  gera_plano_acao?: boolean;
  permite_devolucao?: boolean;
};

const normalizeOptionKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const optionAliases = (value: unknown) => {
  const key = normalizeOptionKey(value);
  if (["conforme", "sim", "yes"].includes(key)) return [key, "conforme", "sim"];
  if (["nao_conforme", "nao", "não", "no"].includes(key)) return [key, "nao_conforme", "nao"];
  if (["n_a", "na", "nao_aplica", "nao_aplicavel"].includes(key)) return [key, "na", "n_a"];
  return [key];
};

const getRuleForResposta = (f: SnapshotField, resposta: string, scope: "aprovador" | "auditor"): ReviewRule | null => {
  const rules = (scope === "aprovador" ? f.aprovador_regras_por_opcao : f.auditor_regras_por_opcao) ?? [];
  const selectedAliases = optionAliases(resposta);
  const rule = rules.find((r) => {
    const keys = [...optionAliases(r.valor), ...optionAliases(r.label)];
    return keys.some(k => selectedAliases.includes(k));
  });
  if (rule) return rule;
  if (scope === "aprovador" && rules.length === 0 && resposta === "nao_conforme") {
    return {
      valor: "nao_conforme",
      exige_observacao: !!f.aprovador_obriga_observacao_nao,
      exige_evidencia: !!f.aprovador_exige_evidencia_nao,
      gera_plano_acao: true,
      permite_devolucao: true,
    };
  }
  return null;
};

const getReviewOptions = (f: SnapshotField, scope: "aprovador" | "auditor") => {
  const configured = scope === "aprovador" ? f.aprovador_opcoes : f.auditor_opcoes;
  const rules = scope === "aprovador" ? f.aprovador_regras_por_opcao : f.auditor_regras_por_opcao;
  const labels = (Array.isArray(configured) && configured.length > 0)
    ? configured
    : (Array.isArray(rules) && rules.length > 0)
      ? rules.map(r => r.label || r.valor)
      : ["Conforme", "Não Conforme", "N/A"];
  return labels.map(label => {
    const key = normalizeOptionKey(label);
    const v = key === "conforme" || key === "sim" ? "conforme"
      : key === "nao_conforme" || key === "nao" ? "nao_conforme"
      : key === "n_a" || key === "na" ? "na"
      : String(label);
    const danger = optionAliases(v).includes("nao_conforme");
    const neutral = optionAliases(v).includes("na");
    return {
      v,
      label: String(label),
      cls: danger ? "border-red-300 text-red-700" : neutral ? "border-muted-foreground/30 text-muted-foreground" : "border-emerald-300 text-emerald-700",
    };
  });
};

const getAllowedActions = (rule: ReviewRule | null) => [
  ...(rule?.gera_plano_acao ? ["plano" as const] : []),
  ...(rule?.permite_devolucao ? ["devolver" as const] : []),
];

const getDefaultReviewAction = (rule: ReviewRule | null): "plano" | "devolver" =>
  rule?.gera_plano_acao ? "plano" : "devolver";

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
    tipo_evidencia_exigida: "foto" | "video" | "descricao" | "nenhuma";
  }>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  // Por NC, o aprovador escolhe se vira plano de ação ou só devolução para refazer
  const [acaoPorNC, setAcaoPorNC] = useState<Record<string, "plano" | "devolver">>({});
  // Modal de confirmação de aprovação com perguntas AUTO do template
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Perguntas AUTO do template (ada_config_snapshot.checklists.aprovador)
  // Calcula se houve atraso global comparando fim_em com data_prevista + horario_limite
  const atrasouGlobal = useMemo(() => {
    const a = assignment;
    if (!a?.fim_em || !a?.data_prevista || !a?.horario_limite) return false;
    if (a.flag_sla_etapa_estourado) return true;
    try {
      const limite = new Date(`${String(a.data_prevista).slice(0, 10)}T${String(a.horario_limite).slice(0, 5)}:00`);
      const fim = new Date(a.fim_em);
      return fim > limite;
    } catch { return false; }
  }, [assignment]);

  // Calcula resposta automática por métrica baseado nas flags reais + cálculo de datas
  const calcRespostaAuto = useCallback((metrica: string): { resposta: "sim" | "nao" | null; label: string; tiraPonto: boolean } => {
    const a = assignment;
    if (!a) return { resposta: null, label: "Sem dados", tiraPonto: false };
    const teveDevolucao = (a.rodada_atual ?? 1) > 1;
    switch (metrica) {
      // ── Executor ──────────────────────────────────────────────────────
      case "executor_entregou_no_prazo":
        if (atrasouGlobal) return { resposta: "nao", label: "Não — entregou atrasado", tiraPonto: true };
        return { resposta: "sim", label: "Sim — dentro do prazo", tiraPonto: false };
      case "executor_teve_atraso_etapa":
        if (a.flag_sla_etapa_estourado || atrasouGlobal)
          return { resposta: "sim", label: "Sim — houve atraso", tiraPonto: true };
        return { resposta: "nao", label: "Não — sem atraso", tiraPonto: false };
      case "executor_teve_devolucao":
        if (teveDevolucao) return { resposta: "sim", label: "Sim — tarefa foi devolvida/plano gerado", tiraPonto: true };
        return { resposta: "nao", label: "Não — sem devolução", tiraPonto: false };
      // ── Plano de ação ─────────────────────────────────────────────────
      case "plano_acao_foi_criado":
        if (teveDevolucao) return { resposta: "sim", label: "Sim — plano de ação foi gerado", tiraPonto: true };
        return { resposta: "nao", label: "Não — sem plano de ação", tiraPonto: false };
      case "plano_acao_entregue_no_prazo":
        if (a.flag_atraso_plano_acao) return { resposta: "nao", label: "Não — entregue fora do prazo", tiraPonto: true };
        if (teveDevolucao) return { resposta: "sim", label: "Sim — entregue no prazo", tiraPonto: false };
        return { resposta: "nao", label: "Não houve plano de ação", tiraPonto: false };
      case "plano_acao_sla_estourado":
        if (a.flag_atraso_plano_acao) return { resposta: "sim", label: "Sim — SLA do plano estourou", tiraPonto: true };
        return { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
      case "plano_acao_prazo_prorrogado":
        if (a.flag_atraso_plano_acao) return { resposta: "sim", label: "Sim — prazo foi prorrogado", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      case "plano_acao_prazo_prorrogado_2x":
        if (a.flag_reincidencia_atraso) return { resposta: "sim", label: "Sim — prorrogado mais de 1 vez", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      // ── Aprovador (para auditor) ───────────────────────────────────────
      case "aprovador_respondeu_no_sla":
        return { resposta: null, label: "Calculado pelo sistema", tiraPonto: false };
      case "aprovador_reabriu_tarefa":
        if (teveDevolucao) return { resposta: "sim", label: "Sim — devolveu tarefa", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      case "aprovador_aprovou_com_pendencia":
        return { resposta: null, label: "Calculado pelo sistema", tiraPonto: false };
      default:
        return { resposta: null, label: "Avaliação manual", tiraPonto: false };
    }
  }, [assignment, atrasouGlobal]);

  // Perguntas que não fazem sentido existir (sempre verdadeiras, não agregam informação)
  const METRICAS_REMOVIDAS = new Set([
    "executor_obrigatorias_respondidas",
    "executor_evidencias_anexadas",
  ]);

  const perguntasAutoTemplate = useMemo(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.aprovador;
    if (!Array.isArray(lista)) return [];
    return lista.filter((p: any) =>
      p.ativo !== false &&
      !METRICAS_REMOVIDAS.has(p.metrica_calculo ?? "")
    );
  }, [assignment]);

  const [respostasAuto, setRespostasAuto] = useState<Record<string, { na: boolean; justificativa: string }>>({});

  const totalNotaAuto = useMemo(() =>
    perguntasAutoTemplate.reduce((sum: number, p: any) => {
      const r = respostasAuto[p.tempId ?? p.id ?? p.pergunta];
      if (r?.na) return sum;
      return sum + (Number(p.peso) || 0);
    }, 0),
    [perguntasAutoTemplate, respostasAuto]
  );

  const saveTimers = useRef<Record<string, any>>({});

  const baseBlockReasons = flow.getBlockingReasons(assignment);
  const approverFields = useMemo(
    () => fields.filter((f) => !["secao", "divisor", "titulo"].includes(String(f.tipo))),
    [fields]
  );

  const totalNotaAvaliado = useMemo(() =>
    approverFields.reduce((sum, f) => sum + (f.aprovador_peso || 1), 0),
    [approverFields]
  );

  const blockReasons = useMemo(() => {
    const ruleReasons = approverFields.flatMap((f) => {
      const existing = flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const draft = flow.approverAnswers[f.id];
      const resposta = draft?.resposta ?? existing?.resposta ?? "";
      const rule = resposta ? getRuleForResposta(f, resposta, "aprovador") : null;
      const obs = (draft?.observacao ?? existing?.observacao ?? "").trim();
      const evid = draft?.evidencia_url ?? existing?.evidencia_url ?? null;
      const reasons: string[] = [];
      if (rule?.exige_observacao && !obs) reasons.push(`Observação obrigatória em "${f.label}".`);
      if (rule?.exige_evidencia && !evid) reasons.push(`Evidência obrigatória em "${f.label}".`);
      return reasons;
    });
    return [...baseBlockReasons, ...ruleReasons];
  }, [baseBlockReasons, approverFields, flow.approverAnswers, flow.existingApprovalAnswers]);

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

  // Perguntas cuja opção selecionada pede plano de ação ou devolução.
  const perguntasComAcao = useMemo(() => {
    return approverFields.filter(f => {
      const draft = flow.approverAnswers[f.id];
      const existing = flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id);
      const v = draft?.resposta ?? existing?.resposta;
      const rule = v ? getRuleForResposta(f, v, "aprovador") : null;
      return !!rule?.gera_plano_acao || !!rule?.permite_devolucao;
    });
  }, [approverFields, flow.approverAnswers, flow.existingApprovalAnswers]);

  const naoConformesPlano = useMemo(
    () => perguntasComAcao.filter(f => {
      const v = flow.approverAnswers[f.id]?.resposta ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta;
      const rule = v ? getRuleForResposta(f, v, "aprovador") : null;
      return getAllowedActions(rule).includes("plano") && (acaoPorNC[f.id] ?? getDefaultReviewAction(rule)) === "plano";
    }),
    [perguntasComAcao, acaoPorNC, flow.approverAnswers, flow.existingApprovalAnswers]
  );
  const naoConformesDevolver = useMemo(
    () => perguntasComAcao.filter(f => {
      const v = flow.approverAnswers[f.id]?.resposta ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta;
      const rule = v ? getRuleForResposta(f, v, "aprovador") : null;
      return getAllowedActions(rule).includes("devolver") && (acaoPorNC[f.id] ?? getDefaultReviewAction(rule)) === "devolver";
    }),
    [perguntasComAcao, acaoPorNC, flow.approverAnswers, flow.existingApprovalAnswers]
  );

  const irParaPlano = () => {
    // Garante registros default no formulário (com prazo padrão pré-aplicado)
    const next: typeof planos = { ...planos };
    const defaultPrazo = computeDefaultPrazo();
    for (const f of naoConformesPlano) {
      if (!next[f.id]) {
        const draft = flow.approverAnswers[f.id];
        next[f.id] = {
          descricao_acao: draft?.observacao ?? "",
          prazo: defaultPrazo,
          prazo_padrao: defaultPrazo,
          justificativa_alteracao_prazo: "",
          criticidade: "media",
          tipo_evidencia_exigida: "descricao",
        };
      }
    }
    setPlanos(next);
    setStep("plano");
  };

  const aprovarDireto = async () => {
    setShowConfirmModal(true);
  };

  const confirmarAprovacao = async () => {
    // Valida justificativas de N/A obrigatórias
    for (const p of perguntasAutoTemplate) {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const r = respostasAuto[key];
      if (r?.na && !r?.justificativa?.trim()) {
        toast.error(`Justificativa obrigatória para N/A em: "${p.pergunta}"`);
        return;
      }
    }

    // Calcula nota final para gravar no banco
    const fieldsComPlano = new Set(
      (flow.fieldReviews as any[])
        .filter((r: any) => r.devolvido === true)
        .map((r: any) => r.field_id)
    );

    const notaAutoFinal = perguntasAutoTemplate.reduce((sum: number, p: any) => {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const r = respostasAuto[key] ?? { na: false };
      const auto = calcRespostaAuto(p.metrica_calculo ?? "manual");
      if (r.na) return sum + (p.peso || 0); // N/A mantém nota
      if (auto.tiraPonto) return sum; // penalidade
      return sum + (p.peso || 0);
    }, 0);

    const notaAvaliadorFinal = approverFields.reduce((sum: number, f: any) => {
      const keyNA = `avaliado_na_${f.id}`;
      const rNA = respostasAuto[keyNA] ?? { na: false };
      const tevePlano = fieldsComPlano.has(f.id);
      if (tevePlano && !rNA.na) return sum;
      return sum + (f.aprovador_peso || 1);
    }, 0);

    const notaFinalTotal = notaAutoFinal + notaAvaliadorFinal;

    try {
      // Grava nota no assignment antes de fechar
      await (supabase as any)
        .from("operational_assignments")
        .update({
          score_avaliado: notaFinalTotal,
          score_final_ajustado: notaFinalTotal,
          pontuacao_obtida: notaFinalTotal,
        })
        .eq("id", assignment.id);

      // Se destino_score = setor, propaga nota para todos do setor avaliado
      const destino = assignment?.template_snapshot?.destino_score
        ?? assignment?.operational_templates?.destino_score
        ?? "individual";

      if (destino === "setor" && assignment?.setor_avaliado_id) {
        const { data: membros } = await (supabase as any)
          .from("colaborador_setores")
          .select("profile_id")
          .eq("setor_id", assignment.setor_avaliado_id);

        if (membros && membros.length > 0) {
          await (supabase as any).from("operational_execution_logs").insert({
            assignment_id: assignment.id,
            acao: "nota_distribuida_setor",
            executado_por: profile?.id,
            detalhes: {
              nota_final: notaFinalTotal,
              destino_score: "setor",
              setor_id: assignment.setor_avaliado_id,
              membros: membros.map((m: any) => m.profile_id),
              distribuido_em: new Date().toISOString(),
            },
          });
        }
      }

      await flow.finalDecision.mutateAsync({ assignment, action: "aprovar" });
      setShowConfirmModal(false);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  // Devolve apenas as NCs marcadas como "devolver" (sem plano).
  // Quando NÃO há nenhuma NC marcada como "plano", isto encerra a revisão.
  const devolverApenas = async () => {
    const perguntas = naoConformesDevolver.map(f => ({
      field_id: f.id,
      field_label: f.label,
      motivo: (flow.approverAnswers[f.id]?.observacao
        ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.observacao
        ?? "").trim(),
    }));
    const semMotivo = perguntas.find(p => !p.motivo);
    if (semMotivo) {
      toast.error(`Escreva uma observação (motivo) em "${semMotivo.field_label}" antes de devolver.`);
      return;
    }
    try {
      await flow.devolverPerguntasParaRefazer.mutateAsync({ assignment, perguntas, motivoGeral: motivoFinal });
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const submeterPlanos = async () => {
    const lista = naoConformesPlano.map(f => {
      const p = planos[f.id];
      const prazoAlterado = !!(p?.prazo && p?.prazo_padrao && p.prazo !== p.prazo_padrao);
      return {
        field_id: f.id,
        field_label: f.label,
        descricao_acao: p?.descricao_acao?.trim() || "",
        prazo_iso: p?.prazo ? new Date(p.prazo).toISOString() : "",
        prazo_padrao_iso: p?.prazo_padrao ? new Date(p.prazo_padrao).toISOString() : null,
        prazo_alterado: prazoAlterado,
        justificativa_alteracao_prazo: prazoAlterado ? (p?.justificativa_alteracao_prazo?.trim() || "") : null,
        criticidade: p?.criticidade || "media" as const,
        tipo_evidencia_exigida: p?.tipo_evidencia_exigida || "descricao",
      };
    });
    const invalidoBasico = lista.find(p => !p.descricao_acao || !p.prazo_iso);
    if (invalidoBasico) { toast.error(`Preencha descrição e prazo para "${invalidoBasico.field_label}".`); return; }
    const invalidoJust = lista.find(p => p.prazo_alterado && !p.justificativa_alteracao_prazo);
    if (invalidoJust) { toast.error(`Justifique a alteração do prazo padrão em "${invalidoJust.field_label}".`); return; }
    try {
      // Se houver perguntas marcadas para apenas devolver, marca-as como devolvidas antes
      // (mesma transição final do plano cobre status). Inserções diretas em field_reviews.
      if (naoConformesDevolver.length > 0) {
        const perguntasDev = naoConformesDevolver.map(f => ({
          field_id: f.id,
          field_label: f.label,
          motivo: (flow.approverAnswers[f.id]?.observacao
            ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.observacao
            ?? "").trim(),
        }));
        const semMotivoDev = perguntasDev.find(p => !p.motivo);
        if (semMotivoDev) {
          toast.error(`Escreva uma observação (motivo) na pergunta "${semMotivoDev.field_label}" marcada como devolver.`);
          return;
        }
        // Insere apenas os reviews (devolvido=true) reaproveitando o RPC; transição vem do criarPlanosAcaoEDevolver.
        const rodada = assignment.rodada_atual || 1;
        for (const p of perguntasDev) {
          const existing = (flow.fieldReviews as any[]).find(
            (r: any) => r.field_id === p.field_id && r.rodada === rodada
          );
          const answerExec = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === p.field_id);
          const payload: any = {
            assignment_id: assignment.id,
            field_id: p.field_id,
            answer_id: answerExec?.id ?? null,
            conforme: false,
            devolvido: true,
            motivo_devolucao: p.motivo,
            observacao: p.motivo,
            rodada,
            avaliador_id: (assignment as any)?.aprovador_id ?? undefined,
            avaliado_em: new Date().toISOString(),
          };
          if (existing) {
            await (supabase as any).from("operational_field_reviews").update(payload).eq("id", existing.id);
          } else {
            await (supabase as any).from("operational_field_reviews").insert(payload);
          }
        }
      }
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

        {naoConformesPlano.map((f) => {
          const p = planos[f.id] || {
            descricao_acao: "",
            prazo: computeDefaultPrazo(),
            prazo_padrao: computeDefaultPrazo(),
            justificativa_alteracao_prazo: "",
            criticidade: "media" as const,
            tipo_evidencia_exigida: "descricao" as const,
          };
          const prazoAlterado = !!(p.prazo && p.prazo_padrao && p.prazo !== p.prazo_padrao);
          return (
            <div key={f.id} className="border border-border rounded-lg p-3 bg-card space-y-2">
              <div className="text-sm font-medium text-foreground">{f.label}</div>
              <div className="space-y-1 pb-1">
                <Label className="text-[11px]">Evidência exigida do executor</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { v: "foto", label: "📷 Foto" },
                    { v: "video", label: "🎥 Vídeo" },
                    { v: "descricao", label: "✏️ Descrição" },
                    { v: "nenhuma", label: "Nenhuma" },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPlanos(prev => ({ ...prev, [f.id]: { ...p, tipo_evidencia_exigida: opt.v } }))}
                      className={`px-2 py-1 rounded border text-xs transition-colors ${
                        (p.tipo_evidencia_exigida ?? "descricao") === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">
                    Prazo {prazoAlterado && <span className="text-amber-600 font-semibold">(alterado do padrão)</span>}
                  </Label>
                  <Input
                    type="datetime-local"
                    value={p.prazo}
                    onChange={(e) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, prazo: e.target.value } }))}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Padrão: {prazoPadraoHoras}h</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Criticidade</Label>
                  <Select value={p.criticidade} onValueChange={(v) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, criticidade: v as "baixa" | "media" | "alta" } }))}>
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
              {prazoAlterado && (
                <div className="space-y-1 border-t border-amber-200 pt-2 bg-amber-50/50 dark:bg-amber-950/20 -mx-3 px-3 -mb-3 pb-3 rounded-b-lg">
                  <Label className="text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                    Justificativa para alterar o prazo padrão (obrigatória) — visível ao auditor
                  </Label>
                  <Textarea
                    value={p.justificativa_alteracao_prazo}
                    onChange={(e) => setPlanos(prev => ({ ...prev, [f.id]: { ...p, justificativa_alteracao_prazo: e.target.value } }))}
                    className="text-xs min-h-[40px]"
                    placeholder="Por que o prazo foi estendido além do padrão..."
                  />
                </div>
              )}
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
            {flow.isSaving ? "Enviando..." : `Registrar ${naoConformesPlano.length} plano(s)${naoConformesDevolver.length ? ` + devolver ${naoConformesDevolver.length}` : ""} e devolver tarefa`}
          </Button>
        </div>
      </div>
    );
  }

  // Modal de confirmação de aprovação
  if (showConfirmModal) {
    return (
      <div className="space-y-4">
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-800 dark:text-emerald-300">
            <strong>Confirmar Aprovação.</strong> Revise as notas automáticas abaixo antes de confirmar. Marque N/A com justificativa se alguma não se aplicar.
          </div>
        </div>

        {/* Lista corrida unificada: perguntas AUTO + perguntas do Avaliado */}
        <div className="space-y-2">
          {(() => {
            const fieldsComPlano = new Set(
              (flow.fieldReviews as any[])
                .filter((r: any) => r.devolvido === true)
                .map((r: any) => r.field_id)
            );

            // Nota efetiva após penalidades (o que o avaliado realmente ganhou)
            const notaAutoTotal = perguntasAutoTemplate.reduce((sum: number, p: any) => {
              const key = p.tempId ?? p.id ?? p.pergunta;
              const r = respostasAuto[key] ?? { na: false };
              const auto = calcRespostaAuto(p.metrica_calculo ?? "manual");
              if (r.na) return sum + (p.peso || 0); // N/A mantém nota
              if (auto.tiraPonto) return sum;        // penalidade = 0
              return sum + (p.peso || 0);
            }, 0);

            // Nota máxima possível (soma de todos os pesos)
            const notaMaximaAuto = perguntasAutoTemplate.reduce((sum: number, p: any) => sum + (p.peso || 0), 0);
            const notaMaximaAvaliado = approverFields.reduce((sum: number, f: any) => sum + (f.aprovador_peso || 1), 0);
            const notaMaximaTotal = notaMaximaAuto + notaMaximaAvaliado;

            const notaAvaliadorTotal = approverFields.reduce((sum: number, f: any) => {
              const keyNA = `avaliado_na_${f.id}`;
              const rNA = respostasAuto[keyNA] ?? { na: false };
              const tevePlano = fieldsComPlano.has(f.id);
              if (tevePlano && !rNA.na) return sum; // perdeu ponto
              return sum + (f.aprovador_peso || 1);
            }, 0);

            const notaEfetivaTotal = notaAutoTotal + notaAvaliadorTotal;

            let idx = 0;

            return (
              <>
                {perguntasAutoTemplate.map((p: any) => {
                  idx++;
                  const key = p.tempId ?? p.id ?? p.pergunta;
                  const r = respostasAuto[key] ?? { na: false, justificativa: "" };
                  const auto = calcRespostaAuto(p.metrica_calculo ?? "manual");
                  const currentIdx = idx;
                  return (
                    <div key={key} className={`border rounded-lg p-3 space-y-2 ${r.na ? "opacity-70 bg-muted/20 border-border" : auto.tiraPonto ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0 mt-0.5">{currentIdx}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{p.pergunta}</p>
                          {auto.resposta && !r.na && (
                            <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${auto.tiraPonto ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
                              {auto.tiraPonto ? "✗" : "✓"} {auto.label}
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Nota: <span className={`font-semibold ${auto.tiraPonto && !r.na ? "text-red-600 line-through" : "text-emerald-600"}`}>{p.peso} pts</span>
                            {auto.tiraPonto && !r.na && <span className="text-red-600 ml-1">→ 0 pts</span>}
                            {r.na && <span className="text-amber-600 ml-1">→ N/A (nota mantida)</span>}
                          </p>
                        </div>
                        {p.permite_na !== false && (
                          <label className="flex items-center gap-1 shrink-0 cursor-pointer mt-0.5">
                            <input type="checkbox" checked={r.na}
                              onChange={(e) => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, na: e.target.checked } }))}
                              className="w-3.5 h-3.5" />
                            <span className="text-[11px] text-muted-foreground">N/A</span>
                          </label>
                        )}
                      </div>
                      {r.na && (
                        <div className="space-y-1 ml-7">
                          <Label className="text-[10px] text-amber-700">Justificativa obrigatória — por que N/A? (nota será mantida)</Label>
                          <Textarea value={r.justificativa}
                            onChange={(e) => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, justificativa: e.target.value } }))}
                            placeholder="Por que este item não se aplica..."
                            className="text-xs min-h-[36px]" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {approverFields.map((f: any) => {
                  idx++;
                  const tevePlano = fieldsComPlano.has(f.id);
                  const keyNA = `avaliado_na_${f.id}`;
                  const rNA = respostasAuto[keyNA] ?? { na: false, justificativa: "" };
                  const currentIdx = idx;
                  return (
                    <div key={f.id} className={`border rounded-lg p-3 space-y-2 ${tevePlano && !rNA.na ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" : rNA.na ? "opacity-70 bg-muted/20 border-border" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0 mt-0.5">{currentIdx}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{f.label}</p>
                          {tevePlano && !rNA.na && (
                            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400">
                              ✗ Teve plano de ação — penalidade
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Nota: <span className={`font-semibold ${tevePlano && !rNA.na ? "text-red-600 line-through" : "text-emerald-600"}`}>{f.aprovador_peso || 1} pts</span>
                            {tevePlano && !rNA.na && <span className="text-red-600 ml-1">→ 0 pts</span>}
                            {rNA.na && <span className="text-amber-600 ml-1">→ N/A (nota mantida)</span>}
                          </p>
                        </div>
                        {tevePlano && (
                          <label className="flex items-center gap-1 shrink-0 cursor-pointer mt-0.5">
                            <input type="checkbox" checked={rNA.na}
                              onChange={(e) => setRespostasAuto(prev => ({ ...prev, [keyNA]: { ...rNA, na: e.target.checked } }))}
                              className="w-3.5 h-3.5" />
                            <span className="text-[11px] text-muted-foreground">N/A</span>
                          </label>
                        )}
                      </div>
                      {tevePlano && rNA.na && (
                        <div className="space-y-1 ml-7">
                          <Label className="text-[10px] text-amber-700">Justificativa obrigatória — por que N/A? (nota será mantida)</Label>
                          <Textarea value={rNA.justificativa}
                            onChange={(e) => setRespostasAuto(prev => ({ ...prev, [keyNA]: { ...rNA, justificativa: e.target.value } }))}
                            placeholder="Por que o plano de ação não deve penalizar esta pergunta..."
                            className="text-xs min-h-[36px]" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {(() => {
                  const destino = assignment?.template_snapshot?.destino_score
                    ?? assignment?.operational_templates?.destino_score
                    ?? "individual";
                  return (
                    <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Nota final do Avaliado</span>
                        <div className="flex flex-col items-end">
                          <span className="text-primary text-lg font-bold">{notaEfetivaTotal} pts</span>
                          <span className="text-[11px] text-muted-foreground">de {notaMaximaTotal} pts possíveis</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {destino === "setor"
                          ? "📊 Nota distribuída para todos os membros do setor avaliado"
                          : "👤 Nota atribuída individualmente ao avaliado"}
                      </p>
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </div>

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowConfirmModal(false)} disabled={flow.isSaving}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
          </Button>
          <div className="flex-1" />
          <Button
            type="button" size="sm"
            onClick={confirmarAprovacao}
            disabled={flow.isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Aprovando..." : "Confirmar Aprovação"}
          </Button>
        </div>
      </div>
    );
  }

  // ─── PASSO 1: PERGUNTAS DO APROVADOR ───────────────────────────────
  return (
    <div className="space-y-3">
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
            <div className="text-muted-foreground">Com ação</div>
            <div className="font-bold text-red-700">{perguntasComAcao.length}</div>
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
            const selectedRule = value ? getRuleForResposta(f, value, "aprovador") : null;
            const allowedActions = getAllowedActions(selectedRule);
            const selectedAction = acaoPorNC[f.id] ?? getDefaultReviewAction(selectedRule);
            const isSavedHere = !!existing && (draft ? draft.resposta === existing.resposta && (draft.observacao ?? "") === (existing.observacao ?? "") : true);
            return (
              <div key={f.id} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">{f.label}</div>
                  {isSavedHere && existing && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Salvo</span>
                  )}
                </div>
                {/* Histórico: devoluções anteriores desta pergunta */}
                {(() => {
                  const devolucoes = (flow.fieldReviews as any[]).filter(
                    (r: any) => r.field_id === f.id && r.devolvido === true
                  );
                  if (devolucoes.length === 0) return null;
                  return (
                    <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-2 text-[11px] text-orange-800 dark:text-orange-300">
                      <div className="font-semibold mb-0.5">
                        Devolvida {devolucoes.length}x ao executor
                      </div>
                      {devolucoes.slice(0, 2).map((d: any) => (
                        <div key={d.id} className="opacity-80">
                          Rodada {d.rodada}: {d.motivo_devolucao || d.observacao || "—"}
                        </div>
                      ))}
                    </div>
                  );
                })()}

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

                <div className="flex gap-2 pt-1">
                  {getReviewOptions(f, "aprovador").map((opt) => (
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

                {/* Seletor de ação: aparece apenas se a opção marcada permitir plano/devolução */}
                {allowedActions.length > 0 && (
                  <div className="border-t border-border/50 pt-2 space-y-1">
                    <Label className="text-[11px]">Tratamento desta resposta</Label>
                    <div className="flex gap-2">
                      {[
                        { v: "plano", label: "Plano de ação", cls: "border-amber-300 text-amber-700" },
                        { v: "devolver", label: "Devolver p/ refazer", cls: "border-orange-300 text-orange-700" },
                      ].filter(opt => allowedActions.includes(opt.v as "plano" | "devolver")).map(opt => {
                        const sel = selectedAction === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => setAcaoPorNC(prev => ({ ...prev, [f.id]: opt.v as "plano" | "devolver" }))}
                            className={`flex-1 text-xs px-2 py-1.5 rounded border transition-colors ${
                              sel ? `${opt.cls} ring-2 ring-current/20 font-semibold` : "border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedAction === "plano"
                        ? "Será criado um plano de ação com prazo na próxima etapa."
                        : "Esta pergunta volta ao executor para refazer (a observação acima vira o motivo)."}
                    </p>
                  </div>
                )}

                {/* Anexo do aprovador — só onde a regra da opção marcada exigir */}
                {selectedRule?.exige_evidencia && (
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
            type="button" size="sm" variant="outline"
            onClick={encerrarSemAprovar} disabled={flow.isSaving}
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            title="Devolver toda a tarefa para refazer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver toda tarefa pra refazer
          </Button>
        )}
        <div className="flex-1" />
        {perguntasComAcao.length > 0 ? (
          <Button
            type="button" size="sm"
            onClick={() => {
              if (naoConformesPlano.length > 0) {
                irParaPlano();
              } else {
                devolverApenas();
              }
            }}
            disabled={flow.isSaving || blockReasons.length > 0}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            title={
              naoConformesPlano.length > 0 && naoConformesDevolver.length > 0
                ? `${naoConformesPlano.length} plano(s) + ${naoConformesDevolver.length} devolução(ões)`
                : naoConformesPlano.length > 0
                ? `${naoConformesPlano.length} plano(s) de ação`
                : `${naoConformesDevolver.length} devolução(ões)`
            }
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            Finalizar revisão ({perguntasComAcao.length} ação
            {naoConformesPlano.length > 0 && naoConformesDevolver.length > 0
              ? `: ${naoConformesPlano.length} plano + ${naoConformesDevolver.length} devolver`
              : ""})
          </Button>
        ) : (
          <Button
            type="button" size="sm"
            onClick={aprovarDireto}
            disabled={blockReasons.length > 0 || flow.isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Salvando..." : "Aprovar"}
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

  // Alertas/anormalidades para o auditor revisar
  const approvalAnswers = (flow.approvalAnswers || []) as any[];
  const planosComPrazoAlterado = approvalAnswers.filter(a => a.flag_prazo_alterado);
  const atrasos = approvalAnswers.filter(a => a.resolucao_atrasada);
  const fieldById = (id: string) => fields.find((f: any) => f.id === id);
  const slaEtapa = !!assignment?.flag_sla_etapa_estourado;
  const reincidencia = !!assignment?.flag_reincidencia_atraso;
  const temAlertas = planosComPrazoAlterado.length > 0 || atrasos.length > 0 || slaEtapa || reincidencia;

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground"><strong>Modo Auditor.</strong> Responda as perguntas de auditoria configuradas no template.</div>
      </div>

      {temAlertas && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <strong className="text-xs uppercase tracking-wider">Anormalidades detectadas</strong>
          </div>
          {reincidencia && (
            <div className="text-xs text-red-700 font-semibold bg-red-50 border border-red-200 rounded px-2 py-1">
              ⚠ Reincidência de atraso em plano de ação
            </div>
          )}
          {slaEtapa && (
            <div className="text-xs text-amber-800">
              <strong>SLA da etapa estourado.</strong>
              {assignment?.justificativa_sla_etapa && <> Justificativa: <em>{assignment.justificativa_sla_etapa}</em></>}
            </div>
          )}
          {planosComPrazoAlterado.map((a) => {
            const f = fieldById(a.field_id);
            return (
              <div key={`pa-${a.id}`} className="text-xs text-amber-800 border-t border-amber-200 pt-1">
                <strong>Prazo alterado pelo aprovador</strong> em "{f?.label || a.field_id}".
                {a.justificativa_alteracao_prazo && <> Justificativa: <em>{a.justificativa_alteracao_prazo}</em></>}
              </div>
            );
          })}
          {atrasos.map((a) => {
            const f = fieldById(a.field_id);
            return (
              <div key={`at-${a.id}`} className="text-xs text-red-800 border-t border-amber-200 pt-1">
                <strong>Atraso na execução do plano</strong> em "{f?.label || a.field_id}".
                {a.plano_acao_prazo && <> Prazo: {new Date(a.plano_acao_prazo).toLocaleString("pt-BR")} → resolvido: {a.resolvido_em ? new Date(a.resolvido_em).toLocaleString("pt-BR") : "—"}.</>}
                {a.justificativa_atraso && <> Justificativa do executor: <em>{a.justificativa_atraso}</em></>}
              </div>
            );
          })}
        </div>
      )}

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
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {flow.isSaving ? "Salvando..." : "Aprovar"}
        </Button>
      </div>
    </div>
  );
}
