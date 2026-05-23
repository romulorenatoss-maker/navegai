/**
 * tarefas_fluxoPerguntaHistoricoCard.tsx
 *
 * Card de uma pergunta no histórico (imutável). Renderiza:
 *  - cabeçalho com a pergunta
 *  - resposta original do executor (R0) — sempre read-only após envio
 *  - planos do aprovador (R1, R2, R3...) com respostas do executor
 *  - planos do auditor (R1 auditor...) com respostas do aprovador
 *
 * Compõe-se de FluxoPlanoAprovadorCard e FluxoPlanoAuditorCard para
 * exibir cada plano.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { FluxoPlanoAprovadorCard } from "./tarefas_fluxoPlanoAprovadorCard";
import { FluxoPlanoAuditorCard } from "./tarefas_fluxoPlanoAuditorCard";
import type { TarefaFluxoPergunta } from "../types/tarefas_fluxoTypes";
import {
  tarefasCalcularPrazoStatus,
  tarefasFormatarDataHora,
} from "@/modules/tarefas/utils/tarefas_slaPrazoUtils";

interface Props {
  pergunta: TarefaFluxoPergunta;
  /** Quem está vendo: muda visibilidade de partes do card. */
  papel: "executor" | "aprovador" | "auditor" | "criador" | "admin" | "spectator";
  /** Quando true, mostra ações que esse papel ainda pode executar. */
  acoesAtivas?: boolean;
  /** Callbacks (opcionais) acionados pelos cards de plano internos. */
  onExecutorResponderPlano?: (planoId: string) => void;
  onAprovadorResponderPlanoAuditor?: (planoId: string) => void;
  entrePlanosAprovadorEAuditor?: React.ReactNode;
  mostrarRespostaOriginal?: boolean;
  mostrarPlanosAprovador?: boolean;
  mostrarPlanosAuditor?: boolean;
  prazoExecucao?: string | null;
  /** Conteúdo extra a renderizar no rodapé do card (ex: botão criar plano). */
  rodape?: React.ReactNode;
}

function PrazoRespostaResumo({
  prazo,
  respondidoEm,
}: {
  prazo?: string | null;
  respondidoEm?: string | null;
}) {
  if (!prazo || !respondidoEm) return null;
  const status = tarefasCalcularPrazoStatus({ prazo, referencia: respondidoEm });
  if (status.status === "sem_prazo") return null;
  const cls = status.status === "fora_prazo"
    ? "bg-red-100 text-red-700 border-red-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <span className="text-muted-foreground">Prazo limite: {tarefasFormatarDataHora(prazo)}</span>
      <span className={`rounded-full border px-2 py-0.5 font-semibold ${cls}`}>
        {status.badgeLabel}
      </span>
      <span className="text-muted-foreground">{status.detalheLabel}</span>
    </div>
  );
}

export function FluxoPerguntaHistoricoCard({
  pergunta,
  papel,
  acoesAtivas,
  onExecutorResponderPlano,
  onAprovadorResponderPlanoAuditor,
  entrePlanosAprovadorEAuditor,
  mostrarRespostaOriginal = true,
  mostrarPlanosAprovador = true,
  mostrarPlanosAuditor = true,
  prazoExecucao,
  rodape,
}: Props) {
  const r0 = pergunta.respostaOriginalExecutor;

  return (
    <Card className="max-w-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <span className="min-w-0 break-words whitespace-normal">{pergunta.label}</span>
          {pergunta.obrigatorio && <Badge variant="outline" className="text-[10px]">Obrigatória</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* R0 — Resposta original do executor (sempre read-only no histórico) */}
        {mostrarRespostaOriginal && (
          <div className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1 max-w-full overflow-hidden break-words">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              R0 — Resposta do executor
            </p>
            {r0 ? (
              <>
                <div>
                  Resposta:{" "}
                  <span className="font-semibold">
                    {r0.valor_booleano === true && "Conforme/Sim"}
                    {r0.valor_booleano === false && "Não conforme/Não"}
                    {r0.valor_texto === "na" && "N/A"}
                    {r0.valor_booleano === null &&
                      r0.valor_texto !== "na" &&
                      (r0.valor_texto ||
                        (r0.valor_numero != null ? String(r0.valor_numero) : "(sem resposta)"))}
                  </span>
                </div>
                {r0.observacao && (
                  <div className="text-muted-foreground">Observação: {r0.observacao}</div>
                )}
                {r0.evidencia_url && (
                  <EvidenciaPreview
                    anexoId={r0.evidencia_anexo_id}
                    url={r0.evidencia_url}
                    mimeType={r0.evidencia_mime_type}
                    disabled
                  />
                )}
                {r0.respondido_em && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground">
                      Respondido em {tarefasFormatarDataHora(r0.respondido_em)}
                    </p>
                    <PrazoRespostaResumo prazo={prazoExecucao} respondidoEm={r0.respondido_em} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground italic">Executor ainda não respondeu.</p>
            )}
          </div>
        )}

        {/* Planos do aprovador R1, R2, R3... */}
        {mostrarPlanosAprovador && pergunta.planosAprovador.map((plano) => (
          <FluxoPlanoAprovadorCard
            key={plano.id}
            plano={plano}
            papel={papel}
            podeResponder={
              papel === "executor" &&
              !!acoesAtivas &&
              pergunta.podeExecutorResponderPlano &&
              !plano.respondido
            }
            onResponder={() => onExecutorResponderPlano?.(plano.id)}
          />
        ))}

        {entrePlanosAprovadorEAuditor}

        {/* Planos do auditor R1 auditor, R2 auditor... */}
        {mostrarPlanosAuditor && pergunta.planosAuditor.map((plano) => (
          <FluxoPlanoAuditorCard
            key={plano.id}
            plano={plano}
            papel={papel}
            podeResponder={
              papel === "aprovador" &&
              !!acoesAtivas &&
              pergunta.podeAprovadorResponderPlanoAuditor &&
              !plano.respondido
            }
            onResponder={() => onAprovadorResponderPlanoAuditor?.(plano.id)}
          />
        ))}

        {rodape}
      </CardContent>
    </Card>
  );
}

export default FluxoPerguntaHistoricoCard;
