import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay } from "date-fns";
import { useMemo } from "react";

export interface OperationalDashboardFilters {
  startDate: Date;
  endDate: Date;
  templateId?: string;
  setorId?: string;
  executorId?: string;
  avaliadoId?: string;
  avaliadorId?: string;
}

const QUERY_LIMIT = 2000;

export function useOperationalDashboard(filters: OperationalDashboardFilters) {
  const start = startOfDay(filters.startDate).toISOString();
  const end = endOfDay(filters.endDate).toISOString();

  // ── Assignments in period ──
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["op-dash-assignments", start, end, filters.templateId, filters.setorId, filters.executorId, filters.avaliadoId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("operational_assignments")
        .select(`
          id, status, data_prevista, inicio_em, fim_em, score_executor, score_avaliado, score_avaliador,
          score_final_ajustado, template_id, responsavel_id, avaliado_id, avaliador_id,
          setor_executor_id, setor_avaliado_id, rodada_atual,
          template:operational_templates!operational_assignments_template_id_fkey(id, nome)
        `)
        .gte("data_prevista", start.slice(0, 10))
        .lte("data_prevista", end.slice(0, 10))
        .limit(QUERY_LIMIT);

      if (filters.templateId) q = q.eq("template_id", filters.templateId);
      if (filters.setorId) q = q.or(`setor_executor_id.eq.${filters.setorId},setor_avaliado_id.eq.${filters.setorId}`);
      if (filters.executorId) q = q.eq("responsavel_id", filters.executorId);
      if (filters.avaliadoId) q = q.eq("avaliado_id", filters.avaliadoId);
      if (filters.avaliadorId) q = q.eq("avaliador_id", filters.avaliadorId);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  // Derive assignment IDs for filtering contingencies and reviews
  const assignmentIds: string[] = useMemo(() => assignments.map((a: any) => a.id), [assignments]);

  // ── Contingencies filtered by assignment scope ──
  const { data: contingencies = [], isLoading: loadingContingencies } = useQuery({
    queryKey: ["op-dash-contingencies", start, end, assignmentIds],
    queryFn: async () => {
      if (assignmentIds.length === 0) return [];

      // Supabase .in() has a practical limit; batch if needed
      const batches: any[] = [];
      const BATCH_SIZE = 200;
      for (let i = 0; i < assignmentIds.length; i += BATCH_SIZE) {
        const batch = assignmentIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await (supabase as any)
          .from("operational_contingencies")
          .select(`
            id, status, created_at, prazo_sla, resolvida_em, responsavel_id, assignment_id,
            assignment:operational_assignments!operational_contingencies_assignment_id_fkey(
              template_id, setor_executor_id, setor_avaliado_id, responsavel_id, avaliado_id,
              template:operational_templates!operational_assignments_template_id_fkey(id, nome)
            )
          `)
          .in("assignment_id", batch)
          .limit(QUERY_LIMIT);
        if (error) throw error;
        if (data) batches.push(...data);
      }
      return batches;
    },
    enabled: !loadingAssignments,
    staleTime: 30000,
  });

  // ── Field reviews filtered by assignment scope ──
  const { data: fieldReviews = [], isLoading: loadingReviews } = useQuery({
    queryKey: ["op-dash-reviews", start, end, assignmentIds],
    queryFn: async () => {
      if (assignmentIds.length === 0) return [];

      const batches: any[] = [];
      const BATCH_SIZE = 200;
      for (let i = 0; i < assignmentIds.length; i += BATCH_SIZE) {
        const batch = assignmentIds.slice(i, i + BATCH_SIZE);
        const { data, error } = await (supabase as any)
          .from("operational_field_reviews")
          .select(`
            id, conforme, field_id, assignment_id, rodada,
            field:operational_template_fields!operational_field_reviews_field_id_fkey(id, label, template_id),
            assignment:operational_assignments!operational_field_reviews_assignment_id_fkey(
              template_id, setor_avaliado_id,
              template:operational_templates!operational_assignments_template_id_fkey(id, nome)
            )
          `)
          .in("assignment_id", batch)
          .limit(QUERY_LIMIT);
        if (error) throw error;
        if (data) batches.push(...data);
      }
      return batches;
    },
    enabled: !loadingAssignments,
    staleTime: 30000,
  });

  // ── Templates list for filter ──
  const { data: templates = [] } = useQuery({
    queryKey: ["op-templates-list"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operational_templates")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Setores list for filter ──
  const { data: setores = [] } = useQuery({
    queryKey: ["op-setores-list"],
    queryFn: async () => {
      const { data } = await supabase.from("setores").select("id, nome").order("nome");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Profiles list for filter ──
  const { data: profiles = [] } = useQuery({
    queryKey: ["op-profiles-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = assignments.length;
    const concluidos = assignments.filter((a: any) => ["concluida", "aprovada", "encerrada"].includes(a.status));
    const taxaConclusao = total > 0 ? Math.round((concluidos.length / total) * 100) : 0;

    // Score médio (usar score_final_ajustado quando disponível)
    const scored = concluidos.filter((a: any) => a.score_final_ajustado != null);
    const scoreMedio = scored.length > 0
      ? Math.round(scored.reduce((s: number, a: any) => s + Number(a.score_final_ajustado), 0) / scored.length)
      : null;

    // Conformidade: % de reviews conformes
    const totalReviews = fieldReviews.filter((r: any) => r.conforme != null).length;
    const conformes = fieldReviews.filter((r: any) => r.conforme === true).length;
    const taxaConformidade = totalReviews > 0 ? Math.round((conformes / totalReviews) * 100) : null;

    // Contingencies – exclude descartada from metric counts
    const activeContingencies = contingencies.filter((c: any) => c.status !== "descartada");
    const totalContingencias = activeContingencies.length;
    const vencidas = activeContingencies.filter((c: any) => {
      if (["validada", "resolvida"].includes(c.status)) return false;
      if (!c.prazo_sla) return false;
      return new Date(c.prazo_sla).getTime() < Date.now();
    }).length;

    // MTTR – only resolved/validated, NOT descartada
    const resolvedWithTime = contingencies.filter((c: any) =>
      c.resolvida_em && c.created_at && !["descartada"].includes(c.status)
    );
    const mttrHours = resolvedWithTime.length > 0
      ? Math.round(resolvedWithTime.reduce((s: number, c: any) => {
          const diff = new Date(c.resolvida_em).getTime() - new Date(c.created_at).getTime();
          return s + diff / (1000 * 60 * 60);
        }, 0) / resolvedWithTime.length)
      : null;

    // SLA compliance – exclude descartada
    const withSla = activeContingencies.filter((c: any) => c.prazo_sla);
    const slaOk = withSla.filter((c: any) => {
      if (!c.resolvida_em) return !c.prazo_sla || new Date(c.prazo_sla).getTime() > Date.now();
      return new Date(c.resolvida_em).getTime() <= new Date(c.prazo_sla).getTime();
    }).length;
    const slaMedio = withSla.length > 0 ? Math.round((slaOk / withSla.length) * 100) : null;

    return {
      total, concluidos: concluidos.length, taxaConclusao,
      scoreMedio, taxaConformidade,
      totalContingencias, vencidas,
      mttrHours, slaMedio,
    };
  }, [assignments, contingencies, fieldReviews]);

  // ── Chart: Score evolution by date ──
  const scoreEvolution = useMemo(() => {
    const byDate: Record<string, { sum: number; count: number }> = {};
    assignments.forEach((a: any) => {
      if (a.score_final_ajustado == null) return;
      const d = a.data_prevista;
      if (!byDate[d]) byDate[d] = { sum: 0, count: 0 };
      byDate[d].sum += Number(a.score_final_ajustado);
      byDate[d].count += 1;
    });
    return Object.entries(byDate)
      .map(([date, v]) => ({ date, media: Math.round(v.sum / v.count) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [assignments]);

  // ── Chart: Contingencies by status ──
  const contingenciesByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    contingencies.forEach((c: any) => {
      counts[c.status] = (counts[c.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [contingencies]);

  // ── Chart: Performance by template ──
  const performanceByTemplate = useMemo(() => {
    const byTemplate: Record<string, { nome: string; sum: number; count: number; scored: number; planos de ação: number }> = {};
    assignments.forEach((a: any) => {
      const tid = a.template_id;
      const name = a.template?.nome || "—";
      if (!byTemplate[tid]) byTemplate[tid] = { nome: name, sum: 0, count: 0, scored: 0, planos de ação: 0 };
      byTemplate[tid].count += 1;
      if (a.score_final_ajustado != null) {
        byTemplate[tid].sum += Number(a.score_final_ajustado);
        byTemplate[tid].scored += 1;
      }
    });
    contingencies.forEach((c: any) => {
      const tid = c.assignment?.template_id;
      if (tid && byTemplate[tid]) byTemplate[tid].planos de ação += 1;
    });
    return Object.values(byTemplate)
      .map((v) => ({ ...v, media: v.scored > 0 ? Math.round(v.sum / v.scored) : null }))
      .sort((a, b) => (b.media ?? -1) - (a.media ?? -1));
  }, [assignments, contingencies]);

  // ── Non-conformity analysis: top rejected fields ──
  const topRejectedFields = useMemo(() => {
    const byField: Record<string, { label: string; template: string; count: number }> = {};
    fieldReviews.filter((r: any) => r.conforme === false).forEach((r: any) => {
      const key = r.field_id;
      if (!byField[key]) byField[key] = {
        label: r.field?.label || "—",
        template: r.assignment?.template?.nome || "—",
        count: 0,
      };
      byField[key].count += 1;
    });
    return Object.values(byField).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [fieldReviews]);

  // ── Templates with most contingencies ──
  const templatesWithMostContingencies = useMemo(() => {
    const byTemplate: Record<string, { nome: string; count: number }> = {};
    contingencies.forEach((c: any) => {
      const nome = c.assignment?.template?.nome || "—";
      const tid = c.assignment?.template?.id || "unknown";
      if (!byTemplate[tid]) byTemplate[tid] = { nome, count: 0 };
      byTemplate[tid].count += 1;
    });
    return Object.values(byTemplate).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [contingencies]);

  return {
    kpis,
    scoreEvolution,
    contingenciesByStatus,
    performanceByTemplate,
    topRejectedFields,
    templatesWithMostContingencies,
    templates,
    setores,
    profiles,
    isLoading: loadingAssignments || loadingContingencies || loadingReviews,
    queryLimit: QUERY_LIMIT,
    assignmentCount: assignments.length,
  };
}
