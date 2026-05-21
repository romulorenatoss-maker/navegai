/**
 * tarefas_useAuditorActions.ts
 *
 * Hook de actions do auditor:
 *   - criarPlanoAprovador (RPC)
 *   - aprovarAuditoria (RPC) — finaliza tarefa
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tarefasFluxoRpcService } from "../services/tarefas_fluxoRpcService";
import type { CriarPlanoInput } from "../services/tarefas_fluxoRpcService";

export function useAuditorActions(assignmentId: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_assignment", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_aprovador", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_auditor", assignmentId] });
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
  };

  const criarPlanoAprovador = useMutation({
    mutationFn: async (input: CriarPlanoInput) => {
      return tarefasFluxoRpcService.auditorCriarPlanoAprovador(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Plano criado e enviado ao aprovador.");
    },
    onError: (e: any) => toast.error(`Erro ao criar plano: ${e.message}`),
  });

  const aprovarAuditoria = useMutation({
    mutationFn: async (input: {
      assignmentId: string;
      notas?: unknown;
    }) => {
      return tarefasFluxoRpcService.auditorAprovarAuditoria(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Auditoria aprovada — tarefa concluída.");
    },
    onError: (e: any) => toast.error(`Erro ao aprovar auditoria: ${e.message}`),
  });

  return {
    criarPlanoAprovador,
    aprovarAuditoria,
    isSubmitting:
      criarPlanoAprovador.isPending || aprovarAuditoria.isPending,
  };
}
