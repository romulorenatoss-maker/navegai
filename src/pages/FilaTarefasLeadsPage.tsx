import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Phone, MessageSquare, Loader2, ListOrdered, Clock, AlertTriangle } from "lucide-react";
import { isTarefaExpirada, getEffectiveDeadline, getPeriodoEndHour, PERIODO_LABELS, PERIODO_HORA, skipWeekend } from "@/lib/lead-task-utils";
import { applyPhoneMask } from "@/lib/phone-utils";

function formatCountdown(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  const absDiff = Math.abs(diffMs);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
  const prefix = diffMs < 0 ? "−" : "";
  if (days > 0) return `${prefix}${days}d ${hours}h`;
  if (hours > 0) return `${prefix}${hours}h ${mins}m`;
  return `${prefix}${mins}m`;
}

const fmtDate = (d: string | Date) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return String(d); }
};
const fmtDateShort = (d: string | Date) => {
  try { return format(new Date(d), "dd/MM HH:mm", { locale: ptBR }); } catch { return String(d); }
};

const STATUS_STYLE: Record<string, string> = {
  atrasado: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  pendente: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  realizado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export default function FilaTarefasLeadsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTarefa, setSelectedTarefa] = useState<any | null>(null);
  const [attemptTipo, setAttemptTipo] = useState("telefone");
  const [attemptNumero, setAttemptNumero] = useState("");
  const [attemptResultado, setAttemptResultado] = useState("");

  // Live clock for countdown
  const [nowClock, setNowClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles-for-tarefas"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true); return data || []; },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch tarefas pendentes/atrasadas and auto-mark expired
  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: ["fila-tarefas-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tarefas_contato")
        .select("*")
        .in("status", ["pendente", "atrasado"])
        .order("data_contato", { ascending: true });
      if (error) throw error;

      // Auto-mark expired tasks as "atrasado"
      const toUpdate: string[] = [];
      (data || []).forEach((t: any) => {
        if (t.status === "pendente" && isTarefaExpirada(t)) {
          toUpdate.push(t.id);
        }
      });

      if (toUpdate.length > 0) {
        await supabase
          .from("lead_tarefas_contato")
          .update({ status: "atrasado" })
          .in("id", toUpdate);

        // Register delay events
        if (profile) {
          for (const id of toUpdate) {
            const tarefa = data?.find((t: any) => t.id === id);
            if (tarefa) {
              await supabase.from("registro_atraso_tentativa").insert({
                lead_id: tarefa.lead_id,
                colaborador_id: tarefa.responsavel_id || profile.id,
                tentativa: tarefa.tentativa,
                data_programada: tarefa.data_contato,
                periodo: tarefa.periodo,
              });
              const responsavelNome = tarefa.responsavel_id ? (allProfiles.find((p: any) => p.id === tarefa.responsavel_id)?.nome || "Desconhecido") : "Sem responsável";
              await supabase.from("lead_historico").insert({
                lead_id: tarefa.lead_id,
                usuario_id: profile.id,
                tipo_evento: "tentativa_atrasada",
                descricao: `Tentativa ${tarefa.tentativa} (${PERIODO_LABELS[tarefa.periodo] || tarefa.periodo}) expirou sem registro. Responsável: ${responsavelNome}`,
              });
            }
          }
        }

        // Return updated data
        return (data || []).map((t: any) =>
          toUpdate.includes(t.id) ? { ...t, status: "atrasado" } : t
        );
      }

      return data;
    },
    refetchInterval: 120_000,
    staleTime: 30_000,
  });

  const leadIds = useMemo(() => [...new Set(tarefas.map((t: any) => t.lead_id))], [tarefas]);

  const { data: leads = [] } = useQuery({
    queryKey: ["fila-tarefas-leads-names", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id, nome, status_lead").in("id", leadIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: contatos = [] } = useQuery({
    queryKey: ["fila-tarefas-leads-contatos", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_contatos").select("*").in("lead_id", leadIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: rotina = [] } = useQuery({
    queryKey: ["rotina-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rotina_tentativas_leads").select("*").order("tentativa_numero");
      if (error) throw error;
      return data;
    },
  });

  const { data: configFluxo } = useQuery({
    queryKey: ["config-fluxo-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracao_fluxo_leads").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  // Sort: atrasados/expirados first, then today, then future
  // Filter out leads that are not captured/assigned (e.g. importado, novo without responsavel)
  const STATUS_EXCLUIDOS_TAREFAS = ["importado"];

  const sortedTarefas = useMemo(() => {
    return [...tarefas]
      .filter((t: any) => {
        const lead = leads.find((l: any) => l.id === t.lead_id);
        if (!lead) return true; // keep if lead not loaded yet
        // Exclude leads that haven't been captured yet
        if (STATUS_EXCLUIDOS_TAREFAS.includes(lead.status_lead)) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const aAtrasado = a.status === "atrasado" || isTarefaExpirada(a);
        const bAtrasado = b.status === "atrasado" || isTarefaExpirada(b);
        if (aAtrasado && !bAtrasado) return -1;
        if (!aAtrasado && bAtrasado) return 1;
        const dateDiff = new Date(a.data_contato).getTime() - new Date(b.data_contato).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
  }, [tarefas, leads]);

  const getLeadName = (leadId: string) => leads.find((l: any) => l.id === leadId)?.nome || "—";
  const getLeadContatos = (leadId: string) => contatos.filter((c: any) => c.lead_id === leadId && c.tipo_contato === "telefone");

  const openAttempt = (tarefa: any) => {
    setSelectedTarefa(tarefa);
    setAttemptTipo("telefone");
    setAttemptNumero("");
    setAttemptResultado("");
  };

  const phoneOptions = selectedTarefa ? getLeadContatos(selectedTarefa.lead_id) : [];

  // Register attempt
  const attemptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarefa || !profile) throw new Error("Erro interno.");
      if (!attemptNumero) throw new Error("Selecione o número.");

      // Verify lead is still available and owned by current user
      const { data: freshLead } = await supabase
        .from("leads")
        .select("id, responsavel_id, reserved_by")
        .eq("id", selectedTarefa.lead_id)
        .single();
      if (freshLead && freshLead.responsavel_id !== profile.id && freshLead.reserved_by !== profile.id) {
        throw new Error("Este lead já foi atribuído a outro usuário.");
      }

      // Insert interação
      const { error: e1 } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedTarefa.lead_id,
        colaborador_id: profile.id,
        tipo_contato: attemptTipo,
        numero_utilizado: attemptNumero,
        resultado: attemptResultado.trim() || null,
      });
      if (e1) throw e1;

      // Update tarefa as realizado and track if it was late
      const wasLate = selectedTarefa.status === "atrasado" || isTarefaExpirada(selectedTarefa);
      const { error: e2 } = await supabase
        .from("lead_tarefas_contato")
        .update({ status: "realizado", fora_do_prazo: wasLate } as any)
        .eq("id", selectedTarefa.id);
      if (e2) throw e2;

      // Log history
      await supabase.from("lead_historico").insert({
        lead_id: selectedTarefa.lead_id,
        usuario_id: profile.id,
        tipo_evento: "tentativa_registrada",
        descricao: `Tentativa ${selectedTarefa.tentativa} via ${attemptTipo}: ${attemptResultado.trim() || "sem resultado"}`,
      });

      // Check if there's a next tentativa in rotina
      const maxTentativas = configFluxo?.quantidade_tentativas || 7;
      const nextTentativa = selectedTarefa.tentativa + 1;

      if (nextTentativa > maxTentativas) {
        // End of tentativas
        const acao = configFluxo?.acao_apos_finalizar_tentativas || "enviar_avaliador";
        const newStatus = acao === "arquivar_lead" ? "arquivado" : "aguardando_decisao_avaliador";
        await supabase.from("leads").update({ status_lead: newStatus }).eq("id", selectedTarefa.lead_id);
        await supabase.from("lead_historico").insert({
          lead_id: selectedTarefa.lead_id,
          usuario_id: profile.id,
          tipo_evento: "tentativas_finalizadas",
          descricao: `Todas as ${maxTentativas} tentativas foram finalizadas. Ação: ${acao}`,
        });
        toast.info("Todas as tentativas foram realizadas.");
      } else {
        // Create next tarefa
        const nextRotina = rotina.find((r: any) => r.tentativa_numero === nextTentativa);
        const diasApos = nextRotina?.dias_apos_anterior || 1;
        const periodo = nextRotina?.periodo_contato || "manha";
        const nextDate = skipWeekend(new Date());
        nextDate.setDate(nextDate.getDate() + diasApos);
        const skippedDate = skipWeekend(nextDate);
        const periodoHora = PERIODO_HORA[periodo] || 9;
        skippedDate.setHours(periodoHora, 0, 0, 0);

        await supabase.from("lead_tarefas_contato").insert({
          lead_id: selectedTarefa.lead_id,
          tentativa: nextTentativa,
          data_contato: skippedDate.toISOString(),
          periodo,
          status: "pendente",
          responsavel_id: profile.id,
        });
      }

      // Update lead status and clear manual scheduling
      const leadStatus = leads.find((l: any) => l.id === selectedTarefa.lead_id)?.status_lead;
      const leadUpdate: any = { agendamento_retorno: null };
      if (leadStatus === "novo") {
        leadUpdate.status_lead = "em_contato";
      }
      await supabase.from("leads").update(leadUpdate).eq("id", selectedTarefa.lead_id);
    },
    onSuccess: () => {
      toast.success("Tentativa registrada!");
      setSelectedTarefa(null);
      queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] });
      queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads-names"] });
    },
    onError: (err: any) => toast.error(err.message),
  });


  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ListOrdered className="w-5 h-5" /> Fila de Atendimento de Leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Tarefas de contato ordenadas por prioridade: atrasados → hoje → futuros.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Fila de Tarefas
            <Badge variant="secondary" className="text-xs">{sortedTarefas.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando fila...</div>
          ) : sortedTarefas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma tarefa pendente</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Telefone(s)</TableHead>
                    <TableHead className="text-center">Tentativa</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Data Contato</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTarefas.map((tarefa: any, idx: number) => {
                    const deadline = getEffectiveDeadline(new Date(tarefa.data_contato), tarefa.periodo);
                    const isOverdue = tarefa.status === "atrasado" || isTarefaExpirada(tarefa);
                    const diffMs = deadline.getTime() - nowClock.getTime();
                    const hoursLeft = diffMs / (1000 * 60 * 60);
                    const countdown = formatCountdown(deadline, nowClock);
                    const countdownColor = isOverdue ? "text-destructive font-medium" : hoursLeft <= 2 ? "text-yellow-700 dark:text-yellow-400 font-medium" : "text-muted-foreground";
                    return (
                      <TableRow key={tarefa.id} className={isOverdue ? "bg-red-50/50 dark:bg-red-950/20" : ""}>
                        <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-medium text-sm">{getLeadName(tarefa.lead_id)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getLeadContatos(tarefa.lead_id).map((c: any) => (
                              <Badge key={c.id} variant="outline" className="text-xs gap-1">
                                <Phone className="w-3 h-3" />
                                {applyPhoneMask(c.valor)}
                                {c.tem_whatsapp && <MessageSquare className="w-3 h-3 text-green-600" />}
                              </Badge>
                            ))}
                            {getLeadContatos(tarefa.lead_id).length === 0 && (
                              <span className="text-xs text-muted-foreground">Sem telefone</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs">{tarefa.tentativa}ª</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{PERIODO_LABELS[tarefa.periodo] || tarefa.periodo}</TableCell>
                        <TableCell className="text-xs">{fmtDateShort(tarefa.data_contato)}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${STATUS_STYLE[isOverdue ? "atrasado" : tarefa.status] || ""}`}>
                            {isOverdue ? (
                              <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Atrasado</span>
                            ) : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs flex items-center gap-1 ${countdownColor}`}>
                            <Clock className="w-3 h-3" />
                            {isOverdue ? `Expirado ${countdown}` : `Expira em ${countdown}`}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => openAttempt(tarefa)} className="press-effect">
                            <Phone className="w-3.5 h-3.5 mr-1" /> Atender
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attempt Dialog */}
      <Dialog open={!!selectedTarefa} onOpenChange={(o) => !o && setSelectedTarefa(null)}>
        <DialogContent className="sm:max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              Registrar Tentativa — {selectedTarefa ? getLeadName(selectedTarefa.lead_id) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Tentativa: <Badge variant="secondary">{selectedTarefa?.tentativa}ª</Badge>
              <Badge className={`text-xs border-0 ${STATUS_STYLE[selectedTarefa?.status] || ""}`}>
                {selectedTarefa?.status === "atrasado" ? "Atrasado" : "Pendente"}
              </Badge>
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de Contato</Label>
              <Select value={attemptTipo} onValueChange={setAttemptTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone">
                    <span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Telefone</span>
                  </SelectItem>
                  <SelectItem value="whatsapp">
                    <span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Número Utilizado *</Label>
              <Select value={attemptNumero} onValueChange={setAttemptNumero}>
                <SelectTrigger><SelectValue placeholder="Selecione o número..." /></SelectTrigger>
                <SelectContent>
                  {phoneOptions.map((c: any) => (
                    <SelectItem key={c.id} value={applyPhoneMask(c.valor)}>
                      {applyPhoneMask(c.valor)} {c.tem_whatsapp ? "(WhatsApp)" : ""}
                    </SelectItem>
                  ))}
                  {phoneOptions.length === 0 && (
                    <SelectItem value="__none" disabled>Nenhum telefone</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Textarea
                placeholder="Descreva o resultado da tentativa..."
                value={attemptResultado}
                onChange={(e) => setAttemptResultado(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSelectedTarefa(null)}>Cancelar</Button>
            <Button
              onClick={() => attemptMutation.mutate()}
              disabled={attemptMutation.isPending || !attemptNumero}
              className="press-effect"
            >
              {attemptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Phone className="w-4 h-4 mr-1" />}
              Registrar Tentativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
