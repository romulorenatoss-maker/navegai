import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metragem, usuarios, necessidade } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: produtos, error } = await sb
      .from("propostas_produtos")
      .select("id, nome, descricao_padrao, valor_minimo, tipo_calculo, unidade")
      .eq("ativo", true);
    if (error) throw error;

    const catalogo = (produtos ?? []).map((p) => ({
      id: p.id, nome: p.nome, tipo: p.tipo_calculo, unidade: p.unidade, valor_minimo: Number(p.valor_minimo),
    }));

    const prompt = `Você é um especialista em propostas comerciais.
Cenário do cliente:
- Metragem: ${metragem ?? "n/d"} m²
- Usuários: ${usuarios ?? "n/d"}
- Necessidade: ${necessidade ?? "n/d"}

Catálogo disponível (use SOMENTE estes ids):
${JSON.stringify(catalogo)}

Sugira a combinação ideal de produtos para esse cenário. Responda APENAS JSON válido:
{"itens":[{"produto_id":"...","quantidade":N,"gb":N_ou_null,"justificativa":"..."}]}`;

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
      return new Response(JSON.stringify({ error: "Erro IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = { itens: [] };
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = { itens: [] };
    }

    // Hidrata com dados do catálogo (nome, valor mínimo) para o frontend
    const idMap = new Map(catalogo.map((p) => [p.id, p]));
    const itens = (parsed.itens ?? []).map((i: any) => {
      const p = idMap.get(i.produto_id);
      if (!p) return null;
      return {
        produto_id: p.id,
        nome: p.nome,
        tipo_calculo: p.tipo,
        unidade: p.unidade,
        valor_unitario: p.valor_minimo,
        quantidade: Number(i.quantidade ?? 1),
        gb: i.gb != null ? Number(i.gb) : null,
        justificativa: i.justificativa ?? "",
      };
    }).filter(Boolean);

    return new Response(JSON.stringify({ itens }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
