import { Clock, AlertTriangle, RotateCcw, User as UserIcon, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeSla, isSemMovimento, type AssignmentSla } from "@/modules/tarefas/services/tarefas_bucketize";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";

function fmtRemaining(ms: number | null): string {
  if (ms === null) return "—";
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const sign = ms < 0 ? "-" : "";
  if (h >= 24) return `${sign}${Math.floor(h / 24)}d ${h % 24}h`;
  return `${sign}${h}h ${m}m`;
}

function SlaBadge({ sla, label }: { sla: AssignmentSla["current"]; label: string }) {
  const cls = sla.status === "estourado"
    ? "bg-destructive/10 text-destructive border-destructive/30"
    : sla.status === "near"
      ? "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400"
      : sla.status === "ok"
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
        : "bg-muted text-muted-foreground border-border";
  return (
    <div className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium", cls)}>
      <Clock className="w-3 h-3" />
      <span>{label}</span>
      <span className="font-bold">{fmtRemaining(sla.msRemaining)}</span>
    </div>
  );
}

interface Props {
  assignment: any;
  onClick?: (a: any) => void;
}

export function PainelRetornoCard({ assignment, onClick }: Props) {
  const sla = computeSla(assignment);
  const sem = isSemMovimento(assignment);
  const cont = ["contingenciado", "contingencia"].includes(assignment.status);
  const statusConf = STATUS_CONFIG[assignment.status];
  const responsavel = assignment.profiles?.nome || "—";
  const titulo = assignment.template_snapshot?.nome || assignment.operational_templates?.nome || "Tarefa";

  return (
    <button
      type="button"
      onClick={() => onClick?.(assignment)}
      className={cn(
        "w-full text-left rounded-lg border bg-card hover:bg-muted/40 transition-colors p-3 space-y-2",
        cont && "border-orange-500 ring-1 ring-orange-500/40",
        sla.current.status === "estourado" && !cont && "border-destructive/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {assignment.numero_tarefa && (
              <span className="text-[10px] font-mono font-bold text-primary bg-primary/10 px-1 rounded shrink-0">
                #{String(assignment.numero_tarefa).padStart(4, "0")}
              </span>
            )}
            <span className="text-sm font-semibold truncate">{titulo}</span>
            {cont && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500 text-white animate-pulse">
                <AlertTriangle className="w-3 h-3" /> CONTINGÊNCIA
              </span>
            )}
          </div>
          {statusConf && (
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border mt-1", statusConf.class)}>
              {statusConf.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
        <UserIcon className="w-3 h-3" />
        <span className="font-medium text-foreground">{responsavel}</span>
        {assignment.avaliador_id && <span>· aval: {assignment.avaliador?.nome || "—"}</span>}
        {assignment.aprovador_id && <span>· aprov: {assignment.aprovador?.nome || "—"}</span>}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {sla.operacional.due && <SlaBadge sla={sla.operacional} label="Op" />}
        {sla.avaliacao.due && <SlaBadge sla={sla.avaliacao} label="Av" />}
        {sla.aprovacao.due && <SlaBadge sla={sla.aprovacao} label="Apr" />}
        {sla.total.due && <SlaBadge sla={sla.total} label="Total" />}
        {sem && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400 text-[10px] font-medium">
            <Activity className="w-3 h-3" /> Sem movimento
          </span>
        )}
        {assignment.rodada_atual > 1 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border bg-muted text-muted-foreground text-[10px]">
            <RotateCcw className="w-3 h-3" /> Rodada {assignment.rodada_atual}
          </span>
        )}
      </div>
    </button>
  );
}
