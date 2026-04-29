import { supabase } from "@/integrations/supabase/client";

// =====================================================
// MÓDULO PROPOSTAS — service isolado
// Prefixo obrigatório: propostas_
// NÃO altera nenhum outro módulo.
// =====================================================

export type PropostasTipoCalculo = "quantidade" | "gb_total" | "gb_por_unidade";
export type PropostasStatus = "rascunho" | "aprovado" | "cancelado";
export type PropostasTipoTemplate = "proposta" | "contrato";

export interface PropostasProduto {
  id: string;
  nome: string;
  descricao_padrao: string | null;
  valor_minimo: number;
  tipo_calculo: PropostasTipoCalculo;
  unidade: string;
  regra_json: Record<string, unknown>;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropostasTemplate {
  id: string;
  nome: string;
  tipo: PropostasTipoTemplate;
  conteudo_html: string;
  campos_detectados: unknown[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// ---------- PRODUTOS ----------
export async function listarProdutos(): Promise<PropostasProduto[]> {
  const { data, error } = await supabase
    .from("propostas_produtos" as never)
    .select("*")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as unknown as PropostasProduto[];
}

export async function criarProduto(payload: Partial<PropostasProduto>) {
  const { data, error } = await supabase
    .from("propostas_produtos" as never)
    .insert(payload as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasProduto;
}

export async function atualizarProduto(id: string, payload: Partial<PropostasProduto>) {
  const { data, error } = await supabase
    .from("propostas_produtos" as never)
    .update(payload as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasProduto;
}

export async function excluirProduto(id: string) {
  const { error } = await supabase
    .from("propostas_produtos" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- TEMPLATES ----------
export async function listarTemplates(): Promise<PropostasTemplate[]> {
  const { data, error } = await supabase
    .from("propostas_templates" as never)
    .select("*")
    .order("nome");
  if (error) throw error;
  return (data ?? []) as unknown as PropostasTemplate[];
}

export async function criarTemplate(payload: Partial<PropostasTemplate>) {
  const { data, error } = await supabase
    .from("propostas_templates" as never)
    .insert(payload as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasTemplate;
}

export async function atualizarTemplate(id: string, payload: Partial<PropostasTemplate>) {
  const { data, error } = await supabase
    .from("propostas_templates" as never)
    .update(payload as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasTemplate;
}

export async function excluirTemplate(id: string) {
  const { error } = await supabase
    .from("propostas_templates" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ---------- PROPOSTAS (lista — fase 2 expande) ----------
export async function listarPropostas() {
  const { data, error } = await supabase
    .from("propostas_propostas" as never)
    .select("*, clientes(id, nome)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
