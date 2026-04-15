import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const dayOfWeek = today.getDay();
    const dayOfMonth = today.getDate();

    const { data: templates, error: tplErr } = await supabase
      .from("operational_templates")
      .select("*")
      .eq("ativo", true);

    if (tplErr) throw tplErr;

    let created = 0;
    let skipped = 0;

    for (const t of templates || []) {
      // Check date range
      if (t.data_inicio && todayStr < t.data_inicio) { skipped++; continue; }
      if (t.data_fim && todayStr > t.data_fim) { skipped++; continue; }

      let shouldGenerate = false;

      switch (t.recorrencia_tipo) {
        case "unica":
          if (t.data_inicio === todayStr) shouldGenerate = true;
          break;
        case "diaria":
          shouldGenerate = true;
          break;
        case "semanal": {
          const dias = t.dias_da_semana || [1, 2, 3, 4, 5];
          shouldGenerate = dias.includes(dayOfWeek);
          break;
        }
        case "mensal":
          shouldGenerate = (t.dia_fixo_mes || 1) === dayOfMonth;
          break;
        case "personalizada": {
          const dias = t.dias_da_semana;
          if (dias && dias.length > 0) {
            shouldGenerate = dias.includes(dayOfWeek);
          } else {
            const interval = t.intervalo_dias || 1;
            if (t.data_inicio) {
              const start = new Date(t.data_inicio + "T00:00:00Z");
              const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
              shouldGenerate = diffDays >= 0 && diffDays % interval === 0;
            } else {
              shouldGenerate = true;
            }
          }
          break;
        }
      }

      if (!shouldGenerate) { skipped++; continue; }

      // Resolve executor
      const executorId = t.executor_profile_id || t.responsavel_id;
      if (!executorId) { skipped++; continue; }

      // Check uniqueness
      const { data: existing } = await supabase
        .from("operational_assignments")
        .select("id")
        .eq("template_id", t.id)
        .eq("data_prevista", todayStr)
        .eq("responsavel_id", executorId)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // === BUILD SNAPSHOT v5.1 ===
      const { data: sections } = await supabase
        .from("operational_template_sections")
        .select("*")
        .eq("template_id", t.id)
        .order("ordem");

      const { data: fields } = await supabase
        .from("operational_template_fields")
        .select("*")
        .eq("template_id", t.id)
        .order("ordem");

      const snapshot = {
        versao: t.versao || 1,
        nome: t.nome,
        descricao: t.descricao,
        sla_horas: t.sla_horas || 24,
        permite_devolucao_parcial: t.permite_devolucao_parcial || false,
        requer_aprovacao_gestor: t.requer_aprovacao_gestor || false,
        bloquear_fechamento_com_contingencia: t.bloquear_fechamento_com_contingencia || false,
        gerar_contingencia_automatica: t.gerar_contingencia_automatica || false,
        peso_recorrencia: t.peso_recorrencia || 1.0,
        modo_pontuacao: t.modo_pontuacao,
        destino_score: t.destino_score,
        horario_inicio_previsto: t.horario_inicio_previsto,
        horario_limite_execucao: t.horario_limite_execucao,
        tolerancia_minutos: t.tolerancia_minutos || 0,
        responsaveis: {
          executor_profile_id: t.executor_profile_id || null,
          executor_setor_id: t.executor_setor_id || null,
          avaliador_profile_id: t.avaliador_profile_id || null,
          avaliador_setor_id: t.avaliador_setor_id || null,
          avaliado_profile_id: t.avaliado_profile_id || null,
          avaliado_setor_id: t.avaliado_setor_id || null,
          aprovador_profile_id: t.aprovador_profile_id || null,
          aprovador_setor_id: t.aprovador_setor_id || null,
          validador_contingencia_profile_id: t.validador_contingencia_profile_id || null,
          validador_contingencia_setor_id: t.validador_contingencia_setor_id || null,
        },
        sections: (sections || []).map((s: any) => ({
          id: s.id,
          nome: s.nome,
          descricao: s.descricao,
          peso: s.peso,
          ordem: s.ordem,
          cor: s.cor,
        })),
        fields: (fields || []).map((f: any) => ({
          id: f.id,
          section_id: f.section_id,
          label: f.label,
          descricao: f.descricao,
          tipo: f.tipo,
          ordem: f.ordem,
          obrigatorio: f.obrigatorio,
          peso: f.peso,
          nota_maxima: f.nota_maxima,
          penalidade_reprovacao: f.penalidade_reprovacao,
          impacta_score: f.impacta_score,
          criticidade: f.criticidade,
          gera_contingencia: f.gera_contingencia,
          exige_evidencia: f.exige_evidencia,
          tipo_evidencia: f.tipo_evidencia,
          opcoes: f.opcoes,
          condicao_visibilidade: f.condicao_visibilidade,
          validacao: f.validacao,
          formula: f.formula,
          visivel_para: f.visivel_para,
          editavel_por: f.editavel_por,
        })),
      };

      const { error: insErr } = await supabase
        .from("operational_assignments")
        .insert({
          template_id: t.id,
          responsavel_id: executorId,
          avaliador_id: t.avaliador_profile_id || null,
          avaliado_id: t.avaliado_profile_id || null,
          aprovador_id: t.aprovador_profile_id || null,
          validador_contingencia_id: t.validador_contingencia_profile_id || null,
          setor_executor_id: t.executor_setor_id || t.setor_id || null,
          setor_avaliador_id: t.avaliador_setor_id || null,
          setor_avaliado_id: t.avaliado_setor_id || null,
          data_prevista: todayStr,
          horario_inicio_previsto: t.horario_inicio_previsto || null,
          horario_limite: t.horario_limite_execucao || null,
          status: "pendente",
          template_versao: t.versao || 1,
          template_snapshot: snapshot,
          rodada_atual: 1,
        });

      if (insErr) {
        console.error(`Error creating assignment for template ${t.id}:`, insErr.message);
        skipped++;
      } else {
        created++;
      }
    }

    return new Response(JSON.stringify({ ok: true, created, skipped, date: todayStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-daily-assignments error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
