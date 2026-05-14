/**
 * Normalizers para itens dos checklists Aprovador/Validador.
 * Garantem retrocompatibilidade com snapshots antigos (formato simplificado),
 * mapeando para o superset alinhado à engine de Campos Dinâmicos.
 */
import type {
  AprovadorCheckItemForm,
  AprovadorOrigem,
  AprovadorTipoResposta,
  CamadaTipoResposta,
  ValidadorCheckItemForm,
} from "./types";
import { defaultAprovadorCheckItem } from "./types";
import type { FieldForm } from "@/modules/tarefas/types/tarefas_types";

const ensureId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

const mapTipoSimplesParaSuperset = (t: AprovadorTipoResposta | undefined): CamadaTipoResposta => {
  switch (t) {
    case "sim_nao": return "sim_nao";
    case "nota": return "nota";
    case "conforme_nao_conforme":
    default: return "conforme_nao_conforme";
  }
};

const normalizeKeyText = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("pt-BR");

const checklistUniqueKey = (item: AprovadorCheckItemForm) => {
  if (isAprovadorReplicada(item)) {
    // Replicadas são identificadas EXCLUSIVAMENTE pelo field_id (id estável do Avaliado).
    // Sem fallback para label/pergunta_origem_id — evita falsos pares e órfãos persistidos.
    return `rep:${item.field_id}`;
  }
  if (item.config_global_origem_id) {
    return `pkg:${item.config_global_origem_id}`;
  }
  return `manual:${item.tempId}`;
};

export const isAprovadorReplicada = (item: Pick<AprovadorCheckItemForm, "origem_pergunta" | "field_id" | "pergunta_origem_id">) =>
  item.origem_pergunta === "replicada_avaliado" || Boolean(item.field_id || item.pergunta_origem_id);

export interface CamadaSlaDefaults {
  sla_horas?: number;
  penalidade_atraso?: number;
  penalidade_nao_resposta?: number;
  penalidade_nao_conformidade?: number;
  permite_ponderacao?: boolean;
  exige_justificativa_ponderacao?: boolean;
}

export function normalizeAprovadorItem(
  raw: any,
  defaults: CamadaSlaDefaults = {},
): AprovadorCheckItemForm {
  const tipo_resposta: AprovadorTipoResposta =
    raw?.tipo_resposta ?? "conforme_nao_conforme";
  const fieldReference = raw?.field_id ?? raw?.pergunta_origem_id ?? "";

  // Deduz origem para snapshots antigos:
  //   - respeita origem nova se presente.
  //   - field_id → replicada_avaliado.
  //   - config_global_origem_id começando com "val-man-" → replicada_padrao_manual
  //     (compat com snapshots salvos antes da introdução dessa origem).
  //   - caso contrário → manual.
  const origem_pergunta: AprovadorOrigem = (() => {
    if (raw?.origem_pergunta === "manual" && typeof raw?.config_global_origem_id === "string" && raw.config_global_origem_id.startsWith("val-man-")) {
      return "replicada_padrao_manual";
    }
    if (fieldReference) return "replicada_avaliado";
    if (raw?.origem_pergunta) return raw.origem_pergunta as AprovadorOrigem;
    return "manual";
  })();

  return {
    tempId: raw?.tempId ?? ensureId(),
    field_id: origem_pergunta === "replicada_avaliado" ? fieldReference : (raw?.field_id ?? ""),
    field_label: raw?.field_label,
    pergunta_padrao: raw?.pergunta_padrao ?? "",
    tipo_resposta,
    tipo: raw?.tipo ?? mapTipoSimplesParaSuperset(tipo_resposta),
    opcoes: Array.isArray(raw?.opcoes) ? raw.opcoes : undefined,
    regras_por_opcao: Array.isArray(raw?.regras_por_opcao) ? raw.regras_por_opcao : undefined,
    peso: Number(raw?.peso ?? 1),
    exige_observacao: Boolean(raw?.exige_observacao),
    exige_evidencia: Boolean(raw?.exige_evidencia),
    permite_devolucao: raw?.permite_devolucao ?? true,
    gera_plano_acao: raw?.gera_plano_acao ?? true,
    permite_conclusao: raw?.permite_conclusao ?? true,
    permite_aumento_prazo: raw?.permite_aumento_prazo ?? true,
    sla_horas: raw?.sla_horas ?? defaults.sla_horas,
    penalidade_atraso: raw?.penalidade_atraso ?? defaults.penalidade_atraso,
    penalidade_nao_resposta: raw?.penalidade_nao_resposta ?? defaults.penalidade_nao_resposta,
    penalidade_nao_conformidade:
      raw?.penalidade_nao_conformidade ?? defaults.penalidade_nao_conformidade,
    permite_ponderacao_auditor:
      raw?.permite_ponderacao_auditor ?? defaults.permite_ponderacao ?? true,
    exige_justificativa_ponderacao:
      raw?.exige_justificativa_ponderacao ?? defaults.exige_justificativa_ponderacao ?? true,
    permite_aumento_prazo_plano: raw?.permite_aumento_prazo_plano ?? false,
    instrucao_url: raw?.instrucao_url,
    instrucao_tipo: raw?.instrucao_tipo,
    origem_pergunta,
    pergunta_origem_id: origem_pergunta === "replicada_avaliado" ? fieldReference : raw?.pergunta_origem_id,
    config_global_origem_id: raw?.config_global_origem_id,
    metrica_calculo: raw?.metrica_calculo,
    ativo: raw?.ativo ?? true,
    editado_manual: raw?.editado_manual ?? false,
    editado_por: raw?.editado_por,
    editado_em: raw?.editado_em,
    config_original_snapshot: raw?.config_original_snapshot,
    config_atual_snapshot: raw?.config_atual_snapshot,
  };
}

export function normalizeValidadorItem(
  raw: any,
  defaults: CamadaSlaDefaults = {},
): ValidadorCheckItemForm {
  const tipo_resposta: AprovadorTipoResposta = raw?.tipo_resposta ?? "sim_nao";
  return {
    tempId: raw?.tempId ?? ensureId(),
    pergunta: raw?.pergunta ?? "",
    categoria: raw?.categoria ?? "manual",
    peso: Number(raw?.peso ?? 1),
    tipo_resposta,
    tipo: raw?.tipo ?? mapTipoSimplesParaSuperset(tipo_resposta),
    opcoes: Array.isArray(raw?.opcoes) ? raw.opcoes : undefined,
    regras_por_opcao: Array.isArray(raw?.regras_por_opcao) ? raw.regras_por_opcao : undefined,
    exige_observacao: Boolean(raw?.exige_observacao),
    exige_evidencia: Boolean(raw?.exige_evidencia),
    pode_ponderar_aprovador: raw?.pode_ponderar_aprovador ?? true,
    pode_ponderar_avaliado: raw?.pode_ponderar_avaliado ?? true,
    exige_justificativa_para_alterar:
      raw?.exige_justificativa_para_alterar ?? defaults.exige_justificativa_ponderacao ?? true,
    sla_horas: raw?.sla_horas ?? defaults.sla_horas,
    penalidade_atraso: raw?.penalidade_atraso ?? defaults.penalidade_atraso,
  };
}

export const normalizeAprovadorList = (raw: any[] | undefined, defaults?: CamadaSlaDefaults) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map(r => normalizeAprovadorItem(r, defaults))
    .filter(item => {
      // Descarta replicadas sem field_id — sempre órfã.
      if (item.origem_pergunta === "replicada_avaliado" && !item.field_id) return false;
      const key = checklistUniqueKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const syncAprovadorReplicadasFromFields = (
  rawItems: AprovadorCheckItemForm[],
  currentFields: FieldForm[],
  defaults?: CamadaSlaDefaults,
) => {
  const seenFields = new Set<string>();
  const uniqueFields = currentFields
    .filter(field => {
      if (!field.tempId || seenFields.has(field.tempId)) return false;
      seenFields.add(field.tempId);
      return true;
    })
    .sort((a, b) => a.ordem - b.ordem);

  const baseItems = normalizeAprovadorList(rawItems, defaults);
  const replicadasPrev = baseItems.filter(isAprovadorReplicada);
  const naoReplicadas = baseItems.filter(item => !isAprovadorReplicada(item));
  const replicadasByField = new Map(replicadasPrev.map(item => [item.field_id || item.pergunta_origem_id || "", item]));

  const replicadasNext = uniqueFields.map(field => {
    const label = field.label || "Pergunta sem nome";
    const pergunta = `Aprovador confirma: ${label}?`;
    const existing = replicadasByField.get(field.tempId);
    if (!existing) return defaultAprovadorCheckItem(field.tempId, label);
    return {
      ...existing,
      field_id: field.tempId,
      field_label: label,
      pergunta_padrao: pergunta,
      origem_pergunta: "replicada_avaliado" as const,
      pergunta_origem_id: field.tempId,
    };
  });

  const next = [...replicadasNext, ...naoReplicadas];
  const sameLength = next.length === rawItems.length;
  const sameContent = sameLength && next.every((item, idx) => {
    const prev = rawItems[idx];
    return prev &&
      prev.tempId === item.tempId &&
      prev.field_id === item.field_id &&
      prev.field_label === item.field_label &&
      prev.pergunta_padrao === item.pergunta_padrao &&
      prev.origem_pergunta === item.origem_pergunta &&
      prev.pergunta_origem_id === item.pergunta_origem_id;
  });

  return sameContent ? rawItems : next;
};

export const normalizeValidadorList = (raw: any[] | undefined, defaults?: CamadaSlaDefaults) =>
  Array.isArray(raw) ? raw.map(r => normalizeValidadorItem(r, defaults)) : [];
