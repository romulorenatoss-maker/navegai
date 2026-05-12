import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Play, Send, ChevronLeft, CheckCircle2, AlertTriangle, ChevronDown, Search, Clock, RotateCcw, CheckCheck, CalendarClock, ListTodo, Hourglass, Filter, History, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmbeddedContingencyPanel } from "@/modules/tarefas/components/tarefas_embeddedContingencyPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { OperationalChipFilterBar, type OperationalChipFilter } from "@/modules/tarefas/components/tarefas_chipFilterBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { AssignmentCard } from "@/modules/tarefas/components/tarefas_tarefaCard";
import { DynamicFieldRenderer, SnapshotField, FieldAnswer, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useAssignmentExecution } from "@/modules/tarefas/hooks/tarefas_useAssignmentExecution";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MinhasTarefasTab from "@/modules/tarefas/components/tarefas_minhasTarefasTab";
import QuickTaskDialog from "@/modules/tarefas/components/tarefas_quickCreateDialog";
import TaskTypeSelectorDialog, { type TaskType } from "@/components/TaskTypeSelectorDialog";
import { MinhasTarefasPendentesPanel } from "@/modules/tarefas/components/tarefas_minhasTarefasPendentesPanel";
import { AguardandoAvaliacaoPanel } from "@/modules/tarefas/components/tarefas_aguardandoAvaliacaoPanel";
import { useContingencyManagement } from "@/modules/tarefas/hooks/tarefas_useContingencyManagement";
import { ListChecks, Trophy } from "lucide-react";

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

interface MineOthersTabsProps {
  mine: any[];
  others: any[];
  showOthers: boolean;
  renderItem: (a: any) => React.ReactNode;
  emptyMine: string;
  emptyOthers?: string;
}

function MineOthersTabs({ mine, others, showOthers, renderItem, emptyMine, emptyOthers = "Nenhuma tarefa de outros." }: MineOthersTabsProps) {
  const [tab, setTab] = useState<"minhas" | "outros">("minhas");
  if (!showOthers) {
    return (
      <>
        {mine.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-4">{emptyMine}</p>
          : mine.map(renderItem)}
      </>
    );
  }
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
      <TabsList className="h-8 mb-2">
        <TabsTrigger value="minhas" className="text-xs h-6 px-2">Minhas ({mine.length})</TabsTrigger>
        <TabsTrigger value="outros" className="text-xs h-6 px-2">Outros ({others.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="minhas" className="mt-0 space-y-2">
        {mine.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-4">{emptyMine}</p>
          : mine.map(renderItem)}
      </TabsContent>
      <TabsContent value="outros" className="mt-0 space-y-2">
        {others.length === 0
          ? <p className="text-xs text-muted-foreground text-center py-4">{emptyOthers}</p>
          : others.map(renderItem)}
      </TabsContent>
    </Tabs>
  );
}

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
  const [chipFilter, setChipFilter] = useState<OperationalChipFilter>("todas");
  const isMobile = useIsMobile();
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
        .select("*, operational_templates(nome, tipo_execucao), profiles:responsavel_id(id, nome, foto_url), criador:created_by(id, nome)")
        .order("data_prevista", { ascending: true });
      if (!isAdmin) {
        // Inclui também tarefas onde sou o CRIADOR (created_by) — necessário para "Designadas" e "Validação"
        q = q.or(`responsavel_id.eq.${profile.id},avaliador_id.eq.${profile.id},avaliado_id.eq.${profile.id},validador_contingencia_id.eq.${profile.id},created_by.eq.${profile.id}`);
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 300000,
  });

  // Contingências (planos de ação) abertas onde sou responsável e prazo_sla < 24h
  const { data: contingenciasUrgentes = [] } = useQuery({
    queryKey: ["operational_contingencies_urgent", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const limite = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from("operational_contingencies")
        .select("assignment_id, prazo_sla, status")
        .in("status", ["aberta", "em_andamento"])
        .eq("responsavel_id", profile.id)
        .lte("prazo_sla", limite);
      if (error) return [];
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });

  const urgentContingencyAssignmentIds = useMemo(
    () => new Set(contingenciasUrgentes.map((c: any) => c.assignment_id)),
    [contingenciasUrgentes]
  );

  const profilesWithTasks = useMemo(() => {
    if (!isAdmin) return [];
    const openStatuses = ["pendente", "em_andamento", "devolvida", "aguardando_avaliacao", "aguardando_aprovacao", "contingenciado", "contingencia"];
    const idsWithTasks = new Set(
      assignments
        .filter((a: any) => openStatuses.includes(a.status))
        .map((a: any) => a.responsavel_id)
        .filter(Boolean)
    );
    // Sempre incluir o próprio usuário logado no filtro, mesmo sem tarefas em aberto
    if (profile?.id) idsWithTasks.add(profile.id);
    return allProfilesRaw.filter((p: any) => idsWithTasks.has(p.id));
  }, [isAdmin, assignments, allProfilesRaw, profile?.id]);

  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (isAdmin && filterResponsavel !== "__all") {
      // Mantém também tarefas que EU criei (designadas), mesmo ao filtrar por responsável
      list = list.filter((a: any) => a.responsavel_id === filterResponsavel || a.created_by === profile?.id);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((a: any) => {
        const nome = a.template_snapshot?.nome || a.operational_templates?.nome || "";
        return nome.toLowerCase().includes(term);
      });
    }
    if (filterDate) {
      list = list.filter((a: any) => {
        // Tarefas designadas por mim (created_by) sempre passam, independente de data
        if (a.created_by === profile?.id && a.responsavel_id !== profile?.id) return true;
        if (["concluida", "aprovada", "aguardando_avaliacao", "aguardando_aprovacao", "nao_executada", "contingenciado", "contingencia"].includes(a.status)) return true;
        if (a.status === "devolvida") return true;
        return a.data_prevista === filterDate || (a.data_prevista < filterDate && !["concluida", "aprovada"].includes(a.status));
      });
    }
    return list;
  }, [assignments, isAdmin, filterResponsavel, searchTerm, filterDate, profile?.id]);

  // "Tarefas de Hoje" includes: today's tasks + em_andamento (any date) + atrasadas + contingências com SLA < 24h
   const hoje = filteredAssignments.filter((a: any) => {
    if (["em_andamento"].includes(a.status)) return true;
    if (["pendente", "devolvida"].includes(a.status) && a.data_prevista <= filterDate && a.responsavel_id === profile?.id) return true;
    // Contingências (planos de ação) prioridade: aparecem no dia se SLA expira em <24h
    if (["contingenciado", "contingencia"].includes(a.status) && urgentContingencyAssignmentIds.has(a.id)) return true;
    return false;
  });
  // NOVO: "Tarefas Designadas" — tarefas que EU criei para outras pessoas (apenas em aberto/ativas)
  const tarefasDesignadas = filteredAssignments.filter((a: any) =>
    a.created_by === profile?.id &&
    a.responsavel_id !== profile?.id &&
    !["concluida", "aprovada", "reprovada", "nao_executada"].includes(a.status)
  );
  // NOVO: "Aguardando Minha Validação" — tarefas designadas por mim que aguardam minha validação
  const aguardandoMinhaValidacao = filteredAssignments.filter((a: any) =>
    a.created_by === profile?.id &&
    a.responsavel_id !== profile?.id &&
    a.status === "aguardando_validacao"
  );
  // Devolvidas — separado em duas sub-listas
  const minhasDevolucoes = filteredAssignments.filter((a: any) =>
    a.status === "devolvida" && a.responsavel_id === profile?.id
  );
  const devolvidasParaOutros = filteredAssignments.filter((a: any) =>
    a.status === "devolvida" && a.created_by === profile?.id && a.responsavel_id !== profile?.id
  );
  const devolvidas = [...minhasDevolucoes, ...filteredAssignments.filter((a: any) =>
    ["contingenciado", "contingencia"].includes(a.status) && a.avaliado_id === profile?.id
  )];
  const contingenciados = filteredAssignments.filter((a: any) => ["contingenciado", "contingencia"].includes(a.status));
  const aguardandoAvaliacao = filteredAssignments.filter((a: any) => ["aguardando_avaliacao", "aguardando_aprovacao"].includes(a.status));
  // NOVO: separar Finalizadas em "Em Aberto" (não foram feitas) e "Concluídas" (efetivamente concluídas/aprovadas)
  const emAberto = filteredAssignments.filter((a: any) => ["nao_executada", "reprovada"].includes(a.status)).slice(0, 50);
  const concluidas = filteredAssignments.filter((a: any) => ["concluida", "aprovada"].includes(a.status)).slice(0, 50);

  // Sub-abas Minhas/Outros — split por usuário logado OU pelo usuário em "Modo Visão" do admin
  const myId = effectiveFilterProfileId || profile?.id;
  const splitByResp = (list: any[]) => ({
    mine: list.filter((a: any) => a.responsavel_id === myId),
    others: list.filter((a: any) => a.responsavel_id !== myId),
  });
  const splitByCreator = (list: any[]) => ({
    mine: list.filter((a: any) => a.created_by === myId),
    others: list.filter((a: any) => a.created_by !== myId),
  });
  const splitByAvaliado = (list: any[]) => ({
    mine: list.filter((a: any) => a.avaliado_id === myId),
    others: list.filter((a: any) => a.avaliado_id !== myId),
  });

  const hojeSplit = splitByResp(hoje);
  const designadasSplit = splitByCreator(tarefasDesignadas);
  const devolvidasAll = [...devolvidas, ...devolvidasParaOutros];
  const devolvidasSplit = splitByResp(devolvidasAll);
  const contingenciadosSplit = splitByResp(contingenciados);
  const aguardandoSplit = splitByAvaliado(aguardandoAvaliacao);
  const emAbertoSplit = splitByResp(emAberto);
  const concluidasSplit = splitByResp(concluidas);

  // Contagem para "Tarefas Pendentes" — usa Planos de Ação (contingências).
  // Admin: total de todas; usuário comum: apenas onde é responsável.
  const cmCount = useContingencyManagement();
  const pendentesCount = useMemo(() => {
    const all = [...cmCount.abertas, ...cmCount.emTratamento, ...cmCount.vencidas, ...cmCount.validadas];
    return isAdmin ? all.length : all.filter((c: any) => c.responsavel_id === myId).length;
  }, [cmCount.abertas, cmCount.emTratamento, cmCount.vencidas, cmCount.validadas, isAdmin, myId]);

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
      (supabase as any).from("operational_execution_logs").insert({
        assignment_id: a.id,
        acao: "visualizou",
        executado_por: profile.id,
        detalhes: { viewed_at: new Date().toISOString() },
      }).then(() => {});
    }
  }, [profile?.id]);

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
            {isAdmin ? "Visualização administrativa de todas as rotinas." : "Formulários e rotinas atribuídos a você."}
          </p>
        </div>
        {isAdmin && (
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger className="w-[220px] h-9">
              <Filter className="w-3.5 h-3.5 mr-1" />
              <SelectValue placeholder="Visão de..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os executores</SelectItem>
              {profilesWithTasks.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>👁 {p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isAdmin && filterResponsavel !== "__all" && (
        <div className="mb-4 flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
          <span className="text-sm font-medium text-primary">
            👁 Modo Visão: {profilesWithTasks.find((p: any) => p.id === filterResponsavel)?.nome || "Colaborador"}
          </span>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={() => setFilterResponsavel("__all")}>
            Sair da visão
          </Button>
        </div>
      )}

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

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Pesquisar" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value || today)} className="w-[160px] h-9 text-sm" />
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => setTaskTypePickerOpen(true)}
          title="Nova Tarefa"
          aria-label="Nova Tarefa"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>



      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-3">
          <AccordionSection title="Tarefas de Hoje" count={isAdmin ? hoje.length : hojeSplit.mine.length}
            icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
            borderColor="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
            isOpen={openAccordion === "hoje"} onToggle={() => setOpenAccordion(openAccordion === "hoje" ? null : "hoje")}>
            <MineOthersTabs
              mine={hojeSplit.mine} others={hojeSplit.others} showOthers={isAdmin}
              renderItem={(a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />}
              emptyMine="Nenhuma tarefa para hoje." />
          </AccordionSection>

          {aguardandoMinhaValidacao.length > 0 && (
            <AccordionSection title="Aguardando Minha Validação" count={aguardandoMinhaValidacao.length}
              icon={<CheckCircle2 className="w-4 h-4" style={{ color: "#06b6d4" }} />}
              borderColor="#06b6d4" badgeBg="bg-cyan-500/15" badgeText="text-cyan-700 dark:text-cyan-400"
              isOpen={openAccordion === "validacao"} onToggle={() => setOpenAccordion(openAccordion === "validacao" ? null : "validacao")}>
              {aguardandoMinhaValidacao.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
            </AccordionSection>
          )}

          <AccordionSection title="Tarefas Designadas" count={isAdmin ? tarefasDesignadas.length : designadasSplit.mine.length}
            icon={<ListTodo className="w-4 h-4" style={{ color: "#eab308" }} />}
            borderColor="#eab308" badgeBg="bg-yellow-500/15" badgeText="text-yellow-700 dark:text-yellow-400"
            isOpen={openAccordion === "designadas"} onToggle={() => setOpenAccordion(openAccordion === "designadas" ? null : "designadas")}>
            <MineOthersTabs
              mine={designadasSplit.mine} others={designadasSplit.others} showOthers={isAdmin}
              renderItem={(a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />}
              emptyMine="Você não designou tarefas para outros." />
          </AccordionSection>

          <AccordionSection title="Devolvidas" count={isAdmin ? devolvidasAll.length : devolvidasSplit.mine.length}
            icon={<RotateCcw className="w-4 h-4" style={{ color: "#ef4444" }} />}
            borderColor="#ef4444" badgeBg="bg-red-500/15" badgeText="text-red-700 dark:text-red-400"
            isOpen={openAccordion === "devolvidas"} onToggle={() => setOpenAccordion(openAccordion === "devolvidas" ? null : "devolvidas")}>
            <MineOthersTabs
              mine={devolvidasSplit.mine} others={devolvidasSplit.others} showOthers={isAdmin}
              renderItem={(a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />}
              emptyMine="Nenhuma rotina devolvida." />
          </AccordionSection>

          <AccordionSection title="Plano de Ação" count={pendentesCount}
            icon={<AlertTriangle className="w-4 h-4" style={{ color: "#f97316" }} />}
            borderColor="#f97316" badgeBg="bg-orange-500/15" badgeText="text-orange-700 dark:text-orange-400"
            isOpen={openAccordion === "contingenciados"} onToggle={() => setOpenAccordion(openAccordion === "contingenciados" ? null : "contingenciados")}>
            <MinhasTarefasPendentesPanel viewAsProfileId={isAdmin && filterResponsavel !== "__all" ? filterResponsavel : null} />
          </AccordionSection>

          <AccordionSection title="Aprovação Final" count={isAdmin ? aguardandoAvaliacao.length : aguardandoSplit.mine.length}
            icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
            borderColor="#8b5cf6" badgeBg="bg-violet-500/15" badgeText="text-violet-700 dark:text-violet-400"
            isOpen={openAccordion === "aguardando"} onToggle={() => setOpenAccordion(openAccordion === "aguardando" ? null : "aguardando")}>
            <AguardandoAvaliacaoPanel viewAsProfileId={isAdmin && filterResponsavel !== "__all" ? filterResponsavel : null} />
          </AccordionSection>

          <AccordionSection title="Em Aberto" count={isAdmin ? emAberto.length : emAbertoSplit.mine.length}
            icon={<AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />}
            borderColor="#f59e0b" badgeBg="bg-amber-500/15" badgeText="text-amber-700 dark:text-amber-400"
            isOpen={openAccordion === "em_aberto"} onToggle={() => setOpenAccordion(openAccordion === "em_aberto" ? null : "em_aberto")}>
            <MineOthersTabs
              mine={emAbertoSplit.mine} others={emAbertoSplit.others} showOthers={isAdmin}
              renderItem={(a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />}
              emptyMine="Nenhuma rotina em aberto." />
          </AccordionSection>

          <AccordionSection title="Concluídas" count={isAdmin ? concluidas.length : concluidasSplit.mine.length}
            icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
            borderColor="#22c55e" badgeBg="bg-green-500/15" badgeText="text-green-700 dark:text-green-400"
            isOpen={openAccordion === "finalizadas"} onToggle={() => setOpenAccordion(openAccordion === "finalizadas" ? null : "finalizadas")}>
            <MineOthersTabs
              mine={concluidasSplit.mine} others={concluidasSplit.others} showOthers={isAdmin}
              renderItem={(a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />}
              emptyMine="Nenhuma rotina concluída." />
          </AccordionSection>
        </div>
      )}
        </TabsContent>

        <TabsContent value="avaliadas" className="mt-0">
          <MinhasTarefasTab viewAsProfileId={isAdmin ? filterResponsavel : null} />
        </TabsContent>
      </Tabs>

      {/* Execution Dialog */}
      <Dialog open={execDialogOpen} onOpenChange={v => { if (!v) closeExecution(); }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          <VisuallyHidden><DialogTitle>{snapshot?.nome || "Rotina"}</DialogTitle></VisuallyHidden>
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

            {!isEditable && selectedAssignment && (
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
        </DialogContent>
      </Dialog>

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
