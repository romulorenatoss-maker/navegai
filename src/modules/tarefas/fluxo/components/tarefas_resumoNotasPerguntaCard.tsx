import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type StatusKey = "ok" | "perdeu" | "na" | "sem_dados";

const statusVisual: Record<StatusKey, { label: string; container: string; chip: string; note: string }> = {
  ok: {
    label: "OK",
    container: "border-emerald-200 bg-emerald-50",
    chip: "bg-emerald-100 text-emerald-700",
    note: "text-emerald-700",
  },
  perdeu: {
    label: "Perdeu ponto",
    container: "border-red-200 bg-red-50",
    chip: "bg-red-100 text-red-700",
    note: "text-red-700",
  },
  na: {
    label: "N/A",
    container: "border-amber-200 bg-amber-50",
    chip: "bg-amber-100 text-amber-800",
    note: "text-amber-800",
  },
  sem_dados: {
    label: "Sem dados",
    container: "border-slate-200 bg-slate-50",
    chip: "bg-slate-100 text-slate-700",
    note: "text-slate-700",
  },
};

function calcularVisual(pergunta: ResumoNotasPergunta, resposta?: ResumoNotasRespostaManual) {
  const peso = Number(pergunta.peso ?? 0);
  const marcadaNa = !!resposta?.na;
  const resultadoManual = resposta?.resultado;

  if (marcadaNa) {
    const devolvido = Number(pergunta.pontoDevolvidoNa ?? peso);
    return {
      status: "na" as const,
      pontosGanhos: devolvido,
      pontosPerdidos: 0,
      pontosDevolvidos: devolvido,
      mensagem: "N/A - ponto devolvido",
      justificativa: resposta?.justificativaNa?.trim() ?? "",
    };
  }

  if (pergunta.origem === "manual" && resultadoManual === "ok") {
    return {
      status: "ok" as const,
      pontosGanhos: peso,
      pontosPerdidos: 0,
      pontosDevolvidos: 0,
      mensagem: resposta?.resposta?.trim() || "Conforme",
      justificativa: "",
    };
  }

  if (pergunta.origem === "manual" && resultadoManual === "nao_ok") {
    return {
      status: "perdeu" as const,
      pontosGanhos: 0,
      pontosPerdidos: peso,
      pontosDevolvidos: 0,
      mensagem: resposta?.resposta?.trim() || "Nao conforme",
      justificativa: "",
    };
  }

  if (pergunta.descontoAplicado === null || pergunta.descontoAplicado === undefined || pergunta.metricaPendente) {
    return {
      status: "sem_dados" as const,
      pontosGanhos: 0,
      pontosPerdidos: 0,
      pontosDevolvidos: 0,
      mensagem: pergunta.valorExibido,
      justificativa: "",
    };
  }

  const pontosPerdidos = Math.max(0, Number(pergunta.descontoAplicado ?? 0));
  const pontosGanhos = Math.max(0, peso - pontosPerdidos);
  return {
    status: pontosPerdidos > 0 ? ("perdeu" as const) : ("ok" as const),
    pontosGanhos,
    pontosPerdidos,
    pontosDevolvidos: 0,
    mensagem: pergunta.valorExibido,
    justificativa: "",
  };
}

export function ResumoNotasPerguntaCard({ pergunta, resposta, onChange }: Props) {
  const isManual = pergunta.origem === "manual";
  const marcadaNa = !!resposta?.na;
  const resultadoManual = resposta?.resultado;
  const visual = calcularVisual(pergunta, resposta);
  const styles = statusVisual[visual.status];
  const peso = Number(pergunta.peso ?? 0);
  const permiteNa = pergunta.permiteNa && !!onChange;

  return (
    <div className={`rounded-md border p-4 space-y-3 max-w-full overflow-hidden ${styles.container}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground break-words">{pergunta.pergunta}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${styles.chip}`}>
              {styles.label}: {visual.mensagem}
            </span>
            <span className="text-[11px] text-muted-foreground">
              Peso {peso} pts
            </span>
          </div>
        </div>

        {pergunta.permiteNa && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            <Checkbox
              checked={marcadaNa}
              disabled={!permiteNa}
              onCheckedChange={(checked) =>
                onChange?.({
                  na: checked === true,
                  resultado: checked === true ? undefined : resultadoManual,
                })
              }
            />
            N/A
          </label>
        )}
      </div>

      <div className="text-xs space-y-1.5">
        <p className={styles.note}>
          Nota: <strong>{visual.pontosGanhos} pts</strong>
          {visual.pontosPerdidos > 0 ? <span> - desconto {visual.pontosPerdidos} pts</span> : null}
          {visual.pontosDevolvidos > 0 ? <span> - devolvido N/A {visual.pontosDevolvidos} pts</span> : null}
        </p>
        <p className="text-muted-foreground">
          Resultado: {visual.pontosGanhos}/{peso} pts
        </p>
        {visual.status === "sem_dados" && pergunta.fonte ? (
          <p className="text-muted-foreground">Dado faltante/fonte: {pergunta.fonte}</p>
        ) : null}
        {visual.justificativa ? (
          <p className="text-amber-800">Justificativa: {visual.justificativa}</p>
        ) : null}
      </div>

      {isManual && !marcadaNa && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange?.({ resultado: "ok", na: false })}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                resultadoManual === "ok"
                  ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                  : "border-border bg-background/70 text-muted-foreground hover:bg-muted"
              }`}
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => onChange?.({ resultado: "nao_ok", na: false })}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition-colors ${
                resultadoManual === "nao_ok"
                  ? "border-red-500 bg-red-100 text-red-700"
                  : "border-border bg-background/70 text-muted-foreground hover:bg-muted"
              }`}
            >
              Nao OK
            </button>
          </div>
          <Textarea
            value={resposta?.resposta ?? ""}
            onChange={(e) => onChange?.({ resposta: e.target.value })}
            className="text-xs min-h-[54px] bg-background/80"
            placeholder="Observacao da avaliacao manual"
          />
        </div>
      )}

      {marcadaNa && (
        <div className="space-y-1">
          <Label className="text-[11px]">Justificativa do N/A *</Label>
          <Textarea
            value={resposta?.justificativaNa ?? ""}
            onChange={(e) => onChange?.({ justificativaNa: e.target.value })}
            className="text-xs min-h-[52px] bg-background/80"
            placeholder="Explique por que esta pergunta nao se aplica"
          />
        </div>
      )}
    </div>
  );
}
