import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html } = await req.json();
    if (!html || typeof html !== "string") {
      return new Response(JSON.stringify({ error: "html é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    // Extração local (rápida, determinística)
    const matches = Array.from(html.matchAll(/\{([a-zA-Z0-9_.]+)\}/g));
    const localKeys = Array.from(new Set(matches.map((m) => m[1])));

    const prompt = `Você é um analisador de templates comerciais.
Receberá um HTML de proposta. Sua tarefa:
1. Listar campos (placeholders) detectáveis no formato {chave}
2. Sugerir blocos lógicos (ex: cabeçalho, dados do cliente, escopo, tabela de produtos, condições, assinatura)
3. Identificar onde a tabela de produtos deveria ser inserida (descreva em palavras)

Responda APENAS um JSON com esta estrutura:
{"campos":[{"chave":"...","sugestao":"..."}],"blocos":["..."],"onde_inserir_tabela":"..."}

HTML:
${html.slice(0, 8000)}`;

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

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições, tente novamente." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados na Lovable AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error:", t);
      return new Response(JSON.stringify({ error: "Erro IA", localKeys }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { campos: localKeys.map((k) => ({ chave: k, sugestao: "" })), blocos: [], onde_inserir_tabela: "" };
    }

    // Garante que pelo menos os locais detectados estejam presentes
    const finais = new Map<string, string>();
    for (const k of localKeys) finais.set(k, "");
    for (const c of parsed.campos ?? []) {
      if (c?.chave) finais.set(String(c.chave), c.sugestao ?? "");
    }

    return new Response(JSON.stringify({
      campos: Array.from(finais.entries()).map(([chave, sugestao]) => ({ chave, sugestao })),
      blocos: parsed.blocos ?? [],
      onde_inserir_tabela: parsed.onde_inserir_tabela ?? "",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
