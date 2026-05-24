import { useState, useEffect, useMemo } from "react";
import { Clock, ChevronRight, AlertTriangle, RotateCcw, CheckCircle2, Timer, TimerOff, ClipboardCheck, Play } from "lucide-react";
import { STATUS_CONFIG, TIPO_EXECUCAO_LABELS } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { TASK_STATUS } from "@/modules/tarefas/services/tarefas_statusConstants";
import { toast } from "sonner";

const STARTABLE_STATUSES: string[] = [
  TASK_STATUS.ABERTA,
  TASK_STATUS.PENDENTE,
  TASK_STATUS.DEVOLVIDA,
  TASK_STATUS.REABERTA,
  TASK_STATUS.EM_PLANO_ACAO,
];

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

function useElapsedSince(startedAt?: string | null) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes > 0 ? `${remainingMinutes}m` : ""}`;
}

export function AssignmentCard({ assignment: a, onClick }: Props) {
  const { profile } = useAuth();
  const { transition } = useOperationalTransition();
  const snapshot = a.template_snapshot;
  const nome = snapshot?.nome || a.operational_templates?.nome || "Rotina";
  const tipo = snapshot?.tipo_execucao || a.operational_templates?.tipo_execucao;
  const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
  const isReturned = a.status === "devolvida";
  const hasContingency = a.contingency_count > 0;

  // Nome do executor: setor ou individual
  const nomeExecutor = a.setor_executor?.nome
    ? `${a.setor_executor.nome} (setor)`
    : a.profiles?.nome || "";

  // Criticidade vinda dos planos de ação ativos
  const criticidadePlano = (() => {
    const planos: any[] = a.contingencias || [];
    if (planos.some((p: any) => p.criticidade === "alta")) return "alta";
    if (planos.some((p: any) => p.criticidade === "media")) return "media";
    if (planos.length > 0) return "baixa";
    return null;
  })();

  // Planos de ação resumo
  const planosRaw: any[] = a.contingencias || [];
  const planosResumo = planosRaw.map((p: any) => {
    const prazoMs = p.prazo_resolucao ? new Date(p.prazo_resolucao).getTime() : null;
    const resolvidoEm = p.resolvida_em ? new Date(p.resolvida_em).getTime() : null;
    const agora = Date.now();
    if (resolvidoEm && prazoMs) return resolvidoEm <= prazoMs ? "ok" : "atrasado";
    if (!resolvidoEm && prazoMs) return agora > prazoMs ? "atrasado" : "andamento";
    return "andamento";
  });

  const criticidade = criticidadePlano;

  const descricao = snapshot?.descricao || "";
  const responsavelNome = a.profiles?.nome || "";
  const responsavelFoto = a.profiles?.foto_url || "";
  const initials = responsavelNome
    ? responsavelNome.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const isActive = ["pendente", "em_andamento", "devolvida"].includes(a.status);
  const countdown = useCountdown(a.data_prevista, isActive ? a.horario_limite : null);
  const etapaElapsed = useElapsedSince(a.etapa_atual_started_at);

  // Botão Iniciar: visível para o executor quando a tarefa está em status que permite iniciar.
  const isExecutorOuAdmin = !!profile?.id && (a.responsavel_id === profile.id);
  const canStart = isExecutorOuAdmin && STARTABLE_STATUSES.includes(a.status) && !transition.isPending;

  async function handleStart(e: React.MouseEvent) {
    e.stopPropagation(); // não abrir o drawer
    try {
      const action = a.status === TASK_STATUS.ABERTA ? "aceitar_tarefa" : "iniciar";
      await transition.mutateAsync({
        assignmentId: a.id,
        action,
        origem: "tarefa_card_iniciar",
        extraData: { papel_usado: "EXECUTOR" },
      });
      toast.success("Tarefa iniciada");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível iniciar a tarefa");
    }
  }

  // ─── Papel do usuário nesta tarefa ─────────────────────────────────
  const myRole = useMemo<"executor" | "aprovador" | "auditor" | null>(() => {
    if (!profile?.id) return null;
    if (a.aprovador_id === profile.id || ["aguardando_aprovacao"].includes(a.status)) {
      if (a.aprovador_id === profile.id) return "aprovador";
    }
    if (a.auditor_id === profile.id) return "auditor";
    if (a.responsavel_id === profile.id) return "executor";
    return null;
  }, [profile?.id, a.aprovador_id, a.auditor_id, a.responsavel_id, a.status]);

  // ─── Progresso de conclusão (% de respostas da etapa atual) ────────
  // Só renderiza se a query expuser as contagens (campos *_answer_count).
  const completionPct = useMemo(() => {
    const fields: any[] = (snapshot?.fields || []).filter((f: any) => f?.obrigatorio !== false);
    if (myRole === "aprovador" && a.approver_answer_count != null) {
      const apFields = fields.filter((f: any) => f.aprovador_verificar);
      if (apFields.length === 0) return null;
      return Math.min(100, Math.round((a.approver_answer_count / apFields.length) * 100));
    }
    if (myRole === "executor" && a.field_answer_count != null) {
      if (fields.length === 0) return null;
      return Math.min(100, Math.round((a.field_answer_count / fields.length) * 100));
    }
    if (myRole === "auditor" && a.audit_answer_count != null) {
      const items = (snapshot?.ada_config_snapshot?.checklists?.validador || []) as any[];
      if (items.length === 0) return null;
      return Math.min(100, Math.round((a.audit_answer_count / items.length) * 100));
    }
    return null;
  }, [snapshot, myRole, a.field_answer_count, a.approver_answer_count, a.audit_answer_count]);

  // ─── Progresso temporal (% do SLA consumido) ───────────────────────
  const timePct = useMemo(() => {
    if (!a.data_prevista || !a.horario_limite) return null;
    const [h, m] = a.horario_limite.split(":").map(Number);
    const deadline = new Date(`${a.data_prevista}T00:00:00`);
    deadline.setHours(h, m, 0, 0);
    const start = a.criado_em ? new Date(a.criado_em).getTime() : new Date(`${a.data_prevista}T00:00:00`).getTime();
    const total = deadline.getTime() - start;
    if (total <= 0) return null;
    const elapsed = Date.now() - start;
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }, [a.data_prevista, a.horario_limite, a.criado_em, countdown?.label]);

  const timeBarColor = timePct == null
    ? "bg-muted"
    : timePct >= 100 ? "bg-destructive"
    : timePct >= 90 ? "bg-red-500"
    : timePct >= 60 ? "bg-amber-500"
    : "bg-emerald-500";

  const corBorda = isReturned ? "border-amber-400" : countdown?.isExpired ? "border-destructive/60" : countdown?.isUrgent ? "border-orange-400" : "border-border";
  const corBordaEsq = isReturned ? "#ef9f27" : countdown?.isExpired ? "#e24b4a" : countdown?.isUrgent ? "#f97316" : "transparent";

  return (
    <div onClick={() => onClick(a)}
      className={`bg-card border rounded-lg overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:shadow-sm ${corBorda}`}
      style={{ borderLeft: `3px solid ${corBordaEsq}` }}>

      {/* Linha principal: número + nome + status + prioridade */}
      <div className="flex items-start gap-2 p-3 pb-2">
        <div className="flex-1 min-w-0">
          {/* Número + nome */}
          <div className="flex items-center gap-1.5 mb-1">
            {a.numero_tarefa && (
              <span className="text-[10px] font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                #{String(a.numero_tarefa).padStart(4, "0")}
              </span>
            )}
            <h3 className="text-sm font-medium text-foreground truncate">{nome}</h3>
          </div>
          {/* Executor + setor + tipo */}
          <p className="text-[11px] text-muted-foreground truncate">
            {nomeExecutor}{tipo ? ` · ${TIPO_EXECUCAO_LABELS[tipo] || tipo}` : ""}
          </p>
        </div>

        {/* Prioridade + status — canto superior direito */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {criticidade && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              criticidade === "alta" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
              criticidade === "media" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" :
              "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
            }`}>
              {criticidade === "alta" ? "Alta" : criticidade === "media" ? "Média" : "Baixa"}
            </span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${statusConf.class}`}>
            {statusConf.label}
          </span>
        </div>
      </div>

      {/* Linha de SLA global + rodada */}
      <div className="px-3 pb-2 flex items-center gap-3 flex-wrap">
        {countdown ? (
          <span className={`flex items-center gap-1 text-[10px] font-medium ${
            countdown.isExpired ? "text-destructive" :
            countdown.isUrgent ? "text-orange-600 animate-pulse" :
            countdown.isWarning ? "text-amber-600" : "text-muted-foreground"
          }`}>
            {countdown.isExpired ? <TimerOff className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
            {countdown.isExpired ? "Prazo global: " : ""}{countdown.label}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="w-3 h-3" />{a.data_prevista}{a.horario_limite && ` até ${a.horario_limite}`}
          </span>
        )}

        {a.rodada_atual > 1 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-600">
            <RotateCcw className="w-3 h-3" /> R{a.rodada_atual}
          </span>
        )}

        {a.etapa_atual_label && etapaElapsed && (
          <span className="flex items-center gap-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
            <Timer className="w-3 h-3" />
            {a.etapa_atual_label}: {etapaElapsed}
          </span>
        )}

        {a.etapa_atual_inicio_atrasado && (
          <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
            <AlertTriangle className="w-3 h-3" />
            Inicio atrasado {a.etapa_atual_inicio_atraso_minutos}min
          </span>
        )}

        {a.score_executor != null && (
          <span className="flex items-center gap-1 text-[10px] text-primary ml-auto">
            <CheckCircle2 className="w-3 h-3" />{Math.round(a.score_executor)}pts
          </span>
        )}
      </div>

      {/* Planos de ação — pills coloridas */}
      {planosResumo.length > 0 && (
        <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground shrink-0">Planos:</span>
          {planosResumo.map((status, i) => (
            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              status === "ok" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" :
              status === "atrasado" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" :
              "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            }`}>
              PA{i + 1} {status === "ok" ? "✓" : status === "atrasado" ? "✗" : "⏳"}
            </span>
          ))}
        </div>
      )}

      {/* Barra de progresso de etapa */}
      {isActive && completionPct != null && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{completionPct}%</span>
          </div>
        </div>
      )}

      {/* Botão Iniciar */}
      {canStart && (
        <div className="px-3 pb-3">
          <Button size="sm" variant="default" className="h-7 px-3 text-xs gap-1.5 w-full"
            onClick={handleStart} disabled={transition.isPending}>
            <Play className="w-3 h-3" />
            {transition.isPending ? "Iniciando..." : "Iniciar tarefa"}
          </Button>
        </div>
      )}
    </div>
  );
}

