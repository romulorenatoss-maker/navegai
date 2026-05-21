import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { ResumoNotasPergunta } from "../hooks/tarefas_useResumoNotas";

export interface ResumoNotasRespostaManual {
  resultado?: "ok" | "nao_ok";
  resposta?: string;
  na?: boolean;
  justificativaNa?: string;
}

interface Props {
  pergunta: ResumoNotasPergunta;
  resposta?: ResumoNotasRespostaManual;
  onChange?: (patch: Partial<ResumoNotasRespostaManual>) => void;
}

type StatusKey = "ok" | "nao_ok" | "na" | "pendente";

function getStatus(
  pergunta: ResumoNotasPergunta,
  resultado: ResumoNotasRespostaManual["resultado"],
  marcadaNa: boolean,
): { key: StatusKey; label: string; className: string } {
  if (marcadaNa) {
    return {
      key: "na",
      label: "N/A",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    };
  }
  if (pergunta.origem === "manual" && resultado === "ok") {
    return {
      key: "ok",
      label: "OK / Conforme",
      className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    };
  }
  if (pergunta.origem === "manual" && resultado === "nao_ok") {
    return {
      key: "nao_ok",
      label: "Nao OK",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }

  const d = pergunta.descontoAplicado;
  if (d === null || d === undefined || pergunta.metricaPendente) {
    return {
      key: "pendente",
      label: "Pendente backend",
      className: "bg-amber-100 text-amber-800 border-amber-200",
    };
  }
  if ((d as number) > 0) {
    return {
      key: "nao_ok",
      label: "Nao OK",
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  return {
    key: "ok",
    label: "OK / Conforme",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
}

export function ResumoNotasPerguntaCard({ pergunta, resposta, onChange }: Props) {
  const isManual = pergunta.origem === "manual";
  const marcadaNa = !!resposta?.na;
  const resultadoManual = resposta?.resultado;
  const status = getStatus(pergunta, resultadoManual, marcadaNa);

  const peso = pergunta.peso;
  const desconto = pergunta.descontoAplicado;
  const descontoPendente =
    isManual ? !marcadaNa && !resultadoManual : desconto === null || desconto === undefined;

  // Nota da pergunta (mantido = peso - desconto), so calcula quando backend retornou desconto.
  let notaPerguntaLabel: string;
  if (marcadaNa) {
    notaPerguntaLabel = `Nota da pergunta: N/A - devolve ${pergunta.pontoDevolvidoNa} / peso ${peso}`;
  } else if (isManual && resultadoManual === "ok") {
    notaPerguntaLabel = `Nota da pergunta: ${peso} / peso ${peso}`;
  } else if (isManual && resultadoManual === "nao_ok") {
    notaPerguntaLabel = `Nota da pergunta: 0 / peso ${peso}`;
  } else if (descontoPendente) {
    notaPerguntaLabel = `Nota da pergunta: pendente backend / peso ${peso}`;
  } else {
    const nota = Math.max(0, peso - (desconto as number));
    notaPerguntaLabel = `Nota da pergunta: ${nota} / peso ${peso}`;
  }

  return (
    <div
      className={`rounded-md border bg-card p-3 space-y-2 max-w-full overflow-hidden border-l-4 ${
        status.key === "ok"
          ? "border-l-emerald-500"
          : status.key === "nao_ok"
            ? "border-l-red-500"
            : status.key === "na"
              ? "border-l-blue-500"
              : "border-l-amber-500"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium break-words">{pergunta.pergunta}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
            {status.label}
          </span>
          <Badge variant={pergunta.origem === "automatica" ? "secondary" : "outline"} className="w-fit">
            {pergunta.origem === "automatica" ? "Automatica" : "Manual"}
          </Badge>
        </div>
      </div>

      <div className="text-xs font-medium text-foreground">{notaPerguntaLabel}</div>

      <div className="text-xs">
        {marcadaNa ? (
          <span className="text-blue-700">N/A: ponto devolvido {pergunta.pontoDevolvidoNa}</span>
        ) : isManual && resultadoManual === "ok" ? (
          <span className="text-emerald-700 font-medium">Sem desconto - ganhou {peso} pts</span>
        ) : isManual && resultadoManual === "nao_ok" ? (
          <span className="text-red-700 font-medium">Desconto: -{peso}</span>
        ) : descontoPendente ? (
          <span className="text-amber-800">Desconto pendente backend</span>
        ) : (desconto as number) > 0 ? (
          <span className="text-red-700 font-medium">Desconto: -{desconto as number}</span>
        ) : (
          <span className="text-emerald-700">Sem desconto</span>
        )}
      </div>

      <div className="rounded bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground break-words">
        {pergunta.valorExibido}
        {pergunta.fonte ? <span className="block mt-1">Fonte: {pergunta.fonte}</span> : null}
      </div>

      {isManual && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange?.({ resultado: "ok", na: false })}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                !marcadaNa && resultadoManual === "ok"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              OK / ganhou {peso} pts
            </button>
            <button
              type="button"
              onClick={() => onChange?.({ resultado: "nao_ok", na: false })}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                !marcadaNa && resultadoManual === "nao_ok"
                  ? "border-red-500 bg-red-50 text-red-700"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              Nao OK / perde {peso} pts
            </button>
          </div>
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
              onCheckedChange={(checked) =>
                onChange?.({ na: checked === true, resultado: checked === true ? undefined : resultadoManual })
              }
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
                placeholder="Explique por que esta pergunta nao se aplica"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
