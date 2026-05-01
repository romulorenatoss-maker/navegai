import { supabase } from "@/integrations/supabase/client";

// =====================================================
// Single source of truth para responsáveis do cliente.
// Email/telefone vêm de `cliente_contatos` via FK (sem duplicar dados).
// Schema novo: contato_telefone_id + contato_email_id (separados).
// =====================================================

export interface ClienteResponsavel {
  id: string;
  cliente_id: string;
  contato_telefone_id: string | null;
  contato_email_id: string | null;
  nome: string;
  cargo: string | null;
  cpf: string | null;
  principal: boolean;
  observacoes: string | null;
  // Hidratados em runtime a partir de cliente_contatos:
  email?: string | null;
  telefone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContatoLite {
  id: string;
  cliente_id: string;
  tipo: string;     // 'email' | 'telefone' | 'celular' | 'fixo' | '0800' | ...
  valor: string;
  tem_whatsapp: boolean;
}

/** Lista responsáveis de um cliente, hidratando email/telefone via cliente_contatos. */
export async function listarResponsaveis(cliente_id: string): Promise<ClienteResponsavel[]> {
  const { data: resps, error } = await supabase
    .from("cliente_responsaveis" as never)
    .select("*")
    .eq("cliente_id", cliente_id)
    .order("principal", { ascending: false })
    .order("nome");
  if (error) throw error;

  const lista = (resps ?? []) as unknown as ClienteResponsavel[];
  if (lista.length === 0) return [];

  // Hidrata email/telefone a partir de cliente_contatos (1 query só)
  const ids = new Set<string>();
  lista.forEach(r => {
    if (r.contato_telefone_id) ids.add(r.contato_telefone_id);
    if (r.contato_email_id) ids.add(r.contato_email_id);
  });
  if (ids.size === 0) return lista;

  const { data: contatos } = await supabase
    .from("cliente_contatos")
    .select("id, tipo, valor")
    .in("id", Array.from(ids));

  const map = new Map<string, ContatoLite>();
  (contatos ?? []).forEach(c => map.set((c as ContatoLite).id, c as ContatoLite));

  return lista.map(r => {
    const tel = r.contato_telefone_id ? map.get(r.contato_telefone_id)?.valor ?? null : null;
    const eml = r.contato_email_id ? map.get(r.contato_email_id)?.valor ?? null : null;
    return { ...r, telefone: tel, email: eml };
  });
}

export async function obterResponsavelPrincipal(cliente_id: string): Promise<ClienteResponsavel | null> {
  const lista = await listarResponsaveis(cliente_id);
  return lista.find(r => r.principal) ?? lista[0] ?? null;
}

export async function listarContatosCliente(cliente_id: string): Promise<ContatoLite[]> {
  const { data, error } = await supabase
    .from("cliente_contatos")
    .select("id, cliente_id, tipo, valor, tem_whatsapp")
    .eq("cliente_id", cliente_id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ContatoLite[];
}

export interface NovoResponsavelInput {
  cliente_id: string;
  nome: string;
  cargo?: string | null;
  cpf?: string | null;
  observacoes?: string | null;
  contato_telefone_id?: string | null;
  contato_email_id?: string | null;
  principal?: boolean;
}

export async function criarResponsavel(input: NovoResponsavelInput): Promise<ClienteResponsavel> {
  // Se for principal, desmarca os outros antes (índice único parcial garante isso)
  if (input.principal) {
    await supabase
      .from("cliente_responsaveis" as never)
      .update({ principal: false } as never)
      .eq("cliente_id", input.cliente_id);
  }
  const { data, error } = await supabase
    .from("cliente_responsaveis" as never)
    .insert({
      cliente_id: input.cliente_id,
      nome: input.nome,
      cargo: input.cargo ?? null,
      cpf: input.cpf ?? null,
      observacoes: input.observacoes ?? null,
      contato_telefone_id: input.contato_telefone_id ?? null,
      contato_email_id: input.contato_email_id ?? null,
      principal: input.principal ?? false,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ClienteResponsavel;
}

export type AtualizarResponsavelPayload = Partial<
  Pick<ClienteResponsavel, "nome" | "cargo" | "cpf" | "observacoes" | "contato_telefone_id" | "contato_email_id" | "principal">
>;

export async function atualizarResponsavel(
  id: string,
  payload: AtualizarResponsavelPayload,
  cliente_id?: string,
) {
  if (payload.principal && cliente_id) {
    await supabase
      .from("cliente_responsaveis" as never)
      .update({ principal: false } as never)
      .eq("cliente_id", cliente_id)
      .neq("id", id);
  }
  const { error } = await supabase
    .from("cliente_responsaveis" as never)
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirResponsavel(id: string) {
  const { error } = await supabase
    .from("cliente_responsaveis" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}
