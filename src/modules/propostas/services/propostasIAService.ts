import { supabase } from "@/integrations/supabase/client";

export interface CampoAnalisado { chave: string; sugestao: string }
export interface AnaliseTemplate { campos: CampoAnalisado[]; blocos: string[]; onde_inserir_tabela: string }

export async function analisarTemplate(html: string): Promise<AnaliseTemplate> {
  const { data, error } = await supabase.functions.invoke("propostas-analisar-template", {
    body: { html },
  });
  if (error) throw error;
  return data as AnaliseTemplate;
}

export interface SugestaoItem {
  produto_id: string;
  nome: string;
  tipo_calculo: "quantidade" | "gb_total" | "gb_por_unidade";
  unidade: string;
  valor_unitario: number;
  quantidade: number;
  gb: number | null;
  justificativa: string;
}

export async function sugerirConfiguracao(input: {
  metragem?: number; usuarios?: number; necessidade?: string;
}): Promise<{ itens: SugestaoItem[] }> {
  const { data, error } = await supabase.functions.invoke("propostas-sugerir-config", { body: input });
  if (error) throw error;
  return data as { itens: SugestaoItem[] };
}

export async function ajustarTexto(html: string, instrucao: string, contexto?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("propostas-ajustar-texto", {
    body: { html, instrucao, contexto },
  });
  if (error) throw error;
  return (data as { html: string }).html;
}

/** Salva par antes/depois para alimentar memória da IA. */
export async function registrarAjusteIA(antes: string, depois: string, contexto?: string) {
  if (antes === depois) return;
  // upsert simples: se par já existe, incrementa frequência
  const { data: existing } = await supabase
    .from("propostas_ajustes_ia" as never)
    .select("id, frequencia")
    .eq("trecho_original", antes)
    .eq("trecho_editado", depois)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("propostas_ajustes_ia" as never)
      .update({ frequencia: (existing as any).frequencia + 1 } as never)
      .eq("id", (existing as any).id);
  } else {
    await supabase
      .from("propostas_ajustes_ia" as never)
      .insert({ trecho_original: antes, trecho_editado: depois, contexto } as never);
  }
}
