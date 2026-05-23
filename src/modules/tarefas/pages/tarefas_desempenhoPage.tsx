import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, Target, ChevronDown, ChevronUp,
  CalendarIcon, BarChart3, User, Users, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { getNotaResumoAssignment, extrairResumosNotas } from "@/modules/tarefas/utils/tarefas_notasResumoUtils";
import { useFluxoTarefa } from "@/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa";
import { ResumoNotasReadonly } from "@/modules/tarefas/fluxo/components/tarefas_resumoNotasReadonly";
import type { TarefaFluxoData } from "@/modules/tarefas/fluxo/types/tarefas_fluxoTypes";


// ── helpers ──
const scoreColor = (v: number) => {
  if (v >= 90) return "text-emerald-600";
  if (v >= 70) return "text-amber-600";
  return "text-red-600";
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getNotaSalvaParaTipo = (log: any): number | null => {
  const auditTrail =
    log?.operational_assignments?.audit_trail ??
    log?.audit_trail ??
    [];
  const resumos = extrairResumosNotas(Array.isArray(auditTrail) ? auditTrail : []);
  const tipo = String(log?.tipo_score ?? "");

  if (tipo === "avaliado") return resumos.aprovador?.notaFinal ?? null;
  if (tipo === "aprovador") return resumos.auditor?.notaFinal ?? null;
  return null;
};

const aplicarNotaSalvaAoLog = (log: any) => {
  const notaSalva = getNotaSalvaParaTipo(log);
  if (notaSalva == null) return log;

  const notaOriginal = numberOrNull(log?.score_final);
  return {
    ...log,
    score_final: notaSalva,
    score_final_original: notaOriginal,
    detalhe_calculo: {
      ...(log?.detalhe_calculo ?? {}),
      nota_salva_audit_trail: notaSalva,
      score_log_original: notaOriginal,
      origem_score_exibido: "operational_audit_trail.dados_novos.notas",
    },
  };
};

export default function DesempenhoOperacionalPage() {
  const { profile, isAdmin } = useAuth();
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(now));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedNotaLog, setSelectedNotaLog] = useState<any | null>(null);
  const selectedAssignmentId = selectedNotaLog?.assignment_id ?? null;
  const selectedFluxo = useFluxoTarefa(selectedAssignmentId);

  // Admin pode visualizar o desempenho de qualquer colaborador
  const [viewAsProfileId, setViewAsProfileId] = useState<string>(profile?.id || "");
  const profileId = isAdmin && viewAsProfileId ? viewAsProfileId : (profile?.id || "");

  const { data: perfilSetorIds = [], isLoading: isLoadingSetores } = useQuery({
    queryKey: ["desempenho_profile_setores", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const [{ data: profileRow, error: profileError }, { data: setorRows, error: setoresError }] = await Promise.all([
        supabase.from("profiles").select("setor_id").eq("id", profileId).maybeSingle(),
        supabase.from("colaborador_setores").select("setor_id").eq("profile_id", profileId),
      ]);
      if (profileError) throw profileError;
      if (setoresError) throw setoresError;

      return Array.from(new Set([
        profileRow?.setor_id,
        ...(setorRows || []).map((row: any) => row.setor_id),
      ].filter(Boolean))) as string[];
    },
  });

  // Lista de colaboradores que têm tarefas associadas (apenas para admin)
  const { data: colaboradoresComTarefas = [] } = useQuery({
    queryKey: ["desempenho_colaboradores_com_tarefas", startDate.toISOString(), endDate.toISOString()],
    enabled: !!isAdmin,
    queryFn: async () => {
      const [assignmentsResult, scoreLogsResult] = await Promise.all([
        (supabase as any)
          .from("operational_assignments")
          .select("responsavel_id, avaliado_id, aprovador_id, setor_executor_id, setor_avaliado_id, setor_aprovador_id")
          .gte("data_prevista", startOfDay(startDate).toISOString().slice(0, 10))
          .lte("data_prevista", endOfDay(endDate).toISOString().slice(0, 10))
          .not("status", "in", "(cancelada,arquivada)")
          .limit(1000),
        (supabase as any)
          .from("operational_score_logs")
          .select("target_profile_id, profile_id, target_setor_id, tipo_score")
          .in("tipo_score", ["executor", "avaliado", "aprovador"])
          .gte("created_at", startOfDay(startDate).toISOString())
          .lte("created_at", endOfDay(endDate).toISOString())
          .limit(2000),
      ]);

      if (assignmentsResult.error) throw assignmentsResult.error;
      if (scoreLogsResult.error) throw scoreLogsResult.error;

      const profileIds = new Set<string>();
      const setorIds = new Set<string>();

      if (profile?.id) profileIds.add(profile.id);

      for (const log of scoreLogsResult.data || []) {
        if (log.target_profile_id) profileIds.add(log.target_profile_id);
        if (!log.target_profile_id && !log.target_setor_id && log.profile_id) profileIds.add(log.profile_id);
        if (log.target_setor_id) setorIds.add(log.target_setor_id);
      }

      for (const a of assignmentsResult.data || []) {
        if (a.responsavel_id) profileIds.add(a.responsavel_id);
        if (a.avaliado_id) profileIds.add(a.avaliado_id);
        if (a.aprovador_id) profileIds.add(a.aprovador_id);
        if (a.setor_executor_id) setorIds.add(a.setor_executor_id);
        if (a.setor_avaliado_id) setorIds.add(a.setor_avaliado_id);
        if (a.setor_aprovador_id) setorIds.add(a.setor_aprovador_id);
      }

      if (setorIds.size > 0) {
        const { data: membrosSetor, error: membrosError } = await (supabase as any)
          .from("colaborador_setores")
          .select("profile_id")
          .in("setor_id", Array.from(setorIds));
        if (membrosError) throw membrosError;
        (membrosSetor || []).forEach((row: any) => {
          if (row.profile_id) profileIds.add(row.profile_id);
        });
      }

      if (profileIds.size === 0) return [];

      const { data: perfis, error: perfisError } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", Array.from(profileIds));
      if (perfisError) throw perfisError;

      return (perfis || [])
        .map((p) => ({ id: p.id, nome: p.nome || p.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });

  // ── Fetch score logs for logged user ──
  const { data: scoreLogs = [], isLoading } = useQuery({
    queryKey: ["op-score-logs", profileId, perfilSetorIds.join("|"), startDate.toISOString(), endDate.toISOString()],
    enabled: !!profileId,
    queryFn: async () => {
      const filters = [
        `target_profile_id.eq.${profileId}`,
        `profile_id.eq.${profileId}`,
      ];
      if (perfilSetorIds.length > 0) {
        filters.push(`target_setor_id.in.(${perfilSetorIds.join(",")})`);
      }

      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("*, operational_assignments(data_prevista, status, operational_templates(nome, tipo_execucao))")
        .or(filters.join(","))
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = data || [];
      const assignmentIds = [...new Set(rows.map((row: any) => row.assignment_id).filter(Boolean))];
      if (assignmentIds.length === 0) return rows;

      const { data: auditTrail, error: auditError } = await (supabase as any)
        .from("operational_audit_trail")
        .select("*")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: true });
      if (auditError) throw auditError;

      const auditByAssignment = new Map<string, any[]>();
      (auditTrail || []).forEach((log: any) => {
        const list = auditByAssignment.get(log.assignment_id) || [];
        list.push(log);
        auditByAssignment.set(log.assignment_id, list);
      });

      return rows.map((row: any) =>
        aplicarNotaSalvaAoLog({
          ...row,
          operational_assignments: {
            ...(row.operational_assignments ?? {}),
            audit_trail: auditByAssignment.get(row.assignment_id) || [],
          },
        }),
      );
    },
  });

  const { data: assignmentScores = [] } = useQuery({
    queryKey: ["op-assignment-score-fallbacks", profileId, perfilSetorIds.join("|"), startDate.toISOString(), endDate.toISOString()],
    enabled: !!profileId,
    queryFn: async () => {
      const filters = [
        `responsavel_id.eq.${profileId}`,
        `avaliado_id.eq.${profileId}`,
        `aprovador_id.eq.${profileId}`,
        `auditor_id.eq.${profileId}`,
      ];
      if (perfilSetorIds.length > 0) {
        const setorial = perfilSetorIds.join(",");
        filters.push(
          `setor_executor_id.in.(${setorial})`,
          `setor_avaliado_id.in.(${setorial})`,
          `setor_aprovador_id.in.(${setorial})`,
          `setor_auditor_id.in.(${setorial})`,
        );
      }

      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao)")
        .or(filters.join(","))
        .gte("data_prevista", startOfDay(startDate).toISOString().slice(0, 10))
        .lte("data_prevista", endOfDay(endDate).toISOString().slice(0, 10))
        .not("status", "in", "(cancelada,arquivada)");
      if (error) throw error;

      const rows = data || [];
      const assignmentIds = rows.map((a: any) => a.id).filter(Boolean);
      if (assignmentIds.length === 0) return rows;

      const [scoreResult, auditResult] = await Promise.all([
        (supabase as any)
          .from("operational_score_logs")
          .select("*")
          .in("assignment_id", assignmentIds),
        (supabase as any)
          .from("operational_audit_trail")
          .select("*")
          .in("assignment_id", assignmentIds)
          .order("created_at", { ascending: true }),
      ]);
      if (scoreResult.error) throw scoreResult.error;
      if (auditResult.error) throw auditResult.error;

      const scoreByAssignment = new Map<string, any[]>();
      (scoreResult.data || []).forEach((log: any) => {
        const list = scoreByAssignment.get(log.assignment_id) || [];
        list.push(log);
        scoreByAssignment.set(log.assignment_id, list);
      });
      const auditByAssignment = new Map<string, any[]>();
      (auditResult.data || []).forEach((log: any) => {
        const list = auditByAssignment.get(log.assignment_id) || [];
        list.push(log);
        auditByAssignment.set(log.assignment_id, list);
      });

      return rows.map((a: any) => ({
        ...a,
        score_logs: scoreByAssignment.get(a.id) || [],
        audit_trail: auditByAssignment.get(a.id) || [],
      }));
    },
  });

  // ── Fetch rankings (all users, current period) ──
  const { data: allScores = [] } = useQuery({
    queryKey: ["op-rankings-all", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("assignment_id, target_profile_id, score_final, tipo_score, target_setor_id")
        .gte("created_at", startOfDay(startDate).toISOString())
        .lte("created_at", endOfDay(endDate).toISOString())
        .not("target_profile_id", "is", null);
      if (error) throw error;

      const rows = data || [];
      const assignmentIds = [...new Set(rows.map((row: any) => row.assignment_id).filter(Boolean))];
      if (assignmentIds.length === 0) return rows;

      const { data: auditTrail, error: auditError } = await (supabase as any)
        .from("operational_audit_trail")
        .select("*")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: true });
      if (auditError) throw auditError;

      const auditByAssignment = new Map<string, any[]>();
      (auditTrail || []).forEach((log: any) => {
        const list = auditByAssignment.get(log.assignment_id) || [];
        list.push(log);
        auditByAssignment.set(log.assignment_id, list);
      });

      return rows.map((row: any) =>
        aplicarNotaSalvaAoLog({
          ...row,
          audit_trail: auditByAssignment.get(row.assignment_id) || [],
        }),
      );
    },
  });

  // ── Fetch profile names for ranking ──
  const profileIds = useMemo(() => [...new Set(allScores.map((s: any) => s.target_profile_id).filter(Boolean))], [allScores]);
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["op-profiles", profileIds],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").in("id", profileIds as string[]);
      const map: Record<string, string> = {};
      (data || []).forEach((p) => { map[p.id] = p.nome; });
      return map;
    },
  });

  // ── Computed stats ──
  // ── Computed stats (with weighted average using multiplicador) ──
  const isSetorDoPerfil = (setorId?: string | null) => !!setorId && perfilSetorIds.includes(setorId);
  const isScoreLogDoPerfil = (log: any) => {
    const temDestinoExplicito = !!log.target_profile_id || !!log.target_setor_id;
    return (
      log.target_profile_id === profileId ||
      isSetorDoPerfil(log.target_setor_id) ||
      (!temDestinoExplicito && log.profile_id === profileId)
    );
  };
  const scoreLogKeys = useMemo(
    () =>
      new Set(
        scoreLogs
          .filter((s: any) => isScoreLogDoPerfil(s))
          .map((s: any) => `${s.assignment_id}:${s.tipo_score}`),
      ),
    [scoreLogs, profileId, perfilSetorIds],
  );
  const makeFallbackLog = (assignment: any, tipo: "executor" | "avaliado" | "aprovador", score: number) => ({
    id: `fallback-${assignment.id}-${tipo}`,
    assignment_id: assignment.id,
    tipo_score: tipo,
    profile_id: assignment.responsavel_id ?? profileId,
    target_profile_id: tipo === "executor"
      ? assignment.responsavel_id
      : tipo === "aprovador"
        ? (assignment.aprovador_id ?? assignment.avaliador_id ?? null)
        : assignment.avaliado_id,
    target_setor_id: tipo === "executor"
      ? assignment.setor_executor_id
      : tipo === "aprovador"
        ? assignment.setor_aprovador_id
        : assignment.setor_avaliado_id,
    score_final: score,
    detalhe_calculo: {
      formula: "Nota recuperada de operational_assignments/operational_audit_trail",
      origem: "fallback_visual",
    },
    operational_assignments: assignment,
  });
  const fallbackExecutorLogs = assignmentScores
    .filter((a: any) => (a.responsavel_id === profileId || isSetorDoPerfil(a.setor_executor_id)) && !scoreLogKeys.has(`${a.id}:executor`))
    .map((a: any) => {
      const score = getNotaResumoAssignment(a, "executor");
      return score != null ? makeFallbackLog(a, "executor", score) : null;
    })
    .filter(Boolean);
  const fallbackAvaliadoLogs = assignmentScores
    .filter((a: any) => (a.avaliado_id === profileId || isSetorDoPerfil(a.setor_avaliado_id)) && !scoreLogKeys.has(`${a.id}:avaliado`))
    .map((a: any) => {
      const score = getNotaResumoAssignment(a, "avaliado");
      return score != null ? makeFallbackLog(a, "avaliado", score) : null;
    })
    .filter(Boolean);
  const fallbackAprovadorLogs = assignmentScores
    .filter((a: any) => (a.aprovador_id === profileId || isSetorDoPerfil(a.setor_aprovador_id)) && !scoreLogKeys.has(`${a.id}:aprovador`))
    .map((a: any) => {
      const score = getNotaResumoAssignment(a, "aprovador");
      return score != null ? makeFallbackLog(a, "aprovador", score) : null;
    })
    .filter(Boolean);

  const myExecutorLogs = [
    ...scoreLogs.filter((s: any) => s.tipo_score === "executor" && isScoreLogDoPerfil(s)),
    ...fallbackExecutorLogs,
  ];
  const myAvaliadoLogs = [
    ...scoreLogs.filter((s: any) => s.tipo_score === "avaliado" && isScoreLogDoPerfil(s)),
    ...fallbackAvaliadoLogs,
  ];
  // Nota dada pelo auditor → aprovador (tipo_score='aprovador' gerado pelo trigger recalcular_score_assignment)
  const myAprovadorLogs = [
    ...scoreLogs.filter((s: any) => s.tipo_score === "aprovador" && isScoreLogDoPerfil(s)),
    ...fallbackAprovadorLogs,
  ];
  const tipoNotaLabel = (tipo: string) => {
    if (tipo === "executor") return "Executor";
    if (tipo === "avaliado") return "Avaliado";
    if (tipo === "aprovador") return "Aprovador";
    if (tipo === "auditor") return "Auditor";
    return tipo || "Nota";
  };
  const isNotaSetorial = (log: any) => {
    if (!log?.target_setor_id || !isSetorDoPerfil(log.target_setor_id)) return false;
    return log?.detalhe_calculo?.fanout_setor === true || !log?.target_profile_id || String(log?.id ?? "").startsWith("fallback-");
  };
  const origemNotaLabel = (log: any) => {
    if (isNotaSetorial(log)) return "Setor";
    if (log?.target_profile_id === profileId) return "Individual";
    if (!log?.target_profile_id && !log?.target_setor_id && log?.profile_id === profileId) return "Individual";
    return "Vinculada";
  };
  const prioridadeNota = (log: any) => {
    const origemPeso = isNotaSetorial(log) ? 30 : origemNotaLabel(log) === "Individual" ? 20 : 10;
    const tipoPeso = log?.tipo_score === "aprovador" ? 3 : log?.tipo_score === "avaliado" ? 2 : 1;
    return origemPeso + tipoPeso;
  };
  const escolherNotaPrincipal = (atual: any | undefined, candidata: any) => {
    if (!atual) return candidata;
    const prioridadeAtual = prioridadeNota(atual);
    const prioridadeCandidata = prioridadeNota(candidata);
    if (prioridadeCandidata !== prioridadeAtual) {
      return prioridadeCandidata > prioridadeAtual ? candidata : atual;
    }
    const scoreAtual = numberOrNull(atual.score_final) ?? -1;
    const scoreCandidata = numberOrNull(candidata.score_final) ?? -1;
    if (scoreCandidata !== scoreAtual) {
      return scoreCandidata > scoreAtual ? candidata : atual;
    }
    const dataAtual = new Date(atual.created_at ?? atual.operational_assignments?.data_prevista ?? 0).getTime();
    const dataCandidata = new Date(candidata.created_at ?? candidata.operational_assignments?.data_prevista ?? 0).getTime();
    return dataCandidata > dataAtual ? candidata : atual;
  };
  const minhasNotasLogs = useMemo(() => {
    const map = new Map<string, any>();
    [...myExecutorLogs, ...myAvaliadoLogs, ...myAprovadorLogs].forEach((log: any) => {
      if (!log) return;
      const key = log.assignment_id ?? log.id;
      map.set(key, escolherNotaPrincipal(map.get(key), log));
    });
    return Array.from(map.values()).sort((a: any, b: any) => {
      const da = new Date(a.created_at ?? a.operational_assignments?.data_prevista ?? 0).getTime();
      const db = new Date(b.created_at ?? b.operational_assignments?.data_prevista ?? 0).getTime();
      return db - da;
    });
  }, [myExecutorLogs, myAvaliadoLogs, myAprovadorLogs]);

  const weightedAvg = (logs: any[]) => {
    if (logs.length === 0) return null;
    let sumWeighted = 0, sumWeights = 0;
    logs.forEach((l: any) => {
      const w = l.detalhe_calculo?.peso_recorrencia ?? 1;
      sumWeighted += (l.score_final || 0) * w;
      sumWeights += w;
    });
    return sumWeights > 0 ? Math.round(sumWeighted / sumWeights) : null;
  };

  const avgExecutor = weightedAvg(myExecutorLogs);
  const avgAvaliado = weightedAvg(myAvaliadoLogs);
  const avgAvaliador = weightedAvg(myAprovadorLogs);
  const avgGlobal = weightedAvg(minhasNotasLogs);

  // ── Rankings ──
  const rankings = useMemo(() => {
    const byProfile: Record<string, { sum: number; count: number }> = {};
    allScores.forEach((s: any) => {
      if (!s.target_profile_id) return;
      if (!byProfile[s.target_profile_id]) byProfile[s.target_profile_id] = { sum: 0, count: 0 };
      byProfile[s.target_profile_id].sum += s.score_final || 0;
      byProfile[s.target_profile_id].count += 1;
    });
    return Object.entries(byProfile)
      .map(([id, v]) => ({ id, nome: profilesMap[id] || "—", media: Math.round(v.sum / v.count), total: v.count }))
      .sort((a, b) => b.media - a.media);
  }, [allScores, profilesMap]);

  const myRankPosition = rankings.findIndex((r) => r.id === profileId) + 1;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-section font-semibold text-foreground">
            📊 {isAdmin && viewAsProfileId !== profile?.id
              ? `Desempenho — ${colaboradoresComTarefas.find(c => c.id === viewAsProfileId)?.nome || "Colaborador"}`
              : "Meu Desempenho Operacional"}
          </h1>
          <p className="text-body text-muted-foreground">Transparência total: veja como as notas são calculadas.</p>
        </div>

        {/* Seletor de visão — apenas admin */}
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <Users className="w-4 h-4 text-muted-foreground" />
            <select
              value={viewAsProfileId}
              onChange={(e) => setViewAsProfileId(e.target.value)}
              className="text-sm border border-border rounded-md px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-primary min-w-[180px]"
            >
              <option value={profile?.id || ""}>👤 Meu desempenho</option>
              {colaboradoresComTarefas
                .filter(c => c.id !== profile?.id)
                .map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(startDate, "dd/MM/yy", { locale: ptBR })} – {format(endDate, "dd/MM/yy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar mode="range" selected={{ from: startDate, to: endDate }}
                onSelect={(range) => { if (range?.from) setStartDate(range.from); if (range?.to) setEndDate(range.to); }}
                locale={ptBR} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon={<Target className="w-5 h-5" />} label="Média Executor" value={avgExecutor} />
        <SummaryCard icon={<User className="w-5 h-5" />} label="Média Avaliado" value={avgAvaliado} />
        <SummaryCard icon={<BarChart3 className="w-5 h-5" />} label="Média Aprovador" value={avgAvaliador} />
        <SummaryCard icon={<TrendingUp className="w-5 h-5" />} label="Nota Global" value={avgGlobal} suffix="geral" />
        <SummaryCard icon={<Trophy className="w-5 h-5" />} label="Posição Ranking" value={myRankPosition || null} suffix={`/ ${rankings.length}`} plain />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="notas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="notas">Minhas Notas</TabsTrigger>
          <TabsTrigger value="execucoes">Por Execução</TabsTrigger>
          <TabsTrigger value="avaliado">Como Avaliado</TabsTrigger>
          <TabsTrigger value="aprovador">Como Aprovador</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
        </TabsList>

        <TabsContent value="notas">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading || isLoadingSetores ? (
              <div className="p-8 text-center text-muted-foreground">Carregando notas...</div>
            ) : minhasNotasLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma nota recebida no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {minhasNotasLogs.map((log: any) => {
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const origem = origemNotaLabel(log);
                  return (
                    <div key={log.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground break-words">
                            {template?.nome || assignment?.nome || "Tarefa"}
                          </p>
                          <Badge variant="outline">{tipoNotaLabel(String(log.tipo_score))}</Badge>
                          <Badge className={origem === "Setor" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                            {origem}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "Sem data"} · {template?.tipo_execucao || "tarefa"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <span className={cn("text-xl font-bold font-tabular", scoreColor(Number(log.score_final ?? 0)))}>
                          {log.score_final ?? "—"}
                        </span>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSelectedNotaLog(log)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver nota
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Por Execução ── */}
        <TabsContent value="execucoes">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading || isLoadingSetores ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : myExecutorLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma execução no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {myExecutorLogs.map((log: any) => {
                  const det = log.detalhe_calculo || {};
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const expanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-foreground truncate">{template?.nome || "—"}</p>
                          <p className="text-caption text-muted-foreground">
                            {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "—"} · {template?.tipo_execucao || "—"}
                            {det.peso_recorrencia && det.peso_recorrencia !== 1 && (
                              <span className="ml-1 text-primary font-medium">×{det.peso_recorrencia}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-lg font-bold font-tabular", scoreColor(log.score_final || 0))}>{log.score_final ?? "—"}</span>
                          <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedNotaLog(log); }}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver nota
                          </Button>
                          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {expanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-3 space-y-2">
                          <ScoreBar label="Pontualidade (40%)" value={det.pontualidade} />
                          <ScoreBar label="Conformidade (30%)" value={det.conformidade} />
                          <ScoreBar label="Evidência (20%)" value={det.evidencia} />
                          <ScoreBar label="SLA Correções (10%)" value={det.sla_correcoes} />
                          <p className="text-caption text-muted-foreground pt-1">Fórmula: {det.formula || "—"}</p>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Como Avaliado ── */}
        <TabsContent value="avaliado">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading || isLoadingSetores ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : myAvaliadoLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma avaliação recebida no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {myAvaliadoLogs.map((log: any) => {
                  const det = log.detalhe_calculo || {};
                  const itens = det.itens || [];
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const expanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expanded ? null : log.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-body font-medium text-foreground truncate">{template?.nome || "—"}</p>
                          <p className="text-caption text-muted-foreground">
                            {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn("text-lg font-bold font-tabular", scoreColor(log.score_final || 0))}>{log.score_final ?? "—"}</span>
                          <Button type="button" variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); setSelectedNotaLog(log); }}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver nota
                          </Button>
                          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>
                      {expanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-3">
                          {det.herda_executor ? (
                            <p className="text-caption text-muted-foreground">Score herdado do executor (tarefa simples/etapas).</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-caption text-muted-foreground mb-2">
                                Soma ponderada: {det.soma_ponderada} / {det.soma_maxima} = {log.score_final}%
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-caption">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="text-left py-1 px-2 text-muted-foreground">Item</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Nota</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Máx</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Penalidade</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Conforme</th>
                                      <th className="text-center py-1 px-2 text-muted-foreground">Nota</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border">
                                    {itens.map((item: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="py-1 px-2 text-foreground">{item.pergunta}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.peso}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.nota_maxima}</td>
                                        <td className="py-1 px-2 text-center font-tabular">{item.penalidade}%</td>
                                        <td className="py-1 px-2 text-center">
                                          {item.conforme === true ? "✅" : item.conforme === false ? "❌" : "—"}
                                        </td>
                                        <td className={cn("py-1 px-2 text-center font-tabular font-medium", item.conforme === false ? "text-destructive" : "text-foreground")}>
                                          {item.nota_obtida}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Como Aprovador ── */}
        <TabsContent value="aprovador">
          <div className="bg-card border border-border rounded-lg shadow-card">
            {isLoading || isLoadingSetores ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : myAprovadorLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhuma nota como aprovador no período.</div>
            ) : (
              <div className="divide-y divide-border">
                {myAprovadorLogs.map((log: any) => {
                  const det = log.detalhe_calculo || {};
                  const assignment = log.operational_assignments;
                  const template = assignment?.operational_templates;
                  const expanded = expandedId === log.id;
                  return (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(expanded ? null : log.id)}>
                          <p className="text-body font-medium text-foreground truncate">{template?.nome || "—"}</p>
                          <p className="text-caption text-muted-foreground">
                            {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy") : "—"} · {origemNotaLabel(log)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <span className={cn("text-lg font-bold font-tabular", scoreColor(log.score_final || 0))}>{log.score_final ?? "—"}</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => setSelectedNotaLog(log)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Ver nota
                          </Button>
                          <button type="button" className="text-muted-foreground" onClick={() => setExpandedId(expanded ? null : log.id)}>
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-3 space-y-2">
                          {Array.isArray(det.itens) && det.itens.length > 0 ? (
                            det.itens.slice(0, 5).map((item: any, index: number) => (
                              <div key={`${item.pergunta ?? index}`} className="rounded-md border bg-muted/20 p-2">
                                <p className="text-xs font-medium text-foreground">{item.pergunta || `Critério ${index + 1}`}</p>
                                <p className="text-xs text-muted-foreground">
                                  Nota: {item.nota_obtida ?? "—"} / {item.nota_maxima ?? item.peso ?? "—"}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-caption text-muted-foreground">{det.formula || "Use Ver nota para abrir o resumo completo do fluxo."}</p>
                          )}
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Ranking ── */}
        <TabsContent value="ranking">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-16">#</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Execuções</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Média</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rankings.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>
                ) : rankings.map((r, i) => (
                  <tr key={r.id} className={cn("transition-colors", r.id === profileId ? "bg-primary/5 font-medium" : "hover:bg-muted/50")}>
                    <td className="px-4 py-3 text-center font-tabular">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-4 py-3 text-body text-foreground">
                      {r.nome} {r.id === profileId && <span className="text-caption text-primary">(você)</span>}
                    </td>
                    <td className="px-4 py-3 text-center font-tabular text-muted-foreground">{r.total}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("font-bold font-tabular", scoreColor(r.media))}>{r.media}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedNotaLog} onOpenChange={(open) => !open && setSelectedNotaLog(null)}>
        <DialogContent className="w-[calc(100vw-24px)] max-w-3xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 py-4 border-b shrink-0">
            <DialogTitle className="text-base">Resumo da nota recebida</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto p-5">
            {selectedNotaLog && (
              <DetalheNotaRecebida
                log={selectedNotaLog}
                tipoLabel={tipoNotaLabel(String(selectedNotaLog.tipo_score))}
                origemLabel={origemNotaLabel(selectedNotaLog)}
                fluxoData={selectedFluxo.data}
                isLoadingFluxo={selectedFluxo.isLoading}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-components ──
function SummaryCard({ icon, label, value, suffix, plain }: { icon: React.ReactNode; label: string; value: number | null; suffix?: string; plain?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-lg p-4 shadow-card">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}<span className="text-caption font-medium uppercase tracking-wider">{label}</span></div>
      <p className={cn("text-2xl font-bold font-tabular", !plain && value != null ? scoreColor(value) : "text-foreground")}>
        {value != null ? value : "—"}{suffix && <span className="text-base font-normal text-muted-foreground ml-1">{suffix}</span>}
      </p>
    </motion.div>
  );
}

function ScoreBar({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-caption text-muted-foreground w-40 shrink-0">{label}</span>
      <Progress value={v} className="h-2 flex-1" />
      <span className={cn("text-caption font-bold font-tabular w-10 text-right", scoreColor(v))}>{Math.round(v)}</span>
    </div>
  );
}

function DetalheNotaRecebida({
  log,
  tipoLabel,
  origemLabel,
  fluxoData,
  isLoadingFluxo,
}: {
  log: any;
  tipoLabel: string;
  origemLabel: string;
  fluxoData: TarefaFluxoData | null;
  isLoadingFluxo: boolean;
}) {
  const det = log?.detalhe_calculo || {};
  const assignment = log?.operational_assignments;
  const template = assignment?.operational_templates;
  const itens = Array.isArray(det.itens) ? det.itens : [];
  const nota = Number(log?.score_final ?? 0);
  const resumosSalvos = extrairResumosNotas(fluxoData?.auditTrail ?? []);
  const resumoPertinente =
    log?.tipo_score === "aprovador"
      ? resumosSalvos.auditor
      : resumosSalvos.aprovador;
  const modoResumo = log?.tipo_score === "aprovador" ? "auditor" : "aprovador";
  const componenteNotas = [
    {
      label: "Pontualidade",
      value: numberOrNull(det.pontualidade ?? log?.pontualidade),
      hint: "Prazo de execucao registrado no log da nota.",
    },
    {
      label: "Resposta / conformidade",
      value: numberOrNull(det.score_bruto ?? det.conformidade ?? log?.conformidade),
      hint: "Resultado das respostas avaliadas para esta etapa.",
    },
    {
      label: "Evidencia",
      value: numberOrNull(det.evidencia ?? det.qualidade_evidencia ?? log?.qualidade_evidencia),
      hint: "Qualidade ou presenca dos anexos obrigatorios.",
    },
    {
      label: "SLA de correcoes",
      value: numberOrNull(det.sla_correcoes ?? log?.sla_correcoes),
      hint: "Planos de acao e correcoes dentro do prazo esperado.",
    },
  ].filter((item) => item.value != null);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-blue-50/60 border-blue-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-blue-950 break-words">
              {template?.nome || assignment?.nome || "Tarefa"}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{tipoLabel}</Badge>
              <Badge className={origemLabel === "Setor" ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"}>
                Nota {origemLabel.toLowerCase()}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {assignment?.data_prevista ? format(new Date(assignment.data_prevista), "dd/MM/yyyy", { locale: ptBR }) : "Sem data"}
            </p>
          </div>
          <p className={cn("text-4xl font-bold font-tabular", scoreColor(nota))}>{log?.score_final ?? "—"}</p>
        </div>
      </div>

      {itens.length > 0 ? (
        <div className="space-y-2">
          {itens.map((item: any, index: number) => {
            const conforme = item.conforme;
            const notaObtida = Number(item.nota_obtida ?? 0);
            const maximo = Number(item.nota_maxima ?? item.peso ?? 0);
            const perdeu = conforme === false || notaObtida < maximo;
            return (
              <div
                key={`${item.pergunta ?? item.nome ?? index}`}
                className={cn(
                  "rounded-lg border p-3 space-y-2",
                  perdeu ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50",
                )}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground break-words">
                    {item.pergunta || item.nome || `Critério ${index + 1}`}
                  </p>
                  <Badge className={perdeu ? "bg-red-100 text-red-700 hover:bg-red-100" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"}>
                    {perdeu ? "Perdeu ponto" : "OK"}
                  </Badge>
                </div>
                <p className={cn("text-xs font-semibold", perdeu ? "text-red-700" : "text-emerald-700")}>
                  Nota: {notaObtida}/{maximo} pts
                  {perdeu ? ` · desconto ${Math.max(0, maximo - notaObtida)} pts` : ""}
                </p>
                {item.mensagem || item.observacao ? (
                  <p className="text-xs text-muted-foreground break-words">{item.mensagem || item.observacao}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Detalhe da nota</p>
          {componenteNotas.length > 0 ? (
            <div className="space-y-3">
              {componenteNotas.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <p className={cn("text-xs font-bold font-tabular", scoreColor(item.value ?? 0))}>
                      {Math.round(item.value ?? 0)}
                    </p>
                  </div>
                  <Progress value={item.value ?? 0} className="h-2" />
                  <p className="text-[11px] text-muted-foreground break-words">{item.hint}</p>
                </div>
              ))}
              {det.formula ? (
                <p className="pt-1 text-xs text-muted-foreground break-words">Formula: {det.formula}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground break-words">
              {det.formula || "Detalhamento por pergunta não veio em detalhe_calculo para esta nota."}
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Dados do fluxo da tarefa</p>
          <p className="text-xs text-muted-foreground">
            Respostas, planos de ação e resumo reconstruídos da mesma fonte usada na execução.
          </p>
        </div>
        {isLoadingFluxo ? (
          <p className="text-xs text-muted-foreground">Carregando dados do fluxo...</p>
        ) : fluxoData ? (
          <div className="space-y-3">
            <ResumoNotasReadonly
              modo={modoResumo}
              data={fluxoData}
              notasSalvas={resumoPertinente?.notas ?? null}
              titulo={modoResumo === "auditor" ? "Resumo da nota do aprovador" : "Resumo da nota do executor/avaliado"}
            />
            <FluxoPerguntasResumo data={fluxoData} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Não foi possível carregar os dados de execução desta tarefa.</p>
        )}
      </div>
    </div>
  );
}

function FluxoPerguntasResumo({ data }: { data: TarefaFluxoData }) {
  const perguntasComDados = data.perguntas.filter(
    (pergunta) =>
      pergunta.respostaOriginalExecutor ||
      pergunta.planosAprovador.length > 0 ||
      pergunta.planosAuditor.length > 0,
  );

  if (perguntasComDados.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma resposta ou plano de ação encontrado para esta tarefa.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Perguntas e planos vinculados</p>
      {perguntasComDados.map((pergunta) => (
        <div key={pergunta.fieldId} className="rounded-md border bg-muted/20 p-3 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <p className="text-sm font-semibold text-foreground break-words">{pergunta.label}</p>
            <Badge variant="outline">{pergunta.obrigatorio ? "Obrigatória" : "Opcional"}</Badge>
          </div>
          {pergunta.respostaOriginalExecutor ? (
            <p className="text-xs text-muted-foreground">
              Executor: <strong className="text-foreground">{resumoRespostaOriginal(pergunta.respostaOriginalExecutor)}</strong>
              {pergunta.respostaOriginalExecutor.respondido_em ? ` · ${format(new Date(pergunta.respostaOriginalExecutor.respondido_em), "dd/MM/yyyy HH:mm")}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Sem resposta original registrada.</p>
          )}
          <PlanosResumo titulo="Planos do aprovador para o executor" planos={pergunta.planosAprovador} />
          <PlanosResumo titulo="Planos do auditor para o aprovador" planos={pergunta.planosAuditor} />
        </div>
      ))}
    </div>
  );
}

function PlanosResumo({ titulo, planos }: { titulo: string; planos: any[] }) {
  if (!planos.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{titulo}</p>
      {planos.map((plano) => (
        <div key={plano.id} className="rounded border bg-card p-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <p className="font-medium text-foreground break-words">
              R{plano.rodada || 1} · {plano.instrucao || resumoItensPlano(plano.itens_plano) || "Plano sem instrução"}
            </p>
            <Badge className={plano.respondido ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}>
              {plano.respondido ? "Respondido" : "Pendente"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            Prazo: {plano.prazo_resolucao ? format(new Date(plano.prazo_resolucao), "dd/MM/yyyy HH:mm") : "sem prazo"}
            {plano.respondido_em ? ` · respondido em ${format(new Date(plano.respondido_em), "dd/MM/yyyy HH:mm")}` : ""}
          </p>
          {plano.respondido && (
            <p className="text-muted-foreground">Resposta: {resumoRespostaPlano(plano.resposta_valor_json)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function resumoRespostaOriginal(resposta: any) {
  if (resposta.valor_booleano !== null && resposta.valor_booleano !== undefined) return resposta.valor_booleano ? "Sim" : "Não";
  if (resposta.valor_texto) return resposta.valor_texto;
  if (resposta.valor_numero !== null && resposta.valor_numero !== undefined) return String(resposta.valor_numero);
  if (resposta.valor_json) return resumoJsonCurto(resposta.valor_json);
  return resposta.evidencia_url ? "Evidência anexada" : "Sem valor textual";
}

function resumoRespostaPlano(valor: any) {
  if (!valor || typeof valor !== "object") return "Sem resposta detalhada";
  const itens = Object.values(valor as Record<string, any>);
  if (itens.length === 0) return "Sem resposta detalhada";
  return itens
    .map((item: any) => item?.valor_texto || item?.evidencia_url || item?.evidencia_anexo_id || item?.tipo)
    .filter(Boolean)
    .join(" · ") || "Resposta registrada";
}

function resumoItensPlano(itens: any) {
  if (!Array.isArray(itens)) return "";
  return itens
    .map((item: any) => item?.titulo || item?.label || item?.descricao || item?.tipo)
    .filter(Boolean)
    .join(", ");
}

function resumoJsonCurto(valor: any) {
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor).slice(0, 140);
  } catch {
    return "Valor estruturado";
  }
}
