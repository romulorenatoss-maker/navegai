import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ResumoNotasPergunta } from "../hooks/tarefas_useResumoNotas";

export interface ResumoNotasRespostaManual {
  resposta?: string;
  na?: boolean;
  justificativaNa?: string;
}

interface Props {
  pergunta: ResumoNotasPergunta;
  resposta?: ResumoNotasRespostaManual;
  onChange?: (patch: Partial<ResumoNotasRespostaManual>) => void;
}

export function ResumoNotasPerguntaCard({ pergunta, resposta, onChange }: Props) {
  const isManual = pergunta.origem === "manual";
  const marcadaNa = !!resposta?.na;

  const desconto = pergunta.descontoAplicado;
  const descontoPendente = desconto === null || desconto === undefined;
  const ganhou = !descontoPendente && (desconto as number) <= 0;
  const pontosMantidos = ganhou ? pergunta.peso : 0;
  const pontosPerdidos = !descontoPendente && (desconto as number) > 0 ? (desconto as number) : 0;

  return (
    <div className="rounded-md border bg-card p-3 space-y-2 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{pergunta.pergunta}</p>
          <p className="text-[11px] text-muted-foreground">
            Peso {pergunta.peso} · desconto {pergunta.descontoAplicado ?? "backend"} · ponto N/A {pergunta.pontoDevolvidoNa}
          </p>
        </div>
        <Badge variant={pergunta.origem === "automatica" ? "secondary" : "outline"} className="w-fit">
          {pergunta.origem === "automatica" ? "Automática" : "Manual"}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {descontoPendente ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            Pontuação pendente de backend
          </span>
        ) : (
          <>
            {pontosMantidos > 0 && (
              <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-medium">
                +{pontosMantidos} pts
              </span>
            )}
            {pontosPerdidos > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-medium">
                -{pontosPerdidos} pts
              </span>
            )}
            {pontosMantidos === 0 && pontosPerdidos === 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                Sem variação
              </span>
            )}
          </>
        )}
        {marcadaNa && pergunta.pontoDevolvidoNa > 0 && (
          <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-medium">
            N/A devolve {pergunta.pontoDevolvidoNa} pts
          </span>
        )}
        {pergunta.metricaPendente && (
          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">
            Pendente backend
          </span>
        )}
      </div>

      <div className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground break-words">
        {pergunta.valorExibido}
        {pergunta.fonte ? <span className="block mt-1">Fonte: {pergunta.fonte}</span> : null}
      </div>

      {isManual && (
        <div className="space-y-2">
          <Textarea
            value={resposta?.resposta ?? ""}
            onChange={(e) => onChange?.({ resposta: e.target.value })}
            disabled={marcadaNa}
            className="text-xs min-h-[58px]"
            placeholder="Resposta manual"
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={marcadaNa}
              onCheckedChange={(checked) => onChange?.({ na: checked === true })}
            />
            Marcar N/A
          </label>
          {marcadaNa && (
            <div className="space-y-1">
              <Label className="text-[11px]">Justificativa do N/A *</Label>
              <Textarea
                value={resposta?.justificativaNa ?? ""}
                onChange={(e) => onChange?.({ justificativaNa: e.target.value })}
                className="text-xs min-h-[52px]"
                placeholder="Explique por que esta pergunta não se aplica"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
