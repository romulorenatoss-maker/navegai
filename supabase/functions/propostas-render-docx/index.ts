// =====================================================================
// propostas-render-docx
// Render determinístico de proposta a partir de template .docx
// (docxtemplater + pizzip) hospedado em storage `propostas-templates`.
// IA NUNCA gera HTML/layout. Frontend envia o estado consolidado.
// Saída: arquivo .docx salvo no bucket + URL assinada para download.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PizZip from "https://esm.sh/pizzip@3.1.6";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ItemEntrada {
  nome: string;
  quantidade: number;
  valor: number;
  cobranca?: string;
  campo_template?: string | null;
  tipo_input?: "quantidade" | "boolean" | "lista";
}

interface RenderInput {
  template_id: string;
  cliente_nome: string;
  contexto?: string;
  itens: Array<ItemEntrada & { categoria: "infraestrutura" | "dados" | "seguranca" | "telefonia" }>;
  respostas?: Record<string, unknown>;
  totais?: { implantacao?: number; mensal?: number; informativo?: number };
  proposta_id?: string | null;
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

function formatItemContext(it: ItemEntrada) {
  return {
    nome: it.nome,
    quantidade: it.quantidade,
    qtd: it.quantidade,
    valor: it.valor,
    valor_fmt: fmtBRL(it.valor),
    valor_total: it.quantidade * it.valor,
    valor_total_fmt: fmtBRL(it.quantidade * it.valor),
    cobranca: it.cobranca ?? "",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const input = (await req.json()) as RenderInput;
    if (!input?.template_id) {
      return new Response(JSON.stringify({ error: "template_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Buscar template
    const { data: tpl, error: tplErr } = await supabase
      .from("propostas_templates")
      .select("id, nome, tipo_template, arquivo_docx_path")
      .eq("id", input.template_id)
      .single();
    if (tplErr || !tpl) {
      return new Response(JSON.stringify({ error: "template não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (tpl.tipo_template !== "docx" || !tpl.arquivo_docx_path) {
      return new Response(JSON.stringify({
        error: "template não é DOCX",
        hint: "Defina tipo_template='docx' e arquivo_docx_path no template.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2) Baixar .docx do storage
    const { data: file, error: dlErr } = await supabase.storage
      .from("propostas-templates")
      .download(tpl.arquivo_docx_path);
    if (dlErr || !file) {
      return new Response(JSON.stringify({ error: "falha ao baixar template", detail: dlErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const buf = new Uint8Array(await file.arrayBuffer());

    // 3) Agrupar itens por categoria
    const itens = Array.isArray(input.itens) ? input.itens : [];
    const categorias = ["infraestrutura", "dados", "seguranca", "telefonia"] as const;
    const grupos: Record<string, ReturnType<typeof formatItemContext>[]> = {};
    for (const c of categorias) grupos[c] = [];
    for (const it of itens) {
      if (categorias.includes(it.categoria)) {
        grupos[it.categoria].push(formatItemContext(it));
      }
    }

    // 4) Tokens diretos a partir de produtos (campo_template + tipo_input)
    //    Padronização: campo_template é normalizado (trim + lower) para garantir
    //    unicidade e agrupamento consistente, alinhado ao índice único do banco.
    //    quantidade  → soma de quantidades de itens com mesmo campo_template
    //    boolean     → "X" SOMENTE se existir pelo menos 1 item com aquele campo_template
    //                  (qtd > 0). Caso contrário "" — nunca marcar sem item real.
    //    lista       → "Item1, Item2, ..." (nomes dos itens com mesmo campo_template)
    const tokensProduto: Record<string, string | number> = {};
    for (const it of itens) {
      const k = (it.campo_template ?? "").trim().toLowerCase();
      if (!k) continue;
      const tipo = it.tipo_input ?? "quantidade";
      const qtd = Number(it.quantidade ?? 0);

      if (tipo === "boolean") {
        // Só marca "X" se existir item real com quantidade > 0
        if (qtd > 0) tokensProduto[k] = "X";
        else if (!(k in tokensProduto)) tokensProduto[k] = "";
      } else if (tipo === "lista") {
        if (qtd <= 0) continue;
        const prev = (tokensProduto[k] as string) ?? "";
        tokensProduto[k] = prev ? `${prev}, ${it.nome}` : it.nome;
      } else {
        const prev = Number(tokensProduto[k] ?? 0);
        tokensProduto[k] = prev + qtd;
      }
    }

    // 5) Totais (calcula se não veio)
    const totais = input.totais ?? (() => {
      const acc = { implantacao: 0, mensal: 0, informativo: 0 };
      for (const it of itens) {
        const v = (it.quantidade ?? 0) * (it.valor ?? 0);
        if (it.cobranca === "implantacao") acc.implantacao += v;
        else if (it.cobranca === "informativo") acc.informativo += v;
        else acc.mensal += v;
      }
      return acc;
    })();

    // 6) Contexto final passado ao docxtemplater
    const data = {
      cliente_nome: input.cliente_nome ?? "",
      contexto: input.contexto ?? "",
      data_hoje: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      ...(input.respostas ?? {}),
      ...tokensProduto,
      infraestrutura: grupos.infraestrutura,
      dados: grupos.dados,
      seguranca: grupos.seguranca,
      telefonia: grupos.telefonia,
      totais: {
        implantacao: totais.implantacao ?? 0,
        mensal: totais.mensal ?? 0,
        informativo: totais.informativo ?? 0,
        implantacao_fmt: fmtBRL(totais.implantacao ?? 0),
        mensal_fmt: fmtBRL(totais.mensal ?? 0),
        informativo_fmt: fmtBRL(totais.informativo ?? 0),
      },
    };

    // 7) Render
    let zip: PizZip;
    try {
      zip = new PizZip(buf);
    } catch (e) {
      return new Response(JSON.stringify({ error: "arquivo .docx inválido", detail: String(e) }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });

    try {
      doc.render(data);
    } catch (e: any) {
      const errors = e?.properties?.errors ?? [];
      return new Response(JSON.stringify({
        error: "falha ao renderizar template",
        detail: e?.message ?? String(e),
        template_errors: errors.map((er: any) => ({
          tag: er?.properties?.xtag,
          explanation: er?.properties?.explanation,
        })),
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const out: Uint8Array = doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" });

    // 8) Salvar resultado em storage (mesmo bucket, pasta /rendered)
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeCliente = (input.cliente_nome || "proposta").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    const renderedPath = `rendered/${input.proposta_id ?? "rascunho"}/${safeCliente}_${stamp}.docx`;

    const { error: upErr } = await supabase.storage
      .from("propostas-templates")
      .upload(renderedPath, out, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });
    if (upErr) {
      return new Response(JSON.stringify({ error: "falha ao salvar docx", detail: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed } = await supabase.storage
      .from("propostas-templates")
      .createSignedUrl(renderedPath, 60 * 60); // 1h

    return new Response(JSON.stringify({
      ok: true,
      path: renderedPath,
      url: signed?.signedUrl ?? null,
      bytes: out.byteLength,
      template_nome: tpl.nome,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
