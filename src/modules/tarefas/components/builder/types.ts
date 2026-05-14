export interface CheckItemForm {
  id?: string;
  tempId: string;
  pergunta: string;
  ordem: number;
  tipo_resposta: "conforme_nao_conforme" | "sim_nao" | "texto" | "numero";
  exige_foto: boolean;
  exige_observacao: boolean;
  gera_contingencia_se_reprovado: boolean;
  peso: number;
  nota_maxima: number;
  penalidade_reprovacao: number;
}

export const defaultCheckItem = (ordem: number): CheckItemForm => ({
  tempId: crypto.randomUUID(),
  pergunta: "",
  ordem,
  tipo_resposta: "conforme_nao_conforme",
  exige_foto: false,
  exige_observacao: false,
  gera_contingencia_se_reprovado: false,
  peso: 1,
  nota_maxima: 100,
  penalidade_reprovacao: 100,
});

export type WizardStepId =
  | "tipo"
  | "geral"
  | "campos"
  | "checklist_aprovador"
  | "checklist_validador"
  | "fluxo"
  | "resumo";

export interface WizardStepDef {
  id: WizardStepId;
  label: string;
  short: string;
  /** Quando true, só aparece se a condição correspondente for atendida no wizard. */
  conditional?: boolean;
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: "tipo", label: "Tipo / Modelo", short: "Tipo" },
  { id: "geral", label: "Informações gerais", short: "Geral" },
  { id: "campos", label: "Campos dinâmicos", short: "Campos" },
  { id: "checklist_aprovador", label: "Checklist Aprovador", short: "Aprovador", conditional: true },
  { id: "checklist_validador", label: "Checklist Validador", short: "Validador", conditional: true },
  { id: "fluxo", label: "Fluxo operacional", short: "Fluxo" },
  { id: "resumo", label: "Resumo / Publicação", short: "Resumo" },
];

// ─────────────────────────────────────────────────────────────────────
// Checklist Aprovador (replicado a partir das perguntas operacionais)
// Persistido em ada_config_snapshot.checklists.aprovador (sem migration).
// ─────────────────────────────────────────────────────────────────────
export type AprovadorTipoResposta = "conforme_nao_conforme" | "sim_nao" | "nota";

export interface AprovadorCheckItemForm {
  tempId: string;
  field_id: string;            // referência ao field operacional original
  field_label?: string;        // cache do label para exibição
  pergunta_padrao: string;
  tipo_resposta: AprovadorTipoResposta;
  peso: number;
  exige_observacao: boolean;
  exige_evidencia: boolean;
  permite_devolucao: boolean;
  gera_plano_acao: boolean;
  permite_conclusao: boolean;
  permite_aumento_prazo: boolean;
}

export const defaultAprovadorCheckItem = (
  field_id: string,
  field_label: string,
): AprovadorCheckItemForm => ({
  tempId: crypto.randomUUID(),
  field_id,
  field_label,
  pergunta_padrao: `Aprovador confirma: ${field_label}?`,
  tipo_resposta: "conforme_nao_conforme",
  peso: 1,
  exige_observacao: false,
  exige_evidencia: false,
  permite_devolucao: true,
  gera_plano_acao: true,
  permite_conclusao: true,
  permite_aumento_prazo: true,
});

// ─────────────────────────────────────────────────────────────────────
// Checklist Validador (auditoria do processo)
// Persistido em ada_config_snapshot.checklists.validador.
// ─────────────────────────────────────────────────────────────────────
export type ValidadorCategoria =
  | "sla"
  | "atraso"
  | "devolucao"
  | "evidencia"
  | "plano_acao"
  | "conformidade_avaliador"
  | "conformidade_aprovador"
  | "manual";

export interface ValidadorCheckItemForm {
  tempId: string;
  pergunta: string;
  categoria: ValidadorCategoria;
  peso: number;
  tipo_resposta: AprovadorTipoResposta;
  exige_observacao: boolean;
  exige_evidencia: boolean;
}

export const VALIDADOR_DEFAULT_ITEMS: Array<Omit<ValidadorCheckItemForm, "tempId">> = [
  { categoria: "sla", pergunta: "SLA da tarefa foi cumprido?", peso: 2, tipo_resposta: "sim_nao", exige_observacao: false, exige_evidencia: false },
  { categoria: "atraso", pergunta: "Houve atraso na execução?", peso: 1, tipo_resposta: "sim_nao", exige_observacao: true, exige_evidencia: false },
  { categoria: "devolucao", pergunta: "As devoluções foram tratadas corretamente?", peso: 1, tipo_resposta: "sim_nao", exige_observacao: true, exige_evidencia: false },
  { categoria: "evidencia", pergunta: "Evidências obrigatórias foram anexadas?", peso: 2, tipo_resposta: "sim_nao", exige_observacao: false, exige_evidencia: false },
  { categoria: "plano_acao", pergunta: "Planos de ação foram encerrados no prazo?", peso: 2, tipo_resposta: "sim_nao", exige_observacao: true, exige_evidencia: false },
  { categoria: "conformidade_avaliador", pergunta: "Avaliador atuou conforme o fluxo?", peso: 1, tipo_resposta: "conforme_nao_conforme", exige_observacao: true, exige_evidencia: false },
  { categoria: "conformidade_aprovador", pergunta: "Aprovador atuou conforme o fluxo?", peso: 1, tipo_resposta: "conforme_nao_conforme", exige_observacao: true, exige_evidencia: false },
];

export const buildDefaultValidadorItems = (): ValidadorCheckItemForm[] =>
  VALIDADOR_DEFAULT_ITEMS.map(i => ({ ...i, tempId: crypto.randomUUID() }));

export const defaultValidadorManualItem = (): ValidadorCheckItemForm => ({
  tempId: crypto.randomUUID(),
  pergunta: "",
  categoria: "manual",
  peso: 1,
  tipo_resposta: "sim_nao",
  exige_observacao: false,
  exige_evidencia: false,
});
