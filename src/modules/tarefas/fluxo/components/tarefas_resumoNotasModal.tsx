import { useMemo, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ResumoNotasPerguntaCard, type ResumoNotasRespostaManual } from "./tarefas_resumoNotasPerguntaCard";
import { useResumoNotas, type ResumoNotasModo, type ResumoNotasPergunta } from "../hooks/tarefas_useResumoNotas";
import type { TarefaFluxoData } from "../types/tarefas_fluxoTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modo: ResumoNotasModo;
  data: TarefaFluxoData | null;
  isSubmitting?: boolean;
  onConfirmar: (notas: unknown) => void;
}

const respostaKey = (pergunta: ResumoNotasPergunta) => `${pergunta.origem}:${pergunta.id}`;

export function ResumoNotasModal({ open, onOpenChange, modo, data, isSubmitting, onConfirmar }: Props) {
  const resumo = useResumoNotas(data, modo);
  const [respostas, setRespostas] = useState<Record<string, ResumoNotasRespostaManual>>({});

  const perguntasResumo = useMemo(
    () =>
      [...resumo.perguntasAutomaticas, ...resumo.perguntasManuais].sort((a, b) => {
        const ordem = a.ordem - b.ordem;
        if (ordem !== 0) return ordem;
        return a.origem.localeCompare(b.origem);
      }),
    [resumo.perguntasAutomaticas, resumo.perguntasManuais],
  );

  const naSemJustificativa = useMemo(
    () =>
      perguntasResumo.some((p) => {
        const r = respostas[respostaKey(p)];
        return r?.na && !r.justificativaNa?.trim();
      }),
    [perguntasResumo, respostas],
  );

  const manualSemResultado = useMemo(
    () =>
      resumo.perguntasManuais.some((p) => {
        const r = respostas[respostaKey(p)];
        return !r?.na && !r?.resultado;
      }),
    [respostas, resumo.perguntasManuais],
  );

  const totaisNotas = useMemo(() => {
    return perguntasResumo.reduce(
      (acc, pergunta) => {
        const peso = Number(pergunta.peso ?? 0);
        const resposta = respostas[respostaKey(pergunta)];
        acc.total += peso;

        if (resposta?.na) {
          const devolvido = Number(pergunta.pontoDevolvidoNa ?? peso);
          acc.pontos += devolvido;
          acc.devolvidosNa += devolvido;
          return acc;
        }

        if (pergunta.origem === "manual") {
          if (resposta?.resultado === "ok") {
            acc.pontos += peso;
          } else if (resposta?.resultado === "nao_ok") {
            acc.descontos += peso;
          } else {
            acc.manuaisPendentes += 1;
          }
          return acc;
        }

        if (pergunta.descontoAplicado === null || pergunta.descontoAplicado === undefined || pergunta.metricaPendente) {
          acc.semDados += 1;
          return acc;
        }

        const desconto = Math.max(0, Number(pergunta.descontoAplicado ?? 0));
        acc.descontos += desconto;
        acc.pontos += Math.max(0, peso - desconto);
        return acc;
      },
      { total: 0, pontos: 0, descontos: 0, devolvidosNa: 0, semDados: 0, manuaisPendentes: 0 },
    );
  }, [perguntasResumo, respostas]);

  const confirmarDisabled = isSubmitting || naSemJustificativa || manualSemResultado || resumo.isLoading;
  const textoAcaoFinal = modo === "aprovador" ? "Enviar para auditoria" : "Confirmar Auditoria";
  const motivoBloqueio = resumo.isLoading
    ? "Carregando resumo de notas..."
    : naSemJustificativa
      ? "Justifique todos os itens marcados como N/A antes de enviar."
      : manualSemResultado
        ? "Marque OK, Nao OK ou N/A em todas as perguntas manuais antes de enviar."
        : null;

  const respostasManuais = resumo.perguntasManuais.reduce<Record<string, ResumoNotasRespostaManual>>((acc, p) => {
    const resposta = respostas[respostaKey(p)];
    if (resposta) acc[p.id] = resposta;
    return acc;
  }, {});

  const respostasNa = perguntasResumo.reduce<Record<string, ResumoNotasRespostaManual>>((acc, p) => {
    const resposta = respostas[respostaKey(p)];
    if (resposta?.na) acc[respostaKey(p)] = resposta;
    return acc;
  }, {});

  const payload = {
    origem: "resumo_notas_frontend",
    modo,
    destino: resumo.destino,
    respostas_manuais: respostasManuais,
    respostas_na: respostasNa,
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
  const notaFinalPontos = notaFinalExistente ?? totaisNotas.pontos;
  const destinoPendente = resumo.destino.tipo === "nao_mapeado" || resumo.destino.label === "nome nao carregado";
  const destinoPrefixo = resumo.destino.tipo === "setor" ? "setor " : resumo.destino.tipo === "pessoa" ? "" : "";
  const tituloNotaFinal = modo === "aprovador" ? "Nota final da Aprovacao" : "Nota final da Auditoria";
  const sujeitoNota = modo === "aprovador" ? "nota da aprovacao" : "nota do aprovador";
  const destinoLabel = destinoPendente ? resumo.destino.label : `${destinoPrefixo}${resumo.destino.label}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-24px)] max-w-3xl h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base">
            Resumo de Notas - {modo === "aprovador" ? "Aprovacao" : "Auditoria"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-4 space-y-3">
            {perguntasResumo.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma pergunta de nota encontrada.</p>
            ) : (
              perguntasResumo.map((p) => {
                const key = respostaKey(p);
                return (
                  <ResumoNotasPerguntaCard
                    key={key}
                    pergunta={p}
                    resposta={respostas[key]}
                    onChange={(patch) =>
                      setRespostas((prev) => ({
                        ...prev,
                        [key]: { ...(prev[key] ?? {}), ...patch },
                      }))
                    }
                  />
                );
              })
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-bold text-foreground">{tituloNotaFinal}</p>
                <p className="text-2xl font-bold text-blue-700 whitespace-nowrap">{notaFinalPontos} pts</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Total possivel: {totaisNotas.total} pts. Ganhos: {totaisNotas.pontos} pts. Perdidos: {totaisNotas.descontos} pts.
                {totaisNotas.devolvidosNa > 0 ? ` Devolvidos por N/A: ${totaisNotas.devolvidosNa} pts.` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Ao confirmar, {sujeitoNota} sera gravada para:{" "}
                <strong className={destinoPendente ? "text-amber-700" : "text-foreground"}>{destinoLabel}</strong>
              </p>
              {totaisNotas.semDados > 0 ? (
                <p className="text-xs text-slate-700">{totaisNotas.semDados} pergunta(s) sem dados suficientes.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-background space-y-3 shrink-0">
          {motivoBloqueio && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {motivoBloqueio}
            </div>
          )}

          <Separator />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Voltar
            </Button>
            <Button
              type="button"
              onClick={() => onConfirmar(payload)}
              disabled={confirmarDisabled}
              className="w-full sm:w-auto sm:min-w-[230px] bg-blue-600 hover:bg-blue-700 text-white"
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
