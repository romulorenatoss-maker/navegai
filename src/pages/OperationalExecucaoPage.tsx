import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Play, Send, Save, ChevronLeft, CheckCircle2, AlertTriangle, ChevronDown, Search, Clock, CircleDot, RotateCcw, CheckCheck, CalendarClock, ListTodo, Hourglass, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { DynamicFieldRenderer, SnapshotField, FieldAnswer, evaluateVisibility } from "@/components/operational/DynamicFieldRenderer";
import { useAssignmentExecution } from "@/hooks/useAssignmentExecution";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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

export default function OperationalExecucaoPage() {
  const { profile, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [execDialogOpen, setExecDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [filterResponsavel, setFilterResponsavel] = useState<string>("__all");
  const [searchTerm, setSearchTerm] = useState("");
  const [openAccordion, setOpenAccordion] = useState<string | null>("hoje");
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState<string>(today);

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles_for_exec_filter"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
    enabled: isAdmin,
    staleTime: 60000,
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["my_operational_assignments", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let q = (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao), profiles:responsavel_id(id, nome, foto_url)")
        .order("data_prevista", { ascending: true });
      if (!isAdmin) {
        q = q.or(`responsavel_id.eq.${profile.id}`);
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  const filteredAssignments = useMemo(() => {
    let list = assignments;
    if (isAdmin && filterResponsavel !== "__all") {
      list = list.filter((a: any) => a.responsavel_id === filterResponsavel);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((a: any) => {
        const nome = a.template_snapshot?.nome || a.operational_templates?.nome || "";
        return nome.toLowerCase().includes(term);
      });
    }
    // Filtro de data: mostra apenas a data selecionada para hoje/a fazer
    if (filterDate) {
      list = list.filter((a: any) => {
        // Tarefas finalizadas/aguardando mostram sempre, o resto filtra por data
        if (["concluida", "aprovada", "aguardando_avaliacao", "aguardando_aprovacao", "nao_executada"].includes(a.status)) return true;
        // Devolvidas sempre visíveis
        if (a.status === "devolvida") return true;
        return a.data_prevista === filterDate || (a.data_prevista < filterDate && !["concluida", "aprovada"].includes(a.status));
      });
    }
    return list;
  }, [assignments, isAdmin, filterResponsavel, searchTerm, filterDate]);

  const hoje = filteredAssignments.filter((a: any) => 
    ["pendente", "em_andamento", "devolvida"].includes(a.status) && a.data_prevista === filterDate
  );
  const aFazer = filteredAssignments.filter((a: any) => ["pendente"].includes(a.status) && a.data_prevista !== filterDate);
  const emAndamento = filteredAssignments.filter((a: any) => ["em_andamento"].includes(a.status));
  const devolvidas = filteredAssignments.filter((a: any) => ["devolvida"].includes(a.status));
  const aguardandoAvaliacao = filteredAssignments.filter((a: any) => ["aguardando_avaliacao", "aguardando_aprovacao"].includes(a.status));
  const concluidas = filteredAssignments.filter((a: any) => ["concluida", "aprovada"].includes(a.status)).slice(0, 50);

  const exec = useAssignmentExecution(selectedAssignment?.id || null);

  const snapshot = selectedAssignment?.template_snapshot;
  const snapshotSections: any[] = useMemo(() => snapshot?.sections?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);
  const snapshotFields: SnapshotField[] = useMemo(() => snapshot?.fields?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);

  const fieldsBySection = useMemo(() => {
    const map: Record<string, SnapshotField[]> = {};
    for (const f of snapshotFields) {
      const key = f.section_id || "__nosection";
      (map[key] ??= []).push(f);
    }
    return map;
  }, [snapshotFields]);

  const openExecution = useCallback((a: any) => {
    setSelectedAssignment(a);
    setExecDialogOpen(true);
    const sections = a.template_snapshot?.sections?.sort((x: any, y: any) => x.ordem - y.ordem);
    setActiveSection(sections?.[0]?.id || null);

    // Log view event
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
  };

  const visibleFields = useMemo(() =>
    snapshotFields.filter(f => evaluateVisibility(f.condicao_visibilidade, exec.answers)),
    [snapshotFields, exec.answers]
  );

  const progress = useMemo(() => {
    if (!visibleFields.length) return 0;
    const filled = visibleFields.filter(f => {
      const a = exec.answers[f.id];
      return a && (a.valor_texto != null && a.valor_texto !== "" || a.valor_numero != null || a.valor_booleano != null || a.valor_data != null || a.valor_json != null);
    }).length;
    return Math.round((filled / visibleFields.length) * 100);
  }, [visibleFields, exec.answers]);

  const isOwner = selectedAssignment?.responsavel_id === profile?.id;
  const isEditable = selectedAssignment && ["pendente", "em_andamento", "devolvida"].includes(selectedAssignment.status) && (isOwner || isAdmin);
  const isDevolvida = selectedAssignment?.status === "devolvida";

  const handleStart = () => {
    if (selectedAssignment) exec.startTask.mutate(selectedAssignment.id);
  };

  const handleSubmit = () => {
    const visibleFields = snapshotFields.filter(f =>
      evaluateVisibility(f.condicao_visibilidade, exec.answers)
    );
    const errors = exec.validateAll(visibleFields, selectedAssignment?.status);
    if (errors.length > 0) {
      toast.error(`Corrija ${errors.length} erro(s) antes de enviar`, { description: errors.slice(0, 3).join("; ") });
      return;
    }
    exec.submit.mutate(
      { assignment: selectedAssignment, fields: visibleFields },
      {
        onSuccess: () => {
          setExecDialogOpen(false);
          setSelectedAssignment(null);
        },
      }
    );
  };

  const handleSaveDraft = async () => {
    await exec.saveDraft();
    toast.success("Rascunho salvo!");
  };

  const renderEmptyState = (msg: string) => (
    <div className="text-center py-6 text-muted-foreground">
      <p className="text-xs">{msg}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-foreground">Execução Operacional</h1>
        <p className="text-xs text-muted-foreground">
          {isAdmin ? "Visualização administrativa de todas as rotinas." : "Formulários e rotinas atribuídos a você."}
        </p>
      </div>

      {/* Search + Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {isAdmin && (
          <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              {allProfiles.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Accordion sections */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Carregando...</div>
      ) : (
        <div className="space-y-3">
          <AccordionSection
            title="Tarefas de Hoje"
            count={hoje.length}
            icon={<CalendarClock className="w-4 h-4" style={{ color: "#f97316" }} />}
            borderColor="#f97316"
            badgeBg="bg-orange-500/15"
            badgeText="text-orange-700 dark:text-orange-400"
            isOpen={openAccordion === "hoje"}
            onToggle={() => setOpenAccordion(openAccordion === "hoje" ? null : "hoje")}
          >
            {hoje.length === 0 ? renderEmptyState("Nenhuma tarefa para hoje.") : hoje.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
          </AccordionSection>

          <AccordionSection
            title="A Fazer"
            count={aFazer.length}
            icon={<ListTodo className="w-4 h-4" style={{ color: "#eab308" }} />}
            borderColor="#eab308"
            badgeBg="bg-yellow-500/15"
            badgeText="text-yellow-700 dark:text-yellow-400"
            isOpen={openAccordion === "afazer"}
            onToggle={() => setOpenAccordion(openAccordion === "afazer" ? null : "afazer")}
          >
            {aFazer.length === 0 ? renderEmptyState("Nenhuma rotina a fazer.") : aFazer.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
          </AccordionSection>

          <AccordionSection
            title="Em Andamento"
            count={emAndamento.length}
            icon={<CircleDot className="w-4 h-4" style={{ color: "#3b82f6" }} />}
            borderColor="#3b82f6"
            badgeBg="bg-blue-500/15"
            badgeText="text-blue-700 dark:text-blue-400"
            isOpen={openAccordion === "andamento"}
            onToggle={() => setOpenAccordion(openAccordion === "andamento" ? null : "andamento")}
          >
            {emAndamento.length === 0 ? renderEmptyState("Nenhuma rotina em andamento.") : emAndamento.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
          </AccordionSection>

          <AccordionSection
            title="Devolvidas"
            count={devolvidas.length}
            icon={<RotateCcw className="w-4 h-4" style={{ color: "#ef4444" }} />}
            borderColor="#ef4444"
            badgeBg="bg-red-500/15"
            badgeText="text-red-700 dark:text-red-400"
            isOpen={openAccordion === "devolvidas"}
            onToggle={() => setOpenAccordion(openAccordion === "devolvidas" ? null : "devolvidas")}
          >
            {devolvidas.length === 0 ? renderEmptyState("Nenhuma rotina devolvida.") : devolvidas.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
          </AccordionSection>

          <AccordionSection
            title="Finalizadas"
            count={concluidas.length}
            icon={<CheckCheck className="w-4 h-4" style={{ color: "#22c55e" }} />}
            borderColor="#22c55e"
            badgeBg="bg-green-500/15"
            badgeText="text-green-700 dark:text-green-400"
            isOpen={openAccordion === "finalizadas"}
            onToggle={() => setOpenAccordion(openAccordion === "finalizadas" ? null : "finalizadas")}
          >
            {concluidas.length === 0 ? renderEmptyState("Nenhuma rotina finalizada.") : concluidas.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
          </AccordionSection>
        </div>
      )}

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
                <h2 className="text-sm font-semibold text-foreground truncate">{snapshot?.nome || "Rotina"}</h2>
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
              {exec.dirty && <span className="text-[10px] text-muted-foreground">Não salvo</span>}
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
                  return (
                    <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${activeSection === s.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                      {s.nome || "Seção"}
                      {allFilled && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                      <span className="text-[10px] opacity-70">{filled}/{sFieldsVisible.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {selectedAssignment?.status === "pendente" && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">Inicie a tarefa para começar o preenchimento.</p>
                <Button onClick={handleStart} disabled={exec.startTask.isPending}>
                  <Play className="w-4 h-4 mr-2" /> Iniciar Tarefa
                </Button>
              </div>
            )}

            {isEditable && selectedAssignment?.status !== "pendente" && (
              <>
                {snapshotSections.length === 0 ? (
                  <div className="space-y-3">
                    {snapshotFields.map(f => (
                      <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                        review={exec.getLatestReview(f.id)} userRole="executor"
                        disabled={isDevolvida && exec.getLatestReview(f.id)?.devolvido !== true}
                        allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id} />
                    ))}
                  </div>
                ) : (
                  snapshotSections.filter(s => !activeSection || s.id === activeSection).map((section: any) => {
                    const sFields = fieldsBySection[section.id] || [];
                    return (
                      <div key={section.id}>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: section.cor || "#3b82f6" }} />
                          <h3 className="text-sm font-semibold text-foreground">{section.nome}</h3>
                          {section.descricao && <p className="text-xs text-muted-foreground">— {section.descricao}</p>}
                        </div>
                        <div className="space-y-3">
                          {sFields.map(f => (
                            <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                              review={exec.getLatestReview(f.id)} userRole="executor"
                              disabled={isDevolvida && exec.getLatestReview(f.id)?.devolvido !== true}
                              allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id} />
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
                {snapshotFields.map(f => (
                  <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                    review={exec.getLatestReview(f.id)} userRole="executor"
                    disabled={true} allAnswers={exec.answers} onChange={() => {}} assignmentId={selectedAssignment?.id || ""} />
                ))}
              </div>
            )}
          </div>

          {isEditable && selectedAssignment?.status !== "pendente" && (
            <div className="border-t border-border p-3 flex items-center gap-2 bg-card safe-area-bottom">
              <Button type="button" variant="outline" size="sm" onClick={handleSaveDraft} disabled={!exec.dirty}>
                <Save className="w-3.5 h-3.5 mr-1" /> Rascunho
              </Button>
              <div className="flex-1" />
              <Button type="button" size="sm" onClick={handleSubmit} disabled={exec.isSubmitting}>
                <Send className="w-3.5 h-3.5 mr-1" /> {exec.isSubmitting ? "Enviando..." : "Enviar para Avaliação"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
