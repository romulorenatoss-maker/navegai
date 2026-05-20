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
import { CheckCircle2, XCircle, RotateCcw, Send, Play, AlertTriangle, ShieldCheck, ExternalLink, Upload, ArrowLeft, ClipboardList, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAssignmentReview } from "@/modules/tarefas/hooks/tarefas_useAssignmentReview";
import { useApprovalFlow } from "@/modules/tarefas/hooks/tarefas_useApprovalFlow";
import { useAuditFlow } from "@/modules/tarefas/hooks/tarefas_useAuditFlow";
import { useFlowPermissions } from "@/modules/tarefas/hooks/tarefas_useFlowPermissions";
import { ReviewFieldCard } from "@/modules/tarefas/components/tarefas_reviewFieldCard";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { SnapshotField, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { calculateOperationalScore } from "@/modules/tarefas/hooks/tarefas_useScoring";

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

  // Primeiro tenta chave sintética direta
  const bySyntheticId = answers.find((answer: any) =>
    sameId(getFieldId(answer), planResponseFieldId)
  );
  if (bySyntheticId) return bySyntheticId;

  // Busca no valor_json do campo original — itens do plano salvos como
  // { __plano_acao__r1__foto: {...}, __plano_acao__r1__video: {...}, ... }
  const originalAnswer = answers.find((a: any) => sameId(getFieldId(a), field?.id));
  if (originalAnswer?.valor_json && typeof originalAnswer.valor_json === "object") {
    const chavePrefix = `__plano_acao__r${reviewRound}__`;
    const itensJson = originalAnswer.valor_json as Record<string, any>;
    const itensDoPlano: Record<string, any> = {};
    let temAlgo = false;
    for (const [k, v] of Object.entries(itensJson)) {
      if (k.startsWith(chavePrefix)) {
        itensDoPlano[k] = v;
        temAlgo = true;
      }
    }
    if (temAlgo) {
      // Retorna objeto sintético com todos os itens para renderização
      return { field_id: planResponseFieldId, _itensPlano: itensDoPlano, _originalAnswer: originalAnswer };
    }
  }

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

type ItemPlano = { tipo: "foto" | "video" | "audio" | "texto"; titulo: string; obrigatorio: boolean };

type PlanoDraft = {
  descricao_acao: string;
  prazo: string;
  prazo_padrao: string;
  justificativa_alteracao_prazo: string;
  criticidade: "baixa" | "media" | "alta";
  tipo_evidencia_exigida: string;
  itens_plano: ItemPlano[];
  anexo_orientacao_url?: string | null;
  anexo_orientacao_anexo_id?: string | null;
  anexo_orientacao_mime_type?: string | null;
};

const toDatetimeLocal = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
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

  // ⚠️ FONTE ÚNICA DE VERDADE para travas/permissões neste painel
  // Todas as decisões de UI devem consultar `perms`, NUNCA checar status direto.
  const perms = useFlowPermissions(assignment);
  const [step, setStep] = useState<"perguntas" | "plano">("perguntas");
  const [motivoFinal, setMotivoFinal] = useState("");
  const [acaoPorNC, setAcaoPorNC] = useState<Record<string, "plano" | "devolver">>({});
  const [planos, setPlanos] = useState<Record<string, PlanoDraft>>({});
  const [expandirNovoPlano, setExpandirNovoPlano] = useState<Record<string, boolean>>({});
  const [showAprovarModal, setShowAprovarModal] = useState(false);
  const [auditorRespostas, setAuditorRespostas] = useState<Record<string, Record<string, { valor_texto?: string; evidencia_url?: string; evidencia_anexo_id?: string; evidencia_mime_type?: string }>>>({});
  const [respostasAutoAprovador, setRespostasAutoAprovador] = useState<Record<string, { na: boolean; justificativa: string }>>({});
  // Exceção: estado de upload para o plano do auditor — mesmo padrão do DynamicFieldRenderer
  const [uploadingAuditorPlano, setUploadingAuditorPlano] = useState<Record<string, boolean>>({});
  const [uploadProgressAuditorPlano, setUploadProgressAuditorPlano] = useState<Record<string, number>>({});

  const approverFields = useMemo(
    () => fields.filter((f) => !["secao", "divisor", "titulo"].includes(String(f.tipo))),
    [fields]
  );

  const prazoPadraoHoras = Number(
    assignment?.template_snapshot?.prazo_sla_correcao_horas
    ?? assignment?.operational_templates?.prazo_sla_correcao_horas
    ?? 24
  );

  const computeDefaultPrazo = () => toDatetimeLocal(new Date(Date.now() + prazoPadraoHoras * 60 * 60 * 1000));

  const perguntasAutoAprovador = useMemo(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.aprovador;
    if (!Array.isArray(lista)) return [];
    return lista.filter((p: any) => p.ativo !== false);
  }, [assignment]);

  const calcRespostaExecutor = useCallback((metrica: string): { resposta: "sim" | "nao" | null; label: string; tiraPonto: boolean } => {
    const a = assignment;
    if (!a) return { resposta: null, label: "Sem dados", tiraPonto: false };

    // ──────────────────────────────────────────────────────────────────
    // Helpers derivados — sem depender de flags do banco (mais robusto)
    // ──────────────────────────────────────────────────────────────────
    const planosAprovador = (flow.fieldReviews as any[]).filter(
      (r: any) => r.devolvido === true && r.criado_por_papel !== "auditor"
    );
    const teveDevolucao = planosAprovador.length > 0;
    const planosAtrasados = (flow.contingencies as any[]).filter((c: any) => {
      if (!c.prazo_resolucao) return false;
      const prazoMs = new Date(c.prazo_resolucao).getTime();
      const refMs = c.resolvida_em ? new Date(c.resolvida_em).getTime() : Date.now();
      return refMs > prazoMs;
    });
    const numPlanosAtrasados = planosAtrasados.length;

    switch (metrica) {
      // ── Atraso da execução / etapa ─────────────────────────────────
      case "executor_entregou_no_prazo":
      case "executor_atrasou": {
        const atrasou = a.flag_sla_estourado
          || (a.finalizado_em && a.prazo_execucao && new Date(a.finalizado_em) > new Date(a.prazo_execucao));
        if (atrasou) return { resposta: "sim", label: "Sim — entregou fora do prazo", tiraPonto: true };
        return { resposta: "nao", label: "Não — entregou no prazo", tiraPonto: false };
      }
      case "executor_teve_atraso_etapa": {
        // Atraso em etapa = qualquer plano de ação que estourou prazo OU flag de etapa
        if (numPlanosAtrasados > 0 || a.flag_sla_etapa_estourado || a.flag_atraso_plano_acao) {
          return { resposta: "sim", label: `Sim — ${numPlanosAtrasados || 1} etapa(s) com atraso`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não — todas etapas no prazo", tiraPonto: false };
      }

      // ── Obrigatórias respondidas (Sim é bom, Não tira ponto) ───────
      case "executor_obrigatorias_respondidas": {
        const obrigatoriasFaltando = (fields as any[]).filter((f: any) => {
          if (!f.obrigatorio) return false;
          const ans = (flow.fieldAnswers as any[]).find((x: any) => x.field_id === f.id);
          if (!ans) return true;
          const temValor = ans.valor_booleano !== null
            || (ans.valor_texto && ans.valor_texto !== "")
            || ans.evidencia_url
            || ans.evidencia_anexo_id;
          return !temValor;
        });
        if (obrigatoriasFaltando.length > 0) {
          return { resposta: "nao", label: `Não — ${obrigatoriasFaltando.length} obrigatória(s) sem resposta`, tiraPonto: true };
        }
        return { resposta: "sim", label: "Sim — todas respondidas", tiraPonto: false };
      }

      // ── Evidências obrigatórias anexadas (Sim é bom) ───────────────
      case "executor_evidencias_anexadas": {
        const semEvidencia = (fields as any[]).filter((f: any) => {
          const exige = f.exige_evidencia
            || f.evidencia_obrigatoria
            || f.aprovador_exige_evidencia_nao;
          if (!exige) return false;
          const ans = (flow.fieldAnswers as any[]).find((x: any) => x.field_id === f.id);
          return !ans?.evidencia_url && !ans?.evidencia_anexo_id;
        });
        if (semEvidencia.length > 0) {
          return { resposta: "nao", label: `Não — ${semEvidencia.length} sem evidência`, tiraPonto: true };
        }
        return { resposta: "sim", label: "Sim — todas anexadas", tiraPonto: false };
      }

      // ── Devolução / reabertura (Sim tira ponto) ────────────────────
      case "executor_teve_devolucao": {
        if (teveDevolucao) {
          return { resposta: "sim", label: `Sim — ${planosAprovador.length} devolução(ões)/plano(s)`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não — sem devoluções", tiraPonto: false };
      }

      // ── Não conformidades ──────────────────────────────────────────
      case "executor_teve_nao_conforme": {
        const ncs = (flow.existingApprovalAnswers as any[]).filter((x: any) => x.resposta === "nao_conforme").length;
        if (ncs > 0) return { resposta: "sim", label: `Sim — ${ncs} não conforme(s)`, tiraPonto: true };
        return { resposta: "nao", label: "Não — todos conformes", tiraPonto: false };
      }

      // ── Plano de ação ──────────────────────────────────────────────
      case "plano_acao_sla_estourado":
      case "executor_plano_atrasado": {
        if (a.flag_atraso_plano_acao || numPlanosAtrasados > 0) {
          return { resposta: "sim", label: "Sim — plano entregue com atraso", tiraPonto: true };
        }
        return { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
      }
      case "executor_reincidencia": {
        if (a.flag_reincidencia_atraso || numPlanosAtrasados >= 2) {
          return { resposta: "sim", label: "Sim — reincidência de atraso", tiraPonto: true };
        }
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }
      case "executor_prazo_prorrogado":
      case "plano_acao_prazo_prorrogado": {
        const prorrogou = (flow.fieldReviews as any[]).some((r: any) => r.prazo_alterado === true);
        if (a.flag_atraso_plano_acao || prorrogou) {
          return { resposta: "sim", label: "Sim — prazo foi prorrogado", tiraPonto: true };
        }
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }
      case "plano_acao_prazo_prorrogado_2x": {
        const prorrogacoes = (flow.fieldReviews as any[]).filter((r: any) => r.prazo_alterado === true).length;
        if (a.flag_reincidencia_atraso || prorrogacoes >= 2) {
          return { resposta: "sim", label: "Sim — prorrogado 2x ou mais", tiraPonto: true };
        }
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }

      default:
        return { resposta: null, label: "Avaliação manual", tiraPonto: false };
    }
  }, [assignment, flow.existingApprovalAnswers, flow.fieldReviews, flow.fieldAnswers, flow.contingencies, fields]);

  const notaMaximaAprovador = perguntasAutoAprovador.reduce((sum: number, p: any) => sum + (p.peso || 0), 0);
  const notaEfetivaAprovador = perguntasAutoAprovador.reduce((sum: number, p: any) => {
    const key = p.tempId ?? p.id ?? p.pergunta;
    const r = respostasAutoAprovador[key] ?? { na: false };
    const auto = calcRespostaExecutor(p.metrica_calculo ?? "manual");
    if (r.na) return sum + (p.peso || 0);
    if (auto.tiraPonto) return sum;
    return sum + (p.peso || 0);
  }, 0);

  const getRespostaAprovador = (f: SnapshotField) =>
    flow.approverAnswers[f.id]?.resposta
    ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta
    ?? "";

  const perguntasComAcao = useMemo(() => approverFields.filter((f) => {
    const resposta = flow.approverAnswers[f.id]?.resposta
      ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.resposta
      ?? "";
    if (!resposta) return false;
    return getAllowedActions(getRuleForResposta(f, resposta, "aprovador")).length > 0;
  }), [approverFields, flow.approverAnswers, flow.existingApprovalAnswers]);

  const naoConformesPlanoCompleto = useMemo(() => perguntasComAcao.filter((f) => {
    const rule = getRuleForResposta(f, getRespostaAprovador(f), "aprovador");
    return (acaoPorNC[f.id] ?? getDefaultReviewAction(rule)) === "plano";
  }), [perguntasComAcao, acaoPorNC, flow.approverAnswers, flow.existingApprovalAnswers]);

  const blockReasons = flow.getBlockingReasons(assignment);

  const handleResposta = (f: SnapshotField, resposta: string) => {
    const rule = getRuleForResposta(f, resposta, "aprovador");
    flow.updateApproverAnswer(f.id, { resposta, peso: (f as any).aprovador_peso || 1 });
    if (getAllowedActions(rule).includes("plano")) {
      setAcaoPorNC(prev => ({ ...prev, [f.id]: "plano" }));
    } else {
      setAcaoPorNC(prev => { const next = { ...prev }; delete next[f.id]; return next; });
      setPlanos(prev => { const next = { ...prev }; delete next[f.id]; return next; });
      setExpandirNovoPlano(prev => ({ ...prev, [f.id]: false }));
    }
  };

  const submeterPlanos = async () => {
    const perguntasPlano = perguntasComAcao.filter((f) => {
      const rule = getRuleForResposta(f, getRespostaAprovador(f), "aprovador");
      return (acaoPorNC[f.id] ?? getDefaultReviewAction(rule)) === "plano";
    });
    if (perguntasPlano.length === 0) return;

    try {
      const planosPayload = perguntasPlano.map((f) => {
        const prazoPadrao = computeDefaultPrazo();
        const p = planos[f.id] ?? {
          descricao_acao: "",
          prazo: prazoPadrao,
          prazo_padrao: prazoPadrao,
          justificativa_alteracao_prazo: "",
          criticidade: "media" as const,
          tipo_evidencia_exigida: "descricao",
          itens_plano: [] as ItemPlano[],
        };
        if (!p.prazo) throw new Error(`Informe o prazo do plano para "${f.label}".`);
        if (!Array.isArray(p.itens_plano) || p.itens_plano.length === 0) {
          throw new Error(`Marque ao menos uma evidência para "${f.label}".`);
        }
        const prazoMs = new Date(p.prazo).getTime();
        const padraoMs = p.prazo_padrao ? new Date(p.prazo_padrao).getTime() : prazoMs;
        return {
          field_id: f.id,
          field_label: f.label || f.id,
          descricao_acao: p.descricao_acao?.trim() || p.itens_plano.map(i => `${i.tipo}: ${i.titulo || i.tipo}`).join(" | "),
          prazo_iso: new Date(p.prazo).toISOString(),
          prazo_padrao_iso: p.prazo_padrao ? new Date(p.prazo_padrao).toISOString() : null,
          prazo_alterado: prazoMs > padraoMs + 60000,
          justificativa_alteracao_prazo: p.justificativa_alteracao_prazo || null,
          anexo_url: p.anexo_orientacao_url ?? null,
          criticidade: p.criticidade,
          tipo_evidencia_exigida: p.tipo_evidencia_exigida,
          itens_plano: p.itens_plano,
          anexo_orientacao_url: p.anexo_orientacao_url ?? null,
          anexo_orientacao_anexo_id: p.anexo_orientacao_anexo_id ?? null,
          anexo_orientacao_mime_type: p.anexo_orientacao_mime_type ?? null,
        };
      });
      await flow.criarPlanosAcaoEDevolver.mutateAsync({ assignment, planos: planosPayload as any, motivoGeral: motivoFinal });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao registrar plano de ação.");
    }
  };

  const devolverApenas = async () => {
    const perguntas = perguntasComAcao.filter((f) => {
      const rule = getRuleForResposta(f, getRespostaAprovador(f), "aprovador");
      return (acaoPorNC[f.id] ?? getDefaultReviewAction(rule)) === "devolver";
    }).map((f) => ({
      field_id: f.id,
      field_label: f.label || f.id,
      motivo: flow.approverAnswers[f.id]?.observacao
        ?? flow.existingApprovalAnswers.find((a: any) => a.field_id === f.id)?.observacao
        ?? motivoFinal
        ?? "Devolvido pelo aprovador",
    }));
    try {
      await flow.devolverPerguntasParaRefazer.mutateAsync({ assignment, perguntas, motivoGeral: motivoFinal });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao devolver perguntas.");
    }
  };

  const irParaPlano = () => {
    setStep("plano");
    void submeterPlanos();
  };

  const aprovarDireto = async () => {
    try {
      await flow.finalDecision.mutateAsync({ assignment, action: "aprovar" });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao aprovar.");
    }
  };

  // ▼▼▼ TUDO ABAIXO É DERIVADO DE `perms` — NÃO DUPLICAR LÓGICA AQUI ▼▼▼
  // Aliases legados para minimizar diff nos JSX que já existiam abaixo.
  const planosAuditorPendentes = (flow.planosDoAuditor as any[]).filter((p: any) => !p.respondido);
  const emAuditoria = perms.status === "aguardando_auditoria";
  const fieldsDevolvidos = perms.fieldsDevolvidosPeloAuditor;
  const temPlanosAuditorPendentes = perms.hasAuditorPlansPending;
  const emModoRestrito = perms.approverPanelRestricted;
  const nomeResponsavelAuditoria = perms.responsavelAtual;

  // ── Modal Confirmar Aprovação ─────────────────────────────────────────────
  if (showAprovarModal) {
    const temPlanoPendente = planosAuditorPendentes.length > 0;

    const todosNaJustificados = perguntasAutoAprovador.every((p: any) => {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const r = respostasAutoAprovador[key] ?? { na: false };
      return !r.na || !!r.justificativa?.trim();
    });
    const todosPlansPreenchidos = planosAuditorPendentes.every((p: any) => {
      const itens: any[] = Array.isArray(p.itens_plano) ? p.itens_plano : [];
      if (itens.length === 0) return true;
      const resps = auditorRespostas[p.id] ?? {};
      return itens.every((item: any) => {
        const r = resps[item.tipo];
        return r && (r.valor_texto || r.evidencia_url);
      });
    });
    const podeEnviar = todosNaJustificados && (!temPlanoPendente || todosPlansPreenchidos);

    const handleEnviar = async () => {
      for (const p of perguntasAutoAprovador) {
        const key = (p as any).tempId ?? (p as any).id ?? (p as any).pergunta;
        const r = respostasAutoAprovador[key];
        if (r?.na && !r?.justificativa?.trim()) {
          toast.error(`Justificativa obrigatória para N/A em: "${(p as any).pergunta}"`);
          return;
        }
      }
      try {
        if (temPlanoPendente) {
          for (const ap of planosAuditorPendentes) {
            const resps = auditorRespostas[ap.id] ?? {};
            const rodada = ap.rodada ?? 1;
            const existing = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
            const novoJson = { ...(existing?.valor_json ?? {}) };
            for (const [tipo, val] of Object.entries(resps)) {
              novoJson[`__auditor_plano__r${rodada}__${tipo}`] = val;
            }
            await (supabase as any).from("operational_field_answers")
              .upsert({ assignment_id: assignment?.id, field_id: ap.field_id, valor_json: novoJson }, { onConflict: "assignment_id,field_id" });
          }
          await (supabase as any).from("operational_field_reviews")
            .update({ respondido: true, updated_at: new Date().toISOString() })
            .in("id", planosAuditorPendentes.map((p: any) => p.id));
          await (supabase as any).from("operational_assignments")
            .update({ status: "aguardando_auditoria", updated_at: new Date().toISOString() })
            .eq("id", assignment?.id);
          toast.success("Resposta enviada ao auditor.");
          onClose();
        } else {
          if (notaMaximaAprovador > 0) {
            await (supabase as any).from("operational_assignments")
              .update({ score_aprovacao: notaEfetivaAprovador, updated_at: new Date().toISOString() })
              .eq("id", assignment?.id);
          }
          await aprovarDireto();
        }
      } catch (e: any) {
        toast.error(e.message || "Erro ao enviar.");
      }
    };

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <button type="button" onClick={() => setShowAprovarModal(false)} className="p-1 rounded hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-semibold text-foreground">Confirmar Aprovação</span>
        </div>

        {/* Perguntas automáticas do checklist — avaliam o executor */}
        {perguntasAutoAprovador.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">Avaliação do executor</p>
            {perguntasAutoAprovador.map((p: any, idx: number) => {
              const key = p.tempId ?? p.id ?? p.pergunta;
              const r = respostasAutoAprovador[key] ?? { na: false, justificativa: "" };
              const auto = calcRespostaExecutor(p.metrica_calculo ?? "manual");
              return (
                <div key={key} className={`border rounded-lg p-3 space-y-2 ${r.na ? "opacity-60 bg-muted/20 border-border" : auto.tiraPonto ? "bg-red-50 dark:bg-red-950/20 border-red-200" : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200"}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-5 shrink-0 mt-0.5">{idx + 1}.</span>
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
                          onChange={e => setRespostasAutoAprovador(prev => ({ ...prev, [key]: { ...r, na: e.target.checked } }))}
                          className="w-3.5 h-3.5" />
                        <span className="text-[11px] text-muted-foreground">N/A</span>
                      </label>
                    )}
                  </div>
                  {r.na && (
                    <div className="space-y-1 ml-5">
                      <Label className="text-[10px] text-amber-700">Justificativa obrigatória — por que N/A? (nota será mantida)</Label>
                      <Textarea value={r.justificativa}
                        onChange={e => setRespostasAutoAprovador(prev => ({ ...prev, [key]: { ...r, justificativa: e.target.value } }))}
                        placeholder="Por que este item não se aplica..."
                        className="text-xs min-h-[36px]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Nota final do executor */}
        <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Nota final do executor</span>
            <span className="text-primary text-lg font-bold">{notaEfetivaAprovador} pts</span>
          </div>
          {notaMaximaAprovador > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {notaEfetivaAprovador} de {notaMaximaAprovador} pts possíveis
            </p>
          )}
        </div>

        {/* Plano do auditor — preencher antes de enviar (somente se houver pendente) */}
        {temPlanoPendente && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
              <p className="text-[10px] uppercase tracking-wider text-purple-800 font-medium">Resposta ao Plano do Auditor</p>
            </div>
            {planosAuditorPendentes.map((ap: any, idx: number) => {
              const itens: any[] = Array.isArray(ap.itens_plano) ? ap.itens_plano : [];
              const rodada = ap.rodada ?? 1;
              const resps = auditorRespostas[ap.id] ?? {};
              return (
                <div key={ap.id || idx} className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                    <span className="text-[11px] font-semibold text-purple-800">Plano do Auditor — R{idx + 1}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">{ap.avaliado_em ? new Date(ap.avaliado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                  </div>
                  <div className="px-3 py-2 space-y-2">
                    {ap.instrucao_aprovador && <p className="text-xs text-foreground">{ap.instrucao_aprovador}</p>}
                    {itens.map((item: any, iIdx: number) => {
                      const val = resps[item.tipo];
                      const temResposta = !!(val?.valor_texto || val?.evidencia_url);
                      // Exceção: chave de loading por plano+tipo — mesmo padrão do DynamicFieldRenderer
                      const uploadKey = `${ap.id}__${item.tipo}`;
                      const isUploadingItem = !!uploadingAuditorPlano[uploadKey];
                      const progressItem = uploadProgressAuditorPlano[uploadKey] ?? 0;
                      return (
                        <div key={iIdx} className="space-y-1">
                          {item.titulo && <p className="text-[11px] text-purple-800 font-medium">{item.titulo}</p>}
                          {temResposta ? (
                            (item.tipo === "texto" || item.tipo === "descricao") ? (
                              <div className="bg-card border border-border rounded p-2 flex items-center justify-between">
                                <p className="text-xs">{val?.valor_texto}</p>
                                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground ml-2"
                                  onClick={() => setAuditorRespostas(prev => { const n = {...prev, [ap.id]: {...(prev[ap.id]??{})} }; delete n[ap.id][item.tipo]; return n; })}>✕</button>
                              </div>
                            ) : (
                              <EvidenciaPreview anexoId={val?.evidencia_anexo_id ?? null} url={val?.evidencia_url ?? ""} mimeType={val?.evidencia_mime_type ?? null}
                                onRemove={() => setAuditorRespostas(prev => { const n = {...prev, [ap.id]: {...(prev[ap.id]??{})}}; delete n[ap.id][item.tipo]; return n; })} />
                            )
                          ) : (item.tipo === "texto" || item.tipo === "descricao") ? (
                            <textarea
                              placeholder={`${item.titulo || "Descreva"}...`} rows={3}
                              className="w-full text-xs rounded border border-purple-300 bg-white px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400"
                              onChange={e => setAuditorRespostas(prev => ({ ...prev, [ap.id]: { ...(prev[ap.id] ?? {}), [item.tipo]: { valor_texto: e.target.value } } }))}
                            />
                          ) : (
                            <label className={`flex items-center justify-center gap-2 border border-dashed border-purple-400 rounded-lg p-4 cursor-pointer hover:border-purple-600 transition-colors min-h-[52px] ${isUploadingItem ? "opacity-60 pointer-events-none" : ""}`}>
                              {isUploadingItem ? (
                                <div className="flex flex-col items-center gap-1 w-full">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                                  <span className="text-xs text-purple-700">{progressItem}%</span>
                                  <div className="w-full bg-muted rounded-full h-1">
                                    <div className="bg-purple-500 h-1 rounded-full transition-all" style={{ width: `${progressItem}%` }} />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <Upload className="w-3.5 h-3.5 text-purple-600" />
                                  <span className="text-xs text-purple-800 font-medium">
                                    {item.tipo === "foto" ? "Tirar foto" : item.tipo === "video" ? "Gravar vídeo" : "Gravar áudio"} *
                                  </span>
                                </>
                              )}
                              <input type="file" className="hidden"
                                accept={item.tipo === "foto" ? "image/*" : item.tipo === "video" ? "video/*" : "audio/*"}
                                capture="environment"
                                onChange={e => {
                                  const file = e.target.files?.[0]; if (!file) return;
                                  supabase.auth.getSession().then(({ data: sess }) => {
                                    const token = sess.session?.access_token; if (!token) return;
                                    const fd = new FormData();
                                    fd.append("file", file); fd.append("contexto_tipo", "aprovacao");
                                    fd.append("contexto_ref_id", ap.field_id);
                                    if (assignment?.id) fd.append("assignment_id", assignment.id);
                                    setUploadingAuditorPlano(prev => ({ ...prev, [uploadKey]: true }));
                                    setUploadProgressAuditorPlano(prev => ({ ...prev, [uploadKey]: 0 }));
                                    const xhr = new XMLHttpRequest();
                                    xhr.open("POST", `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tarefas-storage-upload`);
                                    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
                                    xhr.upload.onprogress = ev => {
                                      if (ev.lengthComputable)
                                        setUploadProgressAuditorPlano(prev => ({ ...prev, [uploadKey]: Math.round((ev.loaded / ev.total) * 100) }));
                                    };
                                    xhr.onload = () => {
                                      setUploadingAuditorPlano(prev => ({ ...prev, [uploadKey]: false }));
                                      try {
                                        const json = JSON.parse(xhr.responseText);
                                        if (xhr.status >= 200 && xhr.status < 300 && json.ok)
                                          setAuditorRespostas(prev => ({ ...prev, [ap.id]: { ...(prev[ap.id] ?? {}), [item.tipo]: { evidencia_url: json.anexo.path_relativo, evidencia_anexo_id: json.anexo.id, evidencia_mime_type: json.anexo.mime_type ?? file.type } } }));
                                        else toast.error("Erro ao enviar arquivo.");
                                      } catch { toast.error("Erro ao processar resposta."); }
                                    };
                                    xhr.onerror = () => { setUploadingAuditorPlano(prev => ({ ...prev, [uploadKey]: false })); toast.error("Erro de rede ao enviar arquivo."); };
                                    xhr.send(fd);
                                  });
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!todosPlansPreenchidos && (
              <p className="text-[11px] text-purple-700 text-center">Preencha todos os itens do plano antes de enviar.</p>
            )}
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
          <Button type="button" size="sm" variant="outline" onClick={() => setShowAprovarModal(false)} disabled={flow.isSaving}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
          </Button>
          <div className="flex-1" />
          <Button type="button" size="sm" onClick={handleEnviar} disabled={!podeEnviar || flow.isSaving}
            className={temPlanoPendente ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}>
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Enviando..." : temPlanoPendente ? "Enviar ao auditor" : "Confirmar aprovação"}
          </Button>
        </div>
      </div>
    );
  }
  // ── fim Modal Confirmar Aprovação ────────────────────────────────────────

  if (false && planosAuditorPendentes.length > 0) {
    return (
      <div className="space-y-3">
        <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 rounded-lg p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
          <div className="text-xs text-purple-800">
            O auditor criou {planosAuditorPendentes.length} plano(s) de acao. Responda antes de continuar.
          </div>
        </div>

        {/* Respostas do executor — contexto somente-leitura para o aprovador responder ao auditor */}
        {approverFields.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted border-b border-border flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Respostas do Executor</span>
            </div>
            <div className="divide-y divide-border">
              {approverFields.map((f) => {
                const execAnswer = findOriginalFieldAnswer(f, flow);
                const execAnswerStatus = normalizeAnswer(getAnswerValue(execAnswer));
                const execObservation = getObservation(execAnswer);
                const execEvidence = getEvidence(execAnswer);
                return (
                  <div key={f.id} className="px-3 py-2.5 space-y-2">
                    <span className="text-xs font-medium text-foreground">{(f as any).label || f.id}</span>
                    <div className="flex gap-2 mt-1">
                      {getReviewOptions(f, "aprovador").map((opt) => {
                        const optStatus = normalizeAnswer(opt.v);
                        const marcado = !!execAnswerStatus && optStatus === execAnswerStatus;
                        const cls = marcado
                          ? optStatus === "conforme"
                            ? "bg-emerald-600 border-emerald-700 text-white ring-2 ring-emerald-300"
                            : optStatus === "nao_conforme"
                              ? "bg-red-600 border-red-700 text-white ring-2 ring-red-300"
                              : "bg-slate-700 border-slate-800 text-white ring-2 ring-slate-300"
                          : "bg-background border-border text-muted-foreground opacity-25";
                        return (
                          <div key={opt.v} className={`flex-1 text-xs px-2 py-1.5 rounded border text-center font-semibold ${cls}`}>
                            {marcado ? "✓ " : ""}{opt.label}
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Resposta:{" "}
                      <span className={`font-bold ${execAnswerStatus === "conforme" ? "text-emerald-700" : execAnswerStatus === "nao_conforme" ? "text-red-700" : execAnswerStatus === "na" ? "text-slate-700" : "text-muted-foreground"}`}>
                        {execAnswerStatus === "conforme" ? "Conforme" : execAnswerStatus === "nao_conforme" ? "Não Conforme" : execAnswerStatus === "na" ? "N/A" : "Sem resposta"}
                      </span>
                    </div>
                    {execObservation && <p className="text-xs text-foreground">{execObservation}</p>}
                    {execEvidence && (
                      <div className="bg-card border border-border rounded-md overflow-hidden">
                        <div className="px-2 py-1 bg-blue-50 dark:bg-blue-950/20 border-b border-border">
                          <span className="text-[10px] font-medium text-blue-800 dark:text-blue-400">
                            {execAnswer?.evidencia_mime_type?.startsWith("video/") ? "🎥 Vídeo" : execAnswer?.evidencia_mime_type?.startsWith("audio/") ? "🎵 Áudio" : "📷 Foto"}
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {planosAuditorPendentes.map((auditPlan: any, idx: number) => {
          const itens: Array<{tipo:string;titulo:string;obrigatorio:boolean}> = Array.isArray(auditPlan.itens_plano) ? auditPlan.itens_plano : [];
          const rodada = auditPlan.rodada ?? 1;
          const perguntaId = auditPlan.field_id;
          return (
            <div key={idx} className="border border-purple-300 rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border-b border-purple-200">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                <span className="text-[11px] font-semibold text-purple-800">Plano do Auditor — R{rodada}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{auditPlan.avaliado_em ? new Date(auditPlan.avaliado_em).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}) : ""}</span>
              </div>
              <div className="px-3 py-2 space-y-3">
                {auditPlan.instrucao_aprovador && <p className="text-xs">{auditPlan.instrucao_aprovador}</p>}
                {itens.map((item, iIdx) => {
                  const itemFieldId = `${perguntaId}__auditor_plano__r${rodada}__${item.tipo}`;
                  const itemAnswer = (flow.fieldAnswers as any[]).find((a:any) => a.field_id === perguntaId);
                  const valorJson = itemAnswer?.valor_json ?? {};
                  const dado = valorJson[`__auditor_plano__r${rodada}__${item.tipo}`];
                  const hasMedia = !!(dado?.evidencia_url || dado?.valor_texto);
                  return (
                    <div key={iIdx} className="space-y-1.5">
                      {item.titulo && <p className="text-xs text-purple-800 font-medium">{item.titulo}</p>}
                      {hasMedia ? (
                        (item.tipo === "texto" || item.tipo === "descricao") ? (
                          <div className="bg-card border border-border rounded p-2">
                            <p className="text-xs">{dado.valor_texto}</p>
                          </div>
                        ) : (
                          <EvidenciaPreview
                            anexoId={dado.evidencia_anexo_id ?? null}
                            url={dado.evidencia_url}
                            mimeType={dado.evidencia_mime_type ?? null}
                            disabled
                          />
                        )
                      ) : (item.tipo === "texto" || item.tipo === "descricao") ? (
                        <textarea
                          placeholder={`${item.titulo || "Descreva"}...`}
                          rows={3}
                          className="w-full text-xs rounded border border-purple-300 bg-white px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-purple-400"
                          onChange={e => {
                            const val = e.target.value;
                            flow.updateApproverAnswer(itemFieldId, { resposta: val } as any);
                          }}
                        />
                      ) : (
                        <label className="flex items-center justify-center gap-2 border border-dashed border-purple-400 rounded-lg p-4 cursor-pointer hover:border-purple-600 transition-colors min-h-[52px]">
                          <Upload className="w-3.5 h-3.5 text-purple-600" />
                          <span className="text-xs text-purple-800 font-medium">
                            {item.tipo === "foto" ? "Tirar foto" : item.tipo === "video" ? "Gravar video" : "Gravar audio"} *
                          </span>
                          <input type="file" className="hidden"
                            accept={item.tipo === "foto" ? "image/*" : item.tipo === "video" ? "video/*" : "audio/*"}
                            capture="environment"
                            onChange={async e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const { data: sess } = await supabase.auth.getSession();
                              const token = sess.session?.access_token;
                              if (!token) return;
                              const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
                              const fd = new FormData();
                              fd.append("file", file);
                              fd.append("contexto_tipo", "aprovacao");
                              fd.append("contexto_ref_id", perguntaId);
                              if (assignment?.id) fd.append("assignment_id", assignment.id);
                              const res = await fetch(`${FN_BASE}/tarefas-storage-upload`, { method:"POST", headers:{Authorization:`Bearer ${token}`}, body:fd });
                              const json = await res.json();
                              if (json.ok) {
                                const chave = `__auditor_plano__r${rodada}__${item.tipo}`;
                                // Salva no valor_json do campo via upsert direto
                                const existing = (flow.fieldAnswers as any[]).find((a:any) => a.field_id === perguntaId);
                                const novoJson = { ...(existing?.valor_json ?? {}), [chave]: { evidencia_url: json.anexo.path_relativo, evidencia_anexo_id: json.anexo.id, evidencia_mime_type: json.anexo.mime_type ?? file.type } };
                                await (supabase as any).from("operational_field_answers").upsert({ assignment_id: assignment?.id, field_id: perguntaId, valor_json: novoJson }, { onConflict: "assignment_id,field_id" });
                                (flow as any).scheduleAutoSave && (flow as any).scheduleAutoSave(perguntaId, {} as any);
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        <Button type="button" className="w-full bg-purple-600 hover:bg-purple-700 text-white"
          onClick={async () => {
            // Marca planos do auditor como respondidos e muda status para aguardando_auditoria
            await (supabase as any).from("operational_field_reviews")
              .update({ respondido: true, updated_at: new Date().toISOString() })
              .in("id", planosAuditorPendentes.map((p:any) => p.id));
            await (supabase as any).from("operational_assignments")
              .update({ status: "aguardando_auditoria", updated_at: new Date().toISOString() })
              .eq("id", assignment?.id);
            toast.success("Resposta enviada ao auditor.");
            onClose();
          }}>
          Enviar resposta ao auditor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {perms.approverPanelRestricted && perms.approverLockMessage && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border-2 border-red-400 rounded-lg shadow-sm">
          <span className="text-lg shrink-0">🔒</span>
          <p className="text-xs text-red-800 dark:text-red-300 font-semibold">
            {perms.approverLockMessage}
          </p>
        </div>
      )}
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
                      const nPlanos = (flow.fieldReviews as any[]).filter((r: any) => r.field_id === f.id && r.devolvido === true && r.criado_por_papel !== "auditor").length;
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
                  const planosDoField = (flow.fieldReviews as any[])
                    .filter((r: any) => r.field_id === f.id && r.devolvido === true && r.criado_por_papel !== "auditor")
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

                  return planosDoField.map((r: any, idx: number) => {
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
                            if (!resp) {
                              return (
                                <div className="px-3 py-2 bg-muted/10 flex items-center gap-2">
                                  <Clock className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-xs text-muted-foreground italic">Resposta enviada pelo executor</span>
                                </div>
                              );
                            }

                            // Novo formato: itens do plano por tipo no _itensPlano
                            if (resp._itensPlano) {
                              const reviewRound2 = Number(r?.rodada ?? 1);
                              const chavePrefix = `__plano_acao__r${reviewRound2}__`;
                              return (
                                <div className="px-3 py-2 bg-muted/10 border-b border-border space-y-2">
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resposta do executor — R{r.rodada}</p>
                                  {itens.map((item: any, iIdx: number) => {
                                    const chave = `${chavePrefix}${item.tipo}`;
                                    const itemData = resp._itensPlano[chave];
                                    if (!itemData) return null;
                                    return (
                                      <div key={iIdx} className="space-y-1">
                                        {item.titulo && <p className="text-[10px] text-amber-800 font-medium">{item.titulo}</p>}
                                        {(item.tipo === "texto" || item.tipo === "descricao") && itemData.valor_texto && (
                                          <div className="bg-card border border-border rounded p-2">
                                            <p className="text-xs">{itemData.valor_texto}</p>
                                          </div>
                                        )}
                                        {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && itemData.evidencia_url && (
                                          <EvidenciaPreview
                                            anexoId={itemData.evidencia_anexo_id ?? null}
                                            url={itemData.evidencia_url}
                                            mimeType={itemData.evidencia_mime_type ?? null}
                                            disabled
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            }

                            // Formato legado
                            const respObs = getObservation(resp);
                            const respEvid = getEvidence(resp);
                            const evidUrl = respEvid ? String(respEvid) : "";
                            return (
                              <div className="px-3 py-2 bg-muted/10 border-b border-border space-y-1.5">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resposta do executor — R{r.rodada}</p>
                                {respObs && <p className="text-xs">{respObs}</p>}
                                {evidUrl && (
                                  <EvidenciaPreview
                                    anexoId={null}
                                    url={evidUrl}
                                    mimeType={null}
                                    disabled
                                  />
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
                          {/* Botões Conforme / Não Conforme no plano — só no último plano, e só se não bloqueado por auditoria */}


                          {idx === planosDoField.length - 1 && (perms.canApproverDecideField(f.id)) && (
                            <div className="px-3 py-2 flex gap-2">
                              <button type="button" onClick={() => handleResposta(f, "conforme")}
                                className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${value === "conforme" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                Conforme
                              </button>
                              <button type="button" onClick={() => {
                                handleResposta(f, "nao_conforme");
                                setPlanos(prev => { const n = {...prev}; delete n[f.id]; return n; });
                                setAcaoPorNC(prev => ({ ...prev, [f.id]: "plano" }));
                                setExpandirNovoPlano(prev => ({ ...prev, [f.id]: true }));
                              }}
                                className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${value === "nao_conforme" ? "bg-red-100 border-red-400 text-red-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                Nao Conforme R{r.rodada + 1}
                              </button>
                            </div>
                          )}
                          {/* Formulario de novo plano inline (R2+) - mesmo layout do R1 */}
                          {idx === planosDoField.length - 1 && (perms.canApproverDecideField(f.id)) && expandirNovoPlano[f.id] && (() => {
                            const p = planos[f.id] || { descricao_acao: "", prazo: computeDefaultPrazo(), prazo_padrao: computeDefaultPrazo(), justificativa_alteracao_prazo: "", criticidade: "media" as const, tipo_evidencia_exigida: "descricao" as const, itens_plano: [] as ItemPlano[], anexo_orientacao_url: null as string | null, anexo_orientacao_anexo_id: null as string | null, anexo_orientacao_mime_type: null as string | null };
                            const updateP = (patch: any) => setPlanos(prev => { const cur = prev[f.id] ?? p; return { ...prev, [f.id]: { ...cur, ...patch } }; });
                            const ITENS_R2 = [
                              { tipo: "foto", label: "Foto", ph: "O que fotografar?" },
                              { tipo: "video", label: "Video", ph: "O que filmar?" },
                              { tipo: "audio", label: "Audio", ph: "O que gravar?" },
                              { tipo: "texto", label: "Texto", ph: "O que descrever?" },
                            ];
                            return (
                              <div className="border border-amber-300 dark:border-amber-800 rounded-lg overflow-hidden mx-3 my-2">
                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200">
                                  <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                                  <span className="text-[11px] font-semibold text-amber-800">Plano de acao — R{r.rodada + 1}</span>
                                </div>
                                <div className="p-3 space-y-2.5">
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Instrucao geral (opcional)</Label>
                                    <Textarea value={p.descricao_acao} onChange={e => updateP({ descricao_acao: e.target.value })} className="text-xs min-h-[44px]" placeholder="Descreva o que precisa ser corrigido..." />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">O que quero de volta (marque ao menos 1)</Label>
                                    <div className="flex flex-col gap-1.5">
                                      {ITENS_R2.map(cfg => {
                                        const ativo = p.itens_plano.find((i: any) => i.tipo === cfg.tipo);
                                        return (
                                          <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo ? "border-primary" : "border-border"}`}>
                                            <button type="button" onClick={() => {
                                              const existe = p.itens_plano.find((i: any) => i.tipo === cfg.tipo);
                                              updateP({ itens_plano: existe ? p.itens_plano.filter((i: any) => i.tipo !== cfg.tipo) : [...p.itens_plano, { tipo: cfg.tipo, titulo: "", obrigatorio: true }] });
                                            }} className={`w-full flex items-center gap-2 px-3 py-2 ${ativo ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo ? "bg-primary border-primary" : "border-border"}`}>
                                                {ativo && <span className="text-primary-foreground text-[10px] font-bold">v</span>}
                                              </div>
                                              <span className="text-xs font-medium">{cfg.label}</span>
                                            </button>
                                            {ativo && (
                                              <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                                <Input value={ativo.titulo} onChange={e => {
                                                  const novoTitulo = e.target.value;
                                                  setPlanos(prev => { const cur = prev[f.id] ?? p; return { ...prev, [f.id]: { ...cur, itens_plano: cur.itens_plano.map((i: any) => i.tipo === cfg.tipo ? { ...i, titulo: novoTitulo } : i) } }; });
                                                }} placeholder={cfg.ph} className="h-7 text-xs" />
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Prazo ({prazoPadraoHoras}h padrao)</Label>
                                    <Input type="datetime-local" className="h-8 text-xs" value={p.prazo} onChange={e => updateP({ prazo: e.target.value })} />
                                  </div>
                                  <div className="flex gap-1.5">
                                    {(["baixa","media","alta"] as const).map(c => (
                                      <button key={c} type="button" onClick={() => updateP({ criticidade: c })}
                                        className={`flex-1 py-1.5 rounded border text-xs font-medium ${p.criticidade === c ? c === "alta" ? "bg-red-100 border-red-400 text-red-700" : c === "media" ? "bg-amber-100 border-amber-400 text-amber-700" : "bg-emerald-100 border-emerald-400 text-emerald-700" : "border-border text-muted-foreground hover:bg-muted"}`}>
                                        {c === "baixa" ? "Baixa" : c === "media" ? "Media" : "Alta"}
                                      </button>
                                    ))}
                                  </div>
                                  <Button type="button" size="sm" onClick={submeterPlanos} disabled={flow.isSaving} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                                    {flow.isSaving ? "Enviando..." : `Registrar plano R${r.rodada + 1} e devolver`}
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}                        </div>
                      </div>
                    );
                  });
                })()}

                {/* 🆕 Resposta enviada ao auditor — quando auditor pediu algo nesta pergunta.
                    Aparece ENTRE o último plano de ação do aprovador (R1/R2/...) e o final
                    do card da pergunta. Substitui a seção global "Auditoria realizada". */}
                {(() => {
                  const planosAuditorDoCampo = (flow.fieldReviews as any[])
                    .filter((r: any) => r.criado_por_papel === "auditor" && r.field_id === f.id)
                    .sort((a: any, b: any) => (a.rodada || 0) - (b.rodada || 0));
                  if (planosAuditorDoCampo.length === 0) return null;
                  return planosAuditorDoCampo.map((ap: any) => {
                    const itens: any[] = Array.isArray(ap.itens_plano) ? ap.itens_plano : [];
                    const fieldAnswer = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
                    const valorJson = fieldAnswer?.valor_json ?? {};
                    const rodada = ap.rodada ?? 1;
                    return (
                      <div key={ap.id} className="px-3 py-2 border-t border-amber-300 bg-amber-50 dark:bg-amber-950/20 space-y-2">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                          <span className="text-[11px] font-semibold text-amber-800">📨 Plano do auditor R{rodada} — sua resposta</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${ap.respondido ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                            {ap.respondido ? "Respondido" : "Pendente"}
                          </span>
                        </div>
                        {ap.instrucao_aprovador && <p className="text-[11px] text-muted-foreground">{ap.instrucao_aprovador}</p>}
                        {itens.length === 0 && <p className="text-[11px] italic text-muted-foreground">—</p>}
                        {itens.map((item: any, iIdx: number) => {
                          const chave = `__auditor_plano__r${rodada}__${item.tipo}`;
                          const dado = valorJson[chave];
                          if (!dado) return <p key={iIdx} className="text-[11px] italic text-muted-foreground">Sem resposta para {item.titulo || item.tipo}</p>;
                          return (
                            <div key={iIdx} className="space-y-1">
                              {item.titulo && <p className="text-[10px] text-amber-800 font-medium">{item.titulo}</p>}
                              {(item.tipo === "texto" || item.tipo === "descricao") && dado.valor_texto && (
                                <div className="bg-card border border-border rounded p-2"><p className="text-xs">{dado.valor_texto}</p></div>
                              )}
                              {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && dado.evidencia_url && (
                                <EvidenciaPreview anexoId={dado.evidencia_anexo_id ?? null} url={dado.evidencia_url} mimeType={dado.evidencia_mime_type ?? null} disabled />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  });
                })()}

                {/* Sem planos ainda — botões normais do aprovador + plano de ação inline */}
                {(flow.fieldReviews as any[]).filter((r: any) => r.field_id === f.id && r.devolvido === true && r.criado_por_papel !== "auditor").length === 0 && (perms.canApproverDecideField(f.id)) && (
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

      {/* ──────────────────────────────────────────────────────────────────
          Seção "Auditoria realizada" — só nota global agora.
          Os planos por pergunta foram movidos para DENTRO de cada card de
          pergunta (acima), evitando duplicação. Esta seção mantém apenas
          o resumo de nota do auditor.
          ────────────────────────────────────────────────────────────── */}
      {(() => {
        const scoreDoAuditor = assignment?.score_aprovador ?? assignment?.score_auditor ?? null;
        const planosAuditor = (flow.fieldReviews as any[]).filter(
          (r: any) => r.criado_por_papel === "auditor"
        );
        const houveAuditoria = scoreDoAuditor != null || planosAuditor.length > 0;
        if (!houveAuditoria) return null;
        return (
          <div className="border border-blue-300 dark:border-blue-800 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
              <span className="text-[11px] font-semibold text-blue-800">Auditoria realizada</span>
            </div>
            <div className="p-3 space-y-2">
              {scoreDoAuditor != null && (
                <div className="flex items-center justify-between bg-primary/5 border border-primary/30 rounded px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Nota recebida do auditor</span>
                  <span className="text-primary text-base font-bold">{scoreDoAuditor} pts</span>
                </div>
              )}
              {planosAuditor.length > 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {planosAuditor.length} plano(s) do auditor — ver detalhe dentro de cada pergunta acima.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">Auditor confirmou sem criar planos.</p>
              )}
            </div>
          </div>
        );
      })()}

      <div className="flex flex-wrap gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
        {false && null}
        <div className="flex-1" />
        {perms.approverPanelRestricted ? (
          <Button
            type="button" size="sm"
            onClick={() => setShowAprovarModal(true)}
            disabled={flow.isSaving || !perms.canApproverFinalize}
            title={perms.approverButtonTooltip ?? undefined}
            className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5 mr-1" />
            {flow.isSaving ? "Salvando..." : "Aprovar"}
          </Button>
        ) : perguntasComAcao.length > 0 ? (
          <Button
            type="button" size="sm"
            onClick={() => {
              // Se ha formulario inline R2 expandido, nao abrir step=plano
              const temInlineAberto = Object.values(expandirNovoPlano).some(Boolean);
              if (temInlineAberto) return;
              if (naoConformesPlanoCompleto.length > 0) {
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
            onClick={() => setShowAprovarModal(true)}
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

  // ⚠️ FONTE ÚNICA DE VERDADE — auditor só age em aguardando_auditoria
  const perms = useFlowPermissions(assignment);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [motivoFinal, setMotivoFinal] = useState("");
  const [respostasAuto, setRespostasAuto] = useState<Record<string, { na: boolean; justificativa: string }>>({});
  const [showPlanoModal, setShowPlanoModal] = useState(false);
  const [perguntasSelecionadas, setPerguntasSelecionadas] = useState<Set<string>>(new Set());
  const [expandirPlanoAuditor, setExpandirPlanoAuditor] = useState<Record<string, boolean>>({});
  const [planosAuditor, setPlanosAuditor] = useState<Record<string, {
    instrucao: string;
    itens: Array<{tipo: string; titulo: string; obrigatorio: boolean}>;
    prazo: string;
  }>>({});
  const [planosAuditorModal, setPlanosAuditorModal] = useState<Record<string, {
    instrucao: string;
    itens: Array<{tipo: string; titulo: string; obrigatorio: boolean}>;
    prazo: string;
  }>>({});
  const [avaliacaoPlanos, setAvaliacaoPlanos] = useState<Record<string, "conforme" | "nao_conforme">>({});
  const [expandirR2, setExpandirR2] = useState<Record<string, boolean>>({});
  const [planosR2, setPlanosR2] = useState<Record<string, { instrucao: string; itens: Array<{tipo:string;titulo:string;obrigatorio:boolean}>; prazo: string }>>({});
  const computePrazoAuditor = () => {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Perguntas AUTO do auditor — vêm do ada_config_snapshot.checklists.validador
  const perguntasAutoAuditor = useMemo(() => {
    const snap = assignment?.operational_templates?.ada_config_snapshot
      ?? assignment?.template_snapshot?.ada_config_snapshot;
    const lista = snap?.checklists?.validador;
    if (!Array.isArray(lista)) return [];
    return lista.filter((p: any) => p.ativo !== false);
  }, [assignment]);

  // Calcula resposta automática para perguntas do auditor (auditando o APROVADOR).
  // Deriva direto dos dados (field_reviews, contingencies) — independe de flags estarem setadas.
  const calcRespostaAuditor = useCallback((metrica: string): { resposta: "sim" | "nao" | null; label: string; tiraPonto: boolean } => {
    const a = assignment;
    if (!a) return { resposta: null, label: "Sem dados", tiraPonto: false };

    const planosAprovador = (flow.allFieldReviews as any[]).filter(
      (r: any) => r.devolvido === true && r.criado_por_papel !== "auditor"
    );
    const contingenciasAtrasadas = (flow.contingencies as any[]).filter((c: any) => {
      if (!c.prazo_resolucao) return false;
      const prazoMs = new Date(c.prazo_resolucao).getTime();
      const refMs = c.resolvida_em ? new Date(c.resolvida_em).getTime() : Date.now();
      return refMs > prazoMs;
    });
    const prorrogacoes = (flow.allFieldReviews as any[]).filter(
      (r: any) => r.prazo_alterado === true && r.criado_por_papel !== "auditor"
    );

    switch (metrica) {
      // ── Aprovador respondeu no SLA? (Sim = fora do prazo, tira ponto) ──
      case "aprovador_respondeu_no_sla": {
        if (a.flag_sla_etapa_estourado) return { resposta: "sim", label: "Sim — avaliou fora do SLA", tiraPonto: true };
        return { resposta: "nao", label: "Não — avaliou no prazo", tiraPonto: false };
      }

      // ── Aprovador devolveu/reabriu? ──
      case "aprovador_reabriu_tarefa": {
        const devolveu = planosAprovador.length > 0 || (a.rodada_atual ?? 1) > 1;
        if (devolveu) return { resposta: "sim", label: `Sim — ${planosAprovador.length || 1} devolução(ões)`, tiraPonto: true };
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }

      // ── Aprovou com pendência? (Sim = pendências, tira ponto) ──
      case "aprovador_aprovou_com_pendencia": {
        // Pendência = plano de ação criado mas executor ainda não respondeu (sem evidência)
        const planosSemResposta = planosAprovador.filter((p: any) => {
          const itens = Array.isArray(p.itens_plano) ? p.itens_plano : [];
          if (itens.length === 0) return false;
          const ans = (flow.fieldAnswers as any[]).find((x: any) => x.field_id === p.field_id);
          const valorJson = ans?.valor_json ?? {};
          // Verifica se há resposta para algum item do plano
          const algumRespondido = itens.some((item: any) => {
            const chave = `__plano_acao__r${p.rodada}__${item.tipo}`;
            return valorJson[chave];
          });
          return !algumRespondido;
        });
        if (planosSemResposta.length > 0) {
          return { resposta: "sim", label: `Sim — ${planosSemResposta.length} pendência(s)`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não — sem pendências", tiraPonto: false };
      }

      // ── Plano de ação estourou SLA? (Sim tira ponto) ──
      case "plano_acao_sla_estourado": {
        if (a.flag_atraso_plano_acao || contingenciasAtrasadas.length > 0) {
          return { resposta: "sim", label: `Sim — ${contingenciasAtrasadas.length || 1} plano(s) atrasado(s)`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
      }

      // ── Prazo foi prorrogado? (Sim tira ponto) ──
      case "plano_acao_prazo_prorrogado": {
        if (prorrogacoes.length > 0) {
          return { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogação(ões)`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }

      // ── Prorrogado 2x+? (Sim tira ponto) ──
      case "plano_acao_prazo_prorrogado_2x": {
        if (a.flag_reincidencia_atraso || prorrogacoes.length >= 2) {
          return { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogações`, tiraPonto: true };
        }
        return { resposta: "nao", label: "Não", tiraPonto: false };
      }

      default:
        return { resposta: null, label: "Avaliação manual", tiraPonto: false };
    }
  }, [assignment, flow.allFieldReviews, flow.contingencies, flow.fieldAnswers]);

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
              tipo_score: "auditor",
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
            tipo_score: "auditor",
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

  const computePrazoAud = () => { const d = new Date(Date.now()+24*3600*1000); const p=(n:number)=>n.toString().padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const ITENS_AUDIT = [{tipo:"foto",label:"Foto"},{tipo:"video",label:"Video"},{tipo:"audio",label:"Audio"},{tipo:"texto",label:"Texto"}];
  const camposDisponiveis = fields.filter((f:any) => (flow.fieldAnswers as any[]).find((a:any) => a.field_id === f.id));
  const step2 = Object.keys(planosAuditorModal).length > 0;

  // Exceção: planos respondidos + avaliação de conformidade — usados no painel principal
  const planosRespondidos = (flow.fieldReviewsAuditor as any[]).filter((ap: any) => ap.respondido);
  const todosConformeAuditor = planosRespondidos.length === 0 || planosRespondidos.every((ap: any) => avaliacaoPlanos[ap.id] === "conforme");

  if (showPlanoModal) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPlanoModal(false)} className="text-muted-foreground hover:text-foreground p-1 rounded">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">Criar plano de acao — Auditor</span>
          </div>
          <button onClick={() => setShowPlanoModal(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none px-1">x</button>
        </div>
        {!step2 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Selecione as perguntas que deseja criar plano de acao:</p>
            <div className="space-y-2">
              {camposDisponiveis.map((f:any) => {
                const sel = perguntasSelecionadas.has(f.id);
                return (
                  <div key={f.id} onClick={() => { const next = new Set(perguntasSelecionadas); sel ? next.delete(f.id) : next.add(f.id); setPerguntasSelecionadas(next); }}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer ${sel?"bg-purple-50 dark:bg-purple-950/20 border-purple-400":"bg-card border-border hover:bg-muted"}`}>
                    <div className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center ${sel?"bg-purple-600 border-purple-600":"border-border"}`}>
                      {sel && <span className="text-white text-xs font-bold">v</span>}
                    </div>
                    <span className="text-sm">{f.label}</span>
                  </div>
                );
              })}
            </div>
            <Button type="button" className="w-full h-11" disabled={perguntasSelecionadas.size===0}
              style={{background:perguntasSelecionadas.size===0?"#ccc":"#534AB7",color:"white",border:"none"}}
              onClick={() => { const init:any={}; perguntasSelecionadas.forEach((id:string)=>{init[id]={instrucao:"",itens:[],prazo:computePrazoAud()};}); setPlanosAuditorModal(init); }}>
              Continuar ({perguntasSelecionadas.size} selecionada{perguntasSelecionadas.size!==1?"s":""})
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => setPlanosAuditorModal({})} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar para selecao de perguntas
            </button>
            {Array.from(perguntasSelecionadas).map((fieldId:string) => {
              const f = fields.find((x:any)=>x.id===fieldId);
              if (!f) return null;
              const answer = (flow.fieldAnswers as any[]).find((a:any)=>a.field_id===fieldId);
              const pl = planosAuditorModal[fieldId] ?? {instrucao:"",itens:[],prazo:computePrazoAud()};
              const updatePl = (patch:any) => setPlanosAuditorModal((prev:any)=>({...prev,[fieldId]:{...(prev[fieldId]??pl),...patch}}));
              return (
                <div key={fieldId} className="border border-purple-300 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-purple-50 dark:bg-purple-950/20 border-b border-purple-200">
                    <span className="text-xs font-semibold text-purple-800 dark:text-purple-300">{f.label}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">Resposta: {answer?.valor_booleano===true?"Sim":answer?.valor_booleano===false?"Nao":answer?.valor_texto==="na"?"N/A":answer?.valor_texto??"—"}</span>
                  </div>
                  <div className="p-3 space-y-3">
                    <div>
                      <Label className="text-[11px]">Instrucao geral (opcional)</Label>
                      <Textarea value={pl.instrucao} onChange={e=>updatePl({instrucao:e.target.value})} rows={2} className="text-xs mt-1 min-h-[44px]" placeholder="O que o aprovador deve corrigir..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">O que quero de volta (marque ao menos 1)</Label>
                      {ITENS_AUDIT.map(cfg => {
                        const ativo = pl.itens.find((i:any)=>i.tipo===cfg.tipo);
                        return (
                          <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo?"border-purple-400":"border-border"}`}>
                            <button type="button" onClick={()=>{const existe=pl.itens.find((i:any)=>i.tipo===cfg.tipo);updatePl({itens:existe?pl.itens.filter((i:any)=>i.tipo!==cfg.tipo):[...pl.itens,{tipo:cfg.tipo,titulo:"",obrigatorio:true}]});}}
                              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${ativo?"bg-purple-50 dark:bg-purple-950/20":"hover:bg-muted/50"}`}>
                              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo?"bg-purple-600 border-purple-600":"border-border"}`}>
                                {ativo && <span className="text-white text-[10px] font-bold">v</span>}
                              </div>
                              <span className="text-xs font-medium">{cfg.label}</span>
                            </button>
                            {ativo && (
                              <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                <Input value={ativo.titulo} onChange={e=>{const t=e.target.value;updatePl({itens:pl.itens.map((i:any)=>i.tipo===cfg.tipo?{...i,titulo:t}:i)});}} placeholder={`Instrucao para ${cfg.label}...`} className="h-8 text-xs" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div>
                      <Label className="text-[11px]">Prazo</Label>
                      <Input type="datetime-local" value={pl.prazo} onChange={e=>updatePl({prazo:e.target.value})} className="h-9 text-xs mt-1" />
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-1 border-t border-border">
              <Button type="button" size="default" className="flex-1 h-11 text-white" style={{background:"#534AB7"}} disabled={flow.isSaving}
                onClick={async()=>{
                  for (const [fieldId,pl] of Object.entries(planosAuditorModal) as any) {
                    if (!pl.itens.length && !pl.instrucao) continue;
                    const f = fields.find((x:any)=>x.id===fieldId);
                    await flow.criarPlanoAuditor.mutateAsync({perguntaId:fieldId,perguntaLabel:(f as any)?.label??fieldId,instrucao:pl.instrucao,itensPlano:pl.itens,prazoIso:pl.prazo?new Date(pl.prazo).toISOString():new Date(Date.now()+86400000).toISOString()});
                  }
                  setShowPlanoModal(false);
                  onClose();
                }}>
                {flow.isSaving?"Enviando...":`Registrar ${Object.keys(planosAuditorModal).length} plano(s) e enviar ao aprovador`}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (showConfirmModal) {
    return (
      <div className="space-y-4" style={{position:"relative"}}>
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
                {/* Botao abrir plano do auditor para o aprovador */}
                {auto.tiraPonto && !r.na && (() => {
                  const planoAberto = expandirPlanoAuditor[key];
                  const pl = planosAuditor[key] ?? { instrucao: "", itens: [], prazo: computePrazoAuditor() };
                  const ITENS_AUDIT = [
                    { tipo: "foto", label: "Foto" },
                    { tipo: "video", label: "Video" },
                    { tipo: "audio", label: "Audio" },
                    { tipo: "texto", label: "Texto" },
                  ];
                  return (
                    <div className="mt-1">
                      {!planoAberto ? (
                        <button type="button"
                          onClick={() => setExpandirPlanoAuditor(prev => ({ ...prev, [key]: true }))}
                          className="text-[11px] px-2 py-1 rounded border border-amber-400 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-colors">
                          Abrir plano de acao para o aprovador
                        </button>
                      ) : (
                        <div className="border border-amber-300 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
                            <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                            <span className="text-[11px] font-semibold text-amber-800">Plano para o aprovador — {p.pergunta}</span>
                          </div>
                          <div className="p-3 space-y-2.5">
                            <div>
                              <Label className="text-[11px]">Instrucao geral (opcional)</Label>
                              <Textarea value={pl.instrucao}
                                onChange={e => setPlanosAuditor(prev => ({ ...prev, [key]: { ...(prev[key] ?? pl), instrucao: e.target.value } }))}
                                className="text-xs min-h-[44px]" placeholder="O que o aprovador deve corrigir..." />
                            </div>
                            <div>
                              <Label className="text-[11px]">O que quero de volta (marque ao menos 1)</Label>
                              <div className="flex flex-col gap-1.5 mt-1">
                                {ITENS_AUDIT.map(cfg => {
                                  const ativo = pl.itens.find(i => i.tipo === cfg.tipo);
                                  return (
                                    <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo ? "border-primary" : "border-border"}`}>
                                      <button type="button" onClick={() => {
                                        const existe = pl.itens.find(i => i.tipo === cfg.tipo);
                                        const novosItens = existe ? pl.itens.filter(i => i.tipo !== cfg.tipo) : [...pl.itens, { tipo: cfg.tipo, titulo: "", obrigatorio: true }];
                                        setPlanosAuditor(prev => ({ ...prev, [key]: { ...(prev[key] ?? pl), itens: novosItens } }));
                                      }} className={`w-full flex items-center gap-2 px-3 py-2 ${ativo ? "bg-primary/10" : "hover:bg-muted/50"}`}>
                                        <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo ? "bg-primary border-primary" : "border-border"}`}>
                                          {ativo && <span className="text-primary-foreground text-[10px] font-bold">v</span>}
                                        </div>
                                        <span className="text-xs font-medium">{cfg.label}</span>
                                      </button>
                                      {ativo && (
                                        <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                          <Input value={ativo.titulo}
                                            onChange={e => {
                                              const t = e.target.value;
                                              setPlanosAuditor(prev => { const cur = prev[key] ?? pl; return { ...prev, [key]: { ...cur, itens: cur.itens.map(i => i.tipo === cfg.tipo ? { ...i, titulo: t } : i) } }; });
                                            }}
                                            placeholder={`Instrucao para ${cfg.tipo}...`} className="h-7 text-xs" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <Label className="text-[11px]">Prazo</Label>
                              <Input type="datetime-local" value={pl.prazo}
                                onChange={e => setPlanosAuditor(prev => ({ ...prev, [key]: { ...(prev[key] ?? pl), prazo: e.target.value } }))}
                                className="h-8 text-xs mt-1" />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="outline"
                                onClick={() => setExpandirPlanoAuditor(prev => ({ ...prev, [key]: false }))}>
                                Cancelar
                              </Button>
                              <Button type="button" size="sm"
                                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                                disabled={flow.isSaving || pl.itens.length === 0}
                                onClick={async () => {
                                  await flow.criarPlanoAuditor.mutateAsync({
                                    perguntaId: key,
                                    perguntaLabel: p.pergunta,
                                    instrucao: pl.instrucao,
                                    itensPlano: pl.itens,
                                    prazoIso: pl.prazo ? new Date(pl.prazo).toISOString() : new Date(Date.now() + 86400000).toISOString(),
                                  });
                                  setExpandirPlanoAuditor(prev => ({ ...prev, [key]: false }));
                                  onClose();
                                }}>
                                {flow.isSaving ? "Enviando..." : "Registrar plano e enviar ao aprovador"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Respostas do aprovador aos planos do auditor — Conforme / Não Conforme / R2 */}
        {((flow.fieldReviewsAuditor as any[]).filter((ap: any) => ap.respondido)).length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">Respostas do Aprovador aos Planos</p>
            {(flow.fieldReviewsAuditor as any[])
              .filter((ap: any) => ap.respondido)
              .map((ap: any, idx: number) => {
                const field = fields.find((f: any) => f.id === ap.field_id);
                const fieldAnswer = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
                const rodada = ap.rodada ?? 1;
                const itens: any[] = Array.isArray(ap.itens_plano) ? ap.itens_plano : [];
                const valorJson = fieldAnswer?.valor_json ?? {};
                const avaliacao = avaliacaoPlanos[ap.id];
                const expandR2 = expandirR2[ap.id];
                const plR2 = planosR2[ap.id] ?? { instrucao: "", itens: [] as any[], prazo: computePrazoAuditor() };
                const updateR2 = (patch: any) => setPlanosR2(prev => ({ ...prev, [ap.id]: { ...(prev[ap.id] ?? plR2), ...patch } }));
                return (
                  <div key={ap.id || idx} className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                      <span className="text-[11px] font-semibold text-purple-800">{field?.label ?? ap.field_id} — Plano R{idx + 1}</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 ml-auto">Respondido</span>
                    </div>
                    {ap.instrucao_aprovador && (
                      <div className="px-3 py-2 border-b border-border bg-muted/10">
                        <p className="text-xs text-muted-foreground">{ap.instrucao_aprovador}</p>
                      </div>
                    )}
                    <div className="px-3 py-2 space-y-2 border-b border-border">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resposta do aprovador</p>
                      {itens.length === 0 && <p className="text-[11px] text-muted-foreground italic">Sem itens no plano</p>}
                      {itens.map((item: any, iIdx: number) => {
                        const chave = `__auditor_plano__r${rodada}__${item.tipo}`;
                        const dado = valorJson[chave];
                        if (!dado) return <p key={iIdx} className="text-[11px] text-muted-foreground italic">Sem resposta para {item.titulo || item.tipo}</p>;
                        return (
                          <div key={iIdx} className="space-y-1">
                            {item.titulo && <p className="text-[10px] text-purple-800 font-medium">{item.titulo}</p>}
                            {(item.tipo === "texto" || item.tipo === "descricao") && dado.valor_texto && (
                              <div className="bg-card border border-border rounded p-2"><p className="text-xs">{dado.valor_texto}</p></div>
                            )}
                            {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && dado.evidencia_url && (
                              <EvidenciaPreview anexoId={dado.evidencia_anexo_id ?? null} url={dado.evidencia_url} mimeType={dado.evidencia_mime_type ?? null} disabled />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 py-2 space-y-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setAvaliacaoPlanos(prev => ({ ...prev, [ap.id]: "conforme" })); setExpandirR2(prev => ({ ...prev, [ap.id]: false })); }}
                          className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${avaliacao === "conforme" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                          Conforme
                        </button>
                        <button type="button" onClick={() => { setAvaliacaoPlanos(prev => ({ ...prev, [ap.id]: "nao_conforme" })); setExpandirR2(prev => ({ ...prev, [ap.id]: true })); }}
                          className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${avaliacao === "nao_conforme" ? "bg-red-100 border-red-400 text-red-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                          Não Conforme — R{idx + 2}
                        </button>
                      </div>
                      {expandR2 && (
                        <div className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden mt-1">
                          <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
                            <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                            <span className="text-[11px] font-semibold text-purple-800">Novo plano do auditor — R{idx + 2}</span>
                          </div>
                          <div className="p-3 space-y-2.5">
                            <div>
                              <Label className="text-[11px]">Instrução geral (opcional)</Label>
                              <Textarea value={plR2.instrucao} onChange={e => updateR2({ instrucao: e.target.value })} rows={2} className="text-xs mt-1 min-h-[44px]" placeholder="O que o aprovador deve corrigir..." />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-[11px]">O que quero de volta (marque ao menos 1)</Label>
                              {ITENS_AUDIT.map((cfg: any) => {
                                const ativo = plR2.itens.find((i: any) => i.tipo === cfg.tipo);
                                return (
                                  <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo ? "border-purple-400" : "border-border"}`}>
                                    <button type="button" onClick={() => { const existe = plR2.itens.find((i: any) => i.tipo === cfg.tipo); updateR2({ itens: existe ? plR2.itens.filter((i: any) => i.tipo !== cfg.tipo) : [...plR2.itens, { tipo: cfg.tipo, titulo: "", obrigatorio: true }] }); }}
                                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${ativo ? "bg-purple-50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}>
                                      <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo ? "bg-purple-600 border-purple-600" : "border-border"}`}>
                                        {ativo && <span className="text-white text-[10px] font-bold">v</span>}
                                      </div>
                                      <span className="text-xs font-medium">{cfg.label}</span>
                                    </button>
                                    {ativo && (
                                      <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                        <Input value={(ativo as any).titulo} onChange={e => { const t = e.target.value; updateR2({ itens: plR2.itens.map((i: any) => i.tipo === cfg.tipo ? { ...i, titulo: t } : i) }); }} placeholder={`Instrução para ${cfg.tipo}...`} className="h-7 text-xs" />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div>
                              <Label className="text-[11px]">Prazo</Label>
                              <Input type="datetime-local" value={plR2.prazo} onChange={e => updateR2({ prazo: e.target.value })} className="h-8 text-xs mt-1" />
                            </div>
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => { setExpandirR2(prev => ({ ...prev, [ap.id]: false })); setAvaliacaoPlanos(prev => { const n = {...prev}; delete n[ap.id]; return n; }); }}>Cancelar</Button>
                              <Button type="button" size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                                disabled={flow.isSaving || plR2.itens.length === 0}
                                onClick={async () => {
                                  await flow.criarPlanoAuditor.mutateAsync({ perguntaId: ap.field_id, perguntaLabel: field?.label ?? ap.field_id, instrucao: plR2.instrucao, itensPlano: plR2.itens, prazoIso: plR2.prazo ? new Date(plR2.prazo).toISOString() : new Date(Date.now() + 86400000).toISOString() });
                                  setExpandirR2(prev => ({ ...prev, [ap.id]: false }));
                                  onClose();
                                }}>
                                {flow.isSaving ? "Enviando..." : `Registrar R${idx + 2} e enviar`}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}

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

      {/* Exceção: respostas do aprovador aos planos do auditor — conforme/não-conforme no painel principal */}
      {planosRespondidos.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">Respostas do Aprovador</p>
          {planosRespondidos.map((ap: any, idx: number) => {
            const field = fields.find((f: any) => f.id === ap.field_id);
            const fieldAnswer = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
            const rodada = ap.rodada ?? 1;
            const itens: any[] = Array.isArray(ap.itens_plano) ? ap.itens_plano : [];
            const valorJson = fieldAnswer?.valor_json ?? {};
            const avaliacao = avaliacaoPlanos[ap.id];
            const expandR2 = expandirR2[ap.id];
            const plR2 = planosR2[ap.id] ?? { instrucao: "", itens: [] as any[], prazo: computePrazoAuditor() };
            const updateR2 = (patch: any) => setPlanosR2(prev => ({ ...prev, [ap.id]: { ...(prev[ap.id] ?? plR2), ...patch } }));
            return (
              <div key={ap.id || idx} className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                  <span className="text-[11px] font-semibold text-purple-800">{field?.label ?? ap.field_id} — Plano R{idx + 1}</span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 ml-auto">Respondido</span>
                </div>
                {ap.instrucao_aprovador && (
                  <div className="px-3 py-2 border-b border-border bg-muted/10">
                    <p className="text-xs text-muted-foreground">{ap.instrucao_aprovador}</p>
                  </div>
                )}

                {/* 🆕 HISTÓRICO da pergunta: R0 executor + R1/R2 aprovador + nota final.
                    Dá ao auditor o contexto completo antes de decidir Conforme/NC. */}
                {(() => {
                  const execAns = (flow.fieldAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
                  const planosAprovador = (flow.allFieldReviews as any[])
                    .filter((r: any) => r.field_id === ap.field_id && r.criado_por_papel !== "auditor" && r.devolvido === true)
                    .sort((a: any, b: any) => (a.rodada || 0) - (b.rodada || 0));
                  const respAprov = (flow.approvalAnswers as any[]).find((a: any) => a.field_id === ap.field_id);
                  if (!execAns && planosAprovador.length === 0 && !respAprov) return null;
                  return (
                    <div className="px-3 py-2 border-b border-border bg-muted/5 space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Histórico da pergunta</p>
                      {execAns && (
                        <div className="text-[11px] bg-blue-50 dark:bg-blue-950/20 border border-blue-200 rounded px-2 py-1">
                          <span className="font-semibold text-blue-800">R0 Executor:</span>{" "}
                          {execAns.valor_booleano === true ? "Conforme/Sim" : execAns.valor_booleano === false ? "Não conforme/Não" : execAns.valor_texto || "(sem resposta)"}
                          {execAns.evidencia_url && <span className="ml-1">· 📎 evidência</span>}
                        </div>
                      )}
                      {planosAprovador.map((pa: any) => (
                        <div key={pa.id} className="text-[11px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded px-2 py-1">
                          <span className="font-semibold text-amber-800">R{pa.rodada} Aprovador devolveu:</span>{" "}
                          {pa.motivo_devolucao || pa.instrucao_aprovador || "(sem motivo)"}
                          {Array.isArray(pa.itens_plano) && pa.itens_plano.length > 0 && (
                            <span className="ml-1">· {pa.itens_plano.length} item(s) no plano</span>
                          )}
                        </div>
                      ))}
                      {respAprov && respAprov.resposta && (
                        <div className={`text-[11px] border rounded px-2 py-1 ${
                          respAprov.resposta === "conforme" ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : respAprov.resposta === "nao_conforme" ? "bg-rose-50 border-rose-200 text-rose-800"
                          : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}>
                          <span className="font-semibold">Nota final do Aprovador:</span> {respAprov.resposta === "conforme" ? "Conforme" : respAprov.resposta === "nao_conforme" ? "Não conforme" : respAprov.resposta}
                          {respAprov.observacao && <span> — {respAprov.observacao}</span>}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="px-3 py-2 space-y-2 border-b border-border">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">📨 Resposta do aprovador ao auditor</p>
                  {itens.length === 0 && <p className="text-[11px] text-muted-foreground italic">Sem itens no plano</p>}
                  {itens.map((item: any, iIdx: number) => {
                    const chave = `__auditor_plano__r${rodada}__${item.tipo}`;
                    const dado = valorJson[chave];
                    if (!dado) return <p key={iIdx} className="text-[11px] text-muted-foreground italic">Sem resposta para {item.titulo || item.tipo}</p>;
                    return (
                      <div key={iIdx} className="space-y-1">
                        {item.titulo && <p className="text-[10px] text-purple-800 font-medium">{item.titulo}</p>}
                        {(item.tipo === "texto" || item.tipo === "descricao") && dado.valor_texto && (
                          <div className="bg-card border border-border rounded p-2"><p className="text-xs">{dado.valor_texto}</p></div>
                        )}
                        {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && dado.evidencia_url && (
                          <EvidenciaPreview anexoId={dado.evidencia_anexo_id ?? null} url={dado.evidencia_url} mimeType={dado.evidencia_mime_type ?? null} disabled />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-3 py-2 space-y-2">
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => { setAvaliacaoPlanos(prev => ({ ...prev, [ap.id]: "conforme" })); setExpandirR2(prev => ({ ...prev, [ap.id]: false })); }}
                      className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${avaliacao === "conforme" ? "bg-emerald-100 border-emerald-500 text-emerald-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      Conforme
                    </button>
                    <button type="button"
                      onClick={() => { setAvaliacaoPlanos(prev => ({ ...prev, [ap.id]: "nao_conforme" })); setExpandirR2(prev => ({ ...prev, [ap.id]: true })); }}
                      className={`flex-1 text-xs px-2 py-2 rounded border font-medium transition-colors ${avaliacao === "nao_conforme" ? "bg-red-100 border-red-400 text-red-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      Não Conforme — R{idx + 2}
                    </button>
                  </div>
                  {expandR2 && (
                    <div className="border border-purple-300 dark:border-purple-800 rounded-lg overflow-hidden mt-1">
                      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                        <span className="text-[11px] font-semibold text-purple-800">Novo plano do auditor — R{idx + 2}</span>
                      </div>
                      <div className="p-3 space-y-2.5">
                        <div>
                          <Label className="text-[11px]">Instrução geral (opcional)</Label>
                          <Textarea value={plR2.instrucao} onChange={e => updateR2({ instrucao: e.target.value })} rows={2} className="text-xs mt-1 min-h-[44px]" placeholder="O que o aprovador deve corrigir..." />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[11px]">O que quero de volta (marque ao menos 1)</Label>
                          {ITENS_AUDIT.map((cfg: any) => {
                            const ativo = plR2.itens.find((i: any) => i.tipo === cfg.tipo);
                            return (
                              <div key={cfg.tipo} className={`border rounded-lg overflow-hidden ${ativo ? "border-purple-400" : "border-border"}`}>
                                <button type="button"
                                  onClick={() => { const existe = plR2.itens.find((i: any) => i.tipo === cfg.tipo); updateR2({ itens: existe ? plR2.itens.filter((i: any) => i.tipo !== cfg.tipo) : [...plR2.itens, { tipo: cfg.tipo, titulo: "", obrigatorio: true }] }); }}
                                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-left ${ativo ? "bg-purple-50 dark:bg-purple-950/20" : "hover:bg-muted/50"}`}>
                                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${ativo ? "bg-purple-600 border-purple-600" : "border-border"}`}>
                                    {ativo && <span className="text-white text-[10px] font-bold">v</span>}
                                  </div>
                                  <span className="text-xs font-medium">{cfg.label}</span>
                                </button>
                                {ativo && (
                                  <div className="px-3 pb-2 pt-1 border-t border-border bg-muted/10">
                                    <Input value={(ativo as any).titulo}
                                      onChange={e => { const t = e.target.value; updateR2({ itens: plR2.itens.map((i: any) => i.tipo === cfg.tipo ? { ...i, titulo: t } : i) }); }}
                                      placeholder={`Instrução para ${cfg.tipo}...`} className="h-7 text-xs" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div>
                          <Label className="text-[11px]">Prazo</Label>
                          <Input type="datetime-local" value={plR2.prazo} onChange={e => updateR2({ prazo: e.target.value })} className="h-8 text-xs mt-1" />
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => { setExpandirR2(prev => ({ ...prev, [ap.id]: false })); setAvaliacaoPlanos(prev => { const n = { ...prev }; delete n[ap.id]; return n; }); }}>
                            Cancelar
                          </Button>
                          <Button type="button" size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={flow.isSaving || plR2.itens.length === 0}
                            onClick={async () => {
                              await flow.criarPlanoAuditor.mutateAsync({ perguntaId: ap.field_id, perguntaLabel: field?.label ?? ap.field_id, instrucao: plR2.instrucao, itensPlano: plR2.itens, prazoIso: plR2.prazo ? new Date(plR2.prazo).toISOString() : new Date(Date.now() + 86400000).toISOString() });
                              setExpandirR2(prev => ({ ...prev, [ap.id]: false }));
                              onClose();
                            }}>
                            {flow.isSaving ? "Enviando..." : `Registrar R${idx + 2} e enviar`}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-2 sticky bottom-0 bg-background pb-2">
        <Button type="button" size="default" variant="outline" disabled={flow.isSaving}
          onClick={() => { setPerguntasSelecionadas(new Set()); setPlanosAuditorModal({}); setShowPlanoModal(true); }}
          className="border-amber-300 text-amber-700 hover:bg-amber-50 h-11">
          <ClipboardList className="w-4 h-4 mr-1" /> Criar plano de acao
        </Button>
        <div className="flex-1" />
        <Button type="button" size="default" onClick={aprovar} disabled={flow.isSaving || !todosConformeAuditor}
          className="bg-blue-600 hover:bg-blue-700 text-white h-11">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar Auditoria
        </Button>
      </div>

    </div>
  );
}
