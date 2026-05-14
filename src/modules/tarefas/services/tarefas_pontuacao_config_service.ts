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
}

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
