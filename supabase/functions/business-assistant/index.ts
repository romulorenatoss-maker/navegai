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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (userRoles || []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("avaliador")) {
      return new Response(JSON.stringify({ error: "Acesso restrito a administradores e avaliadores." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, mode } = await req.json();
    if (!question) throw new Error("Question is required");
    const isSimpleMode = mode === "simple";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    // ── BATCH 1: All counts and full data queries in parallel ──
    const [
      // Leads counts
      { count: leadsTotal },
      { count: leadsHoje },
      { count: leadsNaFila },
      { count: leadsConvertidos },
      { count: leadsConvertidosHoje },
      { count: leadsPerdidos },
      // OS counts
      { count: osTotal },
      { count: osConcluidas },
      { count: osHoje },
      // Full data
      { data: campanhas },
      { data: interacoes },
      { data: tentativasData },
      { data: statusLeads },
      { data: osDetalhes },
      { data: historicoLeads },
      { data: atrasosData },
      { data: avaliacoesData },
      { data: respostasData },
      { data: leadsCompletos },
      { data: leadContatos },
      // NEW: Clientes
      { data: clientesData, count: clientesTotal },
      { data: clienteContatos },
      // NEW: Profiles (colaboradores)
      { data: profilesData },
      // NEW: Setores
      { data: setoresData },
      // NEW: Tipos de Serviço
      { data: tiposServicoData },
      // NEW: Planos
      { data: planosData },
      // NEW: Objeções de leads
      { data: objecoesData },
      // NEW: Registro de objeções
      { data: registroObjecoesData },
      // NEW: Rotina de tentativas config
      { data: rotinaTentativasData },
      // NEW: Configuração do fluxo de leads
      { data: configFluxoData },
      // NEW: Leads com convertido_por (vendas)
      { data: leadsConvertidosPorData },
    ] = await Promise.all([
      supabase.from("leads").select("*", { count: "exact", head: true }),
      supabase.from("leads").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      supabase.from("leads").select("*", { count: "exact", head: true }).in("status_lead", ["novo", "fila_captura", "reservado", "em_contato", "em_atendimento"]),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "convertido"),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "convertido").gte("updated_at", todayStart).lte("updated_at", todayEnd),
      supabase.from("leads").select("*", { count: "exact", head: true }).eq("status_lead", "perdido"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).eq("status", "concluida"),
      supabase.from("ordens_servico").select("*", { count: "exact", head: true }).gte("created_at", todayStart).lte("created_at", todayEnd),
      // Campanhas
      supabase.from("campanhas").select("id, nome, ativo"),
      // Interações
      supabase.from("lead_interacoes").select("lead_id, tipo_contato, resultado, data_interacao, colaborador_id, numero_utilizado, profiles:colaborador_id(nome)").order("data_interacao", { ascending: false }).limit(1000),
      // Tentativas
      supabase.from("lead_tarefas_contato").select("lead_id, tentativa, status, periodo, data_contato, fora_do_prazo, responsavel:responsavel_id(nome)").order("created_at", { ascending: false }).limit(1000),
      // Status leads
      supabase.from("leads").select("status_lead"),
      // OS detalhes
      supabase.from("ordens_servico").select(`
        id, numero_os, status, data_abertura, data_conclusao, cliente_nome, cliente_cpf,
        tipo_servico:tipo_servico_id(nome),
        tecnico:tecnico_id(nome),
        atendente:atendente_id(nome),
        colaborador_avaliado:colaborador_avaliado_id(nome)
      `).order("created_at", { ascending: false }).limit(500),
      // Histórico leads
      supabase.from("lead_historico").select(`
        lead_id, tipo_evento, descricao, data_evento,
        profiles:usuario_id(nome),
        leads:lead_id(nome)
      `).order("data_evento", { ascending: false }).limit(500),
      // Atrasos
      supabase.from("registro_atraso_tentativa").select(`
        lead_id, tentativa, periodo, data_programada, data_registro,
        profiles:colaborador_id(nome),
        leads:lead_id(nome)
      `).order("created_at", { ascending: false }).limit(500),
      // Avaliações
      supabase.from("avaliacoes").select(`
        id, ordem_servico_id, concluida, concluida_em, nota_final,
        profiles:avaliador_id(nome),
        tipo_avaliacao:tipo_avaliacao_id(nome)
      `).order("created_at", { ascending: false }).limit(500),
      // Respostas
      supabase.from("respostas_avaliacao").select(`
        ordem_servico_id, pergunta_id, resposta, observacao, created_at,
        profiles:avaliador_id(nome),
        perguntas_avaliacao:pergunta_id(pergunta, peso, setor_avaliado:setor_avaliado_id(nome))
      `).not("resposta", "is", null).order("created_at", { ascending: false }).limit(1000),
      // Leads completos
      supabase.from("leads").select(`
        id, nome, status_lead, data_criacao, updated_at, repetidor, origem_lead, numero_endereco, agendamento_retorno,
        campanha:campanha_id(nome),
        responsavel:responsavel_id(nome),
        convertido_por_profile:convertido_por(nome),
        convertido_registrado_por_profile:convertido_registrado_por(nome),
        cidade:cidade_id(nome),
        bairro:bairro_id(nome),
        rua:rua_id(nome),
        plano:plano_id(nome_plano),
        cliente:cliente_id(id, nome, cpf)
      `).order("created_at", { ascending: false }).limit(1000),
      // Lead contatos
      supabase.from("lead_contatos").select("lead_id, tipo_contato, valor, tem_whatsapp").limit(1000),
      // CLIENTES
      supabase.from("clientes").select(`
        id, nome, cpf, rg, nome_mae, endereco, numero, cep, cidade,
        cidade_ref:cidade_id(nome),
        bairro:bairro_id(nome),
        rua:rua_id(nome)
      `, { count: "exact" }).order("created_at", { ascending: false }).limit(1000),
      // Cliente contatos
      supabase.from("cliente_contatos").select("cliente_id, tipo, valor, tem_whatsapp").limit(1000),
      // Profiles (colaboradores)
      supabase.from("profiles").select(`
        id, nome, email, cargo, ativo, user_id,
        setor:setor_id(nome)
      `).order("nome"),
      // Setores
      supabase.from("setores").select("id, nome, descricao, ativo"),
      // Tipos de serviço
      supabase.from("tipos_servico").select("id, nome, descricao, ativo, setor:setor_id(nome)"),
      // Planos
      supabase.from("planos").select("id, nome_plano, descricao, velocidade"),
      // Objeções
      supabase.from("lead_objecoes").select("id, descricao, ativo"),
      // Registro de objeções
      supabase.from("registro_objecao_lead").select(`
        lead_id, objecao_id, data_registro,
        profiles:colaborador_id(nome),
        leads:lead_id(nome),
        objecao:objecao_id(descricao)
      `).order("created_at", { ascending: false }).limit(500),
      // Rotina tentativas
      supabase.from("rotina_tentativas_leads").select("*").order("tentativa_numero"),
      // Config fluxo
      supabase.from("configuracao_fluxo_leads").select("*").limit(1),
      // Leads convertidos com info de quem converteu
      supabase.from("leads").select(`
        id, nome, updated_at, 
        convertido_por_profile:convertido_por(nome),
        convertido_registrado_por_profile:convertido_registrado_por(nome),
        campanha:campanha_id(nome),
        plano:plano_id(nome_plano)
      `).eq("status_lead", "convertido").order("updated_at", { ascending: false }).limit(1000),
    ]);

    // ── Campaign conversion counts ──
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

    // ── Attempts per lead ──
    const tentativasPorLead: Record<string, number> = {};
    if (tentativasData) {
      for (const t of tentativasData) {
        tentativasPorLead[t.lead_id] = Math.max(tentativasPorLead[t.lead_id] || 0, t.tentativa);
      }
    }
    const totalLeadsComTentativa = Object.keys(tentativasPorLead).length;
    const somaTentativas = Object.values(tentativasPorLead).reduce((a, b) => a + b, 0);
    const mediaTentativas = totalLeadsComTentativa > 0 ? (somaTentativas / totalLeadsComTentativa).toFixed(1) : "0";

    // ── Status distribution ──
    const statusCount: Record<string, number> = {};
    if (statusLeads) {
      for (const l of statusLeads) {
        statusCount[l.status_lead] = (statusCount[l.status_lead] || 0) + 1;
      }
    }

    // ── Interaction stats ──
    const totalInteracoes = interacoes?.length || 0;
    const interacoesHoje = interacoes?.filter(i => i.data_interacao >= todayStart && i.data_interacao <= todayEnd).length || 0;

    const interacoesPorLead: Record<string, number> = {};
    if (interacoes) {
      for (const i of interacoes) {
        interacoesPorLead[i.lead_id] = (interacoesPorLead[i.lead_id] || 0) + 1;
      }
    }

    // ── Contacts mapped by lead ──
    const contatosPorLead: Record<string, string[]> = {};
    if (leadContatos) {
      for (const c of leadContatos) {
        if (!contatosPorLead[c.lead_id]) contatosPorLead[c.lead_id] = [];
        contatosPorLead[c.lead_id].push(`${c.tipo_contato}: ${c.valor}${c.tem_whatsapp ? " (WhatsApp)" : ""}`);
      }
    }

    // ── Client contacts mapped ──
    const contatosPorCliente: Record<string, string[]> = {};
    if (clienteContatos) {
      for (const c of clienteContatos) {
        if (!contatosPorCliente[c.cliente_id]) contatosPorCliente[c.cliente_id] = [];
        contatosPorCliente[c.cliente_id].push(`${c.tipo}: ${c.valor}${c.tem_whatsapp ? " (WhatsApp)" : ""}`);
      }
    }

    // ── Build enriched leads ──
    const leadsEnriquecidos = (leadsCompletos || []).map((l: any) => ({
      nome: l.nome,
      status: l.status_lead,
      campanha: l.campanha?.nome || "-",
      responsavel: l.responsavel?.nome || "-",
      convertido_por: l.convertido_por_profile?.nome || "-",
      registrado_por: l.convertido_registrado_por_profile?.nome || "-",
      plano: l.plano?.nome_plano || "-",
      cliente_vinculado: l.cliente?.nome || "-",
      cliente_cpf: l.cliente?.cpf || "-",
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
      origem: l.origem_lead || "-",
    }));

    // Helpers de mascaramento de PII (CPF/RG/telefones/nome da mãe não são enviados em claro ao AI)
    const maskCpf = (v?: string | null) => {
      if (!v) return "-";
      const d = String(v).replace(/\D/g, "");
      if (d.length < 4) return "***";
      return `***.***.***-${d.slice(-2)}`;
    };
    const maskDoc = (v?: string | null) => (v ? "***" : "-");
    const maskPhone = (v?: string | null) => {
      if (!v) return "-";
      const d = String(v).replace(/\D/g, "");
      return d.length >= 4 ? `****${d.slice(-4)}` : "****";
    };
    const maskContato = (raw: string) => {
      // raw is "tipo: valor (WhatsApp)" — mask the valor portion
      const m = raw.match(/^([^:]+):\s*(.*)$/);
      if (!m) return "***";
      const [, tipo, rest] = m;
      const isPhoneish = /telefone|celular|whats|fone|tel/i.test(tipo);
      const valuePart = rest.replace(/\s*\(WhatsApp\)$/i, "");
      const masked = isPhoneish ? maskPhone(valuePart) : "***";
      return `${tipo}: ${masked}${/\(WhatsApp\)$/i.test(rest) ? " (WhatsApp)" : ""}`;
    };

    // ── Build enriched clientes (PII redacted before sending to AI) ──
    const clientesEnriquecidos = (clientesData || []).map((c: any) => ({
      nome: c.nome,
      cpf: maskCpf(c.cpf),
      rg: maskDoc(c.rg),
      nome_mae: maskDoc(c.nome_mae),
      endereco: c.endereco || "-",
      numero: c.numero || "-",
      cep: c.cep || "-",
      cidade: c.cidade_ref?.nome || c.cidade || "-",
      bairro: c.bairro?.nome || "-",
      rua: c.rua?.nome || "-",
      contatos: (contatosPorCliente[c.id] || []).map(maskContato).join("; ") || "-",
    }));

    // ── Vendas (leads convertidos) ──
    const vendasFmt = (leadsConvertidosPorData || []).map((l: any) => ({
      lead: l.nome,
      convertido_por: l.convertido_por_profile?.nome || "-",
      registrado_por: l.convertido_registrado_por_profile?.nome || "-",
      campanha: l.campanha?.nome || "-",
      plano: l.plano?.nome_plano || "-",
      data_conversao: l.updated_at?.split("T")[0] || "-",
    }));

    // ── Colaboradores (profiles) ──
    const colaboradoresFmt = (profilesData || []).map((p: any) => ({
      nome: p.nome,
      email: p.email,
      cargo: p.cargo || "-",
      setor: p.setor?.nome || "-",
      ativo: p.ativo ? "Sim" : "Não",
    }));

    // ── Colaborador performance: interações, conversões, atrasos ──
    const perfPorColaborador: Record<string, { interacoes: number; conversoes: number; atrasos: number }> = {};
    if (interacoes) {
      for (const i of interacoes) {
        const nome = (i as any).profiles?.nome || i.colaborador_id;
        if (!perfPorColaborador[nome]) perfPorColaborador[nome] = { interacoes: 0, conversoes: 0, atrasos: 0 };
        perfPorColaborador[nome].interacoes++;
      }
    }
    if (leadsConvertidosPorData) {
      for (const l of leadsConvertidosPorData) {
        const nome = (l as any).convertido_por_profile?.nome;
        if (nome) {
          if (!perfPorColaborador[nome]) perfPorColaborador[nome] = { interacoes: 0, conversoes: 0, atrasos: 0 };
          perfPorColaborador[nome].conversoes++;
        }
      }
    }
    if (atrasosData) {
      for (const a of atrasosData) {
        const nome = (a as any).profiles?.nome || "-";
        if (nome !== "-") {
          if (!perfPorColaborador[nome]) perfPorColaborador[nome] = { interacoes: 0, conversoes: 0, atrasos: 0 };
          perfPorColaborador[nome].atrasos++;
        }
      }
    }

    // ── OS details ──
    const osDetalhesFmt = (osDetalhes || []).map((os: any) => ({
      numero: os.numero_os || "S/N",
      status: os.status,
      abertura: os.data_abertura?.split("T")[0],
      conclusao: os.data_conclusao?.split("T")[0] || "-",
      cliente: os.cliente_nome || "-",
      cpf: os.cliente_cpf || "-",
      tecnico: os.tecnico?.nome || "-",
      atendente: os.atendente?.nome || "-",
      avaliado: os.colaborador_avaliado?.nome || "-",
      servico: os.tipo_servico?.nome || "-",
    }));

    const historicoFmt = (historicoLeads || []).slice(0, 300).map((h: any) => ({
      lead: h.leads?.nome || h.lead_id,
      evento: h.tipo_evento,
      descricao: h.descricao || "",
      data: h.data_evento,
      usuario: h.profiles?.nome || "-",
    }));

    const atrasosFmt = (atrasosData || []).map((a: any) => ({
      lead: a.leads?.nome || a.lead_id,
      colaborador: a.profiles?.nome || "-",
      tentativa: a.tentativa,
      periodo: a.periodo,
      programada: a.data_programada,
      registro: a.data_registro,
    }));

    const interacoesFmt = (interacoes || []).slice(0, 500).map((i: any) => ({
      lead_id: i.lead_id,
      tipo: i.tipo_contato,
      resultado: i.resultado || "-",
      data: i.data_interacao,
      colaborador: i.profiles?.nome || "-",
      numero: i.numero_utilizado || "-",
    }));

    const avaliacoesFmt = (avaliacoesData || []).map((a: any) => ({
      os_id: a.ordem_servico_id,
      avaliador: a.profiles?.nome || "-",
      tipo: a.tipo_avaliacao?.nome || "-",
      concluida: a.concluida,
      concluida_em: a.concluida_em || "-",
      nota: a.nota_final,
    }));

    const respostasFmt = (respostasData || []).slice(0, 500).map((r: any) => ({
      os_id: r.ordem_servico_id,
      pergunta: r.perguntas_avaliacao?.pergunta || "-",
      setor: r.perguntas_avaliacao?.setor_avaliado?.nome || "-",
      peso: r.perguntas_avaliacao?.peso || 1,
      resposta: r.resposta,
      observacao: r.observacao || "",
      avaliador: r.profiles?.nome || "-",
      data: r.created_at,
    }));

    const objecoesFmt = (registroObjecoesData || []).map((r: any) => ({
      lead: r.leads?.nome || r.lead_id,
      objecao: r.objecao?.descricao || "-",
      colaborador: r.profiles?.nome || "-",
      data: r.data_registro,
    }));

    // ── Tarefas de contato com detalhes ──
    const tarefasFmt = (tentativasData || []).slice(0, 500).map((t: any) => ({
      lead_id: t.lead_id,
      tentativa: t.tentativa,
      status: t.status,
      periodo: t.periodo,
      data_contato: t.data_contato,
      fora_do_prazo: t.fora_do_prazo,
      responsavel: t.responsavel?.nome || "-",
    }));

    // ── Build context ──
    const contextData = `
DADOS DO SISTEMA EM TEMPO REAL (${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}):

═══════════════════════════════════════
RESUMO GERAL
═══════════════════════════════════════
- Total de Leads: ${leadsTotal || 0}
- Leads criados hoje: ${leadsHoje || 0}
- Leads na fila (ativos): ${leadsNaFila || 0}
- Leads convertidos (vendas) total: ${leadsConvertidos || 0}
- Leads convertidos hoje (vendas hoje): ${leadsConvertidosHoje || 0}
- Leads perdidos: ${leadsPerdidos || 0}
- Média de tentativas por lead: ${mediaTentativas}
- Total de clientes cadastrados: ${clientesTotal || 0}
- Total de OS: ${osTotal || 0}
- OS concluídas: ${osConcluidas || 0}
- OS criadas hoje: ${osHoje || 0}
- Total de interações: ${totalInteracoes}
- Interações hoje: ${interacoesHoje}
- Distribuição de leads por status: ${JSON.stringify(statusCount)}

═══════════════════════════════════════
COLABORADORES (${colaboradoresFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(colaboradoresFmt)}

PERFORMANCE POR COLABORADOR (interações, conversões, atrasos):
${JSON.stringify(perfPorColaborador)}

═══════════════════════════════════════
SETORES
═══════════════════════════════════════
${JSON.stringify(setoresData || [])}

═══════════════════════════════════════
TIPOS DE SERVIÇO
═══════════════════════════════════════
${JSON.stringify((tiposServicoData || []).map((t: any) => ({ nome: t.nome, descricao: t.descricao, ativo: t.ativo, setor: t.setor?.nome || "-" })))}

═══════════════════════════════════════
PLANOS DISPONÍVEIS
═══════════════════════════════════════
${JSON.stringify(planosData || [])}

═══════════════════════════════════════
CAMPANHAS (ativas e inativas)
═══════════════════════════════════════
${JSON.stringify(campanhas || [])}
CONVERSÃO POR CAMPANHA: ${JSON.stringify(campConversion)}

═══════════════════════════════════════
CONFIGURAÇÃO DO FLUXO DE LEADS
═══════════════════════════════════════
${JSON.stringify(configFluxoData || [])}

ROTINA DE TENTATIVAS:
${JSON.stringify(rotinaTentativasData || [])}

═══════════════════════════════════════
OBJEÇÕES CADASTRADAS
═══════════════════════════════════════
${JSON.stringify(objecoesData || [])}

═══════════════════════════════════════
VENDAS (LEADS CONVERTIDOS) - ${vendasFmt.length} registros
═══════════════════════════════════════
${JSON.stringify(vendasFmt)}

═══════════════════════════════════════
LEADS COMPLETOS (${leadsEnriquecidos.length} registros com contatos, tentativas, interações, plano, cliente vinculado)
═══════════════════════════════════════
${JSON.stringify(leadsEnriquecidos)}

═══════════════════════════════════════
CLIENTES CADASTRADOS (${clientesEnriquecidos.length} registros com contatos e endereço)
═══════════════════════════════════════
${JSON.stringify(clientesEnriquecidos)}

═══════════════════════════════════════
ORDENS DE SERVIÇO (${osDetalhesFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(osDetalhesFmt)}

═══════════════════════════════════════
AVALIAÇÕES (${avaliacoesFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(avaliacoesFmt)}

═══════════════════════════════════════
RESPOSTAS DE AVALIAÇÃO (${respostasFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(respostasFmt)}

═══════════════════════════════════════
INTERAÇÕES COM LEADS (${interacoesFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(interacoesFmt)}

═══════════════════════════════════════
TAREFAS DE CONTATO (${tarefasFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(tarefasFmt)}

═══════════════════════════════════════
HISTÓRICO DE LEADS (${historicoFmt.length} eventos)
═══════════════════════════════════════
${JSON.stringify(historicoFmt)}

═══════════════════════════════════════
REGISTROS DE ATRASO (${atrasosFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(atrasosFmt)}

═══════════════════════════════════════
REGISTROS DE OBJEÇÃO (${objecoesFmt.length} registros)
═══════════════════════════════════════
${JSON.stringify(objecoesFmt)}
`;

    const systemPrompt = `Você é a Naví, uma assistente inteligente de Business Intelligence (BI) para um sistema completo de gestão de leads, vendas, clientes e avaliações de qualidade.

CONTEXTO DO SISTEMA:
- LEADS = potenciais clientes que passam por um funil: criação → fila → captura → tentativas de contato → conversão (venda) ou perda
- VENDAS = leads com status "convertido". O campo "convertido_por" indica quem fez a venda. Venda = conversão de lead.
- CLIENTES = pessoas cadastradas no sistema, podem estar vinculados a leads e/ou OS via CPF ou cliente_id
- ORDENS DE SERVIÇO (OS) = avaliações de qualidade sobre atendentes e técnicos
- COLABORADORES = todos os usuários do sistema (perfis), com cargo e setor
- CAMPANHAS = origens dos leads (Instagram, Google, Indicação, etc.)
- PLANOS = planos de internet oferecidos aos clientes
- OBJEÇÕES = motivos pelos quais leads não convertem

REGRAS IMPORTANTES:
1. NUNCA assuma que dados não existem sem verificar nos dados fornecidos
2. SEMPRE use os dados reais fornecidos para responder
3. Quando o usuário perguntar sobre "vendas", considere leads convertidos
4. Quando perguntar sobre "clientes", busque na tabela de clientes E nos leads vinculados
5. Cruze dados entre tabelas: um cliente pode ter leads, OS, e contatos em diferentes tabelas
6. Identifique colaboradores pelos nomes nos dados (profiles)
7. Para performance de colaboradores, cruze: interações, conversões (vendas), atrasos, avaliações
8. Se a pergunta é genérica ("como está o sistema?"), forneça visão geral de TODAS as áreas

REGRAS DE FORMATAÇÃO:
- Responda sempre em português do Brasil
- Use dados precisos e numéricos
- Formate números grandes com separadores (ex: 1.234)
- Use emojis para destacar pontos
- Use markdown (negrito, listas, tabelas)
- Quando relevante, inclua datas e horários

CAPACIDADES DE RELATÓRIO (use blocos especiais que o sistema renderiza automaticamente):

1. **TABELA** (renderizada como tabela interativa com exportação Excel):
\`\`\`report-table
{"title":"Título","columns":["Col1","Col2"],"rows":[["v1","v2"]]}
\`\`\`

2. **GRÁFICO DE BARRAS**:
\`\`\`chart-bar
{"title":"Título","labels":["L1","L2"],"datasets":[{"name":"Série","values":[10,20]}]}
\`\`\`

3. **GRÁFICO DE LINHAS**:
\`\`\`chart-line
{"title":"Título","labels":["Jan","Fev"],"datasets":[{"name":"Série","values":[10,20]}]}
\`\`\`

4. **GRÁFICO DE PIZZA**:
\`\`\`chart-pie
{"title":"Título","labels":["A","B"],"values":[60,40]}
\`\`\`

QUANDO USAR:
- Listagem de dados → report-table (SEMPRE com TODOS os registros relevantes)
- Comparação entre categorias → chart-bar
- Tendências no tempo → chart-line
- Distribuição/proporção → chart-pie
- Em relatórios, SEMPRE inclua pelo menos uma tabela E um gráfico
- Combine texto explicativo com blocos de dados

ANÁLISE:
- Identifique padrões (crescimento, queda, gargalos)
- Destaque problemas (leads parados, colaboradores com atrasos, campanhas com baixa conversão)
- Sugira melhorias acionáveis
- Compare métricas quando relevante

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
        model: "google/gemini-2.5-flash",
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
      let texto = rawContent;
      let dados: any[] = [];
      try {
        const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        texto = parsed.texto || rawContent;
        dados = Array.isArray(parsed.dados) ? parsed.dados : [];
      } catch { /* AI didn't return valid JSON */ }
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
