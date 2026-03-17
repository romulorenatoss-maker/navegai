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
    const { question, mode } = await req.json();
    if (!question) throw new Error("Question is required");
    const isSimpleMode = mode === "simple";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      { data: leadsCompletos },
      { data: leadContatos },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("leads").select("*", { count: "exact", head: true }).in("status_lead", ["novo", "fila_captura", "reservado", "em_contato", "em_atendimento"]),
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
      supabase.from("ordens_servico").select(`
        id, numero_os, status, data_abertura, data_conclusao, cliente_nome, cliente_cpf,
        tipo_servico:tipo_servico_id(nome),
        tecnico:tecnico_id(nome),
        atendente:atendente_id(nome),
        colaborador_avaliado:colaborador_avaliado_id(nome)
      `).order("created_at", { ascending: false }).limit(200),
      supabase.from("lead_historico").select(`
        lead_id, tipo_evento, descricao, data_evento,
        profiles:usuario_id(nome),
        leads:lead_id(nome)
      `).order("data_evento", { ascending: false }).limit(500),
      supabase.from("registro_atraso_tentativa").select(`
        lead_id, tentativa, periodo, data_programada, data_registro,
        profiles:colaborador_id(nome),
        leads:lead_id(nome)
      `).order("created_at", { ascending: false }).limit(200),
      supabase.from("avaliacoes").select(`
        id, ordem_servico_id, concluida, concluida_em, nota_final,
        profiles:avaliador_id(nome),
        tipo_avaliacao:tipo_avaliacao_id(nome)
      `).order("created_at", { ascending: false }).limit(300),
      supabase.from("respostas_avaliacao").select(`
        ordem_servico_id, pergunta_id, resposta, observacao, created_at,
        profiles:avaliador_id(nome),
        perguntas_avaliacao:pergunta_id(pergunta, peso, setor_avaliado:setor_avaliado_id(nome))
      `).not("resposta", "is", null).order("created_at", { ascending: false }).limit(500),
      // Full leads with campaign and address info
      supabase.from("leads").select(`
        id, nome, status_lead, data_criacao, updated_at, repetidor, origem_lead, numero_endereco, agendamento_retorno,
        campanha:campanha_id(nome),
        responsavel:responsavel_id(nome),
        cidade:cidade_id(nome),
        bairro:bairro_id(nome),
        rua:rua_id(nome)
      `).order("created_at", { ascending: false }).limit(500),
      // Lead contacts
      supabase.from("lead_contatos").select("lead_id, tipo_contato, valor, tem_whatsapp").limit(1000),
    ]);

    // Campaign conversion counts
    const { data: leadsWithCampanha } = await supabase
      .from("leads")
      .select("campanha_id, status_lead, campanhas(nome)")
      .not("campanha_id", "is", null);

    const campConversion: Record<string, { total: number; convertidos: number; perdidos: number }> = {};
    if (leadsWithCampanha) {
      for (const l of leadsWithCampanha) {
        const name = (l as any).campanhas?.nome || "Sem nome";
        if (!campConversion[name]) campConversion[name] = { total: 0, convertidos: 0, perdidos: 0 };
        campConversion[name].total++;
        if (l.status_lead === "convertido") campConversion[name].convertidos++;
        if (l.status_lead === "perdido") campConversion[name].perdidos++;
      }
    }

    // Attempts per lead
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

    // Interactions per lead count
    const interacoesPorLead: Record<string, number> = {};
    if (interacoes) {
      for (const i of interacoes) {
        interacoesPorLead[i.lead_id] = (interacoesPorLead[i.lead_id] || 0) + 1;
      }
    }

    // Contacts mapped by lead
    const contatosPorLead: Record<string, string[]> = {};
    if (leadContatos) {
      for (const c of leadContatos) {
        if (!contatosPorLead[c.lead_id]) contatosPorLead[c.lead_id] = [];
        contatosPorLead[c.lead_id].push(`${c.tipo_contato}: ${c.valor}${c.tem_whatsapp ? " (WhatsApp)" : ""}`);
      }
    }

    // Build full leads list with enriched data
    const leadsEnriquecidos = (leadsCompletos || []).map((l: any) => ({
      nome: l.nome,
      status: l.status_lead,
      campanha: l.campanha?.nome || "-",
      responsavel: l.responsavel?.nome || "-",
      tentativas: tentativasPorLead[l.id] || 0,
      interacoes: interacoesPorLead[l.id] || 0,
      contatos: contatosPorLead[l.id]?.join("; ") || "-",
      cidade: l.cidade?.nome || "-",
      bairro: l.bairro?.nome || "-",
      rua: l.rua?.nome || "-",
      numero: l.numero_endereco || "-",
      criacao: l.data_criacao?.split("T")[0],
      atualizacao: l.updated_at?.split("T")[0],
      agendamento: l.agendamento_retorno?.split("T")[0] || "-",
      repetidor: l.repetidor || "-",
    }));

    // OS details
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

    const historicoFmt = (historicoLeads || []).slice(0, 200).map((h: any) => ({
      lead: h.leads?.nome || h.lead_id,
      evento: h.tipo_evento,
      descricao: h.descricao || "",
      data: h.data_evento,
      usuario: h.profiles?.nome || "-",
    }));

    const atrasosFmt = (atrasosData || []).slice(0, 100).map((a: any) => ({
      lead: a.leads?.nome || a.lead_id,
      colaborador: a.profiles?.nome || "-",
      tentativa: a.tentativa,
      periodo: a.periodo,
      programada: a.data_programada,
      registro: a.data_registro,
    }));

    const interacoesFmt = (interacoes || []).slice(0, 200).map((i: any) => ({
      lead_id: i.lead_id,
      tipo: i.tipo_contato,
      resultado: i.resultado || "-",
      data: i.data_interacao,
      colaborador: i.profiles?.nome || "-",
      numero: i.numero_utilizado || "-",
    }));

    const avaliacoesFmt = (avaliacoesData || []).slice(0, 100).map((a: any) => ({
      os_id: a.ordem_servico_id,
      avaliador: a.profiles?.nome || "-",
      tipo: a.tipo_avaliacao?.nome || "-",
      concluida: a.concluida,
      concluida_em: a.concluida_em || "-",
      nota: a.nota_final,
    }));

    const respostasFmt = (respostasData || []).slice(0, 200).map((r: any) => ({
      os_id: r.ordem_servico_id,
      pergunta: r.perguntas_avaliacao?.pergunta || "-",
      setor: r.perguntas_avaliacao?.setor_avaliado?.nome || "-",
      peso: r.perguntas_avaliacao?.peso || 1,
      resposta: r.resposta,
      observacao: r.observacao || "",
      avaliador: r.profiles?.nome || "-",
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

DADOS COMPLETOS DOS LEADS (últimos 500, com contatos, tentativas, interações):
${JSON.stringify(leadsEnriquecidos)}

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
${JSON.stringify(historicoFmt)}

REGISTROS DE ATRASO EM TENTATIVAS (últimos 100):
${JSON.stringify(atrasosFmt)}

AVALIAÇÕES (últimas 100):
${JSON.stringify(avaliacoesFmt)}

RESPOSTAS DE AVALIAÇÃO (últimas 200):
${JSON.stringify(respostasFmt)}
`;

    const systemPrompt = `Você é um assistente inteligente de Business Intelligence (BI) para um sistema de gestão de leads, vendas e avaliações de qualidade (OS).

Seu papel é responder perguntas de gestores sobre o desempenho do negócio e dos colaboradores com base nos dados reais do sistema.

CONTEXTO DO SISTEMA:
- Ordens de Serviço (OS) são avaliações de qualidade feitas por avaliadores sobre atendentes e técnicos
- Cada OS tem perguntas que são respondidas (sim/não/N.A.) por avaliadores de diferentes setores
- Leads passam por um funil: criação → fila → captura → tentativas de contato → conversão ou perda
- O histórico de leads registra TODAS as ações: quem visualizou, capturou, transferiu, atrasou, interagiu
- Registros de atraso mostram colaboradores que não cumpriram prazos de tentativa
- Você tem acesso aos dados completos dos leads incluindo contatos telefônicos

REGRAS DE FORMATAÇÃO:
- Sempre responda em português do Brasil
- Use os dados fornecidos para dar respostas precisas e numéricas
- Quando perguntar sobre uma pessoa, cruze os dados: OS, avaliações, histórico, interações, atrasos
- Identifique colaboradores pelos nomes que aparecem nos dados
- Quando relevante, inclua datas e horários específicos dos eventos
- Formate números grandes com separadores (ex: 1.234)
- Use emojis para destacar pontos importantes
- Use markdown para formatação (negrito, listas, tabelas quando aplicável)
- Ao falar de desempenho de alguém, mostre: notas médias, OS avaliadas, atrasos, interações realizadas

CAPACIDADES AVANÇADAS DE RELATÓRIO:
Você pode retornar dados estruturados especiais que o sistema renderiza automaticamente como tabelas, gráficos e relatórios exportáveis. Use os seguintes blocos especiais quando for relevante:

1. **TABELA DE DADOS** (renderizada como tabela interativa com exportação para Excel):
Quando quiser mostrar dados tabulares, insira um bloco assim:
\`\`\`report-table
{"title":"Título do Relatório","columns":["Coluna1","Coluna2","Coluna3"],"rows":[["valor1","valor2","valor3"],["valor4","valor5","valor6"]]}
\`\`\`

2. **GRÁFICO DE BARRAS**:
\`\`\`chart-bar
{"title":"Título","labels":["Label1","Label2"],"datasets":[{"name":"Série1","values":[10,20]}]}
\`\`\`

3. **GRÁFICO DE LINHAS**:
\`\`\`chart-line
{"title":"Título","labels":["Jan","Fev","Mar"],"datasets":[{"name":"Série1","values":[10,20,30]}]}
\`\`\`

4. **GRÁFICO DE PIZZA**:
\`\`\`chart-pie
{"title":"Título","labels":["Fatia1","Fatia2"],"values":[60,40]}
\`\`\`

QUANDO USAR DADOS ESTRUTURADOS:
- SEMPRE que listar leads, colaboradores ou dados tabulares → use report-table
- SEMPRE que comparar valores entre categorias → use chart-bar
- SEMPRE que mostrar tendências ao longo do tempo → use chart-line
- SEMPRE que mostrar distribuição/proporção → use chart-pie
- Combine texto explicativo COM os blocos de dados. Coloque análises, insights e recomendações no texto ao redor dos blocos.
- Quando o usuário pedir relatório ou análise, SEMPRE inclua pelo menos uma tabela E um gráfico.
- Os dados das tabelas devem ser completos (incluir todos os registros relevantes, não apenas exemplos).

ANÁLISE E INSIGHTS:
- Sempre identifique padrões nos dados (crescimento, queda, gargalos)
- Destaque problemas (leads sem interação, colaboradores com muitos atrasos, campanhas com baixa conversão)
- Sugira melhorias e próximos passos acionáveis
- Compare métricas quando relevante (ex: conversão entre campanhas)

${contextData}`;

    const simpleSystemPrompt = isSimpleMode
      ? systemPrompt + `\n\nMODO SIMPLES - REGRAS ADICIONAIS:
Você DEVE retornar a resposta em formato JSON válido com a seguinte estrutura:
{"texto": "Sua análise em texto aqui", "dados": [{"coluna1": "valor1", "coluna2": "valor2"}]}
- "texto" contém sua análise textual
- "dados" é um array de objetos com os dados tabulares relevantes à pergunta
- Se não houver dados tabulares, retorne "dados" como array vazio []
- NÃO use blocos de código markdown, retorne JSON puro
- Inclua o máximo de dados relevantes no array "dados"`
      : systemPrompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: simpleSystemPrompt },
          { role: "user", content: question },
        ],
        stream: !isSimpleMode,
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

    if (isSimpleMode) {
      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content || "";
      // Try to parse as JSON, otherwise return as text
      let texto = rawContent;
      let dados: any[] = [];
      try {
        // Strip markdown code fences if present
        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        texto = parsed.texto || rawContent;
        dados = Array.isArray(parsed.dados) ? parsed.dados : [];
      } catch {
        // AI didn't return valid JSON, just use the text
      }
      return new Response(JSON.stringify({ texto, dados }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
