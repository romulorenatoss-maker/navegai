import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search, Plus, Phone, User, Users, History, ArrowRight, Trash2,
  MessageSquare, PhoneCall, Clock, UserCheck, RefreshCw, Loader2, UserPlus, AlertTriangle,
  ListOrdered, Send, FileText, ChevronRight, CalendarClock, CalendarIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { applyPhoneMask, normalizePhone, isValidPhone, getPhoneTypeLabel } from "@/lib/phone-utils";

// ─── Types ──────────────────────────────────────────────
interface Lead {
  id: string;
  nome: string;
  status_lead: string;
  responsavel_id: string | null;
  plano_id: string | null;
  repetidor: string | null;
  data_criacao: string;
  created_at: string;
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

interface LeadInteracao {
  id: string;
  lead_id: string;
  colaborador_id: string;
  tipo_contato: string;
  numero_utilizado: string | null;
  data_interacao: string;
  resultado: string | null;
}

interface LeadHistorico {
  id: string;
  lead_id: string;
  usuario_id: string;
  tipo_evento: string;
  descricao: string | null;
  data_evento: string;
}

interface Plano {
  id: string;
  nome_plano: string;
  velocidade: string | null;
  descricao: string | null;
}

interface CadenciaTentativa {
  id: string;
  numero_tentativa: number;
  dias_apos: number;
  periodo: string;
  prioridade: number;
}

// ─── Status helpers ────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "novo", label: "Novo", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "em_contato", label: "Em Contato", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "interessado", label: "Interessado", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  { value: "convertido", label: "Convertido", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "perdido", label: "Perdido", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
];

function statusBadge(status: string) {
  const s = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  return <Badge className={`${s.color} border-0 text-xs`}>{s.label}</Badge>;
}

const EVENTO_LABELS: Record<string, string> = {
  criacao: "Criação do Lead",
  tentativa_contato: "Tentativa de Contato",
  tentativa_registrada: "Tentativa Registrada",
  transferencia_automatica: "Transferência Automática",
  conversao_cliente: "Conversão em Cliente",
  alteracao_status: "Alteração de Status",
  contato_adicionado: "Contato Adicionado",
  contato_removido: "Contato Removido",
  telefone_existente: "Telefone Existente",
  cliente_existente: "Cliente Existente",
  vinculo_cliente_existente: "Vínculo c/ Cliente",
  tentativas_finalizadas: "Tentativas Finalizadas",
  rotina_reiniciada: "Rotina Reiniciada",
  lead_arquivado: "Lead Arquivado",
  agendamento_retorno: "Agendamento de Retorno",
};

const EVENTO_ICONS: Record<string, typeof Phone> = {
  criacao: Plus,
  tentativa_contato: PhoneCall,
  tentativa_registrada: PhoneCall,
  transferencia_automatica: ArrowRight,
  conversao_cliente: UserCheck,
  alteracao_status: RefreshCw,
  contato_adicionado: Plus,
  contato_removido: Trash2,
  tentativas_finalizadas: Clock,
  rotina_reiniciada: RefreshCw,
  lead_arquivado: FileText,
  agendamento_retorno: CalendarClock,
};

const PERIODO_HORA: Record<string, number> = { manha: 9, tarde: 14, noite: 19 };

// ─── Component ──────────────────────────────────────────
export default function LeadsPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<(Lead & { contatos: LeadContato[] })[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPhoneWhatsapp, setCreatePhoneWhatsapp] = useState(false);

  // Detail view
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  // Interaction dialog
  const [showInteraction, setShowInteraction] = useState(false);
  const [interTipo, setInterTipo] = useState("telefone");
  const [interNumero, setInterNumero] = useState("");
  const [interResultado, setInterResultado] = useState("");

  // Add phone dialog
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [newPhoneValue, setNewPhoneValue] = useState("");
  const [newPhoneTipo, setNewPhoneTipo] = useState("telefone");
  const [newPhoneWhatsapp, setNewPhoneWhatsapp] = useState(false);

  // Conversion dialog
  const [showConvert, setShowConvert] = useState(false);
  const [convForm, setConvForm] = useState({
    nome: "", cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "",
  });

  // Finalize dialog (when all attempts done)
  const [showFinalize, setShowFinalize] = useState(false);

  // Schedule dialog
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleHour, setScheduleHour] = useState("09");
  const [scheduleMinute, setScheduleMinute] = useState("00");

  // Duplicate alert state
  const [dupeAlert, setDupeAlert] = useState<{
    type: "lead_phone" | "cliente_phone" | "cpf";
    message: string;
    leadId?: string;
    clienteId?: string;
    clienteNome?: string;
  } | null>(null);

  // ─── Queries ──────────────────────────────────────
  const { data: allLeads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  // Auto-select lead from URL param ?id=
  useEffect(() => {
    const leadId = searchParams.get("id");
    if (leadId && allLeads.length > 0 && !selectedLead) {
      const found = allLeads.find(l => l.id === leadId);
      if (found) {
        setSelectedLead(found);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, allLeads, selectedLead]);

  const { data: planos = [] } = useQuery({
    queryKey: ["planos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("planos").select("*").order("nome_plano");
      if (error) throw error;
      return data as Plano[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  const { data: cadencia = [] } = useQuery({
    queryKey: ["cadencia-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cadencia_tentativas")
        .select("*")
        .order("numero_tentativa", { ascending: true });
      if (error) throw error;
      return data as CadenciaTentativa[];
    },
  });

  const { data: fluxoConfig } = useQuery({
    queryKey: ["configuracao-fluxo-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracao_fluxo_leads")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { quantidade_tentativas: number; permitir_reiniciar_rotina: boolean } | null;
    },
  });

  const { data: objecoes = [] } = useQuery({
    queryKey: ["lead-objecoes-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_objecoes").select("*").eq("ativo", true).order("descricao");
      if (error) throw error;
      return data as { id: string; descricao: string; ativo: boolean }[];
    },
  });

  const { data: leadObjecaoRegistro, refetch: refetchObjecao } = useQuery({
    queryKey: ["lead-objecao-registro", selectedLead?.id],
    enabled: !!selectedLead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registro_objecao_lead")
        .select("*")
        .eq("lead_id", selectedLead!.id)
        .order("data_registro", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; objecao_id: string; lead_id: string } | null;
    },
  });

  // All lead contacts for queue building
  const activeLeadIds = allLeads.filter(l => ["novo", "em_contato", "interessado"].includes(l.status_lead)).map(l => l.id);

  const { data: allLeadContatos = [] } = useQuery({
    queryKey: ["all-lead-contatos", activeLeadIds],
    enabled: activeLeadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .in("lead_id", activeLeadIds);
      if (error) throw error;
      return data as LeadContato[];
    },
  });

  const { data: allLeadInteracoes = [] } = useQuery({
    queryKey: ["all-lead-interacoes", activeLeadIds],
    enabled: activeLeadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes")
        .select("id, lead_id, data_interacao")
        .in("lead_id", activeLeadIds)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data as { id: string; lead_id: string; data_interacao: string }[];
    },
  });

  // Build priority queue
  const priorityQueue = useMemo(() => {
    const activeLeads = allLeads.filter(l => ["novo", "em_contato", "interessado"].includes(l.status_lead));
    return activeLeads.map((lead) => {
      const interacoes = allLeadInteracoes.filter(i => i.lead_id === lead.id);
      const tentativaAtual = interacoes.length + 1;
      const ultimaInteracao = interacoes[0]?.data_interacao || null;

      let proximoContato: Date | null = null;
      if (ultimaInteracao && cadencia.length > 0) {
        const regra = cadencia.find(c => c.numero_tentativa === tentativaAtual) || cadencia[cadencia.length - 1];
        if (regra) {
          const base = addDays(new Date(ultimaInteracao), regra.dias_apos);
          base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0);
          proximoContato = base;
        }
      }

      return { lead, tentativaAtual, proximoContato, ultimaInteracao };
    }).sort((a, b) => {
      const now = Date.now();
      // Scheduled returns that have arrived get top priority
      const aScheduled = a.lead.agendamento_retorno ? new Date(a.lead.agendamento_retorno).getTime() : null;
      const bScheduled = b.lead.agendamento_retorno ? new Date(b.lead.agendamento_retorno).getTime() : null;
      const aReady = aScheduled && aScheduled <= now;
      const bReady = bScheduled && bScheduled <= now;
      if (aReady && !bReady) return -1;
      if (!aReady && bReady) return 1;
      if (aReady && bReady) return aScheduled! - bScheduled!;

      // Leads without interactions first (newest leads), then by next contact date
      if (!a.ultimaInteracao && b.ultimaInteracao) return -1;
      if (a.ultimaInteracao && !b.ultimaInteracao) return 1;
      if (!a.ultimaInteracao && !b.ultimaInteracao) return new Date(a.lead.created_at).getTime() - new Date(b.lead.created_at).getTime();
      // By next contact date ascending
      const aTime = a.proximoContato?.getTime() || Infinity;
      const bTime = b.proximoContato?.getTime() || Infinity;
      return aTime - bTime;
    });
  }, [allLeads, allLeadInteracoes, cadencia]);

  // Lead contatos (for selected lead)
  const { data: leadContatos = [], refetch: refetchContatos } = useQuery({
    queryKey: ["lead-contatos", selectedLead?.id],
    enabled: !!selectedLead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .eq("lead_id", selectedLead!.id);
      if (error) throw error;
      return data as LeadContato[];
    },
  });

  // Lead interações
  const { data: leadInteracoes = [], refetch: refetchInteracoes } = useQuery({
    queryKey: ["lead-interacoes", selectedLead?.id],
    enabled: !!selectedLead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes")
        .select("*")
        .eq("lead_id", selectedLead!.id)
        .order("data_interacao", { ascending: true });
      if (error) throw error;
      return data as LeadInteracao[];
    },
  });

  // Lead histórico
  const { data: leadHistorico = [], refetch: refetchHistorico } = useQuery({
    queryKey: ["lead-historico", selectedLead?.id],
    enabled: !!selectedLead,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_historico")
        .select("*")
        .eq("lead_id", selectedLead!.id)
        .order("data_evento", { ascending: true });
      if (error) throw error;
      return data as LeadHistorico[];
    },
  });

  // Merged timeline (historico + interacoes) in chronological order
  const timeline = useMemo(() => {
    const items: {
      id: string;
      date: string;
      type: "historico" | "interacao";
      evento?: string;
      descricao?: string | null;
      usuario_id?: string;
      colaborador_id?: string;
      tipo_contato?: string;
      numero_utilizado?: string | null;
      resultado?: string | null;
    }[] = [];

    leadHistorico.forEach(h => {
      items.push({
        id: h.id,
        date: h.data_evento,
        type: "historico",
        evento: h.tipo_evento,
        descricao: h.descricao,
        usuario_id: h.usuario_id,
      });
    });

    // Only add interacoes that aren't already represented in historico
    leadInteracoes.forEach(i => {
      // Check if there's a matching historico entry within 5 seconds
      const hasHistorico = leadHistorico.some(h =>
        h.tipo_evento === "tentativa_contato" &&
        Math.abs(new Date(h.data_evento).getTime() - new Date(i.data_interacao).getTime()) < 5000
      );
      if (!hasHistorico) {
        items.push({
          id: `inter-${i.id}`,
          date: i.data_interacao,
          type: "interacao",
          colaborador_id: i.colaborador_id,
          tipo_contato: i.tipo_contato,
          numero_utilizado: i.numero_utilizado,
          resultado: i.resultado,
        });
      }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return items;
  }, [leadHistorico, leadInteracoes]);

  // ─── Search ───────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const term = searchTerm.trim();
    if (!term) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const phoneDigits = normalizePhone(term);
      const { data: byName, error: e1 } = await supabase
        .from("leads").select("*").ilike("nome", `%${term}%`);
      if (e1) throw e1;

      let byPhoneLeadIds: string[] = [];
      if (phoneDigits.length >= 4) {
        const { data: leadConts, error: e2 } = await supabase
          .from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone");
        if (e2) throw e2;
        byPhoneLeadIds = (leadConts || [])
          .filter(c => normalizePhone(c.valor).includes(phoneDigits))
          .map(c => c.lead_id);

        const { data: clienteConts } = await supabase
          .from("cliente_contatos").select("cliente_id, valor, tipo").eq("tipo", "movel");
        const matchedClienteIds = (clienteConts || [])
          .filter(c => normalizePhone(c.valor).includes(phoneDigits))
          .map(c => c.cliente_id);

        if (matchedClienteIds.length > 0) {
          const { data: matchedClientes } = await supabase
            .from("clientes").select("id, nome, cpf").in("id", matchedClienteIds);
          if (matchedClientes && matchedClientes.length > 0) {
            const c = matchedClientes[0];
            setDupeAlert({
              type: "cliente_phone",
              message: `Este telefone já pertence ao cliente "${c.nome}" (CPF: ${c.cpf || "N/A"}).`,
              clienteId: c.id,
              clienteNome: c.nome,
            });
          }
        }
      }

      const allIds = new Set([...(byName || []).map(l => l.id), ...byPhoneLeadIds]);
      if (allIds.size === 0) { setSearchResults([]); setSearching(false); return; }

      const { data: leads, error: e3 } = await supabase
        .from("leads").select("*").in("id", Array.from(allIds));
      if (e3) throw e3;

      const { data: contatos } = await supabase
        .from("lead_contatos").select("*").in("lead_id", Array.from(allIds));

      const results = (leads || []).map(l => ({
        ...l,
        contatos: (contatos || []).filter(c => c.lead_id === l.id),
      }));
      setSearchResults(results as any);
    } catch (err: any) {
      toast.error("Erro na busca: " + err.message);
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  // ─── Auto-transfer on opening ──────────────────────
  const openLeadWithTransfer = useCallback(async (lead: Lead) => {
    if (!profile) return;
    if (lead.responsavel_id && lead.responsavel_id !== profile.id) {
      await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", lead.id);
      await supabase.from("lead_historico").insert({
        lead_id: lead.id, usuario_id: profile.id,
        tipo_evento: "transferencia_automatica",
        descricao: `Lead transferido automaticamente para ${profile.nome}`,
      });
      toast.info("Lead transferido automaticamente para você.");
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    } else if (!lead.responsavel_id) {
      await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", lead.id);
      await supabase.from("lead_historico").insert({
        lead_id: lead.id, usuario_id: profile.id,
        tipo_evento: "transferencia_automatica",
        descricao: `Lead atribuído automaticamente para ${profile.nome}`,
      });
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    }
    setSelectedLead({ ...lead, responsavel_id: profile.id });
    setSearchResults(null);
    setSearchTerm("");
  }, [profile, queryClient]);

  // ─── Create Lead ──────────────────────────────────
  const createLeadMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim() || !createPhone.trim()) throw new Error("Nome e telefone são obrigatórios.");
      if (!profile) throw new Error("Perfil não encontrado.");
      const phoneNorm = normalizePhone(createPhone);
      if (phoneNorm.length < 8) throw new Error("Telefone inválido.");

      const { data: existingLeadContatos } = await supabase
        .from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone");
      const matchedLeadContato = (existingLeadContatos || []).find(c => normalizePhone(c.valor) === phoneNorm);
      if (matchedLeadContato) {
        const { data: existingLead } = await supabase
          .from("leads").select("*").eq("id", matchedLeadContato.lead_id)
          .not("status_lead", "in", '("convertido","perdido","arquivado")').single();
        if (existingLead) {
          await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", existingLead.id);
          await supabase.from("lead_historico").insert({
            lead_id: existingLead.id, usuario_id: profile.id,
            tipo_evento: "transferencia_automatica",
            descricao: "Lead assumido automaticamente por telefone existente",
          });
          setShowCreate(false);
          setSelectedLead({ ...existingLead, responsavel_id: profile.id });
          queryClient.invalidateQueries({ queryKey: ["leads-list"] });
          throw new Error("__DUPLICATE_LEAD__");
        }
      }

      let linkedClienteId: string | null = null;
      let linkedClienteNome: string | null = null;
      const { data: existingClienteContatos } = await supabase
        .from("cliente_contatos").select("cliente_id, valor, tipo").in("tipo", ["movel", "fixo", "telefone"]);
      const matchedCliente = (existingClienteContatos || []).find(c => normalizePhone(c.valor) === phoneNorm);
      if (matchedCliente) {
        const { data: cliente } = await supabase
          .from("clientes").select("id, nome, cpf").eq("id", matchedCliente.cliente_id).single();
        if (cliente) { linkedClienteId = cliente.id; linkedClienteNome = cliente.nome; }
      }

      const leadNome = linkedClienteNome || createName.trim();
      const { data: newLead, error: e1 } = await supabase
        .from("leads").insert({ nome: leadNome, status_lead: "novo", responsavel_id: profile.id, cliente_id: linkedClienteId })
        .select().single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("lead_contatos").insert({
        lead_id: newLead.id, tipo_contato: "telefone", valor: createPhone.trim(), tem_whatsapp: createPhoneWhatsapp,
      });
      if (e2) throw e2;

      const descParts = [`Lead "${leadNome}" criado por ${profile.nome}`];
      if (linkedClienteNome) descParts.push(`— vinculado ao cliente existente "${linkedClienteNome}"`);
      await supabase.from("lead_historico").insert({
        lead_id: newLead.id, usuario_id: profile.id, tipo_evento: "criacao", descricao: descParts.join(" "),
      });

      if (linkedClienteNome) toast.info(`Cliente "${linkedClienteNome}" encontrado na base. Lead vinculado automaticamente.`);

      try {
        const { data: firstRotina } = await supabase
          .from("rotina_tentativas_leads").select("*").eq("tentativa_numero", 1).single();
        if (firstRotina) {
          const nextDate = new Date();
          const diasAdicionais = Math.max(firstRotina.dias_apos_anterior || 0, 1);
          nextDate.setDate(nextDate.getDate() + diasAdicionais);
          const periodoHora = firstRotina.periodo_contato === "manha" ? 9 : firstRotina.periodo_contato === "tarde" ? 14 : 19;
          nextDate.setHours(periodoHora, 0, 0, 0);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: newLead.id, tentativa: 1, data_contato: nextDate.toISOString(),
            periodo: firstRotina.periodo_contato, status: "pendente", responsavel_id: profile.id,
          });
        }
      } catch { /* ignore */ }

      return newLead;
    },
    onSuccess: (newLead) => {
      toast.success("Lead criado com sucesso!");
      setShowCreate(false); setCreateName(""); setCreatePhone(""); setCreatePhoneWhatsapp(false);
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      setSelectedLead(newLead);
    },
    onError: (err: any) => {
      if (err.message === "__DUPLICATE_LEAD__") { toast.info("Lead existente aberto automaticamente."); return; }
      if (err.message === "__DUPLICATE_CLIENTE__") return;
      toast.error(err.message);
    },
  });

  // ─── Add contact ──────────────────────────────────
  const addContactMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !profile) throw new Error("Erro interno.");
      if (!newPhoneValue.trim()) throw new Error("Informe o valor do contato.");
      if (newPhoneTipo === "telefone") {
        const digits = normalizePhone(newPhoneValue);
        if (!isValidPhone(digits)) throw new Error("Número de telefone inválido.");
        const { data: allLeadPhones } = await supabase
          .from("lead_contatos").select("id, lead_id, valor").eq("tipo_contato", "telefone");
        const foundInLeads = (allLeadPhones || []).find((c: any) => normalizePhone(c.valor) === digits);
        if (foundInLeads) {
          throw new Error(foundInLeads.lead_id === selectedLead.id ? "Este número já está cadastrado neste lead." : "Este número já está cadastrado em outro lead.");
        }
        const { data: allClientePhones } = await supabase
          .from("cliente_contatos").select("id, valor").in("tipo", ["movel", "fixo", "telefone"]);
        if ((allClientePhones || []).find((c: any) => normalizePhone(c.valor) === digits)) {
          throw new Error("Este número já está cadastrado em um cliente existente.");
        }
      }
      const { error } = await supabase.from("lead_contatos").insert({
        lead_id: selectedLead.id, tipo_contato: newPhoneTipo, valor: newPhoneValue.trim(), tem_whatsapp: newPhoneWhatsapp,
      });
      if (error) throw error;
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "contato_adicionado", descricao: `Contato adicionado: ${newPhoneValue.trim()} (${newPhoneTipo})`,
      });
    },
    onSuccess: () => {
      toast.success("Contato adicionado!"); setShowAddPhone(false); setNewPhoneValue(""); setNewPhoneWhatsapp(false);
      refetchContatos(); refetchHistorico();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeContact = async (contato: LeadContato) => {
    if (!selectedLead || !profile) return;

    // Prevent removing the last phone contact
    if (contato.tipo_contato === "telefone") {
      const phoneContacts = (leadContatos || []).filter((c: LeadContato) => c.tipo_contato === "telefone");
      if (phoneContacts.length <= 1) {
        toast.error("O lead deve ter pelo menos um contato telefônico.");
        return;
      }
    }

    const { error } = await supabase.from("lead_contatos").delete().eq("id", contato.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("lead_historico").insert({
      lead_id: selectedLead.id, usuario_id: profile.id,
      tipo_evento: "contato_removido", descricao: `Contato removido: ${contato.valor} (${contato.tipo_contato})`,
    });
    toast.success("Contato removido."); refetchContatos(); refetchHistorico();
  };

  // ─── Register interaction ─────────────────────────
  const interactionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !profile) throw new Error("Erro interno.");
      const { error } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedLead.id, colaborador_id: profile.id,
        tipo_contato: interTipo, numero_utilizado: interNumero.trim() || null, resultado: interResultado.trim() || null,
      });
      if (error) throw error;

      const tentativaNum = leadInteracoes.length + 1;
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "tentativa_contato",
        descricao: `Tentativa #${tentativaNum} via ${interTipo}${interResultado ? ": " + interResultado.trim() : ""}`,
      });

      if (selectedLead.status_lead === "novo") {
        await supabase.from("leads").update({ status_lead: "em_contato" }).eq("id", selectedLead.id);
        setSelectedLead(prev => prev ? { ...prev, status_lead: "em_contato" } : null);
      }
      // Touch updated_at to push to end of queue
      await supabase.from("leads").update({ status_lead: selectedLead.status_lead === "novo" ? "em_contato" : selectedLead.status_lead }).eq("id", selectedLead.id);
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    },
    onSuccess: () => {
      toast.success("Interação registrada! Lead movido para o final da fila.");
      setShowInteraction(false); setInterNumero(""); setInterResultado("");
      refetchInteracoes(); refetchHistorico();
      queryClient.invalidateQueries({ queryKey: ["all-lead-interacoes"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Update lead status ──────────────────────────
  const updateStatus = async (newStatus: string) => {
    if (!selectedLead || !profile) return;
    const { error } = await supabase.from("leads").update({ status_lead: newStatus }).eq("id", selectedLead.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("lead_historico").insert({
      lead_id: selectedLead.id, usuario_id: profile.id,
      tipo_evento: "alteracao_status",
      descricao: `Status alterado para: ${STATUS_OPTIONS.find(s => s.value === newStatus)?.label || newStatus}`,
    });
    setSelectedLead(prev => prev ? { ...prev, status_lead: newStatus } : null);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] }); refetchHistorico();
    toast.success("Status atualizado.");
  };

  const updatePlano = async (planoId: string) => {
    if (!selectedLead) return;
    const val = planoId === "none" ? null : planoId;
    await supabase.from("leads").update({ plano_id: val }).eq("id", selectedLead.id);
    setSelectedLead(prev => prev ? { ...prev, plano_id: val } : null);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  };

  const updateRepetidor = async (value: string) => {
    if (!selectedLead) return;
    const val = value === "none" ? null : value;
    await supabase.from("leads").update({ repetidor: val } as any).eq("id", selectedLead.id);
    setSelectedLead(prev => prev ? { ...prev, repetidor: val } : null);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  };

  const openConversion = () => {
    if (!selectedLead) return;
    setConvForm({ nome: selectedLead.nome, cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "" });
    setShowConvert(true);
  };

  // ─── Convert Lead → Client ────────────────────────
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !profile) throw new Error("Erro interno.");
      const f = convForm;
      if (!f.nome.trim()) throw new Error("Nome é obrigatório.");
      if (!f.cpf.trim()) throw new Error("CPF é obrigatório.");
      if (!f.rg.trim()) throw new Error("RG é obrigatório.");
      if (!f.nome_mae.trim()) throw new Error("Nome da mãe é obrigatório.");
      if (!f.endereco.trim()) throw new Error("Endereço é obrigatório.");
      if (!f.numero.trim()) throw new Error("Número é obrigatório.");
      if (!f.cep.trim()) throw new Error("CEP é obrigatório.");
      if (!f.cidade.trim()) throw new Error("Cidade é obrigatória.");
      if (!f.referencia.trim()) throw new Error("Referência é obrigatória.");

      const phoneContatos = leadContatos.filter(c => c.tipo_contato === "telefone");
      const phoneDigitsArr = phoneContatos.map(c => normalizePhone(c.valor));

      if (phoneDigitsArr.length > 0) {
        const { data: allClientePhones } = await supabase
          .from("cliente_contatos").select("id, cliente_id, valor").in("tipo", ["movel", "fixo", "telefone"]);
        for (const digits of phoneDigitsArr) {
          const matchedClienteContato = (allClientePhones || []).find((c: any) => normalizePhone(c.valor) === digits);
          if (matchedClienteContato) {
            const { data: existingCliente } = await supabase
              .from("clientes").select("id, nome, cpf").eq("id", matchedClienteContato.cliente_id).maybeSingle();
            if (existingCliente) {
              await supabase.from("leads").update({ status_lead: "convertido", cliente_id: existingCliente.id }).eq("id", selectedLead.id);
              await supabase.from("lead_historico").insert({
                lead_id: selectedLead.id, usuario_id: profile.id,
                tipo_evento: "vinculo_cliente_existente",
                descricao: `Lead vinculado ao cliente existente "${existingCliente.nome}" (telefone já cadastrado)`,
              });
              setDupeAlert({ type: "cpf", message: `Telefone já cadastrado para o cliente "${existingCliente.nome}". O lead foi vinculado ao cliente existente.`, clienteId: existingCliente.id, clienteNome: existingCliente.nome });
              setShowConvert(false);
              setSelectedLead(prev => prev ? { ...prev, status_lead: "convertido" } : null);
              queryClient.invalidateQueries({ queryKey: ["leads-list"] }); refetchHistorico();
              throw new Error("__DUPLICATE_CPF__");
            }
          }
        }
      }

      const cpfNorm = f.cpf.trim().replace(/\D/g, "");
      if (cpfNorm.length >= 11) {
        const { data: existingCliente } = await supabase
          .from("clientes").select("id, nome, cpf").eq("cpf", f.cpf.trim()).maybeSingle();
        if (existingCliente) {
          await supabase.from("leads").update({ status_lead: "convertido", cliente_id: existingCliente.id }).eq("id", selectedLead.id);
          await supabase.from("lead_historico").insert({
            lead_id: selectedLead.id, usuario_id: profile.id,
            tipo_evento: "vinculo_cliente_existente",
            descricao: `Lead vinculado ao cliente existente "${existingCliente.nome}" (CPF: ${existingCliente.cpf})`,
          });
          setDupeAlert({ type: "cpf", message: `CPF já cadastrado para o cliente "${existingCliente.nome}". O lead foi vinculado ao cliente existente.`, clienteId: existingCliente.id, clienteNome: existingCliente.nome });
          setShowConvert(false);
          setSelectedLead(prev => prev ? { ...prev, status_lead: "convertido" } : null);
          queryClient.invalidateQueries({ queryKey: ["leads-list"] }); refetchHistorico();
          throw new Error("__DUPLICATE_CPF__");
        }
      }

      const { data: newCliente, error: e1 } = await supabase.from("clientes").insert({
        nome: f.nome.trim(), cpf: f.cpf.trim(), rg: f.rg.trim(), nome_mae: f.nome_mae.trim(),
        endereco: f.endereco.trim(), numero: f.numero.trim(), cep: f.cep.trim(), cidade: f.cidade.trim(), referencia: f.referencia.trim(),
      }).select("id").single();
      if (e1) throw e1;

      const leadPhoneContatos = leadContatos.filter(c => c.tipo_contato === "telefone");
      if (leadPhoneContatos.length > 0) {
        const { data: existingClientePhones } = await supabase
          .from("cliente_contatos").select("valor").eq("cliente_id", newCliente.id);
        const existingNorms = new Set((existingClientePhones || []).map((c: any) => normalizePhone(c.valor)));
        const newInserts = leadPhoneContatos
          .filter(c => !existingNorms.has(normalizePhone(c.valor)))
          .map(c => ({ cliente_id: newCliente.id, tipo: "movel" as const, valor: c.valor, tem_whatsapp: c.tem_whatsapp }));
        if (newInserts.length > 0) await supabase.from("cliente_contatos").insert(newInserts);
      }

      await supabase.from("leads").update({ status_lead: "convertido", cliente_id: newCliente.id }).eq("id", selectedLead.id);

      const { data: tipoVenda } = await supabase
        .from("tipos_servico").select("id").or("nome.ilike.%venda%,nome.ilike.%instalac%").limit(1).single();
      const { data: newOS, error: osErr } = await supabase.from("ordens_servico").insert({
        cliente_id: newCliente.id, cliente_nome: f.nome.trim(), cliente_cpf: f.cpf.trim(),
        tipo_servico_id: tipoVenda?.id || null, numero_os: null, status: "aguardando_numero" as any,
      } as any).select("id, numero_os").single();
      if (osErr) console.warn("Erro ao criar OS automática:", osErr.message);

      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id, tipo_evento: "conversao_cliente",
        descricao: `Lead convertido em cliente: ${f.nome.trim()} (CPF: ${f.cpf.trim()})${newOS ? ". OS criada aguardando número." : ""}`,
      });
      return newCliente;
    },
    onSuccess: () => {
      toast.success("Lead convertido em cliente com sucesso!");
      setShowConvert(false); setSelectedLead(prev => prev ? { ...prev, status_lead: "convertido" } : null);
      queryClient.invalidateQueries({ queryKey: ["leads-list"] }); refetchHistorico();
    },
    onError: (err: any) => {
      if (err.message === "__DUPLICATE_CPF__") { toast.info("Lead vinculado ao cliente existente."); return; }
      toast.error(err.message);
    },
  });

  // Helper: get profile name
  const getProfileName = (id: string | null | undefined) => {
    if (!id) return "Sistema";
    return profiles.find(p => p.id === id)?.nome || "—";
  };

  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
    catch { return d; }
  };

  const fmtDateShort = (d: Date | null) => {
    if (!d) return "Agora";
    try { return format(d, "dd/MM HH:mm", { locale: ptBR }); }
    catch { return "—"; }
  };

  // Selected lead queue info
  const selectedQueueInfo = useMemo(() => {
    if (!selectedLead) return null;
    return priorityQueue.find(q => q.lead.id === selectedLead.id) || null;
  }, [selectedLead, priorityQueue]);

  // Phone options for interaction dialog
  const phoneOptions = leadContatos.filter(c => c.tipo_contato === "telefone");

  // Check if all cadencia attempts are exhausted
  const maxTentativas = fluxoConfig?.quantidade_tentativas || cadencia.length || 7;
  const allAttemptsExhausted = selectedQueueInfo ? selectedQueueInfo.tentativaAtual > maxTentativas : false;

  // Handle finalize action (after all attempts)
  const handleFinalizeAction = async (action: "reiniciar" | "arquivar") => {
    if (!selectedLead || !profile) return;
    if (action === "reiniciar") {
      // Reset lead back to em_contato and log
      await supabase.from("leads").update({ status_lead: "em_contato" }).eq("id", selectedLead.id);
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "rotina_reiniciada",
        descricao: `Rotina de tentativas reiniciada por ${profile.nome}. Lead retorna à fila.`,
      });
      // Create first tarefa again
      try {
        const { data: firstRotina } = await supabase
          .from("rotina_tentativas_leads").select("*").eq("tentativa_numero", 1).single();
        if (firstRotina) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + Math.max(firstRotina.dias_apos_anterior || 0, 1));
          const periodoHora = firstRotina.periodo_contato === "manha" ? 9 : firstRotina.periodo_contato === "tarde" ? 14 : 19;
          nextDate.setHours(periodoHora, 0, 0, 0);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: selectedLead.id, tentativa: 1, data_contato: nextDate.toISOString(),
            periodo: firstRotina.periodo_contato, status: "pendente", responsavel_id: profile.id,
          });
        }
      } catch { /* ignore */ }
      setSelectedLead(prev => prev ? { ...prev, status_lead: "em_contato" } : null);
      toast.success("Rotina reiniciada! Lead voltou para a fila.");
    } else {
      // Archive lead
      await supabase.from("leads").update({ status_lead: "perdido" }).eq("id", selectedLead.id);
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "lead_arquivado",
        descricao: `Lead arquivado por ${profile.nome} após ${maxTentativas} tentativas sem sucesso.`,
      });
      setSelectedLead(prev => prev ? { ...prev, status_lead: "perdido" } : null);
      toast.success("Lead arquivado como perdido.");
    }
    setShowFinalize(false);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    queryClient.invalidateQueries({ queryKey: ["all-lead-interacoes"] });
    refetchHistorico();
  };

  // ─── Render ───────────────────────────────────────
  return (
    <div className="p-3 md:p-4 space-y-3 h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Gestão de Leads</h1>
          <Badge variant="secondary" className="text-xs">{priorityQueue.length} na fila</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar telefone ou nome..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="pl-8 h-8 text-sm"
            />
            {/* Search dropdown */}
            {searchResults !== null && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">
                    Nenhum encontrado.{" "}
                    <button onClick={() => { setShowCreate(true); setSearchResults(null); }} className="text-primary underline">Criar?</button>
                  </div>
                ) : (
                  searchResults.map(lead => (
                    <button
                      key={lead.id}
                      onClick={() => openLeadWithTransfer(lead)}
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors flex items-center justify-between border-b last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{lead.nome}</p>
                        <p className="text-xs text-muted-foreground">{lead.contatos.map(c => c.valor).join(", ")}</p>
                      </div>
                      {statusBadge(lead.status_lead)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button onClick={handleSearch} disabled={searching} size="sm" variant="outline" className="h-8">
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
          </Button>
          <Button onClick={() => setShowCreate(true)} size="sm" className="h-8 press-effect">
            <Plus className="w-3.5 h-3.5 mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-12 gap-3" style={{ height: "calc(100% - 3.5rem)" }}>

        {/* ─── LEFT: Priority Queue ──────────────── */}
        <div className="col-span-3 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-2.5 px-3 border-b">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                <ListOrdered className="w-3.5 h-3.5" /> Fila de Prioridade
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {loadingLeads ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Carregando...</div>
                ) : priorityQueue.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Nenhum lead na fila</div>
                ) : (
                  priorityQueue.map((item, idx) => {
                    const contatos = allLeadContatos.filter(c => c.lead_id === item.lead.id && c.tipo_contato === "telefone");
                    const isSelected = selectedLead?.id === item.lead.id;
                    const isOverdue = item.proximoContato && item.proximoContato < new Date();
                    const hasSchedule = !!item.lead.agendamento_retorno;
                    const scheduleReady = hasSchedule && new Date(item.lead.agendamento_retorno!) <= new Date();

                    return (
                      <button
                        key={item.lead.id}
                        onClick={() => openLeadWithTransfer(item.lead)}
                        className={`w-full text-left px-3 py-2.5 transition-colors relative ${
                          isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/50 border-l-2 border-l-transparent"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                              <span className="text-sm font-medium truncate">{item.lead.nome}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 ml-5">
                              {contatos.length > 0 ? (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" /> {contatos[0].valor}
                                  {contatos[0].tem_whatsapp && <MessageSquare className="w-2.5 h-2.5 text-green-600" />}
                                </span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">Sem telefone</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            {statusBadge(item.lead.status_lead)}
                            <span className="text-[10px] text-muted-foreground">
                              {item.tentativaAtual}ª tent.
                            </span>
                          </div>
                        </div>
                        <div className="ml-5 mt-1 flex items-center gap-1">
                          {hasSchedule ? (
                            <>
                              <CalendarClock className={`w-2.5 h-2.5 ${scheduleReady ? "text-primary" : "text-muted-foreground"}`} />
                              <span className={`text-[10px] ${scheduleReady ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                                {scheduleReady ? "⬆ Retorno agora" : `Retorno: ${fmtDateShort(new Date(item.lead.agendamento_retorno!))}`}
                              </span>
                            </>
                          ) : (
                            <>
                              <Clock className={`w-2.5 h-2.5 ${isOverdue ? "text-destructive" : "text-muted-foreground"}`} />
                              <span className={`text-[10px] ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {item.proximoContato ? fmtDateShort(item.proximoContato) : "Sem agendamento"}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* ─── CENTER: Timeline / History ─────────── */}
        <div className="col-span-5 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-2.5 px-3 border-b">
              <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                <History className="w-3.5 h-3.5" />
                {selectedLead ? `Histórico — ${selectedLead.nome}` : "Selecione um lead"}
              </CardTitle>
            </CardHeader>
            {!selectedLead ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                <div className="text-center space-y-2">
                  <Users className="w-10 h-10 mx-auto text-muted-foreground/30" />
                  <p>Selecione um lead na fila para ver o histórico completo</p>
                </div>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-0">
                  {timeline.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">Nenhum registro no histórico</div>
                  ) : (
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-4 top-3 bottom-3 w-px bg-border" />

                      {timeline.map((item, idx) => {
                        const IconComp = item.type === "historico"
                          ? (EVENTO_ICONS[item.evento || ""] || Clock)
                          : PhoneCall;
                        const isInteracao = item.type === "interacao" || item.evento === "tentativa_contato";
                        const isTransfer = item.evento === "transferencia_automatica";
                        const isCriacao = item.evento === "criacao";
                        const isConversao = item.evento === "conversao_cliente";

                        // Determine attempt number from description
                        let attemptNum: string | null = null;
                        if (item.descricao) {
                          const match = item.descricao.match(/Tentativa #(\d+)/i) || item.descricao.match(/Tentativa (\d+)/i);
                          if (match) attemptNum = match[1];
                        }

                        return (
                          <div key={item.id} className="relative pl-10 pb-4 last:pb-0">
                            {/* Icon node */}
                            <div className={`absolute left-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background ${
                              isCriacao ? "bg-blue-500" :
                              isConversao ? "bg-green-500" :
                              isTransfer ? "bg-amber-500" :
                              isInteracao ? "bg-primary" :
                              "bg-muted-foreground/30"
                            }`}>
                              <IconComp className="w-2.5 h-2.5 text-white" />
                            </div>

                            <div className={`rounded-lg p-2.5 border ${
                              isInteracao ? "bg-primary/5 border-primary/20" :
                              isTransfer ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                              isCriacao ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
                              isConversao ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                              "bg-card border-border"
                            }`}>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {item.type === "historico"
                                      ? (EVENTO_LABELS[item.evento || ""] || item.evento)
                                      : `${item.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}`}
                                  </Badge>
                                  {attemptNum && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-primary/20 text-primary border-0">
                                      #{attemptNum}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(item.date)}</span>
                              </div>

                              {/* Content */}
                              {item.type === "historico" && item.descricao && (
                                <p className="text-sm mt-1.5 text-foreground/80">{item.descricao}</p>
                              )}
                              {item.type === "interacao" && (
                                <div className="mt-1.5 space-y-0.5">
                                  {item.numero_utilizado && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Phone className="w-2.5 h-2.5" /> {item.numero_utilizado}
                                    </p>
                                  )}
                                  {item.resultado && (
                                    <p className="text-sm text-foreground/80">{item.resultado}</p>
                                  )}
                                </div>
                              )}

                              {/* Author */}
                              <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                {getProfileName(item.usuario_id || item.colaborador_id)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </Card>
        </div>

        {/* ─── RIGHT: Actions & Follow-up ────────── */}
        <div className="col-span-4 flex flex-col min-h-0 gap-3">
          {!selectedLead ? (
            <Card className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center space-y-2">
                <PhoneCall className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p>Selecione um lead para ver ações</p>
              </div>
            </Card>
          ) : (
            <>
              {/* Lead Info Card */}
              <Card>
                <CardHeader className="py-2.5 px-3 border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{selectedLead.nome}</CardTitle>
                    {statusBadge(selectedLead.status_lead)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Responsável: {getProfileName(selectedLead.responsavel_id)} · Criado em {fmtDate(selectedLead.data_criacao)}
                  </p>
                  {selectedQueueInfo && (
                    <p className="text-[11px] text-muted-foreground">
                      Tentativa atual: <span className="font-semibold">{selectedQueueInfo.tentativaAtual}ª</span>
                      {selectedQueueInfo.proximoContato && (
                        <> · Próximo contato: <span className={`font-semibold ${selectedQueueInfo.proximoContato < new Date() ? "text-destructive" : ""}`}>
                          {fmtDateShort(selectedQueueInfo.proximoContato)}
                        </span></>
                      )}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-3 space-y-3">
                  {/* Status & Objeção */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
                      <Select value={selectedLead.status_lead} onValueChange={updateStatus}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Objeção</Label>
                      <Select
                        value={leadObjecaoRegistro?.objecao_id || "none"}
                        onValueChange={async (val) => {
                          if (!selectedLead || !profile) return;
                          if (val === "none") return;
                          await supabase.from("registro_objecao_lead").insert({
                            lead_id: selectedLead.id,
                            objecao_id: val,
                            colaborador_id: profile.id,
                          });
                          await supabase.from("lead_historico").insert({
                            lead_id: selectedLead.id, usuario_id: profile.id,
                            tipo_evento: "objecao_registrada",
                            descricao: `Objeção registrada: ${objecoes.find(o => o.id === val)?.descricao || val}`,
                          });
                          refetchObjecao(); refetchHistorico();
                          toast.success("Objeção registrada.");
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {objecoes.map(o => <SelectItem key={o.id} value={o.id}>{o.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* Perfil & Repetidor */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Perfil</Label>
                      <Select value={selectedLead.plano_id || "none"} onValueChange={updatePlano}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {planos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome_plano}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Repetidor</Label>
                      <Select value={selectedLead.repetidor || "none"} onValueChange={updateRepetidor}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          <SelectItem value="fast">Fast</SelectItem>
                          <SelectItem value="dual">Dual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contacts Card */}
              <Card>
                <CardHeader className="py-2 px-3 border-b flex-row items-center justify-between">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                    <Phone className="w-3 h-3" /> Contatos
                  </CardTitle>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setShowAddPhone(true)}>
                    <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                  </Button>
                </CardHeader>
                <CardContent className="p-2">
                  {leadContatos.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhum contato</p>
                  ) : (
                    <div className="space-y-1">
                      {leadContatos.map(c => (
                        <div key={c.id} className="flex items-center justify-between p-2 rounded-md bg-muted/30 border">
                          <div className="flex items-center gap-1.5">
                            {c.tipo_contato === "telefone" ? <Phone className="w-3 h-3 text-muted-foreground" /> : <MessageSquare className="w-3 h-3 text-muted-foreground" />}
                            <span className="text-xs">{c.valor}</span>
                            {c.tem_whatsapp && <Badge variant="outline" className="text-[9px] px-1 py-0">WA</Badge>}
                          </div>
                          {isAdmin && (
                            <button onClick={() => removeContact(c)} className="text-destructive/60 hover:text-destructive transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions Card */}
              <Card className="flex-1">
                <CardHeader className="py-2 px-3 border-b">
                  <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                    <Send className="w-3 h-3" /> Ações
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  <Button size="sm" className="w-full press-effect" onClick={() => setShowInteraction(true)}>
                    <PhoneCall className="w-4 h-4 mr-1.5" /> Registrar {selectedQueueInfo?.tentativaAtual || 1}ª Tentativa
                  </Button>
                  <Button size="sm" variant="outline" className="w-full press-effect" onClick={() => {
                    setScheduleDate(undefined);
                    setScheduleHour("09");
                    setScheduleMinute("00");
                    setShowSchedule(true);
                  }}>
                    <CalendarClock className="w-4 h-4 mr-1.5" /> Agendar Retorno
                  </Button>
                  {selectedLead.agendamento_retorno && (
                    <div className="p-2 rounded-md bg-muted/50 border text-xs flex items-center gap-1.5">
                      <CalendarClock className="w-3 h-3 text-primary" />
                      <span>Retorno agendado: <span className="font-semibold">{fmtDate(selectedLead.agendamento_retorno)}</span></span>
                      <button
                        className="ml-auto text-destructive/60 hover:text-destructive text-[10px] underline"
                        onClick={async () => {
                          await supabase.from("leads").update({ agendamento_retorno: null } as any).eq("id", selectedLead.id);
                          if (profile) {
                            await supabase.from("lead_historico").insert({
                              lead_id: selectedLead.id,
                              usuario_id: profile.id,
                              tipo_evento: "agendamento_removido",
                              descricao: `Agendamento de retorno removido manualmente`,
                            });
                          }
                          setSelectedLead(prev => prev ? { ...prev, agendamento_retorno: null } : null);
                          queryClient.invalidateQueries({ queryKey: ["leads-list"] });
                          toast.success("Agendamento removido.");
                        }}
                      >Remover</button>
                    </div>
                  )}
                  {selectedLead.status_lead !== "convertido" ? (
                    <Button size="sm" variant="secondary" className="w-full press-effect" onClick={openConversion}>
                      <UserPlus className="w-4 h-4 mr-1.5" /> Converter em Cliente
                    </Button>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 w-full justify-center py-1.5">
                      ✓ Convertido em Cliente
                    </Badge>
                  )}
                  {allAttemptsExhausted && selectedLead.status_lead !== "perdido" && selectedLead.status_lead !== "convertido" && (
                    <div className="space-y-2">
                      <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-amber-800 dark:text-amber-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Todas as {maxTentativas} tentativas foram realizadas.
                        </p>
                      </div>
                      <Button
                        size="sm" variant="outline"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => setShowFinalize(true)}
                      >
                        Finalizar Tentativas
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ─── Dialogs ──────────────────────────────── */}

      {/* Schedule Return Dialog */}
      <Dialog open={showSchedule} onOpenChange={setShowSchedule}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="w-5 h-5" /> Agendar Retorno — {selectedLead?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Data do Retorno</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduleDate && "text-muted-foreground")}>
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {scheduleDate ? format(scheduleDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Horário</Label>
              <div className="flex items-center gap-2">
                <Select value={scheduleHour} onValueChange={setScheduleHour}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 15 }, (_, i) => i + 7).map(h => (
                      <SelectItem key={h} value={String(h).padStart(2, "0")}>{String(h).padStart(2, "0")}h</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground font-bold">:</span>
                <Select value={scheduleMinute} onValueChange={setScheduleMinute}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["00", "15", "30", "45"].map(m => (
                      <SelectItem key={m} value={m}>{m}min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSchedule(false)}>Cancelar</Button>
            <Button
              disabled={!scheduleDate}
              onClick={async () => {
                if (!scheduleDate || !selectedLead || !profile) return;
                const dt = setMinutes(setHours(scheduleDate, parseInt(scheduleHour)), parseInt(scheduleMinute));
                const { error } = await supabase.from("leads").update({ agendamento_retorno: dt.toISOString() } as any).eq("id", selectedLead.id);
                if (error) { toast.error(error.message); return; }
                await supabase.from("lead_historico").insert({
                  lead_id: selectedLead.id, usuario_id: profile.id,
                  tipo_evento: "agendamento_retorno",
                  descricao: `Retorno agendado para ${format(dt, "dd/MM/yyyy HH:mm", { locale: ptBR })}`,
                });
                setSelectedLead(prev => prev ? { ...prev, agendamento_retorno: dt.toISOString() } : null);
                queryClient.invalidateQueries({ queryKey: ["leads-list"] });
                refetchHistorico();
                setShowSchedule(false);
                toast.success(`Retorno agendado para ${format(dt, "dd/MM/yyyy HH:mm", { locale: ptBR })}`);
              }}
              className="press-effect"
            >
              <CalendarClock className="w-4 h-4 mr-1.5" /> Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input placeholder="(00) 00000-0000" value={createPhone} onChange={e => setCreatePhone(applyPhoneMask(e.target.value))} />
              {normalizePhone(createPhone).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tipo: {getPhoneTypeLabel(normalizePhone(createPhone))}
                  {!isValidPhone(normalizePhone(createPhone)) && normalizePhone(createPhone).length >= 8 && (
                    <span className="text-destructive ml-2">— formato inválido</span>
                  )}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={createPhoneWhatsapp} onCheckedChange={setCreatePhoneWhatsapp} />
              <Label className="text-sm">Tem WhatsApp</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input placeholder="Nome do lead" value={createName} onChange={e => setCreateName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => createLeadMutation.mutate()} disabled={createLeadMutation.isPending || !createName.trim() || !createPhone.trim()} className="press-effect">
              {createLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={showAddPhone} onOpenChange={setShowAddPhone}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar Contato</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={newPhoneTipo} onValueChange={setNewPhoneTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input
                placeholder={newPhoneTipo === "telefone" ? "(00) 00000-0000" : "email@exemplo.com"}
                value={newPhoneValue}
                onChange={e => setNewPhoneValue(newPhoneTipo === "telefone" ? applyPhoneMask(e.target.value) : e.target.value)}
              />
            </div>
            {newPhoneTipo === "telefone" && (
              <div className="flex items-center gap-2">
                <Switch checked={newPhoneWhatsapp} onCheckedChange={setNewPhoneWhatsapp} />
                <Label className="text-sm">Tem WhatsApp</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPhone(false)}>Cancelar</Button>
            <Button onClick={() => addContactMutation.mutate()} disabled={addContactMutation.isPending || !newPhoneValue.trim()} className="press-effect">Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Interaction Dialog */}
      <Dialog open={showInteraction} onOpenChange={setShowInteraction}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar {selectedQueueInfo?.tentativaAtual || 1}ª Tentativa — {selectedLead?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedQueueInfo && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Tentativa: <Badge variant="secondary">{selectedQueueInfo.tentativaAtual}ª</Badge>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Tipo de Contato</Label>
              <Select value={interTipo} onValueChange={setInterTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone"><span className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> Telefone</span></SelectItem>
                  <SelectItem value="whatsapp"><span className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número Utilizado *</Label>
              <Select value={interNumero} onValueChange={setInterNumero}>
                <SelectTrigger><SelectValue placeholder="Selecione o número..." /></SelectTrigger>
                <SelectContent>
                  {phoneOptions.map(c => (
                    <SelectItem key={c.id} value={c.valor}>{c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}</SelectItem>
                  ))}
                  {phoneOptions.length === 0 && <SelectItem value="__none" disabled>Nenhum telefone</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Textarea placeholder="Descreva o resultado..." value={interResultado} onChange={e => setInterResultado(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInteraction(false)}>Cancelar</Button>
            <Button onClick={() => interactionMutation.mutate()} disabled={interactionMutation.isPending || !interNumero} className="press-effect">
              {interactionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PhoneCall className="w-4 h-4 mr-1" />}
              Registrar {selectedQueueInfo?.tentativaAtual || 1}ª Tentativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversion Dialog */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> Converter Lead em Cliente</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Todos os campos são obrigatórios para conversão.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nome *</Label><Input value={convForm.nome} onChange={e => setConvForm(f => ({ ...f, nome: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">CPF *</Label><Input placeholder="000.000.000-00" value={convForm.cpf} onChange={e => setConvForm(f => ({ ...f, cpf: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">RG *</Label><Input value={convForm.rg} onChange={e => setConvForm(f => ({ ...f, rg: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Nome da Mãe *</Label><Input value={convForm.nome_mae} onChange={e => setConvForm(f => ({ ...f, nome_mae: e.target.value }))} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Endereço *</Label><Input value={convForm.endereco} onChange={e => setConvForm(f => ({ ...f, endereco: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Número *</Label><Input value={convForm.numero} onChange={e => setConvForm(f => ({ ...f, numero: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">CEP *</Label><Input placeholder="00000-000" value={convForm.cep} onChange={e => setConvForm(f => ({ ...f, cep: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cidade *</Label><Input value={convForm.cidade} onChange={e => setConvForm(f => ({ ...f, cidade: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Referência *</Label><Input value={convForm.referencia} onChange={e => setConvForm(f => ({ ...f, referencia: e.target.value }))} /></div>
              </div>
              {leadContatos.filter(c => c.tipo_contato === "telefone").length > 0 && (
                <div className="p-3 rounded-md border bg-muted/30">
                  <p className="text-xs font-medium mb-1">Contatos que serão copiados:</p>
                  {leadContatos.filter(c => c.tipo_contato === "telefone").map(c => (
                    <p key={c.id} className="text-xs text-muted-foreground">📞 {c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}</p>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvert(false)}>Cancelar</Button>
            <Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending} className="press-effect">
              {convertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />} Converter em Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Finalize Dialog (all attempts exhausted) */}
      <Dialog open={showFinalize} onOpenChange={setShowFinalize}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Tentativas Finalizadas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Todas as <span className="font-semibold">{maxTentativas}</span> tentativas de contato com{" "}
              <span className="font-semibold">{selectedLead?.nome}</span> foram realizadas sem sucesso.
            </p>
            <p className="text-sm text-muted-foreground">
              O que deseja fazer com este lead?
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowFinalize(false)}>Cancelar</Button>
            {fluxoConfig?.permitir_reiniciar_rotina !== false && (
              <Button
                variant="secondary"
                onClick={() => handleFinalizeAction("reiniciar")}
                className="press-effect"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Voltar para Fila
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => handleFinalizeAction("arquivar")}
              className="press-effect"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Arquivar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Alert Dialog */}
      <Dialog open={!!dupeAlert} onOpenChange={o => !o && setDupeAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> Registro Duplicado Detectado
            </DialogTitle>
          </DialogHeader>
          <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Este registro já existe no sistema</AlertTitle>
            <AlertDescription className="text-sm">{dupeAlert?.message}</AlertDescription>
          </Alert>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDupeAlert(null)}>Cancelar</Button>
            {dupeAlert?.type === "lead_phone" && dupeAlert.leadId && (
              <Button onClick={() => { const lead = allLeads.find(l => l.id === dupeAlert.leadId); if (lead) openLeadWithTransfer(lead); setDupeAlert(null); setShowCreate(false); }} className="press-effect">Assumir Lead Existente</Button>
            )}
            {(dupeAlert?.type === "cliente_phone" || dupeAlert?.type === "cpf") && (
              <Button variant="secondary" onClick={() => setDupeAlert(null)} className="press-effect">OK, Entendi</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
