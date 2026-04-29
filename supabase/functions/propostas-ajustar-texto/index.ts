import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { html, instrucao, contexto } = await req.json();
    if (!html || !instrucao) {
      return new Response(JSON.stringify({ error: "html e instrucao são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Busca memória recente para guiar a IA
    const { data: ajustes } = await sb
      .from("propostas_ajustes_ia")
      .select("trecho_original, trecho_editado, contexto, frequencia")
      .order("frequencia", { ascending: false })
      .limit(10);

    const memoria = (ajustes ?? []).map(
      (a) => `- "${a.trecho_original}" → "${a.trecho_editado}" (${a.frequencia}x)`
    ).join("\n");

    const prompt = `Você ajusta o TEXTO de uma proposta sem RECRIAR o documento.
REGRAS DURAS:
- Preserve EXATAMENTE a estrutura HTML, classes, atributos e tabelas.
- Não invente novos placeholders. Não remova spans com data-propostas-placeholder.
- Aplique apenas a instrução solicitada.
- Mantenha o tom profissional.

Memória de aprendizado (preferências do usuário):
${memoria || "(vazia)"}

Contexto: ${contexto ?? "geral"}
Instrução: ${instrucao}

HTML atual:
${html}

Responda APENAS o HTML modificado, sem markdown nem explicações.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um editor de propostas. Responde só HTML, sem cercas de código." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429) return new Response(JSON.stringify({ error: "Limite de requisições, tente novamente." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos esgotados na Lovable AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error:", t);
      return new Response(JSON.stringify({ error: "Erro IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    let novoHtml: string = data.choices?.[0]?.message?.content ?? html;
    novoHtml = novoHtml.replace(/^```(html)?\s*/i, "").replace(/```\s*$/i, "").trim();

    return new Response(JSON.stringify({ html: novoHtml }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
