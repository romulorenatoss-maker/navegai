import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Search, Plus, Phone, User, Users, History, ArrowRight, Trash2,
  MessageSquare, PhoneCall, Clock, UserCheck, RefreshCw, Loader2, UserPlus, AlertTriangle,
} from "lucide-react";
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
  data_criacao: string;
  created_at: string;
  updated_at: string;
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

// normalizePhone imported from @/lib/phone-utils

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
};

// ─── Component ──────────────────────────────────────────
export default function LeadsPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();

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
  const [detailTab, setDetailTab] = useState("info");

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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

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
        .order("data_interacao", { ascending: false });
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
        .order("data_evento", { ascending: false });
      if (error) throw error;
      return data as LeadHistorico[];
    },
  });

  // ─── Search ───────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const term = searchTerm.trim();
    if (!term) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const phoneDigits = normalizePhone(term);

      // Search by name in leads
      const { data: byName, error: e1 } = await supabase
        .from("leads")
        .select("*")
        .ilike("nome", `%${term}%`);
      if (e1) throw e1;

      let byPhoneLeadIds: string[] = [];
      if (phoneDigits.length >= 4) {
        // Search lead_contatos
        const { data: leadConts, error: e2 } = await supabase
          .from("lead_contatos")
          .select("lead_id, valor")
          .eq("tipo_contato", "telefone");
        if (e2) throw e2;
        byPhoneLeadIds = (leadConts || [])
          .filter((c) => normalizePhone(c.valor).includes(phoneDigits))
          .map((c) => c.lead_id);

        // Also search cliente_contatos (global phone search)
        const { data: clienteConts } = await supabase
          .from("cliente_contatos")
          .select("cliente_id, valor, tipo")
          .eq("tipo", "movel");
        const matchedClienteIds = (clienteConts || [])
          .filter((c) => normalizePhone(c.valor).includes(phoneDigits))
          .map((c) => c.cliente_id);

        if (matchedClienteIds.length > 0) {
          const { data: matchedClientes } = await supabase
            .from("clientes")
            .select("id, nome, cpf")
            .in("id", matchedClienteIds);
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

      // Merge results
      const allIds = new Set([
        ...(byName || []).map((l) => l.id),
        ...byPhoneLeadIds,
      ]);

      if (allIds.size === 0) {
        setSearchResults([]);
        setSearching(false);
        return;
      }

      const { data: leads, error: e3 } = await supabase
        .from("leads")
        .select("*")
        .in("id", Array.from(allIds));
      if (e3) throw e3;

      const { data: contatos } = await supabase
        .from("lead_contatos")
        .select("*")
        .in("lead_id", Array.from(allIds));

      const results = (leads || []).map((l) => ({
        ...l,
        contatos: (contatos || []).filter((c) => c.lead_id === l.id),
      }));

      setSearchResults(results as any);
    } catch (err: any) {
      toast.error("Erro na busca: " + err.message);
    } finally {
      setSearching(false);
    }
  }, [searchTerm]);

  // ─── Auto-transfer on opening existing lead ──────
  const openLeadWithTransfer = useCallback(
    async (lead: Lead) => {
      if (!profile) return;

      // If lead has a different responsável, transfer
      if (lead.responsavel_id && lead.responsavel_id !== profile.id) {
        // Update responsável
        await supabase
          .from("leads")
          .update({ responsavel_id: profile.id })
          .eq("id", lead.id);

        // Log transfer in history
        await supabase.from("lead_historico").insert({
          lead_id: lead.id,
          usuario_id: profile.id,
          tipo_evento: "transferencia_automatica",
          descricao: `Lead transferido automaticamente para ${profile.nome}`,
        });

        toast.info("Lead transferido automaticamente para você.");

        // Refresh leads list
        queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      } else if (!lead.responsavel_id) {
        // Assign if no one is responsible
        await supabase
          .from("leads")
          .update({ responsavel_id: profile.id })
          .eq("id", lead.id);

        await supabase.from("lead_historico").insert({
          lead_id: lead.id,
          usuario_id: profile.id,
          tipo_evento: "transferencia_automatica",
          descricao: `Lead atribuído automaticamente para ${profile.nome}`,
        });
        queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      }

      setSelectedLead({ ...lead, responsavel_id: profile.id });
      setDetailTab("info");
    },
    [profile, queryClient]
  );

  // ─── Create Lead ──────────────────────────────────
  const createLeadMutation = useMutation({
    mutationFn: async () => {
      if (!createName.trim() || !createPhone.trim()) throw new Error("Nome e telefone são obrigatórios.");
      if (!profile) throw new Error("Perfil não encontrado.");

      const phoneNorm = normalizePhone(createPhone);
      if (phoneNorm.length < 8) throw new Error("Telefone inválido.");

      // ── Duplicate phone check in lead_contatos ──
      const { data: existingLeadContatos } = await supabase
        .from("lead_contatos")
        .select("lead_id, valor")
        .eq("tipo_contato", "telefone");
      const matchedLeadContato = (existingLeadContatos || []).find(
        (c) => normalizePhone(c.valor) === phoneNorm
      );
      if (matchedLeadContato) {
        // Find the lead and check if active
        const { data: existingLead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", matchedLeadContato.lead_id)
          .not("status_lead", "in", '("convertido","perdido","arquivado")')
          .single();
        if (existingLead) {
          // Transfer and open existing lead
          await supabase.from("leads").update({ responsavel_id: profile.id }).eq("id", existingLead.id);
          await supabase.from("lead_historico").insert({
            lead_id: existingLead.id,
            usuario_id: profile.id,
            tipo_evento: "transferencia_automatica",
            descricao: "Lead assumido automaticamente por telefone existente",
          });
          // Set state to open existing lead
          setShowCreate(false);
          setSelectedLead({ ...existingLead, responsavel_id: profile.id });
          setDetailTab("info");
          queryClient.invalidateQueries({ queryKey: ["leads-list"] });
          throw new Error("__DUPLICATE_LEAD__");
        }
      }

      // ── Duplicate phone check in cliente_contatos ──
      const { data: existingClienteContatos } = await supabase
        .from("cliente_contatos")
        .select("cliente_id, valor, tipo")
        .eq("tipo", "movel");
      const matchedCliente = (existingClienteContatos || []).find(
        (c) => normalizePhone(c.valor) === phoneNorm
      );
      if (matchedCliente) {
        const { data: cliente } = await supabase
          .from("clientes")
          .select("id, nome, cpf")
          .eq("id", matchedCliente.cliente_id)
          .single();
        if (cliente) {
          setDupeAlert({
            type: "cliente_phone",
            message: `Este telefone já pertence ao cliente "${cliente.nome}" (CPF: ${cliente.cpf || "N/A"}).`,
            clienteId: cliente.id,
            clienteNome: cliente.nome,
          });
          throw new Error("__DUPLICATE_CLIENTE__");
        }
      }

      // Create lead
      const { data: newLead, error: e1 } = await supabase
        .from("leads")
        .insert({
          nome: createName.trim(),
          status_lead: "novo",
          responsavel_id: profile.id,
        })
        .select()
        .single();
      if (e1) throw e1;

      // Add phone contact
      const { error: e2 } = await supabase.from("lead_contatos").insert({
        lead_id: newLead.id,
        tipo_contato: "telefone",
        valor: createPhone.trim(),
        tem_whatsapp: createPhoneWhatsapp,
      });
      if (e2) throw e2;

      // Log creation
      await supabase.from("lead_historico").insert({
        lead_id: newLead.id,
        usuario_id: profile.id,
        tipo_evento: "criacao",
        descricao: `Lead "${createName.trim()}" criado por ${profile.nome}`,
      });

      // Auto-create first tarefa_contato based on rotina config
      try {
        const { data: firstRotina } = await supabase
          .from("rotina_tentativas_leads")
          .select("*")
          .eq("tentativa_numero", 1)
          .single();

        if (firstRotina) {
          const nextDate = new Date();
          // Primeira tentativa sempre no dia seguinte para evitar atraso no mesmo dia
          const diasAdicionais = Math.max(firstRotina.dias_apos_anterior || 0, 1);
          nextDate.setDate(nextDate.getDate() + diasAdicionais);
          const periodoHora = firstRotina.periodo_contato === "manha" ? 9 : firstRotina.periodo_contato === "tarde" ? 14 : 19;
          nextDate.setHours(periodoHora, 0, 0, 0);

          await supabase.from("lead_tarefas_contato").insert({
            lead_id: newLead.id,
            tentativa: 1,
            data_contato: nextDate.toISOString(),
            periodo: firstRotina.periodo_contato,
            status: "pendente",
            responsavel_id: profile.id,
          });
        }
      } catch {
        // Silently ignore if rotina not configured
      }

      return newLead;
    },
    onSuccess: (newLead) => {
      toast.success("Lead criado com sucesso!");
      setShowCreate(false);
      setCreateName("");
      setCreatePhone("");
      setCreatePhoneWhatsapp(false);
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      setSelectedLead(newLead);
      setDetailTab("info");
    },
    onError: (err: any) => {
      // Suppress duplicate messages (handled via UI)
      if (err.message === "__DUPLICATE_LEAD__") {
        toast.info("Lead existente aberto automaticamente e transferido para você.");
        return;
      }
      if (err.message === "__DUPLICATE_CLIENTE__") {
        return; // Alert dialog already shown
      }
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
        if (!isValidPhone(digits)) throw new Error("Número de telefone inválido. Verifique o formato.");

        // Check duplicate in lead_contatos
        const { data: allLeadPhones } = await supabase
          .from("lead_contatos")
          .select("id, lead_id, valor")
          .eq("tipo_contato", "telefone");
        const foundInLeads = (allLeadPhones || []).find(
          (c: any) => normalizePhone(c.valor) === digits
        );
        if (foundInLeads) {
          if (foundInLeads.lead_id === selectedLead.id) {
            throw new Error("Este número já está cadastrado neste lead.");
          } else {
            throw new Error("Este número já está cadastrado em outro lead.");
          }
        }

        // Check duplicate in cliente_contatos
        const { data: allClientePhones } = await supabase
          .from("cliente_contatos")
          .select("id, valor")
          .in("tipo", ["movel", "fixo", "telefone"]);
        const foundInClientes = (allClientePhones || []).find(
          (c: any) => normalizePhone(c.valor) === digits
        );
        if (foundInClientes) {
          throw new Error("Este número já está cadastrado em um cliente existente.");
        }
      }

      const { error } = await supabase.from("lead_contatos").insert({
        lead_id: selectedLead.id,
        tipo_contato: newPhoneTipo,
        valor: newPhoneValue.trim(),
        tem_whatsapp: newPhoneWhatsapp,
      });
      if (error) throw error;

      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id,
        usuario_id: profile.id,
        tipo_evento: "contato_adicionado",
        descricao: `Contato adicionado: ${newPhoneValue.trim()} (${newPhoneTipo})`,
      });
    },
    onSuccess: () => {
      toast.success("Contato adicionado!");
      setShowAddPhone(false);
      setNewPhoneValue("");
      setNewPhoneWhatsapp(false);
      refetchContatos();
      refetchHistorico();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Remove contact ──────────────────────────────
  const removeContact = async (contato: LeadContato) => {
    if (!selectedLead || !profile) return;
    const { error } = await supabase.from("lead_contatos").delete().eq("id", contato.id);
    if (error) { toast.error(error.message); return; }

    await supabase.from("lead_historico").insert({
      lead_id: selectedLead.id,
      usuario_id: profile.id,
      tipo_evento: "contato_removido",
      descricao: `Contato removido: ${contato.valor} (${contato.tipo_contato})`,
    });
    toast.success("Contato removido.");
    refetchContatos();
    refetchHistorico();
  };

  // ─── Register interaction ─────────────────────────
  const interactionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !profile) throw new Error("Erro interno.");

      const { error } = await supabase.from("lead_interacoes").insert({
        lead_id: selectedLead.id,
        colaborador_id: profile.id,
        tipo_contato: interTipo,
        numero_utilizado: interNumero.trim() || null,
        resultado: interResultado.trim() || null,
      });
      if (error) throw error;

      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id,
        usuario_id: profile.id,
        tipo_evento: "tentativa_contato",
        descricao: `Tentativa via ${interTipo}${interResultado ? ": " + interResultado.trim() : ""}`,
      });

      // Update status if still 'novo'
      if (selectedLead.status_lead === "novo") {
        await supabase.from("leads").update({ status_lead: "em_contato" }).eq("id", selectedLead.id);
        setSelectedLead((prev) => prev ? { ...prev, status_lead: "em_contato" } : null);
        queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      }
    },
    onSuccess: () => {
      toast.success("Interação registrada!");
      setShowInteraction(false);
      setInterNumero("");
      setInterResultado("");
      refetchInteracoes();
      refetchHistorico();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Update lead status ──────────────────────────
  const updateStatus = async (newStatus: string) => {
    if (!selectedLead || !profile) return;
    const { error } = await supabase.from("leads").update({ status_lead: newStatus }).eq("id", selectedLead.id);
    if (error) { toast.error(error.message); return; }

    await supabase.from("lead_historico").insert({
      lead_id: selectedLead.id,
      usuario_id: profile.id,
      tipo_evento: "alteracao_status",
      descricao: `Status alterado para: ${STATUS_OPTIONS.find((s) => s.value === newStatus)?.label || newStatus}`,
    });

    setSelectedLead((prev) => prev ? { ...prev, status_lead: newStatus } : null);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    refetchHistorico();
    toast.success("Status atualizado.");
  };

  // ─── Update lead plano ────────────────────────────
  const updatePlano = async (planoId: string) => {
    if (!selectedLead) return;
    const val = planoId === "none" ? null : planoId;
    await supabase.from("leads").update({ plano_id: val }).eq("id", selectedLead.id);
    setSelectedLead((prev) => prev ? { ...prev, plano_id: val } : null);
    queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  };

  // ─── Open conversion dialog ────────────────────────
  const openConversion = () => {
    if (!selectedLead) return;
    setConvForm({
      nome: selectedLead.nome,
      cpf: "", rg: "", nome_mae: "", endereco: "", numero: "", cep: "", cidade: "", referencia: "",
    });
    setShowConvert(true);
  };

  // ─── Convert Lead → Client ────────────────────────
  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLead || !profile) throw new Error("Erro interno.");
      const f = convForm;
      // Validate all required fields
      if (!f.nome.trim()) throw new Error("Nome é obrigatório.");
      if (!f.cpf.trim()) throw new Error("CPF é obrigatório.");
      if (!f.rg.trim()) throw new Error("RG é obrigatório.");
      if (!f.nome_mae.trim()) throw new Error("Nome da mãe é obrigatório.");
      if (!f.endereco.trim()) throw new Error("Endereço é obrigatório.");
      if (!f.numero.trim()) throw new Error("Número é obrigatório.");
      if (!f.cep.trim()) throw new Error("CEP é obrigatório.");
      if (!f.cidade.trim()) throw new Error("Cidade é obrigatória.");
      if (!f.referencia.trim()) throw new Error("Referência é obrigatória.");

      // ── CPF duplicate check ──
      const cpfNorm = f.cpf.trim().replace(/\D/g, "");
      if (cpfNorm.length >= 11) {
        const { data: existingCliente } = await supabase
          .from("clientes")
          .select("id, nome, cpf")
          .eq("cpf", f.cpf.trim())
          .maybeSingle();
        if (existingCliente) {
          // Link lead to existing client instead of creating new
          await supabase.from("leads").update({
            status_lead: "convertido",
            cliente_id: existingCliente.id,
          }).eq("id", selectedLead.id);

          await supabase.from("lead_historico").insert({
            lead_id: selectedLead.id,
            usuario_id: profile.id,
            tipo_evento: "vinculo_cliente_existente",
            descricao: `Lead vinculado ao cliente existente "${existingCliente.nome}" (CPF: ${existingCliente.cpf})`,
          });

          setDupeAlert({
            type: "cpf",
            message: `CPF já cadastrado para o cliente "${existingCliente.nome}". O lead foi vinculado ao cliente existente.`,
            clienteId: existingCliente.id,
            clienteNome: existingCliente.nome,
          });

          setShowConvert(false);
          setSelectedLead((prev) => prev ? { ...prev, status_lead: "convertido" } : null);
          queryClient.invalidateQueries({ queryKey: ["leads-list"] });
          refetchHistorico();
          throw new Error("__DUPLICATE_CPF__");
        }
      }

      // Create client with full data
      const { data: newCliente, error: e1 } = await supabase.from("clientes").insert({
        nome: f.nome.trim(),
        cpf: f.cpf.trim(),
        rg: f.rg.trim(),
        nome_mae: f.nome_mae.trim(),
        endereco: f.endereco.trim(),
        numero: f.numero.trim(),
        cep: f.cep.trim(),
        cidade: f.cidade.trim(),
        referencia: f.referencia.trim(),
      }).select("id").single();
      if (e1) throw e1;

      // Copy lead contacts to cliente_contatos
      const phoneContatos = leadContatos.filter((c) => c.tipo_contato === "telefone");
      if (phoneContatos.length > 0) {
        const inserts = phoneContatos.map((c) => ({
          cliente_id: newCliente.id,
          tipo: "movel" as const,
          valor: c.valor,
          tem_whatsapp: c.tem_whatsapp,
        }));
        await supabase.from("cliente_contatos").insert(inserts);
      }

      // Update lead: mark as converted and link to client
      await supabase.from("leads").update({
        status_lead: "convertido",
        cliente_id: newCliente.id,
      }).eq("id", selectedLead.id);

      // Auto-create OS for the new client (aguardando_numero)
      // Find tipo_servico "Venda / Instalação"
      const { data: tipoVenda } = await supabase
        .from("tipos_servico")
        .select("id")
        .or("nome.ilike.%venda%,nome.ilike.%instalac%")
        .limit(1)
        .single();

      const { data: newOS, error: osErr } = await supabase.from("ordens_servico").insert({
        cliente_id: newCliente.id,
        cliente_nome: f.nome.trim(),
        cliente_cpf: f.cpf.trim(),
        tipo_servico_id: tipoVenda?.id || null,
        numero_os: null,
        status: "aguardando_numero" as any,
      } as any).select("id, numero_os").single();

      if (osErr) console.warn("Erro ao criar OS automática:", osErr.message);

      // Log history
      await supabase.from("lead_historico").insert({
        lead_id: selectedLead.id,
        usuario_id: profile.id,
        tipo_evento: "conversao_cliente",
        descricao: `Lead convertido em cliente: ${f.nome.trim()} (CPF: ${f.cpf.trim()})${newOS ? ". OS criada aguardando número." : ""}`,
      });

      return newCliente;
    },
    onSuccess: () => {
      toast.success("Lead convertido em cliente com sucesso!");
      setShowConvert(false);
      setSelectedLead((prev) => prev ? { ...prev, status_lead: "convertido" } : null);
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      refetchHistorico();
    },
    onError: (err: any) => {
      if (err.message === "__DUPLICATE_CPF__") {
        toast.info("Lead vinculado ao cliente existente.");
        return;
      }
      toast.error(err.message);
    },
  });

  // Helper: get profile name
  const getProfileName = (id: string | null) => {
    if (!id) return "—";
    return profiles.find((p) => p.id === id)?.nome || "—";
  };

  // Format date
  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
    catch { return d; }
  };

  // ─── Render ───────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestão de Leads</h1>
          <p className="text-sm text-muted-foreground">Cadastre, busque e acompanhe leads</p>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm" className="press-effect">
          <Plus className="w-4 h-4 mr-1" /> Novo Lead
        </Button>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por telefone ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching} size="sm">
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>
          {searchResults !== null && searchResults.length === 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              Nenhum lead encontrado.{" "}
              <button onClick={() => setShowCreate(true)} className="text-primary underline">
                Criar novo lead?
              </button>
            </p>
          )}
          {searchResults && searchResults.length > 0 && (
            <div className="mt-3 space-y-2">
              {searchResults.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                  onClick={() => openLeadWithTransfer(lead)}
                >
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{lead.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {lead.contatos.map((c) => c.valor).join(", ") || "Sem contatos"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(lead.status_lead)}
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two-column: List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead list */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" /> Leads Recentes
              <Badge variant="secondary" className="ml-auto text-xs">{allLeads.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
              {loadingLeads ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Carregando...</div>
              ) : allLeads.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Nenhum lead cadastrado</div>
              ) : (
                allLeads.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => openLeadWithTransfer(lead)}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${
                      selectedLead?.id === lead.id ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{lead.nome}</span>
                      {statusBadge(lead.status_lead)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(lead.data_criacao)} · {getProfileName(lead.responsavel_id)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="lg:col-span-2">
          {!selectedLead ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Selecione um lead para ver detalhes
            </div>
          ) : (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedLead.nome}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Responsável: {getProfileName(selectedLead.responsavel_id)} · Criado em {fmtDate(selectedLead.data_criacao)}
                    </p>
                  </div>
                  {statusBadge(selectedLead.status_lead)}
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={detailTab} onValueChange={setDetailTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="info"><User className="w-3.5 h-3.5 mr-1" /> Info</TabsTrigger>
                    <TabsTrigger value="interacoes"><PhoneCall className="w-3.5 h-3.5 mr-1" /> Interações</TabsTrigger>
                    <TabsTrigger value="historico"><History className="w-3.5 h-3.5 mr-1" /> Histórico</TabsTrigger>
                  </TabsList>

                  {/* Info tab */}
                  <TabsContent value="info" className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Status</Label>
                        <Select value={selectedLead.status_lead} onValueChange={updateStatus}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Plano de Interesse</Label>
                        <Select value={selectedLead.plano_id || "none"} onValueChange={updatePlano}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nenhum</SelectItem>
                            {planos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.nome_plano}{p.velocidade ? ` (${p.velocidade})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Contacts */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold">Contatos</Label>
                        <Button size="sm" variant="outline" onClick={() => setShowAddPhone(true)}>
                          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                        </Button>
                      </div>
                      {leadContatos.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum contato cadastrado</p>
                      ) : (
                        <div className="space-y-1.5">
                          {leadContatos.map((c) => (
                            <div key={c.id} className="flex items-center justify-between p-2.5 rounded-md border bg-muted/30">
                              <div className="flex items-center gap-2">
                                {c.tipo_contato === "telefone" ? <Phone className="w-3.5 h-3.5 text-muted-foreground" /> : <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />}
                                <span className="text-sm">{c.valor}</span>
                                {c.tem_whatsapp && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">WhatsApp</Badge>
                                )}
                              </div>
                              {isAdmin && (
                                <button onClick={() => removeContact(c)} className="text-destructive/60 hover:text-destructive transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quick actions */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => setShowInteraction(true)} className="press-effect">
                        <PhoneCall className="w-4 h-4 mr-1" /> Registrar Interação
                      </Button>
                      {selectedLead.status_lead !== "convertido" && (
                        <Button size="sm" variant="secondary" onClick={openConversion} className="press-effect">
                          <UserPlus className="w-4 h-4 mr-1" /> Converter em Cliente
                        </Button>
                      )}
                      {selectedLead.status_lead === "convertido" && (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                          ✓ Convertido em Cliente
                        </Badge>
                      )}
                    </div>
                  </TabsContent>

                  {/* Interações tab */}
                  <TabsContent value="interacoes">
                    <div className="flex justify-end mb-3">
                      <Button size="sm" onClick={() => setShowInteraction(true)} className="press-effect">
                        <Plus className="w-4 h-4 mr-1" /> Nova Interação
                      </Button>
                    </div>
                    {leadInteracoes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Nenhuma interação registrada</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Número</TableHead>
                            <TableHead>Resultado</TableHead>
                            <TableHead>Colaborador</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leadInteracoes.map((i) => (
                            <TableRow key={i.id}>
                              <TableCell className="text-xs">{fmtDate(i.data_interacao)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {i.tipo_contato === "whatsapp" ? "WhatsApp" : "Telefone"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs">{i.numero_utilizado || "—"}</TableCell>
                              <TableCell className="text-xs max-w-[200px] truncate">{i.resultado || "—"}</TableCell>
                              <TableCell className="text-xs">{getProfileName(i.colaborador_id)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  {/* Histórico tab */}
                  <TabsContent value="historico">
                    {leadHistorico.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Nenhum evento no histórico</p>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {leadHistorico.map((h) => (
                          <div key={h.id} className="flex gap-3 items-start">
                            <div className="mt-1">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] px-1.5">
                                  {EVENTO_LABELS[h.tipo_evento] || h.tipo_evento}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{fmtDate(h.data_evento)}</span>
                              </div>
                              {h.descricao && (
                                <p className="text-sm text-muted-foreground mt-0.5">{h.descricao}</p>
                              )}
                              <p className="text-xs text-muted-foreground/60 mt-0.5">
                                por {getProfileName(h.usuario_id)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* ─── Create Dialog ──────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={createPhone}
                onChange={(e) => setCreatePhone(applyPhoneMask(e.target.value))}
              />
              {normalizePhone(createPhone).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tipo detectado: {getPhoneTypeLabel(normalizePhone(createPhone))}
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
              <Input
                placeholder="Nome do lead"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              onClick={() => createLeadMutation.mutate()}
              disabled={createLeadMutation.isPending || !createName.trim() || !createPhone.trim()}
              className="press-effect"
            >
              {createLeadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Criar Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Contact Dialog ─────────────────────── */}
      <Dialog open={showAddPhone} onOpenChange={setShowAddPhone}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar Contato</DialogTitle>
          </DialogHeader>
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
                onChange={(e) => setNewPhoneValue(
                  newPhoneTipo === "telefone" ? applyPhoneMask(e.target.value) : e.target.value
                )}
              />
              {newPhoneTipo === "telefone" && normalizePhone(newPhoneValue).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tipo detectado: {getPhoneTypeLabel(normalizePhone(newPhoneValue))}
                  {!isValidPhone(normalizePhone(newPhoneValue)) && normalizePhone(newPhoneValue).length >= 8 && (
                    <span className="text-destructive ml-2">— formato inválido</span>
                  )}
                </p>
              )}
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
            <Button
              onClick={() => addContactMutation.mutate()}
              disabled={addContactMutation.isPending || !newPhoneValue.trim()}
              className="press-effect"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Interaction Dialog ─────────────────────── */}
      <Dialog open={showInteraction} onOpenChange={setShowInteraction}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Interação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo de Contato</Label>
              <Select value={interTipo} onValueChange={setInterTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número Utilizado</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={interNumero}
                onChange={(e) => setInterNumero(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Textarea
                placeholder="Descreva o resultado da interação..."
                value={interResultado}
                onChange={(e) => setInterResultado(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInteraction(false)}>Cancelar</Button>
            <Button
              onClick={() => interactionMutation.mutate()}
              disabled={interactionMutation.isPending}
              className="press-effect"
            >
              {interactionMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PhoneCall className="w-4 h-4 mr-1" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conversion Dialog ──────────────────────── */}
      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent className="sm:max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" /> Converter Lead em Cliente
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Todos os campos são obrigatórios para conversão.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome *</Label>
                  <Input value={convForm.nome} onChange={(e) => setConvForm((f) => ({ ...f, nome: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CPF *</Label>
                  <Input placeholder="000.000.000-00" value={convForm.cpf} onChange={(e) => setConvForm((f) => ({ ...f, cpf: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">RG *</Label>
                  <Input value={convForm.rg} onChange={(e) => setConvForm((f) => ({ ...f, rg: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome da Mãe *</Label>
                  <Input value={convForm.nome_mae} onChange={(e) => setConvForm((f) => ({ ...f, nome_mae: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Endereço *</Label>
                  <Input value={convForm.endereco} onChange={(e) => setConvForm((f) => ({ ...f, endereco: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Número *</Label>
                  <Input value={convForm.numero} onChange={(e) => setConvForm((f) => ({ ...f, numero: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">CEP *</Label>
                  <Input placeholder="00000-000" value={convForm.cep} onChange={(e) => setConvForm((f) => ({ ...f, cep: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cidade *</Label>
                  <Input value={convForm.cidade} onChange={(e) => setConvForm((f) => ({ ...f, cidade: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Referência *</Label>
                  <Input value={convForm.referencia} onChange={(e) => setConvForm((f) => ({ ...f, referencia: e.target.value }))} />
                </div>
              </div>
              {leadContatos.filter((c) => c.tipo_contato === "telefone").length > 0 && (
                <div className="p-3 rounded-md border bg-muted/30">
                  <p className="text-xs font-medium mb-1">Contatos que serão copiados:</p>
                  {leadContatos.filter((c) => c.tipo_contato === "telefone").map((c) => (
                    <p key={c.id} className="text-xs text-muted-foreground">
                      📞 {c.valor} {c.tem_whatsapp ? "(WhatsApp)" : ""}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvert(false)}>Cancelar</Button>
            <Button
              onClick={() => convertMutation.mutate()}
              disabled={convertMutation.isPending}
              className="press-effect"
            >
              {convertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
              Converter em Cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ─── Duplicate Alert Dialog ────────────────── */}
      <Dialog open={!!dupeAlert} onOpenChange={(o) => !o && setDupeAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" /> Registro Duplicado Detectado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Alert variant="destructive" className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Este registro já existe no sistema</AlertTitle>
              <AlertDescription className="text-sm">{dupeAlert?.message}</AlertDescription>
            </Alert>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setDupeAlert(null)}>Cancelar</Button>
            {dupeAlert?.type === "lead_phone" && dupeAlert.leadId && (
              <Button
                onClick={() => {
                  const lead = allLeads.find((l) => l.id === dupeAlert.leadId);
                  if (lead) openLeadWithTransfer(lead);
                  setDupeAlert(null);
                  setShowCreate(false);
                }}
                className="press-effect"
              >
                Assumir Lead Existente
              </Button>
            )}
            {dupeAlert?.type === "cliente_phone" && (
              <Button
                variant="secondary"
                onClick={() => { setDupeAlert(null); setShowCreate(false); }}
                className="press-effect"
              >
                OK, Entendi
              </Button>
            )}
            {dupeAlert?.type === "cpf" && (
              <Button
                variant="secondary"
                onClick={() => setDupeAlert(null)}
                className="press-effect"
              >
                OK, Entendi
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
