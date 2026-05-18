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
import { CheckCircle2, XCircle, RotateCcw, Send, Play, AlertTriangle, ShieldCheck, ExternalLink, Upload, ArrowLeft, ClipboardList, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAssignmentReview } from "@/modules/tarefas/hooks/tarefas_useAssignmentReview";
import { useApprovalFlow } from "@/modules/tarefas/hooks/tarefas_useApprovalFlow";
import { useAuditFlow } from "@/modules/tarefas/hooks/tarefas_useAuditFlow";
import { ReviewFieldCard } from "@/modules/tarefas/components/tarefas_reviewFieldCard";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { SnapshotField, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";

/* =========================================================================
 * Helpers defensivos de leitura (somente UI) — não alteram dados.
 * Tolerantes a variações de nomes de campos retornados pelo flow.
 * ========================================================================= */
const sameId = (a: any, b: any) => String(a ?? "") === String(b ?? "");

const normalizeAnswer = (value: any): "conforme" | "nao_conforme" | "na" | null => {
  if (value === true) return "conforme";
  if (value === false) return "nao_conforme";
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["conforme", "ok", "true", "sim", "c"].includes(raw)) return "conforme";
  if (["nao_conforme", "não conforme", "nao conforme", "nc", "false", "nao", "não", "n"].includes(raw)) return "nao_conforme";
  if (["na", "n/a", "nao_aplica", "não aplica", "nao aplica", "nao se aplica", "não se aplica", "nao_se_aplica"].includes(raw)) return "na";
  return null;
};

const getFieldId = (item: any) =>
  item?.field_id ?? item?.campo_id ?? item?.pergunta_id ?? item?.question_id ?? item?.checklist_item_id ?? null;

const getAnswerValue = (item: any) => {
  if (item == null) return null;

  if (item.valor_booleano === true) return "conforme";
  if (item.valor_booleano === false) return "nao_conforme";

  // N/A salvo como valor_texto = "na" (para distinguir de null = não respondido)
  if (item.valor_texto === "na") return "na";

  const direct =
    item?.resposta ??
    item?.answer ??
    item?.valor ??
    item?.value ??
    item?.status ??
    item?.resultado ??
    item?.valor_texto ??
    item?.texto ??
    item?.label ??
    item?.opcao ??
    null;

  if (direct != null && String(direct).trim() !== "") return direct;

  const json = item?.valor_json;
  if (json && typeof json === "object") {
    return (
      json.resposta ??
      json.answer ??
      json.valor ??
      json.value ??
      json.status ??
      json.resultado ??
      json.opcao ??
      json.option ??
      json.label ??
      json.texto ??
      null
    );
  }

  return null;
};

const getObservation = (item: any) =>
  item?.observacao ?? item?.observation ?? item?.comentario ?? item?.comment ?? item?.justificativa ?? "";

const getEvidence = (item: any) =>
  item?.evidencia_url ?? item?.evidencia ?? item?.evidence ?? item?.arquivo ?? item?.anexo ?? item?.attachment ?? item?.attachments ?? item?.file_url ?? item?.url ?? null;

const findOriginalFieldAnswer = (field: any, flow: any) => {
  const answers = Array.isArray(flow?.fieldAnswers) ? flow.fieldAnswers : [];

  // resposta original = registro do campo real, sem sufixo de plano de ação
  const matches = answers.filter((a: any) => {
    const fid = String(getFieldId(a) ?? "");
    if (!fid) return false;
    if (fid.includes("__plano_acao__")) return false;
    return sameId(fid, field?.id);
  });

  if (matches.length === 0) return null;

  // pegar sempre a primeira resposta original válida
  const withValue = matches.find((a: any) => normalizeAnswer(getAnswerValue(a)) !== null);
  if (withValue) return withValue;

  return matches[0];
};

const findExecutorPlanResponse = (field: any, review: any, contingency: any, flow: any) => {
  const answers = Array.isArray(flow?.fieldAnswers) ? flow.fieldAnswers : [];
  const reviewRound = Number(review?.rodada ?? review?.round ?? 1);
  const planResponseFieldId = `${field?.id}__plano_acao__r${reviewRound}`;

  const bySyntheticId = answers.find((answer: any) =>
    sameId(getFieldId(answer), planResponseFieldId)
  );

  if (bySyntheticId) return bySyntheticId;

  // fallback defensivo para dados antigos
  return answers.find((answer: any) => {
    const fid = String(getFieldId(answer) ?? "");
    if (!fid.includes("__plano_acao__")) return false;
    return fid.startsWith(`${field?.id}__plano_acao__`);
  }) ?? null;
};

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
  type ItemPlano = {
    tipo: "foto" | "video" | "audio" | "texto";
    titulo: string;
    obrigatorio: boolean;
  };
  const [planos, setPlanos] = useState<Record<string, {
    descricao_acao: string;
    prazo: string;
    prazo_padrao: string;
    justificativa_alteracao_prazo: string;
    criticidade: "baixa" | "media" | "alta";
    tipo_evidencia_exigida: string;
    itens_plano: ItemPlano[];
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
      // Observação obrigatória NÃO bloqueia: o próprio Plano de Ação já tem texto obrigatório de orientação.
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
      const { uploadAnexo } = await import('@/modules/tarefas/services/tarefas_storage_service');
      const anexo = await uploadAnexo({
        file,
        contexto_tipo: 'aprovacao',
        assignment_id: assignment.id,
        contexto_ref_id: f.id,
        numero_tarefa: assignment.numero_tarefa ?? 0,
        nome_tarefa: assignment.template_snapshot?.nome ?? assignment.nome ?? "tarefa",
        origem: (assignment.origem ?? "rotina") as "rotina" | "ad_hoc",
      });
      const draft = flow.approverAnswers[f.id];
      flow.updateApproverAnswer(f.id, { evidencia_url: anexo.path_relativo, peso: f.aprovador_peso || 1 });
      flow.autoSaveApproverAnswer.mutate({
        fieldId: f.id,
        resposta: draft?.resposta ?? "",
        observacao: draft?.observacao ?? "",
        peso: f.aprovador_peso || 1,
        evidenciaUrl: anexo.path_relativo,
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
    () => [] as typeof approverFields,
    []
  );

  const irParaPlano = () => {
    submeterPlanos();
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
    const notaMaximaAutoCalc = perguntasAutoTemplate.reduce((s: number, p: any) => s + (p.peso || 0), 0);
    const notaMaximaAvaliadorCalc = approverFields.reduce((s: number, f: any) => s + (f.aprovador_peso || 1), 0);
    const notaMaximaTotal = notaMaximaAutoCalc + notaMaximaAvaliadorCalc;

    try {
      const now = new Date().toISOString();

      // Grava nota no assignment
      await (supabase as any)
        .from("operational_assignments")
        .update({
          score_avaliado: notaFinalTotal,
          score_final_ajustado: notaFinalTotal,
          pontuacao_obtida: notaFinalTotal,
        })
        .eq("id", assignment.id);

      // Destino da nota
      const destino = assignment?.template_snapshot?.destino_score
        ?? assignment?.operational_templates?.destino_score
        ?? "individual";

      if (destino === "setor" && assignment?.setor_avaliado_id) {
        // Busca todos os membros do setor avaliado
        const { data: membros } = await (supabase as any)
          .from("colaborador_setores")
          .select("profile_id")
          .eq("setor_id", assignment.setor_avaliado_id);

        if (membros && membros.length > 0) {
          // Insere 1 linha em operational_score_logs por membro do setor
          await (supabase as any).from("operational_score_logs").insert(
            membros.map((m: any) => ({
              assignment_id: assignment.id,
              profile_id: profile?.id,           // quem avaliou
              target_profile_id: m.profile_id,   // quem recebe a nota
              target_setor_id: assignment.setor_avaliado_id,
              tipo_score: "avaliado",
              score_final: notaFinalTotal,
              detalhe_calculo: {
                nota_efetiva: notaFinalTotal,
                nota_maxima: notaMaximaTotal,
                destino: "setor",
                distribuido_em: now,
              },
              created_at: now,
            }))
          );
        }
      } else {
        // Individual — insere 1 linha para o avaliado
        const avaliadoId = assignment?.avaliado_id || assignment?.responsavel_id;
        if (avaliadoId) {
          await (supabase as any).from("operational_score_logs").insert({
            assignment_id: assignment.id,
            profile_id: profile?.id,
            target_profile_id: avaliadoId,
            tipo_score: "avaliado",
            score_final: notaFinalTotal,
            detalhe_calculo: {
              nota_efetiva: notaFinalTotal,
              nota_maxima: notaMaximaTotal,
              destino: "individual",
              aprovado_em: now,
            },
            created_at: now,
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
      const prazoAlterado = !!(p?.prazo && p?.prazo_padrao && (() => {
        try { return new Date(p.prazo).getTime() > new Date(p.prazo_padrao).getTime() + 60000; }
        catch { return false; }
      })());
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
        itens_plano: p?.itens_plano || [],
        anexo_orientacao_url: p?.anexo_orientacao_url ?? null,
        anexo_orientacao_anexo_id: p?.anexo_orientacao_anexo_id ?? null,
        anexo_orientacao_mime_type: p?.anexo_orientacao_mime_type ?? null,
      };
    });
    const invalidoBasico = lista.find(function(p) { return (!p.descricao_acao && (!p.itens_plano || p.itens_plano.length === 0)) || !p.prazo_iso; });
    if (invalidoBasico) { toast.error("Preencha instrucao ou marque ao menos 1 item para: " + invalidoBasico.field_label); return; }
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
            itens_plano: [] as ItemPlano[],
            anexo_orientacao_url: null as string | null,
            anexo_orientacao_anexo_id: null as string | null,
            anexo_orientacao_mime_type: null as string | null,
          };
          const prazoAlterado = !!(p.prazo && p.prazo_padrao && (() => {
            try { return new Date(p.prazo).getTime() > new Date(p.prazo_padrao).getTime() + 60000; }
            catch { return false; }
          })());
          return (
            <div key={f.id} className="border border-border rounded-lg p-3 bg-card space-y-2">
              <div className="text-sm font-medium text-foreground">{f.label}</div>
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
              <div className="space-y-1">
                <Label className="text-[11px]">Evidência exigida do executor</Label>
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { v: "foto", label: "📷 Foto (câmera)" },
                    { v: "video", label: "🎥 Vídeo" },
                    { v: "audio", label: "🎵 Áudio" },
                    { v: "descricao", label: "✏️ Só texto" },
                    { v: "nenhuma", label: "Nenhuma" },
                  ] as const).map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPlanos(prev => ({ ...prev, [f.id]: { ...p, tipo_evidencia_exigida: opt.v as any } }))}
                      className={`px-2 py-1 rounded border text-xs transition-colors ${
                        (p.tipo_evidencia_exigida ?? "descricao") === opt.v
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              {/* Anexo de orientação do aprovador */}
              <div className="space-y-1">
                <Label className="text-[11px]">Anexo de orientação (opcional)</Label>
                {p.anexo_orientacao_url ? (
                  <EvidenciaPreview
                    anexoId={p.anexo_orientacao_anexo_id ?? null}
                    url={p.anexo_orientacao_url}
                    mimeType={p.anexo_orientacao_mime_type ?? null}
                    onRemove={() => setPlanos(prev => ({ ...prev, [f.id]: { ...p, anexo_orientacao_url: null, anexo_orientacao_anexo_id: null, anexo_orientacao_mime_type: null } }))}
                  />
                ) : (
                  <label className="flex items-center gap-2 border border-dashed border-border rounded-lg p-2 cursor-pointer hover:border-primary/50 transition-colors">
                    <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Foto, vídeo ou áudio de orientação</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,video/*,audio/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const { data: sess } = await supabase.auth.getSession();
                          const token = sess.session?.access_token;
                          if (!token) return;
                          const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
                          const fd = new FormData();
                          fd.append('file', file);
                          fd.append('contexto_tipo', 'aprovacao');
                          fd.append('contexto_ref_id', f.id);
                          const res = await fetch(`${FN_BASE}/tarefas-storage-upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
                          const json = await res.json();
                          if (json.ok) {
                            setPlanos(prev => ({ ...prev, [f.id]: { ...p, anexo_orientacao_url: json.anexo.path_relativo, anexo_orientacao_anexo_id: json.anexo.id, anexo_orientacao_mime_type: json.anexo.mime_type ?? file.type } }));
                          }
                        } catch (err) { console.error(err); }
                      }}
                    />
                  </label>
                )}
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
            {flow.isSaving ? "Enviando..." : `Registrar ${naoConformesPlano.length} plano(s) e devolver ao executor`}
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

            const notaEfetivaTotal = notaMaximaTotal;

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

                <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Nota final</span>
                    <span className="text-primary text-lg font-bold">{notaEfetivaTotal} pts</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {(() => {
                      const destino = assignment?.template_snapshot?.destino_score
                        ?? assignment?.operational_templates?.destino_score
                        ?? "individual";
                      const nomeAvaliado = assignment?.profiles_aval?.nome
                        ?? assignment?.profiles?.nome
                        ?? null;
                      const nomeSetor = assignment?.setor_avaliado?.nome ?? null;
                      if (destino === "setor" && nomeSetor) return `📊 Ao confirmar, nota será gravada para todos do setor: ${nomeSetor}`;
                      if (nomeAvaliado) return `👤 Ao confirmar, nota será gravada para: ${nomeAvaliado}`;
                      return "👤 Ao confirmar, nota será gravada para o avaliado";
                    })()}
                  </p>
                </div>
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
      {/* Instrução do auditor — aparece no topo quando auditor criou plano para o aprovador */}
      {(() => {
        const auditPlan = (flow.fieldReviews as any[])?.find(
          (r: any) => r.tipo_review === "auditor_para_aprovador" && r.status_plano !== "resolvido"
        );
        if (!auditPlan) return null;
        return (
          <div className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden mb-1">
            <div className="flex items-center justify-between px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-700 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-semibold text-purple-800 dark:text-purple-300">Instrução do Auditor</span>
              </div>
              <span className="text-[10px] text-muted-foreground">{auditPlan.avaliado_em ? new Date(auditPlan.avaliado_em).toLocaleDateString("pt-BR") : ""}</span>
            </div>
            <div className="px-3 py-2 space-y-1">
              <p className="text-xs text-foreground">{auditPlan.instrucao_aprovador || auditPlan.motivo_devolucao}</p>
              {auditPlan.plano_acao_prazo && (
                <p className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
                  Prazo para responder: {new Date(auditPlan.plano_acao_prazo).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" })}
                </p>
              )}
              {auditPlan.tipo_evidencia_exigida && auditPlan.tipo_evidencia_exigida !== "nenhuma" && (
                <p className="text-[10px] text-purple-700 dark:text-purple-400">
                  Evidência exigida: {auditPlan.tipo_evidencia_exigida === "foto" ? "📷 Foto" : auditPlan.tipo_evidencia_exigida === "video" ? "🎥 Vídeo" : auditPlan.tipo_evidencia_exigida === "audio" ? "🎵 Áudio" : "✏️ Descrição"}
                </p>
              )}
            </div>
          </div>
        );
      })()}

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
            const execAnswer = findOriginalFieldAnswer(f, flow);
            const execAnswerStatus = normalizeAnswer(getAnswerValue(execAnswer));
            const execObservation = getObservation(execAnswer);
            const execEvidence = getEvidence(execAnswer);
            const selectedRule = value ? getRuleForResposta(f, value, "aprovador") : null;
            const allowedActions = getAllowedActions(selectedRule);
            const selectedAction = acaoPorNC[f.id] ?? getDefaultReviewAction(selectedRule);
            const isSavedHere = !!existing && (draft ? draft.resposta === existing.resposta && (draft.observacao ?? "") === (existing.observacao ?? "") : true);
            return (
              <div key={f.id} className="border border-border rounded-lg overflow-hidden bg-card">
                {/* Header: nome da pergunta + badge salvo + badge planos */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const nPlanos = (flow.fieldReviews as any[]).filter((r: any) => r.field_id === f.id && r.devolvido === true).length;
                      if (nPlanos === 0) return null;
                      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400">{nPlanos} plano{nPlanos > 1 ? "s" : ""}</span>;
                    })()}
                    {isSavedHere && existing && (
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">Salvo</span>
                    )}
                  </div>
                </div>

                {/* Réplica exata do executor — bloqueada, só leitura */}
                <div className="px-3 py-2.5 bg-muted/20 border-b border-border space-y-2">
                  {/* Botões como o executor marcou — bloqueados e evidentes */}
                  <div className="flex gap-2">
                    {getReviewOptions(f, "aprovador").map((opt) => {
                      const optStatus = normalizeAnswer(opt.v);
                      const marcado = !!execAnswerStatus && optStatus === execAnswerStatus;

                      const cls = marcado
                        ? optStatus === "conforme"
                          ? "bg-emerald-600 border-emerald-700 text-white shadow-sm ring-2 ring-emerald-300 opacity-100"
                          : optStatus === "nao_conforme"
                            ? "bg-red-600 border-red-700 text-white shadow-sm ring-2 ring-red-300 opacity-100"
                            : "bg-slate-700 border-slate-800 text-white shadow-sm ring-2 ring-slate-300 opacity-100"
                        : "bg-background border-border text-muted-foreground opacity-25";

                      return (
                        <div
                          key={opt.v}
                          className={`flex-1 text-xs px-2 py-2 rounded border text-center font-semibold transition-none ${cls}`}
                        >
                          {marcado ? "✓ " : ""}
                          {opt.label}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[11px] font-medium text-muted-foreground">
                    Resposta do executor:
                    <span className={`ml-1 font-bold ${
                      execAnswerStatus === "conforme"
                        ? "text-emerald-700"
                        : execAnswerStatus === "nao_conforme"
                          ? "text-red-700"
                          : execAnswerStatus === "na"
                            ? "text-slate-800"
                            : "text-muted-foreground"
                    }`}>
                      {execAnswerStatus === "conforme"
                        ? "Conforme"
                        : execAnswerStatus === "nao_conforme"
                          ? "Não Conforme"
                          : execAnswerStatus === "na"
                            ? "N/A"
                            : "Sem resposta"}
                    </span>
                  </div>
                  {/* Observação do executor */}
                  {execObservation && (
                    <p className="text-xs text-foreground">{execObservation}</p>
                  )}
                  {/* Evidência do executor */}
                  {execEvidence && (
                    <div className="bg-card border border-border rounded-md overflow-hidden">
                      <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b border-border flex items-center gap-1.5">
                        <span className="text-[10px] font-medium text-blue-800 dark:text-blue-400">
                          {execAnswer?.evidencia_mime_type?.startsWith("video/") ? "🎥 Vídeo anexado" : execAnswer?.evidencia_mime_type?.startsWith("audio/") ? "🎵 Áudio anexado" : "📷 Foto anexada"}
                        </span>
                      </div>
                      <div className="p-2">
                        <EvidenciaPreview
                          anexoId={execAnswer?.evidencia_anexo_id ?? null}
                          url={String(execEvidence)}
                          mimeType={execAnswer?.evidencia_mime_type ?? null}
                          disabled
                        />
                      </div>
                    </div>
                  )}
                  {/* Quem preencheu + versões */}
                  {execAnswer?.respondido_por_nome && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {execAnswer.respondido_por_nome} · {execAnswer.respondido_em ? new Date(execAnswer.respondido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                    </p>
                  )}
                </div>

                {/* Histórico de planos de ação R1, R2... */}
                {(() => {
                  const planos = (flow.fieldReviews as any[])
                    .filter((r: any) => r.field_id === f.id && r.devolvido === true)
                    .sort((a: any, b: any) => (a.rodada || 0) - (b.rodada || 0));

                  const calcStatus = (r: any) => {
                    const c = (flow.contingencies as any[]).find((c: any) => c.origin_field_id === f.id && c.rodada === r.rodada);
                    if (!c) return null;
                    const prazoMs = c.prazo_resolucao ? new Date(c.prazo_resolucao).getTime() : null;
                    const resolvidoMs = c.resolvida_em ? new Date(c.resolvida_em).getTime() : null;
                    const agora = Date.now();
                    if (!prazoMs) return null;
                    const ref = resolvidoMs || agora;
                    const diffMin = Math.round((ref - prazoMs) / 60000);
                    const ok = ref <= prazoMs;
                    if (resolvidoMs) return ok
                      ? { ok: true, label: "✓ No prazo", corBorda: "#1D9E75", corHeader: "#edf9f4", corTexto: "#085041", bgBadge: "#b8ead8" }
                      : { ok: false, label: `✗ Atrasado ${Math.abs(diffMin)}min`, corBorda: "#e24b4a", corHeader: "#fcebeb", corTexto: "#a32d2d", bgBadge: "#f09595" };
                    return agora > prazoMs
                      ? { ok: false, label: `✗ Atrasado ${diffMin}min`, corBorda: "#e24b4a", corHeader: "#fcebeb", corTexto: "#a32d2d", bgBadge: "#f09595" }
                      : { ok: true, label: `⏳ ${Math.round((prazoMs - agora) / 60000)}min restantes`, corBorda: "#ba7517", corHeader: "#faeeda", corTexto: "#854f0b", bgBadge: "#ef9f27" };
                  };

                  return planos.map((r: any, idx: number) => {
                    const isReincidencia = idx > 0;
                    const st = calcStatus(r);
                    const corBorda = st?.corBorda || (isReincidencia ? "#ba7517" : "#e24b4a");
                    const corHeader = st?.corHeader || (isReincidencia ? "#faeeda" : "#fcebeb");
                    const corTexto = st?.corTexto || (isReincidencia ? "#854f0b" : "#a32d2d");
                    const bgBadge = st?.bgBadge || "#f09595";
                    const itens: any[] = Array.isArray(r.itens_plano) ? r.itens_plano : [];
                    const c = (flow.contingencies as any[]).find((c: any) => c.origin_field_id === f.id && c.rodada === r.rodada);

                    return (
                      <div key={r.id || idx} className="flex gap-0">
                        <div className="w-[3px] flex-shrink-0" style={{ background: corBorda }} />
                        <div className="flex-1 border-b border-border overflow-hidden">
                          {/* Header plano */}
                          <div className="flex items-center justify-between px-3 py-2 border-b border-border" style={{ background: corHeader }}>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold" style={{ color: corTexto }}>Plano de ação — R{r.rodada}</span>
                              {isReincidencia && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "#f09595", color: "#501313" }}>Reincidência</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {st && <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: bgBadge, color: corTexto }}>{st.label}</span>}
                              <span className="text-[10px] text-muted-foreground">{r.avaliado_em ? new Date(r.avaliado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                            </div>
                          </div>
                          {/* Instrução + itens */}
                          <div className="px-3 py-2 border-b border-border space-y-1.5">
                            {(r.instrucao_aprovador || r.motivo_devolucao) && (
                              <p className="text-xs text-foreground">{r.instrucao_aprovador || r.motivo_devolucao}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {c?.prazo_resolucao && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
                                  Prazo: {new Date(c.prazo_resolucao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                              {itens.map((item: any, i: number) => (
                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400">
                                  {item.tipo === "foto" ? "📷" : item.tipo === "video" ? "🎥" : item.tipo === "audio" ? "🎵" : "✏️"} {item.titulo || item.tipo}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* Resposta do executor ao plano */}
                          {(() => {
                            const resp = findExecutorPlanResponse(f, r, c, flow);
                            if (!resp && !(c?.resolvida_em)) {
                              return (
                                <div className="px-3 py-2 bg-muted/10 flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground italic">Aguardando resposta do executor...</span>
                                </div>
                              );
                            }
                            if (!resp) return null;
                            const respObs = getObservation(resp);
                            const respEvid = getEvidence(resp);
                            const respStatus = normalizeAnswer(getAnswerValue(resp));
                            const evidUrl = respEvid ? String(respEvid) : "";
                            return (
                              <div className="px-3 py-2 bg-muted/10 border-b border-border space-y-1.5">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resposta do executor — R{r.rodada}</p>
                                {respStatus && (
                                  <p className="text-[10px] text-blue-700 dark:text-blue-400">Status: {respStatus === "conforme" ? "Conforme" : respStatus === "nao_conforme" ? "Não Conforme" : "N/A"}</p>
                                )}
                                {respObs && (
                                  <div className="bg-card border border-border rounded-md p-2">
                                    <p className="text-[10px] text-muted-foreground mb-1">✏️ {itens.find((i: any) => i.tipo === "texto")?.titulo || "Descrição"}</p>
                                    <p className="text-xs text-foreground">{respObs}</p>
                                  </div>
                                )}
                                {evidUrl && (
                                  <div className="bg-card border border-border rounded-md overflow-hidden">
                                    <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/20 border-b border-border">
                                      <span className="text-[10px] font-medium text-blue-800 dark:text-blue-400">
                                        {/\.(jpg|jpeg|png|gif|webp)$/i.test(evidUrl) ? "📷" : /\.(mp4|webm|mov)$/i.test(evidUrl) ? "🎥" : /\.(mp3|wav|ogg|m4a)$/i.test(evidUrl) ? "🎵" : "📎"} {itens.find((i: any) => i.tipo !== "texto")?.titulo || "Evidência"}
                                      </span>
                                    </div>
                                    <div className="p-2">
                                      {/\.(jpg|jpeg|png|gif|webp)$/i.test(evidUrl) ? (
                                        <div className="flex gap-2 items-center">
                                          <img src={evidUrl} alt="Evidência" className="w-12 h-9 rounded border border-border object-cover cursor-pointer" onClick={() => window.open(evidUrl, "_blank")} />
                                          <a href={evidUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver em tela cheia</a>
                                        </div>
                                      ) : /\.(mp4|webm|mov)$/i.test(evidUrl) ? (
                                        <video src={evidUrl} controls playsInline className="w-full max-h-32 rounded border border-border" />
                                      ) : /\.(mp3|wav|ogg|m4a)$/i.test(evidUrl) ? (
                                        <audio src={evidUrl} controls className="w-full" />
                                      ) : (
                                        <a href={evidUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Ver anexo</a>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {resp.respondido_por_nome && (
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {resp.respondido_por_nome} · {resp.respondido_em ? new Date(resp.respondido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                    {st?.ok === false && <span className="ml-1 text-red-600 font-semibold">· Atrasado</span>}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                          {/* Botões Conforme / Não Conforme no plano — só no último plano */}
                          {idx === planos.length - 1 && (
                            <div className="px-3 py-2 flex gap-2">
                              <button type="button" onClick={() => handleResposta(f, "conforme")}
                                className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${value === "conforme" ? "bg-emerald-100 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                ✓ Conforme
                              </button>
                              <button type="button" onClick={() => handleResposta(f, "nao_conforme")}
                                className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${value === "nao_conforme" ? "bg-red-100 border-red-400 text-red-800 ring-2 ring-red-200" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                ✗ Não Conforme → R{r.rodada + 1}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Sem planos ainda — botões normais do aprovador + plano de ação inline */}
                {(flow.fieldReviews as any[]).filter((r: any) => r.field_id === f.id && r.devolvido === true).length === 0 && (
                  <div className="px-3 py-2.5 space-y-2 border-t border-border">
                    <div className="flex gap-2">
                      {getReviewOptions(f, "aprovador").map((opt) => (
                        <button key={opt.v} type="button" onClick={() => handleResposta(f, opt.v)}
                          className={`flex-1 text-xs px-2 py-2 rounded border transition-colors font-medium ${value === opt.v ? `${opt.cls} ring-2 ring-current/20` : "border-border text-muted-foreground hover:bg-muted"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {/* Plano de ação inline — abre quando Não Conforme */}
                    {allowedActions.length > 0 && (() => {
                      const p = planos[f.id] ?? { descricao_acao: "", prazo: computeDefaultPrazo(), prazo_padrao: computeDefaultPrazo(), justificativa_alteracao_prazo: "", criticidade: "media" as const, tipo_evidencia_exigida: "descricao", itens_plano: [] as any[] };
                      const updateP = (patch: any) => setPlanos(prev => {
                        const cur = prev[f.id] ?? p;
                        return { ...prev, [f.id]: { ...cur, ...patch } };
                      });
                      const ITENS = [
                        { tipo: "foto", icon: "📷", label: "Foto", ph: "O que fotografar?" },
                        { tipo: "video", icon: "🎥", label: "Vídeo", ph: "O que filmar?" },
                        { tipo: "audio", icon: "🎵", label: "Áudio", ph: "O que gravar?" },
                        { tipo: "texto", icon: "✏️", label: "Texto", ph: "O que descrever?" },
                      ];
                      return (
                        <div className="border border-amber-300 dark:border-amber-800 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200">
                            <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                            <span className="text-[11px] font-semibold text-amber-800">Plano de ação</span>
                          </div>
                          <div className="p-3 space-y-2.5">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Instrução geral (opcional)</Label>
                              <Textarea value={p.descricao_acao} onChange={e => updateP({ descricao_acao: e.target.value })} className="text-xs min-h-[44px]" placeholder="Descreva o que precisa ser corrigido..." />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">O que quero de volta <span className="text-muted-foreground">(marque ao menos 1)</span></Label>
                              <div className="flex flex-col gap-1.5">
                                {ITENS.map(cfg => {
                                  const ativo = p.itens_plano.find((i: any) => i.tipo === cfg.tipo);
                                  return (
                                    <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo ? "border-primary" : "border-border"}`}>
                                      <button type="button" onClick={() => {
                                        const existe = p.itens_plano.find((i: any) => i.tipo === cfg.tipo);
                                        updateP({ itens_plano: existe ? p.itens_plano.filter((i: any) => i.tipo !== cfg.tipo) : [...p.itens_plano, { tipo: cfg.tipo, titulo: "", obrigatorio: true }] });
                                      }} className={`w-full flex items-center gap-2 px-3 py-2 ${ativo ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                                        <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo ? "bg-primary border-primary" : "border-border"}`}>
                                          {ativo && <span className="text-primary-foreground text-[10px] font-bold">✓</span>}
                                        </div>
                                        <span className="text-sm">{cfg.icon}</span>
                                        <span className="text-xs font-medium">{cfg.label}</span>
                                      </button>
                                      {ativo && (
                                        <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                          <Input value={ativo.titulo} onChange={e => {
                                            const novoTitulo = e.target.value;
                                            setPlanos(prev => {
                                              const cur = prev[f.id] ?? p;
                                              return { ...prev, [f.id]: { ...cur, itens_plano: cur.itens_plano.map((i: any) => i.tipo === cfg.tipo ? { ...i, titulo: novoTitulo } : i) } };
                                            });
                                          }} placeholder={cfg.ph} className="h-7 text-xs" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Prazo ({prazoPadraoHoras}h padrão)</Label>
                              <Input type="datetime-local" className="h-8 text-xs" value={p.prazo} onChange={e => updateP({ prazo: e.target.value })} />
                              {p.prazo && p.prazo_padrao && (() => { try { return new Date(p.prazo).getTime() > new Date(p.prazo_padrao).getTime() + 60000; } catch { return false; } })() && (
                                <div className="flex items-start gap-1.5 p-2 rounded bg-amber-50 border border-amber-200">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                  <p className="text-[10px] text-amber-700">Prazo estendido — ponto será descontado automaticamente.</p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1.5">
                              {(["baixa","media","alta"] as const).map(c => (
                                <button key={c} type="button" onClick={() => updateP({ criticidade: c })}
                                  className={`flex-1 py-1.5 rounded border text-xs font-medium ${p.criticidade === c ? c === "alta" ? "bg-red-100 border-red-400 text-red-700" : c === "media" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-emerald-100 border-emerald-400 text-emerald-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                  {c === "baixa" ? "Baixa" : c === "media" ? "Média" : "Alta"}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
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

      {false && null}

      <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
        {false && null}
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
            title={`${perguntasComAcao.length} item(s) para plano de ação`}
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            Finalizar revisão ({perguntasComAcao.length} ação)
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
  const flow = useAuditFlow(assignment?.id || null);
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [motivoFinal, setMotivoFinal] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [respostasAuto, setRespostasAuto] = useState<Record<string, { na: boolean; justificativa: string }>>({});

  // Perguntas AUTO do auditor — vêm do ada_config_snapshot.checklists.validador
  const perguntasAutoAuditor = useMemo(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.validador;
    if (!Array.isArray(lista)) return [];
    return lista.filter((p: any) => p.ativo !== false);
  }, [assignment]);

  // Calcula resposta automática para perguntas do auditor (auditando o APROVADOR)
  const calcRespostaAuditor = useCallback((metrica: string): { resposta: "sim" | "nao" | null; label: string; tiraPonto: boolean } => {
    const a = assignment;
    if (!a) return { resposta: null, label: "Sem dados", tiraPonto: false };
    switch (metrica) {
      case "aprovador_respondeu_no_sla": {
        if (a.flag_sla_etapa_estourado) return { resposta: "sim", label: "Sim — avaliou fora do SLA", tiraPonto: true };
        return { resposta: "nao", label: "Não — avaliou no prazo", tiraPonto: false };
      }
      case "aprovador_reabriu_tarefa":
        if ((a.rodada_atual ?? 1) > 1) return { resposta: "sim", label: "Sim — devolveu/reabriu", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      case "aprovador_aprovou_com_pendencia":
        return { resposta: null, label: "Verificação manual", tiraPonto: false };
      case "plano_acao_sla_estourado":
        if (a.flag_atraso_plano_acao) return { resposta: "sim", label: "Sim — SLA do plano estourou", tiraPonto: true };
        return { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
      case "plano_acao_prazo_prorrogado":
        if (a.flag_atraso_plano_acao) return { resposta: "sim", label: "Sim — prazo foi prorrogado", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      case "plano_acao_prazo_prorrogado_2x":
        if (a.flag_reincidencia_atraso) return { resposta: "sim", label: "Sim — prorrogado mais de 1 vez", tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      default:
        return { resposta: null, label: "Avaliação manual", tiraPonto: false };
    }
  }, [assignment]);

  const notaMaximaAuditor = perguntasAutoAuditor.reduce((sum: number, p: any) => sum + (p.peso || 0), 0);
  const notaEfetivaAuditor = perguntasAutoAuditor.reduce((sum: number, p: any) => {
    const key = p.tempId ?? p.id ?? p.pergunta;
    const r = respostasAuto[key] ?? { na: false };
    const auto = calcRespostaAuditor(p.metrica_calculo ?? "manual");
    if (r.na) return sum + (p.peso || 0);
    if (auto.tiraPonto) return sum;
    return sum + (p.peso || 0);
  }, 0);

  const slaEtapa = !!assignment?.flag_sla_etapa_estourado;
  const reincidencia = !!assignment?.flag_reincidencia_atraso;
  const atrasoPlano = !!assignment?.flag_atraso_plano_acao;

  const aprovar = async () => setShowConfirmModal(true);

  const confirmarAuditoria = async () => {
    for (const p of perguntasAutoAuditor) {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const r = respostasAuto[key];
      if (r?.na && !r?.justificativa?.trim()) {
        toast.error(`Justificativa obrigatória para N/A em: "${p.pergunta}"`);
        return;
      }
    }
    try {
      const destino = assignment?.template_snapshot?.destino_score
        ?? assignment?.operational_templates?.destino_score
        ?? "individual";
      await (supabase as any)
        .from("operational_assignments")
        .update({ score_auditor: notaEfetivaAuditor })
        .eq("id", assignment.id);

      if (destino === "setor" && assignment?.setor_avaliado_id) {
        const { data: membros } = await (supabase as any)
          .from("colaborador_setores")
          .select("profile_id")
          .eq("setor_id", assignment.setor_avaliado_id);
        if (membros?.length > 0) {
          await (supabase as any).from("operational_score_logs").insert(
            membros.map((m: any) => ({
              assignment_id: assignment.id,
              profile_id: profile?.id,
              target_profile_id: m.profile_id,
              target_setor_id: assignment.setor_avaliado_id,
              tipo_score: "auditoria",
              score_final: notaEfetivaAuditor,
              detalhe_calculo: { nota_efetiva: notaEfetivaAuditor, nota_maxima: notaMaximaAuditor, destino: "setor" },
              created_at: new Date().toISOString(),
            }))
          );
        }
      } else {
        // Nota da auditoria vai para o APROVADOR (não para o avaliado)
        const aprovadorId = assignment?.aprovador_id;
        if (aprovadorId) {
          await (supabase as any).from("operational_score_logs").insert({
            assignment_id: assignment.id,
            profile_id: profile?.id,
            target_profile_id: aprovadorId,
            tipo_score: "aprovador",
            score_final: notaEfetivaAuditor,
            detalhe_calculo: { nota_efetiva: notaEfetivaAuditor, nota_maxima: notaMaximaAuditor, destino: "aprovador" },
            created_at: new Date().toISOString(),
          });
          // Grava também no assignment
          await (supabase as any)
            .from("operational_assignments")
            .update({ score_aprovador: notaEfetivaAuditor })
            .eq("id", assignment.id);
        }
      }

      await flow.finalDecision.mutateAsync({ assignment, action: "aprovar" });
      setShowConfirmModal(false);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  const devolver = async () => {
    if (!motivoFinal.trim()) { toast.error("Justifique a devolução."); return; }
    try { await flow.finalDecision.mutateAsync({ assignment, action: "devolver", motivo: motivoFinal }); onClose(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (showConfirmModal) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 dark:text-blue-300">
            <strong>Confirmar Auditoria.</strong> Revise as notas automáticas abaixo. Marque N/A com justificativa se alguma não se aplicar.
          </div>
        </div>

        <div className="space-y-2">
          {perguntasAutoAuditor.map((p: any) => {
            const key = p.tempId ?? p.id ?? p.pergunta;
            const r = respostasAuto[key] ?? { na: false, justificativa: "" };
            const auto = calcRespostaAuditor(p.metrica_calculo ?? "manual");
            return (
              <div key={key} className={`border rounded-lg p-3 space-y-2 ${r.na ? "opacity-60 bg-muted/20 border-border" : auto.tiraPonto ? "bg-red-50 dark:bg-red-950/20 border-red-200" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200"}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{p.pergunta}</p>
                    {auto.resposta && !r.na && (
                      <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${auto.tiraPonto ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
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
                        onChange={e => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, na: e.target.checked } }))}
                        className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-muted-foreground">N/A</span>
                    </label>
                  )}
                </div>
                {r.na && (
                  <div className="space-y-1 ml-1">
                    <Label className="text-[10px] text-amber-700">Justificativa obrigatória</Label>
                    <Textarea value={r.justificativa}
                      onChange={e => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, justificativa: e.target.value } }))}
                      placeholder="Por que não se aplica..."
                      className="text-xs min-h-[36px]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Nota final da Auditoria</span>
            <span className="text-primary text-lg font-bold">{notaEfetivaAuditor} pts</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {(() => {
              const destino = assignment?.template_snapshot?.destino_score ?? assignment?.operational_templates?.destino_score ?? "individual";
              const nomeAprovador = assignment?.aprovador?.nome ?? assignment?.profiles_aprov?.nome ?? null;
              if (nomeAprovador) return `🔍 Ao confirmar, nota do aprovador será gravada para: ${nomeAprovador}`;
              return "🔍 Ao confirmar, nota será gravada para o aprovador";
            })()}
          </p>
        </div>

        <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowConfirmModal(false)} disabled={flow.isSaving}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
          </Button>
          <div className="flex-1" />
          <Button type="button" size="sm" onClick={confirmarAuditoria} disabled={flow.isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white">
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Confirmando..." : "Confirmar Auditoria"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-blue-500/5 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-foreground">
          <strong>Modo Auditor.</strong> Revise as perguntas automáticas abaixo. Confirme ou devolva para o aprovador.
        </div>
      </div>

      {/* Alertas */}
      {(slaEtapa || reincidencia || atrasoPlano) && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4" /> Anormalidades detectadas
          </div>
          {slaEtapa && <p className="text-xs text-amber-800">⚠ SLA da etapa estourado</p>}
          {atrasoPlano && <p className="text-xs text-amber-800">⚠ Plano de ação entregue fora do prazo</p>}
          {reincidencia && <p className="text-xs text-red-700 font-semibold">⚠ Reincidência de atraso</p>}
        </div>
      )}

      {/* Lista corrida — igual ao aprovador */}
      <div className="space-y-2">
        {(() => {
          let idx = 0;
          return perguntasAutoAuditor.map((p: any) => {
            idx++;
            const key = p.tempId ?? p.id ?? p.pergunta;
            const r = respostasAuto[key] ?? { na: false, justificativa: "" };
            const auto = calcRespostaAuditor(p.metrica_calculo ?? "manual");
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
                        onChange={e => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, na: e.target.checked } }))}
                        className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-muted-foreground">N/A</span>
                    </label>
                  )}
                </div>
                {r.na && (
                  <div className="space-y-1 ml-7">
                    <Label className="text-[10px] text-amber-700">Justificativa obrigatória — por que N/A? (nota será mantida)</Label>
                    <Textarea value={r.justificativa}
                      onChange={e => setRespostasAuto(prev => ({ ...prev, [key]: { ...r, justificativa: e.target.value } }))}
                      placeholder="Por que este item não se aplica..."
                      className="text-xs min-h-[36px]" />
                  </div>
                )}
              </div>
            );
          });
        })()}

        {/* Total */}
        <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Nota final da Auditoria</span>
            <span className="text-primary text-lg font-bold">{notaEfetivaAuditor} pts</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {(() => {
              const nomeAprovador = assignment?.aprovador?.nome ?? assignment?.profiles_aprov?.nome ?? null;
              if (nomeAprovador) return `🔍 Ao confirmar, nota do aprovador será gravada para: ${nomeAprovador}`;
              return "🔍 Ao confirmar, nota será gravada para o aprovador";
            })()}
          </p>
        </div>
      </div>

      {/* Devolução */}
      <div className="space-y-1 pt-2 border-t border-border">
        <Label className="text-[11px]">Justificativa para devolução (obrigatória se devolver)</Label>
        <Textarea value={motivoFinal} onChange={e => setMotivoFinal(e.target.value)} className="text-xs min-h-[44px]" maxLength={2000} />
      </div>

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1">
        <Button type="button" size="sm" variant="outline" onClick={devolver} disabled={flow.isSaving}
          className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
        </Button>
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={aprovar} disabled={flow.isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar Auditoria
        </Button>
      </div>
    </div>
  );
}
