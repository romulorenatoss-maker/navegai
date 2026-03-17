import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { question } = await req.json();
    if (!question) throw new Error("Question is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gather real-time business data
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    const [
      { count: leadsTotal },
      { count: leadsHoje },
      { count: leadsNaFila },
      { count: leadsConvertidos },
      { count: leadsConvertidosHoje },
      { count: leadsPerdidos },
      { data: campanhas },
      { data: interacoes },
      { count: osTotal },
      { count: osConcluidas },
      { count: osHoje },
      { data: tentativasData },
      { data: statusLeads },
      { data: osDetalhes },
      { data: historicoLeads },
      { data: atrasosData },
      { data: avaliacoesData },
      { data: respostasData },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("leads").select("*", { count: "exact", head: true }).in("status_lead", ["novo", "aguardando_captura", "reservado", "em_contato"]),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "convertido"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "convertido").gte("updated_at", todayStart).lte("updated_at", todayEnd),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "perdido"),
      supabase.from("campanhas").select("id, nome").eq("ativo", true),
      supabase.from("lead_interacoes").select("lead_id, tipo_contato, resultado, data_interacao"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).eq("status", "concluida"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("lead_tarefas_contato").select("lead_id, tentativa, status"),
      supabase.from("leads").select("status_lead"),
    ]);

    // Campaign conversion counts
    const { data: leadsWithCampanha } = await supabase
      .from("leads")
      .select("campanha_id, status_lead, campanhas(nome)")
      .not("campanha_id", "is", null);

    const campConversion: Record<string, { total: number; convertidos: number }> = {};
    if (leadsWithCampanha) {
      for (const l of leadsWithCampanha) {
        const name = (l as any).campanhas?.nome || "Sem nome";
        if (!campConversion[name]) campConversion[name] = { total: 0, convertidos: 0 };
        campConversion[name].total++;
        if (l.status_lead === "convertido") campConversion[name].convertidos++;
      }
    }

    // Average attempts per lead
    const tentativasPorLead: Record<string, number> = {};
    if (tentativasData) {
      for (const t of tentativasData) {
        tentativasPorLead[t.lead_id] = Math.max(tentativasPorLead[t.lead_id] || 0, t.tentativa);
      }
    }
    const totalLeadsComTentativa = Object.keys(tentativasPorLead).length;
    const somaTentativas = Object.values(tentativasPorLead).reduce((a, b) => a + b, 0);
    const mediaTentativas = totalLeadsComTentativa > 0 ? (somaTentativas / totalLeadsComTentativa).toFixed(1) : "0";

    // Status distribution
    const statusCount: Record<string, number> = {};
    if (statusLeads) {
      for (const l of statusLeads) {
        statusCount[l.status_lead] = (statusCount[l.status_lead] || 0) + 1;
      }
    }

    // Interaction stats
    const totalInteracoes = interacoes?.length || 0;
    const interacoesHoje = interacoes?.filter(i => i.data_interacao >= todayStart && i.data_interacao <= todayEnd).length || 0;

    const contextData = `
DADOS DO SISTEMA EM TEMPO REAL (${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}):

LEADS:
- Total de leads: ${leadsTotal || 0}
- Leads criados hoje: ${leadsHoje || 0}
- Leads na fila (ativos): ${leadsNaFila || 0}
- Leads convertidos (total): ${leadsConvertidos || 0}
- Leads convertidos hoje: ${leadsConvertidosHoje || 0}
- Leads perdidos: ${leadsPerdidos || 0}
- Média de tentativas por lead: ${mediaTentativas}
- Distribuição por status: ${JSON.stringify(statusCount)}

ORDENS DE SERVIÇO (OS):
- Total de OS: ${osTotal || 0}
- OS concluídas: ${osConcluidas || 0}
- OS criadas hoje: ${osHoje || 0}

CAMPANHAS ATIVAS: ${campanhas?.map(c => c.nome).join(", ") || "Nenhuma"}
CONVERSÃO POR CAMPANHA: ${JSON.stringify(campConversion)}

INTERAÇÕES:
- Total de interações registradas: ${totalInteracoes}
- Interações hoje: ${interacoesHoje}
`;

    const systemPrompt = `Você é um assistente inteligente de business intelligence para um sistema de gestão de leads, vendas e avaliações.

Seu papel é responder perguntas de gestores sobre o desempenho do negócio com base nos dados reais do sistema.

REGRAS:
- Sempre responda em português do Brasil
- Use os dados fornecidos para dar respostas precisas e numéricas
- Quando relevante, inclua métricas e comparações
- Formate números grandes com separadores (ex: 1.234)
- Use emojis para destacar pontos importantes
- Se a pergunta não puder ser respondida com os dados disponíveis, diga educadamente
- Quando fizer sentido, sugira próximos passos ou ações
- Seja conciso mas completo
- Use markdown para formatação (negrito, listas, tabelas quando aplicável)

${contextData}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao consultar o assistente." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("business-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
