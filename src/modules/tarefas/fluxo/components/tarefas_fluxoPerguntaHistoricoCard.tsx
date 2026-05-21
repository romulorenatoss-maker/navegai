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

interface Props {
  pergunta: TarefaFluxoPergunta;
  /** Quem está vendo: muda visibilidade de partes do card. */
  papel: "executor" | "aprovador" | "auditor" | "criador" | "admin" | "spectator";
  /** Quando true, mostra ações que esse papel ainda pode executar. */
  acoesAtivas?: boolean;
  /** Callbacks (opcionais) acionados pelos cards de plano internos. */
  onExecutorResponderPlano?: (planoId: string) => void;
  onAprovadorResponderPlanoAuditor?: (planoId: string) => void;
  /** Conteúdo extra a renderizar no rodapé do card (ex: botão criar plano). */
  rodape?: React.ReactNode;
}

export function FluxoPerguntaHistoricoCard({
  pergunta,
  papel,
  acoesAtivas,
  onExecutorResponderPlano,
  onAprovadorResponderPlanoAuditor,
  rodape,
}: Props) {
  const r0 = pergunta.respostaOriginalExecutor;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span>{pergunta.label}</span>
          {pergunta.obrigatorio && <Badge variant="outline" className="text-[10px]">Obrigatória</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* R0 — Resposta original do executor (sempre read-only no histórico) */}
        <div className="rounded-md border bg-muted/20 p-2.5 text-xs space-y-1">
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
                <p className="text-[10px] text-muted-foreground">
                  Respondido em{" "}
                  {new Date(r0.respondido_em).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground italic">Executor ainda não respondeu.</p>
          )}
        </div>

        {/* Planos do aprovador R1, R2, R3... */}
        {pergunta.planosAprovador.map((plano) => (
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

        {/* Planos do auditor R1 auditor, R2 auditor... */}
        {pergunta.planosAuditor.map((plano) => (
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
