/**
 * tarefas_useAprovadorActions.ts
 *
 * Hook de actions do aprovador:
 *   - criarPlanoExecutor (RPC)
 *   - responderPlanoAuditor (RPC)
 *   - aprovarParaAuditoria (RPC)
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tarefasFluxoRpcService } from "../services/tarefas_fluxoRpcService";
import type { CriarPlanoInput } from "../services/tarefas_fluxoRpcService";
import type { RespostaPlanoValorJson } from "../types/tarefas_fluxoTypes";

export function useAprovadorActions(assignmentId: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_assignment", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_aprovador", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_auditor", assignmentId] });
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
    qc.invalidateQueries({ queryKey: ["operational_aprovacao_assignments"] });
  };

  const criarPlanoExecutor = useMutation({
    mutationFn: async (input: CriarPlanoInput) => {
      return tarefasFluxoRpcService.aprovadorCriarPlanoExecutor(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Plano criado e enviado ao executor.");
    },
    onError: (e: any) => toast.error(`Erro ao criar plano: ${e.message}`),
  });

  const responderPlanoAuditor = useMutation({
    mutationFn: async (input: {
      planoId: string;
      respostaValorJson: RespostaPlanoValorJson;
    }) => {
      return tarefasFluxoRpcService.aprovadorResponderPlanoAuditor(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Resposta enviada ao auditor.");
    },
    onError: (e: any) => toast.error(`Erro ao responder ao auditor: ${e.message}`),
  });

  const aprovarParaAuditoria = useMutation({
    mutationFn: async (input: {
      assignmentId: string;
      notas?: unknown;
    }) => {
      return tarefasFluxoRpcService.aprovadorAprovarParaAuditoria(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Tarefa enviada para auditoria.");
    },
    onError: (e: any) => toast.error(`Erro ao aprovar: ${e.message}`),
  });

  return {
    criarPlanoExecutor,
    responderPlanoAuditor,
    aprovarParaAuditoria,
    isSubmitting:
      criarPlanoExecutor.isPending ||
      responderPlanoAuditor.isPending ||
      aprovarParaAuditoria.isPending,
  };
}
