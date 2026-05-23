/**
 * tarefas_fluxoExecutorPanel.tsx
 *
 * Painel do EXECUTOR.
 *
 * Regras visuais:
 * - R0 usa o renderer original da pergunta.
 * - Depois do envio, R0 fica read-only.
 * - Planos R1/R2/R3 do aprovador aparecem abaixo da pergunta vinculada.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useExecutorActions } from "../hooks/tarefas_useExecutorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { ExecutorPlanoAprovadorCard } from "@/modules/tarefas/components/tarefas_executorPlanoAprovadorCard";
import { DynamicFieldRenderer } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { FluxoPlanoAprovadorCard } from "./tarefas_fluxoPlanoAprovadorCard";
import { tarefasExtrairSlaResponsabilidades } from "@/modules/tarefas/utils/tarefas_slaPrazoUtils";
import type { ExecutorRespostaInput } from "../services/tarefas_fluxoRpcService";

interface Props {
  assignmentId: string;
  meusSetorIds?: string[];
}

export function FluxoExecutorPanel({ assignmentId, meusSetorIds = [] }: Props) {
  const { profile, isAdmin } = useAuth();
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useExecutorActions(assignmentId);
  const perms = useFluxoPermissoes(data, meusSetorIds);

  const [rascunho, setRascunho] = useState<Record<string, ExecutorRespostaInput>>({});

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tarefa...
      </div>
    );
  }

  const a = data.assignment;
  const sla = tarefasExtrairSlaResponsabilidades(a);

  const updateRascunho = (fieldId: string, patch: Partial<ExecutorRespostaInput>) => {
    setRascunho((prev) => ({
      ...prev,
      [fieldId]: { field_id: fieldId, ...(prev[fieldId] ?? { field_id: fieldId }), ...patch },
    }));
  };

  const handleEnviar = async () => {
    const respostas = Object.values(rascunho);
    if (respostas.length === 0) {
      toast.error("Preencha pelo menos uma resposta antes de enviar.");
      return;
    }

    try {
      await actions.enviarRespostas.mutateAsync({ assignmentId, respostas });
      setRascunho({});
      invalidate();
    } catch {
      // O hook ja mostra o toast de erro.
    }
  };

  const respostasPorPergunta = data.perguntas.reduce<Record<string, any>>((acc, pergunta) => {
    const resposta = (rascunho[pergunta.fieldId] as any) ?? (pergunta.respostaOriginalExecutor as any);
    if (resposta) acc[pergunta.fieldId] = resposta;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {data.perguntas.map((pergunta) => {
        const planosDaPergunta = [...pergunta.planosAprovador].sort((aPlano, bPlano) => aPlano.rodada - bPlano.rodada);
        const planosRespondidos = planosDaPergunta.filter((plano) => plano.respondido);
        const planosPendentes = planosDaPergunta.filter((plano) => !plano.respondido);
        const perguntaReadonly = !perms.podeEditarOriginal || planosDaPergunta.length > 0;

        return (
          <div key={pergunta.fieldId} className="space-y-2 max-w-full">
            <DynamicFieldRenderer
              field={pergunta.snapshot as any}
              answer={
                perguntaReadonly
                  ? ((pergunta.respostaOriginalExecutor as any) ?? null)
                  : ((rascunho[pergunta.fieldId] as any) ?? (pergunta.respostaOriginalExecutor as any) ?? null)
              }
              review={null as any}
              userRole="executor"
              disabled={perguntaReadonly}
              allAnswers={respostasPorPergunta}
              onChange={(fieldId: string, patch: any) => {
                if (!perguntaReadonly) updateRascunho(fieldId, patch);
              }}
              assignmentId={a.id}
              numeroTarefa={a.numero_tarefa ?? 0}
              nomeTarefa={a.nome ?? "tarefa"}
              origemTarefa={(a.origem ?? "rotina") as any}
              profileId={profile?.id}
              responsavelId={a.responsavel_id ?? undefined}
              setorExecutorId={a.setor_executor_id ?? undefined}
              meusSetorIds={meusSetorIds}
              isAdmin={isAdmin}
              lockOriginal={perguntaReadonly}
            />

            {planosDaPergunta.length > 0 && (
              <div className="space-y-2 pl-2 sm:pl-3 border-l-2 border-amber-300 max-w-full">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Historico incremental desta pergunta ({planosDaPergunta.length})
                </p>
                {planosRespondidos.map((plano) => (
                    <FluxoPlanoAprovadorCard
                      key={plano.id}
                      plano={plano}
                      papel="executor"
                      podeResponder={false}
                      slaPadraoHoras={sla.executorPlanoAprovadorHoras}
                      excluirFimSemanaSla={sla.excluirFimSemana}
                    />
                ))}
                {planosPendentes.map((plano) => (
                    <ExecutorPlanoAprovadorCard
                      key={plano.id}
                      plano={plano}
                      fieldLabel={pergunta.label}
                      assignmentId={a.id}
                      tipoTarefa={(a.origem ?? "rotina") as string}
                      codigoTarefa={`#${String(a.numero_tarefa ?? "").padStart(4, "0")}`}
                      nomeTarefa={a.nome ?? "tarefa"}
                      slaPadraoHoras={sla.executorPlanoAprovadorHoras}
                      excluirFimSemanaSla={sla.excluirFimSemana}
                      isResponding={actions.responderPlanoAprovador.isPending}
                      onResponder={async (input) => {
                        await actions.responderPlanoAprovador.mutateAsync(input);
                      }}
                    />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {perms.podeEnviarRespostas && data.planosAprovadorPendentes.length === 0 && (
        <div className="sticky bottom-0 bg-background pt-2 border-t">
          <Button
            type="button"
            size="sm"
            onClick={handleEnviar}
            disabled={actions.isSubmitting}
            className="w-full"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {actions.isSubmitting ? "Enviando..." : "Enviar respostas ao aprovador"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default FluxoExecutorPanel;
