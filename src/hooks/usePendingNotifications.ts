import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PendingCounts {
  pendingEvaluations: number;
  pendingLeadDecisions: number;
  pendingMyLeads: number;
}

export function usePendingNotifications() {
  const { profile, isAdmin } = useAuth();
  const [counts, setCounts] = useState<PendingCounts>({ pendingEvaluations: 0, pendingLeadDecisions: 0, pendingMyLeads: 0 });

  const fetchCounts = useCallback(async () => {
    if (!profile) return;

    try {
      // 1. Pending evaluations count (OS with unanswered questions for this user's sectors)
      const { data: sectorLinks } = await supabase
        .from("colaborador_setores").select("setor_id").eq("profile_id", profile.id);
      let mySetorIds = sectorLinks?.map(l => l.setor_id) || [];
      if (mySetorIds.length === 0 && profile.setor_id) mySetorIds = [profile.setor_id];

      let pendingEvaluations = 0;

      if (mySetorIds.length > 0 || isAdmin) {
        const { data: openOS } = await supabase
          .from("ordens_servico")
          .select("id")
          .in("status", ["aberta", "em_andamento"]);

        if (openOS?.length) {
          const osIds = openOS.map(o => o.id);

          const [osPerguntasRes, avalsRes, respostasRes] = await Promise.all([
            (supabase as any).from("os_perguntas").select("os_id, pergunta_id").in("os_id", osIds),
            supabase.from("avaliacoes").select("ordem_servico_id, avaliador_id, concluida").in("ordem_servico_id", osIds),
            supabase.from("respostas_avaliacao").select("ordem_servico_id, pergunta_id").in("ordem_servico_id", osIds).not("resposta", "is", null),
          ]);

          const perguntasByOS: Record<string, string[]> = {};
          ((osPerguntasRes as any).data || []).forEach((op: any) => {
            if (!perguntasByOS[op.os_id]) perguntasByOS[op.os_id] = [];
            perguntasByOS[op.os_id].push(op.pergunta_id);
          });

          const allPerguntaIds = [...new Set(Object.values(perguntasByOS).flat())];
          let perguntaSetorMap: Record<string, string | null> = {};
          if (allPerguntaIds.length > 0) {
            const { data: perguntasData } = await supabase
              .from("perguntas_avaliacao")
              .select("id, setor_avaliado_id")
              .in("id", allPerguntaIds);
            (perguntasData || []).forEach(p => { perguntaSetorMap[p.id] = p.setor_avaliado_id; });
          }

          const allAvals = avalsRes.data || [];
          const answeredSet = new Set(((respostasRes as any).data || []).map((r: any) => `${r.ordem_servico_id}:${r.pergunta_id}`));

          for (const os of openOS) {
            const osPerguntaIds = perguntasByOS[os.id] || [];
            if (osPerguntaIds.length === 0) continue;

            const myQuestions = isAdmin ? osPerguntaIds : osPerguntaIds.filter(pid => {
              const setorId = perguntaSetorMap[pid];
              return !setorId || mySetorIds.includes(setorId);
            });

            const myAval = allAvals.find(a => a.ordem_servico_id === os.id && a.avaliador_id === profile.id);
            const myUnanswered = myQuestions.filter(pid => !answeredSet.has(`${os.id}:${pid}`));
            const myPartDone = myAval?.concluida === true || myUnanswered.length === 0;

            if (!myPartDone) pendingEvaluations++;
          }
        }
      }

      // 2. Leads awaiting evaluator decision (for avaliador/admin of setor atendimento)
      let pendingLeadDecisions = 0;
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .in("status_lead", ["aguardando_decisao_avaliador", "cancelado_pendente_analise"]);
      pendingLeadDecisions = count || 0;

      // 3. My leads with pending tasks for today (assigned to me, with overdue or today's tasks)
      let pendingMyLeads = 0;
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      
      const { count: myLeadTasksCount } = await supabase
        .from("lead_tarefas_contato")
        .select("id", { count: "exact", head: true })
        .eq("responsavel_id", profile.id)
        .eq("status", "pendente")
        .lte("data_contato", endOfToday);
      pendingMyLeads = myLeadTasksCount || 0;

      setCounts({ pendingEvaluations, pendingLeadDecisions, pendingMyLeads });
    } catch (err) {
      console.error("Error fetching pending notifications:", err);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    fetchCounts();

    // Refresh every 30 seconds
    const interval = setInterval(fetchCounts, 30000);

    // Listen for realtime changes on key tables
    const channel = supabase
      .channel('pending-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'respostas_avaliacao' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avaliacoes' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, fetchCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_tarefas_contato' }, fetchCounts)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchCounts]);

  return counts;
}
