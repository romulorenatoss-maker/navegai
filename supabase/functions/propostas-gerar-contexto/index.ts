import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Gera APENAS o conteúdo textual do token {contexto}.
 * NÃO retorna HTML completo do template. Retorna 1-3 parágrafos em <p>.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { respostas, cliente_nome } = await req.json() as {
      respostas: Record<string, unknown>;
      cliente_nome?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ texto: "<p>Contexto não gerado: serviço de IA indisponível.</p>" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é especialista em propostas técnicas comerciais (TI/redes/cloud).
Com base nas respostas abaixo, escreva o BLOCO DE CONTEXTO de uma proposta:
- 1 a 3 parágrafos curtos
- Linguagem técnica, profissional, em pt-BR
- Estrutura: (1) problema/cenário do cliente, (2) solução proposta resumida, (3) benefícios
- NÃO inclua valores, cláusulas, garantias ou tabelas.
- NÃO inclua HTML completo. Apenas tags <p> e, no máximo, <strong>.
- Não invente dados que não estejam nas respostas.

Cliente: ${cliente_nome ?? "(não informado)"}

Respostas do setup:
${JSON.stringify(respostas, null, 2)}

Responda APENAS com o HTML dos parágrafos, sem markdown e sem cabeçalhos.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você produz apenas parágrafos HTML (<p>...</p>), sem markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições, tente novamente." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos esgotados." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Falha na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    let texto: string = (data.choices?.[0]?.message?.content ?? "").trim();
    texto = texto.replace(/```html|```/g, "").trim();
    // Garante que não veio HTML completo (head/body)
    texto = texto.replace(/<\/?(html|head|body|!doctype|meta|link|script|style)[^>]*>/gi, "");
    if (!/<p[\s>]/i.test(texto)) {
      texto = `<p>${texto}</p>`;
    }

    return new Response(JSON.stringify({ texto }), {
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
