import { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { ResumoNotasPerguntaCard, type ResumoNotasRespostaManual } from "./tarefas_resumoNotasPerguntaCard";
import { useResumoNotas, type ResumoNotasModo, type ResumoNotasPergunta } from "../hooks/tarefas_useResumoNotas";
import type { TarefaFluxoData } from "../types/tarefas_fluxoTypes";

interface Props {
  modo: ResumoNotasModo;
  data: TarefaFluxoData | null;
  notasSalvas?: any | null;
  titulo?: string;
}

const respostaKey = (pergunta: ResumoNotasPergunta) => `${pergunta.origem}:${pergunta.id}`;

const getRespostaSalva = (notas: any, pergunta: ResumoNotasPergunta): ResumoNotasRespostaManual | undefined => {
  if (!notas || typeof notas !== "object") return undefined;
  const key = respostaKey(pergunta);
  if (pergunta.origem === "manual") {
    return notas.respostas_manuais?.[pergunta.id] ?? notas.respostas_na?.[key];
  }
  return notas.respostas_na?.[key];
};

export function ResumoNotasReadonly({ modo, data, notasSalvas, titulo }: Props) {
  const resumo = useResumoNotas(data, modo);

  const perguntasResumo = useMemo(
    () =>
      [...resumo.perguntasAutomaticas, ...resumo.perguntasManuais].sort((a, b) => {
        const ordem = a.ordem - b.ordem;
        if (ordem !== 0) return ordem;
        return a.origem.localeCompare(b.origem);
      }),
    [resumo.perguntasAutomaticas, resumo.perguntasManuais],
  );

  const totaisReconstruidos = useMemo(() => {
    return perguntasResumo.reduce(
      (acc, pergunta) => {
        const resposta = getRespostaSalva(notasSalvas, pergunta);
        acc.total += pergunta.peso;

        if (resposta?.na) {
          acc.pontos += pergunta.peso;
          acc.devolvidosNa += pergunta.peso;
          return acc;
        }

        if (pergunta.origem === "automatica" && !pergunta.metricaPendente) {
          const desconto = pergunta.descontoAplicado ?? 0;
          acc.pontos += Math.max(0, pergunta.peso - desconto);
          acc.descontos += desconto;
          return acc;
        }

        if (pergunta.origem === "manual" && resposta?.resultado === "ok") {
          acc.pontos += pergunta.peso;
          return acc;
        }

        if (pergunta.origem === "manual" && resposta?.resultado === "nao_ok") {
          acc.descontos += pergunta.peso;
        }

        return acc;
      },
      { total: 0, pontos: 0, descontos: 0, devolvidosNa: 0 },
    );
  }, [notasSalvas, perguntasResumo]);

  const totais = notasSalvas?.resumo_totais ?? totaisReconstruidos;
  const total = Number(totais.total ?? 0);
  const pontos = Number(totais.pontos ?? 0);
  const descontos = Number(totais.descontos ?? 0);
  const devolvidosNa = Number(totais.devolvidosNa ?? 0);
  const destino = notasSalvas?.destino ?? resumo.destino;
  const destinoPrefixo = destino?.tipo === "setor" ? "setor " : "";
  const destinoLabel = destino?.label ? `${destinoPrefixo}${destino.label}` : "destino nao mapeado";
  const tituloFinal = titulo ?? (modo === "aprovador" ? "Resumo de notas - Aprovacao" : "Resumo de notas - Auditoria");

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50/50 overflow-hidden max-w-full">
      <div className="px-3 py-2 border-b border-blue-100 bg-blue-50">
        <p className="text-sm font-semibold text-blue-950">{tituloFinal}</p>
        <p className="text-[11px] text-blue-900">
          {notasSalvas ? "Registro salvo no envio desta etapa." : "Resumo reconstruido com os dados atuais do fluxo."}
        </p>
      </div>

      <div className="p-3 space-y-2">
        {perguntasResumo.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma pergunta de nota encontrada.</p>
        ) : (
          perguntasResumo.map((pergunta) => (
            <ResumoNotasPerguntaCard
              key={respostaKey(pergunta)}
              pergunta={pergunta}
              resposta={getRespostaSalva(notasSalvas, pergunta)}
              readOnly
            />
          ))
        )}

        <Separator />

        <div className="rounded-md border border-blue-200 bg-card p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-foreground">
              Nota final {modo === "aprovador" ? "da aprovacao" : "da auditoria"}
            </p>
            <p className="text-2xl font-bold text-blue-700 whitespace-nowrap">{pontos} pts</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Total possivel: {total} pts. Ganhos: {pontos} pts. Perdidos: {descontos} pts.
            {devolvidosNa > 0 ? ` Devolvidos por N/A: ${devolvidosNa} pts.` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            Nota lancada para: <strong className="text-foreground">{destinoLabel}</strong>
          </p>
        </div>
      </div>
    </section>
  );
}

export default ResumoNotasReadonly;
