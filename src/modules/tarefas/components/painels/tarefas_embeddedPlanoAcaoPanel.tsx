/**
 * EmbeddedPlanoAcaoPanel — executor responde plano; solicitante acompanha.
 *
 * Ações (executor):
 *  - concluir_plano_acao (resumo) → AGUARDANDO_VALIDACAO
 * Solicitante:
 *  - somente leitura + envio de mensagem operacional via messagesService.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { postMessage } from "@/modules/tarefas/services/tarefas_messagesService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { PanelProps } from "./tarefas_panelTypes";

export function EmbeddedPlanoAcaoPanel({ ctx, onClose, onActionDone }: PanelProps) {
  const { transition } = useOperationalTransition();
  const { profile } = useAuth() as any;
  const [resumo, setResumo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);
  const a = ctx.assignment;

  const isExecutor = ctx.isResp || ctx.isAdmin;

  async function concluir() {
    if (!resumo.trim()) return;
    setBusy(true);
    try {
      const r = await transition.mutateAsync({
        assignmentId: a.id,
        action: "concluir_plano_acao",
        origem: "painel_plano_acao",
        extraData: { papel_usado: ctx.role ?? undefined, resumo },
      });
      onActionDone?.(r.newStatus);
      onClose?.();
    } finally { setBusy(false); }
  }

  async function enviarMensagem() {
    if (!mensagem.trim() || !profile?.id) return;
    setBusy(true);
    try {
      await postMessage({
        assignmentId: a.id,
        autorId: profile.id,
        autorNome: profile.nome ?? null,
        autorPapel: ctx.role ?? null,
        channel: "solicitante_executor",
        texto: mensagem,
      });
      setMensagem("");
      toast.success("Mensagem enviada.");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-card">
      <p className="text-sm">
        {isExecutor ? "Plano de ação aberto. Descreva o que foi feito." : "Plano de ação em andamento (acompanhamento)."}
      </p>

      {isExecutor && (
        <div className="space-y-2">
          <Label className="text-xs">Resumo do plano executado</Label>
          <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} />
          <Button size="sm" disabled={busy || !resumo.trim()} onClick={concluir}>
            Concluir plano de ação
          </Button>
        </div>
      )}

      <div className="pt-2 border-t space-y-2">
        <Label className="text-xs">Mensagem operacional</Label>
        <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={2} />
        <Button size="sm" variant="secondary" disabled={busy || !mensagem.trim()} onClick={enviarMensagem}>
          Enviar mensagem
        </Button>
      </div>
    </div>
  );
}
