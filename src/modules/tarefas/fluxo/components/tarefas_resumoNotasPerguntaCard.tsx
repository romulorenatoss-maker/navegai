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

type StatusKey = "ok" | "perdeu" | "na" | "sem_dados";

const statusVisual: Record<StatusKey, { label: string; chip: string; border: string; panel: string }> = {
  ok: {
    label: "OK - ganhou ponto",
    chip: "bg-emerald-100 text-emerald-700 border-emerald-200",
    border: "border-l-emerald-500",
    panel: "bg-emerald-50/60 border-emerald-200",
  },
  perdeu: {
    label: "Perdeu ponto",
    chip: "bg-red-100 text-red-700 border-red-200",
    border: "border-l-red-500",
    panel: "bg-red-50/60 border-red-200",
  },
  na: {
    label: "N/A - ponto devolvido",
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    border: "border-l-amber-500",
    panel: "bg-amber-50/70 border-amber-200",
  },
  sem_dados: {
    label: "Sem dados suficientes",
    chip: "bg-slate-100 text-slate-700 border-slate-200",
    border: "border-l-slate-400",
    panel: "bg-slate-50/70 border-slate-200",
  },
};

function calcularVisual(pergunta: ResumoNotasPergunta, resposta?: ResumoNotasRespostaManual) {
  const peso = Number(pergunta.peso ?? 0);
  const marcadaNa = !!resposta?.na;
  const resultadoManual = resposta?.resultado;

  if (marcadaNa) {
    return {
      status: "na" as const,
      pontosGanhos: pergunta.pontoDevolvidoNa,
      pontosPerdidos: 0,
      pontosDevolvidos: pergunta.pontoDevolvidoNa,
      mensagem: resposta?.justificativaNa?.trim() || "Justificativa obrigatoria para N/A.",
      justificativa: resposta?.justificativaNa?.trim() ?? "",
    };
  }

  if (pergunta.origem === "manual" && resultadoManual === "ok") {
    return {
      status: "ok" as const,
      pontosGanhos: peso,
      pontosPerdidos: 0,
      pontosDevolvidos: 0,
      mensagem: resposta?.resposta?.trim() || "Conforme.",
      justificativa: "",
    };
  }

  if (pergunta.origem === "manual" && resultadoManual === "nao_ok") {
    return {
      status: "perdeu" as const,
      pontosGanhos: 0,
      pontosPerdidos: peso,
      pontosDevolvidos: 0,
      mensagem: resposta?.resposta?.trim() || "Nao conforme.",
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

function LinhaResumo({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2 min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold break-words ${className}`}>{value}</p>
    </div>
  );
}

export function ResumoNotasPerguntaCard({ pergunta, resposta, onChange }: Props) {
  const isManual = pergunta.origem === "manual";
  const marcadaNa = !!resposta?.na;
  const resultadoManual = resposta?.resultado;
  const visual = calcularVisual(pergunta, resposta);
  const styles = statusVisual[visual.status];
  const peso = Number(pergunta.peso ?? 0);

  return (
    <div className={`rounded-md border bg-card p-3 space-y-3 max-w-full overflow-hidden border-l-4 ${styles.border}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pergunta</p>
          <p className="text-sm font-semibold break-words">{pergunta.pergunta}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles.chip}`}>
            {styles.label}
          </span>
          <Badge variant={pergunta.origem === "automatica" ? "secondary" : "outline"} className="w-fit">
            {pergunta.origem === "automatica" ? "Automatica" : "Manual"}
          </Badge>
        </div>
      </div>

      <div className={`rounded-md border p-3 space-y-3 ${styles.panel}`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <LinhaResumo label="Peso" value={peso} />
          <LinhaResumo label="Pontos" value={`${visual.pontosGanhos}/${peso}`} className="text-emerald-700" />
          <LinhaResumo label="Desconto" value={`-${visual.pontosPerdidos}`} className={visual.pontosPerdidos > 0 ? "text-red-700" : "text-muted-foreground"} />
          <LinhaResumo label="Devolvido N/A" value={visual.pontosDevolvidos} className={visual.pontosDevolvidos > 0 ? "text-amber-800" : "text-muted-foreground"} />
        </div>

        <div className="rounded bg-background/70 px-2.5 py-2 text-xs break-words">
          <p className="font-medium text-foreground">Resultado final da pergunta: {visual.pontosGanhos}/{peso}</p>
          <p className="text-muted-foreground mt-1">Mensagem: {visual.mensagem}</p>
          {visual.justificativa && (
            <p className="text-amber-800 mt-1">Justificativa N/A: {visual.justificativa}</p>
          )}
          {visual.status === "sem_dados" && pergunta.fonte && (
            <p className="text-muted-foreground mt-1">Dado faltante/fonte: {pergunta.fonte}</p>
          )}
        </div>
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
            placeholder="Observacao da avaliacao manual"
          />
          {pergunta.permiteNa && (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={marcadaNa}
                onCheckedChange={(checked) =>
                  onChange?.({ na: checked === true, resultado: checked === true ? undefined : resultadoManual })
                }
              />
              Marcar N/A
            </label>
          )}
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
