// build: 2026-05-21 — drawer oficial via src/modules/tarefas/fluxo
import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Play, Send, ChevronLeft, CheckCircle2, AlertTriangle, ChevronDown, Search, Clock, RotateCcw, CheckCheck, CalendarClock, ListTodo, Hourglass, Filter, History, Plus, Users, Activity, ArrowDownUp, Eye } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmbeddedContingencyPanel } from "@/modules/tarefas/components/tarefas_embeddedContingencyPanel";
// Painéis oficiais do fluxo executor/aprovador/auditor:
import { FluxoExecutorPanel } from "@/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel";
import { FluxoAprovadorPanel } from "@/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel";
import { FluxoAuditorPanel } from "@/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { AssignmentCard } from "@/modules/tarefas/components/tarefas_tarefaCard";
import type { SnapshotField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MinhasTarefasTab from "@/modules/tarefas/components/tarefas_minhasTarefasTab";
import QuickTaskDialog from "@/modules/tarefas/components/tarefas_quickCreateDialog";
// (Removido) TaskTypeSelectorDialog — builder único, sem seletor prévio.
type TaskType = "simples" | "inspecao";
import { ListChecks, Trophy } from "lucide-react";
import { bucketize, sortAssignments, type SortKey } from "@/modules/tarefas/services/tarefas_bucketize";

const normalizeTextKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const getCheckItemKeys = (item: any) => [
  item?.field_id,
  item?.pergunta_origem_id,
  normalizeTextKey(item?.field_label),
  normalizeTextKey(item?.pergunta_padrao),
].filter(Boolean) as string[];

const applyChecklistConfigToFields = (fields: SnapshotField[], snapshot: any, type: "aprovador" | "auditor") => {
  const list = snapshot?.ada_config_snapshot?.checklists?.[type === "aprovador" ? "aprovador" : "validador"];
  if (!Array.isArray(list) || list.length === 0) return fields;
  const byKey = new Map<string, any>();
  for (const item of list) {
    if (item?.ativo === false) continue;
    for (const key of getCheckItemKeys(item)) byKey.set(key, item);
  }
  return fields.map((field: any) => {
    const item = byKey.get(field.id) || byKey.get(normalizeTextKey(field.label));
    if (!item) return field;
    const prefix = type === "aprovador" ? "aprovador" : "auditor";
    return {
      ...field,
      [`${prefix}_verificar`]: true,
      [`${prefix}_pergunta`]: item.pergunta_padrao || field[`${prefix}_pergunta`] || field.label,
      [`${prefix}_tipo`]: item.tipo || item.tipo_resposta || field[`${prefix}_tipo`],
      [`${prefix}_opcoes`]: Array.isArray(item.opcoes) ? item.opcoes : field[`${prefix}_opcoes`],
      [`${prefix}_regras_por_opcao`]: Array.isArray(item.regras_por_opcao) ? item.regras_por_opcao : field[`${prefix}_regras_por_opcao`],
      [`${prefix}_peso`]: item.peso ?? field[`${prefix}_peso`],
    };
  });
};

// === Accordion vertical (layout antigo) ===
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

function listOrEmpty(list: any[], openExecution: (a: any) => void, emptyMsg: string) {
  if (list.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">{emptyMsg}</p>;
  return (
    <div className="space-y-2">
      {list.map((a) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
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

export default function TarefasExecucaoPage() {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { transition: centralTransition } = useOperationalTransition();
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [execDialogOpen, setExecDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"registro" | "aprovacao" | "auditor">("registro");
  const [filterResponsavel, setFilterResponsavel] = useState<string>(profile?.id || "__all");
  const [searchTerm, setSearchTerm] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState<string>(today);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [pickedTaskType] = useState<TaskType>("inspecao");
  const [pickedSetorId] = useState<string>("");
  const isMobile = useIsMobile();
  // Accordion vertical aberto (5 grupos fixos)
  type OpGroup = "hoje" | "emAndamento" | "criticas" | "aguardandoAprovacao" | "aguardandoAuditoria" | "concluidas" | "todas";
  const [openGroup, setOpenGroup] = useState<OpGroup | null>("hoje");
  // Ordenação única
  const [sortKey, setSortKey] = useState<SortKey>("sla");
  // Filtros admin
  const [adminSetor, setAdminSetor] = useState<string>("__all");
  const [adminExecutor, setAdminExecutor] = useState<string>("__all");

  // Compat com wrappers de rotas legadas: ?chip= → mapeia para grupo aberto
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const chipParam = searchParams.get("chip");
    if (!chipParam) return;
    const chipToGroup: Record<string, OpGroup> = {
      todas: "todas",
      executar: "hoje",
      avaliar: "aguardandoAprovacao",
      aprovar: "aguardandoAprovacao",
      auditar: "aguardandoAuditoria",
      plano_acao: "criticas",
      contingencias: "criticas",
      atrasadas: "criticas",
      concluidas: "concluidas",
    };
    const target = chipToGroup[chipParam];
    if (target) setOpenGroup(target);
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

  // Setores do usuário — sempre carregados (necessário para visibilidade de tarefas setorizadas)
  const { getScope } = usePermissions(profile?.id ?? null);
  const hasSetorScope = getScope("executar_tarefa") === "team";
  const { data: meusSetorIds = [] } = useQuery<string[]>({
    queryKey: ["my_setor_ids", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await (supabase as any)
        .from("colaborador_setores")
        .select("setor_id")
        .eq("profile_id", profile.id);
      return (data || []).map((r: any) => r.setor_id);
    },
    enabled: !!profile?.id,
    staleTime: 300000,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["operational_my_assignments", profile?.id, isAdmin, meusSetorIds],
    queryFn: async () => {
      if (!profile?.id) return [];
      let q = (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao, origem, ada_config_snapshot, destino_score), profiles:responsavel_id(id, nome, foto_url), profiles_aval:avaliado_id(id, nome), criador:created_by(id, nome), aprovador:profiles!operational_assignments_aprovador_id_fkey(nome), setor_executor:setores!operational_assignments_setor_executor_id_fkey(id, nome), setor_avaliado:setores!operational_assignments_setor_avaliado_id_fkey(id, nome)")
        .order("data_prevista", { ascending: true });
      if (!isAdmin) {
        const orParts: string[] = [
          `responsavel_id.eq.${profile.id}`,
          `aprovador_id.eq.${profile.id}`,
          `avaliado_id.eq.${profile.id}`,
          `auditor_id.eq.${profile.id}`,
          `validador_contingencia_id.eq.${profile.id}`,
          `created_by.eq.${profile.id}`,
        ];
        if (meusSetorIds.length > 0) {
          const setorList = `(${meusSetorIds.join(",")})`;
          orParts.push(
            `and(responsavel_id.is.null,setor_executor_id.in.${setorList})`,
            `and(avaliado_id.is.null,setor_avaliado_id.in.${setorList})`,
            `and(aprovador_id.is.null,setor_aprovador_id.in.${setorList})`,
            `and(auditor_id.is.null,setor_auditor_id.in.${setorList})`,
          );
        }
        q = q.or(orParts.join(","));
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      const ids = (data || []).map((a: any) => a.id);
      if (ids.length === 0) return data;
      // Anexa contagens de respostas para o cálculo da barra de "Etapa".
      const [{ data: fa }, { data: ap }] = await Promise.all([
        (supabase as any).from("operational_field_answers").select("assignment_id, field_id").in("assignment_id", ids),
        (supabase as any).from("operational_approval_answers").select("assignment_id, field_id").in("assignment_id", ids),
      ]);
      const faMap = new Map<string, Set<string>>();
      (fa || []).forEach((r: any) => {
        if (!faMap.has(r.assignment_id)) faMap.set(r.assignment_id, new Set());
        faMap.get(r.assignment_id)!.add(r.field_id);
      });
      const apMap = new Map<string, Set<string>>();
      (ap || []).forEach((r: any) => {
        if (!apMap.has(r.assignment_id)) apMap.set(r.assignment_id, new Set());
        apMap.get(r.assignment_id)!.add(r.field_id);
      });
      return (data || []).map((a: any) => ({
        ...a,
        field_answer_count: faMap.get(a.id)?.size ?? 0,
        approver_answer_count: apMap.get(a.id)?.size ?? 0,
      }));
    },
    enabled: !!profile?.id,
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
    for (const a of assignments as any[]) {
      // Setor executor
      if (a.setor_executor_id && a.setor_executor?.nome)
        map.set(a.setor_executor_id, a.setor_executor.nome);
      else if (a.setor_executor_id)
        map.set(a.setor_executor_id, a.setor_executor_id);
      // Setor avaliado
      if (a.setor_avaliado_id && a.setor_avaliado?.nome)
        map.set(a.setor_avaliado_id, a.setor_avaliado.nome);
    }
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [assignments]);

  // === Filtragem base (busca + admin filtros) ===
  const filteredAssignments = useMemo(() => {
    let list = assignments as any[];
    const setorSet = new Set(meusSetorIds);
    const matchesSetor = (a: any) =>
      (a.responsavel_id == null && a.setor_executor_id && setorSet.has(a.setor_executor_id)) ||
      (a.avaliado_id == null && a.setor_avaliado_id && setorSet.has(a.setor_avaliado_id)) ||
      (a.aprovador_id == null && a.setor_aprovador_id && setorSet.has(a.setor_aprovador_id)) ||
      (a.auditor_id == null && a.setor_auditor_id && setorSet.has(a.setor_auditor_id));
    if (isAdmin && adminExecutor !== "__all") {
      // "Executor" no painel admin = "tarefas onde este usuário ATUA em qualquer papel"
      // (executor, avaliado, aprovador, auditor, criador). Antes filtrava só responsavel_id,
      // o que escondia tarefas onde o usuário era aprovador/auditor (inclusive via setor).
      list = list.filter((a) =>
        a.responsavel_id === adminExecutor ||
        a.avaliado_id === adminExecutor ||
        a.aprovador_id === adminExecutor ||
        a.auditor_id === adminExecutor ||
        a.created_by === adminExecutor ||
        // Filtro de setor só faz sentido para o usuário logado (temos os setores dele).
        (adminExecutor === profile?.id && matchesSetor(a))
      );
    } else if (isAdmin && filterResponsavel !== "__all") {
      list = list.filter((a) =>
        a.responsavel_id === filterResponsavel ||
        a.avaliado_id === filterResponsavel ||
        a.aprovador_id === filterResponsavel ||
        a.auditor_id === filterResponsavel ||
        a.created_by === filterResponsavel ||
        a.created_by === profile?.id ||
        matchesSetor(a)
      );
    }
    if (isAdmin && adminSetor !== "__all") {
      list = list.filter((a) =>
        a.setor_executor_id === adminSetor ||
        a.setor_avaliado_id === adminSetor ||
        a.setor_aprovador_id === adminSetor ||
        a.setor_auditor_id === adminSetor
      );
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((a) => (a.template_snapshot?.nome || a.operational_templates?.nome || "").toLowerCase().includes(term));
    }
    return list;
  }, [assignments, isAdmin, filterResponsavel, adminExecutor, adminSetor, searchTerm, profile?.id, meusSetorIds]);

  // === BUCKETIZE — núcleo único ===
  const buckets = useMemo(
    () => bucketize(filteredAssignments, { profileId: effectiveFilterProfileId, isAdmin }, meusSetorIds),
    [filteredAssignments, effectiveFilterProfileId, isAdmin, meusSetorIds]
  );

  // Helper de ordenação
  const sorted = useCallback((list: any[]) => sortAssignments(list, sortKey), [sortKey]);

  // Listas das 5 abas operacionais (vindas direto do bucketize)
  const opLists = useMemo(() => ({
    hoje: sorted(buckets.opHoje),
    emAndamento: sorted(buckets.opEmAndamento),
    aguardandoAprovacao: sorted(buckets.opAguardandoAprovacao),
    aguardandoAuditoria: sorted(buckets.opAguardandoAuditoria),
    concluidas: sorted(buckets.opConcluidas).slice(0, 100),
    todas: sorted(buckets.opTodas),
    // Críticas: sempre ordenadas pelo menor tempo restante (mais urgente primeiro).
    criticas: sortAssignments(buckets.opCriticas, "sla"),
  }), [buckets, sorted]);

  const openExecution = useCallback((a: any) => {
    setSelectedAssignment(a);
    setExecDialogOpen(true);

    if (profile?.id) {
      const papelUsado =
        a.responsavel_id === profile.id ? "executor"
        : a.aprovador_id === profile.id || a.avaliador_id === profile.id ? "aprovador"
        : a.auditor_id === profile.id ? "auditor"
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
    setExecDialogOpen(false);
    setSelectedAssignment(null);
    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
    qc.invalidateQueries({ queryKey: ["operational_execution_logs"] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_assignment"] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_respostas_originais"] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_aprovador"] });
    qc.invalidateQueries({ queryKey: ["tarefas_fluxo_planos_auditor"] });
  };

  const isOwner = !!selectedAssignment && (
    selectedAssignment.responsavel_id === profile?.id ||
    (
      selectedAssignment.responsavel_id == null &&
      !!selectedAssignment.setor_executor_id &&
      meusSetorIds.includes(selectedAssignment.setor_executor_id)
    )
  );
  const isAvaliado = selectedAssignment?.avaliado_id === profile?.id;
  const temAuditorConfigurado = !!(selectedAssignment?.auditor_id || selectedAssignment?.setor_auditor_id);
  const isExecutorView = !!selectedAssignment && (isOwner || isAdmin);
  const isAprovadorView = !!selectedAssignment && (
    selectedAssignment.aprovador_id === profile?.id ||
    selectedAssignment.avaliador_id === profile?.id ||
    (selectedAssignment.aprovador_id === null && selectedAssignment.created_by === profile?.id) ||
    isAdmin
  );
  const isAuditorView = !!selectedAssignment && temAuditorConfigurado && (
    selectedAssignment.auditor_id === profile?.id ||
    (
      selectedAssignment.auditor_id === null &&
      !!selectedAssignment.setor_auditor_id &&
      meusSetorIds.includes(selectedAssignment.setor_auditor_id)
    ) ||
    isAdmin
  );
  const isAvaliadorHistorico = !!selectedAssignment && (
    selectedAssignment.aprovador_id === profile?.id ||
    selectedAssignment.avaliador_id === profile?.id ||
    isAdmin
  ) && ["aguardando_avaliacao", "em_avaliacao"].includes(selectedAssignment.status);
  const isContingenciado = selectedAssignment && ["contingenciado", "contingencia"].includes(selectedAssignment.status);
  const showContingencyPanel = isContingenciado && selectedAssignment && (
    isAdmin || isOwner || isAvaliado ||
    selectedAssignment.validador_contingencia_id === profile?.id ||
    selectedAssignment.aprovador_id === profile?.id
  );
  const isCriadorValidando = !!selectedAssignment
    && selectedAssignment.status === "aguardando_validacao"
    && selectedAssignment.created_by === profile?.id;

  const fluxoDrawerRole: "executor" | "aprovador" | "auditor" | "readonly" =
    selectedAssignment?.status === "aguardando_auditoria" && isAuditorView ? "auditor"
    : selectedAssignment?.status === "aguardando_aprovacao" && isAprovadorView ? "aprovador"
    : isExecutorView ? "executor"
    : isAuditorView ? "auditor"
    : isAprovadorView ? "aprovador"
    : isAvaliadorHistorico ? "readonly"
    : "readonly";

  const handleAprovarRecebimento = async () => {
    if (!selectedAssignment) return;
    try {
      await centralTransition.mutateAsync({
        assignmentId: selectedAssignment.id,
        action: "validar_designada_aprovar",
        origem: "execucao_validacao",
      });
      toast.success("Recebimento aprovado. Tarefa concluida.");
      closeExecution();
    } catch (e: any) {
      toast.error("Erro ao aprovar: " + e.message);
    }
  };

  const handleDevolverDesignada = async () => {
    if (!selectedAssignment) return;
    const motivo = window.prompt("Justifique a devolucao desta tarefa:");
    if (!motivo?.trim()) { toast.error("Justificativa obrigatoria."); return; }
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

      {/* Filtros (busca, data, ordenação, criar) */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Pesquisar" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value || today)} className="w-full sm:w-[140px] h-9 text-sm" />
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[150px] h-9 text-sm">
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
        <Button type="button" size="icon" className="h-9 w-full sm:w-9 shrink-0" onClick={() => setQuickTaskOpen(true)} title="Nova Tarefa">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {isAdmin && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 flex-wrap p-2 rounded-lg bg-muted/40 border border-border">
          {/* Setor primeiro — filtra os executores abaixo */}
          <Select value={adminSetor} onValueChange={v => { setAdminSetor(v); setAdminExecutor("__all"); }}>
            <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
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

          {/* Executores — filtrados pelo setor selecionado */}
          <Select value={adminExecutor} onValueChange={setAdminExecutor}>
            <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
              <Users className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Executor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">
                {adminSetor !== "__all" ? "Todos do setor" : "Todos os executores"}
              </SelectItem>
              {profilesWithTasks
                .filter((p: any) => {
                  if (adminSetor === "__all") return true;
                  return (assignments as any[]).some(a =>
                    (a.responsavel_id === p.id || a.avaliado_id === p.id) &&
                    (a.setor_executor_id === adminSetor || a.setor_avaliado_id === adminSetor)
                  );
                })
                .map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))
              }
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
          <AccordionSection
            title="Tarefas de Hoje"
            count={opLists.hoje.length}
            icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
            borderColor="#f97316"
            badgeBg="bg-orange-500/15"
            badgeText="text-orange-700 dark:text-orange-400"
            isOpen={openGroup === "hoje"}
            onToggle={() => setOpenGroup(openGroup === "hoje" ? null : "hoje")}
          >
            {listOrEmpty(opLists.hoje, openExecution, "Nenhuma tarefa para hoje.")}
          </AccordionSection>

          <AccordionSection
            title="Em Andamento"
            count={opLists.emAndamento.length}
            icon={<Play className="w-4 h-4" style={{ color: "#3b82f6" }} />}
            borderColor="#3b82f6"
            badgeBg="bg-blue-500/15"
            badgeText="text-blue-700 dark:text-blue-400"
            isOpen={openGroup === "emAndamento"}
            onToggle={() => setOpenGroup(openGroup === "emAndamento" ? null : "emAndamento")}
          >
            {listOrEmpty(opLists.emAndamento, openExecution, "Nenhuma tarefa em andamento.")}
          </AccordionSection>

          <AccordionSection
            title="Crítico"
            count={opLists.criticas.length}
            icon={<AlertTriangle className="w-4 h-4" style={{ color: "#dc2626" }} />}
            borderColor="#dc2626"
            badgeBg="bg-red-600/15"
            badgeText="text-red-800 dark:text-red-300"
            isOpen={openGroup === "criticas"}
            onToggle={() => setOpenGroup(openGroup === "criticas" ? null : "criticas")}
          >
            {listOrEmpty(opLists.criticas, openExecution, "Nada em estado crítico.")}
          </AccordionSection>

          <AccordionSection
            title="Aguardando Aprovação"
            count={opLists.aguardandoAprovacao.length}
            icon={<Hourglass className="w-4 h-4" style={{ color: "#8b5cf6" }} />}
            borderColor="#8b5cf6"
            badgeBg="bg-violet-500/15"
            badgeText="text-violet-700 dark:text-violet-400"
            isOpen={openGroup === "aguardandoAprovacao"}
            onToggle={() => setOpenGroup(openGroup === "aguardandoAprovacao" ? null : "aguardandoAprovacao")}
          >
            {listOrEmpty(opLists.aguardandoAprovacao, openExecution, "Nada aguardando aprovação.")}
          </AccordionSection>

          <AccordionSection
            title="Aguardando Auditoria"
            count={opLists.aguardandoAuditoria.length}
            icon={<Eye className="w-4 h-4" style={{ color: "#0ea5e9" }} />}
            borderColor="#0ea5e9"
            badgeBg="bg-sky-500/15"
            badgeText="text-sky-700 dark:text-sky-400"
            isOpen={openGroup === "aguardandoAuditoria"}
            onToggle={() => setOpenGroup(openGroup === "aguardandoAuditoria" ? null : "aguardandoAuditoria")}
          >
            {listOrEmpty(opLists.aguardandoAuditoria, openExecution, "Nada aguardando auditoria.")}
          </AccordionSection>

          <AccordionSection
            title="Concluídas"
            count={opLists.concluidas.length}
            icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
            borderColor="#22c55e"
            badgeBg="bg-green-500/15"
            badgeText="text-green-700 dark:text-green-400"
            isOpen={openGroup === "concluidas"}
            onToggle={() => setOpenGroup(openGroup === "concluidas" ? null : "concluidas")}
          >
            {listOrEmpty(opLists.concluidas, openExecution, "Nenhuma tarefa concluída.")}
          </AccordionSection>

          <AccordionSection
            title="Todas"
            count={opLists.todas.length}
            icon={<ListTodo className="w-4 h-4" style={{ color: "#64748b" }} />}
            borderColor="#64748b"
            badgeBg="bg-slate-500/15"
            badgeText="text-slate-700 dark:text-slate-400"
            isOpen={openGroup === "todas"}
            onToggle={() => setOpenGroup(openGroup === "todas" ? null : "todas")}
          >
            {listOrEmpty(opLists.todas, openExecution, "Nenhuma tarefa visível para você.")}
          </AccordionSection>
        </div>
      )}
        </TabsContent>

        <TabsContent value="avaliadas" className="mt-0">
          <MinhasTarefasTab viewAsProfileId={isAdmin ? filterResponsavel : null} />
        </TabsContent>
      </Tabs>

      {/* Execution Dialog */}
      <Sheet key={selectedAssignment?.id ?? "none"} open={execDialogOpen} onOpenChange={v => { if (!v) closeExecution(); }}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "p-0 flex flex-col gap-0 border-l",
            isMobile
              ? "h-[100dvh] w-full max-w-full inset-0 rounded-none"
              : "h-full w-full sm:max-w-2xl"
          )}
        >
          <VisuallyHidden>
            <SheetTitle>{selectedAssignment?.template_snapshot?.nome || selectedAssignment?.operational_templates?.nome || "Tarefa"}</SheetTitle>
          </VisuallyHidden>

          <div className="p-3 sm:p-4 border-b border-border max-w-full overflow-hidden">
            <div className="flex items-start gap-2 min-w-0">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={closeExecution}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm sm:text-base font-semibold text-foreground flex flex-wrap items-center gap-2 min-w-0 break-words whitespace-normal leading-snug">
                  {selectedAssignment?.numero_tarefa && (
                    <span className="text-[11px] font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                      #{String(selectedAssignment.numero_tarefa).padStart(4, "0")}
                    </span>
                  )}
                  {selectedAssignment?.template_snapshot?.nome || selectedAssignment?.operational_templates?.nome || "Tarefa"}
                </h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-1">
                  {selectedAssignment?.data_prevista && <span>{selectedAssignment.data_prevista}</span>}
                  {selectedAssignment?.horario_limite && (
                    <span className="flex items-center gap-1 font-medium text-foreground whitespace-nowrap">
                      <Clock className="w-3 h-3" /> ate {selectedAssignment.horario_limite}
                    </span>
                  )}
                  {selectedAssignment?.status && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-normal break-words ${STATUS_CONFIG[selectedAssignment.status]?.class || ""}`}>
                      {STATUS_CONFIG[selectedAssignment.status]?.label || selectedAssignment.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 max-w-full">
            {showContingencyPanel && selectedAssignment && (
              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <EmbeddedContingencyPanel assignmentId={selectedAssignment.id} />
              </div>
            )}

            {selectedAssignment && !showContingencyPanel && fluxoDrawerRole === "executor" && (
              <FluxoExecutorPanel assignmentId={selectedAssignment.id} />
            )}

            {selectedAssignment && !showContingencyPanel && fluxoDrawerRole === "aprovador" && (
              <FluxoAprovadorPanel assignmentId={selectedAssignment.id} />
            )}

            {selectedAssignment && !showContingencyPanel && fluxoDrawerRole === "auditor" && (
              <FluxoAuditorPanel assignmentId={selectedAssignment.id} />
            )}

            {selectedAssignment && !showContingencyPanel && fluxoDrawerRole === "readonly" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                Sem acao disponivel para seu papel nesta tarefa.
              </div>
            )}
          </div>

          {isCriadorValidando && (
            <div className="border-t border-border p-3 flex flex-col sm:flex-row sm:items-center gap-2 bg-card safe-area-bottom">
              <div className="w-full sm:flex-1 text-xs text-muted-foreground break-words">
                Esta tarefa foi designada por voce e esta aguardando sua validacao de recebimento.
              </div>
              <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={handleDevolverDesignada} disabled={centralTransition.isPending}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Devolver
              </Button>
              <Button type="button" size="sm" className="w-full sm:w-auto" onClick={handleAprovarRecebimento} disabled={centralTransition.isPending}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar Recebimento
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* (Removido) TaskTypeSelectorDialog — botão "+" abre o builder direto. */}

      <QuickTaskDialog
        open={quickTaskOpen}
        onOpenChange={setQuickTaskOpen}
        defaultAvaliadoId={effectiveFilterProfileId}
        defaultResponsavelId={profile?.id}
        taskType={pickedTaskType}
        initialSetorId={pickedSetorId}
        origemContexto="avulsa"
      />
    </div>
  );
}
