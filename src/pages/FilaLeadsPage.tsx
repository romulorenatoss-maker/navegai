import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, MessageSquare, Loader2, ListOrdered, CalendarClock, AlertTriangle,
  ArrowRightLeft, Clock, Search, Filter, Eye, Archive, RefreshCw,
  MoreHorizontal, Bell, CheckCircle2, ExternalLink,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────
interface Lead {
  id: string; nome: string; status_lead: string; responsavel_id: string | null;
  updated_at: string; created_at: string; agendamento_retorno: string | null;
  notificacao_vista?: boolean; notificacao_vista_em?: string | null; notificacao_vista_por?: string | null;
}
interface LeadContato { id: string; lead_id: string; tipo_contato: string; valor: string; tem_whatsapp: boolean; }
interface CadenciaTentativa { id: string; numero_tentativa: number; dias_apos: number; periodo: string; prioridade: number; }
interface QueueItem {
  lead: Lead; contatos: LeadContato[]; tentativaAtual: number; proximoContato: Date | null;
  ultimaInteracao: string | null; responsavelNome: string; isOverdue: boolean;
  isScheduled: boolean; scheduleReady: boolean; nextAttempt: Date; nextAttemptExpired: boolean;
}

// ─── Helpers ────────────────────────────────────────────
const fmtDate = (d: string | Date) => { try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return String(d); } };
const fmtDateShort = (d: string | Date) => { try { return format(new Date(d), "dd/MM HH:mm", { locale: ptBR }); } catch { return String(d); } };
const PERIODO_HORA: Record<string, number> = { manha: 9, tarde: 14, noite: 19 };
const PERIODO_LABELS: Record<string, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };
const STATUS_MAP: Record<string, string> = { novo: "Novo", em_contato: "Em Contato", interessado: "Interessado", aguardando_decisao_avaliador: "Aguardando Decisão" };

function getPeriodoEndHour(periodo: string): number { return periodo === "manha" ? 12 : periodo === "tarde" ? 18 : 24; }
function isTarefaExpirada(tarefa: { data_contato: string; periodo: string; status: string }): boolean {
  if (tarefa.status === "realizado") return false;
  const tarefaDate = new Date(new Date(tarefa.data_contato));
  tarefaDate.setHours(getPeriodoEndHour(tarefa.periodo), 0, 0, 0);
  return new Date() > tarefaDate;
}

export default function FilaLeadsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("fila");

  // Filters
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterResponsavel, setFilterResponsavel] = useState("todos");
  const [filterAgendamento, setFilterAgendamento] = useState("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Notificações filters
  const [notifFilterVisto, setNotifFilterVisto] = useState("todos");
  const [notifSearch, setNotifSearch] = useState("");
  const [notifAppliedSearch, setNotifAppliedSearch] = useState("");

  // Dialogs
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [attemptTipo, setAttemptTipo] = useState("telefone");
  const [attemptNumero, setAttemptNumero] = useState("");
  const [attemptResultado, setAttemptResultado] = useState("");

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferItem, setTransferItem] = useState<QueueItem | null>(null);
  const [transferTarget, setTransferTarget] = useState("");

  const [showDecisionTransfer, setShowDecisionTransfer] = useState(false);
  const [decisionLeadId, setDecisionLeadId] = useState("");
  const [decisionLeadName, setDecisionLeadName] = useState("");
  const [decisionTarget, setDecisionTarget] = useState("");

  const [showDelay, setShowDelay] = useState(false);
  const [delayItem, setDelayItem] = useState<QueueItem | null>(null);

  const [selectedTarefa, setSelectedTarefa] = useState<any>(null);
  const [tarefaTipo, setTarefaTipo] = useState("telefone");

  const [showTarefaTransfer, setShowTarefaTransfer] = useState(false);
  const [tarefaTransferLeadId, setTarefaTransferLeadId] = useState("");
  const [tarefaTransferLeadName, setTarefaTransferLeadName] = useState("");
  const [tarefaTransferTarget, setTarefaTransferTarget] = useState("");
  const [tarefaNumero, setTarefaNumero] = useState("");
  const [tarefaResultado, setTarefaResultado] = useState("");

  // ─── Queries ──────────────────────────────────────
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["fila-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*")
        .in("status_lead", ["novo", "em_contato", "interessado", "aguardando_decisao_avaliador"])
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-atendimento"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const { data: atendimentoProfiles = [] } = useQuery({
    queryKey: ["profiles-setor-atendimento"],
    queryFn: async () => {
      const { data: setores } = await supabase.from("setores").select("id, nome").eq("ativo", true);
      const atendimentoSetor = (setores || []).find(s => s.nome.toLowerCase().includes("atendimento"));
      if (!atendimentoSetor) return [] as { id: string; nome: string }[];
      const { data: vinculos } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", atendimentoSetor.id);
      if (!vinculos || vinculos.length === 0) return [] as { id: string; nome: string }[];
      const profileIds = vinculos.map(v => v.profile_id);
      const { data: profs } = await supabase.from("profiles").select("id, nome").eq("ativo", true).in("id", profileIds).order("nome");
      return (profs || []) as { id: string; nome: string }[];
    },
  });

  const leadIds = leads.map(l => l.id);

  const { data: allContatos = [] } = useQuery({
    queryKey: ["fila-contatos", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("lead_contatos").select("*").in("lead_id", leadIds); if (error) throw error; return data as LeadContato[]; },
  });

  const { data: allInteracoes = [] } = useQuery({
    queryKey: ["fila-interacoes", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => { const { data, error } = await supabase.from("lead_interacoes").select("id, lead_id, data_interacao, colaborador_id").in("lead_id", leadIds).order("data_interacao", { ascending: false }); if (error) throw error; return data; },
  });

  const { data: cadencia = [] } = useQuery({
    queryKey: ["cadencia-tentativas"],
    queryFn: async () => { const { data, error } = await supabase.from("cadencia_tentativas").select("*").order("numero_tentativa", { ascending: true }); if (error) throw error; return data as CadenciaTentativa[]; },
  });

  const { data: fluxoConfig } = useQuery({
    queryKey: ["configuracao-fluxo-leads"],
    queryFn: async () => { const { data, error } = await supabase.from("configuracao_fluxo_leads").select("*").limit(1).maybeSingle(); if (error) throw error; return data; },
  });

  const { data: rotinaTentativas = [] } = useQuery({
    queryKey: ["rotina-tentativas"],
    queryFn: async () => { const { data, error } = await supabase.from("rotina_tentativas_leads").select("*").order("tentativa_numero"); if (error) throw error; return data; },
  });

  // ─── Tarefas do Dia ───────────────────────────────
  const { data: tarefas = [], isLoading: loadingTarefas } = useQuery({
    queryKey: ["fila-tarefas-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_tarefas_contato").select("*").in("status", ["pendente", "atrasado"]).order("data_contato", { ascending: true });
      if (error) throw error;
      const toUpdate: string[] = [];
      (data || []).forEach((t: any) => { if (t.status === "pendente" && isTarefaExpirada(t)) toUpdate.push(t.id); });
      if (toUpdate.length > 0 && profile) {
        await supabase.from("lead_tarefas_contato").update({ status: "atrasado" }).in("id", toUpdate);
        for (const id of toUpdate) {
          const tarefa = data?.find((t: any) => t.id === id);
          if (tarefa) {
            await supabase.from("registro_atraso_tentativa").insert({ lead_id: tarefa.lead_id, colaborador_id: tarefa.responsavel_id || profile.id, tentativa: tarefa.tentativa, data_programada: tarefa.data_contato, periodo: tarefa.periodo });
            await supabase.from("lead_historico").insert({ lead_id: tarefa.lead_id, usuario_id: profile.id, tipo_evento: "tentativa_atrasada", descricao: `Tentativa ${tarefa.tentativa} (${PERIODO_LABELS[tarefa.periodo] || tarefa.periodo}) expirou sem registro` });
          }
        }
        return (data || []).map((t: any) => toUpdate.includes(t.id) ? { ...t, status: "atrasado" } : t);
      }
      return data;
    },
    refetchInterval: 60_000,
  });

  const tarefaLeadIds = useMemo(() => [...new Set(tarefas.map((t: any) => t.lead_id))], [tarefas]);
  const { data: tarefaLeads = [] } = useQuery({
    queryKey: ["fila-tarefas-leads-names", tarefaLeadIds],
    enabled: tarefaLeadIds.length > 0,
    queryFn: async () => { const { data } = await supabase.from("leads").select("id, nome, status_lead").in("id", tarefaLeadIds); return data || []; },
  });
  const { data: tarefaContatos = [] } = useQuery({
    queryKey: ["fila-tarefas-leads-contatos", tarefaLeadIds],
    enabled: tarefaLeadIds.length > 0,
    queryFn: async () => { const { data } = await supabase.from("lead_contatos").select("*").in("lead_id", tarefaLeadIds); return data || []; },
  });

  const dedupedTarefas = useMemo(() => {
    const seen = new Set<string>();
    return tarefas.filter((t: any) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [tarefas]);

  const sortedTarefas = useMemo(() => {
    return [...dedupedTarefas].sort((a: any, b: any) => {
      const aA = a.status === "atrasado" || isTarefaExpirada(a);
      const bA = b.status === "atrasado" || isTarefaExpirada(b);
      if (aA && !bA) return -1; if (!aA && bA) return 1;
      return new Date(a.data_contato).getTime() - new Date(b.data_contato).getTime();
    });
  }, [dedupedTarefas]);

  const getTarefaLeadName = (id: string) => tarefaLeads.find((l: any) => l.id === id)?.nome || "—";
  const getTarefaPhones = (id: string) => tarefaContatos.filter((c: any) => c.lead_id === id && c.tipo_contato === "telefone");

  // ─── Queue logic ──────────────────────────────────
  const maxTentativas = (fluxoConfig as any)?.quantidade_tentativas || cadencia.length || 7;
  const getProfileName = (id: string | null) => { if (!id) return "Sem responsável"; return profiles.find(p => p.id === id)?.nome || "—"; };

  const queue = useMemo<QueueItem[]>(() => {
    const now = new Date();
    return leads.filter(l => l.status_lead !== "aguardando_decisao_avaliador").map(lead => {
      const contatos = allContatos.filter(c => c.lead_id === lead.id);
      const interacoes = allInteracoes.filter((i: any) => i.lead_id === lead.id);
      const tentativaAtual = interacoes.length + 1;
      const ultimaInteracao = interacoes[0]?.data_interacao || null;
      let proximoContato: Date | null = null;
      if (ultimaInteracao && cadencia.length > 0) {
        const regra = cadencia.find(c => c.numero_tentativa === tentativaAtual) || cadencia[cadencia.length - 1];
        if (regra) { const base = addDays(new Date(ultimaInteracao), regra.dias_apos); base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0); proximoContato = base; }
      }
      const isOverdue = !!proximoContato && proximoContato < now;
      const isScheduled = !!lead.agendamento_retorno;
      const scheduleReady = isScheduled && new Date(lead.agendamento_retorno!) <= now;
      let nextAttempt = lead.agendamento_retorno ? new Date(lead.agendamento_retorno) : addDays(new Date(lead.created_at), 1);
      const nextAttemptExpired = nextAttempt < now;
      return { lead, contatos, tentativaAtual, proximoContato, ultimaInteracao, responsavelNome: getProfileName(lead.responsavel_id), isOverdue, isScheduled, scheduleReady, nextAttempt, nextAttemptExpired };
    }).sort((a, b) => {
      if (a.nextAttemptExpired && !b.nextAttemptExpired) return -1;
      if (!a.nextAttemptExpired && b.nextAttemptExpired) return 1;
      return a.nextAttempt.getTime() - b.nextAttempt.getTime();
    });
  }, [leads, allContatos, allInteracoes, cadencia, profiles]);

  // ─── Notificações (aguardando_decisao) ────────────
  const notificacoes = useMemo(() => {
    return leads
      .filter(l => l.status_lead === "aguardando_decisao_avaliador")
      .map(lead => {
        const contatos = allContatos.filter(c => c.lead_id === lead.id);
        const interacoes = allInteracoes.filter((i: any) => i.lead_id === lead.id);
        // Find last person who actually worked the lead (last interaction's colaborador)
        const lastInteracao = interacoes.length > 0 ? interacoes[0] : null; // already sorted desc
        const ultimoResponsavelNome = lastInteracao ? getProfileName((lastInteracao as any).colaborador_id) : getProfileName(lead.responsavel_id);
        return { lead, contatos, interacoes: interacoes.length, responsavelNome: ultimoResponsavelNome };
      })
      .sort((a, b) => {
        // Not seen first
        if (!a.lead.notificacao_vista && b.lead.notificacao_vista) return -1;
        if (a.lead.notificacao_vista && !b.lead.notificacao_vista) return 1;
        return new Date(b.lead.updated_at).getTime() - new Date(a.lead.updated_at).getTime();
      });
  }, [leads, allContatos, allInteracoes, profiles]);

  const filteredNotificacoes = useMemo(() => {
    return notificacoes.filter(item => {
      if (notifFilterVisto === "nao_visto" && item.lead.notificacao_vista) return false;
      if (notifFilterVisto === "visto" && !item.lead.notificacao_vista) return false;
      if (notifAppliedSearch) {
        const t = notifAppliedSearch.toLowerCase();
        if (!item.lead.nome.toLowerCase().includes(t) && !item.contatos.some(c => c.valor.includes(t))) return false;
      }
      return true;
    });
  }, [notificacoes, notifFilterVisto, notifAppliedSearch]);

  const totalNaoVistas = notificacoes.filter(n => !n.lead.notificacao_vista).length;

  const filteredQueue = useMemo(() => {
    return queue.filter(item => {
      if (filterStatus !== "todos" && item.lead.status_lead !== filterStatus) return false;
      if (filterResponsavel !== "todos" && item.lead.responsavel_id !== filterResponsavel) return false;
      if (filterAgendamento === "agendado" && !item.isScheduled) return false;
      if (filterAgendamento === "sem_agendamento" && item.isScheduled) return false;
      if (filterAgendamento === "atrasado" && !item.isOverdue) return false;
      if (appliedSearch) { const t = appliedSearch.toLowerCase(); if (!item.lead.nome.toLowerCase().includes(t) && !item.contatos.some(c => c.valor.includes(t))) return false; }
      return true;
    });
  }, [queue, filterStatus, filterResponsavel, filterAgendamento, appliedSearch]);

  const totalAtrasados = queue.filter(i => i.isOverdue).length;
  const totalAgendados = queue.filter(i => i.isScheduled).length;
  const totalTarefas = sortedTarefas.length;
  const totalTarefasAtrasadas = sortedTarefas.filter((t: any) => t.status === "atrasado" || isTarefaExpirada(t)).length;

  const responsaveisNoLeads = useMemo(() => {
    const ids = [...new Set(leads.filter(l => l.status_lead !== "aguardando_decisao_avaliador").map(l => l.responsavel_id).filter(Boolean))];
    return ids.map(id => ({ id: id!, nome: getProfileName(id) }));
  }, [leads, profiles]);

  // ─── Mutations ────────────────────────────────────
  const attemptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !profile) throw new Error("Erro interno.");
      if (!attemptNumero) throw new Error("Selecione o número utilizado.");
      await supabase.from("lead_interacoes").insert({ lead_id: selectedItem.lead.id, colaborador_id: profile.id, tipo_contato: attemptTipo, numero_utilizado: attemptNumero, resultado: attemptResultado.trim() || null });
      await supabase.from("lead_historico").insert({ lead_id: selectedItem.lead.id, usuario_id: profile.id, tipo_evento: "tentativa_contato", descricao: `Tentativa ${selectedItem.tentativaAtual} via ${attemptTipo}: ${attemptResultado.trim() || "sem resultado"}` });
      const hadAgendamento = !!selectedItem.lead.agendamento_retorno;
      await supabase.from("leads").update({ status_lead: selectedItem.lead.status_lead === "novo" ? "em_contato" : selectedItem.lead.status_lead, agendamento_retorno: null } as any).eq("id", selectedItem.lead.id);
      if (hadAgendamento) { await supabase.from("lead_historico").insert({ lead_id: selectedItem.lead.id, usuario_id: profile.id, tipo_evento: "agendamento_removido", descricao: `Agendamento removido ao registrar tentativa ${selectedItem.tentativaAtual}` }); }
    },
    onSuccess: () => { toast.success("Tentativa registrada!"); setSelectedItem(null); setAttemptNumero(""); setAttemptResultado(""); queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-interacoes"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleTransfer = async () => {
    if (!transferItem || !transferTarget || !profile) return;
    // Mark all pending tasks as cancelled so attempt count resets for new owner
    await supabase.from("lead_tarefas_contato").update({ status: "cancelada" } as any).eq("lead_id", transferItem.lead.id).in("status", ["pendente", "atrasado"]);
    await supabase.from("leads").update({ responsavel_id: transferTarget, status_lead: "em_contato" } as any).eq("id", transferItem.lead.id);
    const targetName = profiles.find(p => p.id === transferTarget)?.nome || "—";
    await supabase.from("lead_historico").insert({ lead_id: transferItem.lead.id, usuario_id: profile.id, tipo_evento: "transferencia_automatica", descricao: `Lead transferido para ${targetName}. Contagem de tentativas reiniciada. Histórico anterior mantido.` });
    // Schedule first attempt for NOW so it appears as immediate priority
    const firstRotina = rotinaTentativas.find((r: any) => r.tentativa_numero === 1);
    const periodo = firstRotina?.periodo_contato || "manha";
    const now = new Date();
    await supabase.from("lead_tarefas_contato").insert({ lead_id: transferItem.lead.id, tentativa: 1, data_contato: now.toISOString(), periodo, status: "pendente", responsavel_id: transferTarget });
    toast.success(`Lead transferido para ${targetName} com rotina reiniciada!`);
    setShowTransfer(false); setTransferItem(null); setTransferTarget("");
    queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] });
  };

  const handleDecisionTransfer = async () => {
    if (!decisionLeadId || !decisionTarget || !profile) return;
    // Cancel all old pending tasks before creating new ones
    await supabase.from("lead_tarefas_contato").update({ status: "cancelada" } as any).eq("lead_id", decisionLeadId).in("status", ["pendente", "atrasado"]);
    await supabase.from("leads").update({ responsavel_id: decisionTarget, status_lead: "em_contato", notificacao_vista: false } as any).eq("id", decisionLeadId);
    const targetName = profiles.find(p => p.id === decisionTarget)?.nome || "—";
    await supabase.from("lead_historico").insert({ lead_id: decisionLeadId, usuario_id: profile.id, tipo_evento: "transferencia_decisao", descricao: `Lead transferido para ${targetName} após finalizar tentativas. Contagem reiniciada. Histórico mantido.` });
    const firstRotina = rotinaTentativas.find((r: any) => r.tentativa_numero === 1);
    const periodo = firstRotina?.periodo_contato || "manha";
    const now = new Date();
    await supabase.from("lead_tarefas_contato").insert({ lead_id: decisionLeadId, tentativa: 1, data_contato: now.toISOString(), periodo, status: "pendente", responsavel_id: decisionTarget });
    toast.success(`Lead transferido para ${targetName} com nova rotina!`);
    setShowDecisionTransfer(false); setDecisionLeadId(""); setDecisionTarget("");
    queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] });
  };

  const handleMarkDelay = async () => {
    if (!delayItem || !profile) return;
    const responsavelId = delayItem.lead.responsavel_id;
    if (!responsavelId) { toast.error("Lead sem responsável."); return; }
    await supabase.from("registro_atraso_tentativa").insert({ lead_id: delayItem.lead.id, colaborador_id: responsavelId, tentativa: delayItem.tentativaAtual, data_programada: delayItem.proximoContato?.toISOString() || new Date().toISOString(), periodo: "manha" });
    await supabase.from("lead_historico").insert({ lead_id: delayItem.lead.id, usuario_id: profile.id, tipo_evento: "atraso_registrado", descricao: `Atraso registrado para ${getProfileName(responsavelId)} na tentativa ${delayItem.tentativaAtual}` });
    toast.success("Atraso registrado."); setShowDelay(false); setDelayItem(null); queryClient.invalidateQueries({ queryKey: ["fila-leads"] });
  };

  const archiveMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");
      await supabase.from("leads").update({ status_lead: "arquivado" }).eq("id", leadId);
      await supabase.from("lead_historico").insert({ lead_id: leadId, usuario_id: profile.id, tipo_evento: "lead_arquivado", descricao: "Lead arquivado pelo avaliador." });
    },
    onSuccess: () => { toast.success("Lead arquivado."); queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  const restartMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");
      await supabase.from("leads").update({ status_lead: "em_contato", notificacao_vista: false } as any).eq("id", leadId);
      const firstRotina = rotinaTentativas.find((r: any) => r.tentativa_numero === 1);
      const periodo = firstRotina?.periodo_contato || "manha";
      const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1); nextDate.setHours(PERIODO_HORA[periodo] || 9, 0, 0, 0);
      await supabase.from("lead_tarefas_contato").insert({ lead_id: leadId, tentativa: 1, data_contato: nextDate.toISOString(), periodo, status: "pendente", responsavel_id: profile.id });
      await supabase.from("lead_historico").insert({ lead_id: leadId, usuario_id: profile.id, tipo_evento: "rotina_reiniciada", descricao: "Rotina de tentativas reiniciada pelo avaliador." });
    },
    onSuccess: () => { toast.success("Rotina reiniciada!"); queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  const handleTarefaTransfer = async () => {
    if (!tarefaTransferLeadId || !tarefaTransferTarget || !profile) return;
    await supabase.from("lead_tarefas_contato").update({ status: "cancelada" } as any).eq("lead_id", tarefaTransferLeadId).in("status", ["pendente", "atrasado"]);
    await supabase.from("leads").update({ responsavel_id: tarefaTransferTarget, status_lead: "em_contato" } as any).eq("id", tarefaTransferLeadId);
    const targetName = profiles.find(p => p.id === tarefaTransferTarget)?.nome || "—";
    await supabase.from("lead_historico").insert({ lead_id: tarefaTransferLeadId, usuario_id: profile.id, tipo_evento: "transferencia_automatica", descricao: `Lead transferido para ${targetName}. Contagem de tentativas reiniciada.` });
    const firstRotina = rotinaTentativas.find((r: any) => r.tentativa_numero === 1);
    const periodo = firstRotina?.periodo_contato || "manha";
    await supabase.from("lead_tarefas_contato").insert({ lead_id: tarefaTransferLeadId, tentativa: 1, data_contato: new Date().toISOString(), periodo, status: "pendente", responsavel_id: tarefaTransferTarget });
    toast.success(`Lead transferido para ${targetName}!`);
    setShowTarefaTransfer(false); setTarefaTransferLeadId(""); setTarefaTransferTarget("");
    queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] });
  };

  // Mark notification as seen
  const markAsSeenMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");
      await supabase.from("leads").update({ notificacao_vista: true, notificacao_vista_em: new Date().toISOString(), notificacao_vista_por: profile.id } as any).eq("id", leadId);
      await supabase.from("lead_historico").insert({ lead_id: leadId, usuario_id: profile.id, tipo_evento: "notificacao_vista", descricao: "Notificação marcada como vista pelo avaliador." });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  // Tarefa attempt mutation
  const tarefaAttemptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarefa || !profile) throw new Error("Erro interno.");
      if (!tarefaNumero) throw new Error("Selecione o número.");
      await supabase.from("lead_interacoes").insert({ lead_id: selectedTarefa.lead_id, colaborador_id: profile.id, tipo_contato: tarefaTipo, numero_utilizado: tarefaNumero, resultado: tarefaResultado.trim() || null });
      await supabase.from("lead_tarefas_contato").update({ status: "realizado" }).eq("id", selectedTarefa.id);
      await supabase.from("lead_historico").insert({ lead_id: selectedTarefa.lead_id, usuario_id: profile.id, tipo_evento: "tentativa_registrada", descricao: `Tentativa ${selectedTarefa.tentativa} via ${tarefaTipo}: ${tarefaResultado.trim() || "sem resultado"}` });
      const maxT = (fluxoConfig as any)?.quantidade_tentativas || 7;
      const nextT = selectedTarefa.tentativa + 1;
      if (nextT > maxT) {
        const acao = (fluxoConfig as any)?.acao_apos_finalizar_tentativas || "enviar_avaliador";
        const newStatus = acao === "arquivar_lead" ? "arquivado" : "aguardando_decisao_avaliador";
        await supabase.from("leads").update({ status_lead: newStatus }).eq("id", selectedTarefa.lead_id);
        await supabase.from("lead_historico").insert({ lead_id: selectedTarefa.lead_id, usuario_id: profile.id, tipo_evento: "tentativas_finalizadas", descricao: `Todas as ${maxT} tentativas finalizadas. Ação: ${acao}` });
      } else {
        const nextR = rotinaTentativas.find((r: any) => r.tentativa_numero === nextT);
        const dias = nextR?.dias_apos_anterior || 1;
        const per = nextR?.periodo_contato || "manha";
        const nd = new Date(); nd.setDate(nd.getDate() + dias); nd.setHours(PERIODO_HORA[per] || 9, 0, 0, 0);
        await supabase.from("lead_tarefas_contato").insert({ lead_id: selectedTarefa.lead_id, tentativa: nextT, data_contato: nd.toISOString(), periodo: per, status: "pendente", responsavel_id: profile.id });
      }
      const leadStatus = tarefaLeads.find((l: any) => l.id === selectedTarefa.lead_id)?.status_lead;
      if (leadStatus === "novo") await supabase.from("leads").update({ status_lead: "em_contato" }).eq("id", selectedTarefa.lead_id);
    },
    onSuccess: () => { toast.success("Tentativa registrada!"); setSelectedTarefa(null); queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] }); queryClient.invalidateQueries({ queryKey: ["fila-leads"] }); },
    onError: (err: any) => toast.error(err.message),
  });

  const openAttempt = (item: QueueItem) => { setSelectedItem(item); setAttemptTipo("telefone"); setAttemptNumero(""); setAttemptResultado(""); };
  const phoneOptions = selectedItem?.contatos.filter(c => c.tipo_contato === "telefone") || [];
  const tarefaPhoneOptions = selectedTarefa ? getTarefaPhones(selectedTarefa.lead_id) : [];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2"><ListOrdered className="w-5 h-5" /> Gerenciador de Leads</h1>
          <p className="text-sm text-muted-foreground">Gerencie leads, tarefas, registre tentativas, transfira responsáveis e tome decisões.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs gap-1"><ListOrdered className="w-3 h-3" /> {queue.length} na fila</Badge>
          {totalTarefas > 0 && <Badge variant="outline" className="text-xs gap-1"><Clock className="w-3 h-3" /> {totalTarefas} tarefa{totalTarefas > 1 ? "s" : ""}</Badge>}
          {totalTarefasAtrasadas > 0 && <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="w-3 h-3" /> {totalTarefasAtrasadas} atrasada{totalTarefasAtrasadas > 1 ? "s" : ""}</Badge>}
          {totalNaoVistas > 0 && <Badge className="text-xs gap-1 bg-orange-500 hover:bg-orange-600 text-white border-0"><Bell className="w-3 h-3" /> {totalNaoVistas} notificaç{totalNaoVistas > 1 ? "ões" : "ão"}</Badge>}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="fila">Fila de Leads ({filteredQueue.length})</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas do Dia ({totalTarefas}){totalTarefasAtrasadas > 0 ? ` 🔴` : ""}</TabsTrigger>
          <TabsTrigger value="notificacoes" className="gap-1.5">
            <Bell className="w-3.5 h-3.5" /> Notificações ({notificacoes.length})
            {totalNaoVistas > 0 && <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold">{totalNaoVistas}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Fila de Leads ═══ */}
        <TabsContent value="fila" className="space-y-4 mt-3">
          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="relative flex-1 min-w-[180px] max-w-[280px] flex gap-1">
                  <Input placeholder="Buscar lead ou telefone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => { if (e.key === "Enter") setAppliedSearch(searchTerm); }} className="h-8 text-xs" />
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" onClick={() => setAppliedSearch(searchTerm)}><Search className="w-3.5 h-3.5" /></Button>
                </div>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Status</SelectItem>
                    <SelectItem value="novo">Novo</SelectItem>
                    <SelectItem value="em_contato">Em Contato</SelectItem>
                    <SelectItem value="interessado">Interessado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterResponsavel} onValueChange={setFilterResponsavel}>
                  <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos Responsáveis</SelectItem>
                    {responsaveisNoLeads.map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterAgendamento} onValueChange={setFilterAgendamento}>
                  <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="agendado">Com Agendamento</SelectItem>
                    <SelectItem value="sem_agendamento">Sem Agendamento</SelectItem>
                    <SelectItem value="atrasado">Atrasados</SelectItem>
                  </SelectContent>
                </Select>
                {(filterStatus !== "todos" || filterResponsavel !== "todos" || filterAgendamento !== "todos" || appliedSearch) && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setFilterStatus("todos"); setFilterResponsavel("todos"); setFilterAgendamento("todos"); setSearchTerm(""); setAppliedSearch(""); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Queue Table */}
          <Card>
            <CardContent className="p-0 overflow-auto max-h-[calc(100vh-360px)]">
              {loadingLeads ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Carregando fila...</div>
              ) : filteredQueue.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead encontrado</div>
              ) : (
                <div className="min-w-[900px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone(s)</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQueue.map((item, idx) => {
                        const phones = item.contatos.filter(c => c.tipo_contato === "telefone");
                        return (
                          <TableRow key={item.lead.id} className={item.nextAttemptExpired ? "bg-destructive/5" : ""}>
                            <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                            <TableCell><span className="font-medium text-sm">{item.lead.nome}</span></TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {phones.map(c => <Badge key={c.id} variant="outline" className="text-[11px] gap-0.5 font-normal"><Phone className="w-2.5 h-2.5" />{c.valor}{c.tem_whatsapp && <MessageSquare className="w-2.5 h-2.5 text-green-600" />}</Badge>)}
                                {phones.length === 0 && <span className="text-[11px] text-muted-foreground">Sem tel.</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.nextAttemptExpired ? (
                                <span className="text-xs flex items-center gap-1 text-destructive font-semibold bg-destructive/10 border border-destructive/30 rounded px-1.5 py-0.5 w-fit"><AlertTriangle className="w-3 h-3" />{fmtDate(item.nextAttempt)}</span>
                              ) : (
                                <span className="text-xs flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" />{fmtDate(item.nextAttempt)}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[11px] border-0 ${
                                item.lead.status_lead === "novo" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
                                item.lead.status_lead === "em_contato" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                                "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              }`}>
                                {STATUS_MAP[item.lead.status_lead] || item.lead.status_lead}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver lead" onClick={() => navigate(`/leads?id=${item.lead.id}`)}><Eye className="w-3.5 h-3.5" /></Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1"><MoreHorizontal className="w-3.5 h-3.5" /> Ação</Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openAttempt(item)} className="gap-2 text-xs">
                                      <Phone className="w-3.5 h-3.5" /> Registrar {item.tentativaAtual}ª Tentativa
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setTransferItem(item); setTransferTarget(""); setShowTransfer(true); }} className="gap-2 text-xs">
                                      <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir Lead
                                    </DropdownMenuItem>
                                    {item.isOverdue && (
                                      <DropdownMenuItem onClick={() => { setDelayItem(item); setShowDelay(true); }} className="gap-2 text-xs text-destructive">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Registrar Atraso
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem onClick={() => archiveMutation.mutate(item.lead.id)} className="gap-2 text-xs text-destructive">
                                      <Archive className="w-3.5 h-3.5" /> Arquivar Lead
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
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
        </TabsContent>

        {/* ═══ TAB: Tarefas do Dia ═══ */}
        <TabsContent value="tarefas" className="mt-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">Tarefas de Contato <Badge variant="secondary" className="text-xs">{sortedTarefas.length}</Badge></CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[calc(100vh-360px)]">
              {loadingTarefas ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Carregando tarefas...</div>
              ) : sortedTarefas.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma tarefa pendente</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Telefone(s)</TableHead>
                      <TableHead className="text-center">Tentativa</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Atribuído a</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTarefas.map((tarefa: any, idx: number) => {
                      const isOv = tarefa.status === "atrasado" || isTarefaExpirada(tarefa);
                      const responsavelNome = tarefa.responsavel_id ? (profiles.find(p => p.id === tarefa.responsavel_id)?.nome || "—") : "Sem responsável";
                      return (
                        <TableRow key={tarefa.id} className={isOv ? "bg-destructive/5" : ""}>
                          <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-sm">{getTarefaLeadName(tarefa.lead_id)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {getTarefaPhones(tarefa.lead_id).map((c: any) => <Badge key={c.id} variant="outline" className="text-xs gap-1"><Phone className="w-3 h-3" />{c.valor}{c.tem_whatsapp && <MessageSquare className="w-3 h-3 text-green-600" />}</Badge>)}
                              {getTarefaPhones(tarefa.lead_id).length === 0 && <span className="text-xs text-muted-foreground">Sem telefone</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center"><Badge variant="secondary" className="text-xs">{tarefa.tentativa}ª</Badge></TableCell>
                          <TableCell className="text-xs">{PERIODO_LABELS[tarefa.periodo] || tarefa.periodo}</TableCell>
                          <TableCell className="text-xs">{fmtDateShort(tarefa.data_contato)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs border-0 ${isOv ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"}`}>
                              {isOv ? <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Atrasado</span> : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs border-0 ${isOv ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"}`}>
                              {isOv ? "Fora do Prazo" : "No Prazo"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{responsavelNome}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver lead" onClick={() => navigate(`/leads?id=${tarefa.lead_id}`)}><Eye className="w-3.5 h-3.5" /></Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1"><MoreHorizontal className="w-3.5 h-3.5" /> Ação</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => { setSelectedTarefa(tarefa); setTarefaTipo("telefone"); setTarefaNumero(""); setTarefaResultado(""); }} className="gap-2 text-xs">
                                    <Phone className="w-3.5 h-3.5" /> Registrar Tentativa
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setTarefaTransferLeadId(tarefa.lead_id); setTarefaTransferLeadName(getTarefaLeadName(tarefa.lead_id)); setTarefaTransferTarget(""); setShowTarefaTransfer(true); }} className="gap-2 text-xs">
                                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir para
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate(`/leads?id=${tarefa.lead_id}`)} className="gap-2 text-xs">
                                    <ExternalLink className="w-3.5 h-3.5" /> Abrir Lead
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Notificações do Avaliador ═══ */}
        <TabsContent value="notificacoes" className="space-y-4 mt-3">
          {/* Filters */}
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="relative flex-1 min-w-[180px] max-w-[280px] flex gap-1">
                  <Input placeholder="Buscar lead..." value={notifSearch} onChange={e => setNotifSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") setNotifAppliedSearch(notifSearch); }} className="h-8 text-xs" />
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" onClick={() => setNotifAppliedSearch(notifSearch)}><Search className="w-3.5 h-3.5" /></Button>
                </div>
                <Select value={notifFilterVisto} onValueChange={setNotifFilterVisto}>
                  <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="nao_visto">Não Vistos</SelectItem>
                    <SelectItem value="visto">Já Vistos</SelectItem>
                  </SelectContent>
                </Select>
                {(notifFilterVisto !== "todos" || notifAppliedSearch) && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setNotifFilterVisto("todos"); setNotifSearch(""); setNotifAppliedSearch(""); }}>Limpar</Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-auto max-h-[calc(100vh-360px)]">
              {filteredNotificacoes.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma notificação</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Telefone(s)</TableHead>
                      <TableHead>Último Responsável</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead className="text-center">Visto</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotificacoes.map((item, idx) => {
                      const phones = item.contatos.filter(c => c.tipo_contato === "telefone");
                      const isVisto = item.lead.notificacao_vista;
                      return (
                        <TableRow key={item.lead.id} className={!isVisto ? "bg-orange-50 dark:bg-orange-950/20" : ""}>
                          <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!isVisto && <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />}
                              <span className="font-medium text-sm">{item.lead.nome}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {phones.map(c => <Badge key={c.id} variant="outline" className="text-[11px] gap-0.5 font-normal"><Phone className="w-2.5 h-2.5" />{c.valor}</Badge>)}
                              {phones.length === 0 && <span className="text-[11px] text-muted-foreground">Sem tel.</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{item.responsavelNome}</TableCell>
                          <TableCell><Badge variant="secondary" className="text-xs">{item.interacoes} realizadas</Badge></TableCell>
                          <TableCell className="text-center">
                            {isVisto ? (
                              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-0 gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Visto
                              </Badge>
                            ) : (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 gap-1 text-orange-600 hover:text-orange-700" onClick={() => markAsSeenMutation.mutate(item.lead.id)}>
                                <Eye className="w-3 h-3" /> Marcar visto
                              </Button>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver lead" onClick={() => navigate(`/leads?id=${item.lead.id}`)}><Eye className="w-3.5 h-3.5" /></Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1"><MoreHorizontal className="w-3.5 h-3.5" /> Ação</Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {!isVisto && (
                                    <DropdownMenuItem onClick={() => markAsSeenMutation.mutate(item.lead.id)} className="gap-2 text-xs">
                                      <Eye className="w-3.5 h-3.5" /> Marcar como Visto
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => archiveMutation.mutate(item.lead.id)} className="gap-2 text-xs">
                                    <Archive className="w-3.5 h-3.5" /> Arquivar Lead
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setDecisionLeadId(item.lead.id); setDecisionLeadName(item.lead.nome); setDecisionTarget(""); setShowDecisionTransfer(true); }} className="gap-2 text-xs">
                                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir para Atendimento
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate(`/leads?id=${item.lead.id}`)} className="gap-2 text-xs">
                                    <ExternalLink className="w-3.5 h-3.5" /> Abrir Lead
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Attempt Dialog (fila) ────────────────────── */}
      <Dialog open={!!selectedItem} onOpenChange={o => !o && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar {selectedItem?.tentativaAtual}ª Tentativa — {selectedItem?.lead.nome}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">Responsável: <span className="font-medium text-foreground">{selectedItem?.responsavelNome}</span></div>
            <div className="space-y-1.5"><Label>Tipo de Contato</Label>
              <Select value={attemptTipo} onValueChange={setAttemptTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="telefone"><span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Telefone</span></SelectItem><SelectItem value="whatsapp"><span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span></SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Número Utilizado *</Label>
              <Select value={attemptNumero} onValueChange={setAttemptNumero}><SelectTrigger><SelectValue placeholder="Selecione o número..." /></SelectTrigger><SelectContent>{phoneOptions.map(c => <SelectItem key={c.id} value={c.valor}>{c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}</SelectItem>)}{phoneOptions.length === 0 && <SelectItem value="__none" disabled>Nenhum telefone</SelectItem>}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Resultado</Label><Textarea placeholder="Descreva o resultado..." value={attemptResultado} onChange={e => setAttemptResultado(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancelar</Button>
            <Button onClick={() => attemptMutation.mutate()} disabled={attemptMutation.isPending || !attemptNumero} className="press-effect">
              {attemptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Phone className="w-4 h-4 mr-1" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tarefa Attempt Dialog ────────────────────── */}
      <Dialog open={!!selectedTarefa} onOpenChange={o => !o && setSelectedTarefa(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Registrar Tentativa — {selectedTarefa ? getTarefaLeadName(selectedTarefa.lead_id) : ""}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">Tentativa: <Badge variant="secondary">{selectedTarefa?.tentativa}ª</Badge></div>
            <div className="space-y-1.5"><Label>Tipo de Contato</Label>
              <Select value={tarefaTipo} onValueChange={setTarefaTipo}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="telefone"><span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Telefone</span></SelectItem><SelectItem value="whatsapp"><span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span></SelectItem></SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Número Utilizado *</Label>
              <Select value={tarefaNumero} onValueChange={setTarefaNumero}><SelectTrigger><SelectValue placeholder="Selecione o número..." /></SelectTrigger><SelectContent>{tarefaPhoneOptions.map((c: any) => <SelectItem key={c.id} value={c.valor}>{c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}</SelectItem>)}{tarefaPhoneOptions.length === 0 && <SelectItem value="__none" disabled>Nenhum telefone</SelectItem>}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label>Resultado</Label><Textarea placeholder="Descreva o resultado..." value={tarefaResultado} onChange={e => setTarefaResultado(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTarefa(null)}>Cancelar</Button>
            <Button onClick={() => tarefaAttemptMutation.mutate()} disabled={tarefaAttemptMutation.isPending || !tarefaNumero} className="press-effect">
              {tarefaAttemptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Phone className="w-4 h-4 mr-1" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transfer Dialog ─────────────────────────── */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" /> Transferir Lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Transferir <span className="font-semibold">{transferItem?.lead.nome}</span> para outro colaborador do setor de atendimento.</p>
            <p className="text-xs text-muted-foreground">Responsável atual: <span className="font-medium">{transferItem?.responsavelNome}</span>. Todo o histórico será mantido.</p>
            <div className="space-y-1.5"><Label>Novo Responsável</Label>
              <Select value={transferTarget} onValueChange={setTransferTarget}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>
                {atendimentoProfiles.filter(p => p.id !== transferItem?.lead.responsavel_id).map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                {atendimentoProfiles.filter(p => p.id !== transferItem?.lead.responsavel_id).length === 0 && <SelectItem value="__none" disabled>Nenhum colaborador no setor Atendimento</SelectItem>}
              </SelectContent></Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!transferTarget} className="press-effect"><ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Decision Transfer Dialog ── */}
      <Dialog open={showDecisionTransfer} onOpenChange={setShowDecisionTransfer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" /> Transferir para Tratativa</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">O lead <span className="font-semibold">{decisionLeadName}</span> esgotou as tentativas de contato. Escolha outro colaborador do setor Atendimento para dar continuidade.</p>
            <div className="p-3 rounded-md bg-muted/50 border border-border space-y-1">
              <p className="text-xs text-muted-foreground">• O histórico completo será mantido para o novo responsável</p>
              <p className="text-xs text-muted-foreground">• Uma nova rotina de tentativas será iniciada automaticamente</p>
              <p className="text-xs text-muted-foreground">• O último responsável ficará registrado no histórico</p>
            </div>
            <div className="space-y-1.5"><Label>Novo Responsável</Label>
              <Select value={decisionTarget} onValueChange={setDecisionTarget}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>
                {atendimentoProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                {atendimentoProfiles.length === 0 && <SelectItem value="__none" disabled>Nenhum colaborador no setor Atendimento</SelectItem>}
              </SelectContent></Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDecisionTransfer(false)}>Cancelar</Button>
            <Button onClick={handleDecisionTransfer} disabled={!decisionTarget} className="press-effect"><ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transferir e Reiniciar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delay Dialog ────────────────────────────── */}
      <Dialog open={showDelay} onOpenChange={setShowDelay}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Registrar Atraso</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Registrar atraso do lead <span className="font-semibold">{delayItem?.lead.nome}</span>.</p>
            <div className="p-3 rounded-md bg-destructive/5 border border-destructive/20 space-y-1">
              <p className="text-xs"><span className="font-medium">Responsável:</span> {delayItem?.responsavelNome}</p>
              <p className="text-xs"><span className="font-medium">Tentativa:</span> {delayItem?.tentativaAtual}ª</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelay(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleMarkDelay} className="press-effect"><AlertTriangle className="w-4 h-4 mr-1.5" /> Confirmar Atraso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Tarefa Transfer Dialog ──────────────────── */}
      <Dialog open={showTarefaTransfer} onOpenChange={setShowTarefaTransfer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="w-5 h-5" /> Transferir para</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">Transferir <span className="font-semibold">{tarefaTransferLeadName}</span> para outro colaborador do setor de atendimento.</p>
            <div className="space-y-1.5"><Label>Novo Responsável</Label>
              <Select value={tarefaTransferTarget} onValueChange={setTarefaTransferTarget}><SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger><SelectContent>
                {atendimentoProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                {atendimentoProfiles.length === 0 && <SelectItem value="__none" disabled>Nenhum colaborador no setor Atendimento</SelectItem>}
              </SelectContent></Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTarefaTransfer(false)}>Cancelar</Button>
            <Button onClick={handleTarefaTransfer} disabled={!tarefaTransferTarget} className="press-effect"><ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transferir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
