/**
 * Serviço de configuração global de Pontuação/SLA das Tarefas.
 * Singleton em public.tarefas_pontuacao_config.
 *
 * Regra:
 *   - Configuração global = padrão usado na criação de novas tarefas.
 *   - Cada tarefa criada salva seu próprio snapshot editável.
 *   - Editar valores na tarefa NÃO altera o padrão global.
 *
 * Fase A: adicionados blocos por camada (executor, aprovador, plano_acao, validador).
 * Campos legados continuam preservados e em uso pelo trigger atual.
 */
import { supabase } from "@/integrations/supabase/client";

export interface CamadaSlaConfig {
  nota_max: number;
  nota_min: number;
  sla_horas: number;
  penalidade_atraso: number;
  penalidade_nao_resposta: number;
  penalidade_nao_conformidade: number;
  permite_ponderacao: boolean;
  exige_justificativa_ponderacao: boolean;
  gera_plano_acao_auto: boolean;
  permite_reabertura: boolean;
}

export interface TarefasPontuacaoConfig {
  id?: string;
  // Legado (mantido)
  penalidade_fora_prazo: number;
  penalidade_contingencia: number;
  penalidade_sla_contingencia: number;
  nota_minima: number;
  nota_maxima: number;
  penalidade_reprovacao: number;
  pontuacao_automatica_padrao: boolean;
  descricao: string | null;
  updated_at?: string;
  updated_by?: string | null;
  // Novo: blocos por camada
  sla_executor: CamadaSlaConfig;
  sla_aprovador: CamadaSlaConfig;
  sla_plano_acao: CamadaSlaConfig;
  sla_validador: CamadaSlaConfig;
  // Pacote padrão de perguntas do Aprovador (carregado em novas rotinas).
  aprovador_pacote_padrao: AprovadorPerguntaPadrao[];
}

/**
 * Métricas calculáveis automaticamente na execução/encerramento.
 * O engine de cálculo entra em segunda etapa; por ora a UI permite override manual.
 */
export type AprovadorMetricaCalculo =
  | "prazo_global"
  | "atraso_etapa"
  | "obrigatorias_respondidas"
  | "evidencias_anexadas"
  | "respostas_nao_conformes"
  | "devolucao"
  | "plano_acao_aberto"
  | "plano_acao_sla"
  | "plano_acao_prorrogacao"
  | "plano_acao_prorrogacao_multipla"
  | "manual";

export type AprovadorTipoPadrao = "sim_nao" | "conforme_nao_conforme" | "nota";

export interface AprovadorPerguntaPadrao {
  id: string;                          // estável, usado como config_global_origem_id
  ordem: number;
  pergunta: string;
  tipo: AprovadorTipoPadrao;
  peso: number;
  ativo: boolean;
  metrica_calculo: AprovadorMetricaCalculo;
  // Regras herdáveis pelo snapshot da rotina (mesmo shape de AprovadorCheckItemForm)
  exige_observacao?: boolean;
  exige_evidencia?: boolean;
  permite_devolucao?: boolean;
  gera_plano_acao?: boolean;
  permite_conclusao?: boolean;
  permite_aumento_prazo?: boolean;
  permite_ponderacao_auditor?: boolean;
  exige_justificativa_ponderacao?: boolean;
  penalidade_reprovacao?: number;
}

export const APROVADOR_PACOTE_PADRAO_DEFAULT: AprovadorPerguntaPadrao[] = [
  { id: "apr-prazo-global", ordem: 1, pergunta: "Executor entregou a tarefa dentro do prazo global?", tipo: "sim_nao", peso: 15, ativo: true, metrica_calculo: "prazo_global", exige_observacao: false, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: false },
  { id: "apr-atraso-etapa", ordem: 2, pergunta: "Houve atraso em alguma etapa/pergunta da execução?", tipo: "sim_nao", peso: 10, ativo: true, metrica_calculo: "atraso_etapa", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-obrigatorias", ordem: 3, pergunta: "Todas as perguntas obrigatórias foram respondidas?", tipo: "sim_nao", peso: 10, ativo: true, metrica_calculo: "obrigatorias_respondidas", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true, gera_plano_acao: true },
  { id: "apr-evidencias", ordem: 4, pergunta: "As evidências obrigatórias foram anexadas corretamente?", tipo: "conforme_nao_conforme", peso: 10, ativo: true, metrica_calculo: "evidencias_anexadas", exige_evidencia: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-nao-conforme", ordem: 5, pergunta: "Houve resposta marcada como não conforme?", tipo: "sim_nao", peso: 15, ativo: true, metrica_calculo: "respostas_nao_conformes", permite_devolucao: true, gera_plano_acao: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-devolucao", ordem: 6, pergunta: "A execução precisou ser devolvida/reaberta?", tipo: "sim_nao", peso: 10, ativo: true, metrica_calculo: "devolucao", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-pa-aberto", ordem: 7, pergunta: "Foi necessário abrir plano de ação?", tipo: "sim_nao", peso: 10, ativo: true, metrica_calculo: "plano_acao_aberto", gera_plano_acao: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-pa-sla", ordem: 8, pergunta: "O plano de ação foi concluído dentro do SLA?", tipo: "sim_nao", peso: 10, ativo: true, metrica_calculo: "plano_acao_sla", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-pa-prazo", ordem: 9, pergunta: "O plano de ação precisou de aumento de prazo?", tipo: "sim_nao", peso: 5, ativo: true, metrica_calculo: "plano_acao_prorrogacao", permite_aumento_prazo: true, permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
  { id: "apr-pa-prorr-mult", ordem: 10, pergunta: "O plano de ação teve mais de uma prorrogação?", tipo: "sim_nao", peso: 5, ativo: true, metrica_calculo: "plano_acao_prorrogacao_multipla", permite_ponderacao_auditor: true, exige_justificativa_ponderacao: true },
];

const camadaDefault = (over: Partial<CamadaSlaConfig> = {}): CamadaSlaConfig => ({
  nota_max: 100,
  nota_min: 0,
  sla_horas: 24,
  penalidade_atraso: 20,
  penalidade_nao_resposta: 50,
  penalidade_nao_conformidade: 30,
  permite_ponderacao: true,
  exige_justificativa_ponderacao: true,
  gera_plano_acao_auto: true,
  permite_reabertura: true,
  ...over,
});

export const TAREFAS_PONTUACAO_DEFAULTS: TarefasPontuacaoConfig = {
  penalidade_fora_prazo: 20,
  penalidade_contingencia: 10,
  penalidade_sla_contingencia: 15,
  nota_minima: 0,
  nota_maxima: 100,
  penalidade_reprovacao: 100,
  pontuacao_automatica_padrao: true,
  descricao: null,
  sla_executor: camadaDefault({ sla_horas: 24 }),
  sla_aprovador: camadaDefault({ sla_horas: 24 }),
  sla_plano_acao: camadaDefault({ sla_horas: 48, penalidade_atraso: 15, penalidade_nao_resposta: 40, penalidade_nao_conformidade: 25, gera_plano_acao_auto: false }),
  sla_validador: camadaDefault({ sla_horas: 72, penalidade_atraso: 10, penalidade_nao_resposta: 30, penalidade_nao_conformidade: 20, gera_plano_acao_auto: false }),
  aprovador_pacote_padrao: APROVADOR_PACOTE_PADRAO_DEFAULT,
};

const mergeCamada = (raw: any, fallback: CamadaSlaConfig): CamadaSlaConfig => ({
  ...fallback,
  ...(raw && typeof raw === "object" ? raw : {}),
});

export async function getPontuacaoConfig(): Promise<TarefasPontuacaoConfig> {
  const { data, error } = await (supabase as any)
    .from("tarefas_pontuacao_config")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return TAREFAS_PONTUACAO_DEFAULTS;
  return {
    ...TAREFAS_PONTUACAO_DEFAULTS,
    ...data,
    sla_executor: mergeCamada(data.sla_executor, TAREFAS_PONTUACAO_DEFAULTS.sla_executor),
    sla_aprovador: mergeCamada(data.sla_aprovador, TAREFAS_PONTUACAO_DEFAULTS.sla_aprovador),
    sla_plano_acao: mergeCamada(data.sla_plano_acao, TAREFAS_PONTUACAO_DEFAULTS.sla_plano_acao),
    sla_validador: mergeCamada(data.sla_validador, TAREFAS_PONTUACAO_DEFAULTS.sla_validador),
    aprovador_pacote_padrao: Array.isArray(data.aprovador_pacote_padrao) && data.aprovador_pacote_padrao.length > 0
      ? data.aprovador_pacote_padrao
      : APROVADOR_PACOTE_PADRAO_DEFAULT,
  } as TarefasPontuacaoConfig;
}

export async function setPontuacaoConfig(
  patch: Partial<TarefasPontuacaoConfig>,
  updatedBy?: string | null,
): Promise<TarefasPontuacaoConfig> {
  const current = await getPontuacaoConfig();
  const merged = { ...current, ...patch, singleton: true, updated_by: updatedBy ?? null };
  const { data, error } = await (supabase as any)
    .from("tarefas_pontuacao_config")
    .upsert(merged, { onConflict: "singleton" })
    .select("*")
    .single();
  if (error) throw error;
  return data as TarefasPontuacaoConfig;
}
