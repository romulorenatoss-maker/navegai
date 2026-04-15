import { Clock, ChevronRight, AlertTriangle, RotateCcw, CheckCircle2 } from "lucide-react";
import { STATUS_CONFIG, TIPO_EXECUCAO_LABELS } from "@/hooks/useOperationalScoring";

interface Props {
  assignment: any;
  onClick: (a: any) => void;
}

export function AssignmentCard({ assignment: a, onClick }: Props) {
  const snapshot = a.template_snapshot;
  const nome = snapshot?.nome || a.operational_templates?.nome || "Rotina";
  const tipo = snapshot?.tipo_execucao || a.operational_templates?.tipo_execucao;
  const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
  const isReturned = a.status === "devolvida";
  const hasContingency = a.contingency_count > 0;
  const prazoStr = a.data_prevista;

  return (
    <div onClick={() => onClick(a)}
      className={`bg-card border rounded-lg p-4 shadow-card hover:shadow-md transition-all cursor-pointer active:scale-[0.98] ${isReturned ? "border-amber-400" : "border-border"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">{nome}</h3>
          {a.rodada_atual > 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
              <RotateCcw className="w-3 h-3" /> Rodada {a.rodada_atual}
            </span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border shrink-0 ${statusConf.class}`}>
          {statusConf.label}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground flex-wrap">
        {tipo && <span className="inline-flex items-center px-2 py-0.5 rounded border badge-active">{TIPO_EXECUCAO_LABELS[tipo] || tipo}</span>}
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{prazoStr}</span>
        {a.horario_limite && <span>até {a.horario_limite}</span>}
        {hasContingency && <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="w-3 h-3" />Contingência</span>}
        {a.score_executor != null && (
          <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="w-3 h-3" />{Math.round(a.score_executor)}pts</span>
        )}
      </div>

      <div className="flex items-center justify-end mt-1">
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}