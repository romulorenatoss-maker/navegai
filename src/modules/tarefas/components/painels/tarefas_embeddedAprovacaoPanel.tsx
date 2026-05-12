/**
 * EmbeddedAprovacaoPanel — wrapper FINO sobre o fluxo legado de aprovação.
 * Mantém o fluxo legado intacto. Oferece contrato único ao registry.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import type { PanelProps } from "./tarefas_panelTypes";

export function EmbeddedAprovacaoPanel({ ctx, onClose, onActionDone }: PanelProps) {
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
        origem: "painel_aprovacao_wrapper",
        extraData: { papel_usado: ctx.role ?? undefined },
      });
      onActionDone?.(r.newStatus);
      onClose?.();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <p className="text-sm">Aprovação pendente.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => run("aprovar_final")}>
          Aprovar
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run("encerrar_final")}>
          Encerrar (sem aprovar)
        </Button>
      </div>
      <div className="pt-2 border-t space-y-2">
        <Label className="text-xs">Reprovar / Devolver — justificativa</Label>
        <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
        <Button size="sm" variant="destructive" disabled={busy || !motivo.trim()}
          onClick={() => run("reprovar_devolver_final", motivo)}>
          Reprovar e devolver
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Fluxo completo de aprovação (anexos, formulário) continua no painel legado.
      </p>
    </div>
  );
}
