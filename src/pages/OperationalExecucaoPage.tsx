import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Play, Square, Camera, Clock, AlertTriangle, CheckCircle2, Shield, ChevronRight, Upload, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { STATUS_CONFIG, CONTINGENCY_STATUS, TIPO_EXECUCAO_LABELS } from "@/hooks/useOperationalScoring";

function formatTimer(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function OperationalExecucaoPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("hoje");
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Timer
  useEffect(() => {
    if (!timerActive) return;
    const iv = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [timerActive]);

  const today = new Date().toISOString().slice(0, 10);

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["my_operational_assignments", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, descricao, tipo_execucao, exigir_foto, exigir_observacao, gerar_contingencia_automatica, prazo_sla_correcao_horas, responsavel_contingencia_id, requer_aprovacao_gestor, bloquear_fechamento_com_contingencia, setores(nome))")
        .eq("responsavel_id", profile.id)
        .order("data_prevista", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const { data: contingencies = [] } = useQuery({
    queryKey: ["my_contingencies", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*, operational_assignments(operational_templates(nome))")
        .eq("responsavel_id", profile.id)
        .in("status", ["aberta", "em_andamento"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  // Load steps/check items for selected assignment
  const { data: templateSteps = [] } = useQuery({
    queryKey: ["assignment_steps", selectedAssignment?.template_id],
    queryFn: async () => {
      if (!selectedAssignment?.template_id) return [];
      const { data } = await (supabase as any).from("operational_template_steps").select("*").eq("template_id", selectedAssignment.template_id).order("ordem");
      return data || [];
    },
    enabled: !!selectedAssignment?.template_id && selectedAssignment?.operational_templates?.tipo_execucao === "etapas",
  });

  const { data: checkItems = [] } = useQuery({
    queryKey: ["assignment_check_items", selectedAssignment?.template_id],
    queryFn: async () => {
      if (!selectedAssignment?.template_id) return [];
      const { data } = await (supabase as any).from("operational_template_check_items").select("*").eq("template_id", selectedAssignment.template_id).order("ordem");
      return data || [];
    },
    enabled: !!selectedAssignment?.template_id && selectedAssignment?.operational_templates?.tipo_execucao === "checklist_inspecao",
  });

  const { data: stepLogs = [] } = useQuery({
    queryKey: ["step_logs", selectedAssignment?.id],
    queryFn: async () => {
      if (!selectedAssignment?.id) return [];
      const { data } = await (supabase as any).from("operational_execution_step_logs").select("*").eq("assignment_id", selectedAssignment.id);
      return data || [];
    },
    enabled: !!selectedAssignment?.id,
  });

  const { data: checkAnswers = [] } = useQuery({
    queryKey: ["check_answers", selectedAssignment?.id],
    queryFn: async () => {
      if (!selectedAssignment?.id) return [];
      const { data } = await (supabase as any).from("operational_execution_check_answers").select("*").eq("assignment_id", selectedAssignment.id);
      return data || [];
    },
    enabled: !!selectedAssignment?.id,
  });

  const startTask = useMutation({
    mutationFn: async (a: any) => {
      const { error } = await (supabase as any).from("operational_assignments").update({ status: "em_andamento", inicio_em: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
      await (supabase as any).from("operational_execution_logs").insert({ assignment_id: a.id, acao: "iniciou", executado_por: profile?.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_operational_assignments"] }); toast.success("Tarefa iniciada!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const completeTask = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) return;
      const now = new Date().toISOString();
      const tempoGasto = selectedAssignment.inicio_em
        ? Math.round((Date.now() - new Date(selectedAssignment.inicio_em).getTime()) / 60000)
        : timer / 60;
      const tpl = selectedAssignment.operational_templates;
      const nextStatus = tpl?.requer_aprovacao_gestor ? "aguardando_aprovacao" : "concluida";
      const { error } = await (supabase as any).from("operational_assignments").update({
        status: nextStatus, fim_em: now, tempo_gasto_minutos: Math.round(tempoGasto), observacao: observacao || null,
      }).eq("id", selectedAssignment.id);
      if (error) throw error;
      await (supabase as any).from("operational_execution_logs").insert({ assignment_id: selectedAssignment.id, acao: "concluiu", executado_por: profile?.id, detalhes: { tempo_gasto_minutos: Math.round(tempoGasto), observacao } });
      // Audit trail
      await (supabase as any).from("operational_audit_trail").insert({
        assignment_id: selectedAssignment.id, tipo_evento: "conclusao", executado_por: profile?.id,
        dados_novos: { status: nextStatus, tempo_gasto_minutos: Math.round(tempoGasto) },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_operational_assignments"] });
      const tpl = selectedAssignment?.operational_templates;
      toast.success(tpl?.requer_aprovacao_gestor ? "Tarefa enviada para aprovação!" : "Tarefa concluída!");
      setExecutionDialogOpen(false); setTimerActive(false); setTimer(0);
    },
    onError: (e: any) => {
      if (e.message?.includes("contingência")) {
        toast.error("Não é possível concluir: existem contingências pendentes. Resolva-as primeiro.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const answerCheckItem = useMutation({
    mutationFn: async ({ checkItemId, conforme, obs }: { checkItemId: string; conforme: boolean; obs?: string }) => {
      if (!selectedAssignment) return;
      // Upsert answer
      const existing = checkAnswers.find((a: any) => a.check_item_id === checkItemId);
      if (existing) {
        await (supabase as any).from("operational_execution_check_answers").update({ conforme, observacao: obs || null }).eq("id", existing.id);
      } else {
        await (supabase as any).from("operational_execution_check_answers").insert({ assignment_id: selectedAssignment.id, check_item_id: checkItemId, conforme, observacao: obs || null });
      }
      // Auto-create contingency if non-conforme and template requires it
      if (!conforme) {
        const item = checkItems.find((ci: any) => ci.id === checkItemId);
        const tpl = selectedAssignment.operational_templates;
        if (item?.gera_contingencia_se_reprovado || tpl?.gerar_contingencia_automatica) {
          const slaHours = tpl?.prazo_sla_correcao_horas || 24;
          const prazoSla = new Date(Date.now() + slaHours * 3600000).toISOString();
          await (supabase as any).from("operational_contingencies").insert({
            assignment_id: selectedAssignment.id,
            check_answer_id: existing?.id || null,
            descricao: `Não conformidade: ${item?.pergunta || "Item reprovado"}`,
            responsavel_id: tpl?.responsavel_contingencia_id || profile?.id,
            prazo_sla: prazoSla,
          });
          toast.warning("Contingência criada automaticamente.");
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["check_answers"] }); },
  });

  const completeStep = useMutation({
    mutationFn: async (stepId: string) => {
      if (!selectedAssignment) return;
      const existing = stepLogs.find((l: any) => l.step_id === stepId);
      if (existing) {
        await (supabase as any).from("operational_execution_step_logs").update({ status: "concluida", fim_em: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await (supabase as any).from("operational_execution_step_logs").insert({ assignment_id: selectedAssignment.id, step_id: stepId, status: "concluida", inicio_em: new Date().toISOString(), fim_em: new Date().toISOString() });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["step_logs"] }); toast.success("Etapa concluída!"); },
  });

  const resolveContingency = useMutation({
    mutationFn: async ({ id, obs }: { id: string; obs: string }) => {
      await (supabase as any).from("operational_contingencies").update({ status: "resolvida", resolvida_em: new Date().toISOString() }).eq("id", id);
      await (supabase as any).from("operational_contingency_resolution_logs").insert({ contingency_id: id, acao: "resolveu", observacao: obs, executado_por: profile?.id });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my_contingencies"] }); toast.success("Contingência resolvida!"); },
  });

  const openExecution = (a: any) => {
    setSelectedAssignment(a);
    setObservacao("");
    setTimer(0);
    if (a.inicio_em) {
      const elapsed = Math.round((Date.now() - new Date(a.inicio_em).getTime()) / 1000);
      setTimer(elapsed);
      setTimerActive(a.status === "em_andamento");
    }
    setExecutionDialogOpen(true);
  };

  // Filter assignments
  const todayAssignments = assignments.filter((a: any) => a.data_prevista === today && !["concluida", "aprovada", "nao_executada"].includes(a.status));
  const pendingAssignments = assignments.filter((a: any) => a.data_prevista > today && a.status === "pendente");
  const lateAssignments = assignments.filter((a: any) => (a.data_prevista < today && a.status !== "concluida" && a.status !== "aprovada" && a.status !== "nao_executada") || a.status === "atrasada");
  const awaitingApproval = assignments.filter((a: any) => a.status === "aguardando_aprovacao");
  const doneAssignments = assignments.filter((a: any) => ["concluida", "aprovada"].includes(a.status)).slice(0, 50);

  const renderCard = (a: any) => {
    const tpl = a.operational_templates;
    const statusConf = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
    return (
      <div key={a.id} onClick={() => openExecution(a)}
        className="bg-card border border-border rounded-lg p-4 shadow-card hover:shadow-md transition-all cursor-pointer active:scale-[0.98]">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-medium text-foreground truncate">{tpl?.nome || "Rotina"}</h3>
            <p className="text-caption text-muted-foreground mt-0.5">{tpl?.setores?.nome || "—"}</p>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border shrink-0 ${statusConf.class}`}>
            {statusConf.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-3 text-caption text-muted-foreground">
          <span className="inline-flex items-center px-2 py-0.5 rounded border badge-active">{TIPO_EXECUCAO_LABELS[tpl?.tipo_execucao] || "—"}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.data_prevista}</span>
          {a.horario_limite && <span>{a.horario_limite}</span>}
        </div>
        <div className="flex items-center justify-end mt-2">
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    );
  };

  const renderContingencyCard = (c: any) => {
    const statusConf = CONTINGENCY_STATUS[c.status] || CONTINGENCY_STATUS.aberta;
    const isVencida = c.prazo_sla && new Date(c.prazo_sla) < new Date() && c.status === "aberta";
    return (
      <div key={c.id} className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-body font-medium text-foreground">{c.descricao}</h3>
            <p className="text-caption text-muted-foreground mt-0.5">{c.operational_assignments?.operational_templates?.nome || "—"}</p>
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border shrink-0 ${isVencida ? CONTINGENCY_STATUS.vencida.class : statusConf.class}`}>
            {isVencida ? "Vencida" : statusConf.label}
          </span>
        </div>
        {c.prazo_sla && <p className="text-caption text-muted-foreground mt-2">SLA: {new Date(c.prazo_sla).toLocaleString("pt-BR")}</p>}
        <div className="flex gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={() => {
            const obs = prompt("Descreva a resolução:");
            if (obs) resolveContingency.mutate({ id: c.id, obs });
          }}>Resolver</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Painel Operacional</h1>
        <p className="text-body text-muted-foreground">Gerencie suas rotinas e tarefas diárias.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="hoje" className="flex-1 min-w-[80px]">
            Hoje {todayAssignments.length > 0 && <span className="ml-1 bg-primary/20 text-primary px-1.5 rounded-full text-caption">{todayAssignments.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="proximas" className="flex-1 min-w-[80px]">Próximas</TabsTrigger>
          <TabsTrigger value="atraso" className="flex-1 min-w-[80px]">
            Atraso {lateAssignments.length > 0 && <span className="ml-1 bg-destructive/20 text-destructive px-1.5 rounded-full text-caption">{lateAssignments.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="contingencias" className="flex-1 min-w-[80px]">
            Contingências {contingencies.length > 0 && <span className="ml-1 bg-orange-500/20 text-orange-600 px-1.5 rounded-full text-caption">{contingencies.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-[80px]">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="hoje" className="space-y-3">
          {isLoading ? <p className="text-center text-muted-foreground py-8">Carregando...</p> :
            todayAssignments.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma rotina para hoje.</p> :
            todayAssignments.map(renderCard)}
        </TabsContent>
        <TabsContent value="proximas" className="space-y-3">
          {pendingAssignments.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma rotina futura.</p> :
            pendingAssignments.map(renderCard)}
        </TabsContent>
        <TabsContent value="atraso" className="space-y-3">
          {lateAssignments.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma rotina em atraso.</p> :
            lateAssignments.map(renderCard)}
        </TabsContent>
        <TabsContent value="contingencias" className="space-y-3">
          {contingencies.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma contingência pendente.</p> :
            contingencies.map(renderContingencyCard)}
        </TabsContent>
        <TabsContent value="historico" className="space-y-3">
          {doneAssignments.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhuma rotina concluída.</p> :
            doneAssignments.map(renderCard)}
        </TabsContent>
      </Tabs>

      {/* Execution Dialog */}
      <Dialog open={executionDialogOpen} onOpenChange={setExecutionDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selectedAssignment && (() => {
            const tpl = selectedAssignment.operational_templates;
            const statusConf = STATUS_CONFIG[selectedAssignment.status] || STATUS_CONFIG.pendente;
            const isActive = selectedAssignment.status === "em_andamento";
            const isDone = selectedAssignment.status === "concluida";

            return (
              <>
                <DialogHeader>
                  <DialogTitle>{tpl?.nome || "Rotina"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${statusConf.class}`}>{statusConf.label}</span>
                    <span className="text-caption text-muted-foreground">{TIPO_EXECUCAO_LABELS[tpl?.tipo_execucao] || ""}</span>
                  </div>

                  {tpl?.descricao && <p className="text-body text-muted-foreground">{tpl.descricao}</p>}

                  {/* Timer */}
                  {(isActive || isDone) && (
                    <div className="bg-muted/50 rounded-lg border border-border p-4 text-center">
                      <p className="text-caption text-muted-foreground mb-1">Tempo de Execução</p>
                      <p className="text-2xl font-mono font-bold text-foreground">{formatTimer(timer)}</p>
                    </div>
                  )}

                  {/* Steps for etapas type */}
                  {tpl?.tipo_execucao === "etapas" && templateSteps.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-caption font-medium text-muted-foreground uppercase">Etapas</Label>
                      {templateSteps.map((step: any, i: number) => {
                        const log = stepLogs.find((l: any) => l.step_id === step.id);
                        const completed = log?.status === "concluida";
                        const prevCompleted = i === 0 || stepLogs.find((l: any) => l.step_id === templateSteps[i - 1]?.id)?.status === "concluida";
                        return (
                          <div key={step.id} className={`flex items-center gap-3 p-3 rounded-lg border ${completed ? "bg-green-50 border-green-200" : "bg-card border-border"}`}>
                            {completed ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <div className="w-5 h-5 rounded-full border-2 border-muted-foreground shrink-0" />}
                            <span className="text-body flex-1">{step.nome}</span>
                            {!completed && isActive && prevCompleted && (
                              <Button size="sm" onClick={() => completeStep.mutate(step.id)}>Concluir</Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Check items for checklist type */}
                  {tpl?.tipo_execucao === "checklist_inspecao" && checkItems.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-caption font-medium text-muted-foreground uppercase">Itens de Inspeção</Label>
                      {checkItems.map((item: any) => {
                        const answer = checkAnswers.find((a: any) => a.check_item_id === item.id);
                        return (
                          <div key={item.id} className={`p-3 rounded-lg border ${answer?.conforme === true ? "bg-green-50 border-green-200" : answer?.conforme === false ? "bg-red-50 border-red-200" : "bg-card border-border"}`}>
                            <p className="text-body mb-2">{item.pergunta}</p>
                            {isActive && !isDone && (
                              <div className="flex gap-2">
                                <Button size="sm" variant={answer?.conforme === true ? "default" : "outline"}
                                  onClick={() => answerCheckItem.mutate({ checkItemId: item.id, conforme: true })}
                                  className="flex-1">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  {item.tipo_resposta === "sim_nao" ? "Sim" : "Conforme"}
                                </Button>
                                <Button size="sm" variant={answer?.conforme === false ? "destructive" : "outline"}
                                  onClick={() => answerCheckItem.mutate({ checkItemId: item.id, conforme: false })}
                                  className="flex-1">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  {item.tipo_resposta === "sim_nao" ? "Não" : "Não Conforme"}
                                </Button>
                              </div>
                            )}
                            {answer && <p className="text-caption mt-1 text-muted-foreground">{answer.conforme ? "✅ Aprovado" : "❌ Reprovado"}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Observation */}
                  {(isActive || selectedAssignment.status === "pendente") && (
                    <div className="space-y-1.5">
                      <Label>Observação</Label>
                      <Textarea value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Adicione uma observação..." />
                    </div>
                  )}

                  {/* Actions */}
                  {!isDone && (
                    <div className="flex gap-2">
                      {selectedAssignment.status === "pendente" && (
                        <Button className="flex-1 press-effect" onClick={() => {
                          startTask.mutate(selectedAssignment);
                          setTimerActive(true);
                        }}>
                          <Play className="w-4 h-4 mr-2" /> Iniciar
                        </Button>
                      )}
                      {isActive && (
                        <Button className="flex-1 press-effect" onClick={() => completeTask.mutate()}>
                          <Square className="w-4 h-4 mr-2" /> Concluir
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
