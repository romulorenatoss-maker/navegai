/**
 * tarefas_fluxoExecutorPanel.tsx
 *
 * Painel do EXECUTOR. Comportamento:
 *  - perguntas originais quando ainda não enviadas
 *  - histórico travado depois do envio
 *  - planos do aprovador pendentes (R1/R2/R3) com card de resposta
 *  - botão único "Enviar respostas" quando há rascunho
 *
 * Não permite editar resposta original depois de enviar.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useFluxoTarefa } from "../hooks/tarefas_useFluxoTarefa";
import { useExecutorActions } from "../hooks/tarefas_useExecutorActions";
import { useFluxoPermissoes } from "../hooks/tarefas_useFluxoPermissoes";
import { statusLabel } from "../services/tarefas_fluxoStatusMachine";
import { ExecutorPlanoAprovadorCard } from "@/modules/tarefas/components/tarefas_executorPlanoAprovadorCard";
import { DynamicFieldRenderer } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import type { ExecutorRespostaInput } from "../services/tarefas_fluxoRpcService";

interface Props {
  assignmentId: string;
}

export function FluxoExecutorPanel({ assignmentId }: Props) {
  const { data, isLoading, invalidate } = useFluxoTarefa(assignmentId);
  const actions = useExecutorActions(assignmentId);
  const perms = useFluxoPermissoes(data);

  // Rascunho local da resposta R0 (antes do envio)
  const [rascunho, setRascunho] = useState<Record<string, ExecutorRespostaInput>>({});

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando tarefa...
      </div>
    );
  }

  const a = data.assignment;
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
      // toast já é mostrado pelo hook
    }
  };

  return (
    <div className="space-y-3">
      {/* Cabeçalho */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span>#{a.numero_tarefa} · {a.nome}</span>
            <Badge variant="outline">{statusLabel(a.status)}</Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Planos pendentes do aprovador (alta prioridade — topo) */}
      {data.planosAprovadorPendentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            📨 Planos de ação aguardando sua resposta ({data.planosAprovadorPendentes.length})
          </p>
          {data.planosAprovadorPendentes.map((p) => {
            const pergunta = data.perguntas.find((q) => q.fieldId === p.field_id);
            return (
              <ExecutorPlanoAprovadorCard
                key={p.id}
                plano={p}
                fieldLabel={pergunta?.label}
                assignmentId={a.id}
                tipoTarefa={(a.origem ?? "rotina") as string}
                codigoTarefa={`#${String(a.numero_tarefa ?? "").padStart(4, "0")}`}
                nomeTarefa={a.nome ?? "tarefa"}
                isResponding={actions.responderPlanoAprovador.isPending}
                onResponder={async (input) => {
                  await actions.responderPlanoAprovador.mutateAsync(input);
                }}
              />
            );
          })}
        </div>
      )}

      {/* Perguntas: R0 editável apenas se podeEditarOriginal; senão histórico read-only */}
      {data.perguntas.map((p) => (
        <div key={p.fieldId} className="space-y-2">
          {perms.podeEditarOriginal ? (
            <DynamicFieldRenderer
              field={p.snapshot as any}
              answer={(rascunho[p.fieldId] as any) ?? (p.respostaOriginalExecutor as any) ?? null}
              review={null as any}
              userRole="executor"
              disabled={false}
              allAnswers={{} as any}
              onChange={(fid: string, patch: any) => updateRascunho(fid, patch)}
              assignmentId={a.id}
              numeroTarefa={a.numero_tarefa ?? 0}
              nomeTarefa={a.nome ?? "tarefa"}
              origemTarefa={(a.origem ?? "rotina") as any}
              lockOriginal={false}
            />
          ) : (
            <ReadOnlyR0 pergunta={p} />
          )}
        </div>
      ))}

      {/* Botão único de envio (só quando podeEnviarRespostas e há rascunho ou primeira vez) */}
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

function ReadOnlyR0({ pergunta }: { pergunta: any }) {
  const r0 = pergunta.respostaOriginalExecutor;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{pergunta.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        {r0 ? (
          <>
            <div>
              Resposta:{" "}
              <span className="font-semibold">
                {r0.valor_booleano === true && "Conforme/Sim"}
                {r0.valor_booleano === false && "Não conforme/Não"}
                {r0.valor_texto === "na" && "N/A"}
                {r0.valor_booleano === null && r0.valor_texto !== "na" && (r0.valor_texto ?? "(sem resposta)")}
              </span>
            </div>
            {r0.observacao && <div className="text-muted-foreground">Obs: {r0.observacao}</div>}
            {r0.evidencia_url && (
              <p className="text-[10px] text-muted-foreground">📎 evidência anexada</p>
            )}
            {r0.respondido_em && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Respondida em {new Date(r0.respondido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </>
        ) : (
          <p className="italic text-muted-foreground">Sem resposta.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default FluxoExecutorPanel;
