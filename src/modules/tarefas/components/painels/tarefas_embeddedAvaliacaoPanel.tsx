/**
 * EmbeddedAvaliacaoPanel — wrapper FINO sobre o fluxo legado de avaliação.
 *
 * Não substitui o painel legado (`tarefas_aguardandoAvaliacaoPanel`).
 * Apenas oferece um contrato único (PanelProps) para o registry/router.
 *
 * Ações (atalhos): aprovar / devolver / reprovar via useOperationalTransition,
 * delegando preenchimentos detalhados ao painel legado quando a ação exigir
 * formulário completo (linkado por callback `onOpenLegacy`).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import type { PanelProps } from "./tarefas_panelTypes";

export function EmbeddedAvaliacaoPanel({ ctx, onClose, onActionDone }: PanelProps) {
  const { transition } = useOperationalTransition();
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const a = ctx.assignment;

  async function run(action: any, m?: string) {
    setBusy(true);
    try {
      const r = await transition.mutateAsync({
        assignmentId: a.id,
        action,
        motivo: m,
        origem: "painel_avaliacao_wrapper",
        extraData: { papel_usado: ctx.role ?? undefined },
      });
      onActionDone?.(r.newStatus);
      onClose?.();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <p className="text-sm">
        Avaliação técnica disponível. Use os atalhos abaixo ou abra o fluxo completo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => run("avaliar_aprovar")}>
          Aprovar avaliação
        </Button>
      </div>
      <div className="pt-2 border-t space-y-2">
        <Label className="text-xs">Devolver / Reprovar — justificativa</Label>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy || !motivo.trim()}
            onClick={() => run("avaliar_devolver", motivo)}>
            Devolver
          </Button>
          <Button size="sm" variant="destructive" disabled={busy || !motivo.trim()}
            onClick={() => run("avaliar_reprovar", motivo)}>
            Reprovar
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        O fluxo completo (campos avaliados, scoring, anexos) continua no painel legado.
      </p>
    </div>
  );
}
