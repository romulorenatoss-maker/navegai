/**
 * tarefas_useFluxoTarefa.ts
 *
 * HOOK ÚNICO de leitura do fluxo. Toda tela do fluxo consome este hook
 * (proibido cada componente fazer query sozinho — regra do documento de rebuild).
 *
 * Lê de:
 *  - operational_assignments (assignment)
 *  - operational_field_answers (respostas originais R0)
 *  - tarefas_planos_acao_aprovador (planos do aprovador)
 *  - tarefas_planos_acao_auditor   (planos do auditor)
 *
 * Retorna estrutura única TarefaFluxoData via construirTarefaFluxoData.
 *
 * Nao consulta a tabela legada de revisoes por campo.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { construirTarefaFluxoData } from "../services/tarefas_fluxoHistoricoMapper";
import type {
  TarefaFluxoData,
  TarefaFluxoAssignment,
  PlanoAprovador,
  PlanoAuditor,
  RespostaOriginal,
  TarefaFluxoAuditTrail,
  TarefaFluxoContingencia,
  TarefaFluxoEtapaRun,
  TarefaFluxoScoreLog,
} from "../types/tarefas_fluxoTypes";

export interface UseFluxoTarefaResult {
  data: TarefaFluxoData | null;
  isLoading: boolean;
  error: unknown;
  invalidate: () => void;
}

export function useFluxoTarefa(assignmentId: string | null): UseFluxoTarefaResult {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  // ASSIGNMENT (com template_snapshot e ada vivo)
  const assignmentQ = useQuery({
    queryKey: ["tarefas_fluxo_assignment", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return null;
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("*, operational_templates(ada_config_snapshot), profiles_aval:avaliado_id(id, nome), setor_avaliado:setores!operational_assignments_setor_avaliado_id_fkey(id, nome)")
        .eq("id", assignmentId)
        .single();
      if (error) throw error;
      return data as TarefaFluxoAssignment;
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // RESPOSTAS originais do executor
  const respostasQ = useQuery({
    queryKey: ["tarefas_fluxo_respostas_originais", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_field_answers")
        .select("*")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return (data ?? []) as RespostaOriginal[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // PLANOS do aprovador
  const planosAprovQ = useQuery({
    queryKey: ["tarefas_fluxo_planos_aprovador", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("tarefas_planos_acao_aprovador")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("rodada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanoAprovador[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // PLANOS do auditor
  const planosAuditQ = useQuery({
    queryKey: ["tarefas_fluxo_planos_auditor", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("tarefas_planos_acao_auditor")
        .select("*")
        .eq("assignment_id", assignmentId)
        .is("deleted_at", null)
        .order("rodada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanoAuditor[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // CONTINGENCIAS existentes, usadas pelo calculo automatico antigo de notas.
  const contingenciasQ = useQuery({
    queryKey: ["tarefas_fluxo_contingencias", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_contingencies")
        .select("*")
        .eq("assignment_id", assignmentId);
      if (error) throw error;
      return (data ?? []) as TarefaFluxoContingencia[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const auditTrailQ = useQuery({
    queryKey: ["tarefas_fluxo_audit_trail", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_audit_trail")
        .select("*, profiles:executado_por(nome)")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarefaFluxoAuditTrail[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const scoreLogsQ = useQuery({
    queryKey: ["tarefas_fluxo_score_logs", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_score_logs")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TarefaFluxoScoreLog[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const etapasRunsQ = useQuery({
    queryKey: ["tarefas_fluxo_etapas_runs", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_assignment_stage_runs")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("stage_order", { ascending: true })
        .order("started_at", { ascending: true });
      if (error) {
        console.warn("[tarefas] etapas persistentes indisponiveis; usando fallback sem etapa persistida", error);
        return [];
      }
      return (data ?? []) as TarefaFluxoEtapaRun[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const isLoading =
    assignmentQ.isLoading ||
    respostasQ.isLoading ||
    planosAprovQ.isLoading ||
    planosAuditQ.isLoading ||
    contingenciasQ.isLoading ||
    auditTrailQ.isLoading ||
    scoreLogsQ.isLoading ||
    etapasRunsQ.isLoading;

  const error =
    assignmentQ.error ??
    respostasQ.error ??
    planosAprovQ.error ??
    planosAuditQ.error ??
    contingenciasQ.error ??
    auditTrailQ.error ??
    scoreLogsQ.error;

  const assignment = assignmentQ.data ?? null;

  const data: TarefaFluxoData | null = assignment
    ? construirTarefaFluxoData({
        assignment,
        respostasOriginais: respostasQ.data ?? [],
        planosAprovador: planosAprovQ.data ?? [],
        planosAuditor: planosAuditQ.data ?? [],
        etapasRuns: etapasRunsQ.data ?? [],
        contingencias: contingenciasQ.data ?? [],
        auditTrail: auditTrailQ.data ?? [],
        scoreLogs: scoreLogsQ.data ?? [],
        profileId: profile?.id ?? null,
        isAdmin: !!isAdmin,
      })
    : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_assignment", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_respostas_originais", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_aprovador", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_auditor", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_contingencias", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_audit_trail", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_score_logs", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_etapas_runs", assignmentId] });
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
  };

  return { data, isLoading, error, invalidate };
}
