import { useState, useEffect } from "react";
import { Clock, ChevronRight, AlertTriangle, RotateCcw, CheckCircle2, Timer, TimerOff } from "lucide-react";
import { STATUS_CONFIG, TIPO_EXECUCAO_LABELS } from "@/hooks/useOperationalScoring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface Props {
  assignment: any;
  onClick: (a: any) => void;
}

function useCountdown(dataPrevista: string, horarioLimite: string | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!horarioLimite) return;
    const interval = setInterval(() => setNow(Date.now()), 30000); // update every 30s
    return () => clearInterval(interval);
  }, [horarioLimite]);

  if (!horarioLimite || !dataPrevista) return null;

  const [h, m] = horarioLimite.split(":").map(Number);
  const deadline = new Date(`${dataPrevista}T00:00:00`);
  deadline.setHours(h, m, 0, 0);
  const diffMs = deadline.getTime() - now;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < -1440) return null; // more than 1 day past — don't show

  const isExpired = diffMin < 0;
  const isUrgent = diffMin >= 0 && diffMin <= 30;
  const isWarning = diffMin > 30 && diffMin <= 60;

  let label: string;
  if (isExpired) {
    const overMin = Math.abs(diffMin);
    if (overMin < 60) label = `Atrasado ${overMin}min`;
    else label = `Atrasado ${Math.floor(overMin / 60)}h${overMin % 60 > 0 ? `${overMin % 60}m` : ""}`;
  } else if (diffMin < 60) {
    label = `${diffMin}min restantes`;
  } else {
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    label = `${hrs}h${mins > 0 ? `${mins}m` : ""} restantes`;
  }

  return { label, isExpired, isUrgent, isWarning };
}

export function AssignmentCard({ assignment: a, onClick }: Props) {
  const snapshot = a.template_snapshot;
  const nome = snapshot?.nome || a.operational_templates?.nome || "Rotina";
  const tipo = snapshot?.tipo_execucao || a.operational_templates?.tipo_execucao;
  const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
  const isReturned = a.status === "devolvida";
  const hasContingency = a.contingency_count > 0;

  const responsavelNome = a.profiles?.nome || "";
  const responsavelFoto = a.profiles?.foto_url || "";
  const initials = responsavelNome
    ? responsavelNome.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const isActive = ["pendente", "em_andamento", "devolvida"].includes(a.status);
  const countdown = useCountdown(a.data_prevista, isActive ? a.horario_limite : null);

  return (
    <div onClick={() => onClick(a)}
      className={`bg-card border rounded-lg p-3 shadow-card hover:shadow-md transition-all cursor-pointer active:scale-[0.98] ${isReturned ? "border-amber-400" : countdown?.isExpired ? "border-destructive/60" : countdown?.isUrgent ? "border-orange-400" : "border-border"}`}>
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={responsavelFoto} alt={responsavelNome} />
          <AvatarFallback className="text-[11px] bg-muted text-muted-foreground font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground truncate">{nome}</h3>
              {responsavelNome && (
                <p className="text-[11px] text-muted-foreground truncate">{responsavelNome}</p>
              )}
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border shrink-0 ${statusConf.class}`}>
              {statusConf.label}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground flex-wrap">
            {tipo && <span className="inline-flex items-center px-2 py-0.5 rounded border badge-active">{TIPO_EXECUCAO_LABELS[tipo] || tipo}</span>}

            {/* Countdown or static time */}
            {countdown ? (
              <span className={`flex items-center gap-1 font-medium rounded px-1.5 py-0.5 ${
                countdown.isExpired
                  ? "bg-destructive/10 text-destructive"
                  : countdown.isUrgent
                    ? "bg-orange-500/10 text-orange-600 animate-pulse"
                    : countdown.isWarning
                      ? "bg-amber-500/10 text-amber-600"
                      : "text-muted-foreground"
              }`}>
                {countdown.isExpired ? <TimerOff className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                {countdown.label}
              </span>
            ) : (
              <>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.data_prevista}</span>
                {a.horario_limite && <span>até {a.horario_limite}</span>}
              </>
            )}

            {a.rodada_atual > 1 && (
              <span className="flex items-center gap-1 text-amber-600">
                <RotateCcw className="w-3 h-3" /> Rodada {a.rodada_atual}
              </span>
            )}
            {hasContingency && <span className="flex items-center gap-1 text-orange-600"><AlertTriangle className="w-3 h-3" />Contingência</span>}
            {a.score_executor != null && (
              <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="w-3 h-3" />{Math.round(a.score_executor)}pts</span>
            )}
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}
