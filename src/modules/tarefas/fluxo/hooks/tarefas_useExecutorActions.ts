/**
 * tarefas_useExecutorActions.ts
 *
 * Hook de actions do executor. Encapsula:
 *   - executorEnviarRespostas (RPC)
 *   - executorResponderPlanoAprovador (RPC)
 *
 * Toda ação retorna mutation com onSuccess que invalida queries do hook
 * de leitura (useFluxoTarefa).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { tarefasFluxoRpcService } from "../services/tarefas_fluxoRpcService";
import type {
  ExecutorRespostaInput,
} from "../services/tarefas_fluxoRpcService";
import type { RespostaPlanoValorJson } from "../types/tarefas_fluxoTypes";

export function useExecutorActions(assignmentId: string | null) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_assignment", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_respostas_originais", assignmentId] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_aprovador", assignmentId] });
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
  };

  const enviarRespostas = useMutation({
    mutationFn: async (input: {
      assignmentId: string;
      respostas: ExecutorRespostaInput[];
    }) => {
      return tarefasFluxoRpcService.executorEnviarRespostas(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Respostas enviadas ao aprovador.");
    },
    onError: (e: any) => toast.error(`Erro ao enviar: ${e.message}`),
  });

  const responderPlanoAprovador = useMutation({
    mutationFn: async (input: {
      planoId: string;
      respostaValorJson: RespostaPlanoValorJson;
    }) => {
      return tarefasFluxoRpcService.executorResponderPlanoAprovador(input);
    },
    onSuccess: () => {
      invalidate();
      toast.success("Resposta enviada ao aprovador.");
    },
    onError: (e: any) => toast.error(`Erro ao responder plano: ${e.message}`),
  });

  return {
    enviarRespostas,
    responderPlanoAprovador,
    isSubmitting:
      enviarRespostas.isPending || responderPlanoAprovador.isPending,
  };
}
