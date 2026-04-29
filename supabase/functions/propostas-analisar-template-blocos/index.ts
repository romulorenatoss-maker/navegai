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
  pergunta?: string;
}

/** Análise local determinística — fallback caso IA falhe. */
function analiseLocal(html: string): Bloco[] {
  const blocos: Bloco[] = [];
  // Quebra por blocos de bloco (h1..h6, p, table, ul, ol, div)
  const partes = html
    .replace(/\r/g, "")
    .split(/(?=<(?:h[1-6]|p|table|ul|ol|div|section)\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  let idx = 0;
  for (const parte of partes) {
    const isTable = /^<table\b/i.test(parte);
    const placeholders = Array.from(parte.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)).map((m) => m[1]);

    if (isTable) {
      blocos.push({ id: `b${idx++}`, tipo: "tabela", conteudo: parte, schema: ["item", "qtd", "descricao", "valor"], locked: false });
      continue;
    }

    if (placeholders.length === 1 && parte.replace(/<[^>]+>/g, "").trim().match(/^\{[a-zA-Z0-9_.]+\}$/)) {
      blocos.push({ id: `b${idx++}`, tipo: "variavel", campo: placeholders[0], conteudo: parte, locked: false });
      continue;
    }

    // Heurística: cláusulas/textos técnicos = locked
    const texto = parte.replace(/<[^>]+>/g, "").toLowerCase();
    const lockHints = ["cláusula", "clausula", "garantia", "responsabilidade", "lgpd", "termos", "condições gerais"];
    const locked = lockHints.some((h) => texto.includes(h));

    blocos.push({ id: `b${idx++}`, tipo: "fixo", conteudo: parte, locked });
  }

  return blocos;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html } = await req.json();
    if (!html || typeof html !== "string") {
      return new Response(JSON.stringify({ error: "html é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blocosLocal = analiseLocal(html);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ blocos: blocosLocal, perguntas: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é um analisador de propostas comerciais.
Recebeu uma lista de blocos de um template. Para cada bloco do tipo "variavel" ou "tabela",
gere uma pergunta clara em português que o vendedor possa responder no modo guiado.
Para blocos "fixo" com cláusulas/garantias/termos, marque locked=true.

Responda APENAS JSON:
{"blocos":[{"id":"...","tipo":"...","locked":bool,"pergunta":"..."}]}

Blocos:
${JSON.stringify(blocosLocal.map((b) => ({ id: b.id, tipo: b.tipo, campo: b.campo, conteudo: b.conteudo?.slice(0, 300) })))}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você responde apenas JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições, tente novamente.", blocos: blocosLocal }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados.", blocos: blocosLocal }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      return new Response(JSON.stringify({ blocos: blocosLocal, perguntas: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { blocos?: Array<{ id: string; locked?: boolean; pergunta?: string }> } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {};
    }

    // Merge: aplica locked/pergunta da IA nos blocos locais
    const enriched = blocosLocal.map((b) => {
      const aiInfo = parsed.blocos?.find((x) => x.id === b.id);
      return {
        ...b,
        locked: aiInfo?.locked ?? b.locked ?? false,
        pergunta: aiInfo?.pergunta,
      };
    });

    const perguntas = enriched
      .filter((b) => (b.tipo === "variavel" || b.tipo === "tabela") && b.pergunta)
      .map((b) => ({ bloco_id: b.id, tipo: b.tipo, campo: b.campo, pergunta: b.pergunta!, schema: b.schema }));

    return new Response(JSON.stringify({ blocos: enriched, perguntas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
