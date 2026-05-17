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
import { EmbeddedReviewPanel, EmbeddedApprovalPanel, EmbeddedAuditPanel } from "@/modules/tarefas/components/tarefas_embeddedActionPanels";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { AssignmentCard } from "@/modules/tarefas/components/tarefas_tarefaCard";
import { DynamicFieldRenderer, SnapshotField, evaluateVisibility } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { parseAnexoFromDescricao } from "@/modules/tarefas/components/tarefas_tabFormBuilder";
import { useAssignmentExecution } from "@/modules/tarefas/hooks/tarefas_useAssignmentExecution";
import { useOperationalTransition } from "@/modules/tarefas/hooks/tarefas_useTransition";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MinhasTarefasTab from "@/modules/tarefas/components/tarefas_minhasTarefasTab";
import QuickTaskDialog from "@/modules/tarefas/components/tarefas_quickCreateDialog";
// (Removido) TaskTypeSelectorDialog — builder único, sem seletor prévio.
type TaskType = "simples" | "inspecao";
import { ListChecks, Trophy } from "lucide-react";
import { bucketize, sortAssignments, type SortKey } from "@/modules/tarefas/services/tarefas_bucketize";
import { PainelRetornoCard } from "@/modules/tarefas/components/tarefas_painelRetornoCard";
import { DrawerActionRouter } from "@/modules/tarefas/components/painels/tarefas_drawerActionRouter";

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

export default function OperationalExecucaoPage() {
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

  const exec = useAssignmentExecution(selectedAssignment?.id || null);

  // Em tarefas EM ANDAMENTO, sobrepõe ada_config_snapshot vivo do template
  // (inclui checklists.aprovador com replicadas/manual/pacote padrão atualizados).
  // Em tarefas FINAIS, mantém snapshot congelado para histórico imutável.
  // FKs de respostas (operational_field_answers) seguem alinhadas porque a
  // estrutura de fields/sections continua vindo de template_snapshot — o overlay
  // afeta apenas regras (opcoes/regras) e o checklist do Aprovador.
  const snapshot = useMemo(() => {
    const base = selectedAssignment?.template_snapshot;
    const liveAda = selectedAssignment?.operational_templates?.ada_config_snapshot;
    if (!base) return base;
    const status = selectedAssignment?.status;
    const isLive = !!status && !["concluida", "aprovada", "auditada", "cancelada", "arquivada"].includes(status);
    if (isLive && liveAda) {
      return { ...base, ada_config_snapshot: liveAda };
    }
    if (!base.ada_config_snapshot && liveAda) {
      return { ...base, ada_config_snapshot: liveAda };
    }
    return base;
  }, [selectedAssignment?.template_snapshot, selectedAssignment?.operational_templates?.ada_config_snapshot, selectedAssignment?.status]);

  // Deduplicate sections and fields by id
  const snapshotSections: any[] = useMemo(() => {
    const raw = snapshot?.sections || [];
    const seen = new Set<string>();
    return raw.filter((s: any) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a: any, b: any) => a.ordem - b.ordem);
  }, [snapshot]);

  // Buscar regras vivas do template para sobrepor às regras congeladas no snapshot.
  // Garante que edições posteriores no template (opcoes_regras, gera_contingencia,
  // exige_evidencia, criticidade, obrigatorio, etc.) reflitam imediatamente em
  // tarefas em andamento. Estrutura (label/ordem/section) permanece do snapshot.
  const isAssignmentLive = useMemo(() => {
    const st = selectedAssignment?.status;
    return !!st && !["concluida", "aprovada", "auditada", "cancelada", "arquivada"].includes(st);
  }, [selectedAssignment?.status]);

  const { data: liveTemplateFields } = useQuery({
    queryKey: ["live_template_fields_overlay", selectedAssignment?.template_id],
    enabled: !!selectedAssignment?.template_id && isAssignmentLive,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_template_fields")
        .select("id, label, ordem, section_id, opcoes, opcoes_regras, obrigatorio, exige_evidencia, tipo_evidencia, gera_contingencia, criticidade, validacao, condicao_visibilidade, aprovador_verificar, aprovador_pergunta, aprovador_tipo_resposta, aprovador_peso, aprovador_obriga_observacao_nao, aprovador_exige_evidencia_nao, aprovador_tipos_evidencia, auditor_verificar")
        .eq("template_id", selectedAssignment.template_id);
      if (error) throw error;
      return data || [];
    },
  });

  const liveFieldOverlayMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (!liveTemplateFields) return map;
    // Index por id; por section_id|label; e por label puro.
    // Sempre prefere a versão que tenha opcoes_regras preenchidas (templates podem
    // ter entradas duplicadas/legadas com regras vazias, ou o snapshot pode ter sido
    // gerado de uma versão anterior do template com IDs/sections diferentes).
    const better = (a: any, b: any) => {
      const aHas = a && Array.isArray(a.opcoes_regras) && a.opcoes_regras.length > 0;
      const bHas = b && Array.isArray(b.opcoes_regras) && b.opcoes_regras.length > 0;
      if (aHas && !bHas) return a;
      if (bHas && !aHas) return b;
      return a || b;
    };
    for (const lf of liveTemplateFields as any[]) {
      map[lf.id] = better(map[lf.id], lf);
      const sectionKey = `${lf.section_id || ""}|${(lf.label || "").trim().toLowerCase()}`;
      map[sectionKey] = better(map[sectionKey], lf);
      const labelKey = `__label__|${(lf.label || "").trim().toLowerCase()}`;
      map[labelKey] = better(map[labelKey], lf);
    }
    return map;
  }, [liveTemplateFields]);

  const snapshotFields: SnapshotField[] = useMemo(() => {
    const raw = snapshot?.fields || [];
    const seen = new Set<string>();
    // Helpers: ?? mantém [] vazio do live; queremos cair para snapshot quando live estiver vazio.
    const pickArr = (live: any, snap: any) => (Array.isArray(live) && live.length > 0 ? live : (snap ?? live));
    const pick = (live: any, snap: any) => (live === null || live === undefined ? snap : live);
    const result = raw.filter((f: any) => { if (seen.has(f.id)) return false; seen.add(f.id); return true; })
      .sort((a: any, b: any) => a.ordem - b.ordem)
      .map((f: any) => {
        if (!isAssignmentLive) return f;
        const sectionKey = `${f.section_id || ""}|${(f.label || "").trim().toLowerCase()}`;
        const labelKey = `__label__|${(f.label || "").trim().toLowerCase()}`;
        const byId = liveFieldOverlayMap[f.id];
        const bySection = liveFieldOverlayMap[sectionKey];
        const byLabel = liveFieldOverlayMap[labelKey];
        // Prefere a entrada que trouxer regras preenchidas, em qualquer chave.
        const has = (x: any) => x && Array.isArray(x.opcoes_regras) && x.opcoes_regras.length > 0;
        const live = has(byId) ? byId : has(bySection) ? bySection : has(byLabel) ? byLabel : (byId || bySection || byLabel);
        if (!live) return f;
        return {
          ...f,
          // Quando o snapshot antigo só casa por label/section, o ID antigo pode
          // não existir mais em operational_template_fields. Persistir pelo ID
          // vivo evita FK 23503 no autosave sem trocar a organização do snapshot.
          id: live.id || f.id,
          section_id: f.section_id,
          opcoes: pickArr(live.opcoes, f.opcoes),
          opcoes_regras: pickArr(live.opcoes_regras, f.opcoes_regras),
          obrigatorio: pick(live.obrigatorio, f.obrigatorio),
          exige_evidencia: pick(live.exige_evidencia, f.exige_evidencia),
          tipo_evidencia: pick(live.tipo_evidencia, f.tipo_evidencia),
          gera_contingencia: pick(live.gera_contingencia, f.gera_contingencia),
          criticidade: pick(live.criticidade, f.criticidade),
          validacao: pick(live.validacao, f.validacao),
          condicao_visibilidade: pick(live.condicao_visibilidade, f.condicao_visibilidade),
          aprovador_verificar: pick(live.aprovador_verificar, f.aprovador_verificar),
          aprovador_pergunta: pick(live.aprovador_pergunta, f.aprovador_pergunta),
          aprovador_tipo_resposta: pick(live.aprovador_tipo_resposta, f.aprovador_tipo_resposta),
          aprovador_peso: pick(live.aprovador_peso, f.aprovador_peso),
          aprovador_obriga_observacao_nao: pick(live.aprovador_obriga_observacao_nao, f.aprovador_obriga_observacao_nao),
          aprovador_exige_evidencia_nao: pick(live.aprovador_exige_evidencia_nao, f.aprovador_exige_evidencia_nao),
          aprovador_tipos_evidencia: pickArr(live.aprovador_tipos_evidencia, f.aprovador_tipos_evidencia),
          auditor_verificar: pick(live.auditor_verificar, f.auditor_verificar),
        };
      });
    const withChecklistRules = applyChecklistConfigToFields(
      applyChecklistConfigToFields(result, snapshot, "aprovador"),
      snapshot,
      "auditor",
    );
    if (withChecklistRules.length > 0) exec.setFieldLabels(withChecklistRules);
    return withChecklistRules;
  }, [snapshot, liveFieldOverlayMap, isAssignmentLive]);

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
    // Anti-contaminação: troca o assignment diretamente.
    // O key={selectedAssignment?.id} no Sheet garante unmount/remount completo ao trocar de tarefa,
    // zerando todos os estados internos (answers, logs, reviews) sem depender de setTimeout.
    // Invalida cache das queries da tarefa anterior para evitar dados fantasma.
    qc.removeQueries({ queryKey: ["operational_field_answers"] });
    qc.removeQueries({ queryKey: ["operational_field_reviews"] });
    qc.removeQueries({ queryKey: ["operational_execution_logs"] });
    setSelectedAssignment(a);
    setExecDialogOpen(true);
    setShowHistory(false);
    const sections = a.template_snapshot?.sections?.sort((x: any, y: any) => x.ordem - y.ordem);
    setActiveSection(sections?.[0]?.id || null);
    // Se é auditor → abre direto na aba Auditor
    // Se é aprovador → abre direto na aba Aprovação
    // Caso contrário → abre no registro (executor)
    const isAud = !!a.auditor_id && a.status === "aguardando_auditoria";
    const isAprov = (!!a.aprovador_id || !!a.created_by) && a.status === "aguardando_aprovacao";
    setViewMode(isAud ? "auditor" : isAprov ? "aprovacao" : "registro");

    if (profile?.id) {
      // Auditoria enriquecida: papel_usado derivado do contexto
      const papelUsado =
        a.responsavel_id === profile.id ? "executor"
        : a.aprovador_id === profile.id ? "aprovador"
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
  }, [profile?.id, isAdmin, navigate]);

  const closeExecution = async () => {
    if (exec.dirty) {
      try {
        await exec.saveDraft();
      } catch (e: any) {
        console.error("Erro ao salvar rascunho ao fechar execução:", e);
        toast.error("Não foi possível salvar o rascunho agora. A tela será fechada.");
      }
    }
    setExecDialogOpen(false);
    setSelectedAssignment(null);
    setSubmitAttempted(false);
    setShowHistory(false);
    // Limpa cache das queries da tarefa encerrada para não vazar para a próxima
    qc.removeQueries({ queryKey: ["operational_field_answers"] });
    qc.removeQueries({ queryKey: ["operational_field_reviews"] });
    qc.removeQueries({ queryKey: ["operational_execution_logs"] });
  };

  const visibleFields = useMemo(() =>
    effectiveFields.filter(f => evaluateVisibility(f.condicao_visibilidade, exec.answers)),
    [effectiveFields, exec.answers]
  );

  const isFilled = useCallback((f: SnapshotField) => {
    const a = exec.answers[f.id];
    return !!a && (
      (a.valor_texto != null && a.valor_texto !== "") ||
      a.valor_numero != null ||
      a.valor_booleano != null ||
      a.valor_data != null ||
      a.valor_json != null ||
      (a.evidencia_url != null && a.evidencia_url !== "")
    );
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

  // Owner: dono individual OU, quando setorizada (responsavel_id NULL),
  // qualquer membro ativo do setor executor pode preencher/concluir.
  const isOwner = !!selectedAssignment && (
    selectedAssignment.responsavel_id === profile?.id ||
    (
      selectedAssignment.responsavel_id == null &&
      !!selectedAssignment.setor_executor_id &&
      meusSetorIds.includes(selectedAssignment.setor_executor_id)
    )
  );
  const isAvaliado = selectedAssignment?.avaliado_id === profile?.id;
  const isAdminEditing = isAdmin && selectedAssignment && !["nao_executada"].includes(selectedAssignment.status);

  // Modos de papel ativo no drawer (mutuamente exclusivos com edição do executor):
  //  - Avaliador: status aguardando_avaliacao | em_avaliacao
  //  - Aprovador: status aguardando_aprovacao
  // Admin entra nesses modos quando não há aprovador/avaliador atribuído ou para suprir ausência.
  const isAvaliadorMode = !!selectedAssignment
    && (selectedAssignment.aprovador_id === profile?.id || isAdmin)
    && ["aguardando_avaliacao", "em_avaliacao"].includes(selectedAssignment.status);
  const isAprovadorMode = !!selectedAssignment
    && (
      selectedAssignment.aprovador_id === profile?.id ||
      isAdmin ||
      // Sem aprovador definido: quem criou a tarefa assume o papel de aprovador
      (selectedAssignment.aprovador_id === null && selectedAssignment.created_by === profile?.id)
    )
    && selectedAssignment.status === "aguardando_aprovacao";
  const isAuditorMode = !!selectedAssignment
    && (
      selectedAssignment.auditor_id === profile?.id ||
      isAdmin ||
      // Auditor por setor: verifica se usuário é membro do setor auditor
      (selectedAssignment.auditor_id === null &&
       selectedAssignment.setor_auditor_id &&
       meusSetorIds.includes(selectedAssignment.setor_auditor_id))
    )
    && selectedAssignment.status === "aguardando_auditoria";

  const isEditable = selectedAssignment && !isAprovadorMode && !isAvaliadorMode && !isAuditorMode && (
    (["pendente", "em_andamento", "devolvida"].includes(selectedAssignment.status) && (isOwner || isAdmin)) ||
    isAdminEditing
  );
  const isDevolvida = selectedAssignment?.status === "devolvida";

  // Planos de ação do aprovador (visíveis ao executor quando o campo foi devolvido com plano)
  const { data: approverPlansList = [] } = useQuery({
    queryKey: ["operational_approver_plans_executor_view", selectedAssignment?.id],
    queryFn: async () => {
      if (!selectedAssignment?.id) return [];
      // Busca planos de ação do approval_answers
      const { data: plans } = await (supabase as any)
        .from("operational_approval_answers")
        .select("field_id, plano_acao_descricao, plano_acao_prazo, plano_acao_anexo_url, flag_prazo_alterado, justificativa_alteracao_prazo")
        .eq("assignment_id", selectedAssignment.id);
      // Busca tipo_evidencia_exigida e instrucao do field_reviews
      const { data: reviews } = await (supabase as any)
        .from("operational_field_reviews")
        .select("field_id, tipo_evidencia_exigida, instrucao_aprovador, rodada")
        .eq("assignment_id", selectedAssignment.id)
        .eq("devolvido", true)
        .order("rodada", { ascending: false });
      // Mescla: para cada field_id, pega o review mais recente (já ordenado desc)
      const reviewMap: Record<string, any> = {};
      for (const r of (reviews || [])) {
        if (!reviewMap[r.field_id]) reviewMap[r.field_id] = r;
      }
      // Combina plans + reviews
      const merged = (plans || []).map((p: any) => ({
        ...p,
        tipo_evidencia_exigida: reviewMap[p.field_id]?.tipo_evidencia_exigida || "nenhuma",
        instrucao_aprovador: reviewMap[p.field_id]?.instrucao_aprovador || p.plano_acao_descricao || "",
      }));
      // Inclui fields devolvidos sem plano de ação (devolução simples)
      for (const r of (reviews || [])) {
        if (!merged.find((m: any) => m.field_id === r.field_id)) {
          merged.push({
            field_id: r.field_id,
            plano_acao_descricao: r.instrucao_aprovador || "",
            tipo_evidencia_exigida: r.tipo_evidencia_exigida || "nenhuma",
            instrucao_aprovador: r.instrucao_aprovador || "",
          });
        }
      }
      return merged;
    },
    enabled: !!selectedAssignment?.id && (isDevolvida || selectedAssignment?.status === "em_plano_acao"),
  });
  const approverPlanByField = useMemo(() => {
    const map: Record<string, any> = {};
    for (const a of approverPlansList as any[]) {
      if (a?.field_id) map[a.field_id] = a;
    }
    return map;
  }, [approverPlansList]);
  const isContingenciado = selectedAssignment && ["contingenciado", "contingencia"].includes(selectedAssignment.status);
  const needsAdminReopen = isAdmin && selectedAssignment && ["aguardando_avaliacao", "aguardando_aprovacao", "concluida", "aprovada", "contingenciado", "contingencia"].includes(selectedAssignment.status);
  // Show contingency panel for avaliado, validador, responsavel, or admin
  const showContingencyPanel = isContingenciado && selectedAssignment && (
    isAdmin || isOwner || isAvaliado ||
    selectedAssignment.validador_contingencia_id === profile?.id ||
    selectedAssignment.aprovador_id === profile?.id
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
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => setQuickTaskOpen(true)} title="Nova Tarefa">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 mb-3 flex-wrap p-2 rounded-lg bg-muted/40 border border-border">
          {/* Setor primeiro — filtra os executores abaixo */}
          <Select value={adminSetor} onValueChange={v => { setAdminSetor(v); setAdminExecutor("__all"); }}>
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

          {/* Executores — filtrados pelo setor selecionado */}
          <Select value={adminExecutor} onValueChange={setAdminExecutor}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
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

            {(snapshotSections.length > 1 || isAprovadorMode || isAuditorMode) && (
              <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                {snapshotSections.map((s: any) => {
                  const sFields = fieldsBySection[s.id] || [];
                  const sFieldsVisible = sFields.filter(f => evaluateVisibility(f.condicao_visibilidade, exec.answers));
                  const filled = sFieldsVisible.filter(f => {
                    const a = exec.answers[f.id];
                    return !!a && (
                      (a.valor_texto != null && a.valor_texto !== "") ||
                      a.valor_numero != null ||
                      a.valor_booleano != null ||
                      a.valor_data != null ||
                      a.valor_json != null ||
                      (a.evidencia_url != null && a.evidencia_url !== "")
                    );
                  }).length;
                  const allFilled = filled === sFieldsVisible.length && sFieldsVisible.length > 0;
                  const isLate = (() => {
                    if (!s.horario_fim || !selectedAssignment?.data_prevista) return false;
                    return new Date(`${selectedAssignment.data_prevista}T${s.horario_fim}`) < new Date();
                  })();
                  const isActiveTab = viewMode === "registro" && activeSection === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => { setViewMode("registro"); setActiveSection(s.id); }}
                      className={`flex flex-col items-start gap-0.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${isActiveTab ? "bg-primary/10 border-primary text-primary" : isLate && !allFilled ? "bg-destructive/5 border-destructive/30 text-destructive" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
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
                {(isAprovadorMode || isAuditorMode) && (
                  <button type="button" onClick={() => setViewMode("aprovacao")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${viewMode === "aprovacao" ? "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                    <CheckCircle2 className="w-3 h-3" /> Aprovação
                  </button>
                )}
                {isAuditorMode && (
                  <button type="button" onClick={() => setViewMode("auditor")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${viewMode === "auditor" ? "bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-400" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                    <CheckCircle2 className="w-3 h-3" /> Auditor
                  </button>
                )}
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


            {/* Embedded contingency panel for contingenciado tasks */}
            {showContingencyPanel && selectedAssignment && (
              <div className="bg-muted/30 border border-border rounded-lg p-3">
                <EmbeddedContingencyPanel assignmentId={selectedAssignment.id} />
              </div>
            )}

            {/* Fase 1B.3 — Router declarativo dos painéis embarcados (aceite/validação/plano).
                Aditivo: legados continuam funcionando. Renderiza só quando o registry casar. */}
            {selectedAssignment && (
              <div className="bg-card border border-border rounded-lg p-3">
                <DrawerActionRouter
                  assignment={selectedAssignment}
                  origem="drawer"
                  onClose={closeExecution}
                  onActionDone={() => {
                    qc.invalidateQueries({ queryKey: ["operational_my_assignments"] });
                  }}
                />
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
                        numeroTarefa={selectedAssignment.numero_tarefa ?? 0}
                        nomeTarefa={selectedAssignment.template_snapshot?.nome ?? "tarefa"}
                        origemTarefa={(selectedAssignment.origem ?? "rotina") as "rotina" | "ad_hoc"}
                        showValidation={submitAttempted}
                        approverPlan={approverPlanByField[f.id]}
                        allReviews={exec.getAllReviews(f.id)}
                        horarioLimite={selectedAssignment?.horario_limite}
                        dataPrevista={selectedAssignment?.data_prevista}
                        profileId={profile?.id}
                        responsavelId={selectedAssignment?.responsavel_id}
                        setorExecutorId={selectedAssignment?.setor_executor_id}
                        meusSetorIds={meusSetorIds}
                        isAdmin={isAdmin}
                      />
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
                          {(() => {
                            const anexo = parseAnexoFromDescricao(section.descricao);
                            if (!anexo) return null;
                            return (
                              <button
                                type="button"
                                title={`Ver instrução da etapa (${anexo.tipo})`}
                                onClick={() => window.open(anexo.url, "_blank", "noopener,noreferrer")}
                                className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-primary/10 text-primary transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            );
                          })()}
                          {section.descricao && !parseAnexoFromDescricao(section.descricao) && (
                            <p className="text-xs text-muted-foreground">— {section.descricao}</p>
                          )}
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
                              numeroTarefa={selectedAssignment.numero_tarefa ?? 0}
                              nomeTarefa={selectedAssignment.template_snapshot?.nome ?? "tarefa"}
                              origemTarefa={(selectedAssignment.origem ?? "rotina") as "rotina" | "ad_hoc"}
                              showValidation={submitAttempted}
                              approverPlan={approverPlanByField[f.id]}
                              allReviews={exec.getAllReviews(f.id)}
                              horarioLimite={selectedAssignment?.horario_limite}
                              dataPrevista={selectedAssignment?.data_prevista}
                              profileId={profile?.id}
                              responsavelId={selectedAssignment?.responsavel_id}
                              setorExecutorId={selectedAssignment?.setor_executor_id}
                              meusSetorIds={meusSetorIds}
                              isAdmin={isAdmin}
                            />
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

            {!isEditable && selectedAssignment && (isAprovadorMode || isAuditorMode) && viewMode === "aprovacao" && (
              <EmbeddedApprovalPanel
                assignment={selectedAssignment}
                fields={effectiveFields}
                onClose={closeExecution}
              />
            )}

            {!isEditable && selectedAssignment && isAuditorMode && viewMode === "auditor" && (
              <EmbeddedAuditPanel
                assignment={selectedAssignment}
                fields={effectiveFields}
                onClose={closeExecution}
              />
            )}

            {!isEditable && selectedAssignment && (
              (!isAvaliadorMode && !isAprovadorMode && !isAuditorMode) ||
              ((isAprovadorMode || isAuditorMode) && viewMode === "registro")
            ) && (
              <div className="space-y-3">
                {effectiveFields.map(f => (
                  <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                    review={exec.getLatestReview(f.id)} userRole="executor"
                    disabled={true} allAnswers={exec.answers} onChange={() => {}} assignmentId={selectedAssignment?.id || ""}
                    numeroTarefa={selectedAssignment?.numero_tarefa ?? 0}
                    nomeTarefa={selectedAssignment?.template_snapshot?.nome ?? "tarefa"}
                    origemTarefa={(selectedAssignment?.origem ?? "rotina") as "rotina" | "ad_hoc"} />
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
