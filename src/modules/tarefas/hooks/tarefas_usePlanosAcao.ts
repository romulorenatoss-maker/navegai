/**
 * tarefas_usePlanosAcao.ts
 *
 * Hook UTILITÁRIO que abstrai as novas tabelas e RPCs de planos de ação
 * separados por setor (tarefas_planos_acao_aprovador / tarefas_planos_acao_auditor).
 *
 * Doc da arquitetura: src/modules/tarefas/docs/tarefas_arquitetura_planos_acao.md
 *
 * - READ: queries diretas nas duas tabelas (RLS controla tenant)
 * - WRITE: somente via RPCs (políticas bloqueiam INSERT/UPDATE direto)
 *
 * Coexistência com legacy:
 *   operational_field_reviews continua sendo lida por hooks antigos
 *   (useApprovalFlow / useAuditFlow). Este hook só toca nas tabelas novas.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// =============================================================================
// Tipos
// =============================================================================
export interface PlanoAcaoItem {
  tipo: "foto" | "video" | "audio" | "texto" | "descricao";
  titulo: string;
  obrigatorio: boolean;
}

export interface PlanoAcaoRespostaPayload {
  // Estrutura indexada por POSIÇÃO do item no itens_plano (suporta múltiplos
  // itens do mesmo tipo). Chave = string do índice ("0", "1", "2"...).
  // Cada valor carrega o `tipo` redundante para facilitar a leitura.
  // Exemplo:
  //   { "0": {tipo:"foto", evidencia_url:"..."},
  //     "1": {tipo:"foto", evidencia_url:"..."},
  //     "2": {tipo:"texto", valor_texto:"..."} }
  [indice: string]: {
    tipo?: "foto" | "video" | "audio" | "texto" | "descricao";
    evidencia_url?: string;
    evidencia_anexo_id?: string;
    evidencia_mime_type?: string;
    valor_texto?: string;
  };
}

export interface PlanoAcaoRow {
  id: string;
  assignment_id: string;
  field_id: string;
  rodada: number;
  instrucao: string | null;
  itens_plano: PlanoAcaoItem[];
  prazo_resolucao: string | null;
  criticidade: "baixa" | "media" | "alta" | null;
  criado_em: string;
  criado_por: string | null;
  respondido: boolean;
  respondido_em: string | null;
  respondido_por: string | null;
  resposta_valor_json: PlanoAcaoRespostaPayload | null;
  tenant_id: string | null;
  deleted_at: string | null;
}

interface CriarPlanoInput {
  assignmentId: string;
  fieldId: string;
  instrucao: string;
  itensPlano: PlanoAcaoItem[];
  prazoResolucao: string; // ISO
  criticidade?: "baixa" | "media" | "alta";
}

interface ResponderPlanoInput {
  planoId: string;
  respostaValorJson: PlanoAcaoRespostaPayload;
}

// =============================================================================
// Hook principal
// =============================================================================
export function usePlanosAcao(assignmentId: string | null) {
  const qc = useQueryClient();

  // ---------------------------------------------------------------------------
  // QUERIES (read)
  // ---------------------------------------------------------------------------
  const { data: planosAprovador = [], isLoading: loadingAprov } = useQuery({
    queryKey: ["tarefas_planos_acao_aprovador", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("tarefas_planos_acao_aprovador")
        .select("*")
        .eq("assignment_id", assignmentId)
        .is("deleted_at", null)
        .order("rodada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanoAcaoRow[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: planosAuditor = [], isLoading: loadingAudit } = useQuery({
    queryKey: ["tarefas_planos_acao_auditor", assignmentId],
    queryFn: async () => {
      if (!assignmentId) return [];
      const { data, error } = await (supabase as any)
        .from("tarefas_planos_acao_auditor")
        .select("*")
        .eq("assignment_id", assignmentId)
        .is("deleted_at", null)
        .order("rodada", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanoAcaoRow[];
    },
    enabled: !!assignmentId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Helpers de invalidação após mutation
  const invalidarTudo = () => {
    qc.invalidateQueries({ queryKey: ["tarefas_planos_acao_aprovador", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_planos_acao_auditor", assignmentId] });
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
  };

  // ---------------------------------------------------------------------------
  // MUTATIONS (write via RPC)
  // ---------------------------------------------------------------------------
  const criarPlanoAprovador = useMutation({
    mutationFn: async (input: CriarPlanoInput) => {
      const { data, error } = await (supabase as any).rpc(
        "tarefas_rpc_aprovador_criar_plano_acao",
        {
          p_assignment_id: input.assignmentId,
          p_field_id: input.fieldId,
          p_instrucao: input.instrucao,
          p_itens_plano: input.itensPlano,
          p_prazo_resolucao: input.prazoResolucao,
          p_criticidade: input.criticidade ?? "media",
        },
      );
      if (error) throw error;
      return data as PlanoAcaoRow;
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Plano de ação criado para o executor.");
    },
    onError: (e: any) => toast.error(`Erro ao criar plano: ${e.message}`),
  });

  const responderPlanoAprovador = useMutation({
    mutationFn: async (input: ResponderPlanoInput) => {
      const { data, error } = await (supabase as any).rpc(
        "tarefas_rpc_executor_responder_plano_aprovador",
        {
          p_plano_id: input.planoId,
          p_resposta_valor_json: input.respostaValorJson,
        },
      );
      if (error) throw error;
      return data as PlanoAcaoRow;
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Resposta enviada ao aprovador.");
    },
    onError: (e: any) => toast.error(`Erro ao responder: ${e.message}`),
  });

  const criarPlanoAuditor = useMutation({
    mutationFn: async (input: CriarPlanoInput) => {
      const { data, error } = await (supabase as any).rpc(
        "tarefas_rpc_auditor_criar_plano_acao",
        {
          p_assignment_id: input.assignmentId,
          p_field_id: input.fieldId,
          p_instrucao: input.instrucao,
          p_itens_plano: input.itensPlano,
          p_prazo_resolucao: input.prazoResolucao,
          p_criticidade: input.criticidade ?? "media",
        },
      );
      if (error) throw error;
      return data as PlanoAcaoRow;
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Plano de ação enviado ao aprovador.");
    },
    onError: (e: any) => toast.error(`Erro ao criar plano: ${e.message}`),
  });

  const responderPlanoAuditor = useMutation({
    mutationFn: async (input: ResponderPlanoInput) => {
      const { data, error } = await (supabase as any).rpc(
        "tarefas_rpc_aprovador_responder_plano_auditor",
        {
          p_plano_id: input.planoId,
          p_resposta_valor_json: input.respostaValorJson,
        },
      );
      if (error) throw error;
      return data as PlanoAcaoRow;
    },
    onSuccess: () => {
      invalidarTudo();
      toast.success("Resposta enviada ao auditor.");
    },
    onError: (e: any) => toast.error(`Erro ao responder: ${e.message}`),
  });

  // ---------------------------------------------------------------------------
  // Helpers de leitura
  // ---------------------------------------------------------------------------
  const planosAprovadorPorField = (fieldId: string) =>
    (planosAprovador as PlanoAcaoRow[]).filter((p) => p.field_id === fieldId);

  const planosAuditorPorField = (fieldId: string) =>
    (planosAuditor as PlanoAcaoRow[]).filter((p) => p.field_id === fieldId);

  const planosAuditorPendentes = (planosAuditor as PlanoAcaoRow[]).filter((p) => !p.respondido);
  const planosAprovadorPendentes = (planosAprovador as PlanoAcaoRow[]).filter((p) => !p.respondido);

  return {
    // dados
    planosAprovador: planosAprovador as PlanoAcaoRow[],
    planosAuditor: planosAuditor as PlanoAcaoRow[],
    planosAprovadorPendentes,
    planosAuditorPendentes,
    isLoading: loadingAprov || loadingAudit,

    // helpers
    planosAprovadorPorField,
    planosAuditorPorField,

    // mutations
    criarPlanoAprovador,
    responderPlanoAprovador,
    criarPlanoAuditor,
    responderPlanoAuditor,

    // utils
    invalidarTudo,
  };
}
