/**
 * tarefas_fluxoPlanoAprovadorCard.tsx
 *
 * Render de UM plano de ação do aprovador. Mostra:
 *  - cabeçalho com rodada e status (respondido / pendente)
 *  - instrução, itens esperados, prazo, criticidade
 *  - resposta do executor (se já respondida) com cada item
 *  - botão "Responder plano" quando aplicável (papel=executor, !respondido)
 */
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import type { PlanoAprovador } from "../types/tarefas_fluxoTypes";

interface Props {
  plano: PlanoAprovador;
  papel: "executor" | "aprovador" | "auditor" | "criador" | "admin" | "spectator";
  podeResponder?: boolean;
  onResponder?: () => void;
}

export function FluxoPlanoAprovadorCard({ plano, podeResponder, onResponder }: Props) {
  const itens = Array.isArray(plano.itens_plano) ? plano.itens_plano : [];
  const resp = plano.resposta_valor_json ?? {};

  const prazoAtrasado = (() => {
    if (!plano.prazo_resolucao) return false;
    try {
      const ref = plano.respondido_em ? new Date(plano.respondido_em) : new Date();
      return ref > new Date(plano.prazo_resolucao);
    } catch {
      return false;
    }
  })();

  const corHeader = plano.criticidade === "alta"
    ? "bg-red-50 border-red-300 text-red-800"
    : plano.criticidade === "media"
    ? "bg-amber-50 border-amber-300 text-amber-800"
    : "bg-emerald-50 border-emerald-300 text-emerald-800";

  return (
    <div className="border-2 rounded-lg overflow-hidden max-w-full">
      <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 border-b ${corHeader}`}>
        <span className="text-[11px] font-semibold flex items-center gap-1.5 min-w-0 break-words">
          <AlertTriangle className="h-3.5 w-3.5" />
          Plano do aprovador — R{plano.rodada}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
          plano.respondido
            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
            : "bg-amber-100 text-amber-700 border-amber-200"
        }`}>
          {plano.respondido ? "Respondido" : "Pendente"}
        </span>
      </div>
      <div className="px-3 py-2 space-y-2 bg-card">
        {plano.instrucao && (
          <p className="text-xs text-foreground">{plano.instrucao}</p>
        )}
        <div className="flex flex-wrap gap-1.5 max-w-full">
          {plano.prazo_resolucao && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-full whitespace-normal break-words ${prazoAtrasado ? "bg-rose-100 text-rose-800" : "bg-blue-50 text-blue-800"}`}>
              <Clock className="h-3 w-3" />
              Prazo: {new Date(plano.prazo_resolucao).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {prazoAtrasado && " · atrasado"}
            </span>
          )}
          {itens.map((item, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 max-w-full whitespace-normal break-words">
              {item.tipo === "foto" ? "📷" : item.tipo === "video" ? "🎥" : item.tipo === "audio" ? "🎵" : "✏️"} {item.titulo || item.tipo}
            </span>
          ))}
        </div>

        {/* Resposta do executor (read-only se já respondida) */}
        {plano.respondido ? (
          <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Resposta do executor — R{plano.rodada}
            </p>
            {itens.map((item, iIdx) => {
              const dado: any = resp[String(iIdx)] ?? resp[item.tipo];
              if (!dado) return (
                <p key={iIdx} className="text-[11px] italic text-muted-foreground">
                  Sem resposta para #{iIdx + 1} {item.titulo || item.tipo}
                </p>
              );
              return (
                <div key={iIdx} className="space-y-1">
                  {item.titulo && (
                    <p className="text-[10px] text-amber-800 font-medium">
                      #{iIdx + 1} {item.titulo}
                    </p>
                  )}
                  {(item.tipo === "texto" || (item.tipo as string) === "descricao") && dado.valor_texto && (
                    <div className="bg-card border rounded p-1.5 max-w-full overflow-hidden">
                      <p className="text-xs break-words whitespace-normal">{dado.valor_texto}</p>
                    </div>
                  )}
                  {(item.tipo === "foto" || item.tipo === "video" || item.tipo === "audio") && dado.evidencia_url && (
                    <EvidenciaPreview
                      anexoId={dado.evidencia_anexo_id ?? null}
                      url={dado.evidencia_url}
                      mimeType={dado.evidencia_mime_type ?? null}
                      disabled
                    />
                  )}
                </div>
              );
            })}
            {plano.respondido_em && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Respondido em {new Date(plano.respondido_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/10 p-2 text-center">
            <p className="text-[11px] italic text-muted-foreground mb-1">
              Aguardando resposta do executor.
            </p>
            {podeResponder && (
              <Button
                type="button"
                size="sm"
                onClick={onResponder}
                className="w-full sm:w-auto"
              >
                Responder plano R{plano.rodada}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FluxoPlanoAprovadorCard;
