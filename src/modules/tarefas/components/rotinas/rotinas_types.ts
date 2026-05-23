// src/modules/tarefas/components/rotinas/rotinas_types.ts
// Tipos exclusivos do novo módulo Rotinas.
// Perguntas do Aprovador/Auditor são FIXAS no template — sem pacote global.
// Respostas são calculadas automaticamente pelo sistema na execução.

export type RotinaCheckItemOrigem = "automatica_sistema" | "manual";

export type RotinaMetricaCalculo =
  | "executor_entregou_no_prazo"
  | "executor_teve_atraso_etapa"
  | "executor_obrigatorias_respondidas"
  | "executor_evidencias_anexadas"
  | "executor_teve_devolucao"
  | "plano_acao_foi_criado"
  | "plano_acao_sla_estourado"
  | "plano_acao_prazo_prorrogado"
  | "plano_acao_prazo_prorrogado_2x"
  | "aprovador_respondeu_no_sla"
  | "aprovador_reabriu_tarefa"
  | "aprovador_aprovou_com_pendencia"
  | "manual";

export interface RotinaCheckItem {
  tempId: string;
  pergunta: string;
  tipo: "sim_nao" | "conforme_nao_conforme" | "nota";
  peso: number;
  ativo: boolean;
  origem: RotinaCheckItemOrigem;
  metrica_calculo: RotinaMetricaCalculo;
  camada_alvo?: "executor" | "aprovador" | "plano_acao";
  permite_na: boolean;
  exige_justificativa_na: boolean;
}

export const METRICA_LABEL: Record<RotinaMetricaCalculo, string> = {
  executor_entregou_no_prazo: "Executor entregou dentro do prazo global",
  executor_teve_atraso_etapa: "Houve atraso em alguma etapa",
  executor_obrigatorias_respondidas: "Perguntas obrigatórias respondidas",
  executor_evidencias_anexadas: "Evidências obrigatórias anexadas",
  executor_teve_devolucao: "Execução foi devolvida/reaberta",
  plano_acao_foi_criado: "Foi criado plano de ação",
  plano_acao_sla_estourado: "Plano respondido fora do SLA",
  plano_acao_prazo_prorrogado: "Plano ficou acima do SLA padrao",
  plano_acao_prazo_prorrogado_2x: "Plano teve reincidencia R2+",
  aprovador_respondeu_no_sla: "Aprovador agiu dentro do SLA",
  aprovador_reabriu_tarefa: "Aprovador devolveu/reabriu a tarefa",
  aprovador_aprovou_com_pendencia: "Aprovador aprovou com pendência ativa",
  manual: "Avaliação manual",
};

export const TIPO_LABEL: Record<string, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export const ORIGEM_BADGE: Record<RotinaCheckItemOrigem, { label: string; cls: string }> = {
  automatica_sistema: {
    label: "AUTO",
    cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  },
  manual: {
    label: "MANUAL",
    cls: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
  },
};

export const defaultRotinaCheckItem = (): RotinaCheckItem => ({
  tempId: crypto.randomUUID(),
  pergunta: "",
  tipo: "sim_nao",
  peso: 1,
  ativo: true,
  origem: "manual",
  metrica_calculo: "manual",
  permite_na: true,
  exige_justificativa_na: true,
});

const mk = (p: Omit<RotinaCheckItem, "tempId">): RotinaCheckItem => ({
  ...p,
  tempId: crypto.randomUUID(),
});

export const PERGUNTAS_PADRAO_APROVADOR: RotinaCheckItem[] = [
  mk({ pergunta: "Executor entregou a tarefa dentro do prazo global?", tipo: "sim_nao", peso: 25, ativo: true, origem: "automatica_sistema", metrica_calculo: "executor_entregou_no_prazo", camada_alvo: "executor", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Houve atraso em alguma etapa da execução?", tipo: "sim_nao", peso: 20, ativo: true, origem: "automatica_sistema", metrica_calculo: "executor_teve_atraso_etapa", camada_alvo: "executor", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "As evidências obrigatórias foram anexadas corretamente?", tipo: "sim_nao", peso: 20, ativo: true, origem: "automatica_sistema", metrica_calculo: "executor_evidencias_anexadas", camada_alvo: "executor", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "A execução precisou ser devolvida ou reaberta?", tipo: "sim_nao", peso: 15, ativo: true, origem: "automatica_sistema", metrica_calculo: "executor_teve_devolucao", camada_alvo: "executor", permite_na: true, exige_justificativa_na: true }),
];

export const PERGUNTAS_PADRAO_AUDITOR: RotinaCheckItem[] = [
  mk({ pergunta: "Aprovador enviou para auditoria dentro do SLA?", tipo: "sim_nao", peso: 20, ativo: true, origem: "automatica_sistema", metrica_calculo: "aprovador_respondeu_no_sla", camada_alvo: "aprovador", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Aprovador aprovou com alerta automático pendente?", tipo: "sim_nao", peso: 15, ativo: true, origem: "automatica_sistema", metrica_calculo: "aprovador_aprovou_com_pendencia", camada_alvo: "aprovador", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Aprovador devolveu/reabriu a tarefa?", tipo: "sim_nao", peso: 10, ativo: true, origem: "automatica_sistema", metrica_calculo: "aprovador_reabriu_tarefa", camada_alvo: "aprovador", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Aprovador respondeu plano do auditor dentro do SLA?", tipo: "sim_nao", peso: 10, ativo: true, origem: "automatica_sistema", metrica_calculo: "plano_acao_sla_estourado", camada_alvo: "plano_acao", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Plano para o aprovador ficou acima do SLA padrao?", tipo: "sim_nao", peso: 10, ativo: true, origem: "automatica_sistema", metrica_calculo: "plano_acao_prazo_prorrogado", camada_alvo: "plano_acao", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Aprovador teve reincidencia de plano do auditor?", tipo: "sim_nao", peso: 10, ativo: true, origem: "automatica_sistema", metrica_calculo: "plano_acao_prazo_prorrogado_2x", camada_alvo: "plano_acao", permite_na: true, exige_justificativa_na: true }),
  mk({ pergunta: "Justificativa do aprovador é plausível?", tipo: "conforme_nao_conforme", peso: 25, ativo: true, origem: "manual", metrica_calculo: "manual", camada_alvo: "aprovador", permite_na: false, exige_justificativa_na: false }),
];
