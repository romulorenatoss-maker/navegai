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

  // Deduz origem para snapshots antigos:
  //   - se vier do snapshot novo, respeita.
  //   - se tem field_id → replicada_avaliado.
  //   - caso contrário → manual.
  const origem_pergunta =
    raw?.origem_pergunta
      ?? (raw?.field_id ? "replicada_avaliado" : "manual");

  return {
    tempId: raw?.tempId ?? ensureId(),
    field_id: raw?.field_id ?? "",
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
    pergunta_origem_id: raw?.pergunta_origem_id ?? (origem_pergunta === "replicada_avaliado" ? raw?.field_id : undefined),
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

export const normalizeAprovadorList = (raw: any[] | undefined, defaults?: CamadaSlaDefaults) =>
  Array.isArray(raw) ? raw.map(r => normalizeAprovadorItem(r, defaults)) : [];

export const normalizeValidadorList = (raw: any[] | undefined, defaults?: CamadaSlaDefaults) =>
  Array.isArray(raw) ? raw.map(r => normalizeValidadorItem(r, defaults)) : [];
