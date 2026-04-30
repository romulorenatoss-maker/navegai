import { supabase } from "@/integrations/supabase/client";

// =====================================================
// MÓDULO PROPOSTAS — contexto da empresa + perguntas padrão
// =====================================================

export type PropostasCategoria = "infraestrutura" | "dados" | "seguranca" | "telefonia";

export interface PropostasEmpresaContexto {
  id: string;
  nome_empresa: string | null;
  descricao_operacional: string | null;
  o_que_vendemos: string[];
  o_que_nao_vendemos: string[];
  tipo_ambiente: string[];
  regras_tecnicas: string[];
  ativo: boolean;
}

export interface PropostasPerguntaProduto {
  id: string;
  categoria: PropostasCategoria | string;
  pergunta: string;
  ordem: number;
  ativo: boolean;
  gera_contexto?: boolean;
}

export interface PropostasPerguntaProdutoLink {
  id: string;
  pergunta_id: string;
  produto_id: string;
  ordem: number;
}

// ---------- CONTEXTO ----------
export async function obterContextoEmpresa(): Promise<PropostasEmpresaContexto | null> {
  const { data, error } = await supabase
    .from("propostas_empresa_contexto" as never)
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PropostasEmpresaContexto | null;
}

export async function salvarContextoEmpresa(
  patch: Partial<PropostasEmpresaContexto>,
): Promise<PropostasEmpresaContexto> {
  const atual = await obterContextoEmpresa();
  if (atual) {
    const { data, error } = await supabase
      .from("propostas_empresa_contexto" as never)
      .update(patch as never)
      .eq("id", atual.id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as PropostasEmpresaContexto;
  }
  const { data, error } = await supabase
    .from("propostas_empresa_contexto" as never)
    .insert({ singleton: true, ...patch } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasEmpresaContexto;
}

// ---------- PERGUNTAS PADRÃO ----------
export async function listarPerguntasProduto(): Promise<PropostasPerguntaProduto[]> {
  const { data, error } = await supabase
    .from("propostas_perguntas_produtos" as never)
    .select("*")
    .order("categoria")
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as unknown as PropostasPerguntaProduto[];
}

export async function criarPerguntaProduto(p: Partial<PropostasPerguntaProduto>) {
  const { data, error } = await supabase
    .from("propostas_perguntas_produtos" as never)
    .insert(p as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasPerguntaProduto;
}

export async function atualizarPerguntaProduto(id: string, p: Partial<PropostasPerguntaProduto>) {
  const { error } = await supabase
    .from("propostas_perguntas_produtos" as never)
    .update(p as never)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirPerguntaProduto(id: string) {
  const { error } = await supabase
    .from("propostas_perguntas_produtos" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- VÍNCULO PERGUNTA <-> PRODUTO ----------
export async function listarLinksPerguntaProduto(): Promise<PropostasPerguntaProdutoLink[]> {
  const { data, error } = await supabase
    .from("propostas_pergunta_produto_link" as never)
    .select("*")
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as unknown as PropostasPerguntaProdutoLink[];
}

export async function vincularProdutoPergunta(pergunta_id: string, produto_id: string, ordem = 0) {
  const { data, error } = await supabase
    .from("propostas_pergunta_produto_link" as never)
    .insert({ pergunta_id, produto_id, ordem } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasPerguntaProdutoLink;
}

export async function desvincularProdutoPergunta(pergunta_id: string, produto_id: string) {
  const { error } = await supabase
    .from("propostas_pergunta_produto_link" as never)
    .delete()
    .eq("pergunta_id", pergunta_id)
    .eq("produto_id", produto_id);
  if (error) throw error;
}

export async function categoriaEmUso(codigo: string): Promise<{ total_perguntas: number; total_produtos: number }> {
  const { data, error } = await supabase.rpc("propostas_categoria_em_uso" as never, { _codigo: codigo } as never);
  if (error) throw error;
  const arr = (data ?? []) as Array<{ total_perguntas: number; total_produtos: number }>;
  const row = arr[0];
  return { total_perguntas: Number(row?.total_perguntas ?? 0), total_produtos: Number(row?.total_produtos ?? 0) };
}
