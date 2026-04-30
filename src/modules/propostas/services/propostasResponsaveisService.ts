import { supabase } from "@/integrations/supabase/client";

// =====================================================
// Single source of truth para responsáveis do cliente.
// Reaproveita cliente_contatos (existente) para email/telefone via FK opcional.
// =====================================================

export interface ClienteResponsavel {
  id: string;
  cliente_id: string;
  contato_id: string | null;
  nome: string;
  cargo: string | null;
  principal: boolean;
  // Hidratado em runtime a partir de cliente_contatos (quando contato_id está setado):
  email?: string | null;
  telefone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContatoLite {
  id: string;
  cliente_id: string;
  tipo: string;     // 'email' | 'telefone' | ...
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
  const contatoIds = lista.map(r => r.contato_id).filter((x): x is string => !!x);
  if (contatoIds.length === 0) return lista;

  const { data: contatos } = await supabase
    .from("cliente_contatos")
    .select("id, tipo, valor")
    .in("id", contatoIds);

  const map = new Map<string, ContatoLite>();
  (contatos ?? []).forEach(c => map.set((c as ContatoLite).id, c as ContatoLite));

  return lista.map(r => {
    if (!r.contato_id) return r;
    const c = map.get(r.contato_id);
    if (!c) return r;
    if (c.tipo === "email") return { ...r, email: c.valor };
    if (c.tipo === "telefone") return { ...r, telefone: c.valor };
    return r;
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

export async function criarResponsavel(input: {
  cliente_id: string;
  nome: string;
  cargo?: string | null;
  contato_id?: string | null;
  principal?: boolean;
}): Promise<ClienteResponsavel> {
  // Se for marcado como principal, desmarca os outros antes
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
      contato_id: input.contato_id ?? null,
      principal: input.principal ?? false,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as ClienteResponsavel;
}

export async function atualizarResponsavel(
  id: string,
  payload: Partial<Pick<ClienteResponsavel, "nome" | "cargo" | "contato_id" | "principal">>,
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
