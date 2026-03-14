import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, AlertTriangle, Loader2, Plus, ListChecks, ChevronRight, ChevronLeft,
  Check, Clock, X, Trash2, Eye, Users
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TipoAvaliacao {
  id: string;
  nome: string;
  cargo_responsavel: string | null;
  descricao: string | null;
  ativo: boolean;
}

type Answer = "sim" | "nao" | "na" | null;

const SegmentedControl = ({ value, onChange, disabled }: { value: Answer; onChange: (v: Answer) => void; disabled?: boolean }) => {
  const options: { label: string; value: Answer; activeColor: string }[] = [
    { label: "Sim", value: "sim", activeColor: "bg-success text-success-foreground" },
    { label: "Não", value: "nao", activeColor: "bg-destructive text-destructive-foreground" },
    { label: "N/A", value: "na", activeColor: "bg-muted text-foreground" },
  ];
  return (
    <div className="flex bg-muted rounded-md p-0.5 gap-0.5">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => !disabled && onChange(opt.value)} disabled={disabled}
          className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 press-effect min-w-[48px] ${
            value === opt.value ? opt.activeColor : "text-foreground hover:bg-background/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
};

const statusLabel: Record<string, { text: string; badge: string }> = {
  aberta: { text: "Aberta", badge: "badge-pending" },
  em_andamento: { text: "Em andamento", badge: "badge-active" },
  concluida: { text: "Concluída", badge: "badge-complete" },
};

const STEPS = [
  { label: "Tipo de Serviço", description: "Selecione o tipo e avaliação" },
  { label: "Dados da OS", description: "Número, cliente e CPF" },
  { label: "Avaliado", description: "Selecione o funcionário" },
  { label: "Avaliação", description: "Responda as perguntas" },
];

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (parseInt(digits[9]) !== check) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return parseInt(digits[10]) === check;
}

export default function AvaliacaoOSPage() {
  const [searchParams] = useSearchParams();
  const { profile, isAdmin, hasRole } = useAuth();
  const queryClient = useQueryClient();
  const showAllTipos = isAdmin || hasRole("gestor");

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOS, setSelectedOS] = useState<any | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Wizard state
  const [step, setStep] = useState(0);
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [selectedTipoAvaliacaoId, setSelectedTipoAvaliacaoId] = useState("");
  const [newOsNumero, setNewOsNumero] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteCpf, setClienteCpf] = useState("");
  const [atendenteId, setAtendenteId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [cpfClienteEncontrado, setCpfClienteEncontrado] = useState<string | null>(null);
  const [wizardAnswers, setWizardAnswers] = useState<Record<string, Answer>>({});
  const [wizardObservations, setWizardObservations] = useState<Record<string, string>>({});
  const [wizardFinalized, setWizardFinalized] = useState(false);
  const [wizardScore, setWizardScore] = useState<number | null>(null);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [existingAvaliacaoId, setExistingAvaliacaoId] = useState<string | null>(null);
  const [existingOsId, setExistingOsId] = useState<string | null>(null);

  // --- Queries ---
  const { data: tiposAvaliacao = [] } = useQuery({
    queryKey: ["tipos_avaliacao"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tipos_avaliacao").select("*").eq("ativo", true).order("nome");
      return (data || []) as TipoAvaliacao[];
    },
  });

  const { data: tiposServico = [] } = useQuery({
    queryKey: ["tipos_servico_aval", profile?.id, showAllTipos],
    queryFn: async () => {
      if (!profile?.id) return [];
      if (showAllTipos) {
        const { data } = await supabase.from("tipos_servico").select("*, setores:setor_id(nome)").eq("ativo", true).order("nome");
        return data || [];
      }
      const { data: assignments } = await supabase.from("avaliador_tipos_servico").select("tipo_servico_id").eq("avaliador_id", profile.id);
      if (!assignments?.length) return [];
      const { data } = await supabase.from("tipos_servico").select("*, setores:setor_id(nome)").eq("ativo", true).in("id", assignments.map(a => a.tipo_servico_id)).order("nome");
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: linkedTiposAvaliacao = [] } = useQuery({
    queryKey: ["linked_ta", tipoServicoId],
    queryFn: async () => {
      if (!tipoServicoId) return [];
      const { data: links } = await (supabase as any).from("tipo_servico_tipos_avaliacao").select("tipo_avaliacao_id").eq("tipo_servico_id", tipoServicoId);
      if (!links?.length) return [];
      const { data } = await (supabase as any).from("tipos_avaliacao").select("*").in("id", links.map((l: any) => l.tipo_avaliacao_id)).eq("ativo", true);
      return (data || []) as TipoAvaliacao[];
    },
    enabled: !!tipoServicoId,
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles_for_eval"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, cargo, email, setor_id").eq("ativo", true).order("nome");
      return data || [];
    },
  });

  // Determine which employee field this evaluator manages based on tipo_avaliacao
  const selectedTipoAvaliacao = useMemo(() => tiposAvaliacao.find(t => t.id === selectedTipoAvaliacaoId), [tiposAvaliacao, selectedTipoAvaliacaoId]);
  const isAtendimentoEvaluator = useMemo(() => {
    const cargo = selectedTipoAvaliacao?.cargo_responsavel?.toLowerCase() || "";
    return cargo.includes("atendente") || cargo.includes("atendimento");
  }, [selectedTipoAvaliacao]);

  // Get setor_id from selected tipo_servico to filter employees
  const selectedTipoServico = useMemo(() => tiposServico.find(t => t.id === tipoServicoId), [tiposServico, tipoServicoId]);

  // Filter profiles by relevant sector using colaborador_setores
  const { data: profilesBySetor = [] } = useQuery({
    queryKey: ["profiles_by_setor", tipoServicoId, selectedTipoAvaliacaoId],
    queryFn: async () => {
      if (!selectedTipoServico?.setor_id) return allProfiles.filter(p => p.id !== profile?.id);
      // Get all profiles linked to the service type's sector
      const { data: links } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", selectedTipoServico.setor_id);
      if (!links?.length) {
        // Fallback: filter by legacy setor_id on profile
        return allProfiles.filter(p => p.id !== profile?.id && p.setor_id === selectedTipoServico.setor_id);
      }
      const ids = links.map(l => l.profile_id);
      return allProfiles.filter(p => p.id !== profile?.id && ids.includes(p.id));
    },
    enabled: !!tipoServicoId && !!selectedTipoAvaliacaoId,
  });

  const selectableProfiles = useMemo(() => allProfiles.filter(p => p.id !== profile?.id), [allProfiles, profile]);

  const { data: pendingAvaliacoes = [], refetch: refetchPending } = useQuery({
    queryKey: ["pending_aval_v2", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data: avals } = await supabase
        .from("avaliacoes")
        .select("id, ordem_servico_id, concluida, nota_final, created_at, tipo_avaliacao_id, ordens_servico:ordem_servico_id(numero_os, cliente_nome, status, tipo_servico_id)")
        .eq("avaliador_id", profile.id)
        .eq("concluida", false)
        .order("created_at", { ascending: false });
      if (!avals) return [];
      const taIds = [...new Set(avals.map((a: any) => a.tipo_avaliacao_id).filter(Boolean))];
      let taMap: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await (supabase as any).from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach((t: any) => { taMap[t.id] = t.nome; });
      }
      return avals.map((a: any) => ({ ...a, _ta_nome: taMap[a.tipo_avaliacao_id] || "—" }));
    },
    enabled: !!profile?.id,
  });

  // OS Detail queries
  const { data: osLinkedTA = [] } = useQuery({
    queryKey: ["os_linked_ta", selectedOS?.tipo_servico_id],
    queryFn: async () => {
      if (!selectedOS?.tipo_servico_id) return [];
      const { data: links } = await (supabase as any).from("tipo_servico_tipos_avaliacao").select("tipo_avaliacao_id").eq("tipo_servico_id", selectedOS.tipo_servico_id);
      if (!links?.length) return [];
      const { data } = await (supabase as any).from("tipos_avaliacao").select("*").in("id", links.map((l: any) => l.tipo_avaliacao_id));
      return (data || []) as TipoAvaliacao[];
    },
    enabled: !!selectedOS?.tipo_servico_id,
  });

  const { data: osAvaliacoes = [], refetch: refetchOsAvaliacoes } = useQuery({
    queryKey: ["os_avaliacoes", selectedOS?.id],
    queryFn: async () => {
      if (!selectedOS?.id) return [];
      const { data } = await supabase.from("avaliacoes").select("id, avaliador_id, concluida, nota_final, tipo_avaliacao_id, created_at").eq("ordem_servico_id", selectedOS.id);
      if (!data) return [];
      const ids = [...new Set(data.map(a => a.avaliador_id))];
      let nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("id, nome").in("id", ids);
        ps?.forEach(p => { nameMap[p.id] = p.nome; });
      }
      return data.map((a: any) => ({ ...a, _avaliador_nome: nameMap[a.avaliador_id] || "—" }));
    },
    enabled: !!selectedOS?.id,
  });

  // Questions for wizard
  const { data: previewPerguntas = [] } = useQuery({
    queryKey: ["preview_perguntas_v2", tipoServicoId, selectedTipoAvaliacaoId],
    queryFn: async () => {
      if (!tipoServicoId || !selectedTipoAvaliacaoId) return [];
      const { data } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, ordem, target_employee_type")
        .eq("ativo", true)
        .or(`tipo_servico_id.eq.${tipoServicoId},tipo_servico_id.is.null`)
        .or(`tipo_avaliacao_id.eq.${selectedTipoAvaliacaoId},tipo_avaliacao_id.is.null`)
        .order("ordem");
      return (data || []).map((p: any) => ({ ...p, target_employee_type: p.target_employee_type || "geral" }));
    },
    enabled: !!tipoServicoId && !!selectedTipoAvaliacaoId,
  });

  // Auto-fill CPF
  useEffect(() => {
    const d = clienteCpf.replace(/\D/g, "");
    if (d.length === 11 && isValidCpf(d)) {
      supabase.from("clientes").select("id, nome").eq("cpf", clienteCpf.trim()).limit(1).single()
        .then(({ data }) => { if (data) { setClienteNome(data.nome); setCpfClienteEncontrado(data.nome); } else setCpfClienteEncontrado(null); });
    } else setCpfClienteEncontrado(null);
  }, [clienteCpf]);

  // Auto-select tipo_avaliacao for non-admins
  useEffect(() => {
    if (!isAdmin && profile?.cargo && linkedTiposAvaliacao.length > 0) {
      const match = linkedTiposAvaliacao.find(ta => ta.cargo_responsavel === profile.cargo);
      if (match) setSelectedTipoAvaliacaoId(match.id);
    }
  }, [linkedTiposAvaliacao, profile, isAdmin]);

  // URL param search
  useEffect(() => {
    const os = searchParams.get("os");
    if (os) {
      setSearchQuery(os);
      supabase.from("ordens_servico").select("*").eq("numero_os", os).limit(1).single()
        .then(({ data }) => { if (data) setSelectedOS(data); });
    }
  }, []);

  // --- Handlers ---
  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const { data } = await supabase.from("ordens_servico").select("*").eq("numero_os", q).limit(1).single();
    if (data) setSelectedOS(data);
    else { toast.info("Nenhuma OS encontrada."); setSelectedOS(null); }
  };

  const openCreateDialog = () => {
    setStep(0); setTipoServicoId(""); setSelectedTipoAvaliacaoId("");
    setNewOsNumero(""); setClienteNome(""); setClienteCpf("");
    setAtendenteId(""); setTecnicoId("");
    setWizardAnswers({}); setWizardObservations({});
    setWizardFinalized(false); setWizardScore(null); setWizardSubmitting(false);
    setExistingAvaliacaoId(null); setExistingOsId(null);
    setCreateDialogOpen(true);
  };

  const openPendingInWizard = async (pending: any) => {
    const { data: fullOs } = await supabase.from("ordens_servico").select("*").eq("id", pending.ordem_servico_id).single();
    if (!fullOs) return;
    setTipoServicoId(fullOs.tipo_servico_id || "");
    setNewOsNumero(fullOs.numero_os || "");
    setClienteNome(fullOs.cliente_nome || "");
    setClienteCpf(fullOs.cliente_cpf || "");
    setAtendenteId((fullOs as any).atendente_id || "");
    setTecnicoId((fullOs as any).tecnico_id || "");
    setExistingAvaliacaoId(pending.id);
    setExistingOsId(pending.ordem_servico_id);
    setWizardFinalized(false); setWizardScore(null); setWizardSubmitting(false);

    const { data: aval } = await supabase.from("avaliacoes").select("tipo_avaliacao_id").eq("id", pending.id).single();
    if (aval?.tipo_avaliacao_id) setSelectedTipoAvaliacaoId(aval.tipo_avaliacao_id as string);

    const { data: respostas } = await supabase.from("respostas_avaliacao").select("pergunta_id, resposta, observacao").eq("avaliacao_id", pending.id);
    const ans: Record<string, Answer> = {};
    const obs: Record<string, string> = {};
    respostas?.forEach(r => { if (r.resposta) ans[r.pergunta_id] = r.resposta as Answer; if (r.observacao) obs[r.pergunta_id] = r.observacao; });
    setWizardAnswers(ans); setWizardObservations(obs);

    const hasEmp = (fullOs as any).atendente_id && (fullOs as any).tecnico_id;
    setStep(hasEmp ? 3 : 2);
    setCreateDialogOpen(true);
  };

  const startMyEvaluation = async () => {
    if (!selectedOS || !profile) return;
    const tsId = selectedOS.tipo_servico_id;
    if (!tsId) { toast.error("OS sem tipo de serviço."); return; }

    const { data: links } = await (supabase as any).from("tipo_servico_tipos_avaliacao").select("tipo_avaliacao_id").eq("tipo_servico_id", tsId);
    if (!links?.length) { toast.error("Nenhuma avaliação configurada para este serviço."); return; }

    const taIds = links.map((l: any) => l.tipo_avaliacao_id);
    const { data: tas } = await (supabase as any).from("tipos_avaliacao").select("*").in("id", taIds);
    if (!tas?.length) { toast.error("Tipos de avaliação não encontrados."); return; }

    const doneIds = osAvaliacoes.map((a: any) => a.tipo_avaliacao_id);
    let myTa: any = null;

    if (isAdmin) {
      const available = tas.filter((ta: any) => !doneIds.includes(ta.id));
      if (!available.length) { toast.info("Todas as avaliações já foram realizadas."); return; }
      myTa = available[0];
    } else {
      myTa = tas.find((ta: any) => ta.cargo_responsavel === profile.cargo);
      if (!myTa) { toast.error("Você não tem avaliação para esta OS (cargo: " + profile.cargo + ")."); return; }
      if (doneIds.includes(myTa.id)) {
        const myAval = osAvaliacoes.find((a: any) => a.tipo_avaliacao_id === myTa.id && a.avaliador_id === profile.id);
        if (myAval?.concluida) { toast.info("Sua avaliação já foi concluída."); return; }
      }
    }

    setSelectedTipoAvaliacaoId(myTa.id);
    setTipoServicoId(tsId);
    setNewOsNumero(selectedOS.numero_os);
    setClienteNome(selectedOS.cliente_nome || "");
    setClienteCpf(selectedOS.cliente_cpf || "");
    setAtendenteId((selectedOS as any).atendente_id || "");
    setTecnicoId((selectedOS as any).tecnico_id || "");
    setExistingOsId(selectedOS.id);

    const existingAval = osAvaliacoes.find((a: any) => a.tipo_avaliacao_id === myTa.id && a.avaliador_id === profile.id);
    if (existingAval) {
      setExistingAvaliacaoId(existingAval.id);
      const { data: respostas } = await supabase.from("respostas_avaliacao").select("pergunta_id, resposta, observacao").eq("avaliacao_id", existingAval.id);
      const ans: Record<string, Answer> = {};
      const obs: Record<string, string> = {};
      respostas?.forEach(r => { if (r.resposta) ans[r.pergunta_id] = r.resposta as Answer; if (r.observacao) obs[r.pergunta_id] = r.observacao; });
      setWizardAnswers(ans); setWizardObservations(obs);
    } else {
      setExistingAvaliacaoId(null);
      setWizardAnswers({}); setWizardObservations({});
    }

    setWizardFinalized(false); setWizardScore(null); setWizardSubmitting(false);
    const hasEmp = (selectedOS as any).atendente_id && (selectedOS as any).tecnico_id;
    setStep(hasEmp ? 3 : 2);
    setCreateDialogOpen(true);
  };

  const canAdvance = (s: number) => {
    if (s === 0) return !!tipoServicoId && !!selectedTipoAvaliacaoId;
    if (s === 1) {
      if (!newOsNumero.trim()) return false;
      const d = clienteCpf.replace(/\D/g, "");
      if (d.length > 0 && d.length < 11) return false;
      if (d.length === 11 && !isValidCpf(d)) return false;
      return true;
    }
    if (s === 2) {
      // Only require the field this evaluator is responsible for
      if (isAtendimentoEvaluator) return !!atendenteId;
      return !!tecnicoId;
    }
    if (s === 3) return previewPerguntas.length > 0 && previewPerguntas.every(p => wizardAnswers[p.id] != null);
    return false;
  };

  const wizardAnsweredCount = previewPerguntas.filter(p => wizardAnswers[p.id] != null).length;
  const wizardTotalScore = previewPerguntas.reduce((a, p) => wizardAnswers[p.id] === "sim" ? a + p.peso : a, 0);
  const wizardMaxScore = previewPerguntas.reduce((a, p) => wizardAnswers[p.id] !== "na" && wizardAnswers[p.id] != null ? a + p.peso : a, 0);

  const handleFinalizeWizard = async () => {
    if (!canAdvance(3)) { toast.error("Responda todas as perguntas."); return; }
    const missingObs = previewPerguntas.filter(p => wizardAnswers[p.id] === "nao" && !(wizardObservations[p.id]?.trim()));
    if (missingObs.length > 0) { toast.error("Descreva a irregularidade para itens reprovados."); return; }

    setWizardSubmitting(true);
    try {
      const nota = wizardMaxScore > 0 ? (wizardTotalScore / wizardMaxScore) * 100 : 0;
      let osId: string;
      let avalId: string;

      if (existingAvaliacaoId && existingOsId) {
        osId = existingOsId;
        await supabase.from("ordens_servico").update({ atendente_id: atendenteId || null, tecnico_id: tecnicoId || null } as any).eq("id", osId);
        for (const p of previewPerguntas) {
          await supabase.from("respostas_avaliacao").upsert({ avaliacao_id: existingAvaliacaoId, pergunta_id: p.id, resposta: wizardAnswers[p.id], observacao: wizardObservations[p.id] || null }, { onConflict: "avaliacao_id,pergunta_id" });
        }
        await supabase.from("avaliacoes").update({ concluida: true, nota_final: nota }).eq("id", existingAvaliacaoId);
        avalId = existingAvaliacaoId;
      } else if (existingOsId) {
        osId = existingOsId;
        await supabase.from("ordens_servico").update({ atendente_id: atendenteId || null, tecnico_id: tecnicoId || null } as any).eq("id", osId);
        const { data: newAval, error: ae } = await supabase.from("avaliacoes").insert({
          ordem_servico_id: osId, avaliador_id: profile!.id, tipo_avaliacao_id: selectedTipoAvaliacaoId, concluida: true, nota_final: nota,
        } as any).select("id").single();
        if (ae) throw ae;
        avalId = newAval.id;
        const respostas = previewPerguntas.map(p => ({ avaliacao_id: avalId, pergunta_id: p.id, resposta: wizardAnswers[p.id], observacao: wizardObservations[p.id] || null }));
        await supabase.from("respostas_avaliacao").insert(respostas);
      } else {
        const num = newOsNumero.trim();
        const cpfD = clienteCpf.replace(/\D/g, "");
        const nomeTr = clienteNome.trim() || null;
        const cpfTr = cpfD.length === 11 ? clienteCpf.trim() : null;
        let clienteId: string | null = null;
        if (cpfTr) {
          const { data: ex } = await supabase.from("clientes").select("id").eq("cpf", cpfTr).limit(1).single();
          if (ex) clienteId = ex.id;
          else { const { data: nc } = await supabase.from("clientes").insert({ nome: nomeTr || "Sem nome", cpf: cpfTr }).select("id").single(); if (nc) clienteId = nc.id; }
        } else if (nomeTr) {
          const { data: nc } = await supabase.from("clientes").insert({ nome: nomeTr, cpf: null }).select("id").single();
          if (nc) clienteId = nc.id;
        }
        const { data: exOS } = await supabase.from("ordens_servico").select("id").eq("numero_os", num).limit(1).single();
        if (exOS) {
          osId = exOS.id;
          await supabase.from("ordens_servico").update({ atendente_id: atendenteId || null, tecnico_id: tecnicoId || null } as any).eq("id", osId);
        } else {
          const { data: newOs, error: oe } = await supabase.from("ordens_servico").insert({
            numero_os: num, cliente_nome: nomeTr, cliente_cpf: cpfTr, tipo_servico_id: tipoServicoId,
            cliente_id: clienteId, atendente_id: atendenteId || null, tecnico_id: tecnicoId || null,
          } as any).select("id").single();
          if (oe) throw oe;
          osId = newOs.id;
        }
        const { data: newAval, error: ae } = await supabase.from("avaliacoes").insert({
          ordem_servico_id: osId, avaliador_id: profile!.id, tipo_avaliacao_id: selectedTipoAvaliacaoId, concluida: true, nota_final: nota,
        } as any).select("id").single();
        if (ae) throw ae;
        avalId = newAval.id;
        const respostas = previewPerguntas.map(p => ({ avaliacao_id: avalId, pergunta_id: p.id, resposta: wizardAnswers[p.id], observacao: wizardObservations[p.id] || null }));
        await supabase.from("respostas_avaliacao").insert(respostas);
      }
      setWizardScore(nota);
      setWizardFinalized(true);
      toast.success(`Avaliação concluída! Nota: ${nota.toFixed(1)}%`);
      refetchPending();
      if (selectedOS) {
        const { data: refreshed } = await supabase.from("ordens_servico").select("*").eq("id", selectedOS.id).single();
        if (refreshed) setSelectedOS(refreshed);
        refetchOsAvaliacoes();
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setWizardSubmitting(false);
    }
  };

  const handleDeleteOS = async (osId: string) => {
    if (!confirm("Excluir esta OS e todas as avaliações vinculadas?")) return;
    const { data: avals } = await supabase.from("avaliacoes").select("id").eq("ordem_servico_id", osId);
    if (avals) { for (const a of avals) { await supabase.from("respostas_avaliacao").delete().eq("avaliacao_id", a.id); } }
    await supabase.from("avaliacoes").delete().eq("ordem_servico_id", osId);
    await supabase.from("ordens_servico").delete().eq("id", osId);
    toast.success("OS excluída.");
    setSelectedOS(null);
    refetchPending();
  };

  const atendenteNome = allProfiles.find(p => p.id === (selectedOS as any)?.atendente_id)?.nome;
  const tecnicoNome = allProfiles.find(p => p.id === (selectedOS as any)?.tecnico_id)?.nome;
  const selectedTipoNome = tiposAvaliacao.find(t => t.id === selectedTipoAvaliacaoId)?.nome;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-section font-semibold text-foreground">Avaliação de OS</h1>
        <p className="text-sm sm:text-body text-muted-foreground">Busque uma OS ou crie uma nova.</p>
      </div>

      {/* Search */}
      {!selectedOS && (
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4 shadow-card mb-4 sm:mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor="os-search" className="text-body font-medium mb-1.5 block">Número da OS</Label>
              <Input id="os-search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Ex: 12345" className="h-10" onKeyDown={e => e.key === "Enter" && handleSearch()} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} variant="outline" className="h-10 flex-1 sm:flex-none press-effect"><Search className="w-4 h-4 mr-2" /> Buscar</Button>
              <Button onClick={openCreateDialog} className="h-10 flex-1 sm:flex-none press-effect"><Plus className="w-4 h-4 mr-2" /> Criar OS</Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Evaluations */}
      {!selectedOS && pendingAvaliacoes.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-card mb-6">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" />
            <h2 className="text-body font-semibold text-foreground">Minhas Avaliações Pendentes</h2>
            <span className="text-caption text-muted-foreground ml-auto">{pendingAvaliacoes.length}</span>
          </div>
          <div className="divide-y divide-border">
            {pendingAvaliacoes.map((a: any) => (
              <button key={a.id} type="button" onClick={() => openPendingInWizard(a)}
                className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-muted/50 transition-colors press-effect">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-primary font-tabular">OS #{a.ordens_servico?.numero_os}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">{a._ta_nome}</span>
                  </div>
                  <p className="text-caption text-muted-foreground mt-0.5">{a.ordens_servico?.cliente_nome || "Sem cliente"}</p>
                </div>
                <span className="text-caption text-muted-foreground font-tabular">{new Date(a.created_at).toLocaleDateString("pt-BR")}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* OS Detail View */}
      {selectedOS && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Button variant="ghost" size="sm" className="mb-3 press-effect" onClick={() => setSelectedOS(null)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>

          <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-subhead font-semibold text-foreground font-tabular">OS #{selectedOS.numero_os}</h2>
                <p className="text-body text-muted-foreground mt-1">{selectedOS.cliente_nome || "Sem cliente"}</p>
                <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 mt-2 text-caption text-muted-foreground">
                  <span>Atendente: <strong className="text-foreground">{atendenteNome || "Não definido"}</strong></span>
                  <span>Técnico: <strong className="text-foreground">{tecnicoNome || "Não definido"}</strong></span>
                </div>
              </div>
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusLabel[selectedOS.status]?.badge)}>
                {statusLabel[selectedOS.status]?.text}
              </span>
            </div>
          </div>

          {/* Evaluation Types Status */}
          <div className="bg-card border border-border rounded-lg shadow-card mb-4">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-body font-semibold text-foreground">Avaliações por Tipo</h3>
            </div>
            <div className="divide-y divide-border">
              {osLinkedTA.length === 0 ? (
                <p className="px-4 py-6 text-center text-body text-muted-foreground">Nenhum tipo de avaliação configurado para este serviço.</p>
              ) : osLinkedTA.map((ta) => {
                const aval = osAvaliacoes.find((a: any) => a.tipo_avaliacao_id === ta.id);
                return (
                  <div key={ta.id} className="px-4 py-3 flex items-center gap-3">
                    <div className={cn("w-3 h-3 rounded-full shrink-0", aval?.concluida ? "bg-success" : aval ? "bg-warning" : "bg-muted-foreground/30")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-body font-medium text-foreground">{ta.nome}</p>
                      {aval && <p className="text-caption text-muted-foreground">{(aval as any)._avaliador_nome}</p>}
                    </div>
                    {aval?.concluida && aval.nota_final != null && (
                      <span className={cn("text-body font-bold font-tabular", aval.nota_final >= 80 ? "text-success" : aval.nota_final >= 60 ? "text-warning" : "text-destructive")}>
                        {Number(aval.nota_final).toFixed(1)}%
                      </span>
                    )}
                    {aval && !aval.concluida && <span className="text-caption text-warning font-medium">Em andamento</span>}
                    {!aval && <span className="text-caption text-muted-foreground">Pendente</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            {selectedOS.status !== "concluida" && (
              <Button onClick={startMyEvaluation} className="press-effect w-full sm:w-auto">
                <Eye className="w-4 h-4 mr-2" /> Iniciar / Continuar
              </Button>
            )}
            {selectedOS.status !== "concluida" && isAdmin && (
              <Button variant="destructive" onClick={() => handleDeleteOS(selectedOS.id)} className="press-effect w-full sm:w-auto">
                <Trash2 className="w-4 h-4 mr-2" /> Excluir OS
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* Wizard Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className={cn(
          "max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden",
          "w-full max-w-full",
          "h-full sm:h-auto",
          "rounded-none sm:rounded-lg",
          "top-0 left-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
          step === 3 ? "sm:max-w-2xl" : "sm:max-w-lg"
        )}>
          <DialogHeader>
            <DialogTitle>
              {existingOsId ? `Avaliação — OS #${newOsNumero}` : "Criar Nova OS"}
              {selectedTipoNome && ` — ${selectedTipoNome}`}
            </DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-1 mb-4 overflow-hidden">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                <div className={cn("flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[10px] sm:text-caption font-bold shrink-0 transition-colors",
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {i < step ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : i + 1}
                </div>
                <div className="hidden sm:block min-w-0 max-w-[80px] lg:max-w-none">
                  <p className={cn("text-caption font-medium truncate", i === step ? "text-foreground" : "text-muted-foreground")}>{s.label}</p>
                </div>
                {i < STEPS.length - 1 && <div className={cn("flex-1 h-px mx-0.5 sm:mx-1 min-w-2", i < step ? "bg-primary" : "bg-border")} />}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

              {/* Step 0: Service Type + Evaluation Type */}
              {step === 0 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-body text-muted-foreground">Selecione o tipo de serviço:</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {tiposServico.length === 0 ? (
                        <p className="text-body text-muted-foreground text-center py-6">Nenhum tipo de serviço disponível.</p>
                      ) : tiposServico.map((t) => (
                        <button key={t.id} type="button" onClick={() => { setTipoServicoId(t.id); setSelectedTipoAvaliacaoId(""); }}
                          className={cn("w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all press-effect",
                            tipoServicoId === t.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-muted/50")}>
                          <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                            tipoServicoId === t.id ? "border-primary bg-primary" : "border-muted-foreground/30")}>
                            {tipoServicoId === t.id && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-body font-medium truncate">{t.nome}</p>
                            <p className="text-caption text-muted-foreground">{(t as any).setores?.nome || "Sem setor"}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {tipoServicoId && linkedTiposAvaliacao.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-body font-medium">Tipo de Avaliação (sua função)</Label>
                      {isAdmin ? (
                        <div className="space-y-1">
                          {linkedTiposAvaliacao.map(ta => (
                            <button key={ta.id} type="button" onClick={() => setSelectedTipoAvaliacaoId(ta.id)}
                              className={cn("w-full flex items-center gap-3 px-4 py-2 rounded-lg border text-left transition-all press-effect",
                                selectedTipoAvaliacaoId === ta.id ? "bg-primary/10 border-primary" : "bg-card border-border hover:bg-muted/50")}>
                              <div className={cn("w-4 h-4 rounded-full border-2 shrink-0",
                                selectedTipoAvaliacaoId === ta.id ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                              <span className="text-body font-medium">{ta.nome}</span>
                              <span className="text-caption text-muted-foreground ml-auto">{ta.cargo_responsavel || "—"}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-body text-foreground bg-muted/50 px-3 py-2 rounded-md">
                          {selectedTipoNome || "Nenhum tipo de avaliação corresponde ao seu cargo."}
                        </p>
                      )}
                    </div>
                  )}
                  {tipoServicoId && linkedTiposAvaliacao.length === 0 && (
                    <p className="text-caption text-destructive">Nenhum tipo de avaliação vinculado a este serviço. Configure em Cadastros → Serviços.</p>
                  )}
                </div>
              )}

              {/* Step 1: OS Data */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Número da OS *</Label>
                    <Input value={newOsNumero} onChange={e => setNewOsNumero(e.target.value.replace(/\D/g, ""))} placeholder="Apenas números" autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Nome do Cliente</Label>
                      <Input value={clienteNome} onChange={e => setClienteNome(e.target.value)} placeholder="Nome completo" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>CPF do Cliente</Label>
                      <Input value={clienteCpf} onChange={e => setClienteCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
                      {clienteCpf.replace(/\D/g, "").length === 11 && !isValidCpf(clienteCpf) && <p className="text-caption text-destructive">CPF inválido</p>}
                      {clienteCpf.replace(/\D/g, "").length === 11 && isValidCpf(clienteCpf) && (
                        <p className="text-caption text-success">{cpfClienteEncontrado ? `✓ ${cpfClienteEncontrado}` : "CPF válido ✓"}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Employees */}
              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-body text-muted-foreground">
                    {isAtendimentoEvaluator
                      ? "Selecione o atendente que será avaliado nesta OS."
                      : "Selecione o técnico que será avaliado nesta OS."}
                  </p>

                  {isAtendimentoEvaluator ? (
                    <div className="space-y-1.5">
                      <Label>Atendente *</Label>
                      {existingOsId && atendenteId ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border border-border">
                          <Check className="w-4 h-4 text-success" />
                          <span className="text-body text-foreground">{allProfiles.find(p => p.id === atendenteId)?.nome || "—"}</span>
                          <span className="text-caption text-muted-foreground ml-auto">Já selecionado</span>
                        </div>
                      ) : (
                        <Select value={atendenteId} onValueChange={setAtendenteId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o atendente" /></SelectTrigger>
                          <SelectContent>
                            {profilesBySetor.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.cargo || "—"})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Técnico *</Label>
                      {existingOsId && tecnicoId ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md border border-border">
                          <Check className="w-4 h-4 text-success" />
                          <span className="text-body text-foreground">{allProfiles.find(p => p.id === tecnicoId)?.nome || "—"}</span>
                          <span className="text-caption text-muted-foreground ml-auto">Já selecionado</span>
                        </div>
                      ) : (
                        <Select value={tecnicoId} onValueChange={setTecnicoId}>
                          <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                          <SelectContent>
                            {profilesBySetor.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.cargo || "—"})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Questions */}
              {step === 3 && (
                <div className="space-y-3">
                  {wizardFinalized ? (
                    <div className="text-center py-6 space-y-3">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-2">
                        <Check className="w-8 h-8 text-success" />
                      </div>
                      <h3 className="text-subhead font-semibold text-foreground">Avaliação Concluída!</h3>
                      <p className="text-section font-bold text-primary font-tabular">{wizardScore?.toFixed(1)}%</p>
                      <p className="text-body text-muted-foreground">{wizardAnsweredCount} perguntas • {wizardTotalScore}/{wizardMaxScore} pontos</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-caption mb-1">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium text-foreground font-tabular">
                          {wizardAnsweredCount}/{previewPerguntas.length}
                          {wizardMaxScore > 0 && ` — ${((wizardTotalScore / wizardMaxScore) * 100).toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-3">
                        <motion.div className="h-full bg-primary rounded-full" animate={{ width: `${previewPerguntas.length > 0 ? (wizardAnsweredCount / previewPerguntas.length) * 100 : 0}%` }} transition={{ duration: 0.3 }} />
                      </div>

                      {previewPerguntas.length === 0 ? (
                        <p className="text-center text-body text-muted-foreground py-6">Nenhuma pergunta cadastrada para esta combinação de serviço e avaliação.</p>
                      ) : (
                        <div className="max-h-[40vh] overflow-y-auto space-y-0 divide-y divide-border border border-border rounded-lg">
                          {previewPerguntas.map((p, i) => (
                            <div key={p.id} className="p-3 flex flex-col gap-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex gap-2 items-start flex-1">
                                  <span className="text-caption text-muted-foreground font-tabular mt-0.5 w-5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                                  <div>
                                    <p className="text-body font-medium text-foreground">{p.pergunta}</p>
                                    <p className="text-caption text-muted-foreground">Peso: {p.peso}</p>
                                  </div>
                                </div>
                                <SegmentedControl value={wizardAnswers[p.id] || null} onChange={v => setWizardAnswers(prev => ({ ...prev, [p.id]: v }))} />
                              </div>
                              <AnimatePresence>
                                {wizardAnswers[p.id] === "nao" && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                    <div className="bg-muted rounded-lg p-3 ml-7 space-y-2">
                                      <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                                        <AlertTriangle className="w-3.5 h-3.5" /> Descreva a irregularidade.
                                      </div>
                                      <Input placeholder="Descreva..." value={wizardObservations[p.id] || ""} onChange={e => setWizardObservations(prev => ({ ...prev, [p.id]: e.target.value }))} className="bg-card h-9" />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <DialogFooter className="flex flex-row justify-between gap-2 mt-2">
            <div>
              {step > 0 && !wizardFinalized && !existingOsId && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
              )}
              {step === 2 && existingOsId && (
                <Button type="button" variant="outline" onClick={() => setStep(3)}>
                  Pular <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {wizardFinalized ? (
                <Button type="button" onClick={() => setCreateDialogOpen(false)} className="press-effect">Fechar</Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
                  {step < 3 ? (
                    <Button type="button" onClick={() => setStep(step + 1)} disabled={!canAdvance(step)} className="press-effect">
                      Próximo <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleFinalizeWizard} disabled={!canAdvance(3) || wizardSubmitting} className="press-effect">
                      {wizardSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Finalizar Avaliação
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
