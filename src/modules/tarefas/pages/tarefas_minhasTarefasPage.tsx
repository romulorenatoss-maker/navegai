import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Play, Send, ChevronLeft, CheckCircle2, AlertTriangle, ChevronDown, Search, Clock, RotateCcw, CheckCheck, CalendarClock, ListTodo, Hourglass, Filter, History, Plus, Users, Activity, ArrowDownUp } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmbeddedContingencyPanel } from "@/modules/tarefas/components/tarefas_embeddedContingencyPanel";
import { EmbeddedReviewPanel, EmbeddedApprovalPanel } from "@/modules/tarefas/components/tarefas_embeddedActionPanels";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { AssignmentCard } from "@/modules/tarefas/components/tarefas_tarefaCard";
import { DynamicFieldRenderer, SnapshotField, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useAssignmentExecution } from "@/modules/tarefas/hooks/tarefas_useAssignmentExecution";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MinhasTarefasTab from "@/modules/tarefas/components/tarefas_minhasTarefasTab";
import QuickTaskDialog from "@/modules/tarefas/components/tarefas_quickCreateDialog";
import TaskTypeSelectorDialog, { type TaskType } from "@/components/TaskTypeSelectorDialog";
import { ListChecks, Trophy } from "lucide-react";
import { bucketize, sortAssignments, availableVisoes, computeSla, isLate, isSemMovimento, type SortKey, type VisaoKey } from "@/modules/tarefas/services/tarefas_bucketize";
import { VisaoSwitcher } from "@/modules/tarefas/components/tarefas_visaoSwitcher";
import { PainelRetornoCard } from "@/modules/tarefas/components/tarefas_painelRetornoCard";

interface AccordionSectionProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  borderColor: string;
  badgeBg: string;
  badgeText: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

// MineOthersTabs removido — separação por papel agora é feita via VisaoSwitcher.

function AccordionSection({ title, count, icon, borderColor, badgeBg, badgeText, isOpen, onToggle, children }: AccordionSectionProps) {
  return (
    <div className={`rounded-xl border overflow-hidden transition-all duration-300 ${isOpen ? "shadow-md border-transparent" : "border-border hover:border-muted-foreground/20"}`}
      style={{ borderLeftWidth: "4px", borderLeftColor: borderColor }}>
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${isOpen ? "bg-muted/60" : "bg-card hover:bg-muted/30"}`}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: `${borderColor}15` }}>
            {icon}
          </div>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-bold ${badgeBg} ${badgeText}`}>
            {count}
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div className={`transition-all duration-300 ease-in-out ${isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}>
        <div className="px-4 pb-4 pt-2 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

// === RenderVisao: organização por papel reutilizando AccordionSection + bucketize ===
interface RenderVisaoProps {
  visao: VisaoKey;
  buckets: ReturnType<typeof bucketize>;
  sorted: (l: any[]) => any[];
  openAccordion: string | null;
  setOpenAccordion: (k: string | null) => void;
  openExecution: (a: any) => void;
  hojeFiltrado: any[];
  lateInHojeCount: number;
  showOnlyLate: boolean;
  setShowOnlyLate: (b: boolean | ((p: boolean) => boolean)) => void;
}

function listOrEmpty(list: any[], openExecution: (a: any) => void, emptyMsg: string, designador = false) {
  if (list.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">{emptyMsg}</p>;
  return (
    <div className="space-y-2">
      {list.map((a) =>
        designador
          ? <PainelRetornoCard key={a.id} assignment={a} onClick={openExecution} />
          : <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />
      )}
    </div>
  );
}

function Section({ id, title, count, color, badgeBg, badgeText, icon, openAccordion, setOpenAccordion, children, highlight }: any) {
  return (
    <AccordionSection
      title={title}
      count={count}
      icon={icon}
      borderColor={color}
      badgeBg={badgeBg}
      badgeText={badgeText}
      isOpen={openAccordion === id}
      onToggle={() => setOpenAccordion(openAccordion === id ? null : id)}
    >
      {highlight}
      {children}
    </AccordionSection>
  );
}

function RenderVisao({ visao, buckets, sorted, openAccordion, setOpenAccordion, openExecution, hojeFiltrado, lateInHojeCount, showOnlyLate, setShowOnlyLate }: RenderVisaoProps) {
  const it = (a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />;

  if (visao === "executor") {
    return (
      <>
        <Section id="hoje" title="Tarefas de Hoje" count={hojeFiltrado.length}
          color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
          icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}
          highlight={lateInHojeCount > 0 && (
            <div className="flex items-center justify-between mb-2 px-1">
              <button type="button" onClick={() => setShowOnlyLate((v) => !v)}
                className={cn("inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-[11px] font-medium border transition-colors",
                  showOnlyLate ? "bg-destructive text-destructive-foreground border-destructive" : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                )} aria-pressed={showOnlyLate}>
                <Clock className="w-3 h-3" /> {showOnlyLate ? "Só atrasadas" : "Atrasadas"}: {lateInHojeCount}
              </button>
              {showOnlyLate && <button type="button" onClick={() => setShowOnlyLate(false)} className="text-[11px] text-muted-foreground hover:text-foreground underline">Limpar</button>}
            </div>
          )}>
          {listOrEmpty(hojeFiltrado, openExecution, showOnlyLate ? "Nenhuma tarefa atrasada." : "Nenhuma tarefa para hoje.")}
        </Section>
        <Section id="emExecucao" title="Em Execução" count={buckets.emExecucao.length}
          color="#3b82f6" badgeBg="bg-blue-500/15" badgeText="text-blue-700 dark:text-blue-400"
          icon={<Activity className="w-4 h-4" style={{ color: "#3b82f6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.emExecucao), openExecution, "Nenhuma tarefa em execução.")}
        </Section>
        <Section id="devolvidas" title="Devolvidas" count={buckets.devolvidas.length}
          color="#ef4444" badgeBg="bg-red-500/15" badgeText="text-red-700 dark:text-red-400"
          icon={<RotateCcw className="w-4 h-4" style={{ color: "#ef4444" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.devolvidas), openExecution, "Nenhuma tarefa devolvida.")}
        </Section>
        <Section id="planoAcao" title="Plano de Ação" count={buckets.planoAcao.length}
          color="#f59e0b" badgeBg="bg-amber-500/15" badgeText="text-amber-700 dark:text-amber-400"
          icon={<AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.planoAcao), openExecution, "Nenhum plano de ação pendente.")}
        </Section>
        <Section id="contingencias" title="Contingências" count={buckets.contingencias.length}
          color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
          icon={<AlertTriangle className="w-4 h-4 animate-pulse" style={{ color: "#f97316" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.contingencias), openExecution, "Sem contingências.")}
        </Section>
        <Section id="concluidas" title="Concluídas" count={buckets.concluidas.length}
          color="#22c55e" badgeBg="bg-green-500/15" badgeText="text-green-700 dark:text-green-400"
          icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.concluidas).slice(0, 50), openExecution, "Nenhuma tarefa concluída.")}
        </Section>
      </>
    );
  }

  if (visao === "avaliador") {
    return (
      <>
        <Section id="aguardandoAvaliacao" title="Aguardando Avaliação" count={buckets.aguardandoAvaliacao.length}
          color="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
          icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.aguardandoAvaliacao), openExecution, "Nada aguardando avaliação.")}
        </Section>
        <Section id="reavaliar" title="Reavaliar" count={buckets.reavaliar.length}
          color="#eab308" badgeBg="bg-yellow-500/15" badgeText="text-yellow-700 dark:text-yellow-400"
          icon={<RotateCcw className="w-4 h-4" style={{ color: "#eab308" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.reavaliar), openExecution, "Nada para reavaliar.")}
        </Section>
        <Section id="avaliadas" title="Avaliadas" count={buckets.avaliadas.length}
          color="#22c55e" badgeBg="bg-green-500/15" badgeText="text-green-700 dark:text-green-400"
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.avaliadas).slice(0, 50), openExecution, "Nenhuma avaliação registrada.")}
        </Section>
      </>
    );
  }

  if (visao === "aprovador") {
    return (
      <>
        <Section id="aguardandoAprovacao" title="Aguardando Aprovação" count={buckets.aguardandoAprovacao.length}
          color="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
          icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.aguardandoAprovacao), openExecution, "Nada aguardando aprovação.")}
        </Section>
        <Section id="reprovadas" title="Reprovadas" count={buckets.reprovadas.length}
          color="#ef4444" badgeBg="bg-red-500/15" badgeText="text-red-700 dark:text-red-400"
          icon={<AlertTriangle className="w-4 h-4" style={{ color: "#ef4444" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.reprovadas), openExecution, "Nada reprovado.")}
        </Section>
        <Section id="aprovadas" title="Aprovadas" count={buckets.aprovadas.length}
          color="#22c55e" badgeBg="bg-green-500/15" badgeText="text-green-700 dark:text-green-400"
          icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.aprovadas).slice(0, 50), openExecution, "Nenhuma aprovada.")}
        </Section>
      </>
    );
  }

  if (visao === "designador") {
    return (
      <>
        <Section id="criadasPorMim" title="Criadas por Mim" count={buckets.criadasPorMim.length}
          color="#06b6d4" badgeBg="bg-cyan-500/15" badgeText="text-cyan-700 dark:text-cyan-400"
          icon={<ListTodo className="w-4 h-4" style={{ color: "#06b6d4" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.criadasPorMim), openExecution, "Você não criou tarefas para outros.", true)}
        </Section>
        <Section id="aguardandoRetorno" title="Aguardando Retorno" count={buckets.aguardandoRetorno.length}
          color="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
          icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.aguardandoRetorno), openExecution, "Nada aguardando retorno.", true)}
        </Section>
        <Section id="atrasadas" title="Atrasadas" count={buckets.atrasadas.length}
          color="#ef4444" badgeBg="bg-red-500/15" badgeText="text-red-700 dark:text-red-400"
          icon={<Clock className="w-4 h-4" style={{ color: "#ef4444" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.atrasadas), openExecution, "Nenhuma atrasada.", true)}
        </Section>
        <Section id="slaEstourado" title="SLA Estourado" count={buckets.slaEstourado.length}
          color="#dc2626" badgeBg="bg-red-600/15" badgeText="text-red-800 dark:text-red-300"
          icon={<AlertTriangle className="w-4 h-4" style={{ color: "#dc2626" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.slaEstourado), openExecution, "Nenhum SLA estourado.", true)}
        </Section>
        <Section id="semMovimento" title="Sem Movimento (>48h)" count={buckets.semMovimento.length}
          color="#f59e0b" badgeBg="bg-amber-500/15" badgeText="text-amber-700 dark:text-amber-400"
          icon={<Activity className="w-4 h-4" style={{ color: "#f59e0b" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.semMovimento), openExecution, "Tudo movimentado recentemente.", true)}
        </Section>
        <Section id="contingenciasDes" title="Contingências" count={buckets.contingencias.length}
          color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
          icon={<AlertTriangle className="w-4 h-4 animate-pulse" style={{ color: "#f97316" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.contingencias), openExecution, "Sem contingências.", true)}
        </Section>
        <Section id="acompanhamento" title="Acompanhamento Geral" count={buckets.acompanhamentoGeral.length}
          color="#64748b" badgeBg="bg-slate-500/15" badgeText="text-slate-700 dark:text-slate-400"
          icon={<ListChecks className="w-4 h-4" style={{ color: "#64748b" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.acompanhamentoGeral).slice(0, 100), openExecution, "Nada para acompanhar.", true)}
        </Section>
      </>
    );
  }

  if (visao === "setor") {
    return (
      <>
        <Section id="doMeuSetor" title="Do Meu Setor" count={buckets.doMeuSetor.length}
          color="#3b82f6" badgeBg="bg-blue-500/15" badgeText="text-blue-700 dark:text-blue-400"
          icon={<Users className="w-4 h-4" style={{ color: "#3b82f6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.doMeuSetor), openExecution, "Sem tarefas no setor.")}
        </Section>
        <Section id="pendentesSetor" title="Pendentes do Setor" count={buckets.pendentesSetor.length}
          color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
          icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.pendentesSetor), openExecution, "Sem pendentes.")}
        </Section>
        <Section id="emAvaliacaoSetor" title="Em Avaliação do Setor" count={buckets.emAvaliacaoSetor.length}
          color="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
          icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.emAvaliacaoSetor), openExecution, "Nada em avaliação.")}
        </Section>
        <Section id="emAprovacaoSetor" title="Em Aprovação do Setor" count={buckets.emAprovacaoSetor.length}
          color="#a855f7" badgeBg="bg-purple-500/15" badgeText="text-purple-700 dark:text-purple-400"
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: "#a855f7" }} />}
          openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
          {listOrEmpty(sorted(buckets.emAprovacaoSetor), openExecution, "Nada em aprovação.")}
        </Section>
      </>
    );
  }

  // visao === "admin": expõe todas as derivações com filtros aplicados
  return (
    <>
      <Section id="adminPendentes" title="Pendentes" count={buckets.pendentes.length}
        color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
        icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.pendentes), openExecution, "Sem pendentes.")}
      </Section>
      <Section id="adminEmExecucao" title="Em Execução" count={buckets.emExecucao.length}
        color="#3b82f6" badgeBg="bg-blue-500/15" badgeText="text-blue-700 dark:text-blue-400"
        icon={<Activity className="w-4 h-4" style={{ color: "#3b82f6" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.emExecucao), openExecution, "Sem tarefas em execução.")}
      </Section>
      <Section id="adminAval" title="Aguardando Avaliação" count={buckets.aguardandoAvaliacao.length}
        color="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
        icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.aguardandoAvaliacao), openExecution, "Nada aguardando avaliação.")}
      </Section>
      <Section id="adminAprov" title="Aguardando Aprovação" count={buckets.aguardandoAprovacao.length}
        color="#a855f7" badgeBg="bg-purple-500/15" badgeText="text-purple-700 dark:text-purple-400"
        icon={<CheckCircle2 className="w-4 h-4" style={{ color: "#a855f7" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.aguardandoAprovacao), openExecution, "Nada aguardando aprovação.")}
      </Section>
      <Section id="adminCont" title="Contingências" count={buckets.contingencias.length}
        color="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
        icon={<AlertTriangle className="w-4 h-4 animate-pulse" style={{ color: "#f97316" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.contingencias), openExecution, "Sem contingências.")}
      </Section>
      <Section id="adminSla" title="SLA Estourado" count={buckets.slaEstourado.length}
        color="#dc2626" badgeBg="bg-red-600/15" badgeText="text-red-800 dark:text-red-300"
        icon={<AlertTriangle className="w-4 h-4" style={{ color: "#dc2626" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.slaEstourado), openExecution, "Nenhum SLA estourado.")}
      </Section>
      <Section id="adminSem" title="Sem Movimento" count={buckets.semMovimento.length}
        color="#f59e0b" badgeBg="bg-amber-500/15" badgeText="text-amber-700 dark:text-amber-400"
        icon={<Activity className="w-4 h-4" style={{ color: "#f59e0b" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.semMovimento), openExecution, "Tudo movimentado.")}
      </Section>
      <Section id="adminConc" title="Concluídas" count={buckets.concluidas.length}
        color="#22c55e" badgeBg="bg-green-500/15" badgeText="text-green-700 dark:text-green-400"
        icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
        openAccordion={openAccordion} setOpenAccordion={setOpenAccordion}>
        {listOrEmpty(sorted(buckets.concluidas).slice(0, 50), openExecution, "Nada concluído.")}
      </Section>
    </>
  );
}

const ACAO_LABELS: Record<string, string> = {
  visualizou: "Visualizou a tarefa",
  iniciou: "Iniciou a execução",
  preencheu_campo: "Preencheu campo",
  enviou_para_avaliacao: "Enviou para avaliação",
  admin_reabriu_para_edicao: "Admin reabriu para edição",
  salvou_rascunho: "Salvou rascunho",
};

function AuditTimelinePanel({ logs, assignment }: { logs: any[]; assignment: any }) {
  const isLate = (() => {
    if (!assignment?.horario_limite || !assignment?.data_prevista) return false;
    const limite = new Date(`${assignment.data_prevista}T${assignment.horario_limite}`);
    return new Date() > limite;
  })();

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" /> Histórico de Ações
        </h4>
        {isLate && assignment?.status !== "concluida" && assignment?.status !== "aprovada" && (
          <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">⚠ ATRASADO</span>
        )}
      </div>
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Nenhuma ação registrada.</p>
      ) : (
        <div className="relative pl-4 border-l-2 border-border space-y-2">
          {logs.map((log: any, i: number) => {
            const dt = new Date(log.created_at);
            const timeStr = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const dateStr = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            const isEnvio = log.acao === "enviou_para_avaliacao";
            const logAtrasado = log.detalhes?.atrasado;
            return (
              <div key={log.id || i} className="relative">
                <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 ${isEnvio ? "bg-green-500 border-green-300" : "bg-primary border-primary/50"}`} />
                <div className="text-[11px]">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-foreground">{log.profiles?.nome || "Sistema"}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{dateStr} {timeStr}</span>
                    {logAtrasado && <span className="text-[9px] font-bold text-destructive bg-destructive/10 px-1 py-0.5 rounded">ATRASADO</span>}
                  </div>
                  <p className="text-muted-foreground">{ACAO_LABELS[log.acao] || log.acao}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OperationalExecucaoPage() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { transition: centralTransition } = useOperationalTransition();
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [execDialogOpen, setExecDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [filterResponsavel, setFilterResponsavel] = useState<string>(profile?.id || "__all");
  const [searchTerm, setSearchTerm] = useState("");
  const [openAccordion, setOpenAccordion] = useState<string | null>("hoje");
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState<string>(today);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [taskTypePickerOpen, setTaskTypePickerOpen] = useState(false);
  const [pickedTaskType, setPickedTaskType] = useState<TaskType>("simples");
  const [pickedSetorId, setPickedSetorId] = useState<string>("");
  const isMobile = useIsMobile();
  // Visão ativa (executor/avaliador/aprovador/designador/setor/admin) — dinâmica por contexto real
  const [visao, setVisao] = useState<VisaoKey>("executor");
  // Ordenação por seção (única para todas as listas da visão atual)
  const [sortKey, setSortKey] = useState<SortKey>("sla");
  // Toggle "Só atrasadas" dentro do acordeão Hoje (executor)
  const [showOnlyLate, setShowOnlyLate] = useState(false);
  // Filtros admin
  const [adminSetor, setAdminSetor] = useState<string>("__all");
  const [adminExecutor, setAdminExecutor] = useState<string>("__all");

  // Compat com wrappers das rotas legadas: ?chip= mapeia para visão + acordeão
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const chipParam = searchParams.get("chip");
    if (!chipParam) return;
    const chipToVisao: Record<string, { v: VisaoKey; acc: string }> = {
      todas: { v: "executor", acc: "hoje" },
      executar: { v: "executor", acc: "hoje" },
      avaliar: { v: "avaliador", acc: "aguardandoAvaliacao" },
      aprovar: { v: "aprovador", acc: "aguardandoAprovacao" },
      plano_acao: { v: "executor", acc: "planoAcao" },
      contingencias: { v: "executor", acc: "contingencias" },
      atrasadas: { v: "executor", acc: "hoje" },
      concluidas: { v: "executor", acc: "concluidas" },
    };
    const target = chipToVisao[chipParam];
    if (target) {
      setVisao(target.v);
      setOpenAccordion(target.acc);
      if (chipParam === "atrasadas") setShowOnlyLate(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("chip");
    next.delete("from");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveFilterProfileId = isAdmin && filterResponsavel !== "__all" ? filterResponsavel : profile?.id;

  const { data: allProfilesRaw = [] } = useQuery({
    queryKey: ["operational_profiles_for_exec_filter"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
    enabled: isAdmin,
    staleTime: 60000,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["operational_my_assignments", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let q = (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao), profiles:responsavel_id(id, nome, foto_url), criador:created_by(id, nome), avaliador:profiles!operational_assignments_avaliador_id_fkey(nome), aprovador:profiles!operational_assignments_aprovador_id_fkey(nome)")
        .order("data_prevista", { ascending: true });
      if (!isAdmin) {
        q = q.or(`responsavel_id.eq.${profile.id},avaliador_id.eq.${profile.id},aprovador_id.eq.${profile.id},avaliado_id.eq.${profile.id},validador_contingencia_id.eq.${profile.id},created_by.eq.${profile.id}`);
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 300000,
  });

  // Setores do usuário (para visão Setor) — derivado de permissões com escopo team
  const { getScope } = usePermissions(profile?.id ?? null);
  const hasSetorScope = getScope("executar_tarefa") === "team";
  const { data: meusSetorIds = [] } = useQuery({
    queryKey: ["my_setor_ids", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await (supabase as any)
        .from("profile_setores")
        .select("setor_id")
        .eq("profile_id", profile.id);
      return (data || []).map((r: any) => r.setor_id);
    },
    enabled: !!profile?.id && hasSetorScope,
    staleTime: 300000,
  });

  const profilesWithTasks = useMemo(() => {
    if (!isAdmin) return [];
    const openStatuses = ["pendente", "em_andamento", "devolvida", "aguardando_avaliacao", "aguardando_aprovacao", "contingenciado", "contingencia"];
    const idsWithTasks = new Set(
      assignments.filter((a: any) => openStatuses.includes(a.status)).map((a: any) => a.responsavel_id).filter(Boolean)
    );
    if (profile?.id) idsWithTasks.add(profile.id);
    return allProfilesRaw.filter((p: any) => idsWithTasks.has(p.id));
  }, [isAdmin, assignments, allProfilesRaw, profile?.id]);

  // Lista de setores únicos presentes nas tarefas (para filtro admin)
  const setoresEmAssignments = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) {
      if (a.setor_id) map.set(a.setor_id, a.setor_nome || a.setor_id);
    }
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }));
  }, [assignments]);

  // === Filtragem base (busca + admin filtros) ===
  const filteredAssignments = useMemo(() => {
    let list = assignments as any[];
    if (isAdmin && adminExecutor !== "__all") {
      list = list.filter((a) => a.responsavel_id === adminExecutor);
    } else if (isAdmin && filterResponsavel !== "__all") {
      list = list.filter((a) =>
        a.responsavel_id === filterResponsavel || a.avaliado_id === filterResponsavel || a.created_by === filterResponsavel || a.created_by === profile?.id
      );
    }
    if (isAdmin && adminSetor !== "__all") {
      list = list.filter((a) => a.setor_id === adminSetor);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((a) => (a.template_snapshot?.nome || a.operational_templates?.nome || "").toLowerCase().includes(term));
    }
    return list;
  }, [assignments, isAdmin, filterResponsavel, adminExecutor, adminSetor, searchTerm, profile?.id]);

  // === BUCKETIZE — núcleo único ===
  const buckets = useMemo(
    () => bucketize(filteredAssignments, { profileId: effectiveFilterProfileId, isAdmin }, meusSetorIds),
    [filteredAssignments, effectiveFilterProfileId, isAdmin, meusSetorIds]
  );

  // Visões disponíveis (dinâmico por contexto)
  const visoes = useMemo(
    () => availableVisoes(buckets, { isAdmin, hasSetor: hasSetorScope && meusSetorIds.length > 0 }),
    [buckets, isAdmin, hasSetorScope, meusSetorIds.length]
  );

  // Ajusta visão se a atual sumir do contexto
  useEffect(() => {
    if (visoes.length === 0) return;
    if (!visoes.find((v) => v.key === visao)) setVisao(visoes[0].key);
  }, [visoes, visao]);

  // Helper de ordenação
  const sorted = useCallback((list: any[]) => sortAssignments(list, sortKey), [sortKey]);

  // Tarefas de Hoje (executor) — pendentes do dia + em execução + atrasadas
  const hojeBase = useMemo(() => {
    const me = effectiveFilterProfileId || profile?.id;
    return filteredAssignments.filter((a: any) => {
      if (a.status === "em_andamento" || a.status === "reaberta") return true;
      if (["pendente", "devolvida"].includes(a.status) && a.data_prevista <= filterDate && (a.responsavel_id === me || isAdmin)) return true;
      if (["contingenciado", "contingencia"].includes(a.status) && (a.responsavel_id === me || isAdmin)) return true;
      return false;
    });
  }, [filteredAssignments, filterDate, effectiveFilterProfileId, profile?.id, isAdmin]);
  const lateInHojeCount = useMemo(() => hojeBase.filter(isLate).length, [hojeBase]);
  const hojeFiltrado = useMemo(() => sorted(showOnlyLate ? hojeBase.filter(isLate) : hojeBase), [hojeBase, showOnlyLate, sorted]);

  const exec = useAssignmentExecution(selectedAssignment?.id || null);

  const snapshot = selectedAssignment?.template_snapshot;

  // Deduplicate sections and fields by id
  const snapshotSections: any[] = useMemo(() => {
    const raw = snapshot?.sections || [];
    const seen = new Set<string>();
    return raw.filter((s: any) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a: any, b: any) => a.ordem - b.ordem);
  }, [snapshot]);

  const snapshotFields: SnapshotField[] = useMemo(() => {
    const raw = snapshot?.fields || [];
    const seen = new Set<string>();
    const result = raw.filter((f: any) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
      .sort((a: any, b: any) => a.ordem - b.ordem);
    // Register field labels for detailed logging
    if (result.length > 0) exec.setFieldLabels(result);
    return result;
  }, [snapshot]);

  const sectionIds = useMemo(() => new Set(snapshotSections.map(s => s.id)), [snapshotSections]);

  const effectiveFields = useMemo(() => {
    if (snapshotSections.length === 0) return snapshotFields;
    return snapshotFields.filter(f => f.section_id && sectionIds.has(f.section_id));
  }, [snapshotFields, snapshotSections, sectionIds]);

  const fieldsBySection = useMemo(() => {
    const map: Record<string, SnapshotField[]> = {};
    for (const f of effectiveFields) {
      const key = f.section_id || "__nosection";
      (map[key] ??= []).push(f);
    }
    return map;
  }, [effectiveFields]);

  const openExecution = useCallback((a: any) => {
    setSelectedAssignment(a);
    setExecDialogOpen(true);
    setShowHistory(false);
    const sections = a.template_snapshot?.sections?.sort((x: any, y: any) => x.ordem - y.ordem);
    setActiveSection(sections?.[0]?.id || null);

    if (profile?.id) {
      // Auditoria enriquecida: papel_usado derivado do contexto
      const papelUsado =
        a.responsavel_id === profile.id ? "executor"
        : a.avaliador_id === profile.id ? "avaliador"
        : a.aprovador_id === profile.id ? "aprovador"
        : a.created_by === profile.id ? "designador"
        : isAdmin ? "admin"
        : "visualizador";
      (supabase as any).from("operational_execution_logs").insert({
        assignment_id: a.id,
        acao: "visualizou",
        executado_por: profile.id,
        detalhes: {
          viewed_at: new Date().toISOString(),
          papel_usado: papelUsado,
          status_atual: a.status,
        },
      }).then(() => {});
    }
  }, [profile?.id, isAdmin]);

  const closeExecution = async () => {
    if (exec.dirty) await exec.saveDraft();
    setExecDialogOpen(false);
    setSelectedAssignment(null);
    setSubmitAttempted(false);
    setShowHistory(false);
  };

  const visibleFields = useMemo(() =>
    effectiveFields.filter(f => evaluateVisibility(f.condicao_visibilidade, exec.answers)),
    [effectiveFields, exec.answers]
  );

  const isFilled = useCallback((f: SnapshotField) => {
    const a = exec.answers[f.id];
    return a && (a.valor_texto != null && a.valor_texto !== "" || a.valor_numero != null || a.valor_booleano != null || a.valor_data != null || a.valor_json != null);
  }, [exec.answers]);

  const progress = useMemo(() => {
    if (!visibleFields.length) return 0;
    const filled = visibleFields.filter(isFilled).length;
    return Math.round((filled / visibleFields.length) * 100);
  }, [visibleFields, isFilled]);

  const hasSections = snapshotSections.length > 1;
  const currentSectionIndex = useMemo(() => {
    if (!hasSections || !activeSection) return 0;
    return snapshotSections.findIndex(s => s.id === activeSection);
  }, [hasSections, activeSection, snapshotSections]);
  const isLastSection = currentSectionIndex >= snapshotSections.length - 1;
  const allFieldsFilled = progress === 100;

  const goToNextSection = () => {
    if (!isLastSection && snapshotSections[currentSectionIndex + 1]) {
      setActiveSection(snapshotSections[currentSectionIndex + 1].id);
    }
  };

  const goToPrevSection = () => {
    if (currentSectionIndex > 0 && snapshotSections[currentSectionIndex - 1]) {
      setActiveSection(snapshotSections[currentSectionIndex - 1].id);
    }
  };

  const isOwner = selectedAssignment?.responsavel_id === profile?.id;
  const isAvaliado = selectedAssignment?.avaliado_id === profile?.id;
  const isAdminEditing = isAdmin && selectedAssignment && !["nao_executada"].includes(selectedAssignment.status);
  const isEditable = selectedAssignment && (
    (["pendente", "em_andamento", "devolvida"].includes(selectedAssignment.status) && (isOwner || isAdmin)) ||
    isAdminEditing
  );
  const isDevolvida = selectedAssignment?.status === "devolvida";
  const isContingenciado = selectedAssignment && ["contingenciado", "contingencia"].includes(selectedAssignment.status);
  const needsAdminReopen = isAdmin && selectedAssignment && ["aguardando_avaliacao", "aguardando_aprovacao", "concluida", "aprovada", "contingenciado", "contingencia"].includes(selectedAssignment.status);
  // Show contingency panel for avaliado, validador, responsavel, or admin
  const showContingencyPanel = isContingenciado && selectedAssignment && (
    isAdmin || isOwner || isAvaliado ||
    selectedAssignment.validador_contingencia_id === profile?.id ||
    selectedAssignment.avaliador_id === profile?.id
  );
  // Criador validando recebimento de tarefa designada
  const isCriadorValidando = !!selectedAssignment
    && selectedAssignment.status === "aguardando_validacao"
    && selectedAssignment.created_by === profile?.id;

  // Modos de papel ativo no drawer (mutuamente exclusivos com edição do executor):
  //  - Avaliador: status aguardando_avaliacao | em_avaliacao
  //  - Aprovador: status aguardando_aprovacao
  // Admin sem ser avaliador/aprovador da tarefa NÃO entra nesses modos automaticamente
  // (evita atropelar o reabrir-para-edição). Usa-se apenas a igualdade de id.
  const isAvaliadorMode = !!selectedAssignment
    && selectedAssignment.avaliador_id === profile?.id
    && ["aguardando_avaliacao", "em_avaliacao"].includes(selectedAssignment.status);
  const isAprovadorMode = !!selectedAssignment
    && selectedAssignment.aprovador_id === profile?.id
    && selectedAssignment.status === "aguardando_aprovacao";

  const handleStart = () => {
    if (selectedAssignment) exec.startTask.mutate({
      assignmentId: selectedAssignment.id,
      horarioInicioPrevisto: selectedAssignment.horario_inicio_previsto || null,
      dataPrevista: selectedAssignment.data_prevista || null,
    }, {
      onSuccess: () => {
        closeExecution();
        toast.success("Tarefa iniciada com sucesso!");
      },
    });
  };

  const handleAprovarRecebimento = async () => {
    if (!selectedAssignment) return;
    try {
      await centralTransition.mutateAsync({
        assignmentId: selectedAssignment.id,
        action: "validar_designada_aprovar",
        origem: "execucao_validacao",
      });
      toast.success("Recebimento aprovado. Tarefa concluída.");
      closeExecution();
    } catch (e: any) {
      toast.error("Erro ao aprovar: " + e.message);
    }
  };

  const handleDevolverDesignada = async () => {
    if (!selectedAssignment) return;
    const motivo = window.prompt("Justifique a devolução desta tarefa:");
    if (!motivo?.trim()) { toast.error("Justificativa obrigatória."); return; }
    try {
      await centralTransition.mutateAsync({
        assignmentId: selectedAssignment.id,
        action: "validar_designada_devolver",
        motivo,
        origem: "execucao_validacao",
        extraData: { rodadaAtual: selectedAssignment.rodada_atual || 1 },
      });
      toast.success("Tarefa devolvida ao executor.");
      closeExecution();
    } catch (e: any) {
      toast.error("Erro ao devolver: " + e.message);
    }
  };

  const handleSubmit = () => {
    setSubmitAttempted(true);
    const fieldsToValidate = effectiveFields.filter(f =>
      evaluateVisibility(f.condicao_visibilidade, exec.answers)
    );
    const errors = exec.validateAll(fieldsToValidate, selectedAssignment?.status);
    if (errors.length > 0) {
      toast.error(`Corrija ${errors.length} erro(s) antes de enviar`, { description: errors.slice(0, 3).join("; ") });
      return;
    }
    exec.submit.mutate(
      { assignment: selectedAssignment, fields: fieldsToValidate },
      {
        onSuccess: () => {
          setExecDialogOpen(false);
          setSelectedAssignment(null);
          setSubmitAttempted(false);
        },
      }
    );
  };

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-6 text-muted-foreground">
      <p className="text-xs">{msg}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Minhas Tarefas</h1>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? "Hub operacional administrativo." : "Hub operacional por papel."}
          </p>
        </div>
      </div>

      <Tabs defaultValue="operacionais" className="w-full">
        <TabsList className="w-full sm:w-auto mb-4">
          <TabsTrigger value="operacionais" className="flex items-center gap-1.5">
            <ListChecks className="w-4 h-4" /> Tarefas Operacionais
          </TabsTrigger>
          <TabsTrigger value="avaliadas" className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4" /> Tarefas Avaliadas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="operacionais" className="space-y-0 mt-0">

      {/* Visão por papel — dinâmica conforme contexto real */}
      <div className="mb-3">
        <VisaoSwitcher visoes={visoes} value={visao} onChange={setVisao} isMobile={isMobile} />
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Pesquisar" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value || today)} className="w-[140px] h-9 text-sm" />
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <ArrowDownUp className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sla">SLA</SelectItem>
            <SelectItem value="atraso">Atraso</SelectItem>
            <SelectItem value="prioridade">Prioridade</SelectItem>
            <SelectItem value="criacao">Criação</SelectItem>
            <SelectItem value="movimento">Última movimentação</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => setTaskTypePickerOpen(true)} title="Nova Tarefa">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {isAdmin && visao === "admin" && (
        <div className="flex items-center gap-2 mb-3 flex-wrap p-2 rounded-lg bg-muted/40 border border-border">
          <Select value={adminExecutor} onValueChange={setAdminExecutor}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <Users className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Executor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os executores</SelectItem>
              {profilesWithTasks.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={adminSetor} onValueChange={setAdminSetor}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Setor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os setores</SelectItem>
              {setoresEmAssignments.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(adminExecutor !== "__all" || adminSetor !== "__all") && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdminExecutor("__all"); setAdminSetor("__all"); }}>
              Limpar
            </Button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-3">
          <RenderVisao
            visao={visao}
            buckets={buckets}
            sorted={sorted}
            openAccordion={openAccordion}
            setOpenAccordion={setOpenAccordion}
            openExecution={openExecution}
            hojeFiltrado={hojeFiltrado}
            lateInHojeCount={lateInHojeCount}
            showOnlyLate={showOnlyLate}
            setShowOnlyLate={setShowOnlyLate}
          />
        </div>
      )}
        </TabsContent>

        <TabsContent value="avaliadas" className="mt-0">
          <MinhasTarefasTab viewAsProfileId={isAdmin ? filterResponsavel : null} />
        </TabsContent>
      </Tabs>

      {/* Execution Dialog */}
      <Sheet open={execDialogOpen} onOpenChange={v => { if (!v) closeExecution(); }}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "p-0 flex flex-col gap-0 border-l",
            isMobile
              ? "h-[100dvh] w-full max-w-full inset-0 rounded-none"
              : "h-full w-full sm:max-w-2xl"
          )}
        >
          <VisuallyHidden><SheetTitle>{snapshot?.nome || "Rotina"}</SheetTitle></VisuallyHidden>
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeExecution}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate flex items-center gap-2">
                  {selectedAssignment?.numero_tarefa && (
                    <span className="text-[11px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                      #{String(selectedAssignment.numero_tarefa).padStart(4, "0")}
                    </span>
                  )}
                  {snapshot?.nome || "Rotina"}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>{selectedAssignment?.data_prevista}</span>
                  {selectedAssignment?.horario_limite && (
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Clock className="w-3 h-3" /> até {selectedAssignment.horario_limite}
                    </span>
                  )}
                  {selectedAssignment?.status && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_CONFIG[selectedAssignment.status]?.class || ""}`}>
                      {STATUS_CONFIG[selectedAssignment.status]?.label}
                    </span>
                  )}
                  {isDevolvida && (
                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                      <AlertTriangle className="w-3 h-3" /> Rodada {selectedAssignment?.rodada_atual}
                    </span>
                  )}
                  {!isEditable && selectedAssignment && !isCriadorValidando && !isAvaliadorMode && !isAprovadorMode && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-muted-foreground/30 bg-muted/50 text-muted-foreground">
                      🔒 Somente leitura
                    </span>
                  )}
                </div>
              </div>
              {/* History icon replacing "Não salvo" / rascunho */}
              <Button
                variant={showHistory ? "default" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => { setShowHistory(!showHistory); if (!showHistory) exec.refetchLogs(); }}
                title="Histórico de ações"
              >
                <History className="w-4 h-4" />
              </Button>
              {exec.dirty && (
                <span className="text-[10px] text-muted-foreground animate-pulse">Salvando...</span>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {snapshotSections.length > 1 && (
              <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                {snapshotSections.map((s: any) => {
                  const sFields = fieldsBySection[s.id] || [];
                  const sFieldsVisible = sFields.filter(f => evaluateVisibility(f.condicao_visibilidade, exec.answers));
                  const filled = sFieldsVisible.filter(f => {
                    const a = exec.answers[f.id];
                    return a && (a.valor_texto != null && a.valor_texto !== "" || a.valor_numero != null || a.valor_booleano != null || a.valor_data != null || a.valor_json != null);
                  }).length;
                  const allFilled = filled === sFieldsVisible.length && sFieldsVisible.length > 0;
                  const isLate = (() => {
                    if (!s.horario_fim || !selectedAssignment?.data_prevista) return false;
                    return new Date(`${selectedAssignment.data_prevista}T${s.horario_fim}`) < new Date();
                  })();
                  return (
                    <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                      className={`flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${activeSection === s.id ? "bg-primary/10 border-primary text-primary" : isLate && !allFilled ? "bg-destructive/5 border-destructive/30 text-destructive" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                        {s.nome || "Seção"}
                        {allFilled && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                        {isLate && !allFilled && <AlertTriangle className="w-3 h-3 text-destructive" />}
                        <span className="text-[10px] opacity-70">{filled}/{sFieldsVisible.length}</span>
                      </div>
                      {s.horario_fim && (
                        <span className={`text-[10px] ${isLate && !allFilled ? "text-destructive" : "text-muted-foreground"}`}>
                          {s.horario_inicio && `${s.horario_inicio} — `}{s.horario_fim}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* History Panel */}
            {showHistory && (
              <div className="bg-muted/40 border border-border rounded-lg p-3 mb-2">
                <AuditTimelinePanel logs={exec.executionLogs} assignment={selectedAssignment} />
              </div>
            )}

            {selectedAssignment?.status === "pendente" && !isAdmin && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Inicie a tarefa para começar o preenchimento.</p>
                <Button onClick={handleStart} disabled={exec.startTask.isPending}>
                  <Play className="w-4 h-4 mr-2" /> Iniciar Tarefa
                </Button>
              </div>
            )}

            {selectedAssignment?.status === "pendente" && isAdmin && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Tarefa pendente. Como administrador, você pode iniciar ou editar.</p>
                <Button onClick={handleStart} disabled={exec.startTask.isPending}>
                  <Play className="w-4 h-4 mr-2" /> Iniciar Tarefa
                </Button>
              </div>
            )}

            {needsAdminReopen && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-medium">Modo Administrador:</span>
                  <span>Esta tarefa está em <strong>{STATUS_CONFIG[selectedAssignment.status]?.label}</strong>. Você pode editar os campos diretamente.</span>
                </div>
              </div>
            )}

            {/* Embedded contingency panel for contingenciado tasks */}
            {showContingencyPanel && selectedAssignment && (
              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <EmbeddedContingencyPanel assignmentId={selectedAssignment.id} />
              </div>
            )}

            {isEditable && selectedAssignment?.status !== "pendente" && (
              <>
                {snapshotSections.length === 0 ? (
                  <div className="space-y-3">
                    {effectiveFields.map(f => (
                      <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                        review={exec.getLatestReview(f.id)} userRole="executor"
                        disabled={isDevolvida && exec.getLatestReview(f.id)?.devolvido !== true}
                        allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id}
                        showValidation={submitAttempted} />
                    ))}
                  </div>
                ) : (
                  snapshotSections.filter(s => !activeSection || s.id === activeSection).map((section: any) => {
                    const sFields = fieldsBySection[section.id] || [];
                    const sectionLate = (() => {
                      if (!section.horario_fim || !selectedAssignment?.data_prevista) return false;
                      return new Date(`${selectedAssignment.data_prevista}T${section.horario_fim}`) < new Date();
                    })();
                    const sectionTimeRemaining = (() => {
                      if (!section.horario_fim || !selectedAssignment?.data_prevista) return null;
                      const diff = new Date(`${selectedAssignment.data_prevista}T${section.horario_fim}`).getTime() - Date.now();
                      if (diff <= 0) return "Atrasado";
                      const h = Math.floor(diff / 3600000);
                      const m = Math.floor((diff % 3600000) / 60000);
                      return h > 0 ? `${h}h ${m}min restantes` : `${m}min restantes`;
                    })();
                    return (
                      <div key={section.id}>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.cor || "#3b82f6" }} />
                          <h3 className="text-sm font-semibold text-foreground">{section.nome}</h3>
                          {section.descricao && <p className="text-xs text-muted-foreground">— {section.descricao}</p>}
                        </div>
                        {(section.horario_inicio || section.horario_fim) && (
                          <div className={`flex items-center gap-2 mb-3 ml-5 text-xs ${sectionLate ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            <Clock className="w-3.5 h-3.5" />
                            {section.horario_inicio && <span>Início: {section.horario_inicio}</span>}
                            {section.horario_fim && <span>• Limite: {section.horario_fim}</span>}
                            {sectionTimeRemaining && (
                              <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${sectionLate ? "bg-destructive/10 text-destructive" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>
                                {sectionLate ? "⚠ ATRASADO" : `⏱ ${sectionTimeRemaining}`}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="space-y-3">
                          {sFields.map(f => (
                            <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                              review={exec.getLatestReview(f.id)} userRole="executor"
                              disabled={isDevolvida && exec.getLatestReview(f.id)?.devolvido !== true}
                              allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id}
                              showValidation={submitAttempted} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {!isEditable && selectedAssignment && isAvaliadorMode && (
              <EmbeddedReviewPanel
                assignment={selectedAssignment}
                fields={effectiveFields}
                onClose={closeExecution}
              />
            )}

            {!isEditable && selectedAssignment && isAprovadorMode && (
              <EmbeddedApprovalPanel
                assignment={selectedAssignment}
                fields={effectiveFields}
                onClose={closeExecution}
              />
            )}

            {!isEditable && selectedAssignment && !isAvaliadorMode && !isAprovadorMode && (
              <div className="space-y-3">
                {effectiveFields.map(f => (
                  <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                    review={exec.getLatestReview(f.id)} userRole="executor"
                    disabled={true} allAnswers={exec.answers} onChange={() => {}} assignmentId={selectedAssignment?.id || ""} />
                ))}
              </div>
            )}
          </div>

          {isCriadorValidando && (
            <div className="border-t border-border p-3 flex items-center gap-2 bg-card safe-area-bottom flex-wrap">
              <div className="flex-1 text-xs text-muted-foreground">
                Esta tarefa foi designada por você e está aguardando sua validação de recebimento.
              </div>
              <Button type="button" size="sm" variant="outline" onClick={handleDevolverDesignada} disabled={centralTransition.isPending}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
              </Button>
              <Button type="button" size="sm" onClick={handleAprovarRecebimento} disabled={centralTransition.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar Recebimento
              </Button>
            </div>
          )}

          {isEditable && selectedAssignment?.status !== "pendente" && (
            <div className="border-t border-border p-3 flex items-center gap-2 bg-card safe-area-bottom flex-wrap">
              {hasSections && currentSectionIndex > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={goToPrevSection}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Etapa Anterior
                </Button>
              )}
              <div className="flex-1" />
              {needsAdminReopen ? (
                <Button type="button" size="sm" variant="outline" onClick={async () => {
                  try {
                    await centralTransition.mutateAsync({
                      assignmentId: selectedAssignment.id,
                      action: "admin_reabrir_edicao",
                      motivo: "Edição administrativa",
                      origem: "execucao",
                    });
                    await (supabase as any).from("operational_execution_logs").insert({
                      assignment_id: selectedAssignment.id, acao: "admin_reabriu_para_edicao",
                      executado_por: profile?.id, detalhes: { status_anterior: selectedAssignment.status },
                    });
                    toast.success("Tarefa reaberta para edição");
                    setSelectedAssignment({ ...selectedAssignment, status: "em_andamento" });
                    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
                    exec.refetchLogs();
                  } catch (e: any) {
                    toast.error("Erro ao reabrir: " + e.message);
                  }
                }}>
                  <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reabrir para Edição
                </Button>
              ) : hasSections && !isLastSection ? (
                <Button type="button" size="sm" onClick={goToNextSection}>
                  Próxima Etapa <ChevronDown className="w-3.5 h-3.5 ml-1 -rotate-90" />
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={handleSubmit} disabled={exec.isSubmitting || !allFieldsFilled}>
                  <Send className="w-3.5 h-3.5 mr-1" /> {exec.isSubmitting ? "Enviando..." : "Enviar para Avaliação"}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <TaskTypeSelectorDialog
        open={taskTypePickerOpen}
        onOpenChange={setTaskTypePickerOpen}
        onPick={({ type, setorId }) => {
          setPickedTaskType(type);
          setPickedSetorId(setorId);
          setTaskTypePickerOpen(false);
          setQuickTaskOpen(true);
        }}
      />

      <QuickTaskDialog
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
        defaultAvaliadoId={effectiveFilterProfileId}
        taskType={pickedTaskType}
        initialSetorId={pickedSetorId}
      />
    </div>
  );
}
