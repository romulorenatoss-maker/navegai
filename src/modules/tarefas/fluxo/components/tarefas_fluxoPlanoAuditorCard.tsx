/**
 * tarefas_fluxoPlanoAuditorCard.tsx
 *
 * Render de UM plano de ação do auditor (auditor → aprovador).
 * Estrutura igual ao FluxoPlanoAprovadorCard mas com cores roxas e
 * destinatário aprovador.
 */
import { ShieldCheck, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvidenciaPreview } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import type { PlanoAuditor } from "../types/tarefas_fluxoTypes";
import {
  tarefasCalcularPrazoPlanoPadraoStatus,
  tarefasCalcularPrazoStatus,
  tarefasFormatarDataHora,
} from "@/modules/tarefas/utils/tarefas_slaPrazoUtils";

interface Props {
  plano: PlanoAuditor;
  papel: "executor" | "aprovador" | "auditor" | "criador" | "admin" | "spectator";
  podeResponder?: boolean;
  onResponder?: () => void;
}

export function FluxoPlanoAuditorCard({ plano, podeResponder, onResponder }: Props) {
  const itens = Array.isArray(plano.itens_plano) ? plano.itens_plano : [];
  const resp = plano.resposta_valor_json ?? {};
  const prazoPlano = tarefasCalcularPrazoPlanoPadraoStatus(plano);
  const prazoResposta = tarefasCalcularPrazoStatus({
    prazo: plano.prazo_resolucao,
    referencia: plano.respondido_em,
    semReferenciaUsaAgora: !plano.respondido,
  });
  const prazoPlanoCls = prazoPlano.status === "fora_prazo"
    ? "bg-red-100 text-red-700 border-red-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";
  const prazoRespostaCls = prazoResposta.status === "fora_prazo"
    ? "bg-red-100 text-red-700 border-red-200"
    : "bg-emerald-100 text-emerald-700 border-emerald-200";

  return (
    <div className="border-2 border-purple-300 rounded-lg overflow-hidden max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200">
        <span className="text-[11px] font-semibold text-purple-800 flex items-center gap-1.5 min-w-0 break-words">
          <ShieldCheck className="h-3.5 w-3.5" />
          Plano do auditor — R{plano.rodada} (para o aprovador)
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
          {prazoPlano.prazoPadraoLabel && (
            <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-full whitespace-normal break-words bg-slate-50 text-slate-700 border border-slate-200">
              <Clock className="h-3 w-3" />
              SLA padrao: {prazoPlano.prazoPadraoLabel}
            </span>
          )}
          {plano.prazo_resolucao && (
            <span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-full whitespace-normal break-words bg-purple-50 text-purple-800">
              <Clock className="h-3 w-3" />
              Prazo definido: {tarefasFormatarDataHora(plano.prazo_resolucao)}
            </span>
          )}
          {plano.prazo_resolucao && prazoPlano.status !== "sem_prazo" && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 max-w-full whitespace-normal break-words border font-semibold ${prazoPlanoCls}`}>
              {prazoPlano.badgeLabel}
            </span>
          )}
          {itens.map((item, i) => (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 max-w-full whitespace-normal break-words">
              {item.tipo === "foto" ? "📷" : item.tipo === "video" ? "🎥" : item.tipo === "audio" ? "🎵" : "✏️"} {item.titulo || item.tipo}
            </span>
          ))}
        </div>

        {plano.respondido ? (
          <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Resposta do aprovador — R{plano.rodada}
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
                    <p className="text-[10px] text-purple-800 font-medium">
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
              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Respondido em {tarefasFormatarDataHora(plano.respondido_em)}
                </span>
                {prazoResposta.status !== "sem_prazo" && (
                  <>
                    <span>Prazo limite: {tarefasFormatarDataHora(plano.prazo_resolucao)}</span>
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${prazoRespostaCls}`}>
                      {prazoResposta.badgeLabel}
                    </span>
                    <span>{prazoResposta.detalheLabel}</span>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/10 p-2 text-center">
            <p className="text-[11px] italic text-muted-foreground mb-1">
              Aguardando resposta do aprovador.
            </p>
            {podeResponder && (
              <Button
                type="button"
                size="sm"
                onClick={onResponder}
                className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700 text-white"
              >
                Responder plano do auditor R{plano.rodada}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FluxoPlanoAuditorCard;
