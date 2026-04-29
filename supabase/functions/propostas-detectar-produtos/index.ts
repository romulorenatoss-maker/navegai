import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProdutoDetectado {
  nome: string;
  tipo: "produto" | "servico";
  valor_minimo: number;
  tipo_calculo: "quantidade" | "gb_total" | "gb_por_unidade";
  unidade: string;
}

/** Parse local determinístico: "Switch TP-Link - 1300", "Storage por GB - 0,50". */
function parseLocal(texto: string): ProdutoDetectado[] {
  const out: ProdutoDetectado[] = [];
  for (const linha of texto.split(/\n+/)) {
    const t = linha.trim();
    if (!t) continue;
    // Formato: "Nome - 1234,56" ou "Nome - R$ 1.234,56"
    const m = t.match(/^(.+?)\s*[-–—]\s*R?\$?\s*([\d.,]+)\s*$/);
    if (!m) continue;
    const nome = m[1].trim();
    const valorStr = m[2].replace(/\./g, "").replace(",", ".");
    const valor = Number(valorStr);
    if (isNaN(valor)) continue;

    const lower = nome.toLowerCase();
    const isGB = /\bgb\b|\bstorage\b|armazenament/i.test(lower);
    const isServico = /serviç|instala|configura|suporte|consult|mensal|hora|hospedag|monitora/i.test(lower);

    out.push({
      nome,
      tipo: isServico ? "servico" : "produto",
      valor_minimo: valor,
      tipo_calculo: isGB ? "gb_total" : "quantidade",
      unidade: isGB ? "GB" : isServico ? "serv" : "un",
    });
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { texto } = await req.json();
    if (!texto || typeof texto !== "string") {
      return new Response(JSON.stringify({ error: "texto é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const local = parseLocal(texto);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY || local.length === 0) {
      return new Response(JSON.stringify({ produtos: local }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refinamento opcional pela IA: classifica produto/serviço e tipo_calculo melhor.
    const prompt = `Você recebeu uma lista preliminar de itens detectados de um texto livre.
Refine cada item classificando:
- tipo: "produto" ou "servico"
- tipo_calculo: "quantidade" | "gb_total" | "gb_por_unidade"
- unidade: "un", "GB", "hora", "mes", "serv", etc.
Responda APENAS JSON: {"produtos":[{"nome":"...","tipo":"...","valor_minimo":num,"tipo_calculo":"...","unidade":"..."}]}

Itens:
${JSON.stringify(local)}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Responda apenas JSON válido, sem markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429 || resp.status === 402 || !resp.ok) {
      return new Response(JSON.stringify({ produtos: local }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: { produtos?: ProdutoDetectado[] } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { produtos: local };
    }

    return new Response(JSON.stringify({ produtos: parsed.produtos ?? local }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
