import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { useMemo } from "react";

export type RankingRole = "executor" | "avaliado" | "avaliador";
export type RankingPeriod = "hoje" | "semana" | "mes" | "trimestre" | "custom";

export interface RankingFilters {
  role: RankingRole;
  period: RankingPeriod;
  customStart?: Date;
  customEnd?: Date;
  minEvaluations: number;
}

export interface RankedCollaborator {
  profileId: string;
  nome: string;
  scoreMedio: number;
  totalAvaliacoes: number;
  contingencias: number;
  slaMedio: number | null;
  tendencia: "up" | "down" | "stable" | null;
  ultimaAvaliacao: string | null;
  eligible: boolean;
  // drill-down data
  scoreLogs: any[];
}

function getDateRange(period: RankingPeriod, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case "hoje": return { start: startOfDay(now), end: endOfDay(now) };
    case "semana": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "mes": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "trimestre": return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
    case "custom": return {
      start: customStart ? startOfDay(customStart) : startOfMonth(now),
      end: customEnd ? endOfDay(customEnd) : endOfMonth(now),
    };
  }
}

// Previous period for trend calculation
function getPrevDateRange(period: RankingPeriod, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  const current = getDateRange(period, customStart, customEnd);
  const duration = current.end.getTime() - current.start.getTime();
  return {
    start: new Date(current.start.getTime() - duration),
    end: new Date(current.start.getTime() - 1),
  };
}

export function useOperationalRankings(filters: RankingFilters) {
  const { start, end } = getDateRange(filters.period, filters.customStart, filters.customEnd);
  const prev = getPrevDateRange(filters.period, filters.customStart, filters.customEnd);
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const prevStartISO = prev.start.toISOString();
  const prevEndISO = prev.end.toISOString();

  // ── Score logs for current period ──
  const { data: scoreLogs = [], isLoading: loadingScores } = useQuery({
    queryKey: ["op-ranking-scores", filters.role, startISO, endISO],
    queryFn: async () => {
      let q = (supabase as any)
        .from("operational_score_logs")
        .select(`
          id, score_final, tipo_score, profile_id, target_profile_id, assignment_id,
          created_at, detalhe_calculo, pontualidade, conformidade, qualidade_evidencia, sla_correcoes,
          operational_assignments(data_prevista, template_id, operational_templates(nome))
        `)
        .eq("tipo_score", filters.role)
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .limit(2000);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  // ── Score logs for previous period (trend) ──
  const { data: prevScoreLogs = [] } = useQuery({
    queryKey: ["op-ranking-scores-prev", filters.role, prevStartISO, prevEndISO],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("score_final, tipo_score, profile_id, target_profile_id")
        .eq("tipo_score", filters.role)
        .gte("created_at", prevStartISO)
        .lte("created_at", prevEndISO)
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60000,
  });

  // ── Contingencies in period ──
  const { data: contingencies = [] } = useQuery({
    queryKey: ["op-ranking-contingencies", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_contingencies")
        .select("id, assignment_id, responsavel_id, status, created_at")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30000,
  });

  // ── Profiles ──
  const profileIds = useMemo(() => {
    const ids = new Set<string>();
    scoreLogs.forEach((s: any) => {
      const pid = getProfileId(s, filters.role);
      if (pid) ids.add(pid);
    });
    return [...ids];
  }, [scoreLogs, filters.role]);

  const { data: profilesMap = {} } = useQuery({
    queryKey: ["op-ranking-profiles", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").in("id", profileIds as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Build rankings ──
  const rankings: RankedCollaborator[] = useMemo(() => {
    // Group scores by profile
    const byProfile: Record<string, { scores: any[]; sum: number; count: number; lastDate: string | null }> = {};
    
    scoreLogs.forEach((s: any) => {
      const pid = getProfileId(s, filters.role);
      if (!pid) return;
      if (!byProfile[pid]) byProfile[pid] = { scores: [], sum: 0, count: 0, lastDate: null };
      const score = s.score_final != null ? Number(s.score_final) : null;
      if (score != null) {
        byProfile[pid].sum += score;
        byProfile[pid].count += 1;
      }
      byProfile[pid].scores.push(s);
      const date = s.created_at;
      if (!byProfile[pid].lastDate || date > byProfile[pid].lastDate) {
        byProfile[pid].lastDate = date;
      }
    });

    // Previous period averages for trend
    const prevByProfile: Record<string, { sum: number; count: number }> = {};
    prevScoreLogs.forEach((s: any) => {
      const pid = getProfileId(s, filters.role);
      if (!pid) return;
      if (!prevByProfile[pid]) prevByProfile[pid] = { sum: 0, count: 0 };
      if (s.score_final != null) {
        prevByProfile[pid].sum += Number(s.score_final);
        prevByProfile[pid].count += 1;
      }
    });

    // Contingencies by responsible
    const contingByProfile: Record<string, number> = {};
    contingencies.forEach((c: any) => {
      if (c.responsavel_id) {
        contingByProfile[c.responsavel_id] = (contingByProfile[c.responsavel_id] || 0) + 1;
      }
    });

    return Object.entries(byProfile).map(([pid, data]) => {
      const avg = data.count > 0 ? Math.round(data.sum / data.count) : 0;
      const prevData = prevByProfile[pid];
      const prevAvg = prevData && prevData.count > 0 ? Math.round(prevData.sum / prevData.count) : null;
      
      let tendencia: "up" | "down" | "stable" | null = null;
      if (prevAvg != null) {
        if (avg > prevAvg + 2) tendencia = "up";
        else if (avg < prevAvg - 2) tendencia = "down";
        else tendencia = "stable";
      }

      return {
        profileId: pid,
        nome: profilesMap[pid] || "—",
        scoreMedio: avg,
        totalAvaliacoes: data.count,
        contingencias: contingByProfile[pid] || 0,
        slaMedio: null, // calculated separately if needed
        tendencia,
        ultimaAvaliacao: data.lastDate,
        eligible: data.count >= filters.minEvaluations,
        scoreLogs: data.scores,
      };
    }).sort((a, b) => {
      // Eligible first, then by score
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return b.scoreMedio - a.scoreMedio;
    });
  }, [scoreLogs, prevScoreLogs, contingencies, profilesMap, filters.role, filters.minEvaluations]);

  return {
    rankings,
    isLoading: loadingScores,
    dateRange: { start, end },
  };
}

function getProfileId(scoreLog: any, role: RankingRole): string | null {
  if (role === "executor") return scoreLog.profile_id;
  if (role === "avaliado") return scoreLog.target_profile_id;
  if (role === "avaliador") return scoreLog.profile_id;
  return null;
}
