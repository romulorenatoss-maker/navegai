import { supabase } from "@/integrations/supabase/client";

// =====================================================
// MÓDULO PROPOSTAS — service isolado
// Prefixo obrigatório: propostas_
// NÃO altera nenhum outro módulo.
// =====================================================

export type PropostasTipoCalculo = "quantidade" | "gb_total" | "gb_por_unidade";
export type PropostasStatus = "rascunho" | "aprovado" | "cancelado";
export type PropostasTipoTemplate = "proposta" | "contrato";
export type PropostasTipoProduto = "produto" | "servico";

export interface PropostasBloco {
  id: string;
  tipo: "fixo" | "variavel" | "tabela";
  conteudo?: string;
  campo?: string;
  schema?: string[];
  locked?: boolean;
  pergunta?: string;
}

export interface PropostasProduto {
  id: string;
  nome: string;
  descricao_padrao: string | null;
  valor_minimo: number;
  tipo_calculo: PropostasTipoCalculo;
  tipo: PropostasTipoProduto;
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
  estrutura_blocos: PropostasBloco[] | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

// ---------- IA SETUP (Fase 3) ----------
export interface PerguntaSetup {
  bloco_id: string;
  tipo: "variavel" | "tabela";
  campo?: string;
  pergunta: string;
  schema?: string[];
}

export async function analisarTemplateBlocos(html: string): Promise<{ blocos: PropostasBloco[]; perguntas: PerguntaSetup[] }> {
  const { data, error } = await supabase.functions.invoke("propostas-analisar-template-blocos", { body: { html } });
  if (error) throw error;
  return data as { blocos: PropostasBloco[]; perguntas: PerguntaSetup[] };
}

export async function gerarPropostaPorBlocos(blocos: PropostasBloco[], respostas: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke("propostas-gerar-proposta", { body: { blocos, respostas } });
  if (error) throw error;
  return (data as { html: string }).html;
}

// ---------- SETUP RESPOSTAS (cache) ----------
export async function salvarSetupRespostas(input: {
  template_id: string;
  cliente_id?: string | null;
  respostas: Record<string, unknown>;
  finalizado?: boolean;
  nome_sessao?: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado");
  const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", auth.user.id).single();
  if (!prof) throw new Error("Perfil não encontrado");
  const { error } = await supabase.from("propostas_setup_respostas" as never).insert({
    template_id: input.template_id,
    profile_id: (prof as { id: string }).id,
    cliente_id: input.cliente_id ?? null,
    respostas: input.respostas,
    finalizado: input.finalizado ?? false,
    nome_sessao: input.nome_sessao ?? null,
  } as never);
  if (error) throw error;
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

// ---------- PROPOSTAS ----------
export async function listarPropostas() {
  const { data, error } = await supabase
    .from("propostas_propostas" as never)
    .select("*, clientes(id, nome)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function obterProposta(id: string) {
  const { data, error } = await supabase
    .from("propostas_propostas" as never)
    .select("*, clientes(id, nome, cpf, cidade), propostas_itens(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as any;
}

export interface NovaPropostaInput {
  cliente_id: string;
  template_id?: string | null;
  conteudo_original: string;
  conteudo_editado: string;
  valor_total: number;
  validade?: string | null;
  itens: Array<{
    produto_id?: string | null;
    descricao: string;
    quantidade: number;
    unidade: string;
    valor_unitario: number;
    valor_total: number;
  }>;
}

export async function criarProposta(input: NovaPropostaInput) {
  // Pega profile do usuário corrente
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Não autenticado");
  const { data: prof } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", auth.user.id)
    .single();
  if (!prof) throw new Error("Perfil não encontrado");

  const { data: prop, error } = await supabase
    .from("propostas_propostas" as never)
    .insert({
      cliente_id: input.cliente_id,
      usuario_id: (prof as any).id,
      template_id: input.template_id ?? null,
      conteudo_original: input.conteudo_original,
      conteudo_editado: input.conteudo_editado,
      valor_total: input.valor_total,
      validade: input.validade ?? null,
      status: "rascunho",
    } as never)
    .select()
    .single();
  if (error) throw error;

  if (input.itens.length) {
    const propId = (prop as any).id;
    const itensPayload = input.itens.map((it, idx) => ({ ...it, proposta_id: propId, ordem: idx }));
    const { error: errItens } = await supabase
      .from("propostas_itens" as never)
      .insert(itensPayload as never);
    if (errItens) throw errItens;
  }

  await supabase.from("propostas_historico" as never).insert({
    proposta_id: (prop as any).id,
    conteudo: input.conteudo_editado,
    tipo: "gerado",
  } as never);

  return prop as any;
}

export async function atualizarProposta(id: string, payload: { conteudo_editado?: string; valor_total?: number; validade?: string | null; status?: "rascunho" | "aprovado" | "cancelado" }) {
  const { error } = await supabase
    .from("propostas_propostas" as never)
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;

  if (payload.conteudo_editado) {
    await supabase.from("propostas_historico" as never).insert({
      proposta_id: id,
      conteudo: payload.conteudo_editado,
      tipo: payload.status === "aprovado" ? "aprovado" : "editado",
    } as never);
  }
}

// ---------- CLIENTES (apenas leitura — fonte de verdade é a tabela existente) ----------
export interface ClienteLite { id: string; nome: string; cpf?: string | null; cidade?: string | null }

export async function buscarClientes(termo: string): Promise<ClienteLite[]> {
  let query = supabase.from("clientes").select("id, nome, cpf, cidade").order("nome").limit(20);
  if (termo.trim()) {
    query = query.ilike("nome", `%${termo}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ClienteLite[];
}

