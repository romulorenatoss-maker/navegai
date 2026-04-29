import { supabase } from "@/integrations/supabase/client";

// =====================================================
// MÓDULO PROPOSTAS — perguntas e categorias do setup
// Isolado: não toca em outros módulos.
// =====================================================

export type PropostasCobranca = "implantacao" | "mensal" | "informativo";
export type PropostasPerguntaTipo = "texto" | "numero" | "escolha" | "sim_nao";
export type PropostasTipoPergunta = "contexto" | "produto" | "input";
export type PropostasCategoriaProduto = "infraestrutura" | "dados" | "seguranca" | "telefonia" | "outros";

export interface PropostasCategoriaSetup {
  id: string;
  codigo: string;
  nome: string;
  ordem: number;
  cobranca_padrao: PropostasCobranca;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropostasPerguntaSetup {
  id: string;
  categoria_id: string;
  ordem: number;
  pergunta: string;
  tipo: PropostasPerguntaTipo;
  opcoes: string[] | null;
  campo_token: string | null;
  obrigatoria: boolean;
  ativo: boolean;
  // Fase 1 — fluxo simples
  tipo_pergunta?: PropostasTipoPergunta | null;
  categoria_produto?: PropostasCategoriaProduto | null;
  gera_contexto?: boolean | null;
  created_at: string;
  updated_at: string;
}

// ---------- CATEGORIAS ----------
export async function listarCategorias(apenasAtivas = false): Promise<PropostasCategoriaSetup[]> {
  let q = supabase.from("propostas_categorias_setup" as never).select("*").order("ordem");
  if (apenasAtivas) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PropostasCategoriaSetup[];
}

export async function criarCategoria(p: Partial<PropostasCategoriaSetup>) {
  const { data, error } = await supabase
    .from("propostas_categorias_setup" as never)
    .insert(p as never).select().single();
  if (error) throw error;
  return data as unknown as PropostasCategoriaSetup;
}

export async function atualizarCategoria(id: string, p: Partial<PropostasCategoriaSetup>) {
  const { error } = await supabase
    .from("propostas_categorias_setup" as never)
    .update(p as never).eq("id", id);
  if (error) throw error;
}

export async function excluirCategoria(id: string) {
  const { error } = await supabase
    .from("propostas_categorias_setup" as never).delete().eq("id", id);
  if (error) throw error;
}

// ---------- PERGUNTAS ----------
export async function listarPerguntas(apenasAtivas = false): Promise<PropostasPerguntaSetup[]> {
  let q = supabase.from("propostas_perguntas_setup" as never).select("*").order("ordem");
  if (apenasAtivas) q = q.eq("ativo", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as PropostasPerguntaSetup[];
}

export async function criarPergunta(p: Partial<PropostasPerguntaSetup>) {
  const { data, error } = await supabase
    .from("propostas_perguntas_setup" as never)
    .insert(p as never).select().single();
  if (error) throw error;
  return data as unknown as PropostasPerguntaSetup;
}

export async function atualizarPergunta(id: string, p: Partial<PropostasPerguntaSetup>) {
  const { error } = await supabase
    .from("propostas_perguntas_setup" as never)
    .update(p as never).eq("id", id);
  if (error) throw error;
}

export async function excluirPergunta(id: string) {
  const { error } = await supabase
    .from("propostas_perguntas_setup" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function reordenarPerguntas(pares: Array<{ id: string; ordem: number }>) {
  for (const p of pares) {
    await supabase.from("propostas_perguntas_setup" as never).update({ ordem: p.ordem } as never).eq("id", p.id);
  }
}

// ---------- AGRUPAMENTO POR COBRANÇA ----------
export interface ItemAgrupado {
  cobranca: PropostasCobranca;
  categoria?: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  valor_total: number;
}

export function agruparPorCobranca(itens: ItemAgrupado[]) {
  const grupos: Record<PropostasCobranca, ItemAgrupado[]> = {
    implantacao: [], mensal: [], informativo: [],
  };
  for (const it of itens) grupos[it.cobranca]?.push(it);
  return grupos;
}
