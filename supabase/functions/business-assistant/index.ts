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
      supabase.from("lead_interacoes").select("lead_id, tipo_contato, resultado, data_interacao, colaborador_id, numero_utilizado, profiles:colaborador_id(nome)"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).eq("status", "concluida"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("lead_tarefas_contato").select("lead_id, tentativa, status"),
      supabase.from("leads").select("status_lead"),
      // OS com detalhes de colaboradores avaliados
      supabase.from("ordens_servico").select(`
        id, numero_os, status, data_abertura, data_conclusao, cliente_nome, cliente_cpf,
        tipo_servico:tipo_servico_id(nome),
        tecnico:tecnico_id(nome),
        atendente:atendente_id(nome),
        colaborador_avaliado:colaborador_avaliado_id(nome)
      `).order("created_at", { ascending: false }).limit(200),
      // Histórico de leads com nomes de usuários
      supabase.from("lead_historico").select(`
        lead_id, tipo_evento, descricao, data_evento,
        profiles:usuario_id(nome),
        leads:lead_id(nome)
      `).order("data_evento", { ascending: false }).limit(500),
      // Registros de atraso com nomes
      supabase.from("registro_atraso_tentativa").select(`
        lead_id, tentativa, periodo, data_programada, data_registro,
        profiles:colaborador_id(nome),
        leads:lead_id(nome)
      `).order("created_at", { ascending: false }).limit(200),
      // Avaliações com avaliadores
      supabase.from("avaliacoes").select(`
        id, ordem_servico_id, concluida, concluida_em, nota_final,
        profiles:avaliador_id(nome),
        tipo_avaliacao:tipo_avaliacao_id(nome)
      `).order("created_at", { ascending: false }).limit(300),
      // Respostas de avaliação com detalhes
      supabase.from("respostas_avaliacao").select(`
        ordem_servico_id, pergunta_id, resposta, observacao, created_at,
        profiles:avaliador_id(nome),
        perguntas_avaliacao:pergunta_id(pergunta, peso, setor_avaliado:setor_avaliado_id(nome))
      `).not("resposta", "is", null).order("created_at", { ascending: false }).limit(500),
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

    // Format OS details with names
    const osDetalhesFmt = (osDetalhes || []).slice(0, 100).map((os: any) => ({
      numero: os.numero_os || "S/N",
      status: os.status,
      abertura: os.data_abertura?.split("T")[0],
      conclusao: os.data_conclusao?.split("T")[0] || "-",
      cliente: os.cliente_nome || "-",
      tecnico: os.tecnico?.nome || "-",
      atendente: os.atendente?.nome || "-",
      avaliado: os.colaborador_avaliado?.nome || "-",
      servico: os.tipo_servico?.nome || "-",
    }));

    // Format lead history with names
    const historicoFmt = (historicoLeads || []).slice(0, 200).map((h: any) => ({
      lead: (h as any).leads?.nome || h.lead_id,
      evento: h.tipo_evento,
      descricao: h.descricao || "",
      data: h.data_evento,
      usuario: (h as any).profiles?.nome || "-",
    }));

    // Format delays with names
    const atrasosFmt = (atrasosData || []).slice(0, 100).map((a: any) => ({
      lead: (a as any).leads?.nome || a.lead_id,
      colaborador: (a as any).profiles?.nome || "-",
      tentativa: a.tentativa,
      periodo: a.periodo,
      programada: a.data_programada,
      registro: a.data_registro,
    }));

    // Format interaction details with names
    const interacoesFmt = (interacoes || []).slice(0, 200).map((i: any) => ({
      lead_id: i.lead_id,
      tipo: i.tipo_contato,
      resultado: i.resultado || "-",
      data: i.data_interacao,
      colaborador: (i as any).profiles?.nome || "-",
      numero: i.numero_utilizado || "-",
    }));

    // Format evaluations
    const avaliacoesFmt = (avaliacoesData || []).slice(0, 100).map((a: any) => ({
      os_id: a.ordem_servico_id,
      avaliador: (a as any).profiles?.nome || "-",
      tipo: (a as any).tipo_avaliacao?.nome || "-",
      concluida: a.concluida,
      concluida_em: a.concluida_em || "-",
      nota: a.nota_final,
    }));

    // Format responses with question details
    const respostasFmt = (respostasData || []).slice(0, 200).map((r: any) => ({
      os_id: r.ordem_servico_id,
      pergunta: (r as any).perguntas_avaliacao?.pergunta || "-",
      setor: (r as any).perguntas_avaliacao?.setor_avaliado?.nome || "-",
      peso: (r as any).perguntas_avaliacao?.peso || 1,
      resposta: r.resposta,
      observacao: r.observacao || "",
      avaliador: (r as any).profiles?.nome || "-",
      data: r.created_at,
    }));

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

DETALHES DAS OS (últimas 100):
${JSON.stringify(osDetalhesFmt)}

CAMPANHAS ATIVAS: ${campanhas?.map(c => c.nome).join(", ") || "Nenhuma"}
CONVERSÃO POR CAMPANHA: ${JSON.stringify(campConversion)}

INTERAÇÕES COM LEADS (últimas 200, com nome do colaborador):
${JSON.stringify(interacoesFmt)}
- Total de interações registradas: ${totalInteracoes}
- Interações hoje: ${interacoesHoje}

HISTÓRICO DE ALTERAÇÕES EM LEADS (últimos 200 eventos):
Cada evento mostra quem fez a ação, quando e o que aconteceu.
${JSON.stringify(historicoFmt)}

REGISTROS DE ATRASO EM TENTATIVAS (últimos 100):
Mostra colaboradores que atrasaram nas tentativas de contato com leads.
${JSON.stringify(atrasosFmt)}

AVALIAÇÕES (últimas 100):
${JSON.stringify(avaliacoesFmt)}

RESPOSTAS DE AVALIAÇÃO (últimas 200, com pergunta, setor e avaliador):
${JSON.stringify(respostasFmt)}
`;

    const systemPrompt = `Você é um assistente inteligente de business intelligence para um sistema de gestão de leads, vendas e avaliações de qualidade (OS).

Seu papel é responder perguntas de gestores sobre o desempenho do negócio e dos colaboradores com base nos dados reais do sistema.

CONTEXTO DO SISTEMA:
- Ordens de Serviço (OS) são avaliações de qualidade feitas por avaliadores sobre atendentes e técnicos
- Cada OS tem perguntas que são respondidas (sim/não/N.A.) por avaliadores de diferentes setores
- Leads passam por um funil: criação → fila → captura → tentativas de contato → conversão ou perda
- O histórico de leads registra TODAS as ações: quem visualizou, capturou, transferiu, atrasou, interagiu
- Registros de atraso mostram colaboradores que não cumpriram prazos de tentativa

REGRAS:
- Sempre responda em português do Brasil
- Use os dados fornecidos para dar respostas precisas e numéricas
- Quando perguntar sobre uma pessoa, cruze os dados: OS, avaliações, histórico, interações, atrasos
- Identifique colaboradores pelos nomes que aparecem nos dados
- Quando relevante, inclua datas e horários específicos dos eventos
- Formate números grandes com separadores (ex: 1.234)
- Use emojis para destacar pontos importantes
- Se a pergunta não puder ser respondida com os dados disponíveis, diga educadamente
- Quando fizer sentido, sugira próximos passos ou ações
- Seja conciso mas completo
- Use markdown para formatação (negrito, listas, tabelas quando aplicável)
- Ao falar de desempenho de alguém, mostre: notas médias, OS avaliadas, atrasos, interações realizadas

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
