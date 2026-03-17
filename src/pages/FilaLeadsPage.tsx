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
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone, MessageSquare, Loader2, ListOrdered, CalendarClock, AlertTriangle,
  ArrowRightLeft, Clock, Search, Filter, UserCheck, ExternalLink,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Types ──────────────────────────────────────────────
interface Lead {
  id: string;
  nome: string;
  status_lead: string;
  responsavel_id: string | null;
  updated_at: string;
  agendamento_retorno: string | null;
}

interface LeadContato {
  id: string;
  lead_id: string;
  tipo_contato: string;
  valor: string;
  tem_whatsapp: boolean;
}

interface CadenciaTentativa {
  id: string;
  numero_tentativa: number;
  dias_apos: number;
  periodo: string;
  prioridade: number;
}

interface QueueItem {
  lead: Lead;
  contatos: LeadContato[];
  tentativaAtual: number;
  proximoContato: Date | null;
  ultimaInteracao: string | null;
  responsavelNome: string;
  isOverdue: boolean;
  isScheduled: boolean;
  scheduleReady: boolean;
}

// ─── Helpers ────────────────────────────────────────────
const fmtDate = (d: string | Date) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return String(d); }
};

const fmtDateShort = (d: Date | null) => {
  if (!d) return "—";
  try { return format(d, "dd/MM HH:mm", { locale: ptBR }); }
  catch { return "—"; }
};

const PERIODO_HORA: Record<string, number> = { manha: 9, tarde: 14, noite: 19 };

const STATUS_MAP: Record<string, string> = {
  novo: "Novo",
  em_contato: "Em Contato",
  interessado: "Interessado",
};

export default function FilaLeadsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filters
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterResponsavel, setFilterResponsavel] = useState("todos");
  const [filterAgendamento, setFilterAgendamento] = useState("todos");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  // Dialogs
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [attemptTipo, setAttemptTipo] = useState("telefone");
  const [attemptNumero, setAttemptNumero] = useState("");
  const [attemptResultado, setAttemptResultado] = useState("");

  const [showTransfer, setShowTransfer] = useState(false);
  const [transferItem, setTransferItem] = useState<QueueItem | null>(null);
  const [transferTarget, setTransferTarget] = useState("");

  const [showDelay, setShowDelay] = useState(false);
  const [delayItem, setDelayItem] = useState<QueueItem | null>(null);

  // ─── Queries ──────────────────────────────────────
  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["fila-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status_lead", ["novo", "em_contato", "interessado"])
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

  // Profiles that belong to a sector named "atendimento"
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

  const leadIds = leads.map((l) => l.id);

  const { data: allContatos = [] } = useQuery({
    queryKey: ["fila-contatos", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos").select("*").in("lead_id", leadIds);
      if (error) throw error;
      return data as LeadContato[];
    },
  });

  const { data: allInteracoes = [] } = useQuery({
    queryKey: ["fila-interacoes", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes").select("id, lead_id, data_interacao")
        .in("lead_id", leadIds)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data as { id: string; lead_id: string; data_interacao: string }[];
    },
  });

  const { data: cadencia = [] } = useQuery({
    queryKey: ["cadencia-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cadencia_tentativas").select("*").order("numero_tentativa", { ascending: true });
      if (error) throw error;
      return data as CadenciaTentativa[];
    },
  });

  const { data: fluxoConfig } = useQuery({
    queryKey: ["configuracao-fluxo-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_fluxo_leads").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as { quantidade_tentativas: number } | null;
    },
  });

  const maxTentativas = fluxoConfig?.quantidade_tentativas || cadencia.length || 7;

  const getProfileName = (id: string | null) => {
    if (!id) return "Sem responsável";
    return profiles.find(p => p.id === id)?.nome || "—";
  };

  // ─── Build queue ──────────────────────────────────
  const queue = useMemo<QueueItem[]>(() => {
    const now = new Date();
    return leads.map((lead) => {
      const contatos = allContatos.filter((c) => c.lead_id === lead.id);
      const interacoes = allInteracoes.filter((i) => i.lead_id === lead.id);
      const tentativaAtual = interacoes.length + 1;
      const ultimaInteracao = interacoes[0]?.data_interacao || null;

      let proximoContato: Date | null = null;
      if (ultimaInteracao && cadencia.length > 0) {
        const regra = cadencia.find((c) => c.numero_tentativa === tentativaAtual)
          || cadencia[cadencia.length - 1];
        if (regra) {
          const base = addDays(new Date(ultimaInteracao), regra.dias_apos);
          base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0);
          proximoContato = base;
        }
      }

      const isOverdue = !!proximoContato && proximoContato < now;
      const isScheduled = !!lead.agendamento_retorno;
      const scheduleReady = isScheduled && new Date(lead.agendamento_retorno!) <= now;

      return {
        lead, contatos, tentativaAtual, proximoContato, ultimaInteracao,
        responsavelNome: getProfileName(lead.responsavel_id),
        isOverdue, isScheduled, scheduleReady,
      };
    }).sort((a, b) => {
      // Scheduled and ready → top
      if (a.scheduleReady && !b.scheduleReady) return -1;
      if (!a.scheduleReady && b.scheduleReady) return 1;
      // Overdue → next
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // New leads first
      if (!a.ultimaInteracao && b.ultimaInteracao) return -1;
      if (a.ultimaInteracao && !b.ultimaInteracao) return 1;
      // By next contact
      const aTime = a.proximoContato?.getTime() || Infinity;
      const bTime = b.proximoContato?.getTime() || Infinity;
      return aTime - bTime;
    });
  }, [leads, allContatos, allInteracoes, cadencia, profiles]);

  // ─── Filtered queue ───────────────────────────────
  const filteredQueue = useMemo(() => {
    return queue.filter(item => {
      if (filterStatus !== "todos" && item.lead.status_lead !== filterStatus) return false;
      if (filterResponsavel !== "todos" && item.lead.responsavel_id !== filterResponsavel) return false;
      if (filterAgendamento === "agendado" && !item.isScheduled) return false;
      if (filterAgendamento === "sem_agendamento" && item.isScheduled) return false;
      if (filterAgendamento === "atrasado" && !item.isOverdue) return false;
      if (appliedSearch) {
        const term = appliedSearch.toLowerCase();
        const matchName = item.lead.nome.toLowerCase().includes(term);
        const matchPhone = item.contatos.some(c => c.valor.includes(term));
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [queue, filterStatus, filterResponsavel, filterAgendamento, appliedSearch]);

  // Stats
  const totalAtrasados = queue.filter(i => i.isOverdue).length;
  const totalAgendados = queue.filter(i => i.isScheduled).length;
  const totalProntos = queue.filter(i => i.scheduleReady).length;

  // ─── Register attempt ─────────────────────────────
  const attemptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItem || !profile) throw new Error("Erro interno.");
      if (!attemptNumero) throw new Error("Selecione o número utilizado.");

      const { error: e1 } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedItem.lead.id,
        colaborador_id: profile.id,
        tipo_contato: attemptTipo,
        numero_utilizado: attemptNumero,
        resultado: attemptResultado.trim() || null,
      });
      if (e1) throw e1;

      await supabase.from("lead_historico").insert({
        lead_id: selectedItem.lead.id,
        usuario_id: profile.id,
        tipo_evento: "tentativa_contato",
        descricao: `Tentativa ${selectedItem.tentativaAtual} via ${attemptTipo}: ${attemptResultado.trim() || "sem resultado"}`,
      });

      const hadAgendamento = !!selectedItem.lead.agendamento_retorno;

      await supabase
        .from("leads")
        .update({
          status_lead: selectedItem.lead.status_lead === "novo" ? "em_contato" : selectedItem.lead.status_lead,
          agendamento_retorno: null,
        } as any)
        .eq("id", selectedItem.lead.id);

      if (hadAgendamento) {
        await supabase.from("lead_historico").insert({
          lead_id: selectedItem.lead.id,
          usuario_id: profile.id,
          tipo_evento: "agendamento_removido",
          descricao: `Agendamento de retorno removido ao registrar tentativa ${selectedItem.tentativaAtual}`,
        });
      }
    },
    onSuccess: () => {
      toast.success("Tentativa registrada! Lead movido para o final da fila.");
      setSelectedItem(null);
      setAttemptNumero("");
      setAttemptResultado("");
      queryClient.invalidateQueries({ queryKey: ["fila-leads"] });
      queryClient.invalidateQueries({ queryKey: ["fila-interacoes"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Transfer lead ────────────────────────────────
  const handleTransfer = async () => {
    if (!transferItem || !transferTarget || !profile) return;
    const { error } = await supabase.from("leads")
      .update({ responsavel_id: transferTarget } as any)
      .eq("id", transferItem.lead.id);
    if (error) { toast.error(error.message); return; }

    const targetName = profiles.find(p => p.id === transferTarget)?.nome || "—";
    await supabase.from("lead_historico").insert({
      lead_id: transferItem.lead.id,
      usuario_id: profile.id,
      tipo_evento: "transferencia_automatica",
      descricao: `Lead transferido para ${targetName}`,
    });

    toast.success(`Lead transferido para ${targetName}`);
    setShowTransfer(false);
    setTransferItem(null);
    setTransferTarget("");
    queryClient.invalidateQueries({ queryKey: ["fila-leads"] });
  };

  // ─── Mark delay ───────────────────────────────────
  const handleMarkDelay = async () => {
    if (!delayItem || !profile) return;
    const responsavelId = delayItem.lead.responsavel_id;
    if (!responsavelId) { toast.error("Lead sem responsável."); return; }

    const { error } = await supabase.from("registro_atraso_tentativa").insert({
      lead_id: delayItem.lead.id,
      colaborador_id: responsavelId,
      tentativa: delayItem.tentativaAtual,
      data_programada: delayItem.proximoContato?.toISOString() || new Date().toISOString(),
      periodo: "manha",
    });
    if (error) { toast.error(error.message); return; }

    await supabase.from("lead_historico").insert({
      lead_id: delayItem.lead.id,
      usuario_id: profile.id,
      tipo_evento: "atraso_registrado",
      descricao: `Atraso registrado para ${getProfileName(responsavelId)} na tentativa ${delayItem.tentativaAtual}`,
    });

    toast.success("Atraso registrado com sucesso.");
    setShowDelay(false);
    setDelayItem(null);
    queryClient.invalidateQueries({ queryKey: ["fila-leads"] });
  };

  const openAttempt = (item: QueueItem) => {
    setSelectedItem(item);
    setAttemptTipo("telefone");
    setAttemptNumero("");
    setAttemptResultado("");
  };

  const phoneOptions = selectedItem?.contatos.filter((c) => c.tipo_contato === "telefone") || [];

  // Unique responsaveis in leads
  const responsaveisNoLeads = useMemo(() => {
    const ids = [...new Set(leads.map(l => l.responsavel_id).filter(Boolean))];
    return ids.map(id => ({ id: id!, nome: getProfileName(id) }));
  }, [leads, profiles]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ListOrdered className="w-5 h-5" /> Fila de Atendimento
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie a fila de leads, transfira responsáveis e registre atrasos.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs gap-1">
            <ListOrdered className="w-3 h-3" /> {queue.length} na fila
          </Badge>
          {totalAtrasados > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="w-3 h-3" /> {totalAtrasados} atrasado{totalAtrasados > 1 ? "s" : ""}
            </Badge>
          )}
          {totalProntos > 0 && (
            <Badge className="text-xs gap-1 bg-primary/10 text-primary border border-primary/20">
              <CalendarClock className="w-3 h-3" /> {totalProntos} retorno pronto
            </Badge>
          )}
          {totalAgendados > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              <CalendarClock className="w-3 h-3" /> {totalAgendados} agendado{totalAgendados > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="relative flex-1 min-w-[180px] max-w-[280px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar nome ou telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
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
                {responsaveisNoLeads.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                ))}
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
            {(filterStatus !== "todos" || filterResponsavel !== "todos" || filterAgendamento !== "todos" || searchTerm) && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => {
                setFilterStatus("todos"); setFilterResponsavel("todos"); setFilterAgendamento("todos"); setSearchTerm("");
              }}>Limpar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Fila de Leads
            <Badge variant="secondary" className="text-xs">{filteredQueue.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingLeads ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando fila...</div>
          ) : filteredQueue.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead encontrado</div>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-320px)]">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Telefone(s)</TableHead>
                      <TableHead className="text-center">Tentativa</TableHead>
                      <TableHead>Próximo Contato</TableHead>
                      <TableHead>Agendamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQueue.map((item, idx) => {
                      const phones = item.contatos.filter(c => c.tipo_contato === "telefone");
                      const allDone = item.tentativaAtual > maxTentativas;
                      return (
                        <TableRow
                          key={item.lead.id}
                          className={
                            item.scheduleReady ? "bg-primary/5" :
                            item.isOverdue ? "bg-destructive/5" :
                            ""
                          }
                        >
                          <TableCell className="text-xs text-muted-foreground font-mono">{idx + 1}</TableCell>
                          <TableCell>
                            <span className="font-medium text-sm">{item.lead.nome}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.responsavelNome}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {phones.map(c => (
                                <Badge key={c.id} variant="outline" className="text-[11px] gap-0.5 font-normal">
                                  <Phone className="w-2.5 h-2.5" />
                                  {c.valor}
                                  {c.tem_whatsapp && <MessageSquare className="w-2.5 h-2.5 text-green-600" />}
                                </Badge>
                              ))}
                              {phones.length === 0 && <span className="text-[11px] text-muted-foreground">Sem tel.</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={allDone ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {item.tentativaAtual}ª{allDone ? " (esgotada)" : ""}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs flex items-center gap-1 ${item.isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                              <Clock className="w-3 h-3" />
                              {item.proximoContato ? fmtDateShort(item.proximoContato) : "Sem cadência"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {item.isScheduled ? (
                              <span className={`text-xs flex items-center gap-1 ${item.scheduleReady ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                                <CalendarClock className="w-3 h-3" />
                                {item.scheduleReady ? "⬆ Retorno agora" : fmtDateShort(new Date(item.lead.agendamento_retorno!))}
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">—</span>
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
                              <Button
                                size="sm" variant="ghost" className="h-7 text-[11px] px-1.5"
                                title="Abrir detalhes do lead"
                                onClick={() => navigate(`/leads?id=${item.lead.id}`)}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[11px] px-2" onClick={() => openAttempt(item)}>
                                <Phone className="w-3 h-3 mr-1" /> {item.tentativaAtual}ª Tentativa
                              </Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 text-[11px] px-1.5"
                                title="Transferir para outro avaliador"
                                onClick={() => { setTransferItem(item); setTransferTarget(""); setShowTransfer(true); }}
                              >
                                <ArrowRightLeft className="w-3.5 h-3.5" />
                              </Button>
                              {item.isOverdue && (
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-[11px] px-1.5 text-destructive hover:text-destructive"
                                  title="Marcar atraso do responsável"
                                  onClick={() => { setDelayItem(item); setShowDelay(true); }}
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* ─── Attempt Dialog ──────────────────────────── */}
      <Dialog open={!!selectedItem} onOpenChange={(o) => !o && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Registrar {selectedItem?.tentativaAtual}ª Tentativa — {selectedItem?.lead.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Responsável: <span className="font-medium text-foreground">{selectedItem?.responsavelNome}</span>
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
                  {phoneOptions.map((c) => (
                    <SelectItem key={c.id} value={c.valor}>
                      {c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}
                    </SelectItem>
                  ))}
                  {phoneOptions.length === 0 && (
                    <SelectItem value="__none" disabled>Nenhum telefone cadastrado</SelectItem>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedItem(null)}>Cancelar</Button>
            <Button
              onClick={() => attemptMutation.mutate()}
              disabled={attemptMutation.isPending || !attemptNumero}
              className="press-effect"
            >
              {attemptMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Phone className="w-4 h-4 mr-1" />}
              Registrar {selectedItem?.tentativaAtual}ª Tentativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Transfer Dialog ─────────────────────────── */}
      <Dialog open={showTransfer} onOpenChange={setShowTransfer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> Transferir Lead
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Transferir <span className="font-semibold">{transferItem?.lead.nome}</span> para outro colaborador do setor de atendimento.
            </p>
            <p className="text-xs text-muted-foreground">
              Responsável atual: <span className="font-medium">{transferItem?.responsavelNome}</span>
            </p>
            <div className="space-y-1.5">
              <Label>Novo Responsável</Label>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {atendimentoProfiles
                    .filter(p => p.id !== transferItem?.lead.responsavel_id)
                    .map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)
                  }
                  {atendimentoProfiles.filter(p => p.id !== transferItem?.lead.responsavel_id).length === 0 && (
                    <SelectItem value="__none" disabled>Nenhum colaborador no setor Atendimento</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransfer(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={!transferTarget} className="press-effect">
              <ArrowRightLeft className="w-4 h-4 mr-1.5" /> Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delay Dialog ────────────────────────────── */}
      <Dialog open={showDelay} onOpenChange={setShowDelay}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" /> Registrar Atraso
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Registrar atraso na rotina de contato do lead <span className="font-semibold">{delayItem?.lead.nome}</span>.
            </p>
            <div className="p-3 rounded-md bg-destructive/5 border border-destructive/20 space-y-1">
              <p className="text-xs"><span className="font-medium">Responsável:</span> {delayItem?.responsavelNome}</p>
              <p className="text-xs"><span className="font-medium">Tentativa:</span> {delayItem?.tentativaAtual}ª</p>
              <p className="text-xs"><span className="font-medium">Prazo:</span> {delayItem?.proximoContato ? fmtDate(delayItem.proximoContato) : "—"}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Essa ação registra o atraso no histórico do colaborador e do lead para acompanhamento.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelay(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleMarkDelay} className="press-effect">
              <AlertTriangle className="w-4 h-4 mr-1.5" /> Confirmar Atraso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
