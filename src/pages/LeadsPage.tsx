import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { skipWeekend, PERIODO_HORA } from "@/lib/lead-task-utils";
import { ptBR } from "date-fns/locale";
import {
  Search, Plus, Phone, User, Users, History, ArrowRight, Trash2,
  MessageSquare, PhoneCall, Clock, UserCheck, RefreshCw, Loader2, UserPlus, AlertTriangle,
  ListOrdered, Send, FileText, ChevronRight, CalendarClock, CalendarIcon, Zap, Archive, Eye, Filter,
  ArrowRightLeft,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  cidade_id: string | null;
  bairro_id: string | null;
  rua_id: string | null;
  numero_endereco: string | null;
  reserved_by: string | null;
  reserved_at: string | null;
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

// ─── Inline CEP adder ──────────────────────────────────
function AddCepInline({ ruaId, existingCeps, onSaved }: { ruaId: string; existingCeps: string[]; onSaved: () => void }) {
  const [newCep, setNewCep] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const clean = newCep.replace(/\D/g, "");
    if (clean.length < 5) { toast.error("CEP inválido."); return; }
    const formatted = clean.length >= 8 ? `${clean.slice(0, 5)}-${clean.slice(5, 8)}` : clean;
    if (existingCeps.some(c => c.replace(/\D/g, "") === clean)) { toast.error("CEP já vinculado."); return; }
    setSaving(true);
    try {
      const updated = [...existingCeps, formatted];
      const { error } = await supabase.from("ruas").update({ cep: updated }).eq("id", ruaId);
      if (error) throw error;
      setNewCep("");
      onSaved();
      toast.success("CEP adicionado!");
    } catch (err: any) {
      toast.error("Erro ao salvar CEP: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        className="h-7 text-xs flex-1 font-mono"
        placeholder="Novo CEP (ex: 12345-678)"
        value={newCep}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, "").slice(0, 8);
          if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
          setNewCep(v);
        }}
        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
      />
      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={handleAdd} disabled={saving || !newCep.trim()}>
        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-0.5" />}
        Add CEP
      </Button>
    </div>
  );
}

// ─── Status helpers ────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "novo", label: "Novo", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  { value: "em_contato", label: "Em Contato", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  { value: "interessado", label: "Interessado", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  { value: "convertido", label: "Convertido", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  { value: "perdido", label: "Perdido", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  { value: "arquivado", label: "Arquivado", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  { value: "aguardando_decisao_avaliador", label: "Aguardando Avaliador", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  { value: "fila_captura", label: "Fila de Captura", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  { value: "reservado", label: "Reservado", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  { value: "em_atendimento", label: "Em tratativa", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
];

// No timeout — reservations persist until manual release or action

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
  lead_desarquivado: "Lead Desarquivado",
  agendamento_retorno: "Agendamento de Retorno",
  objecao_registrada: "Objeção Registrada",
  perfil_alterado: "Perfil Alterado",
  repetidor_alterado: "Repetidor Alterado",
  observacao_adicionada: "Observação Adicionada",
  dados_alterados: "Dados Alterados",
  agendamento_removido: "Agendamento Removido",
  lead_reaberto_captura: "Lead Reaberto p/ Captura",
  lead_capturado: "Lead Capturado",
  lead_reservado: "Lead Reservado",
  reserva_liberada: "Reserva Liberada",
  captura_expirada: "Captura Expirada",
  reserva_expirada: "Reserva Expirada",
  transferencia_manual: "Transferência Manual",
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
  lead_desarquivado: RefreshCw,
  agendamento_retorno: CalendarClock,
  objecao_registrada: AlertTriangle,
  perfil_alterado: User,
  repetidor_alterado: RefreshCw,
  observacao_adicionada: MessageSquare,
  dados_alterados: FileText,
  agendamento_removido: Clock,
  lead_reservado: Eye,
  reserva_liberada: RefreshCw,
  reserva_expirada: Clock,
  transferencia_manual: ArrowRight,
  lead_capturado: UserCheck,
};

// PERIODO_HORA imported from lead-task-utils

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

// ─── Component ──────────────────────────────────────────
export default function LeadsPage() {
  const { profile, isAdmin, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Vision mode: view leads as another user
  const [viewAsProfileId, setViewAsProfileId] = useState<string | null>(null);
  const isVisionMode = !!viewAsProfileId;
  const effectiveProfileId = viewAsProfileId || profile?.id || null;

  // Search
  // Live clock for countdown
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<(Lead & { contatos: LeadContato[] })[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Transfer history dialog
  const [showTransferHistory, setShowTransferHistory] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPhoneWhatsapp, setCreatePhoneWhatsapp] = useState(false);
  const [createExtraContatos, setCreateExtraContatos] = useState<{ tipo: string; valor: string; temWhatsapp: boolean }[]>([]);
  const [createCidadeId, setCreateCidadeId] = useState<string>("");
  const [createBairroId, setCreateBairroId] = useState<string>("");
  const [createRuaId, setCreateRuaId] = useState<string>("");
  const [createNumeroEnd, setCreateNumeroEnd] = useState("");
  const [createCampanhaId, setCreateCampanhaId] = useState("");
  const [createBairroSearch, setCreateBairroSearch] = useState("");
  const [createRuaSearch, setCreateRuaSearch] = useState("");
  const [createCepSearch, setCreateCepSearch] = useState("");
  const [cepNotFound, setCepNotFound] = useState(false);
  const [newRuaNomeFromCep, setNewRuaNomeFromCep] = useState("");
  const [newBairroNomeFromCep, setNewBairroNomeFromCep] = useState("");
  // Duplicate phone detection modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateLeadData, setDuplicateLeadData] = useState<{
    lead: any; contatos: any[]; responsavel: string | null; ultimaInteracao: any | null;
  } | null>(null);
  const [forceCreateLead, setForceCreateLead] = useState(false);
  // Quick-add address dialogs
  const [quickAddType, setQuickAddType] = useState<"cidade" | "bairro" | "rua" | null>(null);
  const [quickAddNome, setQuickAddNome] = useState("");
  // Quick-add for detail panel address
  const [detailQuickAddType, setDetailQuickAddType] = useState<"cidade" | "bairro" | "rua" | null>(null);
  const [detailQuickAddNome, setDetailQuickAddNome] = useState("");

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
  const [convAtendenteId, setConvAtendenteId] = useState<string>("");
  const [convConvertidoPorId, setConvConvertidoPorId] = useState<string>("");
  const [convForm, setConvForm] = useState({
    nome: "", cpf: "", rg: "", nome_mae: "", numero: "", referencia: "",
  });
  const [convCidadeId, setConvCidadeId] = useState<string | null>(null);
  const [convBairroId, setConvBairroId] = useState<string | null>(null);
  const [convRuaId, setConvRuaId] = useState<string | null>(null);
  const [convQuickAddType, setConvQuickAddType] = useState<"cidade" | "bairro" | "rua" | null>(null);
  const [convQuickAddNome, setConvQuickAddNome] = useState("");
  const [convCpfLookedUp, setConvCpfLookedUp] = useState(false);
  const [convCpfSearching, setConvCpfSearching] = useState(false);
  const convCpfLookupRef = useRef("");
  // CEP search for conversion dialog
  const [convCepSearch, setConvCepSearch] = useState("");
  const [convCepNotFound, setConvCepNotFound] = useState(false);
  const [convNewBairroNome, setConvNewBairroNome] = useState("");
  const [convNewRuaNome, setConvNewRuaNome] = useState("");
  const [convStep, setConvStep] = useState<"form" | "review">("form");

  // Finalize dialog (when all attempts done)
  const [showFinalize, setShowFinalize] = useState(false);

  // Schedule dialog
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleHour, setScheduleHour] = useState("09");
  const [scheduleMinute, setScheduleMinute] = useState("00");

  // Priority queue filter
  const [filaFiltro, setFilaFiltro] = useState<"hoje" | "todos">("hoje");

  // Local editable state (saved only when registering an attempt)
  const [localPlanoId, setLocalPlanoId] = useState<string | null>(null);
  const [localRepetidor, setLocalRepetidor] = useState<string | null>(null);
  const [localObjecaoId, setLocalObjecaoId] = useState<string>("none");
  const [localCidadeId, setLocalCidadeId] = useState<string | null>(null);
  const [localBairroId, setLocalBairroId] = useState<string | null>(null);
  const [localRuaId, setLocalRuaId] = useState<string | null>(null);
  const [localNumeroEnd, setLocalNumeroEnd] = useState("");

  // Duplicate alert state
  const [dupeAlert, setDupeAlert] = useState<{
    type: "lead_phone" | "cliente_phone" | "cpf";
    message: string;
    leadId?: string;
    clienteId?: string;
    clienteNome?: string;
  } | null>(null);

  // ─── Queries ──────────────────────────────────────

  // Query: profiles from Atendimento sector for vision mode
  const canUseVisionMode = isAdmin || hasRole("avaliador");
  const { data: visionProfiles = [] } = useQuery({
    queryKey: ["vision-atendimento-profiles"],
    enabled: canUseVisionMode,
    queryFn: async () => {
      // Find "Atendimento" sector
      const { data: setores } = await supabase.from("setores").select("id, nome").ilike("nome", "%atendimento%").limit(1);
      const setorId = setores?.[0]?.id;
      if (!setorId) return [];
      // Get profiles linked to that sector
      const { data: colabSetores } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", setorId);
      if (!colabSetores || colabSetores.length === 0) return [];
      const profileIds = colabSetores.map(cs => cs.profile_id);
      const { data: profiles } = await supabase.from("profiles").select("id, nome, cargo").in("id", profileIds).eq("ativo", true).order("nome");
      return (profiles || []) as { id: string; nome: string; cargo: string | null }[];
    },
  });

  const leadsScope: string = isVisionMode ? "own" : (isAdmin ? "all" : "own");

  const { data: allLeads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["leads-list", effectiveProfileId, leadsScope],
    queryFn: async () => {
      if (!effectiveProfileId) return [] as Lead[];

      if (leadsScope === "own") {
        // Fetch leads where user is responsible OR has reserved
        const [respRes, reservedRes] = await Promise.all([
          supabase.from("leads").select("*").eq("responsavel_id", effectiveProfileId).order("updated_at", { ascending: true }),
          supabase.from("leads").select("*").eq("reserved_by", effectiveProfileId).order("updated_at", { ascending: true }),
        ]);
        if (respRes.error) throw respRes.error;
        if (reservedRes.error) throw reservedRes.error;
        // Merge and deduplicate
        const map = new Map<string, Lead>();
        (respRes.data || []).forEach(l => map.set(l.id, l as Lead));
        (reservedRes.data || []).forEach(l => { if (!map.has(l.id)) map.set(l.id, l as Lead); });
        return [...map.values()].sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      } else if (leadsScope === "team") {
        const { data: mySetores } = await supabase
          .from("colaborador_setores")
          .select("setor_id")
          .eq("profile_id", effectiveProfileId);
        if (mySetores && mySetores.length > 0) {
          const setorIds = mySetores.map(s => s.setor_id);
          const { data: teamMembers } = await supabase
            .from("colaborador_setores")
            .select("profile_id")
            .in("setor_id", setorIds);
          const teamIds = teamMembers?.map(m => m.profile_id) || [];
          const { data, error } = await supabase.from("leads").select("*").in("responsavel_id", teamIds).order("updated_at", { ascending: true });
          if (error) throw error;
          return data as Lead[];
        } else {
          const { data, error } = await supabase.from("leads").select("*").eq("responsavel_id", effectiveProfileId).order("updated_at", { ascending: true });
          if (error) throw error;
          return data as Lead[];
        }
      } else if (leadsScope === "none") {
        return [] as Lead[];
      }
      // scope === "all" → no filter
      const { data, error } = await supabase.from("leads").select("*").order("updated_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!effectiveProfileId,
  });

  // Campanhas for source tracking
  const { data: campanhasAtivas = [] } = useQuery({
    queryKey: ["campanhas-ativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campanhas").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // All campanhas (including inactive) for display
  const { data: allCampanhas = [] } = useQuery({
    queryKey: ["campanhas-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campanhas").select("id, nome").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const getCampanhaNome = useCallback((lead: Lead) => {
    const cId = (lead as any).campanha_id;
    if (!cId) return null;
    return allCampanhas.find(c => c.id === cId)?.nome || null;
  }, [allCampanhas]);

  const updateLeadInCache = useCallback((leadId: string, updates: Partial<Lead>) => {
    queryClient.setQueryData(["leads-list", effectiveProfileId], (old: Lead[] | undefined) => {
      if (!old) return old;
      return old.map(l => l.id === leadId ? { ...l, ...updates } : l);
    });
  }, [effectiveProfileId, queryClient]);

  // Auto-activate vision mode and select lead from URL params ?id=&viewAs=
  useEffect(() => {
    const viewAs = searchParams.get("viewAs");
    if (viewAs && !viewAsProfileId) {
      setViewAsProfileId(viewAs);
    }
  }, [searchParams]);

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

  // Auto-select lead when returning to page (e.g. after capture redirect)
  useEffect(() => {
    if (selectedLead || !allLeads.length || !profile?.id) return;
    if (searchParams.get("id")) return;
  }, [allLeads, profile?.id, selectedLead]);

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

  // Profiles linked to the "Atendimento" sector — used in conversion dialog
  const { data: atendimentoProfiles = [] } = useQuery({
    queryKey: ["profiles-setor-atendimento-conv"],
    queryFn: async () => {
      const { data: setores } = await supabase.from("setores").select("id, nome").ilike("nome", "%atendimento%").limit(1);
      const setorId = setores?.[0]?.id;
      if (!setorId) return [] as { id: string; nome: string }[];
      const { data: vinculos } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", setorId);
      if (!vinculos || vinculos.length === 0) return [] as { id: string; nome: string }[];
      const profileIds = vinculos.map(v => v.profile_id);
      const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", profileIds).eq("ativo", true).order("nome");
      return (profs || []) as { id: string; nome: string }[];
    },
  });

  const { data: cadencia = [] } = useQuery({
    queryKey: ["rotina-tentativas-leads-cadencia"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rotina_tentativas_leads")
        .select("*")
        .eq("ativo", true)
        .order("tentativa_numero", { ascending: true });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        numero_tentativa: r.tentativa_numero,
        dias_apos: r.dias_apos_anterior,
        periodo: r.periodo_contato,
        prioridade: r.prioridade === "alta" ? 3 : r.prioridade === "media" ? 2 : 1,
      })) as CadenciaTentativa[];
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
      return data as { quantidade_tentativas: number; permitir_reiniciar_rotina: boolean; tipo_servico_conversao_id?: string | null; acao_apos_finalizar_tentativas?: string; tempo_expiracao_captura_segundos?: number; acao_quando_atrasar?: string } | null;
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

  // Check if user is avaliador from setor atendimento
  const { data: userSetor } = useQuery({
    queryKey: ["user-setor", profile?.setor_id],
    enabled: !!profile?.setor_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id, nome").eq("id", profile!.setor_id!).single();
      if (error) throw error;
      return data;
    },
  });

  const canArchiveLead = isAdmin || (hasRole("avaliador") && userSetor?.nome?.toLowerCase().includes("atendimento"));

  // Address queries
  const { data: endCidades = [] } = useQuery({
    queryKey: ["enderecos-cidades"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cidades").select("*").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });
  const { data: endBairros = [] } = useQuery({
    queryKey: ["enderecos-bairros"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bairros").select("*").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; cidade_id: string }[];
    },
  });
  const { data: endRuas = [] } = useQuery({
    queryKey: ["enderecos-ruas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ruas").select("*").order("nome");
      if (error) throw error;
      return data as { id: string; nome: string; bairro_id: string; cep: string[] | null }[];
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

  // Sync local state when selected lead changes
  useEffect(() => {
    if (selectedLead) {
      setLocalPlanoId(selectedLead.plano_id);
      setLocalRepetidor(selectedLead.repetidor);
      setLocalCidadeId(selectedLead.cidade_id);
      setLocalBairroId(selectedLead.bairro_id);
      setLocalRuaId(selectedLead.rua_id);
      setLocalNumeroEnd(selectedLead.numero_endereco || "");
    }
  }, [selectedLead?.id]);

  useEffect(() => {
    setLocalObjecaoId(leadObjecaoRegistro?.objecao_id || "none");
  }, [selectedLead?.id, leadObjecaoRegistro]);

  // All lead contacts for queue building – memoized to prevent cascading refetches
  const activeLeadIdsKey = useMemo(() => {
    return allLeads.filter(l => ["novo", "em_contato", "interessado"].includes(l.status_lead)).map(l => l.id).sort().join(",");
  }, [allLeads]);
  const activeLeadIds = useMemo(() => activeLeadIdsKey ? activeLeadIdsKey.split(",") : [], [activeLeadIdsKey]);

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
        .select("id, lead_id, colaborador_id, data_interacao")
        .in("lead_id", activeLeadIds)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data as { id: string; lead_id: string; colaborador_id: string; data_interacao: string }[];
    },
  });

  // Fetch latest transfer event per lead for cycle-based attempt counting
  const { data: allLeadTransfers = [] } = useQuery({
    queryKey: ["all-lead-transfers", activeLeadIds],
    enabled: activeLeadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_historico")
        .select("lead_id, data_evento, tipo_evento")
        .in("lead_id", activeLeadIds)
        .in("tipo_evento", ["transferencia_automatica", "transferencia_decisao", "lead_capturado"])
        .order("data_evento", { ascending: false });
      if (error) throw error;
      return data as { lead_id: string; data_evento: string; tipo_evento: string }[];
    },
  });

   // ─── Capture Queue: leads fila_captura (visible to all) ──
  const { data: capturaLeadsRaw = [] } = useQuery({
    queryKey: ["leads-captura"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*")
        .eq("status_lead", "fila_captura")
        .is("reserved_by", null)
        .is("responsavel_id", null)
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const capturaLeadIds = useMemo(() => capturaLeadsRaw.map(l => l.id), [capturaLeadsRaw]);

  const { data: capturaInteracoes = [] } = useQuery({
    queryKey: ["captura-interacoes", capturaLeadIds],
    enabled: capturaLeadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_interacoes")
        .select("id, lead_id, colaborador_id, data_interacao")
        .in("lead_id", capturaLeadIds)
        .order("data_interacao", { ascending: false });
      if (error) throw error;
      return data as { id: string; lead_id: string; colaborador_id: string; data_interacao: string }[];
    },
  });

  const { data: capturaContatos = [] } = useQuery({
    queryKey: ["captura-contatos", capturaLeadIds],
    enabled: capturaLeadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .in("lead_id", capturaLeadIds);
      if (error) throw error;
      return data as LeadContato[];
    },
  });

  const capturaQueue = useMemo(() => {
    if (!profile) return [];
    return capturaLeadsRaw.map(lead => {
      const contatos = capturaContatos.filter(c => c.lead_id === lead.id);
      return { lead, contatos };
    });
  }, [capturaLeadsRaw, capturaContatos, profile]);

  // ─── Capture: atomic reserve via RPC ─────────────────
  const reserveLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");
      // Use atomic RPC: only succeeds if fila_captura + reserved_by IS NULL + responsavel_id IS NULL
      const { data: reserved, error } = await supabase.rpc("atomic_reserve_lead", {
        _lead_id: leadId,
        _user_id: profile.user_id,
        _profile_id: profile.id,
      });
      if (error) throw error;
      if (!reserved) throw new Error("Este lead já está sendo atendido por outro usuário.");
      await supabase.from("lead_historico").insert({
        lead_id: leadId, usuario_id: profile.id,
        tipo_evento: "lead_capturado",
        descricao: `${profile.nome} capturou o lead. Status: Em tratativa.`,
      });
      // Start cadence
      const { data: firstRotina } = await supabase.from("rotina_tentativas_leads").select("*").eq("tentativa_numero", 1).maybeSingle();
      const periodo = (firstRotina as any)?.periodo_contato || "manha";
      await supabase.from("lead_tarefas_contato").insert({
        lead_id: leadId, tentativa: 1, data_contato: new Date().toISOString(),
        periodo, status: "pendente", responsavel_id: profile.id,
      });
      return leadId;
    },
    onSuccess: (leadId) => {
      toast.success("Lead capturado com sucesso!");
      const lead = capturaLeadsRaw.find(l => l.id === leadId);
      if (lead) {
        const capturedLead = { ...lead, responsavel_id: profile!.id, reserved_by: null, reserved_at: new Date().toISOString(), status_lead: "em_atendimento" } as Lead;
        // Add to cache immediately so it shows in the list
        updateLeadInCache(leadId, capturedLead);
        queryClient.setQueryData(["leads-list", effectiveProfileId, leadsScope], (old: Lead[] | undefined) => {
          if (!old) return [capturedLead];
          if (old.some(l => l.id === leadId)) return old.map(l => l.id === leadId ? capturedLead : l);
          return [...old, capturedLead];
        });
        // Select the lead and switch to "todos" so it's visible
        setSelectedLead(capturedLead);
        setFilaFiltro("todos");
      }
      queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
    },
  });

  // ─── Release reservation (Liberar) ─────────────────
  const releaseReservation = useCallback(async (leadId: string) => {
    if (!profile) return;
    await supabase.from("leads").update({
      reserved_by: null,
      reserved_at: null,
      status_lead: "fila_captura",
    } as any).eq("id", leadId).eq("reserved_by", profile.id);
    await supabase.from("lead_historico").insert({
      lead_id: leadId, usuario_id: profile.id,
      tipo_evento: "reserva_liberada",
      descricao: `${profile.nome} liberou o lead. Lead retornou à fila de captura.`,
    });
    queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  }, [profile, queryClient]);

  // ─── Auto-expire captured leads without interaction ─────
  const tempoExpiracaoCaptura = fluxoConfig?.tempo_expiracao_captura_segundos || 120;
  const acaoQuandoExpirar = fluxoConfig?.acao_quando_atrasar || "devolver_fila";

  useEffect(() => {
    if (!profile) return;
    const timeoutSeconds = tempoExpiracaoCaptura;
    const intervalMs = Math.min(timeoutSeconds * 1000, 15000); // check at most every 15s

    const checkExpiredCaptures = async () => {
      // Find leads owned by current user that are em_atendimento with reserved_at set
      const { data: myLeads } = await supabase
        .from("leads")
        .select("id, nome, reserved_at, responsavel_id, agendamento_retorno")
        .eq("responsavel_id", profile.id)
        .eq("status_lead", "em_atendimento")
        .not("reserved_at", "is", null);

      if (!myLeads || myLeads.length === 0) return;

      const now = new Date();
      let hadExpiration = false;
      for (const lead of myLeads) {
        if (!lead.reserved_at) continue;
        const capturedAt = new Date(lead.reserved_at);
        const elapsedSec = (now.getTime() - capturedAt.getTime()) / 1000;

        if (elapsedSec < timeoutSeconds) continue;

        // If user already scheduled a manual return, treat as valid activity
        if ((lead as any).agendamento_retorno) {
          await supabase.from("leads").update({ reserved_at: null } as any).eq("id", lead.id);
          continue;
        }

        // Check if there's any interaction since capture
        const { count } = await supabase
          .from("lead_interacoes")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id)
          .eq("colaborador_id", profile.id)
          .gte("data_interacao", lead.reserved_at);

        if (count && count > 0) {
          // Has interactions → clear reserved_at so we don't check again
          await supabase.from("leads").update({ reserved_at: null } as any).eq("id", lead.id);
          continue;
        }

        // Expired! Apply configured action
        hadExpiration = true;

        if (acaoQuandoExpirar === "aguardar_avaliador") {
          // Send to evaluator notifications
          await supabase.from("leads").update({
            status_lead: "aguardando_decisao_avaliador",
            reserved_by: null,
            reserved_at: null,
          } as any).eq("id", lead.id);

          await supabase.from("lead_historico").insert({
            lead_id: lead.id,
            usuario_id: profile.id,
            tipo_evento: "captura_expirada",
            descricao: `Captura expirou após ${timeoutSeconds}s sem interação. Lead enviado para avaliador decidir.`,
          });

          toast.warning(`Lead "${lead.nome}" enviado ao avaliador — tempo de captura expirado.`);
        } else {
          // Default: devolver_fila
          await supabase.from("leads").update({
            status_lead: "fila_captura",
            responsavel_id: null,
            reserved_by: null,
            reserved_at: null,
          } as any).eq("id", lead.id);

          await supabase.from("lead_historico").insert({
            lead_id: lead.id,
            usuario_id: profile.id,
            tipo_evento: "captura_expirada",
            descricao: `Captura expirou após ${timeoutSeconds}s sem interação. Lead devolvido à fila de captura.`,
          });

          toast.warning(`Lead "${lead.nome}" devolvido à fila — tempo de captura expirado.`);
        }

        // Cancel pending tasks
        await supabase.from("lead_tarefas_contato")
          .update({ status: "cancelada" } as any)
          .eq("lead_id", lead.id)
          .in("status", ["pendente", "atrasado", "aguardando_visualizacao"]);
      }

      if (hadExpiration) {
        queryClient.invalidateQueries({ queryKey: ["leads-list"] });
        queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
      }
    };

    const timer = setInterval(checkExpiredCaptures, intervalMs);
    checkExpiredCaptures(); // run immediately

    return () => clearInterval(timer);
  }, [profile?.id, tempoExpiracaoCaptura, acaoQuandoExpirar, queryClient]);

  // Transfer history query
  const { data: transferHistory = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ["lead-transfer-history"],
    enabled: showTransferHistory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_historico")
        .select("*, leads!lead_historico_lead_id_fkey(id, nome, status_lead), profiles!lead_historico_usuario_id_fkey(nome)")
        .in("tipo_evento", [
          "transferencia_automatica", "transferencia_manual", "transferencia_decisao",
          "lead_capturado", "reserva_liberada",
        ])
        .order("data_evento", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
  });


  // ─── Realtime subscription for capture queue ─────────────────
  useEffect(() => {
    const channel = supabase
      .channel("leads-reservation-realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "leads",
      }, (payload: any) => {
        const oldStatus = payload.old?.status_lead;
        const newStatus = payload.new?.status_lead;
        // Invalidate capture queue when any lead enters or leaves capture/reserved states
        const captureStates = ["fila_captura", "reservado", "em_atendimento"];
        if (captureStates.includes(oldStatus) || captureStates.includes(newStatus)) {
          queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
        }
        // Also refresh the main leads list when status changes
        if (oldStatus !== newStatus) {
          queryClient.invalidateQueries({ queryKey: ["leads-list"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Build priority queue (cycle-aware after transfers)
  const priorityQueue = useMemo(() => {
    const activeLeads = allLeads.filter(l => ["novo", "em_contato", "em_atendimento", "interessado", "fila_captura", "reservado", "aguardando_decisao_avaliador"].includes(l.status_lead));
    return activeLeads.map((lead) => {
      const interacoes = allLeadInteracoes.filter(i => i.lead_id === lead.id);
      
      // Find latest transfer for this lead to determine cycle
      const lastTransfer = allLeadTransfers.find(t => t.lead_id === lead.id);
      const transferDate = lastTransfer ? new Date(lastTransfer.data_evento) : null;
      
      // Cycle-based: only count interactions after last transfer
      const cycleInteracoes = transferDate
        ? interacoes.filter(i => new Date(i.data_interacao) > transferDate)
        : interacoes;
      
      const tentativaAtual = cycleInteracoes.length + 1;
      const ultimaInteracao = cycleInteracoes[0]?.data_interacao || null;

      let proximoContato: Date | null = null;
      if (ultimaInteracao && cadencia.length > 0) {
        const regra = cadencia.find(c => c.numero_tentativa === tentativaAtual) || cadencia[cadencia.length - 1];
        if (regra) {
          const base = addDays(new Date(ultimaInteracao), regra.dias_apos);
          base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0);
          proximoContato = base;
        }
      } else if (!ultimaInteracao) {
        // No interactions in current cycle: use transfer date if available, else data_criacao
        // Transferred leads should appear immediately (use transfer date as base)
        if (transferDate) {
          const regra = cadencia.find(c => c.numero_tentativa === 1) || cadencia[0];
          if (regra) {
            const base = new Date(transferDate);
            base.setHours(PERIODO_HORA[regra.periodo] || 9, 0, 0, 0);
            // If the period already passed on transfer day, keep it (shows as overdue = immediate)
            proximoContato = base;
          } else {
            proximoContato = transferDate;
          }
        } else {
          proximoContato = addDays(new Date(lead.data_criacao), 1);
        }
      }

      // Total attempts (all history, all cycles)
      const totalTentativas = interacoes.length;
      // Unique handlers (all collaborators who interacted)
      const handlers = [...new Set(interacoes.map(i => i.colaborador_id))];

      return { lead, tentativaAtual, proximoContato, ultimaInteracao, totalTentativas, handlers };
    }).sort((a, b) => {
      const now = Date.now();

      // 1) Scheduled returns: closer to now = higher priority (expired ones first)
      const aScheduled = a.lead.agendamento_retorno ? new Date(a.lead.agendamento_retorno).getTime() : null;
      const bScheduled = b.lead.agendamento_retorno ? new Date(b.lead.agendamento_retorno).getTime() : null;
      const aHasSchedule = aScheduled !== null;
      const bHasSchedule = bScheduled !== null;

      // Expired schedules get absolute top priority (oldest expired first)
      const aExpired = aScheduled && aScheduled <= now;
      const bExpired = bScheduled && bScheduled <= now;
      if (aExpired && !bExpired) return -1;
      if (!aExpired && bExpired) return 1;
      if (aExpired && bExpired) return aScheduled! - bScheduled!;

      // Future schedules: closer to now = higher priority (rises as time approaches)
      if (aHasSchedule && !bHasSchedule) {
        // Scheduled lead rises above non-scheduled if within 2h
        const hoursUntil = (aScheduled! - now) / (1000 * 60 * 60);
        if (hoursUntil <= 2) return -1;
      }
      if (!aHasSchedule && bHasSchedule) {
        const hoursUntil = (bScheduled! - now) / (1000 * 60 * 60);
        if (hoursUntil <= 2) return 1;
      }
      if (aHasSchedule && bHasSchedule) return aScheduled! - bScheduled!;

      // 2) Overdue cadence contacts first (next contact already passed)
      const aOverdue = a.proximoContato && a.proximoContato.getTime() <= now;
      const bOverdue = b.proximoContato && b.proximoContato.getTime() <= now;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (aOverdue && bOverdue) return a.proximoContato!.getTime() - b.proximoContato!.getTime();

      // 3) Oldest leads first (by creation date ascending)
      return new Date(a.lead.created_at).getTime() - new Date(b.lead.created_at).getTime();
    });
  }, [allLeads, allLeadInteracoes, allLeadTransfers, cadencia]);

  // Filtered priority queue based on filaFiltro
  const filteredQueue = useMemo(() => {
    let result = priorityQueue;

    // Time filter
    if (filaFiltro === "hoje") {
      const now = new Date();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      const in8hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      result = result.filter((item) => {
        if (item.lead.agendamento_retorno) {
          return new Date(item.lead.agendamento_retorno) <= endOfToday;
        }
        if (item.proximoContato && (item.proximoContato <= endOfToday || item.proximoContato <= in8hours)) return true;
        if (!item.proximoContato && !item.ultimaInteracao) return true;
        return false;
      });
    }

    return result;
  }, [priorityQueue, filaFiltro]);


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

  // Helper: cancel old tasks and create immediate task for new owner on transfer
  const resetTasksForTransfer = useCallback(async (leadId: string, newOwnerId: string) => {
    // Cancel all pending tasks from old owner
    await supabase.from("lead_tarefas_contato").update({ status: "cancelada" } as any).eq("lead_id", leadId).in("status", ["pendente", "atrasado"]);
    // Create immediate task for new owner
    const { data: firstRotina } = await supabase
      .from("rotina_tentativas_leads").select("*").eq("tentativa_numero", 1).maybeSingle();
    const periodo = firstRotina?.periodo_contato || "manha";
    await supabase.from("lead_tarefas_contato").insert({
      lead_id: leadId, tentativa: 1, data_contato: new Date().toISOString(),
      periodo, status: "pendente", responsavel_id: newOwnerId,
    });
  }, []);

  const handleSearch = useCallback(async () => {
    const term = searchTerm.trim();
    if (!term) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const phoneDigits = normalizePhone(term);

      // --- Phone-first verification: auto-open lead or show client data ---
      if (phoneDigits.length >= 8) {
        // 1) Check if phone exists as a lead contact
        const { data: leadConts } = await supabase
          .from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone");
        const matchedLeadContatos = (leadConts || []).filter(c => normalizePhone(c.valor) === phoneDigits);

        if (matchedLeadContatos.length > 0) {
          // Find active leads with this phone
          const leadIds = [...new Set(matchedLeadContatos.map(c => c.lead_id))];
          const { data: matchedLeads } = await supabase
            .from("leads").select("*").in("id", leadIds)
            .not("status_lead", "in", '("convertido","perdido","arquivado")');

          if (matchedLeads && matchedLeads.length > 0) {
            const lead = matchedLeads[0] as Lead;
            // Auto-transfer if different responsible or no responsible
            if (profile && lead.responsavel_id !== profile.id) {
              const oldResponsavelId = lead.responsavel_id;
              let oldResponsavelNome = "ninguém";
              if (oldResponsavelId) {
                const { data: oldProfile } = await supabase.from("profiles").select("nome").eq("id", oldResponsavelId).single();
                if (oldProfile) oldResponsavelNome = oldProfile.nome;
              }
               await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", lead.id);
               await resetTasksForTransfer(lead.id, profile.id);
               await supabase.from("lead_historico").insert({
                lead_id: lead.id, usuario_id: profile.id,
                tipo_evento: "transferencia_automatica",
                descricao: `Lead transferido de "${oldResponsavelNome}" para "${profile.nome}" via busca por telefone`,
              });
              toast.info(`Lead já existe e foi transferido para você (era de ${oldResponsavelNome}).`);
              updateLeadInCache(lead.id, { responsavel_id: profile.id });
              setSelectedLead({ ...lead, responsavel_id: profile.id });
            } else {
              toast.info("Lead encontrado! Abrindo...");
              setSelectedLead(lead);
            }
            setSearchResults(null);
            setSearchTerm("");
            setSearching(false);
            queryClient.invalidateQueries({ queryKey: ["leads-list"] });
            return;
          }
        }

        // 2) Check if phone exists in cliente_contatos
        const { data: clienteConts } = await supabase
          .from("cliente_contatos").select("cliente_id, valor, tipo").in("tipo", ["movel", "fixo", "telefone"]);
        const matchedCliente = (clienteConts || []).find(c => normalizePhone(c.valor) === phoneDigits);
        if (matchedCliente) {
          const { data: cliente } = await supabase
            .from("clientes").select("id, nome, cpf, endereco, cidade_id, bairro_id, rua_id, numero")
            .eq("id", matchedCliente.cliente_id).single();
          if (cliente) {
            setDupeAlert({
              type: "cliente_phone",
              message: `Telefone pertence ao cliente "${cliente.nome}" (CPF: ${cliente.cpf || "N/A"}). Deseja criar um lead vinculado?`,
              clienteId: cliente.id,
              clienteNome: cliente.nome,
            });
            // Pre-fill create dialog with client data
            setCreateName(cliente.nome);
            setCreatePhone(applyPhoneMask(term));
            setCreateCidadeId(cliente.cidade_id || "");
            setCreateBairroId(cliente.bairro_id || "");
            setCreateRuaId(cliente.rua_id || "");
            setCreateNumeroEnd(cliente.numero || "");
            setShowCreate(true);
            setSearchResults(null);
            setSearchTerm("");
            setSearching(false);
            return;
          }
        }
      }

      // --- Fallback: normal name + partial phone search ---
      const { data: byName, error: e1 } = await supabase
        .from("leads").select("*").ilike("nome", `%${term}%`);
      if (e1) throw e1;

      let byPhoneLeadIds: string[] = [];
      if (phoneDigits.length >= 4) {
        const { data: leadConts } = await supabase
          .from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone");
        byPhoneLeadIds = (leadConts || [])
          .filter(c => normalizePhone(c.valor).includes(phoneDigits))
          .map(c => c.lead_id);
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
  }, [searchTerm, profile, queryClient, updateLeadInCache]);

  // ─── Auto-transfer on opening (only for non-admin atendentes) ──────────────────────
  const openLeadWithTransfer = useCallback(async (lead: Lead) => {
    if (!profile) return;
    // Admins and vision-mode users just view – no auto-transfer
    if (isAdmin || isVisionMode) {
      setSelectedLead(lead);
      setSearchResults(null);
      setSearchTerm("");
      return;
    }
    if (lead.responsavel_id && lead.responsavel_id !== profile.id) {
      await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", lead.id);
      await resetTasksForTransfer(lead.id, profile.id);
      await supabase.from("lead_historico").insert({
        lead_id: lead.id, usuario_id: profile.id,
        tipo_evento: "transferencia_automatica",
        descricao: `Lead transferido automaticamente para ${profile.nome}`,
      });
      toast.info("Lead transferido automaticamente para você.");
      updateLeadInCache(lead.id, { responsavel_id: profile.id });
      setSelectedLead({ ...lead, responsavel_id: profile.id });
    } else if (!lead.responsavel_id) {
      await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", lead.id);
      await resetTasksForTransfer(lead.id, profile.id);
      await supabase.from("lead_historico").insert({
        lead_id: lead.id, usuario_id: profile.id,
        tipo_evento: "transferencia_automatica",
        descricao: `Lead atribuído automaticamente para ${profile.nome}`,
      });
      updateLeadInCache(lead.id, { responsavel_id: profile.id });
      setSelectedLead({ ...lead, responsavel_id: profile.id });
    } else {
      setSelectedLead(lead);
    }
    setSearchResults(null);
    setSearchTerm("");
  }, [profile, isAdmin, isVisionMode, queryClient]);

  // ─── Create Lead ──────────────────────────────────
  const createLeadMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim() || !createPhone.trim()) throw new Error("Nome e telefone são obrigatórios.");
      if (!profile) throw new Error("Perfil não encontrado.");
      const phoneNorm = normalizePhone(createPhone);
      if (phoneNorm.length < 8) throw new Error("Telefone inválido.");

      // Collect all phone numbers being submitted (main + extras)
      const allPhonesSubmitted: string[] = [phoneNorm];
      const extraPhoneContatos = createExtraContatos.filter(c => c.tipo === "telefone" && c.valor.trim());
      for (const c of extraPhoneContatos) {
        const norm = normalizePhone(c.valor);
        if (norm.length < 8) throw new Error(`Telefone extra "${c.valor}" é inválido.`);
        allPhonesSubmitted.push(norm);
      }

      // Check for duplicates among submitted phones
      const uniquePhones = new Set<string>();
      const duplicatesAmongSubmitted: string[] = [];
      for (const p of allPhonesSubmitted) {
        if (uniquePhones.has(p)) {
          duplicatesAmongSubmitted.push(p);
        }
        uniquePhones.add(p);
      }
      if (duplicatesAmongSubmitted.length > 0) {
        const formatted = duplicatesAmongSubmitted.map(d => applyPhoneMask(d)).join(", ");
        throw new Error(`Telefone(s) duplicado(s) na lista: ${formatted}. Remova o número repetido antes de continuar.`);
      }

      // Check all phones against existing lead_contatos in the database
      if (!forceCreateLead) {
        const { data: existingLeadContatos } = await supabase
          .from("lead_contatos").select("lead_id, valor").eq("tipo_contato", "telefone");

        for (const submittedPhone of allPhonesSubmitted) {
          const matchedLeadContato = (existingLeadContatos || []).find(c => normalizePhone(c.valor) === submittedPhone);
          if (matchedLeadContato) {
            const { data: existingLead } = await supabase
              .from("leads").select("*").eq("id", matchedLeadContato.lead_id).single();
            if (existingLead) {
              const { data: contatos } = await supabase.from("lead_contatos").select("*").eq("lead_id", existingLead.id);
              const respName = existingLead.responsavel_id
                ? (profiles || []).find((p: any) => p.id === existingLead.responsavel_id)?.nome || null
                : null;
              const { data: lastInteraction } = await supabase
                .from("lead_interacoes").select("*").eq("lead_id", existingLead.id)
                .order("data_interacao", { ascending: false }).limit(1).maybeSingle();
              setDuplicateLeadData({ lead: existingLead, contatos: contatos || [], responsavel: respName, ultimaInteracao: lastInteraction });
              setShowDuplicateModal(true);
              throw new Error("__DUPLICATE_LEAD__");
            }
          }
        }

        // Also check against cliente_contatos
        const { data: existingClientePhones } = await supabase
          .from("cliente_contatos").select("cliente_id, valor, tipo").in("tipo", ["movel", "fixo", "telefone"]);
        // We only use the main phone for client linking (existing behavior)
      }
      setForceCreateLead(false);

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
        .from("leads").insert({
          nome: leadNome, status_lead: "novo", responsavel_id: profile.id, cliente_id: linkedClienteId,
          cidade_id: createCidadeId || null, bairro_id: createBairroId || null, rua_id: createRuaId || null,
          numero_endereco: createNumeroEnd.trim() || null,
          campanha_id: (createCampanhaId && createCampanhaId !== "__none") ? createCampanhaId : null,
        } as any)
        .select().single();
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("lead_contatos").insert({
        lead_id: newLead.id, tipo_contato: "telefone", valor: createPhone.trim(), tem_whatsapp: createPhoneWhatsapp,
      });
      if (e2) throw e2;

      // Insert extra contacts (non-phone extras don't need dedup)
      if (createExtraContatos.length > 0) {
        const extras = createExtraContatos.filter(c => c.valor.trim()).map(c => ({
          lead_id: newLead.id,
          tipo_contato: c.tipo,
          valor: c.valor.trim(),
          tem_whatsapp: c.tipo === "telefone" ? c.temWhatsapp : false,
        }));
        if (extras.length > 0) {
          const { error: eExtra } = await supabase.from("lead_contatos").insert(extras);
          if (eExtra) throw eExtra;
        }
      }

      const descParts = [`Lead "${leadNome}" criado por ${profile.nome}`];
      if (linkedClienteNome) descParts.push(`— vinculado ao cliente existente "${linkedClienteNome}"`);
      const campanhaNome = campanhasAtivas.find(c => c.id === createCampanhaId)?.nome;
      if (campanhaNome) descParts.push(`— origem: campanha "${campanhaNome}"`);
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
          const skipped = skipWeekend(nextDate);
          const periodoHora = firstRotina.periodo_contato === "manha" ? 9 : firstRotina.periodo_contato === "tarde" ? 14 : 19;
          skipped.setHours(periodoHora, 0, 0, 0);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: newLead.id, tentativa: 1, data_contato: skipped.toISOString(),
            periodo: firstRotina.periodo_contato, status: "pendente", responsavel_id: profile.id,
          });
        }
      } catch { /* ignore */ }

      return newLead;
    },
    onSuccess: (newLead) => {
      toast.success("Lead criado com sucesso!");
      setShowCreate(false); setCreateName(""); setCreatePhone(""); setCreatePhoneWhatsapp(false);
      setCreateCampanhaId("");
      setCreateExtraContatos([]);
      setCreateCidadeId(""); setCreateBairroId(""); setCreateRuaId(""); setCreateNumeroEnd("");
      setCreateBairroSearch(""); setCreateRuaSearch("");
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      setSelectedLead(newLead);
    },
    onError: (err: any) => {
      if (err.message === "__DUPLICATE_LEAD__") return; // modal handles it
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

      // Block interaction if lead is not owned by or reserved by current user
      const isOwner = selectedLead.responsavel_id === profile.id;
      const isReservedByMe = selectedLead.reserved_by === profile.id;
      if (!isOwner && !isReservedByMe && !isAdmin) {
        throw new Error("Você não tem permissão para interagir com este lead. Ele pertence a outro usuário.");
      }

      // No longer need reservado→em_atendimento transition since capture now directly assigns

      // Save pending field changes first
      const changes: string[] = [];
      const leadUpdates: Record<string, any> = {};

      if (localPlanoId !== selectedLead.plano_id) {
        leadUpdates.plano_id = localPlanoId;
        const oldP = planos.find(p => p.id === selectedLead.plano_id)?.nome_plano || "Nenhum";
        const newP = planos.find(p => p.id === localPlanoId)?.nome_plano || "Nenhum";
        changes.push(`Perfil: "${oldP}" → "${newP}"`);
      }
      if (localRepetidor !== selectedLead.repetidor) {
        leadUpdates.repetidor = localRepetidor;
        changes.push(`Repetidor: "${selectedLead.repetidor || "Nenhum"}" → "${localRepetidor || "Nenhum"}"`);
      }
      if (localCidadeId !== selectedLead.cidade_id || localBairroId !== selectedLead.bairro_id || localRuaId !== selectedLead.rua_id || localNumeroEnd !== (selectedLead.numero_endereco || "")) {
        leadUpdates.cidade_id = localCidadeId;
        leadUpdates.bairro_id = localBairroId;
        leadUpdates.rua_id = localRuaId;
        leadUpdates.numero_endereco = localNumeroEnd || null;
        changes.push("Endereço atualizado");
      }

      if (Object.keys(leadUpdates).length > 0) {
        await supabase.from("leads").update(leadUpdates as any).eq("id", selectedLead.id);
      }

      // Save objeção if changed
      if (localObjecaoId !== "none" && localObjecaoId !== (leadObjecaoRegistro?.objecao_id || "none")) {
        await supabase.from("registro_objecao_lead").insert({
          lead_id: selectedLead.id, objecao_id: localObjecaoId, colaborador_id: profile.id,
        });
        changes.push(`Objeção: ${objecoes.find(o => o.id === localObjecaoId)?.descricao || localObjecaoId}`);
      }

      if (changes.length > 0) {
        await supabase.from("lead_historico").insert({
          lead_id: selectedLead.id, usuario_id: profile.id,
          tipo_evento: "dados_alterados",
          descricao: changes.join(" | "),
        });
      }

      // Register interaction
      const { error } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedLead.id, colaborador_id: profile.id,
        tipo_contato: interTipo, numero_utilizado: interNumero.trim() || null, resultado: interResultado.trim() || null,
      });
      if (error) throw error;

      // Compute cycle-based attempt count (after last transfer or capture)
      // Use reverse search to find the MOST RECENT cycle event (history is sorted ascending)
      let tentativaNum: number;
      const lastCycleEvt = [...leadHistorico].reverse().find(h =>
        h.tipo_evento === "transferencia_automatica" || h.tipo_evento === "transferencia_decisao" || h.tipo_evento === "lead_capturado"
      );
      const cycleInteractions = lastCycleEvt
        ? leadInteracoes.filter(i => new Date(i.data_interacao) > new Date(lastCycleEvt.data_evento)).length
        : leadInteracoes.length;
      tentativaNum = cycleInteractions + 1;

      // Fetch pending tarefa FIRST (needed for timing calc)
      const { data: pendingTarefas } = await supabase
        .from("lead_tarefas_contato")
        .select("*")
        .eq("lead_id", selectedLead.id)
        .in("status", ["pendente", "atrasado"])
        .order("tentativa", { ascending: true })
        .limit(1);

      // Calculate timing relative to deadline
      let timingInfo = "";
      const now = new Date();
      if (selectedLead.agendamento_retorno) {
        const deadlineDate = new Date(selectedLead.agendamento_retorno);
        const diffMin = Math.round((deadlineDate.getTime() - now.getTime()) / 60000);
        const absH = Math.floor(Math.abs(diffMin) / 60);
        const absM = Math.abs(diffMin) % 60;
        if (diffMin < 0) {
          timingInfo = ` | ⏱️ Registrada ${absH}h${String(absM).padStart(2,'0')}m APÓS expiração (agendamento manual)`;
        } else {
          timingInfo = ` | ⏱️ Registrada ${absH}h${String(absM).padStart(2,'0')}m ANTES da expiração (agendamento manual)`;
        }
      } else if (pendingTarefas && pendingTarefas.length > 0) {
        const taskDeadline = new Date(pendingTarefas[0].data_contato);
        const endHr = pendingTarefas[0].periodo === "manha" ? 12 : pendingTarefas[0].periodo === "tarde" ? 18 : 24;
        taskDeadline.setHours(endHr, 0, 0, 0);
        const diffMin = Math.round((taskDeadline.getTime() - now.getTime()) / 60000);
        const absH = Math.floor(Math.abs(diffMin) / 60);
        const absM = Math.abs(diffMin) % 60;
        if (diffMin < 0) {
          timingInfo = ` | ⏱️ Registrada ${absH}h${String(absM).padStart(2,'0')}m APÓS expiração (cadência automática)`;
        } else {
          timingInfo = ` | ⏱️ Registrada ${absH}h${String(absM).padStart(2,'0')}m ANTES da expiração (cadência automática)`;
        }
      }

      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "tentativa_contato",
        descricao: `Tentativa #${tentativaNum} via ${interTipo}${interResultado ? ": " + interResultado.trim() : ""}${timingInfo}`,
      });

      if (selectedLead.status_lead === "novo") {
        await supabase.from("leads").update({ status_lead: "em_contato", reserved_at: null } as any).eq("id", selectedLead.id);
        setSelectedLead(prev => prev ? { ...prev, status_lead: "em_contato", reserved_at: null } : null);
      } else {
        // Clear reserved_at to stop expiration timer
        await supabase.from("leads").update({ reserved_at: null } as any).eq("id", selectedLead.id);
      }

      // Mark current pending tarefa as "realizado"
      if (pendingTarefas && pendingTarefas.length > 0) {
        const taskDate = new Date(pendingTarefas[0].data_contato);
        const endHour = pendingTarefas[0].periodo === "manha" ? 12 : pendingTarefas[0].periodo === "tarde" ? 18 : 24;
        taskDate.setHours(endHour, 0, 0, 0);
        const wasLate = pendingTarefas[0].status === "atrasado" || new Date() > taskDate;
        await supabase.from("lead_tarefas_contato")
          .update({ status: "realizado", fora_do_prazo: wasLate } as any)
          .eq("id", pendingTarefas[0].id);
      }

      // Check max tentativas and create next or finalize
      const mxTentativas = fluxoConfig?.quantidade_tentativas || 7;
      const nextTentativa = tentativaNum + 1;

      if (nextTentativa > mxTentativas) {
        // Last attempt done and not converted → auto-send to avaliador
        const acaoFinal = fluxoConfig?.acao_apos_finalizar_tentativas || "enviar_avaliador";
        const finalStatus = acaoFinal === "arquivar_lead" ? "arquivado" : "aguardando_decisao_avaliador";
        await supabase.from("leads").update({ 
          status_lead: finalStatus,
        }).eq("id", selectedLead.id);
        await supabase.from("lead_historico").insert({
          lead_id: selectedLead.id, usuario_id: profile.id,
          tipo_evento: "tentativas_finalizadas",
          descricao: `Todas as ${mxTentativas} tentativas finalizadas sem conversão. Lead enviado automaticamente para fila do avaliador.`,
        });
        // Remove lead from local cache so it disappears from the list
        queryClient.setQueryData(["leads-list", effectiveProfileId], (old: any[] | undefined) => {
          if (!old) return old;
          return old.filter((l: any) => l.id !== selectedLead.id);
        });
        // Close detail panel — lead leaves atendente's screen
        setSelectedLead(null);
        toast.warning("Última tentativa registrada sem conversão. Lead enviado para a fila do avaliador.");
      } else {
        try {
          const { data: nextRotina } = await supabase
            .from("rotina_tentativas_leads").select("*").eq("tentativa_numero", nextTentativa).maybeSingle();
          const diasApos = nextRotina?.dias_apos_anterior || 1;
          const periodo = nextRotina?.periodo_contato || "manha";
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + Math.max(diasApos, 1));
          const skippedNext = skipWeekend(nextDate);
          const periodoHora = periodo === "manha" ? 9 : periodo === "tarde" ? 14 : 19;
          skippedNext.setHours(periodoHora, 0, 0, 0);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: selectedLead.id, tentativa: nextTentativa, data_contato: skippedNext.toISOString(),
            periodo, status: "pendente", responsavel_id: profile.id,
          });
        } catch { /* ignore */ }
        await supabase.from("leads").update({ status_lead: selectedLead.status_lead === "novo" ? "em_contato" : selectedLead.status_lead }).eq("id", selectedLead.id);

        // Update local selectedLead with saved changes
        setSelectedLead(prev => prev ? {
          ...prev,
          plano_id: localPlanoId,
          repetidor: localRepetidor,
          cidade_id: localCidadeId,
          bairro_id: localBairroId,
          rua_id: localRuaId,
          numero_endereco: localNumeroEnd || null,
        } : null);
        updateLeadInCache(selectedLead!.id, { plano_id: localPlanoId, repetidor: localRepetidor, cidade_id: localCidadeId, bairro_id: localBairroId, rua_id: localRuaId, numero_endereco: localNumeroEnd || null });
      }
    },
    onSuccess: () => {
      toast.success("Tentativa registrada!");
      setShowInteraction(false); setInterNumero(""); setInterResultado("");
      refetchInteracoes(); refetchHistorico(); refetchObjecao();
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
    updateLeadInCache(selectedLead.id, { status_lead: newStatus }); refetchHistorico();
    toast.success("Status atualizado.");
  };

  // updatePlano and updateRepetidor removed — fields now use local state, saved on interaction registration

  const openConversion = () => {
    if (!selectedLead) return;
    setConvForm({ nome: selectedLead.nome, cpf: "", rg: "", nome_mae: "", numero: selectedLead.numero_endereco || "", referencia: "" });
    setConvCidadeId(selectedLead.cidade_id || null);
    setConvBairroId(selectedLead.bairro_id || null);
    setConvRuaId(selectedLead.rua_id || null);
    setConvAtendenteId(profile?.id || "");
    setConvConvertidoPorId(selectedLead.responsavel_id || profile?.id || "");
    setConvCpfLookedUp(false);
    setConvCpfSearching(false);
    convCpfLookupRef.current = "";
    setConvCepSearch("");
    setConvCepNotFound(false);
    setConvNewBairroNome("");
    setConvNewRuaNome("");
    setConvStep("form");
    setShowConvert(true);
  };

  const handleConvCpfChange = async (cpfValue: string) => {
    setConvForm(f => ({ ...f, cpf: cpfValue }));
    setConvCpfLookedUp(false);
    const digits = cpfValue.replace(/\D/g, "");
    if (digits.length < 11) return;
    if (convCpfLookupRef.current === digits) return;
    convCpfLookupRef.current = digits;
    setConvCpfSearching(true);
    try {
      const { data: existing } = await supabase
        .from("clientes").select("id, nome, cpf, rg, nome_mae, numero, referencia, cidade_id, bairro_id, rua_id, cep")
        .eq("cpf", cpfValue.trim()).maybeSingle();
      if (existing) {
        setConvForm(f => ({
          ...f,
          nome: existing.nome || f.nome,
          rg: existing.rg || f.rg,
          nome_mae: existing.nome_mae || f.nome_mae,
          numero: existing.numero || f.numero,
          referencia: existing.referencia || f.referencia,
        }));
        if (existing.cidade_id) setConvCidadeId(existing.cidade_id);
        if (existing.bairro_id) setConvBairroId(existing.bairro_id);
        if (existing.rua_id) setConvRuaId(existing.rua_id);
        setConvCpfLookedUp(true);
        toast.info("Cliente encontrado! Dados preenchidos automaticamente.");
      }
    } catch { /* ignore */ }
    setConvCpfSearching(false);
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
      if (!convCidadeId) throw new Error("Cidade é obrigatória.");
      if (!convBairroId) throw new Error("Bairro é obrigatório.");
      if (!convRuaId) throw new Error("Rua é obrigatória.");
      if (!f.numero.trim()) throw new Error("Número é obrigatório.");

      // Resolve CEP from rua
      const selectedRua = endRuas.find(r => r.id === convRuaId);
      const cepValue = selectedRua?.cep?.[0] || null;
      // Resolve cidade name
      const selectedCidade = endCidades.find(c => c.id === convCidadeId);

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
              await supabase.from("leads").update({ status_lead: "convertido", cliente_id: existingCliente.id, convertido_por: convConvertidoPorId || profile.id } as any).eq("id", selectedLead.id);
              // Create OS for existing client too
              const dupetipoServicoId: string | null = (fluxoConfig as any)?.tipo_servico_conversao_id || null;
              const dupeConverterId = convAtendenteId || profile.id;
              if (dupetipoServicoId) {
                await supabase.from("ordens_servico").insert({
                  cliente_id: existingCliente.id, cliente_nome: existingCliente.nome, cliente_cpf: existingCliente.cpf || null,
                  tipo_servico_id: dupetipoServicoId, numero_os: null, status: "aguardando_numero" as any,
                  atendente_id: dupeConverterId,
                } as any);
              }
              await supabase.from("lead_historico").insert({
                lead_id: selectedLead.id, usuario_id: profile.id,
                tipo_evento: "conversao_cliente",
                descricao: `Lead convertido — vinculado ao cliente existente "${existingCliente.nome}" (telefone já cadastrado). OS criada aguardando número.`,
              });
              setDupeAlert({ type: "cpf", message: `Telefone já cadastrado para o cliente "${existingCliente.nome}". O lead foi vinculado ao cliente existente e uma OS foi criada aguardando número.`, clienteId: existingCliente.id, clienteNome: existingCliente.nome });
              setShowConvert(false);
              setSelectedLead(prev => prev ? { ...prev, status_lead: "convertido" } : null);
              updateLeadInCache(selectedLead.id, { status_lead: "convertido" }); refetchHistorico();
              throw new Error("__DUPLICATE_CPF__");
            }
          }
        }
      }

      const cpfNorm = f.cpf.trim().replace(/\D/g, "");
      const cpfFormatted = cpfNorm.length === 11
        ? `${cpfNorm.slice(0,3)}.${cpfNorm.slice(3,6)}.${cpfNorm.slice(6,9)}-${cpfNorm.slice(9)}`
        : f.cpf.trim();
      if (cpfNorm.length >= 11) {
        const { data: existingClientes } = await supabase
          .from("clientes").select("id, nome, cpf").or(`cpf.eq.${cpfFormatted},cpf.eq.${cpfNorm}`);
        const existingCliente = existingClientes?.[0] || null;
        if (existingCliente) {
          // Merge phone contacts into existing client
          const leadPhones = leadContatos.filter(c => c.tipo_contato === "telefone");
          if (leadPhones.length > 0) {
            const { data: existingPhones } = await supabase
              .from("cliente_contatos").select("valor").eq("cliente_id", existingCliente.id);
            const existingNorms = new Set((existingPhones || []).map((c: any) => normalizePhone(c.valor)));
            const newInserts = leadPhones
              .filter(c => !existingNorms.has(normalizePhone(c.valor)))
              .map(c => ({ cliente_id: existingCliente.id, tipo: "movel" as const, valor: c.valor, tem_whatsapp: c.tem_whatsapp }));
            if (newInserts.length > 0) await supabase.from("cliente_contatos").insert(newInserts);
          }
          // Update client address if empty
          if (!existingCliente.cpf || existingCliente.cpf !== cpfFormatted) {
            await supabase.from("clientes").update({ cpf: cpfFormatted } as any).eq("id", existingCliente.id);
          }

          await supabase.from("leads").update({ status_lead: "convertido", cliente_id: existingCliente.id, convertido_por: convConvertidoPorId || profile.id } as any).eq("id", selectedLead.id);
          // Create OS for existing client too
          const cpfDupeTipoServicoId: string | null = (fluxoConfig as any)?.tipo_servico_conversao_id || null;
          const cpfDupeConverterId = convAtendenteId || profile.id;
          if (cpfDupeTipoServicoId) {
            await supabase.from("ordens_servico").insert({
              cliente_id: existingCliente.id, cliente_nome: existingCliente.nome, cliente_cpf: existingCliente.cpf || null,
              tipo_servico_id: cpfDupeTipoServicoId, numero_os: null, status: "aguardando_numero" as any,
              atendente_id: cpfDupeConverterId,
            } as any);
          }
          await supabase.from("lead_historico").insert({
            lead_id: selectedLead.id, usuario_id: profile.id,
            tipo_evento: "conversao_cliente",
            descricao: `Lead convertido — vinculado ao cliente existente "${existingCliente.nome}" (CPF: ${existingCliente.cpf}). OS criada aguardando número.`,
          });
          setDupeAlert({ type: "cpf", message: `CPF já cadastrado para o cliente "${existingCliente.nome}". O lead foi vinculado ao cliente existente e uma OS foi criada aguardando número.`, clienteId: existingCliente.id, clienteNome: existingCliente.nome });
          setShowConvert(false);
          setSelectedLead(prev => prev ? { ...prev, status_lead: "convertido" } : null);
          updateLeadInCache(selectedLead.id, { status_lead: "convertido" }); refetchHistorico();
          throw new Error("__DUPLICATE_CPF__");
        }
      }

      const { data: newCliente, error: e1 } = await supabase.from("clientes").insert({
        nome: f.nome.trim(), cpf: cpfFormatted, rg: f.rg.trim(), nome_mae: f.nome_mae.trim(),
        numero: f.numero.trim(), referencia: f.referencia?.trim() || null,
        cep: cepValue, cidade: selectedCidade?.nome || null,
        cidade_id: convCidadeId, bairro_id: convBairroId, rua_id: convRuaId,
      } as any).select("id").single();
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

      await supabase.from("leads").update({ status_lead: "convertido", cliente_id: newCliente.id, convertido_por: convConvertidoPorId || profile.id } as any).eq("id", selectedLead.id);

      // Use configured tipo_servico from rotina config (required)
      const tipoServicoId: string | null = (fluxoConfig as any)?.tipo_servico_conversao_id || null;
      if (!tipoServicoId) {
        throw new Error("Configure o Tipo de Serviço na tela Rotina de Tentativas antes de converter.");
      }
      // The selected atendente (pre-filled with converter, but editable)
      const converterId = convAtendenteId || profile.id;
      const { data: newOS, error: osErr } = await supabase.from("ordens_servico").insert({
        cliente_id: newCliente.id, cliente_nome: f.nome.trim(), cliente_cpf: f.cpf.trim(),
        tipo_servico_id: tipoServicoId, numero_os: null, status: "aguardando_numero" as any,
        atendente_id: converterId,
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
      updateLeadInCache(selectedLead!.id, { status_lead: "convertido" }); refetchHistorico();
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

  // Tentativas realizadas TOTAL (para exibição no painel)
  const tentativasRealizadas = selectedQueueInfo ? selectedQueueInfo.tentativaAtual - 1 : leadInteracoes.length;

  // Tentativas do CICLO ATUAL (após última transferência) — para o botão
  const tentativasCicloAtual = useMemo(() => {
    if (!selectedLead || leadHistorico.length === 0) return tentativasRealizadas;
    // Find the last transfer event
    const lastTransfer = [...leadHistorico].reverse().find(h =>
      h.tipo_evento === "transferencia_automatica" || h.tipo_evento === "transferencia_decisao" || h.tipo_evento === "lead_capturado"
    );
    if (!lastTransfer) return tentativasRealizadas;
    // Count interactions AFTER the last transfer
    const transferDate = new Date(lastTransfer.data_evento);
    return leadInteracoes.filter(i => new Date(i.data_interacao) > transferDate).length;
  }, [selectedLead, leadHistorico, leadInteracoes, tentativasRealizadas]);

  // Phone options for interaction dialog
  const phoneOptions = leadContatos.filter(c => c.tipo_contato === "telefone");

  // Check if all cadencia attempts are exhausted (based on cycle)
  const maxTentativas = fluxoConfig?.quantidade_tentativas || cadencia.length || 7;
  const allAttemptsExhausted = tentativasCicloAtual >= maxTentativas;
  const isLastAttempt = tentativasCicloAtual === maxTentativas - 1;

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
          const skippedRestart = skipWeekend(nextDate);
          const periodoHora = firstRotina.periodo_contato === "manha" ? 9 : firstRotina.periodo_contato === "tarde" ? 14 : 19;
          skippedRestart.setHours(periodoHora, 0, 0, 0);
          await supabase.from("lead_tarefas_contato").insert({
            lead_id: selectedLead.id, tentativa: 1, data_contato: skippedRestart.toISOString(),
            periodo: firstRotina.periodo_contato, status: "pendente", responsavel_id: profile.id,
          });
        }
      } catch { /* ignore */ }
      setSelectedLead(prev => prev ? { ...prev, status_lead: "em_contato" } : null);
      toast.success("Rotina reiniciada! Lead voltou para a fila.");
    } else {
      // Archive lead
      await supabase.from("leads").update({ status_lead: "arquivado" }).eq("id", selectedLead.id);
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id, usuario_id: profile.id,
        tipo_evento: "lead_arquivado",
        descricao: `Lead arquivado por ${profile.nome} após ${maxTentativas} tentativas sem sucesso.`,
      });
      setSelectedLead(prev => prev ? { ...prev, status_lead: "arquivado" } : null);
      toast.success("Lead arquivado.");
    }
    setShowFinalize(false);
    if (selectedLead) updateLeadInCache(selectedLead.id, { status_lead: selectedLead.status_lead });
    queryClient.invalidateQueries({ queryKey: ["all-lead-interacoes"] });
    refetchHistorico();
  };

  // ─── Render ───────────────────────────────────────
  return (
    <div className="p-3 md:p-4 space-y-3 h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">
            {isVisionMode ? `Visão: ${visionProfiles.find(p => p.id === viewAsProfileId)?.nome || ""}` : "Meus Leads"}
          </h1>
          {isVisionMode && (
            <Badge variant="outline" className="text-xs gap-1 border-primary/40 text-primary">
              <Eye className="w-3 h-3" /> Modo Visão (somente leitura)
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">{filteredQueue.length} na fila</Badge>
          {capturaQueue.length > 0 && !isVisionMode && (
            <Badge className="text-xs gap-1 bg-primary text-primary-foreground border-0">
              <UserCheck className="w-3 h-3" /> {capturaQueue.length} p/ captura
            </Badge>
          )}
          {/* Vision Mode Button */}
          {canUseVisionMode && visionProfiles.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={isVisionMode ? "default" : "ghost"} size="icon" className="h-7 w-7">
                  <Eye className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="start">
                <div className="space-y-0.5">
                  <Button
                    size="sm" variant={!isVisionMode ? "secondary" : "ghost"}
                    className="w-full justify-start text-xs h-8"
                    onClick={() => { setViewAsProfileId(null); setSelectedLead(null); }}
                  >
                    <User className="w-3.5 h-3.5 mr-2" /> Minha visão
                  </Button>
                  <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Atendimento
                  </div>
                  {visionProfiles.map(vp => (
                    <Button
                      key={vp.id}
                      size="sm"
                      variant={viewAsProfileId === vp.id ? "secondary" : "ghost"}
                      className="w-full justify-start text-xs h-8"
                      disabled={!canUseVisionMode && vp.id !== profile?.id}
                      onClick={() => { setViewAsProfileId(vp.id); setSelectedLead(null); }}
                    >
                      <Users className="w-3.5 h-3.5 mr-2" /> {vp.nome}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowTransferHistory(true)} size="sm" variant="outline" className="h-8 gap-1">
            <ArrowRightLeft className="w-3.5 h-3.5" /> Transferências
          </Button>
          {!isVisionMode && (
            <>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar telefone ou nome..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  className="pl-8 h-8 text-sm"
                />
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
            </>
          )}
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-12 gap-3" style={{ height: "calc(100% - 3.5rem)" }}>

        {/* ─── LEFT: Priority Queue ──────────────── */}
        <div className="col-span-3 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="py-2 px-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                  <ListOrdered className="w-3.5 h-3.5" /> Fila
                </CardTitle>
                <div className="flex gap-1 items-center">
                  <Button
                    variant={filaFiltro === "hoje" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setFilaFiltro("hoje")}
                  >
                    Hoje ({priorityQueue.filter((item) => {
                      const _now = new Date();
                      const endOfToday = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate(), 23, 59, 59, 999);
                      const in8hours = new Date(_now.getTime() + 8 * 60 * 60 * 1000);
                      if (item.lead.agendamento_retorno) {
                        return new Date(item.lead.agendamento_retorno) <= endOfToday;
                      }
                      if (item.proximoContato && (item.proximoContato <= endOfToday || item.proximoContato <= in8hours)) return true;
                      if (!item.proximoContato && !item.ultimaInteracao) return true;
                      return false;
                    }).length})
                  </Button>
                  <Button
                    variant={filaFiltro === "todos" ? "default" : "ghost"}
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setFilaFiltro("todos")}
                  >
                    Todos ({priorityQueue.length})
                  </Button>
                </div>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-border">
                {loadingLeads ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Carregando...</div>
                ) : filteredQueue.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Nenhum lead para {filaFiltro === "hoje" ? "hoje" : "exibir"}</div>
                ) : (
                  filteredQueue.map((item, idx) => {
                    const contatos = allLeadContatos.filter(c => c.lead_id === item.lead.id && c.tipo_contato === "telefone");
                    const isSelected = selectedLead?.id === item.lead.id;
                    const hasSchedule = !!item.lead.agendamento_retorno;
                    const scheduleReady = hasSchedule && new Date(item.lead.agendamento_retorno!) <= new Date();

                    // Urgency color: red = expired, yellow = <2h, green = >3h
                    const urgencyRef = item.lead.agendamento_retorno
                      ? new Date(item.lead.agendamento_retorno)
                      : item.proximoContato;
                    const now = new Date();
                    const hoursLeft = urgencyRef ? (urgencyRef.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
                    let urgencyBorder = "border-l-transparent";
                    let urgencyBg = "";
                    if (hoursLeft !== null) {
                      if (hoursLeft <= 0) {
                        urgencyBorder = "border-l-red-500";
                        urgencyBg = "bg-red-50/60 dark:bg-red-950/20";
                      } else if (hoursLeft <= 2) {
                        urgencyBorder = "border-l-yellow-500";
                        urgencyBg = "bg-yellow-50/50 dark:bg-yellow-950/15";
                      } else if (hoursLeft > 3) {
                        urgencyBorder = "border-l-emerald-500";
                        urgencyBg = "";
                      }
                    }

                    return (
                      <button
                        key={item.lead.id}
                        onClick={() => isVisionMode ? setSelectedLead(item.lead) : openLeadWithTransfer(item.lead)}
                        className={`w-full text-left px-3 py-2.5 transition-colors relative border-l-[3px] ${
                          isSelected ? `bg-primary/10 border-l-primary` : `hover:bg-accent/50 ${urgencyBorder} ${urgencyBg}`
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">#{idx + 1}</span>
                              <span className="text-sm font-medium truncate">{item.lead.nome}</span>
                            </div>
                            <p className="text-[10px] text-primary/70 ml-5 truncate">Origem: {getCampanhaNome(item.lead) || "Não especificada"}</p>
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
                            <div className="flex items-center gap-1 group/tent relative">
                              <span className="text-[10px] text-muted-foreground">
                                {item.tentativaAtual - 1}/{item.totalTentativas} tent.
                              </span>
                              {item.handlers.length > 0 && (
                                <div className="absolute bottom-full right-0 mb-1 hidden group-hover/tent:block z-50 bg-popover border border-border text-popover-foreground text-[11px] px-2 py-1.5 rounded shadow-md whitespace-nowrap">
                                  <p className="font-medium mb-0.5">Ciclo: {item.tentativaAtual - 1} | Total: {item.totalTentativas}</p>
                                  <p className="text-muted-foreground">Atendentes:</p>
                                  {item.handlers.map(hId => {
                                    const hp = profiles.find(p => p.id === hId);
                                    return <p key={hId} className="text-[10px]">• {hp?.nome || "—"}</p>;
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="ml-5 mt-1 flex flex-col gap-0.5">
                          <div className="flex items-center gap-1">
                            {hasSchedule ? (
                              <>
                                <CalendarClock className={`w-2.5 h-2.5 ${scheduleReady ? "text-primary" : "text-muted-foreground"}`} />
                                <span className={`text-[10px] ${scheduleReady ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                                  {scheduleReady ? "⬆ Retorno agora" : `Retorno: ${fmtDateShort(new Date(item.lead.agendamento_retorno!))}`}
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className={`w-2.5 h-2.5 ${hoursLeft !== null && hoursLeft <= 0 ? "text-destructive" : "text-muted-foreground"}`} />
                                <span className={`text-[10px] ${hoursLeft !== null && hoursLeft <= 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                  {item.proximoContato
                                    ? (hoursLeft !== null && hoursLeft <= 0
                                      ? `Expirado ${formatCountdown(item.proximoContato, now)}`
                                      : `Expira em ${formatCountdown(item.proximoContato, now)}`)
                                    : "Sem prazo"}
                                </span>
                              </>
                            )}
                          </div>
                          {item.lead.responsavel_id && (() => {
                            const resp = profiles.find(p => p.id === item.lead.responsavel_id);
                            if (!resp) return null;
                            const firstName = resp.nome.split(" ")[0];
                            const shortName = resp.nome.length > 18 ? firstName : resp.nome;
                            return (
                              <div className="flex items-center gap-1 group/resp relative">
                                <User className="w-2.5 h-2.5 text-muted-foreground" />
                                <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{shortName}</span>
                                {shortName !== resp.nome && (
                                  <div className="absolute bottom-full left-0 mb-1 hidden group-hover/resp:block z-50 bg-popover border border-border text-popover-foreground text-[11px] px-2 py-1 rounded shadow-md whitespace-nowrap">
                                    {resp.nome}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
             </ScrollArea>

            {/* ─── Capture Queue Section ─── */}
            {capturaQueue.length > 0 && !isVisionMode && (
              <div className="border-t">
                <div className="px-3 py-2 flex items-center justify-between bg-muted/30">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <UserCheck className="w-3 h-3" /> Captura ({capturaQueue.length})
                  </span>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <div className="divide-y divide-border">
                    {capturaQueue.map(item => {
                      const phones = item.contatos.filter(c => c.tipo_contato === "telefone");
                      return (
                        <div key={item.lead.id} className="px-3 py-2 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{item.lead.nome}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {phones.length > 0 ? phones[0].valor : "Sem telefone"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            className="h-7 text-[10px] px-2 gap-1"
                            onClick={() => reserveLeadMutation.mutate(item.lead.id)}
                            disabled={reserveLeadMutation.isPending}
                          >
                            {reserveLeadMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                            Capturar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}
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

                      {(() => {
                        // Group timeline items by minute to consolidate
                        const groups: { key: string; date: string; items: typeof timeline }[] = [];
                        timeline.forEach(item => {
                          const minuteKey = item.date.slice(0, 16); // YYYY-MM-DDTHH:mm
                          const userId = item.usuario_id || item.colaborador_id || "";
                          const groupKey = `${minuteKey}_${userId}`;
                          const existing = groups.find(g => g.key === groupKey);
                          if (existing) {
                            existing.items.push(item);
                          } else {
                            groups.push({ key: groupKey, date: item.date, items: [item] });
                          }
                        });

                        return groups.map((group) => {
                          const mainItem = group.items[0];
                          const IconComp = mainItem.type === "historico"
                            ? (EVENTO_ICONS[mainItem.evento || ""] || Clock)
                            : PhoneCall;
                          const isInteracao = mainItem.type === "interacao" || mainItem.evento === "tentativa_contato";
                          const isTransfer = mainItem.evento === "transferencia_automatica";
                          const isCriacao = mainItem.evento === "criacao";
                          const isCriacaoVinculado = isCriacao && mainItem.descricao?.includes("vinculado ao cliente existente");
                          const isConversao = mainItem.evento === "conversao_cliente";

                          return (
                            <div key={group.key} className="relative pl-10 pb-4 last:pb-0">
                              <div className={`absolute left-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-background ${
                                isCriacaoVinculado ? "bg-amber-500" :
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
                                isCriacaoVinculado ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700" :
                                isCriacao ? "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" :
                                isConversao ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                                "bg-card border-border"
                              }`}>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {group.items.length === 1 ? (
                                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isCriacaoVinculado ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""}`}>
                                        {mainItem.type === "historico"
                                          ? (isCriacaoVinculado ? "⚠️ Cliente na base" : (EVENTO_LABELS[mainItem.evento || ""] || mainItem.evento))
                                          : `${mainItem.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}`}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                        {group.items.length} registros
                                      </Badge>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDate(group.date)}</span>
                                </div>

                                {/* Consolidated content */}
                                <div className="mt-1.5 space-y-1">
                                  {group.items.map(item => (
                                    <div key={item.id}>
                                      {item.type === "historico" && item.descricao && (
                                        <p className="text-[11px] text-foreground/80">• {item.descricao}</p>
                                      )}
                                      {item.type === "interacao" && (
                                        <p className="text-[11px] text-foreground/80">
                                          • {item.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}
                                          {item.numero_utilizado ? ` → ${item.numero_utilizado}` : ""}
                                          {item.resultado ? `: ${item.resultado}` : ""}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  {getProfileName(mainItem.usuario_id || mainItem.colaborador_id)}
                                </p>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </Card>
        </div>

        {/* ─── RIGHT: Lead Details & Actions ────────── */}
        <div className="col-span-4 flex flex-col min-h-0">
          {!selectedLead ? (
            <Card className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <div className="text-center space-y-2">
                <PhoneCall className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p>Selecione um lead para ver ações</p>
              </div>
            </Card>
          ) : (
            <ScrollArea className="flex-1">
              <div className="space-y-3 pr-2">
                {/* Lead Header */}
                <Card>
                  <CardHeader className="py-2.5 px-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">{selectedLead.nome}</CardTitle>
                        <p className="text-[10px] text-primary/80 font-medium">Origem: {getCampanhaNome(selectedLead) || "Não especificada"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Responsável: {getProfileName(selectedLead.responsavel_id)} · Criado em {fmtDate(selectedLead.data_criacao)}
                        </p>
                      </div>
                      {statusBadge(selectedLead.status_lead)}
                    </div>
                    {selectedQueueInfo && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Tentativas realizadas: <span className="font-semibold">{tentativasRealizadas}</span>
                        {selectedQueueInfo.proximoContato && (<> · Próximo: <span className={`font-semibold ${selectedQueueInfo.proximoContato < new Date() ? "text-destructive" : ""}`}>{fmtDateShort(selectedQueueInfo.proximoContato)}</span></>)}
                      </p>
                    )}
                  </CardHeader>
                </Card>

                {/* Ação Popover Button */}
                {!isVisionMode && <div className="flex items-center gap-2">
                  {selectedLead.status_lead !== "convertido" && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="sm" className="h-8 text-xs gap-1.5 press-effect">
                        <Zap className="w-3.5 h-3.5" /> Ação
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-1" align="start">
                      <div className="space-y-0.5">
                        <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8" onClick={() => setShowInteraction(true)}>
                          <PhoneCall className="w-3.5 h-3.5 mr-2" /> {tentativasCicloAtual === 0 ? "Registrar Lead" : `Registrar Tentativa ${tentativasCicloAtual}`}
                        </Button>
                        <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8" onClick={() => { setScheduleDate(undefined); setScheduleHour("09"); setScheduleMinute("00"); setShowSchedule(true); }}>
                          <CalendarClock className="w-3.5 h-3.5 mr-2" /> Agendar Retorno
                        </Button>
                        {selectedLead.status_lead !== "convertido" && (
                          <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8" onClick={openConversion}>
                            <UserPlus className="w-3.5 h-3.5 mr-2" /> Converter em Cliente
                          </Button>
                        )}
                        {canArchiveLead && selectedLead.status_lead !== "arquivado" && selectedLead.status_lead !== "convertido" && (
                          <Button size="sm" variant="ghost" className="w-full justify-start text-xs h-8 text-destructive hover:text-destructive" onClick={async () => {
                            if (!profile) return;
                            await supabase.from("leads").update({ status_lead: "arquivado" }).eq("id", selectedLead.id);
                            await supabase.from("lead_historico").insert({ lead_id: selectedLead.id, usuario_id: profile.id, tipo_evento: "lead_arquivado", descricao: "Lead arquivado manualmente" });
                            setSelectedLead(prev => prev ? { ...prev, status_lead: "arquivado" } : null);
                            updateLeadInCache(selectedLead.id, { status_lead: "arquivado" });
                            refetchHistorico();
                            toast.success("Lead arquivado.");
                          }}>
                            <Archive className="w-3.5 h-3.5 mr-2" /> Arquivar Lead
                          </Button>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  )}
                  {selectedLead.status_lead === "convertido" && (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 text-xs">✓ Convertido</Badge>
                  )}
                  {selectedLead.agendamento_retorno && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border text-[11px]">
                      <CalendarClock className="w-3 h-3 text-primary" />
                      <span className="font-medium">{fmtDate(selectedLead.agendamento_retorno)}</span>
                      <button className="text-destructive/60 hover:text-destructive text-[10px] underline ml-1" onClick={async () => {
                        await supabase.from("leads").update({ agendamento_retorno: null } as any).eq("id", selectedLead.id);
                        if (profile) {
                          await supabase.from("lead_historico").insert({ lead_id: selectedLead.id, usuario_id: profile.id, tipo_evento: "agendamento_removido", descricao: "Agendamento de retorno removido manualmente" });
                        }
                        setSelectedLead(prev => prev ? { ...prev, agendamento_retorno: null } : null);
                        updateLeadInCache(selectedLead.id, { agendamento_retorno: null });
                        refetchHistorico();
                        toast.success("Agendamento removido.");
                      }}>×</button>
                    </div>
                  )}
                  {allAttemptsExhausted && selectedLead.status_lead !== "perdido" && selectedLead.status_lead !== "convertido" && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-0 text-[10px] gap-1"><AlertTriangle className="w-3 h-3" /> {maxTentativas} tentativas</Badge>
                  )}
                </div>}

                {/* Dados do Lead - vertical stacking */}
                <Card>
                  <CardHeader className="py-2 px-3 border-b">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                      <User className="w-3 h-3" /> Dados do Lead
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 space-y-2.5">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Perfil Identificado</Label>
                      <Select value={localPlanoId || "none"} onValueChange={v => setLocalPlanoId(v === "none" ? null : v)} disabled={isVisionMode}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {planos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome_plano}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Repetidor</Label>
                      <Select value={localRepetidor || "none"} onValueChange={v => setLocalRepetidor(v === "none" ? null : v)} disabled={isVisionMode}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          <SelectItem value="fast">Fast</SelectItem>
                          <SelectItem value="dual">Dual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Objeção</Label>
                      <Select value={localObjecaoId} onValueChange={v => setLocalObjecaoId(v)} disabled={isVisionMode}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {objecoes.map(o => <SelectItem key={o.id} value={o.id}>{o.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Address */}
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Endereço</p>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Cidade</Label>
                          <div className="flex gap-1">
                            <Select value={localCidadeId || "none"} onValueChange={v => {
                              const val = v === "none" ? null : v;
                              setLocalCidadeId(val); setLocalBairroId(null); setLocalRuaId(null);
                            }} disabled={isVisionMode}>
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {endCidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {!isVisionMode && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setDetailQuickAddType("cidade"); setDetailQuickAddNome(""); }}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bairro</Label>
                          <div className="flex gap-1">
                            <Select value={localBairroId || "none"} onValueChange={v => {
                              const val = v === "none" ? null : v;
                              setLocalBairroId(val); setLocalRuaId(null);
                            }} disabled={!localCidadeId || isVisionMode}>
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {endBairros.filter(b => b.cidade_id === localCidadeId).map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {!isVisionMode && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setDetailQuickAddType("bairro"); setDetailQuickAddNome(""); }} disabled={!localCidadeId}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rua</Label>
                          <div className="flex gap-1">
                            <Select value={localRuaId || "none"} onValueChange={v => setLocalRuaId(v === "none" ? null : v)} disabled={!localBairroId || isVisionMode}>
                              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Nenhuma</SelectItem>
                                {endRuas.filter(r => r.bairro_id === localBairroId).map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            {!isVisionMode && <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setDetailQuickAddType("rua"); setDetailQuickAddNome(""); }} disabled={!localBairroId}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Nº</Label>
                          <Input className="h-8 text-xs" value={localNumeroEnd} onChange={e => setLocalNumeroEnd(e.target.value)} placeholder="Nº" disabled={isVisionMode} />
                        </div>
                      </div>

                      {/* CEP section */}
                      {localRuaId && (() => {
                        const ruaSelecionada = endRuas.find(r => r.id === localRuaId);
                        const ceps = ruaSelecionada?.cep || [];
                        return (
                          <div className="bg-muted/30 rounded-lg p-2.5 space-y-2">
                            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">CEPs da rua</Label>
                            {ceps.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {ceps.map((c, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs font-mono gap-1">
                                    {c}
                                    <button className="ml-0.5 hover:text-destructive transition-colors" title="Remover CEP" onClick={async () => {
                                      const newCeps = ceps.filter((_, i) => i !== idx);
                                      await supabase.from("ruas").update({ cep: newCeps }).eq("id", localRuaId!);
                                      queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                                      toast.success("CEP removido.");
                                    }}>
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Nenhum CEP</p>
                            )}
                            <AddCepInline ruaId={localRuaId!} existingCeps={ceps} onSaved={() => queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] })} />
                          </div>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                {/* Contacts Card */}
                <Card>
                  <CardHeader className="py-2 px-3 border-b flex-row items-center justify-between">
                    <CardTitle className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                      <Phone className="w-3 h-3" /> Contatos
                    </CardTitle>
                    {!isVisionMode && <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setShowAddPhone(true)}>
                      <Plus className="w-3 h-3 mr-0.5" /> Adicionar
                    </Button>}
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
                            {(isAdmin || hasRole("avaliador")) && !isVisionMode && (
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
              </div>
            </ScrollArea>
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
                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map(m => (
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
                updateLeadInCache(selectedLead!.id, { agendamento_retorno: dt.toISOString() });
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
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader><DialogTitle>Novo Lead</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[65vh] pr-3">
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

              {/* Extra contacts */}
              {createExtraContatos.map((contato, idx) => (
                <div key={idx} className="border rounded-md p-2 space-y-1.5 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Contato extra #{idx + 1}</Label>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCreateExtraContatos(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <Select value={contato.tipo} onValueChange={v => setCreateExtraContatos(prev => prev.map((c, i) => i === idx ? { ...c, tipo: v, temWhatsapp: v !== "telefone" ? false : c.temWhatsapp } : c))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="email">E-mail</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-8 text-xs"
                    placeholder={contato.tipo === "telefone" ? "(00) 00000-0000" : contato.tipo === "email" ? "email@exemplo.com" : "Contato..."}
                    value={contato.valor}
                    onChange={e => setCreateExtraContatos(prev => prev.map((c, i) => i === idx ? { ...c, valor: contato.tipo === "telefone" ? applyPhoneMask(e.target.value) : e.target.value } : c))}
                  />
                  {contato.tipo === "telefone" && (
                    <div className="flex items-center gap-2">
                      <Switch checked={contato.temWhatsapp} onCheckedChange={v => setCreateExtraContatos(prev => prev.map((c, i) => i === idx ? { ...c, temWhatsapp: v } : c))} />
                      <Label className="text-xs">WhatsApp</Label>
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setCreateExtraContatos(prev => [...prev, { tipo: "telefone", valor: "", temWhatsapp: false }])}>
                <Plus className="w-3 h-3 mr-1" /> Adicionar contato
              </Button>

              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Nome do lead" value={createName} onChange={e => setCreateName(e.target.value)} />
              </div>

              {/* Origem / Campanha */}
              <div className="space-y-1.5">
                <Label>Origem (Campanha)</Label>
                <Select value={createCampanhaId} onValueChange={setCreateCampanhaId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Manual (sem campanha)</SelectItem>
                    {campanhasAtivas.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ─── Address fields ──────────────── */}
              <div className="border-t pt-3 mt-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Endereço</p>
                <div className="space-y-2">
                  {/* CEP search */}
                  <div className="space-y-1">
                    <Label className="text-xs">Buscar por CEP</Label>
                    <div className="flex gap-1">
                      <Input
                        className="h-8 text-xs flex-1"
                        placeholder="Digite o CEP..."
                        value={createCepSearch}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                          setCreateCepSearch(v);
                          setCepNotFound(false);
                          setNewRuaNomeFromCep("");
                          setNewBairroNomeFromCep("");
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={createCepSearch.length < 5}
                        onClick={() => {
                          const cep = createCepSearch.trim();
                          // Search ruas that have this CEP
                          const match = endRuas.find(r => r.cep && r.cep.some(c => c.replace(/\D/g, "").includes(cep)));
                          if (match) {
                            // Auto-fill: find bairro and cidade
                            const bairro = endBairros.find(b => b.id === match.bairro_id);
                            if (bairro) {
                              setCreateCidadeId(bairro.cidade_id);
                              setCreateBairroId(bairro.id);
                              setCreateBairroSearch(bairro.nome);
                            }
                            setCreateRuaId(match.id);
                            setCreateRuaSearch(match.nome);
                            setCepNotFound(false);
                            toast.success(`CEP encontrado: ${match.nome}`);
                          } else {
                            setCepNotFound(true);
                          }
                        }}
                      >
                        <Search className="w-3 h-3 mr-1" /> Buscar
                      </Button>
                    </div>
                    {cepNotFound && (
                      <div className="border border-dashed border-destructive/40 rounded-md p-2 mt-1 space-y-2 bg-destructive/5">
                        <p className="text-xs text-destructive font-medium">CEP não encontrado. Busque ou cadastre o endereço:</p>
                        <div className="space-y-1">
                          <Label className="text-xs">Cidade</Label>
                          <Select value={createCidadeId || "none"} onValueChange={v => {
                            setCreateCidadeId(v === "none" ? "" : v);
                            setNewBairroNomeFromCep(""); setNewRuaNomeFromCep("");
                            setCreateBairroId(""); setCreateRuaId("");
                          }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nenhuma</SelectItem>
                              {endCidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Bairro fuzzy search */}
                        <div className="space-y-1">
                          <Label className="text-xs">Bairro *</Label>
                          <div className="relative">
                            <Input
                              className="h-8 text-xs"
                              placeholder="Digite para buscar ou criar bairro..."
                              value={newBairroNomeFromCep}
                              onChange={e => { setNewBairroNomeFromCep(e.target.value); setCreateBairroId(""); setCreateRuaId(""); setNewRuaNomeFromCep(""); }}
                              disabled={!createCidadeId}
                            />
                            {newBairroNomeFromCep.length >= 2 && !createBairroId && createCidadeId && (() => {
                              const term = newBairroNomeFromCep.toLowerCase();
                              const matches = endBairros.filter(b => b.cidade_id === createCidadeId && b.nome.toLowerCase().includes(term));
                              return (matches.length > 0 || newBairroNomeFromCep.trim().length >= 2) ? (
                                <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                                  {matches.map(b => (
                                    <button key={b.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                      onClick={() => { setCreateBairroId(b.id); setNewBairroNomeFromCep(b.nome); }}>
                                      {b.nome}
                                    </button>
                                  ))}
                                  {!matches.some(b => b.nome.toLowerCase() === term) && newBairroNomeFromCep.trim().length >= 2 && (
                                    <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-primary font-medium"
                                      onClick={async () => {
                                        try {
                                          const { data: nb, error } = await supabase.from("bairros").insert({ nome: newBairroNomeFromCep.trim(), cidade_id: createCidadeId }).select().single();
                                          if (error) throw error;
                                          queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] });
                                          setCreateBairroId(nb.id); setNewBairroNomeFromCep(nb.nome);
                                          toast.success("Bairro criado!");
                                        } catch (err: any) { toast.error(err.message); }
                                      }}>
                                      <Plus className="w-3 h-3 inline mr-1" /> Criar "{newBairroNomeFromCep.trim()}"
                                    </button>
                                  )}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        {/* Rua fuzzy search */}
                        <div className="space-y-1">
                          <Label className="text-xs">Rua *</Label>
                          <div className="relative">
                            <Input
                              className="h-8 text-xs"
                              placeholder="Digite para buscar ou criar rua..."
                              value={newRuaNomeFromCep}
                              onChange={e => { setNewRuaNomeFromCep(e.target.value); setCreateRuaId(""); }}
                              disabled={!createBairroId}
                            />
                            {newRuaNomeFromCep.length >= 2 && !createRuaId && createBairroId && (() => {
                              const term = newRuaNomeFromCep.toLowerCase();
                              const matches = endRuas.filter(r => r.bairro_id === createBairroId && r.nome.toLowerCase().includes(term));
                              return (matches.length > 0 || newRuaNomeFromCep.trim().length >= 2) ? (
                                <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                                  {matches.map(r => (
                                    <button key={r.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                      onClick={async () => {
                                        // Select existing rua and add CEP to it
                                        setCreateRuaId(r.id); setNewRuaNomeFromCep(r.nome);
                                        const existingCeps = r.cep || [];
                                        const cepNorm = createCepSearch.trim();
                                        if (cepNorm && !existingCeps.some(c => c.replace(/\D/g, "") === cepNorm)) {
                                          await supabase.from("ruas").update({ cep: [...existingCeps, cepNorm] }).eq("id", r.id);
                                          queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                                          toast.success(`CEP vinculado à rua ${r.nome}`);
                                        }
                                        // Also set the main address fields
                                        setCreateBairroSearch(newBairroNomeFromCep);
                                        setCreateRuaSearch(r.nome);
                                        setCepNotFound(false);
                                      }}>
                                      {r.nome} {r.cep?.length ? `(${r.cep.join(", ")})` : ""}
                                    </button>
                                  ))}
                                  {!matches.some(r => r.nome.toLowerCase() === term) && newRuaNomeFromCep.trim().length >= 2 && (
                                    <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-primary font-medium"
                                      onClick={async () => {
                                        try {
                                          const { data: nr, error } = await supabase.from("ruas").insert({ nome: newRuaNomeFromCep.trim(), bairro_id: createBairroId, cep: createCepSearch.trim() ? [createCepSearch.trim()] : [] }).select().single();
                                          if (error) throw error;
                                          queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                                          setCreateRuaId(nr.id); setNewRuaNomeFromCep(nr.nome);
                                          setCreateBairroSearch(newBairroNomeFromCep);
                                          setCreateRuaSearch(nr.nome);
                                          setCepNotFound(false);
                                          toast.success("Rua criada com CEP vinculado!");
                                        } catch (err: any) { toast.error(err.message); }
                                      }}>
                                      <Plus className="w-3 h-3 inline mr-1" /> Criar "{newRuaNomeFromCep.trim()}"
                                    </button>
                                  )}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Cidade</Label>
                    <div className="flex gap-1">
                      <Select value={createCidadeId || "none"} onValueChange={v => {
                        setCreateCidadeId(v === "none" ? "" : v);
                        setCreateBairroId(""); setCreateRuaId(""); setCreateBairroSearch(""); setCreateRuaSearch("");
                      }}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          {endCidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setQuickAddType("cidade"); setQuickAddNome(""); }}>
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Bairro</Label>
                    <div className="flex gap-1">
                      <div className="flex-1 relative">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Digite para buscar bairro..."
                          value={createBairroSearch}
                          onChange={e => { setCreateBairroSearch(e.target.value); setCreateBairroId(""); setCreateRuaId(""); setCreateRuaSearch(""); }}
                          disabled={!createCidadeId}
                        />
                        {createBairroSearch && !createBairroId && createCidadeId && (() => {
                          const term = createBairroSearch.toLowerCase();
                          const matches = endBairros.filter(b => b.cidade_id === createCidadeId && b.nome.toLowerCase().includes(term));
                          if (matches.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 right-0 bg-popover border rounded-md shadow-md max-h-40 overflow-auto mt-0.5">
                              {matches.map(b => (
                                <button key={b.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setCreateBairroId(b.id); setCreateBairroSearch(b.nome); setCreateRuaId(""); setCreateRuaSearch(""); }}>
                                  {b.nome}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setQuickAddType("bairro"); setQuickAddNome(""); }} disabled={!createCidadeId}>
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Rua</Label>
                    <div className="flex gap-1">
                      <div className="flex-1 relative">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Digite para buscar rua..."
                          value={createRuaSearch}
                          onChange={e => { setCreateRuaSearch(e.target.value); setCreateRuaId(""); }}
                          disabled={!createBairroId}
                        />
                        {createRuaSearch && !createRuaId && createBairroId && (() => {
                          const term = createRuaSearch.toLowerCase();
                          const matches = endRuas.filter(r => r.bairro_id === createBairroId && r.nome.toLowerCase().includes(term));
                          if (matches.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 right-0 bg-popover border rounded-md shadow-md max-h-40 overflow-auto mt-0.5">
                              {matches.map(r => (
                                <button key={r.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-accent" onClick={() => { setCreateRuaId(r.id); setCreateRuaSearch(r.nome); }}>
                                  {r.nome}{r.cep && r.cep.length > 0 ? ` (CEP: ${r.cep.join(", ")})` : ""}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setQuickAddType("rua"); setQuickAddNome(""); }} disabled={!createBairroId}>
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {createRuaId && (() => {
                      const selectedRua = endRuas.find(r => r.id === createRuaId);
                      if (selectedRua?.cep && selectedRua.cep.length > 0) {
                        return <p className="text-xs text-muted-foreground mt-0.5">CEP: {selectedRua.cep.join(", ")}</p>;
                      }
                      return <p className="text-xs text-muted-foreground mt-0.5">Sem CEP cadastrado</p>;
                    })()}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Número</Label>
                    <Input className="h-8 text-xs" placeholder="Nº" value={createNumeroEnd} onChange={e => setCreateNumeroEnd(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => createLeadMutation.mutate()} disabled={createLeadMutation.isPending || !createName.trim() || !createPhone.trim()} className="press-effect">
              {createLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer History Dialog */}
      <Dialog open={showTransferHistory} onOpenChange={setShowTransferHistory}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" /> Histórico de Transferências
            </DialogTitle>
            <DialogDescription>
              Registro de todas as movimentações de leads entre responsáveis
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {loadingTransfers ? (
              <div className="p-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Carregando...</div>
            ) : transferHistory.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhuma transferência registrada.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Executado por</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transferHistory.map((t: any) => {
                    const acaoMap: Record<string, { label: string; color: string }> = {
                      transferencia_automatica: { label: "Transferência", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
                      transferencia_manual: { label: "Transferência Manual", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
                      transferencia_decisao: { label: "Decisão Avaliador", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
                      lead_capturado: { label: "Captura", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
                      reserva_liberada: { label: "Reserva Liberada", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
                    };
                    const acao = acaoMap[t.tipo_evento] || { label: t.tipo_evento, color: "bg-muted text-muted-foreground" };
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(t.data_evento), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{t.leads?.nome || "—"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] border-0 ${acao.color}`}>{acao.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{t.profiles?.nome || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate" title={t.descricao || ""}>
                          {t.descricao || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Duplicate Phone Detection Modal */}
      <Dialog open={showDuplicateModal} onOpenChange={v => { if (!v) { setShowDuplicateModal(false); setDuplicateLeadData(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Telefone já cadastrado
            </DialogTitle>
            <DialogDescription>
              Um lead com este telefone já existe no sistema. O que deseja fazer?
            </DialogDescription>
          </DialogHeader>
          {duplicateLeadData && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nome:</span>
                  <span className="font-medium">{duplicateLeadData.lead.nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telefone:</span>
                  <span className="font-medium">{duplicateLeadData.contatos.find((c: any) => c.tipo_contato === "telefone")?.valor || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className="text-xs">{duplicateLeadData.lead.status_lead}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Responsável:</span>
                  <span className="font-medium">{duplicateLeadData.responsavel || "Sem responsável"}</span>
                </div>
                {duplicateLeadData.ultimaInteracao && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última interação:</span>
                    <span className="text-xs">{new Date(duplicateLeadData.ultimaInteracao.data_interacao).toLocaleDateString("pt-BR")} — {duplicateLeadData.ultimaInteracao.tipo_contato}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full press-effect"
                  onClick={async () => {
                    if (!profile || !duplicateLeadData) return;
                    try {
                      const lead = duplicateLeadData.lead;
                      const prevResponsavel = duplicateLeadData.responsavel || "nenhum";
                      await supabase.from("leads").update({ responsavel_id: profile.id, status_lead: "em_contato" }).eq("id", lead.id);
                      await resetTasksForTransfer(lead.id, profile.id);
                      await supabase.from("lead_historico").insert({
                        lead_id: lead.id, usuario_id: profile.id,
                        tipo_evento: "transferencia_manual",
                        descricao: `Lead transferido manualmente de "${prevResponsavel}" para "${profile.nome}" via detecção de duplicidade`,
                      });
                      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
                      setShowDuplicateModal(false); setShowCreate(false); setDuplicateLeadData(null);
                      setSelectedLead({ ...lead, responsavel_id: profile.id, status_lead: "em_contato" });
                      toast.success("Lead assumido com sucesso!");
                    } catch (err: any) { toast.error(err.message); }
                  }}
                >
                  <UserCheck className="w-4 h-4 mr-2" /> Assumir Lead
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => { setShowDuplicateModal(false); setDuplicateLeadData(null); }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!quickAddType} onOpenChange={v => !v && setQuickAddType(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar {quickAddType === "cidade" ? "Cidade" : quickAddType === "bairro" ? "Bairro" : "Rua"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={quickAddNome} onChange={e => setQuickAddNome(e.target.value)} placeholder="Digite o nome..." autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAddType(null)}>Cancelar</Button>
            <Button
              disabled={!quickAddNome.trim()}
              onClick={async () => {
                try {
                  if (quickAddType === "cidade") {
                    const { data, error } = await supabase.from("cidades").insert({ nome: quickAddNome.trim() }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-cidades"] });
                    setCreateCidadeId(data.id);
                  } else if (quickAddType === "bairro" && createCidadeId) {
                    const { data, error } = await supabase.from("bairros").insert({ nome: quickAddNome.trim(), cidade_id: createCidadeId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] });
                    setCreateBairroId(data.id);
                    setCreateBairroSearch(quickAddNome.trim());
                  } else if (quickAddType === "rua" && createBairroId) {
                    const { data, error } = await supabase.from("ruas").insert({ nome: quickAddNome.trim(), bairro_id: createBairroId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                    setCreateRuaId(data.id);
                    setCreateRuaSearch(quickAddNome.trim());
                  }
                  toast.success("Cadastrado!");
                  setQuickAddType(null);
                } catch (err: any) {
                  toast.error(err.message?.includes("duplicate") ? "Já existe um registro com esse nome." : err.message);
                }
              }}
              className="press-effect"
            >
              <Plus className="w-4 h-4 mr-1" /> Cadastrar
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
            <DialogTitle>{tentativasCicloAtual === 0 ? "Registrar Lead" : `Registrar Tentativa ${tentativasCicloAtual}`} — {selectedLead?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Tentativa: <Badge variant="secondary">{tentativasCicloAtual}</Badge>
            </div>
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
            {isLastAttempt && selectedLead?.status_lead !== "convertido" && (
              <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800 dark:text-amber-200 text-xs">Última tentativa!</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
                  Se não houver conversão, o lead será enviado automaticamente para a fila do avaliador e sairá da sua tela.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInteraction(false)}>Cancelar</Button>
            <Button onClick={() => interactionMutation.mutate()} disabled={interactionMutation.isPending || !interNumero} className="press-effect">
              {interactionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PhoneCall className="w-4 h-4 mr-1" />}
              {tentativasCicloAtual === 0 ? "Registrar Lead" : `Registrar Tentativa ${tentativasCicloAtual}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversion Dialog — 2-step: form → review */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {convStep === "form" ? "Converter Lead em Cliente" : "Confirmar Conversão"}
            </DialogTitle>
            {convStep === "review" && (
              <DialogDescription>Verifique se todos os dados estão corretos antes de concluir.</DialogDescription>
            )}
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            {convStep === "form" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">CPF *</Label>
                  <div className="relative">
                    <Input placeholder="000.000.000-00" value={convForm.cpf} onChange={e => handleConvCpfChange(e.target.value)} className="h-9" />
                    {convCpfSearching && <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-2 top-3 text-muted-foreground" />}
                  </div>
                  {convCpfLookedUp && <p className="text-xs text-green-600 flex items-center gap-1"><UserCheck className="w-3 h-3" /> Cliente encontrado — dados preenchidos</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nome Completo *</Label>
                  <Input value={convForm.nome} onChange={e => setConvForm(f => ({ ...f, nome: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">RG *</Label>
                  <Input value={convForm.rg} onChange={e => setConvForm(f => ({ ...f, rg: e.target.value }))} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nome da Mãe *</Label>
                  <Input value={convForm.nome_mae} onChange={e => setConvForm(f => ({ ...f, nome_mae: e.target.value }))} className="h-9" />
                </div>
                {leadContatos.length > 0 && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contatos do Lead</p>
                    {leadContatos.filter(c => c.tipo_contato === "telefone").map(c => (
                      <p key={c.id} className="text-xs flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground" /> {c.valor} {c.tem_whatsapp ? <Badge variant="secondary" className="text-[10px] h-4 px-1">WhatsApp</Badge> : ""}</p>
                    ))}
                    {leadContatos.filter(c => c.tipo_contato === "email").map(c => (
                      <p key={c.id} className="text-xs flex items-center gap-1.5"><FileText className="w-3 h-3 text-muted-foreground" /> {c.valor}</p>
                    ))}
                  </div>
                )}
                <div className="border rounded-md p-3 space-y-3 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Endereço</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Buscar por CEP</Label>
                    <div className="flex gap-1">
                      <Input className="h-8 text-xs flex-1" placeholder="Digite o CEP..." value={convCepSearch}
                        onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 8); setConvCepSearch(v); setConvCepNotFound(false); setConvNewBairroNome(""); setConvNewRuaNome(""); }} />
                      <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={convCepSearch.length < 5}
                        onClick={() => {
                          const cep = convCepSearch.trim();
                          const match = endRuas.find(r => r.cep && r.cep.some(c => c.replace(/\D/g, "").includes(cep)));
                          if (match) {
                            const bairro = endBairros.find(b => b.id === match.bairro_id);
                            if (bairro) { setConvCidadeId(bairro.cidade_id); setConvBairroId(bairro.id); }
                            setConvRuaId(match.id); setConvCepNotFound(false);
                            toast.success(`CEP encontrado: ${match.nome}`);
                          } else { setConvCepNotFound(true); }
                        }}>
                        <Search className="w-3 h-3 mr-1" /> Buscar
                      </Button>
                    </div>
                  </div>
                  {convRuaId && !convCepNotFound && (() => {
                    const rua = endRuas.find(r => r.id === convRuaId);
                    const bairro = endBairros.find(b => b.id === convBairroId);
                    const cidade = endCidades.find(c => c.id === convCidadeId);
                    return (
                      <div className="p-2 rounded-md border bg-muted/30 space-y-1">
                        <p className="text-xs"><span className="font-medium">Cidade:</span> {cidade?.nome || "—"}</p>
                        <p className="text-xs"><span className="font-medium">Bairro:</span> {bairro?.nome || "—"}</p>
                        <p className="text-xs"><span className="font-medium">Rua:</span> {rua?.nome || "—"}</p>
                        <p className="text-xs"><span className="font-medium">CEP:</span> {rua?.cep?.[0] || "—"}</p>
                        <Button type="button" variant="link" size="sm" className="h-6 text-xs p-0" onClick={() => { setConvCidadeId(null); setConvBairroId(null); setConvRuaId(null); setConvCepSearch(""); setConvCepNotFound(false); }}>Alterar endereço</Button>
                      </div>
                    );
                  })()}
                  {convCepNotFound && (
                    <div className="border border-dashed border-destructive/40 rounded-md p-2 space-y-2 bg-destructive/5">
                      <p className="text-xs text-destructive font-medium">CEP não encontrado. Busque ou cadastre:</p>
                      <div className="space-y-1">
                        <Label className="text-xs">Cidade</Label>
                        <Select value={convCidadeId || "none"} onValueChange={v => { setConvCidadeId(v === "none" ? null : v); setConvBairroId(null); setConvRuaId(null); setConvNewBairroNome(""); setConvNewRuaNome(""); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent><SelectItem value="none">Nenhuma</SelectItem>{endCidades.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Bairro *</Label>
                        <div className="relative">
                          <Input className="h-8 text-xs" placeholder="Digite para buscar ou criar bairro..." value={convNewBairroNome}
                            onChange={e => { setConvNewBairroNome(e.target.value); setConvBairroId(null); setConvRuaId(null); setConvNewRuaNome(""); }} disabled={!convCidadeId} />
                          {convNewBairroNome.length >= 2 && !convBairroId && convCidadeId && (() => {
                            const term = convNewBairroNome.toLowerCase();
                            const matches = endBairros.filter(b => b.cidade_id === convCidadeId && b.nome.toLowerCase().includes(term));
                            return (matches.length > 0 || convNewBairroNome.trim().length >= 2) ? (
                              <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                                {matches.map(b => (<button key={b.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors" onClick={() => { setConvBairroId(b.id); setConvNewBairroNome(b.nome); }}>{b.nome}</button>))}
                                {!matches.some(b => b.nome.toLowerCase() === term) && convNewBairroNome.trim().length >= 2 && (
                                  <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-primary font-medium"
                                    onClick={async () => { try { const { data: nb, error } = await supabase.from("bairros").insert({ nome: convNewBairroNome.trim(), cidade_id: convCidadeId! }).select().single(); if (error) throw error; queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] }); setConvBairroId(nb.id); setConvNewBairroNome(nb.nome); toast.success("Bairro criado!"); } catch (err: any) { toast.error(err.message); } }}>
                                    <Plus className="w-3 h-3 inline mr-1" /> Criar "{convNewBairroNome.trim()}"
                                  </button>
                                )}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rua *</Label>
                        <div className="relative">
                          <Input className="h-8 text-xs" placeholder="Digite para buscar ou criar rua..." value={convNewRuaNome}
                            onChange={e => { setConvNewRuaNome(e.target.value); setConvRuaId(null); }} disabled={!convBairroId} />
                          {convNewRuaNome.length >= 2 && !convRuaId && convBairroId && (() => {
                            const term = convNewRuaNome.toLowerCase();
                            const matches = endRuas.filter(r => r.bairro_id === convBairroId && r.nome.toLowerCase().includes(term));
                            return (matches.length > 0 || convNewRuaNome.trim().length >= 2) ? (
                              <div className="absolute z-50 w-full bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-32 overflow-y-auto">
                                {matches.map(r => (
                                  <button key={r.id} type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                    onClick={async () => { setConvRuaId(r.id); setConvNewRuaNome(r.nome); const existingCeps = r.cep || []; const cepNorm = convCepSearch.trim(); if (cepNorm && !existingCeps.some(c => c.replace(/\D/g, "") === cepNorm)) { await supabase.from("ruas").update({ cep: [...existingCeps, cepNorm] }).eq("id", r.id); queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] }); toast.success(`CEP vinculado à rua ${r.nome}`); } setConvCepNotFound(false); }}>
                                    {r.nome} {r.cep?.length ? `(${r.cep.join(", ")})` : ""}
                                  </button>
                                ))}
                                {!matches.some(r => r.nome.toLowerCase() === term) && convNewRuaNome.trim().length >= 2 && (
                                  <button type="button" className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors text-primary font-medium"
                                    onClick={async () => { try { const { data: nr, error } = await supabase.from("ruas").insert({ nome: convNewRuaNome.trim(), bairro_id: convBairroId!, cep: convCepSearch.trim() ? [convCepSearch.trim()] : [] }).select().single(); if (error) throw error; queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] }); setConvRuaId(nr.id); setConvNewRuaNome(nr.nome); setConvCepNotFound(false); toast.success("Rua criada com CEP vinculado!"); } catch (err: any) { toast.error(err.message); } }}>
                                    <Plus className="w-3 h-3 inline mr-1" /> Criar "{convNewRuaNome.trim()}"
                                  </button>
                                )}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-xs">Número *</Label>
                    <Input value={convForm.numero} onChange={e => setConvForm(f => ({ ...f, numero: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Referência</Label>
                    <Input value={convForm.referencia} onChange={e => setConvForm(f => ({ ...f, referencia: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                
                <div className="space-y-1.5">
                   <Label className="text-xs font-medium">Atendente que fez a venda *</Label>
                   <Select value={convAtendenteId} onValueChange={setConvAtendenteId}>
                     <SelectTrigger className="h-9"><SelectValue placeholder="Selecione o atendente" /></SelectTrigger>
                     <SelectContent>{atendimentoProfiles.length > 0 ? atendimentoProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>) : profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
                   </Select>
                   <p className="text-xs text-muted-foreground">A venda será creditada a esta pessoa e ela será avaliada no atendimento da venda.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Dados Pessoais</p>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                    <p className="text-xs font-medium">Nome:</p><p className="text-xs">{convForm.nome}</p>
                    <p className="text-xs font-medium">CPF:</p><p className="text-xs">{convForm.cpf}</p>
                    <p className="text-xs font-medium">RG:</p><p className="text-xs">{convForm.rg}</p>
                    <p className="text-xs font-medium">Nome da Mãe:</p><p className="text-xs">{convForm.nome_mae}</p>
                  </div>
                </div>
                {leadContatos.length > 0 && (
                  <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contatos</p>
                    {leadContatos.filter(c => c.tipo_contato === "telefone").map(c => (
                      <p key={c.id} className="text-xs flex items-center gap-1.5"><Phone className="w-3 h-3 text-muted-foreground" /> {c.valor} {c.tem_whatsapp ? <Badge variant="secondary" className="text-[10px] h-4 px-1">WhatsApp</Badge> : ""}</p>
                    ))}
                    {leadContatos.filter(c => c.tipo_contato === "email").map(c => (
                      <p key={c.id} className="text-xs flex items-center gap-1.5"><FileText className="w-3 h-3 text-muted-foreground" /> {c.valor}</p>
                    ))}
                  </div>
                )}
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Endereço</p>
                  {(() => {
                    const rua = endRuas.find(r => r.id === convRuaId);
                    const bairro = endBairros.find(b => b.id === convBairroId);
                    const cidade = endCidades.find(c => c.id === convCidadeId);
                    return (
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                        <p className="text-xs font-medium">Cidade:</p><p className="text-xs">{cidade?.nome || "—"}</p>
                        <p className="text-xs font-medium">Bairro:</p><p className="text-xs">{bairro?.nome || "—"}</p>
                        <p className="text-xs font-medium">Rua:</p><p className="text-xs">{rua?.nome || "—"}</p>
                        <p className="text-xs font-medium">CEP:</p><p className="text-xs">{rua?.cep?.[0] || "—"}</p>
                        <p className="text-xs font-medium">Número:</p><p className="text-xs">{convForm.numero || "—"}</p>
                        {convForm.referencia && <><p className="text-xs font-medium">Referência:</p><p className="text-xs">{convForm.referencia}</p></>}
                      </div>
                    );
                  })()}
                </div>
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Responsável pela Conversão</p>
                  <p className="text-sm font-medium">{profiles.find(p => p.id === convConvertidoPorId)?.nome || "—"}</p>
                </div>
                <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Atendente que fez a venda</p>
                  <p className="text-sm font-medium">{profiles.find(p => p.id === convAtendenteId)?.nome || "—"}</p>
                </div>
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            {convStep === "form" ? (
              <>
                <Button variant="outline" onClick={() => setShowConvert(false)}>Cancelar</Button>
                <Button onClick={() => {
                  if (!convForm.nome.trim()) { toast.error("Nome é obrigatório."); return; }
                  if (!convForm.cpf.trim()) { toast.error("CPF é obrigatório."); return; }
                  if (!convForm.rg.trim()) { toast.error("RG é obrigatório."); return; }
                  if (!convForm.nome_mae.trim()) { toast.error("Nome da mãe é obrigatório."); return; }
                  if (!convCidadeId || !convBairroId || !convRuaId) { toast.error("Endereço completo é obrigatório."); return; }
                  if (!convForm.numero.trim()) { toast.error("Número é obrigatório."); return; }
                  if (!convConvertidoPorId) { toast.error("Selecione o responsável pela conversão."); return; }
                  if (!convAtendenteId) { toast.error("Selecione o atendente."); return; }
                  setConvStep("review");
                }} className="press-effect">
                  <ArrowRight className="w-4 h-4 mr-1" /> Converter
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setConvStep("form")}>
                  <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Editar
                </Button>
                <Button onClick={() => convertMutation.mutate()} disabled={convertMutation.isPending} className="press-effect">
                  {convertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserCheck className="w-4 h-4 mr-1" />} Concluir Conversão
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversion Quick Add Address Dialog */}
      <Dialog open={!!convQuickAddType} onOpenChange={v => !v && setConvQuickAddType(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar {convQuickAddType === "cidade" ? "Cidade" : convQuickAddType === "bairro" ? "Bairro" : "Rua"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={convQuickAddNome} onChange={e => setConvQuickAddNome(e.target.value)} placeholder="Digite o nome..." autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvQuickAddType(null)}>Cancelar</Button>
            <Button
              disabled={!convQuickAddNome.trim()}
              onClick={async () => {
                try {
                  if (convQuickAddType === "cidade") {
                    const { data, error } = await supabase.from("cidades").insert({ nome: convQuickAddNome.trim() }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-cidades"] });
                    setConvCidadeId(data.id); setConvBairroId(null); setConvRuaId(null);
                  } else if (convQuickAddType === "bairro" && convCidadeId) {
                    const { data, error } = await supabase.from("bairros").insert({ nome: convQuickAddNome.trim(), cidade_id: convCidadeId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] });
                    setConvBairroId(data.id); setConvRuaId(null);
                  } else if (convQuickAddType === "rua" && convBairroId) {
                    const { data, error } = await supabase.from("ruas").insert({ nome: convQuickAddNome.trim(), bairro_id: convBairroId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                    setConvRuaId(data.id);
                  }
                  toast.success("Adicionado com sucesso!");
                  setConvQuickAddType(null);
                } catch (err: any) { toast.error(err.message); }
              }}
            >Salvar</Button>
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

      {/* Detail Panel Quick Add Address Dialog */}
      <Dialog open={!!detailQuickAddType} onOpenChange={v => !v && setDetailQuickAddType(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar {detailQuickAddType === "cidade" ? "Cidade" : detailQuickAddType === "bairro" ? "Bairro" : "Rua"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={detailQuickAddNome} onChange={e => setDetailQuickAddNome(e.target.value)} placeholder="Digite o nome..." autoFocus />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailQuickAddType(null)}>Cancelar</Button>
            <Button
              disabled={!detailQuickAddNome.trim()}
              onClick={async () => {
                try {
                  if (detailQuickAddType === "cidade") {
                    const { data, error } = await supabase.from("cidades").insert({ nome: detailQuickAddNome.trim() }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-cidades"] });
                    setLocalCidadeId(data.id); setLocalBairroId(null); setLocalRuaId(null);
                  } else if (detailQuickAddType === "bairro" && localCidadeId) {
                    const { data, error } = await supabase.from("bairros").insert({ nome: detailQuickAddNome.trim(), cidade_id: localCidadeId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-bairros"] });
                    setLocalBairroId(data.id); setLocalRuaId(null);
                  } else if (detailQuickAddType === "rua" && localBairroId) {
                    const { data, error } = await supabase.from("ruas").insert({ nome: detailQuickAddNome.trim(), bairro_id: localBairroId }).select().single();
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["enderecos-ruas"] });
                    setLocalRuaId(data.id);
                  }
                  toast.success("Cadastrado!");
                  setDetailQuickAddType(null);
                } catch (err: any) {
                  toast.error(err.message?.includes("duplicate") ? "Já existe um registro com esse nome." : err.message);
                }
              }}
              className="press-effect"
            >
              <Plus className="w-4 h-4 mr-1" /> Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
