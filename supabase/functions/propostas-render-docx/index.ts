// =====================================================================
// propostas-render-docx — HARDENED
// Render determinístico de proposta a partir de template .docx
// (docxtemplater + pizzip), bucket `propostas-templates`.
//
// Princípios:
//  - Backend é a ÚNICA fonte da verdade.
//  - Itens vêm do banco (propostas_itens) via proposta_id.
//  - Totais, contexto, cliente_nome, data são recalculados aqui.
//  - Frontend pode passar overrides apenas em modo "preview" (proposta_id ausente).
//  - Snapshot completo é gravado em propostas.snapshot_render para auditoria.
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import PizZip from "https://esm.sh/pizzip@3.1.6";
import Docxtemplater from "https://esm.sh/docxtemplater@3.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Categoria = "infraestrutura" | "dados" | "seguranca" | "telefonia";
const CATEGORIAS: Categoria[] = ["infraestrutura", "dados", "seguranca", "telefonia"];

interface RenderInput {
  // Modo "salvo": render baseado em proposta persistida (recomendado)
  proposta_id?: string | null;
  // Modo "preview": somente quando proposta_id NÃO for informado
  template_id?: string;
  cliente_id?: string;
  contexto?: string;
  itens_preview?: Array<{
    produto_id?: string;
    nome?: string;
    quantidade: number;
    valor: number;
    categoria?: Categoria;
    cobranca?: "implantacao" | "mensal" | "informativo";
  }>;
  respostas?: Record<string, unknown>;
}

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

const fmtDateBR = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

interface ItemResolvido {
  produto_id: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  categoria: Categoria | null;
  cobranca: "implantacao" | "mensal" | "informativo";
  campo_template: string | null;
  tipo_input: "quantidade" | "boolean" | "lista";
}

function formatItemContext(it: ItemResolvido) {
  return {
    nome: it.nome,
    quantidade: it.quantidade,
    qtd: it.quantidade,
    valor: it.valor_unitario,
    valor_fmt: fmtBRL(it.valor_unitario),
    valor_total: it.valor_total,
    valor_total_fmt: fmtBRL(it.valor_total),
    cobranca: it.cobranca,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const input = (await req.json()) as RenderInput;

    // =================================================================
    // 1) RESOLVER PROPOSTA / TEMPLATE / CLIENTE
    // =================================================================
    let proposta:
      | {
          id: string;
          cliente_id: string;
          template_id: string | null;
          created_at: string;
        }
      | null = null;
    let templateId: string | null = null;
    let clienteId: string | null = null;
    let dataProposta: Date;

    if (input.proposta_id) {
      const { data, error } = await supabase
        .from("propostas_propostas")
        .select("id, cliente_id, template_id, created_at")
        .eq("id", input.proposta_id)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "proposta não encontrada" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      proposta = data;
      templateId = data.template_id;
      clienteId = data.cliente_id;
      dataProposta = new Date(data.created_at);
    } else {
      // modo preview
      if (!input.template_id) {
        return new Response(JSON.stringify({ error: "template_id obrigatório em modo preview" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      templateId = input.template_id;
      clienteId = input.cliente_id ?? null;
      dataProposta = new Date();
    }

    if (!templateId) {
      return new Response(JSON.stringify({ error: "proposta sem template definido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente
    let clienteNome = "";
    if (clienteId) {
      const { data: cli } = await supabase
        .from("clientes").select("nome").eq("id", clienteId).single();
      clienteNome = cli?.nome ?? "";
    }

    // Template
    const { data: tpl, error: tplErr } = await supabase
      .from("propostas_templates")
      .select("id, nome, tipo_template, arquivo_docx_path, versao, updated_at")
      .eq("id", templateId)
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

    // =================================================================
    // 2) CARREGAR ITENS — banco quando salvo, payload quando preview
    // =================================================================
    interface RawItem {
      produto_id: string | null;
      descricao: string;
      quantidade: number;
      valor_unitario: number;
      categoria: string | null;
      cobranca: string;
    }
    let rawItens: RawItem[] = [];

    if (proposta) {
      const { data: itens, error: itErr } = await supabase
        .from("propostas_itens")
        .select("produto_id, descricao, quantidade, valor_unitario, categoria, cobranca")
        .eq("proposta_id", proposta.id);
      if (itErr) {
        return new Response(JSON.stringify({ error: "falha ao ler itens", detail: itErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      rawItens = (itens ?? []) as RawItem[];
    } else {
      // preview: aceita itens_preview, mas serão validados contra catálogo
      rawItens = (input.itens_preview ?? []).map((i) => ({
        produto_id: i.produto_id ?? null,
        descricao: i.nome ?? "",
        quantidade: Number(i.quantidade ?? 0),
        valor_unitario: Number(i.valor ?? 0),
        categoria: i.categoria ?? null,
        cobranca: i.cobranca ?? "mensal",
      }));
    }

    // =================================================================
    // 3) VALIDAR PRODUTOS — todos itens precisam mapear para catálogo
    // =================================================================
    const produtoIds = Array.from(new Set(
      rawItens.map((i) => i.produto_id).filter((x): x is string => !!x),
    ));
    let produtosMap = new Map<string, {
      id: string; nome: string; categoria: string | null;
      cobranca_padrao: string; campo_template: string | null;
      tipo_input: string; ativo: boolean;
    }>();
    if (produtoIds.length) {
      const { data: prods } = await supabase
        .from("propostas_produtos")
        .select("id, nome, categoria, cobranca_padrao, campo_template, tipo_input, ativo")
        .in("id", produtoIds);
      for (const p of prods ?? []) produtosMap.set(p.id, p as never);
    }

    const itensRejeitados: Array<{ descricao: string; motivo: string }> = [];
    const itensResolvidos: ItemResolvido[] = [];

    for (const r of rawItens) {
      if (!r.produto_id) {
        itensRejeitados.push({ descricao: r.descricao, motivo: "sem produto_id (item legado)" });
        continue;
      }
      const prod = produtosMap.get(r.produto_id);
      if (!prod) {
        itensRejeitados.push({ descricao: r.descricao, motivo: "produto não encontrado" });
        continue;
      }
      if (!prod.ativo) {
        itensRejeitados.push({ descricao: r.descricao, motivo: "produto inativo" });
        continue;
      }

      const qtd = Number(r.quantidade ?? 0);
      const vu = Number(r.valor_unitario ?? 0);
      const categoria = (r.categoria ?? prod.categoria) as Categoria | null;
      itensResolvidos.push({
        produto_id: prod.id,
        nome: prod.nome, // canônico do catálogo
        quantidade: qtd,
        valor_unitario: vu,
        valor_total: +(qtd * vu).toFixed(2),
        categoria: CATEGORIAS.includes(categoria as Categoria) ? (categoria as Categoria) : null,
        cobranca: (r.cobranca || prod.cobranca_padrao || "mensal") as ItemResolvido["cobranca"],
        campo_template: prod.campo_template ?? null,
        tipo_input: (prod.tipo_input as ItemResolvido["tipo_input"]) ?? "quantidade",
      });
    }

    // =================================================================
    // 4) ORDENAÇÃO — categoria (ordem fixa) + nome (alfabético, pt-BR)
    // =================================================================
    const ordemCat: Record<string, number> = {
      infraestrutura: 1, dados: 2, seguranca: 3, telefonia: 4,
    };
    itensResolvidos.sort((a, b) => {
      const ca = ordemCat[a.categoria ?? ""] ?? 99;
      const cb = ordemCat[b.categoria ?? ""] ?? 99;
      if (ca !== cb) return ca - cb;
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });

    // =================================================================
    // 5) AGRUPAR POR CATEGORIA (blocos {#categoria}...{/categoria})
    // =================================================================
    const grupos: Record<Categoria, ReturnType<typeof formatItemContext>[]> = {
      infraestrutura: [], dados: [], seguranca: [], telefonia: [],
    };
    for (const it of itensResolvidos) {
      if (it.categoria && CATEGORIAS.includes(it.categoria)) {
        grupos[it.categoria].push(formatItemContext(it));
      }
    }

    // =================================================================
    // 6) TOKENS POR campo_template (recalculados, ignora frontend)
    //    quantidade → soma     | boolean → "X" se qtd>0     | lista → linhas
    // =================================================================
    const tokensProduto: Record<string, string | number> = {};
    const listaAcc: Record<string, string[]> = {};
    for (const it of itensResolvidos) {
      const k = (it.campo_template ?? "").trim().toLowerCase();
      if (!k) continue;
      const qtd = Number(it.quantidade ?? 0);

      if (it.tipo_input === "boolean") {
        if (qtd > 0) tokensProduto[k] = "X";
        else if (!(k in tokensProduto)) tokensProduto[k] = "";
      } else if (it.tipo_input === "lista") {
        if (qtd <= 0) continue;
        listaAcc[k] = listaAcc[k] ?? [];
        listaAcc[k].push(qtd > 1 ? `${it.nome} (x${qtd})` : it.nome);
      } else {
        tokensProduto[k] = Number(tokensProduto[k] ?? 0) + qtd;
      }
    }
    // Listas: quebra de linha (\n vira <w:br/> com linebreaks:true do docxtemplater)
    for (const [k, arr] of Object.entries(listaAcc)) {
      tokensProduto[k] = arr.join("\n");
    }

    // =================================================================
    // 7) TOTAIS — calculados do zero pelo backend
    // =================================================================
    const totais = { implantacao: 0, mensal: 0, informativo: 0 };
    for (const it of itensResolvidos) {
      const v = it.valor_total;
      if (it.cobranca === "implantacao") totais.implantacao += v;
      else if (it.cobranca === "informativo") totais.informativo += v;
      else totais.mensal += v;
    }
    totais.implantacao = +totais.implantacao.toFixed(2);
    totais.mensal = +totais.mensal.toFixed(2);
    totais.informativo = +totais.informativo.toFixed(2);

    // =================================================================
    // 8) CONTEXTO — usa o informado; se vazio, gera resumo automático
    // =================================================================
    let contextoFinal = (input.contexto ?? "").toString().trim();
    if (!contextoFinal) {
      const partes: string[] = [];
      for (const c of CATEGORIAS) {
        const arr = grupos[c];
        if (arr.length) {
          partes.push(`${arr.length} item(ns) de ${c}`);
        }
      }
      contextoFinal = partes.length
        ? `Proposta para ${clienteNome || "cliente"} contemplando ${partes.join(", ")}.`
        : `Proposta para ${clienteNome || "cliente"}.`;
    }

    // =================================================================
    // 9) BAIXAR TEMPLATE .docx
    // =================================================================
    const { data: file, error: dlErr } = await supabase.storage
      .from("propostas-templates").download(tpl.arquivo_docx_path);
    if (dlErr || !file) {
      return new Response(JSON.stringify({ error: "falha ao baixar template", detail: dlErr?.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const buf = new Uint8Array(await file.arrayBuffer());

    // =================================================================
    // 10) MONTAR CONTEXTO DO DOCXTEMPLATER
    // =================================================================
    const data = {
      cliente_nome: clienteNome,
      contexto: contextoFinal,
      data_hoje: fmtDateBR(dataProposta), // data da PROPOSTA, não do render
      data_proposta: fmtDateBR(dataProposta),
      ...(input.respostas ?? {}),
      ...tokensProduto,
      infraestrutura: grupos.infraestrutura,
      dados: grupos.dados,
      seguranca: grupos.seguranca,
      telefonia: grupos.telefonia,
      totais: {
        implantacao: totais.implantacao,
        mensal: totais.mensal,
        informativo: totais.informativo,
        implantacao_fmt: fmtBRL(totais.implantacao),
        mensal_fmt: fmtBRL(totais.mensal),
        informativo_fmt: fmtBRL(totais.informativo),
      },
    };

    // =================================================================
    // 11) RENDER
    // =================================================================
    let zip: PizZip;
    try { zip = new PizZip(buf); }
    catch (e) {
      return new Response(JSON.stringify({ error: "arquivo .docx inválido", detail: String(e) }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true, linebreaks: true,
      delimiters: { start: "{", end: "}" },
      nullGetter: () => "",
    });

    try { doc.render(data); }
    catch (e: any) {
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

    // =================================================================
    // 12) UPLOAD DO RESULTADO
    // =================================================================
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeCliente = (clienteNome || "proposta").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    const renderedPath = `rendered/${proposta?.id ?? "preview"}/${safeCliente}_${stamp}.docx`;

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
      .from("propostas-templates").createSignedUrl(renderedPath, 60 * 60);

    // =================================================================
    // 13) SNAPSHOT — só quando há proposta persistida
    // =================================================================
    const templateVersao = `${tpl.versao ?? "1"}@${tpl.updated_at ?? ""}`;
    if (proposta) {
      const snapshot = {
        rendered_at: new Date().toISOString(),
        rendered_path: renderedPath,
        template: { id: tpl.id, nome: tpl.nome, versao: templateVersao, path: tpl.arquivo_docx_path },
        cliente: { id: clienteId, nome: clienteNome },
        contexto: contextoFinal,
        itens: itensResolvidos,
        itens_rejeitados: itensRejeitados,
        totais,
        tokens_produto: tokensProduto,
        ordem: itensResolvidos.map((i) => ({ nome: i.nome, categoria: i.categoria })),
      };
      await supabase
        .from("propostas_propostas")
        .update({
          snapshot_render: snapshot,
          template_versao: templateVersao,
          data_render: new Date().toISOString(),
        })
        .eq("id", proposta.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      path: renderedPath,
      url: signed?.signedUrl ?? null,
      bytes: out.byteLength,
      template_nome: tpl.nome,
      template_versao: templateVersao,
      itens_renderizados: itensResolvidos.length,
      itens_rejeitados: itensRejeitados,
      totais,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
