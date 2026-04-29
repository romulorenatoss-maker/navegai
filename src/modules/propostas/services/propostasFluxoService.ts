import { supabase } from "@/integrations/supabase/client";

export type FluxoTipo = "pergunta" | "bloco";

export interface PropostasFluxoItem {
  id: string;
  template_id: string;
  tipo: FluxoTipo;
  referencia: string;
  label: string | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export async function listarFluxo(template_id: string): Promise<PropostasFluxoItem[]> {
  const { data, error } = await supabase
    .from("propostas_fluxo" as never)
    .select("*")
    .eq("template_id", template_id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PropostasFluxoItem[];
}

export async function adicionarItemFluxo(input: {
  template_id: string;
  tipo: FluxoTipo;
  referencia: string;
  label?: string | null;
}) {
  // próxima ordem
  const { data: last } = await supabase
    .from("propostas_fluxo" as never)
    .select("ordem")
    .eq("template_id", input.template_id)
    .order("ordem", { ascending: false })
    .limit(1);
  const nextOrdem = ((last as Array<{ ordem: number }> | null)?.[0]?.ordem ?? 0) + 1;

  const { data, error } = await supabase
    .from("propostas_fluxo" as never)
    .insert({
      template_id: input.template_id,
      tipo: input.tipo,
      referencia: input.referencia,
      label: input.label ?? null,
      ordem: nextOrdem,
      ativo: true,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as PropostasFluxoItem;
}

export async function reordenarFluxo(pares: Array<{ id: string; ordem: number }>) {
  for (const p of pares) {
    const { error } = await supabase
      .from("propostas_fluxo" as never)
      .update({ ordem: p.ordem } as never)
      .eq("id", p.id);
    if (error) throw error;
  }
}

export async function removerItemFluxo(id: string) {
  const { error } = await supabase
    .from("propostas_fluxo" as never)
    .update({ ativo: false } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function listarCategoriasProdutos(): Promise<string[]> {
  const { data, error } = await supabase
    .from("propostas_produtos" as never)
    .select("categoria")
    .eq("ativo", true)
    .not("categoria", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data as Array<{ categoria: string | null }>) || []) {
    if (r.categoria) set.add(r.categoria);
  }
  return Array.from(set).sort();
}
