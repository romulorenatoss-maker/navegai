/**
 * EmbeddedValidacaoSolicitantePanel — solicitante valida a resposta do executor.
 *
 * Ações:
 *  - validar_solicitante_aprovar (com flags requerAvaliacao/requerAprovacao do cfg)
 *  - validar_solicitante_devolver (motivo obrigatório)
 *  - solicitar_plano_acao (motivo obrigatório)
 *  - reabrir_solicitante (placeholder — só fica visível em status terminal; aqui mostra "Concluir")
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import type { PanelProps } from "./tarefas_panelTypes";

export function EmbeddedValidacaoSolicitantePanel({ ctx, onClose, onActionDone }: PanelProps) {
  const { transition } = useOperationalTransition();
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const a = ctx.assignment;
  const cfg = ctx.cfg;

  async function run(action: any, extra: Record<string, any> = {}, m?: string) {
    setBusy(true);
    try {
      const r = await transition.mutateAsync({
        assignmentId: a.id,
        action,
        motivo: m,
        origem: "painel_validacao_solicitante",
        extraData: { papel_usado: ctx.role ?? undefined, ...extra },
      });
      onActionDone?.(r.newStatus);
      onClose?.();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <p className="text-sm">Resposta do executor — valide ou devolva.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run("validar_solicitante_aprovar", {
            requerAvaliacao: cfg.avaliacao.obrigatoria,
            requerAprovacao: cfg.aprovacao.obrigatoria,
            avaliador_id: cfg.avaliacao.avaliador_id ?? undefined,
            aprovador_id: cfg.aprovacao.aprovador_id ?? undefined,
          })}
        >
          Validar e concluir
        </Button>
        {cfg.permite_plano_acao && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !motivo.trim()}
            onClick={() => run("solicitar_plano_acao", {
              plano_acao_responsavel_id: cfg.responsavel_plano_acao_id ?? a.responsavel_id,
            }, motivo)}
          >
            Solicitar plano de ação
          </Button>
        )}
      </div>
      <div className="pt-2 border-t space-y-2">
        <Label className="text-xs">Justificativa (devolver / plano de ação)</Label>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Descreva o que precisa ser ajustado…"
          rows={3}
        />
        {cfg.permite_devolver && (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy || !motivo.trim()}
            onClick={() => run("validar_solicitante_devolver", { rodadaAtual: a.rodada_atual ?? 1 }, motivo)}
          >
            Devolver ao executor
          </Button>
        )}
      </div>
    </div>
  );
}
