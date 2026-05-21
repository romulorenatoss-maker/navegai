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
