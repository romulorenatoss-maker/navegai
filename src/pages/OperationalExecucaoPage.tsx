import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Play, Send, Save, Clock, ChevronLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { STATUS_CONFIG } from "@/hooks/useOperationalScoring";
import { AssignmentCard } from "@/components/operational/AssignmentCard";
import { DynamicFieldRenderer, SnapshotField, FieldAnswer } from "@/components/operational/DynamicFieldRenderer";
import { useAssignmentExecution } from "@/hooks/useAssignmentExecution";

export default function OperationalExecucaoPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("pendentes");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [execDialogOpen, setExecDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["my_operational_assignments", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao)")
        .or(`responsavel_id.eq.${profile.id}`)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  // Tabs filtering
  const pendentes = assignments.filter((a: any) => ["pendente"].includes(a.status));
  const emAndamento = assignments.filter((a: any) => ["em_andamento"].includes(a.status));
  const devolvidas = assignments.filter((a: any) => ["devolvida"].includes(a.status));
  const concluidas = assignments.filter((a: any) => ["concluida", "aprovada", "aguardando_avaliacao", "aguardando_aprovacao"].includes(a.status)).slice(0, 50);

  const exec = useAssignmentExecution(selectedAssignment?.id || null);

  // Snapshot data
  const snapshot = selectedAssignment?.template_snapshot;
  const snapshotSections: any[] = useMemo(() => snapshot?.sections?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);
  const snapshotFields: SnapshotField[] = useMemo(() => snapshot?.fields?.sort((a: any, b: any) => a.ordem - b.ordem) || [], [snapshot]);

  // Group fields by section
  const fieldsBySection = useMemo(() => {
    const map: Record<string, SnapshotField[]> = {};
    for (const f of snapshotFields) {
      const key = f.section_id || "__nosection";
      (map[key] ??= []).push(f);
    }
    return map;
  }, [snapshotFields]);

  // Set initial section when opening
  const openExecution = useCallback((a: any) => {
    setSelectedAssignment(a);
    setExecDialogOpen(true);
    const sections = a.template_snapshot?.sections?.sort((x: any, y: any) => x.ordem - y.ordem);
    setActiveSection(sections?.[0]?.id || null);
  }, []);

  const closeExecution = async () => {
    if (exec.dirty) await exec.saveDraft();
    setExecDialogOpen(false);
    setSelectedAssignment(null);
  };

  // Progress calculation — only visible fields
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

  // Is assignment editable by current user?
  const isEditable = selectedAssignment && ["pendente", "em_andamento", "devolvida"].includes(selectedAssignment.status);
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
    <div className="text-center py-12 text-muted-foreground">
      <p className="text-sm">{msg}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg md:text-xl font-semibold text-foreground">Execução Operacional</h1>
        <p className="text-sm text-muted-foreground">Formulários e rotinas atribuídos a você.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="pendentes" className="flex-1 min-w-[70px]">
            Pendentes {pendentes.length > 0 && <span className="ml-1 bg-yellow-500/20 text-yellow-700 px-1.5 rounded-full text-[10px]">{pendentes.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="andamento" className="flex-1 min-w-[70px]">
            Em Andamento {emAndamento.length > 0 && <span className="ml-1 bg-primary/20 text-primary px-1.5 rounded-full text-[10px]">{emAndamento.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="devolvidas" className="flex-1 min-w-[70px]">
            Devolvidas {devolvidas.length > 0 && <span className="ml-1 bg-amber-500/20 text-amber-700 px-1.5 rounded-full text-[10px]">{devolvidas.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-[70px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3">
          {isLoading ? renderEmptyState("Carregando...") : pendentes.length === 0 ? renderEmptyState("Nenhuma rotina pendente.") : pendentes.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
        </TabsContent>
        <TabsContent value="andamento" className="space-y-3">
          {emAndamento.length === 0 ? renderEmptyState("Nenhuma rotina em andamento.") : emAndamento.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
        </TabsContent>
        <TabsContent value="devolvidas" className="space-y-3">
          {devolvidas.length === 0 ? renderEmptyState("Nenhuma rotina devolvida.") : devolvidas.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
        </TabsContent>
        <TabsContent value="historico" className="space-y-3">
          {concluidas.length === 0 ? renderEmptyState("Nenhuma rotina concluída.") : concluidas.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openExecution} />)}
        </TabsContent>
      </Tabs>

      {/* Execution Dialog */}
      <Dialog open={execDialogOpen} onOpenChange={v => { if (!v) closeExecution(); }}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeExecution}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-foreground truncate">{snapshot?.nome || "Rotina"}</h2>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{selectedAssignment?.data_prevista}</span>
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

            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Section nav */}
            {snapshotSections.length > 1 && (
              <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1">
                {snapshotSections.map((s: any) => {
                  const sFields = fieldsBySection[s.id] || [];
                  const filled = sFields.filter(f => {
                    const a = exec.answers[f.id];
                    return a && (a.valor_texto != null && a.valor_texto !== "" || a.valor_numero != null || a.valor_booleano != null || a.valor_data != null || a.valor_json != null);
                  }).length;
                  const allFilled = filled === sFields.length && sFields.length > 0;
                  return (
                    <button key={s.id} type="button" onClick={() => setActiveSection(s.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border whitespace-nowrap transition-colors ${activeSection === s.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}>
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor || "#3b82f6" }} />
                      {s.nome || "Seção"}
                      {allFilled && <CheckCircle2 className="w-3 h-3 text-green-600" />}
                      <span className="text-[10px] opacity-70">{filled}/{sFields.length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Body — scrollable fields */}
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
                  // No sections, render all fields flat
                  <div className="space-y-3">
                    {snapshotFields.map(f => (
                      <DynamicFieldRenderer key={f.id} field={f} answer={exec.answers[f.id]}
                        review={exec.getLatestReview(f.id)} userRole="executor"
                        disabled={isDevolvida && !exec.getLatestReview(f.id)?.devolvido}
                        allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id} />
                    ))}
                  </div>
                ) : (
                  // Render active section
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
                              disabled={isDevolvida && !exec.getLatestReview(f.id)?.devolvido}
                              allAnswers={exec.answers} onChange={exec.updateAnswer} assignmentId={selectedAssignment.id} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {/* Read-only view for completed */}
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

          {/* Footer actions — sticky */}
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