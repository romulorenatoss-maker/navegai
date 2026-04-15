import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ContingencyFilters {
  responsavel_id?: string;
  status?: string;
  template_id?: string;
}

// Valid state transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  aberta: ["em_andamento", "descartada"],
  em_andamento: ["resolvida", "descartada"],
  resolvida: ["validada", "aberta"], // aberta = rejection reopens
  validada: [],
  descartada: [],
};

async function assertStatusTransition(contingencyId: string, expectedFrom: string[], targetStatus: string) {
  const { data, error } = await (supabase as any)
    .from("operational_contingencies")
    .select("status")
    .eq("id", contingencyId)
    .single();
  if (error) throw new Error("Não foi possível verificar status atual.");
  const current = data.status;
  if (!expectedFrom.includes(current)) {
    throw new Error(`Transição inválida: ${current} → ${targetStatus}. Permitido apenas de: ${expectedFrom.join(", ")}.`);
  }
  const allowed = VALID_TRANSITIONS[current] || [];
  if (!allowed.includes(targetStatus)) {
    throw new Error(`Transição não permitida: ${current} → ${targetStatus}.`);
  }
  return current;
}

async function assertIsValidador(contingencyId: string, profileId: string, isAdmin: boolean) {
  if (isAdmin) return; // admins bypass
  const { data, error } = await (supabase as any)
    .from("operational_contingencies")
    .select("assignment:operational_assignments!operational_contingencies_assignment_id_fkey(validador_contingencia_id)")
    .eq("id", contingencyId)
    .single();
  if (error) throw new Error("Erro ao verificar validador.");
  const validadorId = data?.assignment?.validador_contingencia_id;
  if (validadorId && validadorId !== profileId) {
    throw new Error("Somente o validador designado ou um administrador pode validar esta contingência.");
  }
}

export function useContingencyManagement(filters: ContingencyFilters = {}) {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: contingencies = [], isLoading } = useQuery({
    queryKey: ["contingency_management", filters],
    queryFn: async () => {
      let query = (supabase as any)
        .from("operational_contingencies")
        .select(`
          *,
          responsavel:profiles!operational_contingencies_responsavel_id_fkey(id, nome),
          validador:profiles!operational_contingencies_validada_por_fkey(id, nome),
          assignment:operational_assignments!operational_contingencies_assignment_id_fkey(
            id, data_prevista, rodada_atual, status, validador_contingencia_id,
            template:operational_templates!operational_assignments_template_id_fkey(nome),
            executor:profiles!operational_assignments_responsavel_id_fkey(nome),
            avaliado:profiles!operational_assignments_avaliado_id_fkey(nome)
          )
        `)
        .order("created_at", { ascending: false });

      if (filters.responsavel_id) {
        query = query.eq("responsavel_id", filters.responsavel_id);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 15000,
  });

  // Load resolution logs for a specific contingency
  const useResolutionLogs = (contingencyId: string | null) =>
    useQuery({
      queryKey: ["contingency_resolution_logs", contingencyId],
      queryFn: async () => {
        if (!contingencyId) return [];
        const { data, error } = await (supabase as any)
          .from("operational_contingency_resolution_logs")
          .select("*, executor:profiles!operational_contingency_resolution_logs_executado_por_fkey(nome)")
          .eq("contingency_id", contingencyId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      enabled: !!contingencyId,
    });

  // Start treatment — only from "aberta"
  const startTreatment = useMutation({
    mutationFn: async (contingencyId: string) => {
      if (!profile?.id) throw new Error("Não autenticado");
      await assertStatusTransition(contingencyId, ["aberta"], "em_andamento");

      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({ status: "em_andamento", updated_at: now })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "inicio_tratamento",
        executado_por: profile.id,
        observacao: "Tratamento iniciado",
      });

      // Audit trail on assignment
      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();
      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_inicio_tratamento",
          executado_por: profile.id,
          dados_novos: { contingency_id: contingencyId },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      toast.success("Tratamento iniciado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Resolve contingency — only from "em_andamento"
  const resolveContingency = useMutation({
    mutationFn: async ({
      contingencyId,
      observacao,
      evidenciaUrl,
    }: {
      contingencyId: string;
      observacao: string;
      evidenciaUrl?: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      if (!observacao.trim()) throw new Error("Ação corretiva obrigatória.");
      await assertStatusTransition(contingencyId, ["em_andamento"], "resolvida");

      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({
          status: "resolvida",
          resolvida_em: now,
          updated_at: now,
        })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "resolucao",
        executado_por: profile.id,
        observacao,
        evidencia_url: evidenciaUrl || null,
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();

      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_resolvida",
          executado_por: profile.id,
          motivo: observacao,
          dados_novos: { contingency_id: contingencyId },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["contingency_resolution_logs"] });
      toast.success("Contingência marcada como resolvida.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Validate resolution — only from "resolvida", restricted to validador/admin
  const validateResolution = useMutation({
    mutationFn: async ({
      contingencyId,
      approved,
      observacao,
    }: {
      contingencyId: string;
      approved: boolean;
      observacao?: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");

      // Check validador permission
      await assertIsValidador(contingencyId, profile.id, isAdmin);

      const targetStatus = approved ? "validada" : "aberta";
      await assertStatusTransition(contingencyId, ["resolvida"], targetStatus);

      const now = new Date().toISOString();
      const updatePayload: any = {
        status: targetStatus,
        updated_at: now,
      };
      if (approved) {
        updatePayload.validada_em = now;
        updatePayload.validada_por = profile.id;
      } else {
        // Clear residual data on rejection
        updatePayload.resolvida_em = null;
      }

      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update(updatePayload)
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: approved ? "validacao_aprovada" : "validacao_reprovada",
        executado_por: profile.id,
        observacao: observacao || (approved ? "Resolução validada" : "Resolução reprovada — contingência reaberta"),
      });

      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();

      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: approved ? "contingencia_validada" : "contingencia_reaberta",
          executado_por: profile.id,
          motivo: observacao || null,
          dados_novos: { contingency_id: contingencyId, status: targetStatus },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      qc.invalidateQueries({ queryKey: ["contingency_resolution_logs"] });
      toast.success("Validação registrada.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Discard contingency — only from "aberta" or "em_andamento"
  const discardContingency = useMutation({
    mutationFn: async ({
      contingencyId,
      observacao,
    }: {
      contingencyId: string;
      observacao: string;
    }) => {
      if (!profile?.id) throw new Error("Não autenticado");
      if (!observacao.trim()) throw new Error("Justificativa obrigatória.");
      await assertStatusTransition(contingencyId, ["aberta", "em_andamento"], "descartada");

      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from("operational_contingencies")
        .update({ status: "descartada", updated_at: now })
        .eq("id", contingencyId);
      if (error) throw error;

      await (supabase as any).from("operational_contingency_resolution_logs").insert({
        contingency_id: contingencyId,
        acao: "descarte",
        executado_por: profile.id,
        observacao,
      });

      // Audit trail on assignment
      const { data: cont } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id")
        .eq("id", contingencyId)
        .single();
      if (cont?.assignment_id) {
        await (supabase as any).from("operational_audit_trail").insert({
          assignment_id: cont.assignment_id,
          tipo_evento: "contingencia_descartada",
          executado_por: profile.id,
          motivo: observacao,
          dados_novos: { contingency_id: contingencyId },
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      toast.success("Contingência descartada.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // SLA helpers
  const getSlaInfo = (contingency: any) => {
    if (!contingency.prazo_sla) return null;
    const now = new Date().getTime();
    const sla = new Date(contingency.prazo_sla).getTime();
    const diffMs = sla - now;
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const isExpired = diffMs < 0;
    const agingDays = isExpired ? Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24)) : 0;

    return {
      diffHours,
      isExpired,
      agingDays,
      label: isExpired
        ? `Vencido há ${agingDays}d`
        : diffHours < 1
        ? "< 1h restante"
        : `${diffHours}h restantes`,
    };
  };

  // Check if current user can validate a contingency
  const canValidate = (contingency: any): boolean => {
    if (isAdmin) return true;
    const validadorId = contingency?.assignment?.validador_contingencia_id;
    return !!validadorId && validadorId === profile?.id;
  };

  // Categorize
  const abertas = contingencies.filter((c: any) => c.status === "aberta");
  const emTratamento = contingencies.filter((c: any) => c.status === "em_andamento");
  const resolvidas = contingencies.filter((c: any) => c.status === "resolvida");
  const validadas = contingencies.filter((c: any) => ["validada", "descartada"].includes(c.status));
  const vencidas = contingencies.filter((c: any) => {
    if (["validada", "descartada", "resolvida"].includes(c.status)) return false;
    if (!c.prazo_sla) return false;
    return new Date(c.prazo_sla).getTime() < Date.now();
  });

  return {
    contingencies,
    isLoading,
    abertas,
    emTratamento,
    resolvidas,
    validadas,
    vencidas,
    startTreatment,
    resolveContingency,
    validateResolution,
    discardContingency,
    getSlaInfo,
    canValidate,
    useResolutionLogs,
    isSaving:
      startTreatment.isPending ||
      resolveContingency.isPending ||
      validateResolution.isPending ||
      discardContingency.isPending,
  };
}
