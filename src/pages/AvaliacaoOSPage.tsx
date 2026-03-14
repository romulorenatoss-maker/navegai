import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { detectInconsistencies, markAuditOnlyAndCalculateScore } from "@/hooks/useInconsistencyDetection";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, AlertTriangle, Loader2, Plus, ChevronRight, ChevronLeft,
  Check, Clock, Trash2, Eye, Users, Save, MessageSquare, Image as ImageIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// --- Types ---
interface TipoAvaliacao {
  id: string;
  nome: string;
  cargo_responsavel: string | null;
  descricao: string | null;
  ativo: boolean;
}

type Answer = "sim" | "nao" | "na" | null;

// --- Reusable Components ---
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
          className={cn(
            "px-3 sm:px-4 py-2 rounded text-sm font-medium transition-all duration-150 press-effect min-w-[52px]",
            value === opt.value ? opt.activeColor : "text-foreground hover:bg-background/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}>
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

// --- Main Component ---
export default function AvaliacaoOSPage() {
  const [searchParams] = useSearchParams();
  const { profile, isAdmin, hasRole } = useAuth();
  const showAllTipos = isAdmin || hasRole("gestor");

  // View modes: "list" | "os_detail" | "evaluation"
  const [view, setView] = useState<"list" | "os_detail" | "evaluation">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOS, setSelectedOS] = useState<any | null>(null);

  // Inline form state (replaces wizard)
  const [formOsNumero, setFormOsNumero] = useState("");
  const [formClienteNome, setFormClienteNome] = useState("");
  const [formClienteCpf, setFormClienteCpf] = useState("");
  const [formValidating, setFormValidating] = useState(false);
  const [formValidated, setFormValidated] = useState(false);
  const [formFoundOS, setFormFoundOS] = useState<any | null>(null);
  const [formFoundCliente, setFormFoundCliente] = useState<any | null>(null);

  // Setup state (shown after validation for new OS)
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [selectedTipoAvaliacaoId, setSelectedTipoAvaliacaoId] = useState("");
  const [atendenteId, setAtendenteId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [cpfClienteEncontrado, setCpfClienteEncontrado] = useState<string | null>(null);

  // Evaluation state (full-page)
  const [evalAvaliacaoId, setEvalAvaliacaoId] = useState<string | null>(null);
  const [evalOsId, setEvalOsId] = useState<string | null>(null);
  const [evalOsData, setEvalOsData] = useState<any | null>(null);
  const [evalAnswers, setEvalAnswers] = useState<Record<string, Answer>>({});
  const [evalObservations, setEvalObservations] = useState<Record<string, string>>({});
  const [evalFinalized, setEvalFinalized] = useState(false);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

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
      if (links?.length) {
        const { data } = await (supabase as any).from("tipos_avaliacao").select("*").in("id", links.map((l: any) => l.tipo_avaliacao_id)).eq("ativo", true);
        return (data || []) as TipoAvaliacao[];
      }
      const { data: all } = await (supabase as any).from("tipos_avaliacao").select("*").eq("ativo", true);
      return (all || []) as TipoAvaliacao[];
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

  const selectedTipoAvaliacao = useMemo(() => tiposAvaliacao.find(t => t.id === selectedTipoAvaliacaoId), [tiposAvaliacao, selectedTipoAvaliacaoId]);
  const isAtendimentoEvaluator = useMemo(() => {
    const cargo = selectedTipoAvaliacao?.cargo_responsavel?.toLowerCase() || "";
    return cargo.includes("atendente") || cargo.includes("atendimento");
  }, [selectedTipoAvaliacao]);

  const selectedTipoServico = useMemo(() => tiposServico.find(t => t.id === tipoServicoId), [tiposServico, tipoServicoId]);

  const { data: profilesBySetor = [] } = useQuery({
    queryKey: ["profiles_by_setor", tipoServicoId, selectedTipoAvaliacaoId],
    queryFn: async () => {
      if (!selectedTipoServico?.setor_id) return allProfiles.filter(p => p.id !== profile?.id);
      const { data: links } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", selectedTipoServico.setor_id);
      if (!links?.length) return allProfiles.filter(p => p.id !== profile?.id && p.setor_id === selectedTipoServico.setor_id);
      const ids = links.map(l => l.profile_id);
      return allProfiles.filter(p => p.id !== profile?.id && ids.includes(p.id));
    },
    enabled: !!tipoServicoId && !!selectedTipoAvaliacaoId,
  });

  // Pending evaluations with progress
  const { data: pendingAvaliacoes = [], refetch: refetchPending } = useQuery({
    queryKey: ["pending_aval_v3", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data: avals } = await supabase
        .from("avaliacoes")
        .select("id, ordem_servico_id, concluida, nota_final, created_at, tipo_avaliacao_id, ordens_servico:ordem_servico_id(numero_os, cliente_nome, status, tipo_servico_id)")
        .eq("avaliador_id", profile.id)
        .eq("concluida", false)
        .order("created_at", { ascending: false });
      if (!avals) return [];

      // Get tipo_avaliacao names
      const taIds = [...new Set(avals.map((a: any) => a.tipo_avaliacao_id).filter(Boolean))];
      let taMap: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await (supabase as any).from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach((t: any) => { taMap[t.id] = t.nome; });
      }

      // Get tipo_servico names
      const tsIds = [...new Set(avals.map((a: any) => a.ordens_servico?.tipo_servico_id).filter(Boolean))] as string[];
      let tsMap: Record<string, string> = {};
      if (tsIds.length > 0) {
        const { data: tss } = await supabase.from("tipos_servico").select("id, nome").in("id", tsIds);
        tss?.forEach(t => { tsMap[t.id] = t.nome; });
      }

      // Get answer counts for progress
      const avalIds = avals.map(a => a.id);
      const { data: respostas } = await supabase
        .from("respostas_avaliacao")
        .select("avaliacao_id, resposta")
        .in("avaliacao_id", avalIds);

      const answeredMap: Record<string, number> = {};
      respostas?.forEach(r => {
        if (r.resposta) answeredMap[r.avaliacao_id] = (answeredMap[r.avaliacao_id] || 0) + 1;
      });

      // Get total question counts per avaliacao
      const totalMap: Record<string, number> = {};
      for (const a of avals) {
        const os = a.ordens_servico as any;
        if (!os?.tipo_servico_id || !a.tipo_avaliacao_id) continue;
        const key = `${os.tipo_servico_id}_${a.tipo_avaliacao_id}`;
        if (totalMap[key] === undefined) {
          const { count } = await supabase
            .from("perguntas_avaliacao")
            .select("id", { count: "exact", head: true })
            .eq("ativo", true)
            .or(`tipo_servico_id.eq.${os.tipo_servico_id},tipo_servico_id.is.null`)
            .or(`tipo_avaliacao_id.eq.${a.tipo_avaliacao_id},tipo_avaliacao_id.is.null`);
          totalMap[key] = count || 0;
        }
      }

      return avals.map((a: any) => {
        const os = a.ordens_servico as any;
        const key = `${os?.tipo_servico_id}_${a.tipo_avaliacao_id}`;
        const answered = answeredMap[a.id] || 0;
        const total = totalMap[key] || 0;
        const progress = total > 0 ? Math.round((answered / total) * 100) : 0;
        return {
          ...a,
          _ta_nome: taMap[a.tipo_avaliacao_id] || "—",
          _ts_nome: tsMap[os?.tipo_servico_id] || "—",
          _progress: progress,
          _answered: answered,
          _total: total,
        };
      });
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

  // Questions for evaluation view
  const { data: evalPerguntas = [] } = useQuery({
    queryKey: ["eval_perguntas", tipoServicoId, selectedTipoAvaliacaoId],
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
        .then(({ data }) => { if (data) { setSelectedOS(data); setView("os_detail"); } });
    }
  }, []);

  // --- Auto-save logic ---
  const autoSaveAnswer = useCallback(async (perguntaId: string, answer: Answer) => {
    if (!evalAvaliacaoId) return;
    setAutoSaving(true);
    try {
      await supabase.from("respostas_avaliacao").upsert(
        { avaliacao_id: evalAvaliacaoId, pergunta_id: perguntaId, resposta: answer },
        { onConflict: "avaliacao_id,pergunta_id" }
      );
    } catch (e) { console.warn("Auto-save answer error:", e); }
    finally { setAutoSaving(false); }
  }, [evalAvaliacaoId]);

  const autoSaveObservation = useCallback(async (perguntaId: string, observation: string) => {
    if (!evalAvaliacaoId) return;
    setAutoSaving(true);
    try {
      await supabase.from("respostas_avaliacao").upsert(
        { avaliacao_id: evalAvaliacaoId, pergunta_id: perguntaId, observacao: observation },
        { onConflict: "avaliacao_id,pergunta_id" }
      );
    } catch (e) { console.warn("Auto-save observation error:", e); }
    finally { setAutoSaving(false); }
  }, [evalAvaliacaoId]);

  const handleAnswerChange = useCallback((perguntaId: string, answer: Answer) => {
    setEvalAnswers(prev => ({ ...prev, [perguntaId]: answer }));
    autoSaveAnswer(perguntaId, answer);
  }, [autoSaveAnswer]);

  const handleObservationChange = useCallback((perguntaId: string, text: string) => {
    setEvalObservations(prev => ({ ...prev, [perguntaId]: text }));
    // Debounce observation saves
    if (debounceTimers.current[perguntaId]) clearTimeout(debounceTimers.current[perguntaId]);
    debounceTimers.current[perguntaId] = setTimeout(() => autoSaveObservation(perguntaId, text), 800);
  }, [autoSaveObservation]);

  // --- Handlers ---
  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const { data } = await supabase.from("ordens_servico").select("*").eq("numero_os", q).limit(1).single();
    if (data) { setSelectedOS(data); setView("os_detail"); }
    else { toast.info("Nenhuma OS encontrada."); setSelectedOS(null); }
  };

  const openCreateDialog = () => {
    setStep(0); setTipoServicoId(""); setSelectedTipoAvaliacaoId("");
    setNewOsNumero(""); setClienteNome(""); setClienteCpf("");
    setAtendenteId(""); setTecnicoId("");
    setCreateDialogOpen(true);
  };

  const openEvaluation = async (avaliacaoId: string, osId: string) => {
    // Load OS data
    const { data: osData } = await supabase.from("ordens_servico").select("*").eq("id", osId).single();
    if (!osData) return;

    // Load avaliacao details
    const { data: aval } = await supabase.from("avaliacoes").select("tipo_avaliacao_id, concluida, nota_final").eq("id", avaliacaoId).single();
    if (!aval) return;

    setEvalOsData(osData);
    setEvalOsId(osId);
    setEvalAvaliacaoId(avaliacaoId);
    setTipoServicoId(osData.tipo_servico_id || "");
    setSelectedTipoAvaliacaoId(aval.tipo_avaliacao_id as string || "");
    setEvalFinalized(aval.concluida || false);
    setEvalScore(aval.nota_final as number | null);

    // Load existing answers
    const { data: respostas } = await supabase.from("respostas_avaliacao").select("pergunta_id, resposta, observacao").eq("avaliacao_id", avaliacaoId);
    const ans: Record<string, Answer> = {};
    const obs: Record<string, string> = {};
    respostas?.forEach(r => { if (r.resposta) ans[r.pergunta_id] = r.resposta as Answer; if (r.observacao) obs[r.pergunta_id] = r.observacao; });
    setEvalAnswers(ans);
    setEvalObservations(obs);
    setView("evaluation");
  };

  const openPendingEvaluation = async (pending: any) => {
    await openEvaluation(pending.id, pending.ordem_servico_id);
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

    // Check if avaliacao already exists
    const existingAval = osAvaliacoes.find((a: any) => a.tipo_avaliacao_id === myTa.id && a.avaliador_id === profile.id);
    if (existingAval) {
      await openEvaluation(existingAval.id, selectedOS.id);
    } else {
      // Create new avaliacao
      const { data: newAval, error } = await supabase.from("avaliacoes").insert({
        ordem_servico_id: selectedOS.id,
        avaliador_id: profile.id,
        tipo_avaliacao_id: myTa.id,
        concluida: false,
      } as any).select("id").single();
      if (error) { toast.error("Erro ao criar avaliação: " + error.message); return; }

      // Update OS status to em_andamento
      await supabase.from("ordens_servico").update({ status: "em_andamento" } as any).eq("id", selectedOS.id).eq("status", "aberta");

      await openEvaluation(newAval.id, selectedOS.id);
    }
  };

  // After wizard completes (step 2), create OS + avaliacao, then open full-page evaluation
  const handleWizardComplete = async () => {
    if (!profile) return;
    try {
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

      let osId: string;
      const { data: exOS } = await supabase.from("ordens_servico").select("id").eq("numero_os", num).limit(1).single();
      if (exOS) {
        osId = exOS.id;
        await supabase.from("ordens_servico").update({
          atendente_id: atendenteId || null, tecnico_id: tecnicoId || null,
        } as any).eq("id", osId);
      } else {
        const { data: newOs, error: oe } = await supabase.from("ordens_servico").insert({
          numero_os: num, cliente_nome: nomeTr, cliente_cpf: cpfTr, tipo_servico_id: tipoServicoId,
          cliente_id: clienteId, atendente_id: atendenteId || null, tecnico_id: tecnicoId || null,
        } as any).select("id").single();
        if (oe) throw oe;
        osId = newOs.id;
      }

      // Create avaliacao
      const { data: newAval, error: ae } = await supabase.from("avaliacoes").insert({
        ordem_servico_id: osId, avaliador_id: profile.id, tipo_avaliacao_id: selectedTipoAvaliacaoId, concluida: false,
      } as any).select("id").single();
      if (ae) throw ae;

      setCreateDialogOpen(false);
      toast.success("OS criada! Iniciando avaliação...");
      await openEvaluation(newAval.id, osId);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  const handleFinalizeEvaluation = async () => {
    if (!evalAvaliacaoId || !evalOsId) return;
    const unanswered = evalPerguntas.filter(p => evalAnswers[p.id] == null);
    if (unanswered.length > 0) { toast.error("Responda todas as perguntas antes de concluir."); return; }
    const missingObs = evalPerguntas.filter(p => evalAnswers[p.id] === "nao" && !(evalObservations[p.id]?.trim()));
    if (missingObs.length > 0) { toast.error("Descreva a irregularidade para itens reprovados."); return; }

    setEvalSubmitting(true);
    try {
      const scoreResult = await markAuditOnlyAndCalculateScore(evalAvaliacaoId, selectedTipoAvaliacaoId, evalPerguntas, evalAnswers);
      const nota = scoreResult.nota;
      await supabase.from("avaliacoes").update({ concluida: true, nota_final: nota }).eq("id", evalAvaliacaoId);
      setEvalScore(nota);
      setEvalFinalized(true);
      toast.success(`Avaliação concluída! Nota: ${nota.toFixed(1)}%`);

      try { await detectInconsistencies(evalOsId); } catch (e) { console.warn("Inconsistency detection error:", e); }
      refetchPending();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setEvalSubmitting(false);
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
    setView("list");
    refetchPending();
  };

  const backToList = () => {
    setView("list");
    setSelectedOS(null);
    setEvalAvaliacaoId(null);
    setEvalOsId(null);
    setEvalOsData(null);
    setEvalAnswers({});
    setEvalObservations({});
    setEvalFinalized(false);
    setEvalScore(null);
  };

  // --- Computed ---
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
      if (isAtendimentoEvaluator) return !!atendenteId;
      return !!tecnicoId;
    }
    return false;
  };

  const evalAnsweredCount = evalPerguntas.filter(p => evalAnswers[p.id] != null).length;
  const evalProgressPercent = evalPerguntas.length > 0 ? Math.round((evalAnsweredCount / evalPerguntas.length) * 100) : 0;
  const evalTotalScore = evalPerguntas.reduce((a, p) => evalAnswers[p.id] === "sim" ? a + p.peso : a, 0);
  const evalMaxScore = evalPerguntas.reduce((a, p) => evalAnswers[p.id] !== "na" && evalAnswers[p.id] != null ? a + p.peso : a, 0);

  const atendenteNome = allProfiles.find(p => p.id === (selectedOS as any)?.atendente_id)?.nome;
  const tecnicoNome = allProfiles.find(p => p.id === (selectedOS as any)?.tecnico_id)?.nome;
  const evalAtendenteNome = allProfiles.find(p => p.id === evalOsData?.atendente_id)?.nome;
  const evalTecnicoNome = allProfiles.find(p => p.id === evalOsData?.tecnico_id)?.nome;
  const selectedTipoNome = tiposAvaliacao.find(t => t.id === selectedTipoAvaliacaoId)?.nome;
  const evalTipoServicoNome = tiposServico.find(t => t.id === evalOsData?.tipo_servico_id)?.nome;

  // ===================== RENDER =====================

  // --- Full-Page Evaluation View ---
  if (view === "evaluation" && evalOsData) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-24">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="mb-3 press-effect" onClick={backToList}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar para lista
        </Button>

        {/* OS Information Header */}
        <div className="bg-card border border-border rounded-lg shadow-card mb-4">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold text-foreground font-tabular">OS #{evalOsData.numero_os}</h1>
                  <Badge variant="outline" className="text-xs">{selectedTipoNome}</Badge>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusLabel[evalOsData.status]?.badge)}>
                    {statusLabel[evalOsData.status]?.text}
                  </span>
                </div>
                <p className="text-body text-muted-foreground mt-1">{evalOsData.cliente_nome || "Sem cliente"}</p>
                {evalTipoServicoNome && <p className="text-caption text-muted-foreground mt-0.5">Serviço: {evalTipoServicoNome}</p>}
              </div>
              {autoSaving && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Salvando...
                </div>
              )}
            </div>

            {/* Evaluated employees */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 mt-3 pt-3 border-t border-border">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Atendente:</span>
                <span className="font-medium text-foreground">{evalAtendenteNome || "Não definido"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Técnico:</span>
                <span className="font-medium text-foreground">{evalTecnicoNome || "Não definido"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-card border border-border rounded-lg shadow-card mb-4 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progresso da Avaliação</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground font-tabular">{evalProgressPercent}%</span>
              <span className="text-caption text-muted-foreground font-tabular">({evalAnsweredCount}/{evalPerguntas.length} perguntas)</span>
            </div>
          </div>
          <Progress value={evalProgressPercent} className="h-3" />
          {evalMaxScore > 0 && (
            <div className="flex items-center justify-between mt-2 text-caption text-muted-foreground">
              <span>Pontuação parcial</span>
              <span className={cn("font-bold font-tabular", 
                evalMaxScore > 0 && (evalTotalScore / evalMaxScore) * 100 >= 80 ? "text-success" : 
                evalMaxScore > 0 && (evalTotalScore / evalMaxScore) * 100 >= 60 ? "text-warning" : "text-destructive"
              )}>
                {evalTotalScore}/{evalMaxScore} pts ({evalMaxScore > 0 ? ((evalTotalScore / evalMaxScore) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          )}
        </div>

        {/* Finalized state */}
        {evalFinalized && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-success/5 border-2 border-success/20 rounded-lg p-6 mb-4 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 mb-3">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Avaliação Concluída!</h2>
            <p className="text-3xl font-bold text-primary font-tabular mt-2">{evalScore?.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground mt-1">{evalAnsweredCount} perguntas respondidas</p>
          </motion.div>
        )}

        {/* Questions List */}
        {evalPerguntas.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-body text-muted-foreground">Nenhuma pergunta cadastrada para esta combinação de serviço e avaliação.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {evalPerguntas.map((p, i) => {
              const answer = evalAnswers[p.id] || null;
              const observation = evalObservations[p.id] || "";
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "bg-card border rounded-lg transition-colors",
                    answer === "sim" ? "border-success/30" :
                    answer === "nao" ? "border-destructive/30" :
                    answer === "na" ? "border-muted-foreground/20" : "border-border"
                  )}
                >
                  <div className="p-4">
                    {/* Question header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0",
                        answer ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {answer ? <Check className="w-4 h-4" /> : String(i + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm sm:text-body font-medium text-foreground leading-relaxed">{p.pergunta}</p>
                        <p className="text-caption text-muted-foreground mt-0.5">Nota: {p.peso}</p>
                      </div>
                    </div>

                    {/* Answer buttons - full width on mobile */}
                    <div className="ml-11">
                      <SegmentedControl
                        value={answer}
                        onChange={v => handleAnswerChange(p.id, v)}
                        disabled={evalFinalized}
                      />
                    </div>

                    {/* Observation for "nao" answers */}
                    <AnimatePresence>
                      {answer === "nao" && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-11 mt-3 bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Descreva a irregularidade encontrada
                            </div>
                            <Textarea
                              placeholder="Descreva o problema encontrado..."
                              value={observation}
                              onChange={e => handleObservationChange(p.id, e.target.value)}
                              disabled={evalFinalized}
                              className="bg-card min-h-[80px] text-sm"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Sticky bottom bar */}
        {!evalFinalized && evalPerguntas.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border p-3 sm:p-4 z-30">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-sm">
                <Progress value={evalProgressPercent} className="h-2 w-24 sm:w-32" />
                <span className="font-medium text-foreground font-tabular">{evalProgressPercent}%</span>
                {autoSaving && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvando
                  </span>
                )}
                {!autoSaving && evalAnsweredCount > 0 && (
                  <span className="text-xs text-success flex items-center gap-1">
                    <Check className="w-3 h-3" /> Salvo
                  </span>
                )}
              </div>
              <Button
                onClick={handleFinalizeEvaluation}
                disabled={evalProgressPercent < 100 || evalSubmitting}
                className="press-effect"
              >
                {evalSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Finalizar Avaliação
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- OS Detail View ---
  if (view === "os_detail" && selectedOS) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-3 press-effect" onClick={backToList}>
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
              <Eye className="w-4 h-4 mr-2" /> Iniciar / Continuar Avaliação
            </Button>
          )}
          {selectedOS.status !== "concluida" && isAdmin && (
            <Button variant="destructive" onClick={() => handleDeleteOS(selectedOS.id)} className="press-effect w-full sm:w-auto">
              <Trash2 className="w-4 h-4 mr-2" /> Excluir OS
            </Button>
          )}
        </div>
      </div>
    );
  }

  // --- List View (Default) ---
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-section font-semibold text-foreground">Avaliação de OS</h1>
        <p className="text-sm sm:text-body text-muted-foreground">Busque uma OS ou crie uma nova.</p>
      </div>

      {/* Search */}
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

      {/* Pending Evaluations - Enhanced */}
      {pendingAvaliacoes.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-card mb-6">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" />
            <h2 className="text-body font-semibold text-foreground">Avaliações Pendentes</h2>
            <Badge variant="secondary" className="ml-auto text-xs">{pendingAvaliacoes.length}</Badge>
          </div>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_120px_100px_80px_32px] gap-2 px-4 py-2 text-caption font-medium text-muted-foreground border-b border-border bg-muted/30">
            <span>OS / Cliente</span>
            <span>Tipo Serviço</span>
            <span>Progresso</span>
            <span>Status</span>
            <span></span>
          </div>

          <div className="divide-y divide-border">
            {pendingAvaliacoes.map((a: any) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openPendingEvaluation(a)}
                className="w-full flex flex-col sm:grid sm:grid-cols-[1fr_120px_100px_80px_32px] sm:items-center gap-1 sm:gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors press-effect"
              >
                {/* OS info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-primary font-tabular">OS #{a.ordens_servico?.numero_os}</span>
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{a._ta_nome}</Badge>
                  </div>
                  <p className="text-caption text-muted-foreground truncate">{a.ordens_servico?.cliente_nome || "Sem cliente"}</p>
                </div>

                {/* Service type */}
                <span className="text-caption text-muted-foreground truncate hidden sm:block">{a._ts_nome}</span>

                {/* Progress */}
                <div className="flex items-center gap-2">
                  <Progress value={a._progress} className="h-2 flex-1 sm:w-16" />
                  <span className="text-caption font-medium text-foreground font-tabular w-8 text-right">{a._progress}%</span>
                </div>

                {/* Status */}
                <Badge variant={a._progress > 0 ? "default" : "secondary"} className="text-[10px] w-fit">
                  {a._progress > 0 ? "Parcial" : "Aberta"}
                </Badge>

                <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create OS Wizard Dialog (Steps 0-2 only) */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className={cn(
          "max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden",
          "w-full max-w-full h-full sm:h-auto",
          "rounded-none sm:rounded-lg",
          "top-0 left-0 translate-x-0 translate-y-0 sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%]",
          "sm:max-w-lg"
        )}>
          <DialogHeader>
            <DialogTitle>Criar Nova OS</DialogTitle>
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
                      <Label className="text-body font-medium">Tipo de Avaliação</Label>
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
                    <p className="text-caption text-destructive">Nenhum tipo de avaliação vinculado a este serviço.</p>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <Select value={atendenteId} onValueChange={setAtendenteId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o atendente" /></SelectTrigger>
                        <SelectContent>
                          {profilesBySetor.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.cargo || "—"})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Técnico *</Label>
                      <Select value={tecnicoId} onValueChange={setTecnicoId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                        <SelectContent>
                          {profilesBySetor.map(p => <SelectItem key={p.id} value={p.id}>{p.nome} ({p.cargo || "—"})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <DialogFooter className="flex flex-row justify-between gap-2 mt-2">
            <div>
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
              {step < 2 ? (
                <Button type="button" onClick={() => setStep(step + 1)} disabled={!canAdvance(step)} className="press-effect">
                  Próximo <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={handleWizardComplete} disabled={!canAdvance(2)} className="press-effect">
                  Iniciar Avaliação <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
