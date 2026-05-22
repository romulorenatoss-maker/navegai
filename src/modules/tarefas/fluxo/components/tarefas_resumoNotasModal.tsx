import { useMemo, useState } from "react";
import { AlertCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const manualSemResultado = useMemo(
    () =>
      resumo.perguntasManuais.some((p) => {
        const r = respostas[p.id];
        return !r?.na && !r?.resultado;
      }),
    [respostas, resumo.perguntasManuais],
  );

  const notaCalculadaPreview = useMemo(() => {
    const totalAuto = resumo.perguntasAutomaticas.reduce((s, p) => s + p.peso, 0);
    const pontosAuto = resumo.perguntasAutomaticas.reduce((s, p) => {
      if (p.descontoAplicado === null || p.descontoAplicado === undefined) return s;
      return s + Math.max(0, p.peso - p.descontoAplicado);
    }, 0);
    const autoCompleto = resumo.perguntasAutomaticas.every(
      (p) => p.descontoAplicado !== null && p.descontoAplicado !== undefined,
    );

    const totalManual = resumo.perguntasManuais.reduce((s, p) => s + p.peso, 0);
    const respondidas = resumo.perguntasManuais.filter((p) => {
      const r = respostas[p.id];
      return r?.na || r?.resultado;
    });
    const pontosManual = resumo.perguntasManuais.reduce((s, p) => {
      const r = respostas[p.id];
      if (r?.na) return s + p.pontoDevolvidoNa;
      if (r?.resultado === "ok") return s + p.peso;
      return s;
    }, 0);
    return {
      total: totalAuto + totalManual,
      pontos: pontosAuto + pontosManual,
      completo: autoCompleto && respondidas.length === resumo.perguntasManuais.length,
    };
  }, [respostas, resumo.perguntasAutomaticas, resumo.perguntasManuais]);

  const confirmarDisabled = isSubmitting || naSemJustificativa || manualSemResultado || resumo.isLoading;
  const textoAcaoFinal = modo === "aprovador" ? "Enviar respostas e notas ao auditor" : "Concluir auditoria com notas";
  const motivoBloqueio = resumo.isLoading
    ? "Carregando resumo de notas..."
    : naSemJustificativa
      ? "Justifique todos os itens marcados como N/A antes de enviar."
      : manualSemResultado
        ? "Marque OK, Nao OK ou N/A em todas as perguntas manuais antes de enviar."
        : null;

  const payload = {
    origem: "resumo_notas_frontend",
    modo,
    destino: resumo.destino,
    respostas_manuais: respostas,
    perguntas_automaticas: resumo.perguntasAutomaticas.map((p) => ({
      id: p.id,
      metrica_pendente: p.metricaPendente,
      resposta: p.respostaAutomatica,
      valor_exibido: p.valorExibido,
      peso: p.peso,
      desconto_aplicado: p.descontoAplicado,
      nota_obtida:
        p.descontoAplicado === null || p.descontoAplicado === undefined
          ? null
          : Math.max(0, p.peso - p.descontoAplicado),
    })),
    score_existente: resumo.scoreExistente,
    backend_pendente: resumo.backendPendente,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-3xl h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">
            Resumo de Notas · {modo === "aprovador" ? "Aprovação" : "Auditoria"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-4">
            {resumo.backendPendente && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Ha metricas/destino sem dados suficientes no fluxo atual. O resumo reaproveita o calculo existente sem assumir regra nova.
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
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/20 space-y-3 shrink-0">
          {(() => {
            const notaFinal =
              modo === "aprovador"
                ? resumo.scoreExistente.aprovacao
                : resumo.scoreExistente.aprovador ?? resumo.scoreExistente.auditor;
            const destinoPendente = resumo.destino.tipo === "nao_mapeado" || resumo.destino.label === "nome nao carregado";
            const destinoPrefixo =
              resumo.destino.tipo === "setor" ? "setor " : resumo.destino.tipo === "pessoa" ? "" : "";
            const notaTexto =
              notaFinal ?? (
                notaCalculadaPreview.total > 0
                  ? `nota calculada ${notaCalculadaPreview.pontos}/${notaCalculadaPreview.total}${notaCalculadaPreview.completo ? "" : " (incompleta)"}`
                  : "sem dados suficientes"
              );
            return (
              <>
                <p className="text-sm font-semibold">
                  Nota final:{" "}
                  <span className={notaFinal === null || notaFinal === undefined ? "text-amber-700" : "text-foreground"}>
                    {notaTexto}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Esta nota será lançada para:{" "}
                  <strong className={destinoPendente ? "text-amber-700" : "text-foreground"}>
                    {destinoPendente ? resumo.destino.label : `${destinoPrefixo}${resumo.destino.label}`}
                  </strong>
                </p>
              </>
            );
          })()}
          {motivoBloqueio && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {motivoBloqueio}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => onConfirmar(payload)}
              disabled={confirmarDisabled}
              className="w-full sm:flex-1"
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {isSubmitting ? "Enviando..." : textoAcaoFinal}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
