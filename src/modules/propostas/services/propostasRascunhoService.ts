import { supabase } from "@/integrations/supabase/client";
import type { PropostasCobranca } from "./propostasPerguntasService";

export interface RascunhoMensagem { role: "user" | "assistant"; content: string }
export interface RascunhoItem {
  nome: string;
  quantidade: number;
  valor_unitario: number;
  cobranca: PropostasCobranca;
  categoria?: string;
}

export interface PropostasRascunhoConversa {
  id: string;
  user_id: string;
  cliente_id: string;
  cliente_nome: string;
  template_id: string | null;
  mensagens: RascunhoMensagem[];
  itens: RascunhoItem[];
  respostas: Record<string, unknown>;
  estado_proposta: Record<string, unknown>;
  finalizado: boolean;
  created_at: string;
  updated_at: string;
}

type RowJson = {
  id: string; user_id: string; cliente_id: string; cliente_nome: string;
  template_id: string | null; mensagens: unknown; itens: unknown;
  respostas: unknown; estado_proposta?: unknown;
  finalizado: boolean; created_at: string; updated_at: string;
};

function parse(row: RowJson): PropostasRascunhoConversa {
  return {
    ...row,
    mensagens: (row.mensagens as RascunhoMensagem[]) ?? [],
    itens: (row.itens as RascunhoItem[]) ?? [],
    respostas: (row.respostas as Record<string, unknown>) ?? {},
    estado_proposta: (row.estado_proposta as Record<string, unknown>) ?? {},
  };
}

export async function listarMeusRascunhos(): Promise<PropostasRascunhoConversa[]> {
  const { data, error } = await supabase
    .from("propostas_rascunhos_conversa")
    .select("*")
    .eq("finalizado", false)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => parse(r as RowJson));
}

export async function buscarRascunhoPorCliente(clienteId: string): Promise<PropostasRascunhoConversa | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("propostas_rascunhos_conversa")
    .select("*")
    .eq("user_id", user.id)
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (error) throw error;
  return data ? parse(data as RowJson) : null;
}

export async function salvarRascunho(input: {
  cliente_id: string;
  cliente_nome: string;
  template_id: string | null;
  mensagens: RascunhoMensagem[];
  itens: RascunhoItem[];
  respostas: Record<string, unknown>;
  finalizado?: boolean;
}): Promise<PropostasRascunhoConversa> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sem sessão de usuário");

  const payload = {
    user_id: user.id,
    cliente_id: input.cliente_id,
    cliente_nome: input.cliente_nome,
    template_id: input.template_id,
    mensagens: input.mensagens as unknown as never,
    itens: input.itens as unknown as never,
    respostas: input.respostas as unknown as never,
    finalizado: input.finalizado ?? false,
  };

  const { data, error } = await supabase
    .from("propostas_rascunhos_conversa")
    .upsert([payload], { onConflict: "user_id,cliente_id" })
    .select("*")
    .single();
  if (error) throw error;
  return parse(data as RowJson);
}

export async function excluirRascunho(id: string): Promise<void> {
  const { error } = await supabase
    .from("propostas_rascunhos_conversa")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
