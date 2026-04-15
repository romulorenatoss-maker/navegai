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

      // Resolve executor: profile > setor member > responsavel_id
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
