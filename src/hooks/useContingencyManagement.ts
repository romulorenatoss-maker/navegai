import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface ContingencyFilters {
  responsavel_id?: string;
  status?: string;
  template_id?: string;
}

export function useContingencyManagement(filters: ContingencyFilters = {}) {
  const { profile } = useAuth();
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
            id, data_prevista, rodada_atual, status,
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

  // Start treatment
  const startTreatment = useMutation({
    mutationFn: async (contingencyId: string) => {
      if (!profile?.id) throw new Error("Não autenticado");
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contingency_management"] });
      toast.success("Tratamento iniciado.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Resolve contingency
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

      // Audit trail on assignment
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

  // Validate resolution
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

      const now = new Date().toISOString();
      const newStatus = approved ? "validada" : "aberta"; // reopen if rejected

      const updatePayload: any = {
        status: newStatus,
        updated_at: now,
      };
      if (approved) {
        updatePayload.validada_em = now;
        updatePayload.validada_por = profile.id;
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

      // Audit trail
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
          dados_novos: { contingency_id: contingencyId, status: newStatus },
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

  // Discard contingency
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
    useResolutionLogs,
    isSaving:
      startTreatment.isPending ||
      resolveContingency.isPending ||
      validateResolution.isPending ||
      discardContingency.isPending,
  };
}
