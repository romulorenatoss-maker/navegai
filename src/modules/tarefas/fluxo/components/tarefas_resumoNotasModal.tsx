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

  const totaisNotas = useMemo(() => {
    const automaticas = resumo.perguntasAutomaticas.reduce(
      (acc, pergunta) => {
        const peso = Number(pergunta.peso ?? 0);
        acc.total += peso;

        if (pergunta.descontoAplicado === null || pergunta.descontoAplicado === undefined || pergunta.metricaPendente) {
          acc.semDados += 1;
          return acc;
        }

        const desconto = Math.max(0, Number(pergunta.descontoAplicado ?? 0));
        acc.descontos += desconto;
        acc.pontos += Math.max(0, peso - desconto);
        return acc;
      },
      { total: 0, pontos: 0, descontos: 0, devolvidosNa: 0, semDados: 0 },
    );

    const manuais = resumo.perguntasManuais.reduce(
      (acc, pergunta) => {
        const peso = Number(pergunta.peso ?? 0);
        const resposta = respostas[pergunta.id];

        acc.total += peso;
        if (resposta?.na) {
          const devolvido = Number(pergunta.pontoDevolvidoNa ?? peso);
          acc.pontos += devolvido;
          acc.devolvidosNa += devolvido;
          return acc;
        }

        if (resposta?.resultado === "ok") {
          acc.pontos += peso;
          return acc;
        }

        if (resposta?.resultado === "nao_ok") {
          acc.descontos += peso;
          return acc;
        }

        acc.manuaisPendentes += 1;
        return acc;
      },
      { total: 0, pontos: 0, descontos: 0, devolvidosNa: 0, manuaisPendentes: 0 },
    );

    return {
      total: automaticas.total + manuais.total,
      pontos: automaticas.pontos + manuais.pontos,
      descontos: automaticas.descontos + manuais.descontos,
      devolvidosNa: automaticas.devolvidosNa + manuais.devolvidosNa,
      semDados: automaticas.semDados,
      manuaisPendentes: manuais.manuaisPendentes,
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
    resumo_totais: totaisNotas,
    backend_pendente: resumo.backendPendente,
  };

  const notaFinalExistente =
    modo === "aprovador"
      ? resumo.scoreExistente.aprovacao
      : resumo.scoreExistente.aprovador ?? resumo.scoreExistente.auditor;
  const notaFinalTexto = notaFinalExistente ?? `${totaisNotas.pontos}/${totaisNotas.total}`;
  const destinoPendente = resumo.destino.tipo === "nao_mapeado" || resumo.destino.label === "nome nao carregado";
  const destinoPrefixo = resumo.destino.tipo === "setor" ? "setor " : resumo.destino.tipo === "pessoa" ? "" : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-3xl h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base">
            Resumo de Notas - {modo === "aprovador" ? "Aprovacao" : "Auditoria"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-4">
            {totaisNotas.semDados > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {totaisNotas.semDados} pergunta(s) automatica(s) estao sem dados suficientes no fluxo carregado.
              </div>
            )}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Perguntas automaticas
              </h3>
              {resumo.perguntasAutomaticas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma pergunta automatica encontrada.</p>
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
          <div className="rounded-md border bg-background p-3 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <p className="text-base font-bold">
                Nota final: <span className="text-primary">{notaFinalTexto}</span>
              </p>
              <span className="text-xs text-muted-foreground">Total possivel: {totaisNotas.total} pts</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                <p className="text-muted-foreground">Pontos ganhos</p>
                <p className="font-bold text-emerald-700">{totaisNotas.pontos}</p>
              </div>
              <div className="rounded border border-red-200 bg-red-50 px-2.5 py-2">
                <p className="text-muted-foreground">Pontos perdidos</p>
                <p className="font-bold text-red-700">-{totaisNotas.descontos}</p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2">
                <p className="text-muted-foreground">Devolvidos N/A</p>
                <p className="font-bold text-amber-800">{totaisNotas.devolvidosNa}</p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                <p className="text-muted-foreground">Sem dados</p>
                <p className="font-bold text-slate-700">{totaisNotas.semDados}</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Esta nota sera lancada para:{" "}
              <strong className={destinoPendente ? "text-amber-700" : "text-foreground"}>
                {destinoPendente ? resumo.destino.label : `${destinoPrefixo}${resumo.destino.label}`}
              </strong>
            </p>
          </div>

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
