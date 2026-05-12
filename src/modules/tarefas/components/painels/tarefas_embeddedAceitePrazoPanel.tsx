/**
 * EmbeddedAceitePrazoPanel — modos: 'executor' | 'solicitante'.
 * Modo é resolvido pelo router (resolveMode). Não há lógica de modo aqui.
 *
 * Ações:
 *  - executor:
 *      - aceitar_tarefa (ABERTA → EM_ANDAMENTO)
 *      - negociar_prazo_executor (propor novo prazo + justificativa)
 *  - solicitante (em AGUARDANDO_ACEITE_PRAZO):
 *      - aceitar_renegociacao_solicitante (aplica novoPrazo)
 *      - manter_prazo_solicitante
 *      - recusar_renegociacao_solicitante (cancela com motivo)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { TASK_STATUS } from "@/modules/tarefas/services/tarefas_statusConstants";
import type { PanelProps } from "./tarefas_panelTypes";

export function EmbeddedAceitePrazoPanel({ ctx, mode, onClose, onActionDone }: PanelProps) {
  const { transition } = useOperationalTransition();
  const a = ctx.assignment;
  const [prazo, setPrazo] = useState<string>(a?.data_prevista ?? "");
  const [justificativa, setJustificativa] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: any, extra: Record<string, any> = {}, motivo?: string) {
    setBusy(true);
    try {
      const r = await transition.mutateAsync({
        assignmentId: a.id,
        action,
        motivo,
        origem: `painel_aceite_prazo:${mode}`,
        extraData: { papel_usado: ctx.role ?? undefined, ...extra },
      });
      onActionDone?.(r.newStatus);
      onClose?.();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "solicitante") {
    return (
      <div className="space-y-3 p-3 rounded-lg border bg-card">
        <p className="text-sm">
          O executor propôs um novo prazo. Decida abaixo:
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run("aceitar_renegociacao_solicitante", {
              novoPrazo: a.data_prevista,
              prazo_anterior: a.data_prevista,
            })}
          >
            Aceitar novo prazo
          </Button>
          <Button size="sm" variant="secondary" disabled={busy}
            onClick={() => run("manter_prazo_solicitante", { prazo_anterior: a.data_prevista })}>
            Manter prazo original
          </Button>
        </div>
        <div className="pt-2 border-t space-y-2">
          <Label className="text-xs">Recusar e cancelar — justificativa</Label>
          <Textarea
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            placeholder="Por que está recusando?"
            rows={2}
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || !justificativa.trim()}
            onClick={() => run(
              "recusar_renegociacao_solicitante",
              { prazo_anterior: a.data_prevista },
              justificativa,
            )}
          >
            Recusar e cancelar
          </Button>
        </div>
      </div>
    );
  }

  // executor
  const isAberta = ctx.status === TASK_STATUS.ABERTA;
  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <p className="text-sm">
        {isAberta
          ? "Nova solicitação. Aceite ou proponha um novo prazo."
          : "Você propôs um novo prazo. Aguardando solicitante."}
      </p>
      {isAberta && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run("aceitar_tarefa")}
        >
          Aceitar e iniciar
        </Button>
      )}
      <div className="pt-2 border-t space-y-2">
        <Label className="text-xs">Propor novo prazo</Label>
        <Input
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
        />
        <Textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          placeholder="Justificativa (obrigatória)"
          rows={2}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !prazo || !justificativa.trim() || !ctx.cfg.renegociacao.permite}
          onClick={() => run(
            "negociar_prazo_executor",
            { prazo_proposto: prazo, prazo_anterior: a.data_prevista },
            justificativa,
          )}
        >
          Propor novo prazo
        </Button>
        {!ctx.cfg.renegociacao.permite && (
          <p className="text-xs text-muted-foreground">Renegociação desabilitada nesta tarefa.</p>
        )}
      </div>
    </div>
  );
}
