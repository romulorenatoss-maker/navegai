import { useMemo, useState } from "react";
import { AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ResumoNotasPerguntaCard, type ResumoNotasRespostaManual } from "./tarefas_resumoNotasPerguntaCard";
import { useResumoNotas, type ResumoNotasModo } from "../hooks/tarefas_useResumoNotas";
import type { TarefaFluxoData } from "../types/tarefas_fluxoTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: ResumoNotasModo;
  data: TarefaFluxoData | null;
  isSubmitting?: boolean;
  onConfirmar: (notas: unknown) => void;
}

export function ResumoNotasModal({ open, onOpenChange, modo, data, isSubmitting, onConfirmar }: Props) {
  const resumo = useResumoNotas(data, modo);
  const [respostas, setRespostas] = useState<Record<string, ResumoNotasRespostaManual>>({});

  const naSemJustificativa = useMemo(
    () =>
      resumo.perguntasManuais.some((p) => {
        const r = respostas[p.id];
        return r?.na && !r.justificativaNa?.trim();
      }),
    [respostas, resumo.perguntasManuais],
  );

  const payload = {
    origem: "resumo_notas_frontend",
    modo,
    destino: resumo.destino,
    respostas_manuais: respostas,
    perguntas_automaticas: resumo.perguntasAutomaticas.map((p) => ({
      id: p.id,
      metrica_pendente: p.metricaPendente,
      valor_exibido: p.valorExibido,
    })),
    score_existente: resumo.scoreExistente,
    backend_pendente: resumo.backendPendente,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-3xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">
            Resumo de Notas · {modo === "aprovador" ? "Aprovação" : "Auditoria"}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-132px)]">
          <div className="p-4 space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Esta nota será lançada para: <strong>{resumo.destino.label}</strong>
            </div>

            {resumo.backendPendente && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Há métricas/destino pendentes de backend. O frontend está preparado, sem assumir cálculo final.
              </div>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Perguntas automáticas
              </h3>
              {resumo.perguntasAutomaticas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pergunta automática encontrada.</p>
              ) : (
                resumo.perguntasAutomaticas.map((p) => (
                  <ResumoNotasPerguntaCard key={p.id} pergunta={p} />
                ))
              )}
            </section>

            <Separator />

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Perguntas manuais
              </h3>
              {resumo.perguntasManuais.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pergunta manual encontrada.</p>
              ) : (
                resumo.perguntasManuais.map((p) => (
                  <ResumoNotasPerguntaCard
                    key={p.id}
                    pergunta={p}
                    resposta={respostas[p.id]}
                    onChange={(patch) =>
                      setRespostas((prev) => ({
                        ...prev,
                        [p.id]: { ...(prev[p.id] ?? {}), ...patch },
                      }))
                    }
                  />
                ))
              )}
            </section>

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              Nota parcial/final: {modo === "aprovador"
                ? resumo.scoreExistente.aprovacao ?? "pendente de backend"
                : resumo.scoreExistente.aprovador ?? resumo.scoreExistente.auditor ?? "pendente de backend"}
            </div>
          </div>
        </ScrollArea>

        <div className="px-4 py-3 border-t bg-muted/20 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Resumo da nota
          </p>
          {(() => {
            const todas = [...resumo.perguntasAutomaticas, ...resumo.perguntasManuais];
            const algumPendente = todas.some(
              (p) => p.descontoAplicado === null || p.descontoAplicado === undefined,
            );
            const mantidos = todas.reduce(
              (acc, p) =>
                p.descontoAplicado !== null && p.descontoAplicado !== undefined && (p.descontoAplicado as number) <= 0
                  ? acc + p.peso
                  : acc,
              0,
            );
            const descontos = todas.reduce(
              (acc, p) =>
                p.descontoAplicado !== null && p.descontoAplicado !== undefined && (p.descontoAplicado as number) > 0
                  ? acc + (p.descontoAplicado as number)
                  : acc,
              0,
            );
            const devolvidosNa = resumo.perguntasManuais.reduce((acc, p) => {
              const r = respostas[p.id];
              return r?.na ? acc + p.pontoDevolvidoNa : acc;
            }, 0);
            const notaFinal =
              modo === "aprovador"
                ? resumo.scoreExistente.aprovacao
                : resumo.scoreExistente.aprovador ?? resumo.scoreExistente.auditor;

            return (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span className="text-emerald-700">
                  Pontos mantidos: {algumPendente ? "pendente de backend" : `+${mantidos}`}
                </span>
                <span className="text-red-700">
                  Descontos: {algumPendente ? "pendente de backend" : `-${descontos}`}
                </span>
                <span className="text-blue-700">
                  Pontos devolvidos por N/A: {devolvidosNa}
                </span>
                <span className="font-semibold text-foreground">
                  Nota final: {notaFinal ?? "pendente de backend"}
                </span>
              </div>
            );
          })()}
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => onConfirmar(payload)}
            disabled={isSubmitting || naSemJustificativa || resumo.isLoading}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {modo === "aprovador" ? "Enviar para auditoria" : "Concluir auditoria"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
