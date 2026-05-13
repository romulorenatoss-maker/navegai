/**
 * Serviço de configuração global de "Avaliação do Avaliador" (AdA).
 * Singleton em public.tarefas_ada_config.
 *
 * Regra:
 *   - Configuração global = padrão usado na criação de novas tarefas/rotinas com AdA habilitado.
 *   - Cada tarefa/rotina criada salva seu próprio snapshot editável (PR B).
 *   - Editar valores na tarefa NÃO altera o padrão global.
 */
import { supabase } from "@/integrations/supabase/client";

export type AdaPerguntaTipo =
  | "texto"
  | "sim_nao"
  | "nota"
  | "escolha";

export interface AdaPerguntaPadrao {
  id: string;
  pergunta: string;
  tipo: AdaPerguntaTipo;
  obrigatorio: boolean;
  gera_pontuacao: boolean;
  pontos: number;
  gera_plano_acao: boolean;
  bloqueia_conclusao: boolean;
  ordem: number;
}

export type AdaAnexoTipo = "foto" | "video" | "documento" | "qualquer";
export type AdaPrioridade = "baixa" | "normal" | "alta" | "critica";

export interface TarefasAdaConfig {
  id?: string;
  perguntas_padrao: AdaPerguntaPadrao[];
  exige_anexo: boolean;
  anexo_tipo: AdaAnexoTipo;
  anexo_obrigatorio: boolean;
  anexo_quantidade_minima: number;
  anexo_instrucao: string | null;
  prazo_horas: number;
  penalidade_atraso: number;
  prioridade: AdaPrioridade;
  nota_minima: number;
  nota_maxima: number;
  descricao: string | null;
  updated_at?: string;
  updated_by?: string | null;
}

export const TAREFAS_ADA_DEFAULTS: TarefasAdaConfig = {
  perguntas_padrao: [],
  exige_anexo: false,
  anexo_tipo: "qualquer",
  anexo_obrigatorio: false,
  anexo_quantidade_minima: 0,
  anexo_instrucao: null,
  prazo_horas: 24,
  penalidade_atraso: 10,
  prioridade: "normal",
  nota_minima: 0,
  nota_maxima: 100,
  descricao: null,
};

export async function getAdaConfig(): Promise<TarefasAdaConfig> {
  const { data, error } = await (supabase as any)
    .from("tarefas_ada_config")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return TAREFAS_ADA_DEFAULTS;
  return {
    ...TAREFAS_ADA_DEFAULTS,
    ...data,
    perguntas_padrao: Array.isArray(data.perguntas_padrao) ? data.perguntas_padrao : [],
  } as TarefasAdaConfig;
}

export async function setAdaConfig(
  patch: Partial<TarefasAdaConfig>,
  updatedBy?: string | null,
): Promise<TarefasAdaConfig> {
  const current = await getAdaConfig();
  const merged = {
    ...current,
    ...patch,
    singleton: true,
    updated_by: updatedBy ?? null,
  };
  const { data, error } = await (supabase as any)
    .from("tarefas_ada_config")
    .upsert(merged, { onConflict: "singleton" })
    .select("*")
    .single();
  if (error) throw error;
  return data as TarefasAdaConfig;
}

export function newAdaPergunta(ordem = 0): AdaPerguntaPadrao {
  return {
    id: crypto.randomUUID(),
    pergunta: "",
    tipo: "sim_nao",
    obrigatorio: true,
    gera_pontuacao: false,
    pontos: 0,
    gera_plano_acao: false,
    bloqueia_conclusao: false,
    ordem,
  };
}
