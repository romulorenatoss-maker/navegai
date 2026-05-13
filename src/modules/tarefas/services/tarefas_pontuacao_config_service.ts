/**
 * Serviço de configuração global de Pontuação/Notas das Tarefas.
 * Singleton em public.tarefas_pontuacao_config.
 *
 * Regra:
 *   - Configuração global = padrão usado na criação de novas tarefas.
 *   - Cada tarefa criada salva seu próprio snapshot editável.
 *   - Editar valores na tarefa NÃO altera o padrão global.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TarefasPontuacaoConfig {
  id?: string;
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
}

export const TAREFAS_PONTUACAO_DEFAULTS: TarefasPontuacaoConfig = {
  penalidade_fora_prazo: 20,
  penalidade_contingencia: 10,
  penalidade_sla_contingencia: 15,
  nota_minima: 0,
  nota_maxima: 100,
  penalidade_reprovacao: 100,
  pontuacao_automatica_padrao: true,
  descricao: null,
};

export async function getPontuacaoConfig(): Promise<TarefasPontuacaoConfig> {
  const { data, error } = await (supabase as any)
    .from("tarefas_pontuacao_config")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return TAREFAS_PONTUACAO_DEFAULTS;
  return data as TarefasPontuacaoConfig;
}

export async function setPontuacaoConfig(
  patch: Partial<TarefasPontuacaoConfig>,
  updatedBy?: string | null,
): Promise<TarefasPontuacaoConfig> {
  // Garante linha singleton
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
