import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Bloco {
  id: string;
  tipo: "fixo" | "variavel" | "tabela";
  conteudo?: string;
  campo?: string;
  schema?: string[];
  locked?: boolean;
}

interface LinhaTabela { item?: string; qtd?: number | string; descricao?: string; valor?: number | string; [k: string]: unknown }

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTabela(linhas: LinhaTabela[], schema: string[]): string {
  if (!linhas?.length) return "";
  const cols = schema?.length ? schema : Object.keys(linhas[0]);
  const head = cols.map((c) => `<th style="border:1px solid #ccc;padding:6px;background:#f3f4f6;text-align:left">${escapeHtml(c)}</th>`).join("");
  const body = linhas
    .map((l) => `<tr>${cols.map((c) => `<td style="border:1px solid #ccc;padding:6px">${escapeHtml(String(l[c] ?? ""))}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;width:100%;margin:8px 0"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { blocos, respostas } = await req.json() as {
      blocos: Bloco[];
      respostas: Record<string, string | number | LinhaTabela[]>;
    };

    if (!Array.isArray(blocos)) {
      return new Response(JSON.stringify({ error: "blocos é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reconstrução determinística — preserva layout
    const partes: string[] = [];
    for (const b of blocos) {
      if (b.tipo === "fixo") {
        partes.push(b.conteudo ?? "");
      } else if (b.tipo === "variavel") {
        const valor = respostas[b.id] ?? respostas[b.campo ?? ""] ?? "";
        // Se o conteudo original embrulha o {campo}, substitui dentro dele
        if (b.conteudo && b.campo && b.conteudo.includes(`{${b.campo}}`)) {
          partes.push(b.conteudo.replace(`{${b.campo}}`, escapeHtml(String(valor))));
        } else {
          partes.push(`<p>${escapeHtml(String(valor))}</p>`);
        }
      } else if (b.tipo === "tabela") {
        const linhas = respostas[b.id] as LinhaTabela[] | undefined;
        if (Array.isArray(linhas) && linhas.length > 0) {
          partes.push(renderTabela(linhas, b.schema ?? ["item", "qtd", "descricao", "valor"]));
        } else if (b.conteudo) {
          partes.push(b.conteudo);
        }
      }
    }

    const html = partes.join("\n");

    return new Response(JSON.stringify({ html }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
