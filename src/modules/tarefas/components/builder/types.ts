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
  { id: "campos", label: "Avaliado (perguntas operacionais)", short: "Avaliado" },
  { id: "checklist_aprovador", label: "Checklist Aprovador", short: "Aprovador", conditional: true },
  { id: "checklist_validador", label: "Checklist Validador", short: "Validador", conditional: true },
  { id: "fluxo", label: "Fluxo operacional", short: "Fluxo" },
  { id: "resumo", label: "Resumo / Publicação", short: "Resumo" },
];

// ─────────────────────────────────────────────────────────────────────
// Checklist Aprovador (replicado a partir das perguntas operacionais)
// Persistido em ada_config_snapshot.checklists.aprovador (sem migration).
// ─────────────────────────────────────────────────────────────────────
// Mantido por compat — usado por itens antigos do checklist do aprovador.
export type AprovadorTipoResposta = "conforme_nao_conforme" | "sim_nao" | "nota";

// Superset alinhado à engine de Campos Dinâmicos.
export type CamadaTipoResposta =
  | "conforme_nao_conforme"
  | "sim_nao"
  | "excelente_bom_ruim"
  | "nota"
  | "texto"
  | "numero"
  | "data"
  | "hora"
  | "selecao"
  | "selecao_multipla"
  | "foto"
  | "arquivo";

export interface RegraPorOpcao {
  valor: string;
  exige_observacao?: boolean;
  exige_evidencia?: boolean;
  gera_plano_acao?: boolean;
  permite_devolucao?: boolean;
}

export type AprovadorOrigem =
  | "replicada_avaliado"
  | "automatica_configuracao"      // AUTO replicada do pacote padrão (cálculo automático)
  | "replicada_padrao_manual"      // MANUAL replicada do pacote padrão (julgamento humano)
  | "manual";                       // criada na rotina pelo construtor

export interface AprovadorCheckItemForm {
  tempId: string;
  field_id: string;            // referência ao field operacional original (vazio se não for replicada)
  field_label?: string;        // cache do label para exibição
  pergunta_padrao: string;
  /** Compat: tipo simplificado antigo. Novo código usa `tipo`. */
  tipo_resposta: AprovadorTipoResposta;
  /** Superset (novo). Quando ausente, derive de `tipo_resposta`. */
  tipo?: CamadaTipoResposta;
  opcoes?: string[];
  regras_por_opcao?: RegraPorOpcao[];
  peso: number;
  exige_observacao: boolean;
  exige_evidencia: boolean;
  permite_devolucao: boolean;
  gera_plano_acao: boolean;
  permite_conclusao: boolean;
  permite_aumento_prazo: boolean;
  // SLA / penalidades por item (opcionais, herdam config global se ausentes)
  sla_horas?: number;
  penalidade_atraso?: number;
  penalidade_nao_resposta?: number;
  penalidade_nao_conformidade?: number;
  // Ponderação pelo auditor
  permite_ponderacao_auditor?: boolean;
  exige_justificativa_ponderacao?: boolean;
  permite_aumento_prazo_plano?: boolean;
  // Anexo de instrução (mesmo shape de FieldForm)
  instrucao_url?: string;
  instrucao_tipo?: string;
  // ─── Metadados (origem/auditoria) ───────────────────────────────
  origem_pergunta?: AprovadorOrigem;
  /** Para replicada_avaliado: id (tempId) do field original. */
  pergunta_origem_id?: string;
  /** Para automatica_configuracao: id da pergunta padrão na config global. */
  config_global_origem_id?: string;
  /** Métrica calculável (apenas para automaticas). */
  metrica_calculo?: string;
  /** Camada que está sendo auditada (validador). */
  camada_alvo?: "aprovador" | "executor" | "plano_acao";
  /** Descrição curta da fonte real (tabela/coluna/evento). */
  fonte_dados?: string;
  /** Descrição humana da regra de cálculo. */
  regra_calculo?: string;
  /** True quando a fonte de cálculo ainda não está cabeada. */
  metrica_pendente?: boolean;
  ativo?: boolean;
  editado_manual?: boolean;
  editado_por?: string;
  editado_em?: string;
  /** Snapshot da config no momento da hidratação (referência). */
  config_original_snapshot?: any;
  /** Snapshot atual (após edições do construtor da rotina). */
  config_atual_snapshot?: any;
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
  origem_pergunta: "replicada_avaliado",
  pergunta_origem_id: field_id,
});

export const defaultAprovadorManualItem = (): AprovadorCheckItemForm => ({
  tempId: crypto.randomUUID(),
  field_id: "",
  pergunta_padrao: "",
  tipo_resposta: "sim_nao",
  peso: 1,
  exige_observacao: false,
  exige_evidencia: false,
  permite_devolucao: false,
  gera_plano_acao: false,
  permite_conclusao: false,
  permite_aumento_prazo: false,
  origem_pergunta: "manual",
});

/** Cria um item de checklist a partir de uma pergunta padrão da config global. */
export const buildAprovadorAutomatico = (p: {
  id: string;
  ordem: number;
  pergunta: string;
  tipo: "sim_nao" | "conforme_nao_conforme" | "nota";
  peso: number;
  metrica_calculo: string;
  exige_observacao?: boolean;
  exige_evidencia?: boolean;
  permite_devolucao?: boolean;
  gera_plano_acao?: boolean;
  permite_conclusao?: boolean;
  permite_aumento_prazo?: boolean;
  permite_ponderacao_auditor?: boolean;
  exige_justificativa_ponderacao?: boolean;
  // Novos metadados (Validador)
  origem_pergunta?: "automatica_sistema" | "manual_padrao_configuracao" | "automatica_configuracao";
  camada_alvo?: "aprovador" | "executor" | "plano_acao";
  fonte_dados?: string;
  regra_calculo?: string;
  metrica_pendente?: boolean;
  ativo?: boolean;
}): AprovadorCheckItemForm => {
  // Mapeia origem_pergunta da config (que pode ser "automatica_sistema" ou
  // "manual_padrao_configuracao") para o domínio do snapshot da rotina
  // (AprovadorOrigem: "automatica_configuracao" | "manual" | "replicada_avaliado").
  const origemSnapshot: AprovadorOrigem =
    p.origem_pergunta === "manual_padrao_configuracao" ? "replicada_padrao_manual" : "automatica_configuracao";
  return {
    tempId: crypto.randomUUID(),
    field_id: "",
    pergunta_padrao: p.pergunta,
    tipo_resposta: p.tipo,
    tipo: p.tipo,
    peso: p.peso,
    exige_observacao: !!p.exige_observacao,
    exige_evidencia: !!p.exige_evidencia,
    permite_devolucao: !!p.permite_devolucao,
    gera_plano_acao: !!p.gera_plano_acao,
    permite_conclusao: !!p.permite_conclusao,
    permite_aumento_prazo: !!p.permite_aumento_prazo,
    permite_ponderacao_auditor: p.permite_ponderacao_auditor ?? true,
    exige_justificativa_ponderacao: p.exige_justificativa_ponderacao ?? true,
    origem_pergunta: origemSnapshot,
    config_global_origem_id: p.id,
    metrica_calculo: p.metrica_calculo,
    camada_alvo: p.camada_alvo,
    fonte_dados: p.fonte_dados,
    regra_calculo: p.regra_calculo,
    metrica_pendente: p.metrica_pendente,
    ativo: p.ativo ?? true,
    config_original_snapshot: p,
  };
};

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
  tipo?: CamadaTipoResposta;
  opcoes?: string[];
  regras_por_opcao?: RegraPorOpcao[];
  exige_observacao: boolean;
  exige_evidencia: boolean;
  // Auditoria
  pode_ponderar_aprovador?: boolean;
  pode_ponderar_avaliado?: boolean;
  exige_justificativa_para_alterar?: boolean;
  // SLA/penalidades opcionais
  sla_horas?: number;
  penalidade_atraso?: number;
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
