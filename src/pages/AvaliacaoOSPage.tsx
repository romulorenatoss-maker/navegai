import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { markAuditOnlyAndCalculateScore } from "@/hooks/useInconsistencyDetection";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, AlertTriangle, Loader2, ChevronRight, ChevronLeft,
  Check, Clock, Trash2, Eye, Users, User, Phone, MessageSquare, Camera, X, Image as ImageIcon, Lock, Download, Pencil, Save,
  Mic, Volume2, FileAudio
} from "lucide-react";
import { jsPDF } from "jspdf";
import MinhasAvaliacoesPendentes from "@/components/MinhasAvaliacoesPendentes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";

// TipoAvaliacao type removed - no longer used

type Answer = "sim" | "nao" | "na" | null;

// --- Reusable Components ---
const SegmentedControl = ({ value, onChange, disabled }: { value: Answer; onChange: (v: Answer) => void; disabled?: boolean }) => {
  const options: { label: string; value: Answer; activeColor: string }[] = [
    { label: "Sim", value: "sim", activeColor: "bg-success text-success-foreground" },
    { label: "Não", value: "nao", activeColor: "bg-destructive text-destructive-foreground" },
    { label: "N/A", value: "na", activeColor: "bg-warning text-warning-foreground" },
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
  aguardando_numero: { text: "Aguardando Número", badge: "badge-pending" },
};

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
  const navigate = useNavigate();
  const { profile, isAdmin, hasRole } = useAuth();


  // View modes
  const [view, setView] = useState<"list" | "os_detail" | "evaluation">("list");
  const [selectedOS, setSelectedOS] = useState<any | null>(null);

  // Step 1: CPF validation
  const [formClienteCpf, setFormClienteCpf] = useState("");
  const [formClienteNome, setFormClienteNome] = useState("");
  const [cpfValidating, setCpfValidating] = useState(false);
  const [cpfValidated, setCpfValidated] = useState(false);
  const [formFoundCliente, setFormFoundCliente] = useState<any | null>(null);
  const [showNewClienteForm, setShowNewClienteForm] = useState(false);
  const [clienteId, setClienteId] = useState<string | null>(null);

  // Step 2: OS validation
  const [formOsNumero, setFormOsNumero] = useState("");
  const [formValidating, setFormValidating] = useState(false);
  const [formValidated, setFormValidated] = useState(false);
  const [formFoundOS, setFormFoundOS] = useState<any | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [formPendingAval, setFormPendingAval] = useState<any | null>(null);
  const [showNewOsDialog, setShowNewOsDialog] = useState(false);

  // Setup state (after validation, for creating new OS)
  const [tipoServicoId, setTipoServicoId] = useState("");
  
  const [atendenteId, setAtendenteId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [formDataAbertura, setFormDataAbertura] = useState<Date | null>(null);

  // Evaluation state (full-page)
  const [evalAvaliacaoId, setEvalAvaliacaoId] = useState<string | null>(null);
  const [evalOsId, setEvalOsId] = useState<string | null>(null);
  const [evalOsData, setEvalOsData] = useState<any | null>(null);
  const [evalAnswers, setEvalAnswers] = useState<Record<string, Answer>>({});
  const [evalObservations, setEvalObservations] = useState<Record<string, string>>({});
  const [evalEvidencias, setEvalEvidencias] = useState<Record<string, string>>({});
  const [evalAudios, setEvalAudios] = useState<Record<string, string>>({});
  const [otherEvalAnswers, setOtherEvalAnswers] = useState<Record<string, { resposta: string; observacao: string | null; evidencia_url: string | null; audio_url: string | null; avaliador_nome: string }>>({});
  const [responseAuthors, setResponseAuthors] = useState<Record<string, { avaliador_nome: string; resposta: string }>>({});
  const [uploadingEvidence, setUploadingEvidence] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState<string | null>(null);
  const [evalFinalized, setEvalFinalized] = useState(false);
  const [evalScore, setEvalScore] = useState<number | null>(null);
  const [evalSubmitting, setEvalSubmitting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteOsId, setDeleteOsId] = useState<string | null>(null);
  const [deleteOsNumero, setDeleteOsNumero] = useState<string>("");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fillNumeroOsId, setFillNumeroOsId] = useState<string | null>(null);
  const [fillNumeroValue, setFillNumeroValue] = useState("");
  const [fillNumeroLoading, setFillNumeroLoading] = useState(false);
  const [viewClienteData, setViewClienteData] = useState<any | null>(null);
  const [viewClienteOpen, setViewClienteOpen] = useState(false);
  const [clienteAddressMap, setClienteAddressMap] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // --- Queries ---

  const { data: allProfiles = [] } = useQuery({
    queryKey: ["profiles_for_eval"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome, cargo, email, setor_id").eq("ativo", true).order("nome");
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Evaluator's sectors
  const { data: evaluatorSetores = [] } = useQuery({
    queryKey: ["evaluator_setores", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data: links } = await supabase
        .from("colaborador_setores")
        .select("setor_id, setores:setor_id(id, nome)")
        .eq("profile_id", profile.id);
      if (links?.length) return links.map((l: any) => l.setores).filter(Boolean);
      if (profile.setor_id) {
        const { data } = await supabase.from("setores").select("id, nome").eq("id", profile.setor_id).single();
        return data ? [data] : [];
      }
      return [];
    },
    enabled: !!profile?.id,
  });

  const evaluatorSetorIds = useMemo(() => evaluatorSetores.map((s: any) => s.id), [evaluatorSetores]);
  const hasAtendimentoAccess = isAdmin || evaluatorSetores.some((s: any) => {
    const n = (s.nome || "").toLowerCase();
    return n.includes("atendimento") || n.includes("atendente");
  });
  const hasTecnicoAccess = isAdmin || evaluatorSetores.some((s: any) => {
    const n = (s.nome || "").toLowerCase();
    return n.includes("técnico") || n.includes("tecnico");
  });

  const { data: tiposServico = [] } = useQuery({
    queryKey: ["tipos_servico_aval", profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data } = await supabase.from("tipos_servico").select("*, setores:setor_id(nome)").eq("ativo", true).order("nome");
      return data || [];
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
  });

  const isQuestionAnswerable = useCallback((setorAvaliadoId: string | null) => {
    if (isAdmin) return true;
    if (!setorAvaliadoId) return true;
    // If evaluator has no sectors assigned, treat all questions as answerable
    if (evaluatorSetorIds.length === 0) return true;
    return evaluatorSetorIds.includes(setorAvaliadoId);
  }, [isAdmin, evaluatorSetorIds]);

  const isAtendimentoEvaluator = useMemo(() => {
    return hasAtendimentoAccess && !hasTecnicoAccess;
  }, [hasAtendimentoAccess, hasTecnicoAccess]);

  const selectedTipoServico = useMemo(() => tiposServico.find(t => t.id === tipoServicoId), [tiposServico, tipoServicoId]);

  // Profiles filtered by role=avaliado + sector for employee selection
  const avaliadoProfiles = useMemo(() => allProfiles.filter(p => p.cargo === "avaliado"), [allProfiles]);
  // Create a hash of avaliado ids+setors to bust cache when profiles change
  const avaliadoHash = useMemo(() => avaliadoProfiles.map(p => `${p.id}_${p.setor_id}`).join(","), [avaliadoProfiles]);

  // Shared setores query for employee filtering (avoids duplicate fetch)
  const { data: allSetores = [] } = useQuery({
    queryKey: ["setores_active"],
    queryFn: async () => {
      const { data } = await supabase.from("setores").select("id, nome").eq("ativo", true);
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // cache 5 min - rarely changes
  });

  const { data: atendimentoProfiles = [] } = useQuery({
    queryKey: ["profiles_atendimento", avaliadoHash, allSetores],
    queryFn: async () => {
      if (!avaliadoProfiles.length || !allSetores.length) return [];
      const atendSetorIds = allSetores.filter(s => {
        const n = s.nome.toLowerCase();
        return n.includes("atendimento") || n.includes("atendente");
      }).map(s => s.id);
      if (!atendSetorIds.length) return avaliadoProfiles;
      const { data: links } = await supabase.from("colaborador_setores").select("profile_id").in("setor_id", atendSetorIds);
      const linkedIds = new Set(links?.map(l => l.profile_id) || []);
      return avaliadoProfiles.filter(p => linkedIds.has(p.id) || (p.setor_id && atendSetorIds.includes(p.setor_id)));
    },
    enabled: avaliadoProfiles.length > 0 && allSetores.length > 0,
  });

  const { data: tecnicoProfiles = [] } = useQuery({
    queryKey: ["profiles_tecnico", avaliadoHash, allSetores],
    queryFn: async () => {
      if (!avaliadoProfiles.length || !allSetores.length) return [];
      const tecSetorIds = allSetores.filter(s => {
        const n = s.nome.toLowerCase();
        return n.includes("técnico") || n.includes("tecnico");
      }).map(s => s.id);
      if (!tecSetorIds.length) return avaliadoProfiles;
      const { data: links } = await supabase.from("colaborador_setores").select("profile_id").in("setor_id", tecSetorIds);
      const linkedIds = new Set(links?.map(l => l.profile_id) || []);
      return avaliadoProfiles.filter(p => linkedIds.has(p.id) || (p.setor_id && tecSetorIds.includes(p.setor_id)));
    },
    enabled: avaliadoProfiles.length > 0 && allSetores.length > 0,
  });

  const { data: profilesBySetor = [] } = useQuery({
    queryKey: ["profiles_by_setor", tipoServicoId],
    queryFn: async () => {
      if (!selectedTipoServico?.setor_id) return allProfiles.filter(p => p.id !== profile?.id);
      const { data: links } = await supabase.from("colaborador_setores").select("profile_id").eq("setor_id", selectedTipoServico.setor_id);
      if (!links?.length) return allProfiles.filter(p => p.id !== profile?.id && p.setor_id === selectedTipoServico.setor_id);
      const ids = links.map(l => l.profile_id);
      return allProfiles.filter(p => p.id !== profile?.id && ids.includes(p.id));
    },
    enabled: !!tipoServicoId,
  });

  // Questions grouped by sector for os_detail view - from os_perguntas
  const { data: osDetailBySetor = { atendimento: [], tecnico: [] } } = useQuery({
    queryKey: ["os_detail_by_setor_v2", selectedOS?.id, view],
    queryFn: async () => {
      if (!selectedOS?.id || view !== "os_detail") return { atendimento: [], tecnico: [] };

      // Load from os_perguntas
      const { data: osPerguntas } = await (supabase as any)
        .from("os_perguntas")
        .select("pergunta_id")
        .eq("os_id", selectedOS.id);
      
      const perguntaIds = (osPerguntas || []).map((op: any) => op.pergunta_id);
      if (perguntaIds.length === 0) return { atendimento: [], tecnico: [] };

      const { data: perguntas } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, ordem, setor_avaliado_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(id, nome)")
        .in("id", perguntaIds)
        .order("ordem");
      if (!perguntas?.length) return { atendimento: [], tecnico: [] };

      // Get all answers for this OS
      const { data: respostas } = await supabase
        .from("respostas_avaliacao")
        .select("pergunta_id, resposta, observacao, evidencia_url, audio_url")
        .eq("ordem_servico_id", selectedOS.id)
        .not("resposta", "is", null);

      const answerMap: Record<string, any> = {};
      (respostas || []).forEach(r => { answerMap[r.pergunta_id] = r; });

      const atendimento: any[] = [];
      const tecnico: any[] = [];
      (perguntas || []).forEach((p: any) => {
        const setorNome = (p.setores?.nome || "").toLowerCase();
        const item = { ...p, _answer: answerMap[p.id] || null };
        if (setorNome.includes("técnico") || setorNome.includes("tecnico")) {
          tecnico.push(item);
        } else {
          atendimento.push(item);
        }
      });

      return { atendimento, tecnico };
    },
    enabled: !!selectedOS?.id && view === "os_detail",
  });

  // Pending evaluations
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

      const taIds = [...new Set(avals.map((a: any) => a.tipo_avaliacao_id).filter(Boolean))];
      let taMap: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await (supabase as any).from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach((t: any) => { taMap[t.id] = t.nome; });
      }

      const tsIds = [...new Set(avals.map((a: any) => a.ordens_servico?.tipo_servico_id).filter(Boolean))] as string[];
      let tsMap: Record<string, string> = {};
      if (tsIds.length > 0) {
        const { data: tss } = await supabase.from("tipos_servico").select("id, nome").in("id", tsIds);
        tss?.forEach(t => { tsMap[t.id] = t.nome; });
      }

      // Get OS IDs for fetching os_perguntas counts
      const osIds = [...new Set(avals.map((a: any) => a.ordem_servico_id))];

      // Fetch os_perguntas counts per OS
      const { data: osPerguntas } = await (supabase as any)
        .from("os_perguntas")
        .select("os_id, pergunta_id")
        .in("os_id", osIds);
      
      const totalByOS: Record<string, number> = {};
      (osPerguntas || []).forEach((op: any) => {
        totalByOS[op.os_id] = (totalByOS[op.os_id] || 0) + 1;
      });

      // Fetch responses per OS (shared)
      const { data: respostas } = await supabase
        .from("respostas_avaliacao")
        .select("ordem_servico_id, pergunta_id")
        .in("ordem_servico_id", osIds)
        .not("resposta", "is", null);

      const answeredByOS: Record<string, Set<string>> = {};
      respostas?.forEach((r: any) => {
        if (!answeredByOS[r.ordem_servico_id]) answeredByOS[r.ordem_servico_id] = new Set();
        answeredByOS[r.ordem_servico_id].add(r.pergunta_id);
      });

      return avals.map((a: any) => {
        const os = a.ordens_servico as any;
        const total = totalByOS[a.ordem_servico_id] || 0;
        const answered = answeredByOS[a.ordem_servico_id]?.size || 0;
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

  // OS aguardando número (from lead conversion)
  const { data: aguardandoNumeroOS = [], refetch: refetchAguardando } = useQuery({
    queryKey: ["os_aguardando_numero"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, cliente_id, cliente_nome, cliente_cpf, tipo_servico_id, created_at, data_abertura, status")
        .eq("status", "aguardando_numero" as any)
        .order("data_abertura", { ascending: true });
      return data || [];
    },
    staleTime: 30_000,
  });

  // OS Detail queries
  // osLinkedTA removed - tipos_avaliacao no longer used

  const { data: osAvaliacoes = [], refetch: refetchOsAvaliacoes } = useQuery({
    queryKey: ["os_avaliacoes", selectedOS?.id],
    queryFn: async () => {
      if (!selectedOS?.id) return [];
      const { data } = await supabase.from("avaliacoes").select("id, avaliador_id, concluida, concluida_em, nota_final, tipo_avaliacao_id, created_at").eq("ordem_servico_id", selectedOS.id);
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

  // OS Reaberturas (audit trail)
  const currentOsIdForAudit = selectedOS?.id || evalOsId;
  const { data: osReaberturas = [] } = useQuery({
    queryKey: ["os_reaberturas", currentOsIdForAudit],
    queryFn: async () => {
      if (!currentOsIdForAudit) return [];
      const { data } = await (supabase as any)
        .from("os_reaberturas")
        .select("id, reaberta_por, motivo, campos_alterados, created_at")
        .eq("ordem_servico_id", currentOsIdForAudit)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!data?.length) return [];
      const ids = [...new Set((data as any[]).map((r: any) => r.reaberta_por).filter(Boolean))] as string[];
      let nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: ps } = await supabase.from("profiles").select("id, nome").in("id", ids);
        ps?.forEach(p => { nameMap[p.id] = p.nome; });
      }
      return data.map((r: any) => ({ ...r, _nome: nameMap[r.reaberta_por] || "—" }));
    },
    enabled: !!currentOsIdForAudit,
  });


  const { data: osDetailAnswers = [] } = useQuery({
    queryKey: ["os_detail_answers", selectedOS?.id, view],
    queryFn: async () => {
      if (!selectedOS?.id || view !== "os_detail") return [];
      const { data: avals } = await supabase.from("avaliacoes")
        .select("id, avaliador_id, tipo_avaliacao_id, concluida, concluida_em, nota_final")
        .eq("ordem_servico_id", selectedOS.id);
      if (!avals?.length) return [];

      const avalIds = avals.map(a => a.id);
      const { data: respostas } = await supabase.from("respostas_avaliacao")
        .select("avaliacao_id, pergunta_id, resposta, observacao, evidencia_url, audio_url")
        .in("avaliacao_id", avalIds);

      const perguntaIds = [...new Set(respostas?.map(r => r.pergunta_id) || [])];
      let perguntaMap: Record<string, { pergunta: string; peso: number; ordem: number }> = {};
      if (perguntaIds.length > 0) {
        const { data: perguntas } = await supabase.from("perguntas_avaliacao")
          .select("id, pergunta, peso, ordem")
          .in("id", perguntaIds)
          .order("ordem");
        perguntas?.forEach(p => { perguntaMap[p.id] = { pergunta: p.pergunta, peso: p.peso, ordem: p.ordem }; });
      }

      const avaliadorIds = [...new Set(avals.map(a => a.avaliador_id))];
      let avaliadorNames: Record<string, string> = {};
      if (avaliadorIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", avaliadorIds);
        profiles?.forEach(p => { avaliadorNames[p.id] = p.nome; });
      }

      const taIds = [...new Set(avals.map(a => a.tipo_avaliacao_id).filter(Boolean))] as string[];
      let taNames: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await supabase.from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach(t => { taNames[t.id] = t.nome; });
      }

      return avals.map(a => {
        const avalRespostas = (respostas || [])
          .filter(r => r.avaliacao_id === a.id)
          .map(r => ({
            ...r,
            pergunta: perguntaMap[r.pergunta_id]?.pergunta || "—",
            peso: perguntaMap[r.pergunta_id]?.peso || 0,
            ordem: perguntaMap[r.pergunta_id]?.ordem || 0,
          }))
          .sort((x, y) => x.ordem - y.ordem);
        return {
          id: a.id,
          avaliador_nome: avaliadorNames[a.avaliador_id] || "—",
          tipo_avaliacao_nome: a.tipo_avaliacao_id ? taNames[a.tipo_avaliacao_id] || "—" : "—",
          concluida: a.concluida,
          concluida_em: a.concluida_em,
          nota_final: a.nota_final,
          respostas: avalRespostas,
        };
      });
    },
    enabled: !!selectedOS?.id && view === "os_detail",
  });

  // Questions for evaluation view - loads from os_perguntas (frozen snapshot)
  const { data: evalPerguntas = [] } = useQuery({
    queryKey: ["eval_perguntas_v4", evalOsId],
    queryFn: async () => {
      if (!evalOsId) return [];
      
      // Load questions from os_perguntas (frozen snapshot per OS)
      const { data: osPerguntas } = await (supabase as any)
        .from("os_perguntas")
        .select("pergunta_id")
        .eq("os_id", evalOsId);
      
      if (!osPerguntas?.length) return [];
      
      const perguntaIds = osPerguntas.map((op: any) => op.pergunta_id);
      const { data } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, ordem, target_employee_type, setor_avaliado_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(nome)")
        .in("id", perguntaIds)
        .order("ordem");
      
      return (data || []).map((p: any) => ({
        ...p,
        target_employee_type: p.target_employee_type || "geral",
        setor_avaliado_id: p.setor_avaliado_id || null,
        _setor_nome: p.setores?.nome || null,
      }));
    },
    enabled: !!evalOsId,
  });

  // Auto-select tipo_avaliacao removed - no longer used

  // URL param: pre-fill OS number and optionally auto-open evaluation
  useEffect(() => {
    const os = searchParams.get("os");
    const mode = searchParams.get("mode");
    if (os) {
      setFormOsNumero(os);
      if (mode === "eval") {
        // Auto-search and open the evaluation directly
        (async () => {
          try {
            const { data: existingOS } = await supabase
              .from("ordens_servico")
              .select("*")
              .eq("numero_os", os)
              .limit(1)
              .single();

            if (!existingOS || !profile) return;

            setFormFoundOS(existingOS);
            if (existingOS.tipo_servico_id) setTipoServicoId(existingOS.tipo_servico_id);
            if (existingOS.atendente_id) setAtendenteId(existingOS.atendente_id);
            if (existingOS.tecnico_id) setTecnicoId(existingOS.tecnico_id);
            setFormValidated(true);

            // Check for existing evaluation by this user
            const { data: existingAval } = await supabase
              .from("avaliacoes")
              .select("id, tipo_avaliacao_id, concluida, nota_final")
              .eq("ordem_servico_id", existingOS.id)
              .eq("avaliador_id", profile.id)
              .limit(1)
              .single();

            if (existingAval) {
              // tipo_avaliacao_id no longer tracked

              if (existingAval.concluida && existingOS.status !== "concluida") {
                await supabase
                  .from("avaliacoes")
                  .update({ concluida: false, nota_final: null } as any)
                  .eq("id", existingAval.id);
              }

              await openEvaluation(existingAval.id, existingOS.id);
            } else {
              // No evaluation yet — show OS detail for setup
              setSelectedOS(existingOS);
              setView("os_detail");
            }
          } catch (err) {
            console.warn("Auto-open evaluation failed:", err);
          }
        })();
      }
    }
  }, [profile, searchParams]);

  // --- Step 1: Validate CPF ---
  const handleCpfValidation = async () => {
    const cpfDigits = formClienteCpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) { toast.error("Informe um CPF completo."); return; }
    if (!isValidCpf(cpfDigits)) { toast.error("CPF inválido."); return; }

    setCpfValidating(true);
    try {
      // Search by normalized CPF (digits only) to handle any formatting
      const formattedCpf = formatCpf(cpfDigits);
      const { data: clientes } = await supabase
        .from("clientes")
        .select("id, nome, cpf")
        .or(`cpf.eq.${formattedCpf},cpf.eq.${cpfDigits}`);

      const cliente = clientes?.[0] || null;

      if (cliente) {
        setFormFoundCliente(cliente);
        setFormClienteNome(cliente.nome);
        setClienteId(cliente.id);
        setShowNewClienteForm(false);
        toast.success(`Cliente encontrado: ${cliente.nome}`);

        // Auto-search for existing open OS for this client
        const { data: existingOS } = await supabase
          .from("ordens_servico")
          .select("*")
          .eq("cliente_id", cliente.id)
          .in("status", ["aberta", "em_andamento", "aguardando_numero"] as any[])
          .order("created_at", { ascending: false });

        if (existingOS && existingOS.length > 0) {
          // Prioritize OS without number (aguardando_numero)
          const osNoNumber = existingOS.find((o: any) => o.status === "aguardando_numero" || !o.numero_os);
          const targetOS = osNoNumber || existingOS[0];

          if (!targetOS.numero_os) {
            // Open "fill number" dialog
            setFillNumeroOsId(targetOS.id);
            setFormFoundOS(targetOS);
            if (targetOS.tipo_servico_id) setTipoServicoId(targetOS.tipo_servico_id);
            if (targetOS.atendente_id) setAtendenteId(targetOS.atendente_id);
            if (targetOS.tecnico_id) setTecnicoId(targetOS.tecnico_id);
            setFormValidated(true);
            toast.info("OS existente encontrada aguardando número.");
          } else {
            // Open existing OS directly
            setFormFoundOS(targetOS);
            setFormOsNumero(targetOS.numero_os || "");
            if (targetOS.tipo_servico_id) setTipoServicoId(targetOS.tipo_servico_id);
            if (targetOS.atendente_id) setAtendenteId(targetOS.atendente_id);
            if (targetOS.tecnico_id) setTecnicoId(targetOS.tecnico_id);
            setFormValidated(true);

            // Check for pending evaluation
            if (profile) {
              const { data: pendingAval } = await supabase
                .from("avaliacoes")
                .select("id, tipo_avaliacao_id, concluida, nota_final")
                .eq("ordem_servico_id", targetOS.id)
                .eq("avaliador_id", profile.id)
                .eq("concluida", false)
                .limit(1)
                .maybeSingle();
              if (pendingAval) {
                setFormPendingAval(pendingAval);
                toast.info("OS encontrada com avaliação pendente.");
              } else {
                toast.info(`OS ${targetOS.numero_os} encontrada para este cliente.`);
              }
            }
          }
        }
      } else {
        // Also check ordens_servico by CPF directly (legacy data)
        const { data: osLegacy } = await supabase
          .from("ordens_servico")
          .select("*")
          .or(`cliente_cpf.eq.${formattedCpf},cliente_cpf.eq.${cpfDigits}`)
          .in("status", ["aberta", "em_andamento", "aguardando_numero"] as any[])
          .order("created_at", { ascending: false })
          .limit(1);

        if (osLegacy && osLegacy.length > 0) {
          const targetOS = osLegacy[0];
          setFormFoundOS(targetOS);
          setFormClienteNome(targetOS.cliente_nome || "");
          if (targetOS.cliente_id) setClienteId(targetOS.cliente_id);
          if (targetOS.tipo_servico_id) setTipoServicoId(targetOS.tipo_servico_id);
          if (targetOS.atendente_id) setAtendenteId(targetOS.atendente_id);
          if (targetOS.tecnico_id) setTecnicoId(targetOS.tecnico_id);
          setFormValidated(true);
          if (!targetOS.numero_os) {
            setFillNumeroOsId(targetOS.id);
            toast.info("OS existente encontrada aguardando número.");
          } else {
            setFormOsNumero(targetOS.numero_os);
            toast.info(`OS ${targetOS.numero_os} encontrada para este CPF.`);
          }
          setShowNewClienteForm(false);
        } else {
          setFormFoundCliente(null);
          setShowNewClienteForm(true);
          setClienteId(null);
          toast.info("Cliente não encontrado. Preencha o nome para cadastrar.");
        }
      }
      setCpfValidated(true);
    } catch (err: any) {
      toast.error("Erro ao buscar cliente: " + err.message);
    } finally {
      setCpfValidating(false);
    }
  };

  // --- Create new client from form ---
  const handleCreateCliente = async () => {
    const nome = formClienteNome.trim();
    if (!nome) { toast.error("Informe o nome do cliente."); return; }
    const cpfDigits = formClienteCpf.replace(/\D/g, "");
    const cpfFormatted = formatCpf(cpfDigits);
    try {
      // Double-check for existing client before creating
      const { data: existing } = await supabase
        .from("clientes")
        .select("id, nome, cpf")
        .or(`cpf.eq.${cpfFormatted},cpf.eq.${cpfDigits}`)
        .limit(1);
      if (existing && existing.length > 0) {
        setFormFoundCliente(existing[0]);
        setClienteId(existing[0].id);
        setFormClienteNome(existing[0].nome);
        setShowNewClienteForm(false);
        toast.info(`Cliente já existe: ${existing[0].nome}. Usando cadastro existente.`);
        return;
      }

      const { data: nc, error } = await supabase.from("clientes").insert({ nome, cpf: cpfFormatted }).select("id, nome, cpf").single();
      if (error) throw error;
      setFormFoundCliente(nc);
      setClienteId(nc!.id);
      setShowNewClienteForm(false);
      toast.success("Cliente cadastrado com sucesso!");
    } catch (err: any) {
      if (err.message?.includes("idx_clientes_cpf_normalized") || err.message?.includes("duplicate")) {
        toast.error("CPF já cadastrado. Buscando cliente existente...");
        // Retry finding the client
        const { data: found } = await supabase.from("clientes").select("id, nome, cpf").or(`cpf.eq.${cpfFormatted},cpf.eq.${cpfDigits}`).limit(1);
        if (found?.[0]) {
          setFormFoundCliente(found[0]);
          setClienteId(found[0].id);
          setFormClienteNome(found[0].nome);
          setShowNewClienteForm(false);
        }
      } else {
        toast.error("Erro ao cadastrar cliente: " + err.message);
      }
    }
  };

  // --- Step 2: Validate OS ---
  const handleValidate = async (overrideOs?: string) => {
    const num = (overrideOs || formOsNumero).trim();
    if (!num) { toast.error("Informe o número da OS."); return; }

    setFormValidating(true);
    setFormValidated(false);
    setFormFoundOS(null);
    setFormPendingAval(null);

    try {
      const { data: existingOS } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("numero_os", num)
        .limit(1)
        .single();

      if (existingOS) {
        setFormFoundOS(existingOS);
        if (existingOS.tipo_servico_id) setTipoServicoId(existingOS.tipo_servico_id);
        if (existingOS.atendente_id) setAtendenteId(existingOS.atendente_id);
        if (existingOS.tecnico_id) setTecnicoId(existingOS.tecnico_id);

        if (profile) {
          const { data: pendingAval } = await supabase
            .from("avaliacoes")
            .select("id, tipo_avaliacao_id, concluida, nota_final")
            .eq("ordem_servico_id", existingOS.id)
            .eq("avaliador_id", profile.id)
            .eq("concluida", false)
            .limit(1)
            .single();

          if (pendingAval) {
            setFormPendingAval(pendingAval);
            // tipo_avaliacao_id no longer tracked
            toast.info("OS encontrada com avaliação pendente.");
          } else {
            toast.success("OS encontrada! Configure a avaliação abaixo.");
          }
        }
      } else {
        toast.info("OS não encontrada. Preencha os dados para criar.");
      }

      setFormValidated(true);
    } catch (err: any) {
      toast.error("Erro na validação: " + err.message);
    } finally {
      setFormValidating(false);
    }
  };

  // --- Auto-save logic (now uses ordem_servico_id) ---
  const autoSaveAnswer = useCallback(async (perguntaId: string, answer: Answer) => {
    if (!evalOsId || !profile) return;
    setAutoSaving(true);
    try {
      // Find evaluator's setor
      const setorId = evaluatorSetorIds[0] || null;
      await supabase.from("respostas_avaliacao").upsert(
        { 
          ordem_servico_id: evalOsId, 
          pergunta_id: perguntaId, 
          resposta: answer,
          avaliador_id: profile.id,
          avaliador_setor_id: setorId,
          avaliacao_id: evalAvaliacaoId,
        } as any,
        { onConflict: "ordem_servico_id,pergunta_id" }
      );
    } catch (e) { console.warn("Auto-save answer error:", e); }
    finally { setAutoSaving(false); }
  }, [evalOsId, evalAvaliacaoId, profile, evaluatorSetorIds]);

  const autoSaveObservation = useCallback(async (perguntaId: string, observation: string) => {
    if (!evalOsId || !profile) return;
    setAutoSaving(true);
    try {
      const setorId = evaluatorSetorIds[0] || null;
      await supabase.from("respostas_avaliacao").upsert(
        { 
          ordem_servico_id: evalOsId, 
          pergunta_id: perguntaId, 
          observacao: observation,
          avaliador_id: profile.id,
          avaliador_setor_id: setorId,
          avaliacao_id: evalAvaliacaoId,
        } as any,
        { onConflict: "ordem_servico_id,pergunta_id" }
      );
    } catch (e) { console.warn("Auto-save observation error:", e); }
    finally { setAutoSaving(false); }
  }, [evalOsId, evalAvaliacaoId, profile, evaluatorSetorIds]);

  const handleAnswerChange = useCallback((perguntaId: string, answer: Answer) => {
    setEvalAnswers(prev => ({ ...prev, [perguntaId]: answer }));
    setResponseAuthors(prev => ({ ...prev, [perguntaId]: { avaliador_nome: profile?.nome || "Você", resposta: answer || "" } }));
    autoSaveAnswer(perguntaId, answer);
  }, [autoSaveAnswer, profile]);

  const handleObservationChange = useCallback((perguntaId: string, text: string) => {
    setEvalObservations(prev => ({ ...prev, [perguntaId]: text }));
    if (debounceTimers.current[perguntaId]) clearTimeout(debounceTimers.current[perguntaId]);
    debounceTimers.current[perguntaId] = setTimeout(() => autoSaveObservation(perguntaId, text), 800);
  }, [autoSaveObservation]);

  const handleEvidenceUpload = useCallback(async (perguntaId: string, file: File) => {
    if (!evalOsId || !profile) return;
    setUploadingEvidence(perguntaId);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${evalOsId}/${perguntaId}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("evidencias").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
      const url = urlData.publicUrl;
      setEvalEvidencias(prev => ({ ...prev, [perguntaId]: url }));
      const setorId = evaluatorSetorIds[0] || null;
      await supabase.from("respostas_avaliacao").upsert(
        { 
          ordem_servico_id: evalOsId, 
          pergunta_id: perguntaId, 
          evidencia_url: url,
          avaliador_id: profile.id,
          avaliador_setor_id: setorId,
          avaliacao_id: evalAvaliacaoId,
        } as any,
        { onConflict: "ordem_servico_id,pergunta_id" }
      );
      toast.success("Evidência anexada!");
    } catch (e: any) {
      toast.error("Erro ao enviar evidência: " + e.message);
    } finally {
      setUploadingEvidence(null);
    }
  }, [evalOsId, evalAvaliacaoId, profile, evaluatorSetorIds]);

  const handleRemoveEvidence = useCallback(async (perguntaId: string) => {
    if (!evalOsId) return;
    setEvalEvidencias(prev => { const n = { ...prev }; delete n[perguntaId]; return n; });
    await supabase.from("respostas_avaliacao").upsert(
      { ordem_servico_id: evalOsId, pergunta_id: perguntaId, evidencia_url: null } as any,
      { onConflict: "ordem_servico_id,pergunta_id" }
    );
  }, [evalOsId]);

  const handleAudioUpload = useCallback(async (perguntaId: string, file: File) => {
    if (!evalOsId || !profile) return;
    setUploadingAudio(perguntaId);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${evalOsId}/${perguntaId}_audio.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("evidencias").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("evidencias").getPublicUrl(path);
      const url = urlData.publicUrl;
      setEvalAudios(prev => ({ ...prev, [perguntaId]: url }));
      const setorId = evaluatorSetorIds[0] || null;
      await supabase.from("respostas_avaliacao").upsert(
        { 
          ordem_servico_id: evalOsId, 
          pergunta_id: perguntaId, 
          audio_url: url,
          avaliador_id: profile.id,
          avaliador_setor_id: setorId,
          avaliacao_id: evalAvaliacaoId,
        } as any,
        { onConflict: "ordem_servico_id,pergunta_id" }
      );
      toast.success("Áudio anexado!");
    } catch (e: any) {
      toast.error("Erro ao enviar áudio: " + e.message);
    } finally {
      setUploadingAudio(null);
    }
  }, [evalOsId, evalAvaliacaoId, profile, evaluatorSetorIds]);

  const handleRemoveAudio = useCallback(async (perguntaId: string) => {
    if (!evalOsId) return;
    setEvalAudios(prev => { const n = { ...prev }; delete n[perguntaId]; return n; });
    await supabase.from("respostas_avaliacao").upsert(
      { ordem_servico_id: evalOsId, pergunta_id: perguntaId, audio_url: null } as any,
      { onConflict: "ordem_servico_id,pergunta_id" }
    );
  }, [evalOsId]);

  // --- Handlers ---
  const openEvaluation = async (avaliacaoId: string, osId: string) => {
    const { data: osData } = await supabase.from("ordens_servico").select("*").eq("id", osId).single();
    if (!osData) return;

    const { data: aval } = await supabase.from("avaliacoes").select("tipo_avaliacao_id, concluida, nota_final").eq("id", avaliacaoId).single();
    if (!aval) return;

    setEvalOsData(osData);
    setEvalOsId(osId);
    setEvalAvaliacaoId(avaliacaoId);
    setTipoServicoId(osData.tipo_servico_id || "");
    // tipo_avaliacao_id no longer tracked
    setEvalFinalized(aval.concluida || false);
    setEvalScore(aval.nota_final as number | null);

    // Load ALL responses for this OS (shared across all evaluators)
    const { data: allRespostas } = await (supabase as any)
      .from("respostas_avaliacao")
      .select("pergunta_id, resposta, observacao, evidencia_url, audio_url, avaliador_id")
      .eq("ordem_servico_id", osId);

    const ans: Record<string, Answer> = {};
    const obs: Record<string, string> = {};
    const evid: Record<string, string> = {};
    const aud: Record<string, string> = {};
    const otherMap: typeof otherEvalAnswers = {};

    // Get evaluator names for "other" answers
    const avaliadorIds = [...new Set((allRespostas || []).map((r: any) => r.avaliador_id).filter(Boolean))] as string[];
    let profileNames: Record<string, string> = {};
    if (avaliadorIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", avaliadorIds as string[]);
      profiles?.forEach(p => { profileNames[p.id] = p.nome; });
    }

    const authorsMap: Record<string, { avaliador_nome: string; resposta: string }> = {};

    (allRespostas || []).forEach((r: any) => {
      // All responses are loaded into the main answer maps
      if (r.resposta) ans[r.pergunta_id] = r.resposta as Answer;
      if (r.observacao) obs[r.pergunta_id] = r.observacao;
      if (r.evidencia_url) evid[r.pergunta_id] = r.evidencia_url;
      if (r.audio_url) aud[r.pergunta_id] = r.audio_url;

      // Track author info for ALL responses
      if (r.avaliador_id && r.resposta) {
        authorsMap[r.pergunta_id] = {
          avaliador_nome: profileNames[r.avaliador_id] || "Avaliador",
          resposta: r.resposta,
        };
      }

      // Track "other evaluator" info for display purposes
      if (r.avaliador_id && r.avaliador_id !== profile?.id && r.resposta) {
        otherMap[r.pergunta_id] = {
          resposta: r.resposta,
          observacao: r.observacao,
          evidencia_url: r.evidencia_url,
          audio_url: r.audio_url || null,
          avaliador_nome: profileNames[r.avaliador_id] || "Avaliador",
        };
      }
    });

    setEvalAnswers(ans);
    setEvalObservations(obs);
    setEvalEvidencias(evid);
    setEvalAudios(aud);
    setOtherEvalAnswers(otherMap);
    setResponseAuthors(authorsMap);

    setView("evaluation");
  };

  const openPendingEvaluation = async (pending: any) => {
    await openEvaluation(pending.id, pending.ordem_servico_id);
  };

  const handleContinuePending = async () => {
    if (!formPendingAval || !formFoundOS) return;
    await openEvaluation(formPendingAval.id, formFoundOS.id);
  };

  // Snapshot checklist questions into os_perguntas (idempotent)
  const snapshotOsPerguntas = async (osId: string, tsId: string) => {
    // Check if already snapshotted
    const { data: existing } = await (supabase as any)
      .from("os_perguntas")
      .select("id", { count: "exact", head: true })
      .eq("os_id", osId);
    if (existing && (existing as any).length > 0) return; // Already snapshotted
    // Also check via count
    const { count } = await (supabase as any)
      .from("os_perguntas")
      .select("id", { count: "exact", head: true })
      .eq("os_id", osId);
    if (count && count > 0) return;

    // Get linked checklists via junction table
    const { data: checklistLinks } = await (supabase as any)
      .from("tipo_servico_checklists")
      .select("checklist_id")
      .eq("tipo_servico_id", tsId);
    const checklistIds = (checklistLinks || []).map((l: any) => l.checklist_id);

    let perguntaIds: string[] = [];

    if (checklistIds.length > 0) {
      const { data: perguntas } = await supabase
        .from("perguntas_avaliacao")
        .select("id")
        .eq("ativo", true)
        .in("checklist_id", checklistIds);
      perguntaIds = (perguntas || []).map(p => p.id);
    } else {
      // Fallback: checklist_id on service type
      const { data: tipoServico } = await supabase
        .from("tipos_servico")
        .select("checklist_id")
        .eq("id", tsId)
        .single();
      if (tipoServico?.checklist_id) {
        const { data: perguntas } = await supabase
          .from("perguntas_avaliacao")
          .select("id")
          .eq("ativo", true)
          .eq("checklist_id", tipoServico.checklist_id);
        perguntaIds = (perguntas || []).map(p => p.id);
      } else {
        // Last fallback: tipo_servico_id or global
        const { data: perguntas } = await supabase
          .from("perguntas_avaliacao")
          .select("id")
          .eq("ativo", true)
          .or(`tipo_servico_id.eq.${tsId},tipo_servico_id.is.null`);
        perguntaIds = (perguntas || []).map(p => p.id);
      }
    }

    if (perguntaIds.length > 0) {
      const rows = perguntaIds.map(pid => ({ os_id: osId, pergunta_id: pid }));
      await (supabase as any).from("os_perguntas").insert(rows);
    }
  };

  const startMyEvaluation = async (osOverride?: any) => {
    const theOS = osOverride || selectedOS;
    if (!theOS || !profile) return;
    const tsId = theOS.tipo_servico_id;
    if (!tsId) { toast.error("OS sem tipo de serviço."); return; }

    // Ensure os_perguntas are snapshotted
    await snapshotOsPerguntas(theOS.id, tsId);

    // If OS is "concluida" but has incomplete data, reopen it
    if (theOS.status === "concluida") {
      const { data: osPerguntas } = await (supabase as any)
        .from("os_perguntas").select("pergunta_id").eq("os_id", theOS.id);
      const totalPerguntas = osPerguntas?.length || 0;
      const { data: savedRespostas } = await supabase
        .from("respostas_avaliacao").select("pergunta_id").eq("ordem_servico_id", theOS.id).not("resposta", "is", null);
      const totalRespostas = savedRespostas?.length || 0;
      
      if (totalPerguntas === 0 || totalRespostas < totalPerguntas) {
        // OS was prematurely concluded - reopen it
        await supabase.from("ordens_servico").update({ status: "em_andamento", data_conclusao: null } as any).eq("id", theOS.id);
        theOS.status = "em_andamento";
        toast.info("OS reaberta — avaliação estava incompleta.");
      }
    }

    // Fetch existing evaluations for this OS
    const { data: existingAvals } = await supabase
      .from("avaliacoes")
      .select("id, avaliador_id, concluida, tipo_avaliacao_id")
      .eq("ordem_servico_id", theOS.id);

    const myAvals = (existingAvals || []).filter((a: any) => a.avaliador_id === profile.id);
    const myOpenAval = myAvals.find((a: any) => !a.concluida);
    const myConcludedAval = myAvals.find((a: any) => a.concluida);

    if (myOpenAval) {
      await openEvaluation(myOpenAval.id, theOS.id);
      return;
    }

    // Allow reopen when OS is not fully concluded yet
    if (myConcludedAval) {
      if (theOS.status === "concluida") {
        toast.info("Sua avaliação já foi concluída.");
        return;
      }

      const { error: reopenError } = await supabase
        .from("avaliacoes")
        .update({ concluida: false, nota_final: null } as any)
        .eq("id", myConcludedAval.id);

      if (reopenError) {
        toast.error("Não foi possível reabrir sua avaliação: " + reopenError.message);
        return;
      }

      toast.info("Avaliação reaberta para ajustes.");
      await openEvaluation(myConcludedAval.id, theOS.id);
      return;
    }

    const { data: newAval, error } = await supabase.from("avaliacoes").insert({
      ordem_servico_id: theOS.id,
      avaliador_id: profile.id,
      tipo_avaliacao_id: null,
      concluida: false,
    } as any).select("id").single();

    if (error) {
      toast.error("Erro ao criar avaliação: " + error.message);
      return;
    }

    await supabase.from("ordens_servico").update({ status: "em_andamento" } as any).eq("id", theOS.id).eq("status", "aberta");
    await openEvaluation(newAval.id, theOS.id);
  };

  // Create OS from form + start evaluation
  const handleCreateAndStart = async () => {
    if (!profile) return;
    const num = formOsNumero.trim();
    if (!num) { toast.error("Informe o número da OS. Nenhuma OS pode entrar sem número."); return; }
    if (!clienteId) { toast.error("Cliente é obrigatório. Valide o CPF primeiro."); return; }
    if (!tipoServicoId) { toast.error("Selecione o tipo de serviço."); return; }
    if ((hasAtendimentoAccess || isAdmin) && !atendenteId) { toast.error("Selecione o atendente avaliado."); return; }
    if ((hasTecnicoAccess || isAdmin) && !tecnicoId) { toast.error("Selecione o técnico avaliado."); return; }
    if ((hasAtendimentoAccess || hasTecnicoAccess || isAdmin) && !atendenteId && !tecnicoId) { toast.error("Selecione pelo menos um colaborador avaliado."); return; }
    if (!formFoundOS && !formDataAbertura) { toast.error("Informe a data da ocorrência antes de salvar."); return; }

    try {
      // num already validated above
      const nomeTr = formClienteNome.trim() || null;
      const cpfDigits = formClienteCpf.replace(/\D/g, "");
      const cpfTr = cpfDigits.length === 11 ? formatCpf(cpfDigits) : formClienteCpf.trim() || null;

      let osId: string;
      if (formFoundOS) {
        osId = formFoundOS.id;
        await supabase.from("ordens_servico").update({
          atendente_id: atendenteId || null, tecnico_id: tecnicoId || null,
          tipo_servico_id: tipoServicoId, cliente_id: clienteId,
          numero_os: num || formFoundOS.numero_os || null,
          cliente_nome: nomeTr || formFoundOS.cliente_nome,
          cliente_cpf: cpfTr || formFoundOS.cliente_cpf,
          status: (formFoundOS.status === "aguardando_numero" && num) ? "aberta" : formFoundOS.status,
        } as any).eq("id", osId);
      } else {
        // No existing OS found in search — create a new one
        const { data: newOs, error: oe } = await supabase.from("ordens_servico").insert({
          numero_os: num, cliente_nome: nomeTr, cliente_cpf: cpfTr, tipo_servico_id: tipoServicoId,
          cliente_id: clienteId, atendente_id: atendenteId || null, tecnico_id: tecnicoId || null,
          data_abertura: formDataAbertura.toISOString(),
        } as any).select("id").single();
        if (oe) throw oe;
        osId = newOs.id;
      }

      // Snapshot checklist questions into os_perguntas
      await snapshotOsPerguntas(osId, tipoServicoId);

      // Create avaliacao (tipo_avaliacao_id no longer used)
      const { data: newAval, error: ae } = await supabase.from("avaliacoes").insert({
        ordem_servico_id: osId, avaliador_id: profile.id, tipo_avaliacao_id: null, concluida: false,
      } as any).select("id").single();
      if (ae) throw ae;

      setShowNewOsDialog(false);
      toast.success("Avaliação criada! Iniciando...");
      await openEvaluation(newAval.id, osId);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    }
  };

  // Fetch and cache client addresses for OS display
  const fetchClienteAddresses = useCallback(async (clienteIds: string[]) => {
    const idsToFetch = clienteIds.filter(id => id && !clienteAddressMap[id]);
    if (idsToFetch.length === 0) return;
    const { data: clientes } = await supabase.from("clientes").select("id, cidade_id, bairro_id, rua_id, numero").in("id", idsToFetch);
    if (!clientes?.length) return;
    const cidadeIds = [...new Set(clientes.map(c => c.cidade_id).filter(Boolean))] as string[];
    const bairroIds = [...new Set(clientes.map(c => c.bairro_id).filter(Boolean))] as string[];
    const ruaIds = [...new Set(clientes.map(c => c.rua_id).filter(Boolean))] as string[];
    const [cidadesRes, bairrosRes, ruasRes] = await Promise.all([
      cidadeIds.length ? supabase.from("cidades").select("id, nome").in("id", cidadeIds) : { data: [] },
      bairroIds.length ? supabase.from("bairros").select("id, nome").in("id", bairroIds) : { data: [] },
      ruaIds.length ? supabase.from("ruas").select("id, nome").in("id", ruaIds) : { data: [] },
    ]);
    const cidadeMap: Record<string, string> = {}; (cidadesRes.data || []).forEach(c => { cidadeMap[c.id] = c.nome; });
    const bairroMap: Record<string, string> = {}; (bairrosRes.data || []).forEach(b => { bairroMap[b.id] = b.nome; });
    const ruaMap: Record<string, string> = {}; (ruasRes.data || []).forEach(r => { ruaMap[r.id] = r.nome; });
    const newMap: Record<string, string> = {};
    clientes.forEach(c => {
      const parts: string[] = [];
      if (c.rua_id && ruaMap[c.rua_id]) parts.push(ruaMap[c.rua_id]);
      if (c.numero) parts.push(`nº ${c.numero}`);
      if (c.bairro_id && bairroMap[c.bairro_id]) parts.push(bairroMap[c.bairro_id]);
      if (c.cidade_id && cidadeMap[c.cidade_id]) parts.push(cidadeMap[c.cidade_id]);
      newMap[c.id] = parts.length > 0 ? parts.join(", ") : "";
    });
    setClienteAddressMap(prev => ({ ...prev, ...newMap }));
  }, [clienteAddressMap]);

  // Auto-fetch addresses when OS views change
  useEffect(() => {
    const ids: string[] = [];
    if (selectedOS?.cliente_id) ids.push(selectedOS.cliente_id);
    if (evalOsData?.cliente_id) ids.push(evalOsData.cliente_id);
    if (ids.length > 0) fetchClienteAddresses(ids);
  }, [selectedOS?.cliente_id, evalOsData?.cliente_id]);


  const handleFinalizeEvaluation = async () => {
    if (!evalAvaliacaoId || !evalOsId) return;

    // Check that employee selections are set based on evaluator's sector
    const currentOsData = evalOsData;
    if (currentOsData) {
      if (hasTecnicoAccess && !currentOsData.tecnico_id) {
        toast.error("Selecione o técnico avaliado antes de finalizar.");
        return;
      }
      if (hasAtendimentoAccess && !currentOsData.atendente_id) {
        toast.error("Selecione o atendente avaliado antes de finalizar.");
        return;
      }
    }

    // Only check answerable questions (evaluator's sector)
    const answerableQuestions = evalPerguntas.filter(p => isQuestionAnswerable(p.setor_avaliado_id));
    const unanswered = answerableQuestions.filter(p => evalAnswers[p.id] == null);
    if (unanswered.length > 0) { toast.error("Responda todas as perguntas do seu setor antes de concluir."); return; }
    const missingObs = answerableQuestions.filter(p => evalAnswers[p.id] === "nao" && !(evalObservations[p.id]?.trim()));
    if (missingObs.length > 0) { toast.error("Descreva a irregularidade para itens reprovados."); return; }
    const missingNaObs = answerableQuestions.filter(p => evalAnswers[p.id] === "na" && !(evalObservations[p.id]?.trim()));
    if (missingNaObs.length > 0) { toast.error("Descreva o motivo para itens marcados como N/A."); return; }
    // Evidência é opcional para itens reprovados

    setEvalSubmitting(true);
    try {
      // Calculate score only from answerable questions
      let totalWeight = 0;
      let earnedWeight = 0;
      for (const p of answerableQuestions) {
        const answer = evalAnswers[p.id];
        if (answer != null) {
          totalWeight += p.peso;
          if (answer === "sim" || answer === "na") earnedWeight += p.peso;
        }
      }
      const nota = totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;

      await supabase.from("avaliacoes").update({ concluida: true, nota_final: nota, concluida_em: new Date().toISOString() }).eq("id", evalAvaliacaoId);
      setEvalScore(nota);
      setEvalFinalized(true);
      toast.success(`Avaliação do seu setor concluída! Nota: ${nota.toFixed(1)}%`);
      
      // OS completion is handled by the database trigger (check_os_completion)
      // which verifies BOTH all avaliacoes are concluded AND all os_perguntas have responses
      // Re-fetch OS status to show updated info
      if (evalOsId) {
        const { data: updatedOs } = await supabase.from("ordens_servico").select("status").eq("id", evalOsId).single();
        if (updatedOs?.status === "concluida") {
          toast.success("Todas as avaliações finalizadas! OS concluída.");
        }
      }
      
      refetchPending();
      // Only navigate away if OS is fully concluded
      if (evalOsId) {
        const { data: updatedOsFinal } = await supabase.from("ordens_servico").select("status").eq("id", evalOsId).single();
        if (updatedOsFinal?.status === "concluida") {
          setTimeout(() => navigate("/"), 1500);
        }
      }
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setEvalSubmitting(false);
    }
  };

  const promptDeleteOS = (osId: string, osNumero: string) => {
    if (!isAdmin) { toast.error("Apenas administradores podem excluir OS."); return; }
    setDeleteOsId(osId);
    setDeleteOsNumero(osNumero);
    setDeletePassword("");
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteOS = async () => {
    if (!deleteOsId || !profile) return;
    if (!deletePassword.trim()) { toast.error("Informe sua senha."); return; }

    setDeleteLoading(true);
    try {
      // Verify password via re-authentication
      const { data: authData } = await supabase.auth.getUser();
      const authEmail = authData.user?.email || profile.email;
      if (!authEmail) {
        throw new Error("Não foi possível validar o usuário autenticado.");
      }

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: deletePassword,
      });
      if (authError) {
        toast.error("Senha incorreta.");
        return;
      }

      // 1) Find all evaluations linked to the OS
      const { data: avals, error: avalsError } = await supabase
        .from("avaliacoes")
        .select("id")
        .eq("ordem_servico_id", deleteOsId);
      if (avalsError) throw avalsError;

      // 2) Delete evidências from storage + respostas_avaliacao
      if (avals?.length) {
        const avalIds = avals.map((a) => a.id);

        // Fetch evidencias before deleting
        const { data: respostasComEvidencia } = await supabase
          .from("respostas_avaliacao")
          .select("evidencia_url")
          .in("avaliacao_id", avalIds)
          .not("evidencia_url", "is", null);

        if (respostasComEvidencia?.length) {
          const paths = respostasComEvidencia
            .map((r) => r.evidencia_url)
            .filter(Boolean)
            .map((url) => {
              const parts = url!.split("/evidencias/");
              return parts.length > 1 ? parts[1] : null;
            })
            .filter(Boolean) as string[];
          if (paths.length > 0) {
            await supabase.storage.from("evidencias").remove(paths);
          }
        }

        const { error: respostasError } = await supabase
          .from("respostas_avaliacao")
          .delete()
          .in("avaliacao_id", avalIds);
        if (respostasError) throw respostasError;
      }

      // 4) Delete avaliações
      const { error: avaliacoesError } = await supabase
        .from("avaliacoes")
        .delete()
        .eq("ordem_servico_id", deleteOsId);
      if (avaliacoesError) throw avaliacoesError;

      // 5) Delete OS
      const { error: osError } = await supabase
        .from("ordens_servico")
        .delete()
        .eq("id", deleteOsId);
      if (osError) throw osError;

      // 6) Audit log - only OS number
      const { error: logError } = await supabase.from("audit_logs").insert({
        user_id: profile.user_id,
        acao: "exclusao_os",
        tabela: "ordens_servico",
        registro_id: deleteOsId,
        dados_anteriores: { numero_os: deleteOsNumero },
      } as any);
      if (logError) {
        console.warn("Falha ao registrar log de exclusão:", logError);
      }

      toast.success(`OS #${deleteOsNumero} excluída com sucesso.`);
      setDeleteDialogOpen(false);
      setDeletePassword("");
      setSelectedOS(null);
      setView("list");
      backToList();
      refetchPending();
    } catch (err: any) {
      toast.error("Erro ao excluir: " + (err?.message || "falha desconhecida"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const backToList = () => {
    setView("list");
    setSelectedOS(null);
    setEvalAvaliacaoId(null);
    setEvalOsId(null);
    setEvalOsData(null);
    setEvalAnswers({});
    setEvalObservations({});
    setEvalEvidencias({});
    setEvalAudios({});
    setResponseAuthors({});
    setEvalFinalized(false);
    setEvalScore(null);
    autoFinalizeTriggered.current = false;
    setIsEditing(false);
  };

  const handleStartEditing = async () => {
    if (!evalAvaliacaoId || !evalOsId || !profile) return;
    const wasOsConcluded = evalOsData?.status === "concluida";
    
    // If OS is concluded, only admins can reopen
    if (wasOsConcluded && !isAdmin) {
      toast.error("Apenas administradores podem editar OS concluída.");
      return;
    }

    // If OS was concluded, reopen it and log the reopening
    if (wasOsConcluded) {
      await supabase.from("ordens_servico").update({ status: "em_andamento", data_conclusao: null } as any).eq("id", evalOsId);
      setEvalOsData({ ...evalOsData, status: "em_andamento", data_conclusao: null });
      
      // Log the reopening
      await (supabase as any).from("os_reaberturas").insert({
        ordem_servico_id: evalOsId,
        reaberta_por: profile.id,
        motivo: "edicao_admin",
      });
    }

    // Reopen all avaliacoes for this OS so answers can be changed
    await supabase.from("avaliacoes").update({ concluida: false, nota_final: null } as any).eq("id", evalAvaliacaoId);
    setEvalFinalized(false);
    setEvalScore(null);
    setIsEditing(true);
    autoFinalizeTriggered.current = true; // Prevent auto-finalize while editing
    toast.info("Modo de edição ativado. Altere os dados e clique em Salvar.");
  };

  const handleSaveEditing = async () => {
    setIsEditing(false);
    // Re-finalize the evaluation — the DB trigger will auto-conclude OS if all questions answered
    await handleFinalizeEvaluation();
  };

  const handleFillNumeroOS = async () => {
    if (!fillNumeroOsId || !fillNumeroValue.trim()) return;
    setFillNumeroLoading(true);
    try {
      // Check if OS number already exists
      const { data: existing } = await supabase
        .from("ordens_servico")
        .select("id")
        .eq("numero_os", fillNumeroValue.trim())
        .limit(1)
        .single();
      if (existing) {
        toast.error("Já existe uma OS com esse número.");
        return;
      }
      await supabase.from("ordens_servico").update({
        numero_os: fillNumeroValue.trim(),
        status: "aberta" as any,
      } as any).eq("id", fillNumeroOsId);

      // Snapshot os_perguntas so the OS appears in pending evaluations
      const targetOs = aguardandoNumeroOS.find((o: any) => o.id === fillNumeroOsId);
      if (targetOs?.tipo_servico_id) {
        await snapshotOsPerguntas(fillNumeroOsId, targetOs.tipo_servico_id);
      }

      toast.success("Número da OS preenchido com sucesso! OS pronta para avaliação.");
      setFillNumeroOsId(null);
      setFillNumeroValue("");
      refetchAguardando();
      refetchPending();
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setFillNumeroLoading(false);
    }
  };

  const handleViewCliente = async (clienteId: string) => {
    const { data: cliente } = await supabase.from("clientes").select("*").eq("id", clienteId).single();
    if (!cliente) { toast.error("Cliente não encontrado."); return; }
    // Fetch contacts
    const { data: contatos } = await supabase.from("cliente_contatos").select("*").eq("cliente_id", clienteId);
    // Fetch lead linked to this client
    const { data: lead } = await supabase.from("leads").select("id, nome, responsavel_id, status_lead, origem_lead, created_at, plano_id, repetidor").eq("cliente_id", clienteId).limit(1).single();
    let leadHistory: any[] = [];
    let leadInteracoes: any[] = [];
    let leadContatos: any[] = [];
    let conversorNome = "—";
    let planoNome = "—";
    if (lead) {
      // Fetch lead history, interactions, contacts in parallel
      const [histRes, intRes, lcRes] = await Promise.all([
        supabase.from("lead_historico").select("id, tipo_evento, descricao, data_evento, usuario_id").eq("lead_id", lead.id).order("data_evento", { ascending: false }).limit(50),
        supabase.from("lead_interacoes").select("id, tipo_contato, resultado, data_interacao, colaborador_id, numero_utilizado").eq("lead_id", lead.id).order("data_interacao", { ascending: false }).limit(50),
        supabase.from("lead_contatos").select("id, tipo_contato, valor, tem_whatsapp").eq("lead_id", lead.id),
      ]);
      leadHistory = histRes.data || [];
      leadInteracoes = intRes.data || [];
      leadContatos = lcRes.data || [];
      // Get names for user IDs
      const allUserIds = [...new Set([
        lead.responsavel_id,
        ...leadHistory.map((h: any) => h.usuario_id),
        ...leadInteracoes.map((i: any) => i.colaborador_id),
      ].filter(Boolean))];
      if (allUserIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, nome").in("id", allUserIds);
        const nameMap: Record<string, string> = {};
        profs?.forEach(p => { nameMap[p.id] = p.nome; });
        conversorNome = lead.responsavel_id ? (nameMap[lead.responsavel_id] || "—") : "—";
        leadHistory = leadHistory.map((h: any) => ({ ...h, _usuario_nome: nameMap[h.usuario_id] || "—" }));
        leadInteracoes = leadInteracoes.map((i: any) => ({ ...i, _colaborador_nome: nameMap[i.colaborador_id] || "—" }));
      }
      if (lead.plano_id) {
        const { data: plano } = await supabase.from("planos").select("nome_plano").eq("id", lead.plano_id).single();
        planoNome = plano?.nome_plano || "—";
      }
    }
    setViewClienteData({
      ...cliente,
      contatos: contatos || [],
      lead,
      leadHistory,
      leadInteracoes,
      leadContatos,
      conversorNome,
      planoNome,
    });
    setViewClienteOpen(true);
  };

  const resetForm = () => {
    setFormClienteCpf("");
    setFormClienteNome("");
    setCpfValidated(false);
    setFormFoundCliente(null);
    setShowNewClienteForm(false);
    setClienteId(null);
    setFormOsNumero("");
    setFormValidated(false);
    setFormFoundOS(null);
    setSearchResults([]);
    setFormPendingAval(null);
    setShowNewOsDialog(false);
    setTipoServicoId("");
    // selectedTipoAvaliacaoId removed
    setAtendenteId("");
    setTecnicoId("");
  };

  // --- Computed ---
  const isOsFullyConcluded = evalOsData?.status === "concluida";
  const answerablePerguntas = useMemo(() => evalPerguntas.filter(p => isQuestionAnswerable(p.setor_avaliado_id)), [evalPerguntas, isQuestionAnswerable]);
  const pendingPerguntas = useMemo(() => evalPerguntas.filter(p => !isQuestionAnswerable(p.setor_avaliado_id)), [evalPerguntas, isQuestionAnswerable]);
  
  // Global progress: ALL questions answered across ALL evaluators
  const globalAnsweredCount = evalPerguntas.filter(p => evalAnswers[p.id] != null).length;
  const globalProgressPercent = evalPerguntas.length > 0 ? Math.round((globalAnsweredCount / evalPerguntas.length) * 100) : 0;
  const isLocked = (isOsFullyConcluded && !isAdmin) || (evalFinalized && !isEditing);
  const canEdit = (isAdmin) || (!isOsFullyConcluded && (evalFinalized || isEditing));
  // My sector progress
  const myAnsweredCount = answerablePerguntas.filter(p => evalAnswers[p.id] != null).length;
  const myProgressPercent = answerablePerguntas.length > 0 ? Math.round((myAnsweredCount / answerablePerguntas.length) * 100) : 0;
  
  const evalTotalScore = evalPerguntas.reduce((a, p) => (evalAnswers[p.id] === "sim" || evalAnswers[p.id] === "na") ? a + p.peso : a, 0);
  const evalMaxScore = evalPerguntas.reduce((a, p) => evalAnswers[p.id] != null ? a + p.peso : a, 0);
  // Compute display score from answers when nota_final is null (e.g. after admin edit)
  const displayScore = evalScore ?? (evalMaxScore > 0 ? (evalTotalScore / evalMaxScore) * 100 : null);

  // Auto-finalize when all answerable questions are answered
  const autoFinalizeTriggered = useRef(false);
  useEffect(() => {
    if (evalFinalized || isOsFullyConcluded || evalSubmitting || isEditing) return;
    if (answerablePerguntas.length === 0) return;
    const allAnswered = answerablePerguntas.every(p => evalAnswers[p.id] != null);
    if (!allAnswered) {
      // Reset trigger if conditions changed (e.g. editing removed an answer)
      autoFinalizeTriggered.current = false;
      return;
    }
    if (autoFinalizeTriggered.current) return;
    // Check "nao" answers have observations and evidence
    const missingObs = answerablePerguntas.some(p => evalAnswers[p.id] === "nao" && !(evalObservations[p.id]?.trim()));
    const missingEvidence = answerablePerguntas.some(p => evalAnswers[p.id] === "nao" && !evalEvidencias[p.id]);
    if (missingObs || missingEvidence) return;
    // Delay to let auto-save finish
    autoFinalizeTriggered.current = true;
    const timer = setTimeout(() => {
      handleFinalizeEvaluation();
    }, 2000);
    return () => clearTimeout(timer);
  }, [evalAnswers, answerablePerguntas, evalFinalized, isOsFullyConcluded, evalSubmitting, evalObservations, evalEvidencias]);

  const atendenteNome = allProfiles.find(p => p.id === (selectedOS as any)?.atendente_id)?.nome;
  const tecnicoNome = allProfiles.find(p => p.id === (selectedOS as any)?.tecnico_id)?.nome;
  const evalAtendenteNome = allProfiles.find(p => p.id === evalOsData?.atendente_id)?.nome;
  const evalTecnicoNome = allProfiles.find(p => p.id === evalOsData?.tecnico_id)?.nome;
  const evalTipoServicoNome = tiposServico.find(t => t.id === evalOsData?.tipo_servico_id)?.nome;
  const selectedTipoNome = evalTipoServicoNome || tiposServico.find(t => t.id === tipoServicoId)?.nome;

  const canCreateEval = !!tipoServicoId && (
    isAdmin ? (!!atendenteId && !!tecnicoId) :
    hasAtendimentoAccess && hasTecnicoAccess ? (!!atendenteId && !!tecnicoId) :
    hasAtendimentoAccess ? !!atendenteId :
    hasTecnicoAccess ? !!tecnicoId :
    true // Evaluators from other sectors (e.g. Auditoria) can proceed without selecting atendente/tecnico
  );

  // --- PDF Generation ---
  const canExport = evalFinalized || evalOsData?.status === "concluida";
  const generatePDF = useCallback(() => {
    if (!evalOsData) return;
    if (evalOsData.status !== "concluida") {
      toast.error("Avaliação ainda não concluída. Exportação indisponível.");
      return;
    }
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = 20;

    const addText = (text: string, size: number, style: "normal" | "bold" = "normal", maxWidth = contentWidth) => {
      doc.setFontSize(size);
      doc.setFont("helvetica", style);
      const lines = doc.splitTextToSize(text, maxWidth);
      if (y + lines.length * (size * 0.5) > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines, margin, y);
      y += lines.length * (size * 0.5) + 2;
    };

    const addLine = () => {
      doc.setDrawColor(200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 4;
    };

    // Header
    addText(`Relatório de Avaliação - OS #${evalOsData.numero_os}`, 16, "bold");
    addText(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 10);
    y += 2;
    addLine();

    // OS Info
    addText("Informações da OS", 12, "bold");
    addText(`Cliente: ${evalOsData.cliente_nome || "—"}`, 10);
    addText(`CPF: ${evalOsData.cliente_cpf || "—"}`, 10);
    addText(`Tipo de Serviço: ${evalTipoServicoNome || "—"}`, 10);
    addText(`Atendente: ${evalAtendenteNome || "Não definido"}`, 10);
    addText(`Técnico: ${evalTecnicoNome || "Não definido"}`, 10);
    addText(`Status: ${statusLabel[evalOsData.status]?.text || evalOsData.status}`, 10);
    const pdfScore = evalScore ?? (evalMaxScore > 0 ? (evalTotalScore / evalMaxScore) * 100 : null);
    if (pdfScore != null) {
      addText(`Nota Final: ${pdfScore.toFixed(1)}%`, 12, "bold");
    }
    y += 4;
    addLine();

    // Questions
    addText("Checklist de Avaliação", 12, "bold");
    y += 2;

    evalPerguntas.forEach((p, i) => {
      const answer = evalAnswers[p.id];
      const obs = evalObservations[p.id];
      const hasEvidence = !!evalEvidencias[p.id];
      const answerLabel = answer === "sim" ? "SIM" : answer === "nao" ? "NÃO" : answer === "na" ? "N/A" : "—";

      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        y = 20;
      }

      addText(`${String(i + 1).padStart(2, "0")}. ${p.pergunta}`, 10, "bold");
      addText(`   Resposta: ${answerLabel}  |  Nota: ${p.peso}`, 10);

      if (obs?.trim()) {
        addText(`   Observação: ${obs}`, 9);
      }
      if (hasEvidence) {
        addText(`   📷 Foto anexada`, 9);
      }
      y += 2;
    });

    // Score summary
    y += 4;
    addLine();
    addText("Resumo", 12, "bold");
    addText(`Total de perguntas: ${evalPerguntas.length}`, 10);
    addText(`Respondidas: ${globalAnsweredCount}`, 10);
    if (evalMaxScore > 0) {
      addText(`Pontuação: ${evalTotalScore}/${evalMaxScore} pts (${((evalTotalScore / evalMaxScore) * 100).toFixed(1)}%)`, 10, "bold");
    }

    doc.save(`avaliacao_os_${evalOsData.numero_os}.pdf`);
    toast.success("PDF gerado com sucesso!");
  }, [evalOsData, evalPerguntas, evalAnswers, evalObservations, evalEvidencias, evalScore, evalTipoServicoNome, evalAtendenteNome, evalTecnicoNome, globalAnsweredCount, evalTotalScore, evalMaxScore]);

  // ===================== RENDER =====================

  // --- Full-Page Evaluation View ---
  if (view === "evaluation" && evalOsData) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto pb-20">
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
                {evalOsData.cliente_id && clienteAddressMap[evalOsData.cliente_id] && (
                  <p className="text-caption text-muted-foreground mt-0.5">📍 {clienteAddressMap[evalOsData.cliente_id]}</p>
                )}
                {evalTipoServicoNome && <p className="text-caption text-muted-foreground mt-0.5">Serviço: {evalTipoServicoNome}</p>}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-caption text-muted-foreground">Data da Ocorrência: {format(new Date(evalOsData.data_abertura || evalOsData.created_at), "dd/MM/yyyy HH:mm")}</p>
                  {(evalOsData.status !== "concluida" || isAdmin) ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-muted">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={new Date(evalOsData.data_abertura || evalOsData.created_at)}
                          onSelect={async (d) => {
                            if (!d) return;
                            await supabase.from("ordens_servico").update({ data_abertura: d.toISOString() } as any).eq("id", evalOsData.id);
                            setEvalOsData({ ...evalOsData, data_abertura: d.toISOString() });
                            toast.success("Data da ocorrência atualizada!");
                          }}
                          initialFocus
                          className="p-3 pointer-events-auto"
                          locale={ptBR}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span title="Não é permitido alterar a data após a conclusão da OS"><Lock className="w-3 h-3 text-muted-foreground" /></span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {autoSaving && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
                  </div>
                )}
                {canEdit && !isEditing && (
                  <Button size="sm" variant="outline" onClick={handleStartEditing} className="press-effect h-8 text-xs px-2 sm:px-3">
                    <Pencil className="w-3 h-3 sm:mr-1" /> <span className="hidden sm:inline">Alterar</span>
                  </Button>
                )}
                {isEditing && (
                  <Button size="sm" onClick={handleSaveEditing} disabled={evalSubmitting} className="press-effect h-8 text-xs px-2 sm:px-3">
                    {evalSubmitting ? <Loader2 className="w-3 h-3 sm:mr-1 animate-spin" /> : <Save className="w-3 h-3 sm:mr-1" />}
                    <span className="hidden sm:inline">Salvar</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Assigned employees + avaliadores info */}
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6 mt-3 pt-3 border-t border-border flex-wrap">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                <span className="text-muted-foreground">Atendente:</span>
                {isEditing ? (
                  <Select value={evalOsData.atendente_id || atendenteId || ""} onValueChange={async (val) => {
                    setAtendenteId(val);
                    await supabase.from("ordens_servico").update({ atendente_id: val } as any).eq("id", evalOsData.id);
                    setEvalOsData({ ...evalOsData, atendente_id: val });
                    toast.success("Atendente atualizado!");
                  }}>
                    <SelectTrigger className="h-8 w-full sm:w-[200px]"><SelectValue placeholder="Selecionar atendente" /></SelectTrigger>
                    <SelectContent>
                      {atendimentoProfiles.map(p =>
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium text-foreground">{evalAtendenteNome || "Não definido"}</span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm">
                <span className="text-muted-foreground">Técnico:</span>
                {isEditing ? (
                  <Select value={evalOsData.tecnico_id || tecnicoId || ""} onValueChange={async (val) => {
                    setTecnicoId(val);
                    await supabase.from("ordens_servico").update({ tecnico_id: val } as any).eq("id", evalOsData.id);
                    setEvalOsData({ ...evalOsData, tecnico_id: val });
                    toast.success("Técnico atualizado!");
                  }}>
                    <SelectTrigger className="h-8 w-full sm:w-[200px]"><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                    <SelectContent>
                      {tecnicoProfiles.map(p =>
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="font-medium text-foreground">{evalTecnicoNome || "Não definido"}</span>
                )}
              </div>
            </div>

            {/* Avaliadores com hora de conclusão */}
            {osAvaliacoes.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
                <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Avaliadores</span>
                {osAvaliacoes.map((aval: any, idx: number) => (
                  <div key={aval.id} className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium text-foreground">Avaliador {idx + 1}: {aval._avaliador_nome}</span>
                    {aval.concluida_em ? (
                      <span className="text-caption text-success">• Concluído em {format(new Date(aval.concluida_em), "dd/MM/yyyy HH:mm")}</span>
                    ) : (
                      <span className="text-caption text-warning">• Pendente</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Histórico de edições */}
            {osReaberturas.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
                <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Histórico de Edições</span>
                {osReaberturas.map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm flex-wrap">
                    <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-foreground">Editada por <span className="font-medium">{r._nome}</span></span>
                    <span className="text-caption text-muted-foreground">em {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</span>
                    {r.campos_alterados?.length > 0 && (
                      <span className="text-caption text-muted-foreground">
                        ({r.campos_alterados.map((c: string) => 
                          c === "atendente_id" ? "Atendente" : c === "tecnico_id" ? "Técnico" : c === "data_abertura" ? "Data" : c
                        ).join(", ")})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="bg-card border border-border rounded-lg shadow-card mb-4 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progresso Global da OS</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground font-tabular">{globalProgressPercent}%</span>
              <span className="text-caption text-muted-foreground font-tabular">({globalAnsweredCount}/{evalPerguntas.length} perguntas)</span>
            </div>
          </div>
          <Progress value={globalProgressPercent} className="h-3" />
          
          {/* My sector progress */}
          {answerablePerguntas.length < evalPerguntas.length && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-caption text-muted-foreground">Meu setor</span>
                <span className="text-caption font-medium text-foreground font-tabular">{myProgressPercent}% ({myAnsweredCount}/{answerablePerguntas.length})</span>
              </div>
              <Progress value={myProgressPercent} className="h-2" />
            </div>
          )}
          
          {evalMaxScore > 0 && (
            <div className="flex items-center justify-between mt-2 text-caption text-muted-foreground">
              <span>Pontuação parcial</span>
              <span className={cn("font-bold font-tabular",
                evalMaxScore > 0 && (evalTotalScore / evalMaxScore) * 100 >= 85 ? "text-success" :
                evalMaxScore > 0 && (evalTotalScore / evalMaxScore) * 100 >= 75 ? "text-warning" : "text-destructive"
              )}>
                {evalTotalScore}/{evalMaxScore} pts ({evalMaxScore > 0 ? ((evalTotalScore / evalMaxScore) * 100).toFixed(1) : 0}%)
              </span>
            </div>
          )}
        </div>

        {/* Editing mode banner */}
        {isEditing && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-warning/5 border-2 border-warning/20 rounded-lg p-3 sm:p-4 mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Pencil className="w-5 h-5 text-warning shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">Modo de Edição</p>
                <p className="text-caption text-muted-foreground">Altere os avaliados e respostas. Clique em Salvar quando terminar.</p>
              </div>
            </div>
            <Button size="sm" onClick={handleSaveEditing} disabled={evalSubmitting} className="press-effect w-full sm:w-auto">
              {evalSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </motion.div>
        )}

        {/* Finalized state */}
        {evalFinalized && !isEditing && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-success/5 border-2 border-success/20 rounded-lg p-4 sm:p-6 mb-4 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-success/10 mb-3">
              <Check className="w-6 h-6 sm:w-8 sm:h-8 text-success" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground">Avaliação Concluída!</h2>
            <p className="text-2xl sm:text-3xl font-bold text-primary font-tabular mt-2">{displayScore?.toFixed(1)}%</p>
            <p className="text-sm text-muted-foreground mt-1">{globalAnsweredCount} perguntas respondidas</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-3">
              {canEdit && (
                <Button onClick={handleStartEditing} variant="outline" className="press-effect w-full sm:w-auto">
                  <Pencil className="w-4 h-4 mr-2" /> Alterar Avaliação
                </Button>
              )}
              <Button onClick={generatePDF} variant="outline" className="press-effect w-full sm:w-auto" disabled={!canExport}>
                <Download className="w-4 h-4 mr-2" /> Baixar PDF
              </Button>
            </div>
            {!canExport && (
              <p className="text-xs text-muted-foreground mt-2">Exportação disponível apenas quando a OS estiver concluída por todos os setores.</p>
            )}
          </motion.div>
        )}

        {/* Employee Selection Cards - before questions */}
        {!isLocked && (
          <div className="space-y-3 mb-4">
            {/* Atendente selection */}
            {!evalOsData.atendente_id && (
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Quem é o Atendente avaliado nesta OS?</p>
                    <p className="text-caption text-muted-foreground mt-0.5">Selecione o colaborador do setor de Atendimento</p>
                    <div className="mt-2">
                      {(hasAtendimentoAccess || isAdmin) ? (
                        <Select value={atendenteId} onValueChange={async (val) => {
                          setAtendenteId(val);
                          await supabase.from("ordens_servico").update({ atendente_id: val } as any).eq("id", evalOsData.id);
                          setEvalOsData({ ...evalOsData, atendente_id: val });
                          toast.success("Atendente salvo!");
                        }}>
                          <SelectTrigger className="h-9 w-full sm:w-[250px]"><SelectValue placeholder="Selecionar atendente" /></SelectTrigger>
                          <SelectContent>
                            {atendimentoProfiles.filter(p => p.id !== profile?.id).map(p =>
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Aguardando seleção pelo setor de Atendimento</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Técnico selection */}
            {!evalOsData.tecnico_id && (
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Quem é o Técnico avaliado nesta OS?</p>
                    <p className="text-caption text-muted-foreground mt-0.5">Selecione o colaborador do setor Técnico</p>
                    <div className="mt-2">
                      {(hasTecnicoAccess || isAdmin) ? (
                        <Select value={tecnicoId} onValueChange={async (val) => {
                          setTecnicoId(val);
                          await supabase.from("ordens_servico").update({ tecnico_id: val } as any).eq("id", evalOsData.id);
                          setEvalOsData({ ...evalOsData, tecnico_id: val });
                          toast.success("Técnico salvo!");
                        }}>
                          <SelectTrigger className="h-9 w-full sm:w-[250px]"><SelectValue placeholder="Selecionar técnico" /></SelectTrigger>
                          <SelectContent>
                            {tecnicoProfiles.filter(p => p.id !== profile?.id).map(p =>
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Aguardando seleção pelo setor Técnico</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Questions List - Separated by Sector */}
        {evalPerguntas.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-body text-muted-foreground">Nenhuma pergunta cadastrada para esta combinação de serviço e avaliação.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Section: My Sector Questions */}
            {answerablePerguntas.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Perguntas do Meu Setor ({myAnsweredCount}/{answerablePerguntas.length})
                </h3>
                <div className="space-y-3">
                  {answerablePerguntas.map((p, i) => {
                    const answer = evalAnswers[p.id] || null;
                    const observation = evalObservations[p.id] || "";
                    const evidenciaUrl = evalEvidencias[p.id] || null;
                    const audioUrl = evalAudios[p.id] || null;
                    const isUploading = uploadingEvidence === p.id;
                    const isAudioUploading = uploadingAudio === p.id;
                    return (
                      <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                        className={cn("bg-card border rounded-lg transition-colors",
                          answer === "sim" ? "border-success/30" : answer === "nao" ? "border-destructive/30" : answer === "na" ? "border-warning/30" : "border-border"
                        )}>
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            <div className={cn("flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0",
                              answer === "sim" ? "bg-success text-success-foreground" :
                              answer === "nao" ? "bg-destructive text-destructive-foreground" :
                              answer === "na" ? "bg-warning text-warning-foreground" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {answer ? <Check className="w-4 h-4" /> : String(i + 1).padStart(2, "0")}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm sm:text-body font-medium text-foreground leading-relaxed">{p.pergunta}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-caption text-muted-foreground">Peso: {p.peso}</span>
                                {answer ? (
                                  <>
                                    <span className="text-caption text-muted-foreground">•</span>
                                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold",
                                      answer === "sim" ? "bg-success/10 text-success" :
                                      answer === "nao" ? "bg-destructive/10 text-destructive" :
                                      "bg-warning/10 text-warning"
                                    )}>
                                      Avaliada: {answer === "sim" ? "SIM" : answer === "nao" ? "NÃO" : "N/A"}
                                      {(answer === "sim" || answer === "na") ? ` (+${p.peso} pts)` : answer === "nao" ? " (0 pts)" : ""}
                                    </span>
                                    {responseAuthors[p.id] && (
                                      <span className="text-caption text-muted-foreground">
                                        por <strong className="text-foreground">{responseAuthors[p.id].avaliador_nome}</strong>
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="text-caption text-muted-foreground">•</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">Pendente</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="ml-0 sm:ml-11">
                            <SegmentedControl value={answer} onChange={v => handleAnswerChange(p.id, v)} disabled={isLocked} />
                          </div>
                          <AnimatePresence>
                            {answer === "nao" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="ml-0 sm:ml-11 mt-3 bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-3">
                                  <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Descreva a irregularidade encontrada
                                  </div>
                                  <Textarea placeholder="Descreva o problema encontrado..." value={observation} onChange={e => handleObservationChange(p.id, e.target.value)} disabled={isLocked} className="bg-card min-h-[80px] text-sm" />
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                                      <Camera className="w-3.5 h-3.5" /> Evidência fotográfica (opcional)
                                    </div>
                                    {evidenciaUrl ? (
                                      <div className="relative inline-block">
                                        <img src={evidenciaUrl} alt="Evidência" className="rounded-lg border border-border max-h-40 object-cover cursor-pointer" onClick={() => window.open(evidenciaUrl, "_blank")} />
                                        {!isLocked && (
                                          <button onClick={() => handleRemoveEvidence(p.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex gap-2">
                                        <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm", isUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                          {isUploading ? <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> Enviando...</> : <><ImageIcon className="w-4 h-4 text-destructive" /> Galeria</>}
                                          <input type="file" accept="image/*" className="hidden" disabled={isLocked || isUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleEvidenceUpload(p.id, file); e.target.value = ""; }} />
                                        </label>
                                        <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm", isUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                          {!isUploading && <><Camera className="w-4 h-4 text-destructive" /> Câmera</>}
                                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={isLocked || isUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleEvidenceUpload(p.id, file); e.target.value = ""; }} />
                                        </label>
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                                      <FileAudio className="w-3.5 h-3.5" /> Anexo de áudio (opcional)
                                    </div>
                                    {audioUrl ? (
                                      <div className="bg-card border border-border rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                          <Volume2 className="w-4 h-4 text-destructive shrink-0" />
                                          <span className="text-sm text-foreground font-medium">Áudio anexado</span>
                                        </div>
                                        <audio controls className="w-full h-10" preload="metadata">
                                          <source src={audioUrl} />
                                          Seu navegador não suporta reprodução de áudio.
                                        </audio>
                                        <div className="flex items-center gap-2 mt-2">
                                          <a href={audioUrl} download target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                                            <Download className="w-3.5 h-3.5" /> Baixar áudio
                                          </a>
                                          {!isLocked && (
                                            <button onClick={() => handleRemoveAudio(p.id)} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline ml-auto">
                                              <X className="w-3 h-3" /> Remover
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm w-fit", isAudioUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                        {isAudioUploading ? <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> Enviando...</> : <><Mic className="w-4 h-4 text-destructive" /> Selecionar áudio</>}
                                        <input type="file" accept="audio/*" className="hidden" disabled={isLocked || isAudioUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleAudioUpload(p.id, file); e.target.value = ""; }} />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <AnimatePresence>
                            {answer === "sim" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="ml-0 sm:ml-11 mt-3 bg-success/5 border border-success/20 rounded-lg p-3 space-y-3">
                                  <div className="flex items-center gap-1.5 text-caption text-success font-medium">
                                    <MessageSquare className="w-3.5 h-3.5" /> Descrição (opcional)
                                  </div>
                                  <Textarea placeholder="Adicione uma descrição se necessário..." value={observation} onChange={e => handleObservationChange(p.id, e.target.value)} disabled={isLocked} className="bg-card min-h-[60px] text-sm" />
                                  
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-success font-medium">
                                      <Camera className="w-3.5 h-3.5" /> Anexo de foto (opcional)
                                    </div>
                                    {evidenciaUrl ? (
                                      <div className="relative inline-block">
                                        <img src={evidenciaUrl} alt="Evidência" className="rounded-lg border border-border max-h-40 object-cover cursor-pointer" onClick={() => window.open(evidenciaUrl, "_blank")} />
                                        {!isLocked && (
                                          <button onClick={() => handleRemoveEvidence(p.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:bg-destructive/90 transition-colors">
                                            <X className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="flex gap-2">
                                        <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm", isUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-success/30 hover:border-success/50 hover:bg-success/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                          {isUploading ? <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> Enviando...</> : <><ImageIcon className="w-4 h-4 text-success" /> Galeria</>}
                                          <input type="file" accept="image/*" className="hidden" disabled={isLocked || isUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleEvidenceUpload(p.id, file); e.target.value = ""; }} />
                                        </label>
                                        <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm", isUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-success/30 hover:border-success/50 hover:bg-success/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                          {!isUploading && <><Camera className="w-4 h-4 text-success" /> Câmera</>}
                                          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={isLocked || isUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleEvidenceUpload(p.id, file); e.target.value = ""; }} />
                                        </label>
                                      </div>
                                    )}
                                  </div>

                                  <div className="space-y-2">
                                    <div className="flex items-center gap-1.5 text-caption text-success font-medium">
                                      <FileAudio className="w-3.5 h-3.5" /> Anexo de áudio (opcional)
                                    </div>
                                    {audioUrl ? (
                                      <div className="space-y-2">
                                        <div className="bg-card border border-border rounded-lg p-3">
                                          <div className="flex items-center gap-2 mb-2">
                                            <Volume2 className="w-4 h-4 text-success shrink-0" />
                                            <span className="text-sm text-foreground font-medium">Áudio anexado</span>
                                          </div>
                                          <audio controls className="w-full h-10" preload="metadata">
                                            <source src={audioUrl} />
                                            Seu navegador não suporta reprodução de áudio.
                                          </audio>
                                          <div className="flex items-center gap-2 mt-2">
                                            <a href={audioUrl} download target="_blank" rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                                              <Download className="w-3.5 h-3.5" /> Baixar áudio
                                            </a>
                                            {!isLocked && (
                                              <button onClick={() => handleRemoveAudio(p.id)} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline ml-auto">
                                                <X className="w-3 h-3" /> Remover
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <label className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors text-sm w-fit", isAudioUploading ? "border-muted-foreground/30 bg-muted/30 cursor-wait" : "border-success/30 hover:border-success/50 hover:bg-success/5", isLocked && "opacity-50 cursor-not-allowed")}>
                                        {isAudioUploading ? <><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> Enviando...</> : <><Mic className="w-4 h-4 text-success" /> Selecionar áudio</>}
                                        <input type="file" accept="audio/*" className="hidden" disabled={isLocked || isAudioUploading} onChange={e => { const file = e.target.files?.[0]; if (file) handleAudioUpload(p.id, file); e.target.value = ""; }} />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <AnimatePresence>
                            {answer === "na" && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                                <div className="ml-0 sm:ml-11 mt-3 bg-warning/5 border border-warning/20 rounded-lg p-3 space-y-3">
                                  <div className="flex items-center gap-1.5 text-caption text-warning font-medium">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Descreva o motivo do N/A (obrigatório)
                                  </div>
                                  <Textarea placeholder="Informe o motivo pelo qual este item não se aplica..." value={observation} onChange={e => handleObservationChange(p.id, e.target.value)} disabled={isLocked} className="bg-card min-h-[80px] text-sm" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section: Other Sector Questions */}
            {pendingPerguntas.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  Perguntas de Outros Setores ({pendingPerguntas.filter(p => evalAnswers[p.id] != null).length}/{pendingPerguntas.length})
                </h3>
                <div className="space-y-3">
                  {pendingPerguntas.map((p, i) => {
                    const answer = evalAnswers[p.id] || null;
                    const other = otherEvalAnswers[p.id];
                    return (
                      <div key={p.id} className={cn("bg-card border rounded-lg",
                        answer === "sim" ? "border-success/30" : answer === "nao" ? "border-destructive/30" : answer === "na" ? "border-warning/30" : "border-warning/20"
                      )}>
                        <div className="p-4">
                          <div className="flex items-start gap-3 mb-2">
                            <div className={cn("flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0",
                              answer === "sim" ? "bg-success text-success-foreground" :
                              answer === "nao" ? "bg-destructive text-destructive-foreground" :
                              answer === "na" ? "bg-warning text-warning-foreground" :
                              "bg-warning/10 text-warning"
                            )}>
                              {answer ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm sm:text-body font-medium text-foreground leading-relaxed">{p.pergunta}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-caption text-muted-foreground">Peso: {p.peso} • Setor: <strong>{(p as any)._setor_nome || "—"}</strong></span>
                                {answer ? (
                                  <>
                                    <span className="text-caption text-muted-foreground">•</span>
                                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold",
                                      answer === "sim" ? "bg-success/10 text-success" :
                                      answer === "nao" ? "bg-destructive/10 text-destructive" :
                                      "bg-warning/10 text-warning"
                                    )}>
                                      Avaliada: {answer === "sim" ? "SIM" : answer === "nao" ? "NÃO" : "N/A"}
                                      {(answer === "sim" || answer === "na") ? ` (+${p.peso} pts)` : answer === "nao" ? " (0 pts)" : ""}
                                    </span>
                                    {(other || responseAuthors[p.id]) && (
                                      <span className="text-caption text-muted-foreground">
                                        por <strong className="text-foreground">{other?.avaliador_nome || responseAuthors[p.id]?.avaliador_nome}</strong>
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <span className="text-caption text-muted-foreground">•</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-warning/10 text-warning">Pendente</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="ml-0 sm:ml-11 mt-1">
                            {answer ? (
                              <div className="space-y-2">
                                {other?.observacao && (
                                  <div className="bg-muted/50 border border-border rounded p-2">
                                    <p className="text-caption text-muted-foreground flex items-center gap-1 mb-0.5"><MessageSquare className="w-3 h-3" /> Observação:</p>
                                    <p className="text-sm text-foreground">{other.observacao}</p>
                                  </div>
                                )}
                                {other?.evidencia_url && (
                                  <img src={other.evidencia_url} alt="Evidência" className="rounded-lg border border-border max-h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(other.evidencia_url!, "_blank")} />
                                )}
                                {other?.audio_url && (
                                  <div className="bg-muted/50 border border-border rounded-lg p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Volume2 className="w-4 h-4 text-primary shrink-0" />
                                      <span className="text-sm text-foreground font-medium">Áudio</span>
                                    </div>
                                    <audio controls className="w-full h-10" preload="metadata">
                                      <source src={other.audio_url} />
                                    </audio>
                                    <a href={other.audio_url} download target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                                      <Download className="w-3.5 h-3.5" /> Baixar áudio
                                    </a>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-warning/5 border border-warning/20">
                                <Clock className="w-4 h-4 text-warning shrink-0" />
                                <span className="text-sm text-muted-foreground">
                                  Aguardando avaliação do setor <strong className="text-foreground">{(p as any)._setor_nome || "responsável"}</strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Pendências Summary */}
            {(() => {
              const pendentes = evalPerguntas.filter(p => evalAnswers[p.id] == null);
              if (pendentes.length === 0) return null;
              return (
                <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-warning mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Pendências ({pendentes.length})
                  </h3>
                  <ul className="space-y-1">
                    {pendentes.map(p => (
                      <li key={p.id} className="text-caption text-muted-foreground">
                        • {p.pergunta} <span className="text-warning">({(p as any)._setor_nome || "—"})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}

        {/* Sticky bottom bar - always visible for admin delete or when not finalized */}
        {evalPerguntas.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-2 sm:px-3 py-2 z-30 safe-area-pb">
            <div className="max-w-4xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs min-w-0">
                <Progress value={globalProgressPercent} className="h-1.5 w-12 sm:w-28 shrink-0" />
                <span className="font-medium text-foreground font-tabular shrink-0">{globalAnsweredCount}/{evalPerguntas.length}</span>
                {evalMaxScore > 0 && (
                  <span className={cn("font-bold font-tabular hidden sm:inline",
                    (evalTotalScore / evalMaxScore) * 100 >= 85 ? "text-success" :
                    (evalTotalScore / evalMaxScore) * 100 >= 75 ? "text-warning" : "text-destructive"
                  )}>
                    {evalTotalScore}/{evalMaxScore} pts
                  </span>
                )}
                {!isLocked && autoSaving && (
                  <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                    <Loader2 className="w-3 h-3 animate-spin" /> <span className="hidden sm:inline">Salvando</span>
                  </span>
                )}
                {!isLocked && !autoSaving && globalAnsweredCount > 0 && (
                  <span className="text-success flex items-center gap-1 shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {canEdit && !isEditing && (
                  <Button size="sm" variant="outline" onClick={handleStartEditing} className="press-effect h-7 sm:h-8 text-xs px-2 sm:px-3">
                    <Pencil className="w-3 h-3" /> <span className="hidden sm:inline ml-1">Alterar</span>
                  </Button>
                )}
                {isEditing && (
                  <Button size="sm" onClick={handleSaveEditing} disabled={evalSubmitting} className="press-effect h-7 sm:h-8 text-xs px-2 sm:px-3">
                    {evalSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    <span className="hidden sm:inline ml-1">Salvar</span>
                  </Button>
                )}
                {!isLocked && !isEditing && !evalFinalized && (
                  <Button size="sm" onClick={handleFinalizeEvaluation} disabled={evalSubmitting} className="press-effect h-7 sm:h-8 text-xs px-2 sm:px-3">
                    {evalSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    <span className="ml-1">Concluir</span>
                  </Button>
                )}
                {evalFinalized && !isEditing && (
                  <Button size="sm" variant="outline" onClick={generatePDF} className="press-effect h-7 sm:h-8 text-xs px-2 sm:px-3">
                    <Download className="w-3 h-3" /> <span className="hidden sm:inline ml-1">PDF</span>
                  </Button>
                )}
                {!isLocked && evalSubmitting && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </span>
                )}
                <Button variant="outline" size="sm" onClick={backToList} className="press-effect h-7 sm:h-8 text-xs px-2 sm:px-3">
                  {isLocked ? "Fechar" : "Sair"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete OS Password Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteDialogOpen(open); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Lock className="w-5 h-5" /> Confirmar Exclusão
              </DialogTitle>
              <DialogDescription>
                Você está prestes a excluir a <strong>OS #{deleteOsNumero}</strong> e todos os dados vinculados (avaliações, respostas e evidências). Esta ação é irreversível.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Digite sua senha para confirmar</Label>
                <Input
                  type="password"
                  placeholder="Sua senha de acesso"
                  value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirmDeleteOS()}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleConfirmDeleteOS} disabled={deleteLoading || !deletePassword.trim()}>
                {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Excluir OS
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- OS Detail View ---
  if (view === "os_detail" && selectedOS) {
    const detailAtendenteNome = allProfiles.find(p => p.id === selectedOS.atendente_id)?.nome;
    const detailTecnicoNome = allProfiles.find(p => p.id === selectedOS.tecnico_id)?.nome;
    const detailTipoServicoNome = tiposServico.find(t => t.id === selectedOS.tipo_servico_id)?.nome;

    // Calculate scores per sector
    const calcScore = (questions: any[]) => {
      let scored = 0, max = 0, answered = 0;
      questions.forEach(q => {
        const ans = q._answer;
        if (ans?.resposta) {
          answered++;
          max += q.peso;
          if (ans.resposta === "sim" || ans.resposta === "na") scored += q.peso;
        }
      });
      const pct = max > 0 ? (scored / max) * 100 : 0;
      return { scored, max, answered, total: questions.length, pct };
    };
    const atendScore = calcScore(osDetailBySetor.atendimento);
    const tecScore = calcScore(osDetailBySetor.tecnico);

    const renderQuestionList = (questions: any[]) => (
      <div className="divide-y divide-border">
        {questions.length === 0 ? (
          <p className="px-4 py-4 text-caption text-muted-foreground text-center">Nenhuma pergunta neste setor.</p>
        ) : questions.map((q: any, idx: number) => {
          const ans = q._answer;
          return (
            <div key={q.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="text-caption font-medium text-muted-foreground font-tabular w-6 shrink-0 pt-0.5">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{q.pergunta}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {ans?.resposta ? (
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
                        ans.resposta === "sim" ? "border-success/40 bg-success/10 text-success" :
                        ans.resposta === "nao" ? "border-destructive/40 bg-destructive/10 text-destructive" :
                        "border-warning/40 bg-warning/10 text-warning"
                      )}>
                        AVALIADA • {ans.resposta === "sim" ? "SIM" : ans.resposta === "nao" ? "NÃO" : "N/A"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border border-warning/40 bg-warning/10 text-warning">
                        PENDENTE
                      </span>
                    )}
                    <span className="text-caption text-muted-foreground">Nota: {q.peso}</span>
                  </div>
                  {ans?.observacao && (
                    <div className="mt-2 bg-muted/50 border border-border rounded p-2">
                      <p className="text-caption text-muted-foreground flex items-center gap-1 mb-0.5">
                        <MessageSquare className="w-3 h-3" /> Observação:
                      </p>
                      <p className="text-sm text-foreground">{ans.observacao}</p>
                    </div>
                  )}
                  {ans?.evidencia_url && (
                    <div className="mt-2">
                      <img src={ans.evidencia_url} alt="Evidência"
                        className="rounded-lg border border-border max-h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => window.open(ans.evidencia_url, "_blank")} />
                    </div>
                  )}
                  {ans?.audio_url && (
                    <div className="mt-2 bg-muted/50 border border-border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Volume2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm text-foreground font-medium">Áudio anexado</span>
                      </div>
                      <audio controls className="w-full h-10" preload="metadata">
                        <source src={ans.audio_url} />
                        Seu navegador não suporta reprodução de áudio.
                      </audio>
                      <a href={ans.audio_url} download target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-2">
                        <Download className="w-3.5 h-3.5" /> Baixar áudio
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

    const renderScoreBadge = (score: { pct: number; scored: number; max: number; answered: number; total: number }) => (
      <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
        <span className="text-caption text-muted-foreground">
          {score.answered}/{score.total} respondidas • {score.scored}/{score.max} pts
        </span>
        {score.max > 0 && (
          <span className={cn("text-body font-bold font-tabular",
            score.pct >= 85 ? "text-success" : score.pct >= 75 ? "text-warning" : "text-destructive"
          )}>
            {score.pct.toFixed(1)}%
          </span>
        )}
      </div>
    );

    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <Button variant="ghost" size="sm" className="mb-3 press-effect" onClick={backToList}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>

        {/* OS Header */}
        <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-subhead font-semibold text-foreground font-tabular">OS #{selectedOS.numero_os}</h2>
              <p className="text-caption text-muted-foreground mt-1">
                Cadastrada em: {format(new Date(selectedOS.created_at), "dd/MM/yyyy HH:mm")}
              </p>
              <p className="text-body text-muted-foreground mt-1">{selectedOS.cliente_nome || "Sem cliente"}</p>
              {selectedOS.cliente_cpf && <p className="text-caption text-muted-foreground">CPF: {selectedOS.cliente_cpf}</p>}
              {selectedOS.cliente_id && clienteAddressMap[selectedOS.cliente_id] && (
                <p className="text-caption text-muted-foreground">📍 {clienteAddressMap[selectedOS.cliente_id]}</p>
              )}
              <p className="text-caption text-muted-foreground mt-0.5">Data da Ocorrência: {format(new Date(selectedOS.data_abertura || selectedOS.created_at), "dd/MM/yyyy HH:mm")}</p>
            </div>
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusLabel[selectedOS.status]?.badge)}>
              {statusLabel[selectedOS.status]?.text}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-border text-sm">
            <div>
              <span className="text-muted-foreground">Tipo de Serviço:</span>
              <p className="font-medium text-foreground">{detailTipoServicoNome || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Data da Ocorrência:</span>
              {(selectedOS.status !== "concluida" || isAdmin) ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full mt-1 h-8 justify-start text-left font-normal text-xs">
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {format(new Date(selectedOS.data_abertura || selectedOS.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={new Date(selectedOS.data_abertura || selectedOS.created_at)}
                      onSelect={async (d) => {
                        if (!d) return;
                        await supabase.from("ordens_servico").update({ data_abertura: d.toISOString() } as any).eq("id", selectedOS.id);
                        setSelectedOS({ ...selectedOS, data_abertura: d.toISOString() });
                        toast.success("Data da ocorrência atualizada!");
                      }}
                      initialFocus
                      className="p-3 pointer-events-auto"
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="font-medium text-foreground">{format(new Date(selectedOS.data_abertura || selectedOS.created_at), "dd/MM/yyyy")}</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Atendente:</span>
              {(isAdmin || (!selectedOS.atendente_id && (hasAtendimentoAccess || isAdmin))) ? (
                <Select value={selectedOS.atendente_id || atendenteId || ""} onValueChange={async (val) => {
                  const oldVal = selectedOS.atendente_id;
                  setAtendenteId(val);
                  await supabase.from("ordens_servico").update({ atendente_id: val } as any).eq("id", selectedOS.id);
                  setSelectedOS({ ...selectedOS, atendente_id: val });
                  if (isAdmin && oldVal && oldVal !== val && profile) {
                    await (supabase as any).from("os_reaberturas").insert({
                      ordem_servico_id: selectedOS.id,
                      reaberta_por: profile.id,
                      motivo: "edicao_admin",
                      campos_alterados: ["atendente_id"],
                    });
                  }
                  toast.success("Atendente salvo!");
                }}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {atendimentoProfiles.filter(p => p.id !== profile?.id).map(p =>
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : selectedOS.atendente_id ? (
                <p className="font-medium text-foreground">{detailAtendenteNome || "—"}</p>
              ) : (
                <p className="font-medium text-warning italic">Pendente</p>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Técnico:</span>
              {(isAdmin || (!selectedOS.tecnico_id && (hasTecnicoAccess || isAdmin))) ? (
                <Select value={selectedOS.tecnico_id || tecnicoId || ""} onValueChange={async (val) => {
                  const oldVal = selectedOS.tecnico_id;
                  setTecnicoId(val);
                  await supabase.from("ordens_servico").update({ tecnico_id: val } as any).eq("id", selectedOS.id);
                  setSelectedOS({ ...selectedOS, tecnico_id: val });
                  if (isAdmin && oldVal && oldVal !== val && profile) {
                    await (supabase as any).from("os_reaberturas").insert({
                      ordem_servico_id: selectedOS.id,
                      reaberta_por: profile.id,
                      motivo: "edicao_admin",
                      campos_alterados: ["tecnico_id"],
                    });
                  }
                  toast.success("Técnico salvo!");
                }}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {tecnicoProfiles.filter(p => p.id !== profile?.id).map(p =>
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : selectedOS.tecnico_id ? (
                <p className="font-medium text-foreground">{detailTecnicoNome || "—"}</p>
              ) : (
                <p className="font-medium text-warning italic">Pendente</p>
              )}
            </div>
          </div>

          {/* Avaliadores com hora de conclusão */}
          {osAvaliacoes.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
              <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Avaliadores</span>
              {osAvaliacoes.map((aval: any, idx: number) => (
                <div key={aval.id} className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium text-foreground">Avaliador {idx + 1}: {aval._avaliador_nome}</span>
                  {aval.concluida_em ? (
                    <span className="text-caption text-success">• Concluído em {format(new Date(aval.concluida_em), "dd/MM/yyyy HH:mm")}</span>
                  ) : (
                    <span className="text-caption text-warning">• Pendente</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Histórico de edições */}
          {osReaberturas.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-border">
              <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Histórico de Edições</span>
              {osReaberturas.map((r: any) => (
                <div key={r.id} className="flex items-center gap-2 text-sm flex-wrap">
                  <Pencil className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground">Editada por <span className="font-medium">{r._nome}</span></span>
                  <span className="text-caption text-muted-foreground">em {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}</span>
                  {r.campos_alterados?.length > 0 && (
                    <span className="text-caption text-muted-foreground">
                      ({r.campos_alterados.map((c: string) => 
                        c === "atendente_id" ? "Atendente" : c === "tecnico_id" ? "Técnico" : c === "data_abertura" ? "Data" : c
                      ).join(", ")})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg shadow-card mb-4">
          <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-body font-semibold text-foreground">Atendimento</h3>
            <span className="text-caption text-muted-foreground ml-1">— {detailAtendenteNome || "Não definido"}</span>
            {(() => {
              const avalAtend = osAvaliacoes.find((a: any) => a.avaliador_id === selectedOS.atendente_id);
              if (avalAtend?.concluida_em) {
                return <span className="text-caption text-muted-foreground ml-2">• Concluído em {format(new Date(avalAtend.concluida_em), "dd/MM/yyyy HH:mm")}</span>;
              }
              return null;
            })()}
            {atendScore.max > 0 && (
              <span className={cn("ml-auto text-body font-bold font-tabular",
                atendScore.pct >= 85 ? "text-success" : atendScore.pct >= 75 ? "text-warning" : "text-destructive"
              )}>
                {atendScore.pct.toFixed(1)}%
              </span>
            )}
          </div>
          {renderQuestionList(osDetailBySetor.atendimento)}
          {renderScoreBadge(atendScore)}
        </div>

        {/* Técnico Section */}
        <div className="bg-card border border-border rounded-lg shadow-card mb-4">
          <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-primary" />
            <h3 className="text-body font-semibold text-foreground">Técnico</h3>
            <span className="text-caption text-muted-foreground ml-1">— {detailTecnicoNome || "Não definido"}</span>
            {(() => {
              const avalTec = osAvaliacoes.find((a: any) => a.avaliador_id === selectedOS.tecnico_id);
              if (avalTec?.concluida_em) {
                return <span className="text-caption text-muted-foreground ml-2">• Concluído em {format(new Date(avalTec.concluida_em), "dd/MM/yyyy HH:mm")}</span>;
              }
              return null;
            })()}
            {tecScore.max > 0 && (
              <span className={cn("ml-auto text-body font-bold font-tabular",
                tecScore.pct >= 85 ? "text-success" : tecScore.pct >= 75 ? "text-warning" : "text-destructive"
              )}>
                {tecScore.pct.toFixed(1)}%
              </span>
            )}
          </div>
          {renderQuestionList(osDetailBySetor.tecnico)}
          {renderScoreBadge(tecScore)}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          {(() => {
            // Admins can always access evaluation
            if (selectedOS.status === "concluida" && !isAdmin) return null;
            const myAval = osAvaliacoes.find((a: any) => a.avaliador_id === profile?.id);
            if (myAval?.concluida && !isAdmin) return null;
            return (
              <>
                <Button onClick={() => startMyEvaluation(selectedOS)} className="press-effect w-full sm:w-auto">
                  <Eye className="w-4 h-4 mr-2" /> {isAdmin && selectedOS.status === "concluida" ? "Editar Avaliação" : "Iniciar / Continuar Avaliação"}
                </Button>
                {(hasTecnicoAccess && !selectedOS.tecnico_id) && (
                  <p className="text-caption text-warning flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Selecione o técnico avaliado acima antes de concluir.</p>
                )}
                {(hasAtendimentoAccess && !selectedOS.atendente_id) && (
                  <p className="text-caption text-warning flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Selecione o atendente avaliado acima antes de concluir.</p>
                )}
              </>
            );
          })()}
        </div>

        {/* Delete OS Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteDialogOpen(open); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Lock className="w-5 h-5" /> Confirmar Exclusão
              </DialogTitle>
              <DialogDescription>
                Você está prestes a excluir a <strong>OS #{deleteOsNumero}</strong> e todos os dados vinculados. Esta ação é irreversível.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label>Digite sua senha para confirmar</Label>
                <Input type="password" placeholder="Sua senha de acesso" value={deletePassword}
                  onChange={e => setDeletePassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleConfirmDeleteOS()} autoFocus />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>Cancelar</Button>
              <Button variant="destructive" onClick={handleConfirmDeleteOS} disabled={deleteLoading || !deletePassword.trim()}>
                {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Excluir OS
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- Combined search handler: CPF or OS number (at least one required) ---
  const handleCombinedSearch = async () => {
    const cpfDigits = formClienteCpf.replace(/\D/g, "");
    const osNum = formOsNumero.trim();
    const cpfFormatted = cpfDigits.length === 11 ? formatCpf(cpfDigits) : formClienteCpf.trim();

    const hasCpf = cpfDigits.length > 0;
    const hasOs = osNum.length > 0;

    if (!hasCpf && !hasOs) { toast.error("Informe o número da OS ou o CPF do cliente."); return; }
    if (hasCpf && cpfDigits.length !== 11) { toast.error("CPF incompleto. Preencha todos os 11 dígitos ou deixe em branco."); return; }
    if (hasCpf && !isValidCpf(cpfDigits)) { toast.error("CPF inválido."); return; }

    setCpfValidating(true);
    setFormValidating(true);
    setFormValidated(false);
    setFormFoundOS(null);
    setSearchResults([]);
    setFormPendingAval(null);
    setShowNewOsDialog(false);

    try {
      // 1) Validate/find client (normalized CPF)
      let cliente: any = null;
      if (hasCpf) {
        const { data: clientes } = await supabase
          .from("clientes")
          .select("id, nome, cpf")
          .or(`cpf.eq.${cpfFormatted},cpf.eq.${cpfDigits}`);

        cliente = clientes?.[0] || null;

        if (cliente) {
          setFormFoundCliente(cliente);
          setFormClienteNome(cliente.nome);
          setClienteId(cliente.id);
          setShowNewClienteForm(false);
          setCpfValidated(true);
        } else {
          setFormFoundCliente(null);
          setShowNewClienteForm(false);
          setClienteId(null);
          setCpfValidated(true);
        }
      } else {
        setFormFoundCliente(null);
        setShowNewClienteForm(false);
        setClienteId(null);
        setCpfValidated(false);
      }

      // 2) Search OS by number if provided
      if (hasOs) {
        const { data: existingOS } = await supabase
          .from("ordens_servico")
          .select("*")
          .eq("numero_os", osNum)
          .limit(1)
          .maybeSingle();

        if (existingOS) {
          if (cliente && (!existingOS.cliente_nome || !existingOS.cliente_cpf || !existingOS.cliente_id)) {
            await supabase.from("ordens_servico").update({
              cliente_nome: cliente.nome,
              cliente_cpf: cliente.cpf,
              cliente_id: cliente.id,
            } as any).eq("id", existingOS.id);
            existingOS.cliente_nome = cliente.nome;
            existingOS.cliente_cpf = cliente.cpf;
            existingOS.cliente_id = cliente.id;
          }

          setSearchResults([existingOS]);
          if (existingOS.cliente_id) fetchClienteAddresses([existingOS.cliente_id]);
          toast.success("OS encontrada!");
          setFormValidated(true);
          return;
        }

        if (!hasCpf) {
          toast.info("OS não encontrada. Preencha os dados para criar.");
          setFormValidated(true);
          return;
        }
      }

      // 3) CPF-only search: prioritize existing open OS and OS without number
      if (hasCpf) {
        let allOsForCpf: any[] = [];

        if (cliente?.id) {
          const { data: osByClienteId } = await supabase
            .from("ordens_servico")
            .select("*")
            .eq("cliente_id", cliente.id)
            .in("status", ["aberta", "em_andamento", "aguardando_numero"] as any[])
            .order("created_at", { ascending: false });

          if (osByClienteId?.length) allOsForCpf.push(...osByClienteId);
        }

        const { data: osByCpf } = await supabase
          .from("ordens_servico")
          .select("*")
          .or(`cliente_cpf.eq.${cpfFormatted},cliente_cpf.eq.${cpfDigits}`)
          .in("status", ["aberta", "em_andamento", "aguardando_numero"] as any[])
          .order("created_at", { ascending: false });

        if (osByCpf?.length) {
          const existingIds = new Set(allOsForCpf.map((o) => o.id));
          osByCpf.forEach((o) => {
            if (!existingIds.has(o.id)) allOsForCpf.push(o);
          });
        }

        if (allOsForCpf.length > 0) {
          const prioritizedOs = [...allOsForCpf].sort((a, b) => {
            const aNeedsNumber = a.status === "aguardando_numero" || !a.numero_os;
            const bNeedsNumber = b.status === "aguardando_numero" || !b.numero_os;
            if (aNeedsNumber !== bNeedsNumber) return aNeedsNumber ? -1 : 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });

          // Update client info on OS that don't have it
          for (const os of prioritizedOs) {
            if (cliente && !os.cliente_id) {
              await supabase.from("ordens_servico").update({
                cliente_id: cliente.id,
                cliente_nome: cliente.nome,
                cliente_cpf: cliente.cpf,
              } as any).eq("id", os.id);
              os.cliente_id = cliente.id;
              os.cliente_nome = cliente.nome;
              os.cliente_cpf = cliente.cpf;
            }
          }

          setSearchResults(prioritizedOs);
          const osClienteIds = prioritizedOs.map((o: any) => o.cliente_id).filter(Boolean);
          if (osClienteIds.length) fetchClienteAddresses(osClienteIds);
          setFormValidated(true);
          toast.success(`${prioritizedOs.length} OS encontrada(s) para o cliente.`);
          return;
        }

        if (!cliente) {
          setShowNewClienteForm(true);
          toast.info("Cliente não encontrado. Preencha o nome para cadastrar.");
        } else {
          setFormValidated(true);
          setShowNewOsDialog(true);
          toast.info("Nenhuma OS aberta encontrada. Selecione o tipo de serviço para continuar.");
          return;
        }
      }

      setFormValidated(true);
    } catch (err: any) {
      toast.error("Erro na busca: " + err.message);
    } finally {
      setCpfValidating(false);
      setFormValidating(false);
    }
  };

  // --- List View (Default) - Simplified Flow ---
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-section font-semibold text-foreground">Avaliação de OS</h1>
        <p className="text-sm sm:text-body text-muted-foreground">Informe o número da OS ou o CPF do cliente para buscar.</p>
      </div>

      {/* Step 1: CPF + OS Number combined */}
      <div className="bg-card border border-border rounded-lg shadow-card mb-6">
        <div className="p-4 border-b border-border">
          <h2 className="text-body font-semibold text-foreground flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            Identificação do Cliente e OS
          </h2>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>CPF do Cliente</Label>
                <Input
                  value={formClienteCpf}
                  onChange={e => {
                    setFormClienteCpf(formatCpf(e.target.value));
                    if (cpfValidated || formValidated || !!formFoundOS || searchResults.length > 0 || showNewOsDialog) {
                      setCpfValidated(false);
                      setFormFoundCliente(null);
                      setShowNewClienteForm(false);
                      setClienteId(null);
                      setFormOsNumero("");
                      setFormValidated(false);
                      setFormFoundOS(null);
                      setSearchResults([]);
                      setFormPendingAval(null);
                      setShowNewOsDialog(false);
                      setTipoServicoId("");
                      setAtendenteId("");
                      setTecnicoId("");
                    }
                  }}
                placeholder="000.000.000-00"
                maxLength={14}
                disabled={!!formFoundOS}
              />
              {formClienteCpf.replace(/\D/g, "").length === 11 && !isValidCpf(formClienteCpf) && (
                <p className="text-caption text-destructive">CPF inválido</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Número da OS</Label>
              <Input
                value={formOsNumero}
                onChange={e => { setFormOsNumero(e.target.value.replace(/\D/g, "")); if (formValidated) { setFormValidated(false); setFormFoundOS(null); setSearchResults([]); } }}
                placeholder="Ex: 12345"
                disabled={!!formFoundOS}
                onKeyDown={e => e.key === "Enter" && handleCombinedSearch()}
              />
            </div>
          </div>

          {/* Client found indicator */}
          {clienteId && formFoundCliente && (
            <div className="px-3 py-2 bg-success/5 border border-success/20 rounded-md text-body text-foreground flex items-center gap-2">
              <Check className="w-4 h-4 text-success shrink-0" />
              <span className="font-medium">Cliente: {formClienteNome}</span>
            </div>
          )}

          {/* New client form */}
          {showNewClienteForm && !clienteId && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border border-warning/30 bg-warning/5 rounded-lg p-4 space-y-3">
              <p className="text-sm text-warning font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Cliente não encontrado. Cadastre abaixo:
              </p>
              <div className="space-y-1.5">
                <Label>Nome do Cliente *</Label>
                <Input
                  value={formClienteNome}
                  onChange={e => setFormClienteNome(e.target.value)}
                  placeholder="Nome completo do cliente"
                />
              </div>
              <Button onClick={async () => {
                await handleCreateCliente();
                // After creating, re-run combined search
                setTimeout(() => handleCombinedSearch(), 300);
              }} disabled={!formClienteNome.trim()} size="sm" className="press-effect">
                Cadastrar e Buscar OS
              </Button>
            </motion.div>
          )}

          <div className="flex items-center gap-3">
            {!formFoundOS && searchResults.length === 0 && (
              <Button
                onClick={handleCombinedSearch}
                disabled={(!formOsNumero.trim() && !formClienteCpf.replace(/\D/g, "")) || cpfValidating || formValidating}
                className="press-effect"
              >
                {(cpfValidating || formValidating) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                Buscar
              </Button>
            )}
            {(formValidated || formFoundOS) && (
              <Button variant="ghost" size="sm" onClick={resetForm}>Limpar</Button>
            )}
          </div>
        </div>
      </div>

      {/* Results: OS list — always right below the search */}
      {formValidated && searchResults.length > 0 && !formFoundOS && (
        <div className="bg-card border border-border rounded-lg shadow-card mb-6">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <h2 className="text-body font-semibold text-foreground">Resultados da Busca</h2>
            <Badge variant="secondary" className="ml-auto text-xs">{searchResults.length} OS</Badge>
          </div>
          <div className="divide-y divide-border">
            {searchResults.map((os: any) => {
              const tipoNome = tiposServico.find(t => t.id === os.tipo_servico_id)?.nome;
              const atendenteNome = allProfiles.find(p => p.id === os.atendente_id)?.nome;
              const tecnicoNome = allProfiles.find(p => p.id === os.tecnico_id)?.nome;
              return (
                <div key={os.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-body font-semibold text-foreground font-tabular">
                          {os.numero_os ? `OS #${os.numero_os}` : "Sem número"}
                        </p>
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusLabel[os.status]?.badge)}>
                          {statusLabel[os.status]?.text}
                        </span>
                        {tipoNome && <Badge variant="outline" className="text-xs">{tipoNome}</Badge>}
                      </div>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {os.cliente_nome || "Sem cliente"}
                        {os.cliente_cpf ? ` • CPF: ${os.cliente_cpf}` : ""}
                        {` • Ocorrência: ${format(new Date(os.data_abertura || os.created_at), "dd/MM/yyyy")}`}
                      </p>
                      {os.cliente_id && clienteAddressMap[os.cliente_id] && (
                        <p className="text-caption text-muted-foreground">📍 {clienteAddressMap[os.cliente_id]}</p>
                      )}
                      <p className="text-caption text-muted-foreground">
                        {atendenteNome ? `Atendente: ${atendenteNome}` : ""}
                        {atendenteNome && tecnicoNome ? " • " : ""}
                        {tecnicoNome ? `Técnico: ${tecnicoNome}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedOS(os); setView("os_detail"); }} className="press-effect h-8 text-xs px-3">
                        <Eye className="w-3.5 h-3.5 mr-1" /> Detalhes
                      </Button>
                      {os.status !== "concluida" && os.numero_os && (
                        <Button size="sm" onClick={() => startMyEvaluation(os)} className="press-effect h-8 text-xs px-3">
                          Avaliar <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      )}
                      {!os.numero_os && (
                        <Button size="sm" onClick={() => { setFillNumeroOsId(os.id); setFormFoundOS(os); setShowNewOsDialog(true); }} className="press-effect h-8 text-xs px-3 bg-warning text-warning-foreground hover:bg-warning/90">
                          Preencher Número
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Option to create new OS */}
          {clienteId && (
            <div className="p-3 border-t border-border bg-muted/20">
              <Button size="sm" variant="outline" onClick={() => { setShowNewOsDialog(true); }} className="press-effect text-xs">
                + Criar Nova OS para este cliente
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Single OS selected (from formFoundOS) */}
      {formValidated && formFoundOS && (
        <AnimatePresence>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="bg-success/5 border border-success/20 rounded-lg p-4 space-y-4 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Check className="w-4 h-4 text-success" />
                <span className="text-sm font-medium text-success">OS selecionada</span>
                <Button variant="ghost" size="sm" className="ml-auto text-xs h-7" onClick={() => { setFormFoundOS(null); }}>
                  ← Voltar aos resultados
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Nº OS:</span>
                  <p className="font-medium text-foreground">{formFoundOS.numero_os}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cliente:</span>
                  <p className="font-medium text-foreground">{formFoundCliente?.nome || formFoundOS.cliente_nome || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">CPF:</span>
                  <p className="font-medium text-foreground">{formFoundCliente?.cpf || formFoundOS.cliente_cpf || formClienteCpf || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusLabel[formFoundOS.status]?.badge)}>
                    {statusLabel[formFoundOS.status]?.text}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo de Serviço:</span>
                  <p className="font-medium text-foreground">{tiposServico.find(t => t.id === formFoundOS.tipo_servico_id)?.nome || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Atendente:</span>
                  {formFoundOS.atendente_id ? (
                    <p className="font-medium text-foreground">{allProfiles.find(p => p.id === formFoundOS.atendente_id)?.nome || "—"}</p>
                  ) : (hasAtendimentoAccess || isAdmin) ? (
                    <Select value={atendenteId} onValueChange={async (val) => {
                      setAtendenteId(val);
                      await supabase.from("ordens_servico").update({ atendente_id: val } as any).eq("id", formFoundOS.id);
                      setFormFoundOS({ ...formFoundOS, atendente_id: val });
                    }}>
                      <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {atendimentoProfiles.filter(p => p.id !== profile?.id).map(p =>
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium text-muted-foreground italic">Pendente</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Técnico:</span>
                  {formFoundOS.tecnico_id ? (
                    <p className="font-medium text-foreground">{allProfiles.find(p => p.id === formFoundOS.tecnico_id)?.nome || "—"}</p>
                  ) : (hasTecnicoAccess || isAdmin) ? (
                    <Select value={tecnicoId} onValueChange={async (val) => {
                      setTecnicoId(val);
                      await supabase.from("ordens_servico").update({ tecnico_id: val } as any).eq("id", formFoundOS.id);
                      setFormFoundOS({ ...formFoundOS, tecnico_id: val });
                    }}>
                      <SelectTrigger className="h-8 mt-1"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                      <SelectContent>
                        {tecnicoProfiles.filter(p => p.id !== profile?.id).map(p =>
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium text-muted-foreground italic">Pendente</p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-success/20 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setSelectedOS(formFoundOS); setView("os_detail"); }} className="press-effect">
                  <Eye className="w-4 h-4 mr-1" /> Ver Detalhes
                </Button>
                {formFoundOS.status !== "concluida" && (
                  <Button size="sm" onClick={() => startMyEvaluation(formFoundOS)} className="press-effect">
                    Iniciar / Continuar Avaliação <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
      {aguardandoNumeroOS.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-card mb-6">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" />
            <h2 className="text-body font-semibold text-foreground">OS Aguardando Número</h2>
            <Badge variant="secondary" className="ml-auto text-xs">{aguardandoNumeroOS.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {aguardandoNumeroOS.map((os: any) => (
              <div key={os.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium text-foreground">{os.cliente_nome || "Sem cliente"}</p>
                  <p className="text-caption text-muted-foreground">CPF: {os.cliente_cpf || "—"} • Ocorrência: {format(new Date(os.data_abertura || os.created_at), "dd/MM/yyyy HH:mm")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {os.cliente_id && (
                    <Button size="sm" variant="outline" onClick={() => handleViewCliente(os.cliente_id)} className="press-effect h-8 text-xs px-3">
                      <Eye className="w-3.5 h-3.5 mr-1" /> Ver Cliente
                    </Button>
                  )}
                  {fillNumeroOsId === os.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={fillNumeroValue}
                        onChange={e => setFillNumeroValue(e.target.value.replace(/\D/g, ""))}
                        placeholder="Nº da OS"
                        className="h-8 w-28 text-sm"
                        onKeyDown={e => e.key === "Enter" && handleFillNumeroOS()}
                        autoFocus
                      />
                      <Button size="sm" onClick={handleFillNumeroOS} disabled={!fillNumeroValue.trim() || fillNumeroLoading} className="press-effect h-8 text-xs px-3">
                        {fillNumeroLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setFillNumeroOsId(null); setFillNumeroValue(""); }} className="h-8 text-xs px-2">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setFillNumeroOsId(os.id)} className="press-effect h-8 text-xs px-3 bg-warning text-warning-foreground hover:bg-warning/90">
                      Preencher Número
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Minhas Avaliações Pendentes */}
      <MinhasAvaliacoesPendentes />

      {/* View Cliente Dialog */}
      <Dialog open={viewClienteOpen} onOpenChange={setViewClienteOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Dados do Cliente
            </DialogTitle>
          </DialogHeader>
          {viewClienteData && (
            <div className="space-y-4 text-sm">
              {/* Client data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Nome:</span><p className="font-medium break-words">{viewClienteData.nome}</p></div>
                <div><span className="text-muted-foreground">CPF:</span><p className="font-medium">{viewClienteData.cpf || "—"}</p></div>
                <div><span className="text-muted-foreground">RG:</span><p className="font-medium">{viewClienteData.rg || "—"}</p></div>
                <div><span className="text-muted-foreground">Nome da Mãe:</span><p className="font-medium break-words">{viewClienteData.nome_mae || "—"}</p></div>
                <div><span className="text-muted-foreground">Endereço:</span><p className="font-medium break-words">{viewClienteData.endereco || "—"}</p></div>
                <div><span className="text-muted-foreground">Número:</span><p className="font-medium">{viewClienteData.numero || "—"}</p></div>
                <div><span className="text-muted-foreground">CEP:</span><p className="font-medium">{viewClienteData.cep || "—"}</p></div>
                <div><span className="text-muted-foreground">Cidade:</span><p className="font-medium">{viewClienteData.cidade || "—"}</p></div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">Referência:</span><p className="font-medium break-words">{viewClienteData.referencia || "—"}</p></div>
              </div>
              {viewClienteData.contatos?.length > 0 && (
                <div className="border-t border-border pt-3">
                  <span className="text-muted-foreground font-medium">Contatos do Cliente:</span>
                  <div className="mt-1 space-y-1">
                    {viewClienteData.contatos.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{c.valor}</span>
                        {c.tem_whatsapp && <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lead Info Section */}
              {viewClienteData.lead && (
                <>
                  <div className="border-t border-border pt-3">
                    <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-primary" /> Histórico como Lead
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><span className="text-muted-foreground">Nome do Lead:</span><p className="font-medium">{viewClienteData.lead.nome}</p></div>
                      <div><span className="text-muted-foreground">Origem:</span><p className="font-medium">{viewClienteData.lead.origem_lead || "—"}</p></div>
                      <div><span className="text-muted-foreground">Plano:</span><p className="font-medium">{viewClienteData.planoNome}</p></div>
                      <div><span className="text-muted-foreground">Repetidor:</span><p className="font-medium">{viewClienteData.lead.repetidor || "Nenhum"}</p></div>
                      <div><span className="text-muted-foreground">Criado em:</span><p className="font-medium">{format(new Date(viewClienteData.lead.created_at), "dd/MM/yyyy HH:mm")}</p></div>
                      <div>
                        <span className="text-muted-foreground">Convertido por:</span>
                        <p className="font-medium text-primary">{viewClienteData.conversorNome}</p>
                      </div>
                    </div>
                  </div>

                  {/* Lead contacts */}
                  {viewClienteData.leadContatos?.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <span className="text-muted-foreground font-medium">Contatos do Lead:</span>
                      <div className="mt-1 space-y-1">
                        {viewClienteData.leadContatos.map((c: any) => (
                          <div key={c.id} className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{c.valor}</span>
                            {c.tem_whatsapp && <Badge variant="secondary" className="text-[10px]">WhatsApp</Badge>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lead Interactions */}
                  {viewClienteData.leadInteracoes?.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <span className="text-muted-foreground font-medium">Interações ({viewClienteData.leadInteracoes.length}):</span>
                      <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                        {viewClienteData.leadInteracoes.map((i: any) => (
                          <div key={i.id} className="bg-muted/50 rounded p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{i._colaborador_nome}</span>
                              <span className="text-muted-foreground">{format(new Date(i.data_interacao), "dd/MM/yyyy HH:mm")}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px]">{i.tipo_contato}</Badge>
                              {i.resultado && <span className="text-muted-foreground">{i.resultado}</span>}
                              {i.numero_utilizado && <span className="text-muted-foreground">• {i.numero_utilizado}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lead History */}
                  {viewClienteData.leadHistory?.length > 0 && (
                    <div className="border-t border-border pt-3">
                      <span className="text-muted-foreground font-medium">Histórico de Eventos ({viewClienteData.leadHistory.length}):</span>
                      <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                        {viewClienteData.leadHistory.map((h: any) => (
                          <div key={h.id} className="bg-muted/50 rounded p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">{h.tipo_evento}</Badge>
                              <span className="text-muted-foreground">{format(new Date(h.data_evento), "dd/MM/yyyy HH:mm")}</span>
                            </div>
                            {h.descricao && <p className="mt-0.5 text-muted-foreground">{h.descricao}</p>}
                            <p className="mt-0.5 text-muted-foreground italic">por {h._usuario_nome}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!viewClienteData.lead && (
                <div className="border-t border-border pt-3 text-muted-foreground text-center py-3">
                  Este cliente não possui histórico como lead.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Dialog unificado: Nova OS ou Preencher Número */}
      <Dialog open={showNewOsDialog} onOpenChange={(open) => { setShowNewOsDialog(open); if (!open) { setTipoServicoId(""); setAtendenteId(""); setTecnicoId(""); setFormDataAbertura(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{fillNumeroOsId ? "Preencher Número da OS" : "Nova OS"}</DialogTitle>
            <DialogDescription>
              {fillNumeroOsId
                ? "Esta OS está aguardando o número definitivo. Preencha abaixo para dar continuidade à avaliação."
                : "Nenhuma OS aberta foi encontrada para este CPF. Selecione o tipo de serviço para dar continuidade."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Modo: Preencher número de OS existente */}
            {fillNumeroOsId && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Número da OS *</Label>
                  <Input
                    value={fillNumeroValue}
                    onChange={e => setFillNumeroValue(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ex: 12345"
                    onKeyDown={e => e.key === "Enter" && handleFillNumeroOS()}
                    autoFocus
                  />
                </div>

                {/* Show tipo_servico selector if OS doesn't have one */}
                {formFoundOS && !formFoundOS.tipo_servico_id && (
                  <div className="space-y-2">
                    <Label className="text-body font-medium">Tipo de Serviço *</Label>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {tiposServico.map((t) => (
                        <button key={t.id} type="button" onClick={() => setTipoServicoId(t.id)}
                          className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all press-effect text-sm",
                            tipoServicoId === t.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-muted/50")}>
                          <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                            tipoServicoId === t.id ? "border-primary bg-primary" : "border-muted-foreground/30")}>
                            {tipoServicoId === t.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                          </div>
                          <span className="font-medium truncate">{t.nome}</span>
                          <span className="text-caption text-muted-foreground ml-auto">{(t as any).setores?.nome || ""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Modo: Nova OS — selecionar tipo de serviço */}
            {!fillNumeroOsId && (
              <div className="space-y-2">
                {/* Número da OS */}
                <div className="space-y-1.5">
                  <Label className="text-body font-medium">Número da OS *</Label>
                  <Input
                    value={formOsNumero}
                    onChange={e => setFormOsNumero(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ex: 12345"
                    autoFocus
                  />
                </div>

                {/* Data da Ocorrência */}
                <div className="space-y-1.5">
                  <Label className="text-body font-medium">Data da Ocorrência *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !formDataAbertura && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formDataAbertura ? format(formDataAbertura, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={formDataAbertura} onSelect={(d) => d && setFormDataAbertura(d)} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
                    </PopoverContent>
                  </Popover>
                </div>

                <Label className="text-body font-medium">Tipo de Serviço *</Label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {tiposServico.length === 0 ? (
                    <p className="text-body text-muted-foreground text-center py-4">Nenhum tipo de serviço disponível.</p>
                  ) : tiposServico.map((t) => (
                    <button key={t.id} type="button" onClick={() => setTipoServicoId(t.id)}
                      className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-all press-effect text-sm",
                        tipoServicoId === t.id ? "bg-primary/10 border-primary text-primary" : "bg-card border-border hover:bg-muted/50")}>
                      <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                        tipoServicoId === t.id ? "border-primary bg-primary" : "border-muted-foreground/30")}>
                        {tipoServicoId === t.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </div>
                      <span className="font-medium truncate">{t.nome}</span>
                      <span className="text-caption text-muted-foreground ml-auto">{(t as any).setores?.nome || ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seleção de colaboradores (ambos os modos) */}
            {tipoServicoId && (
              <div className="space-y-3">
                {(hasAtendimentoAccess || isAdmin) && (
                  <div className="space-y-1.5">
                    <Label>Atendente Avaliado *</Label>
                    {atendimentoProfiles.filter(p => p.id !== profile?.id).length === 0 ? (
                      <p className="text-caption text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                        Nenhum colaborador com cargo "Avaliado" encontrado no setor Atendimento.
                      </p>
                    ) : (
                      <Select value={atendenteId} onValueChange={setAtendenteId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o atendente" /></SelectTrigger>
                        <SelectContent>
                          {atendimentoProfiles.filter(p => p.id !== profile?.id).map(p =>
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                {(hasTecnicoAccess || isAdmin) && (
                  <div className="space-y-1.5">
                    <Label>Técnico Avaliado *</Label>
                    {tecnicoProfiles.filter(p => p.id !== profile?.id).length === 0 ? (
                      <p className="text-caption text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                        Nenhum colaborador com cargo "Avaliado" encontrado no setor Técnico.
                      </p>
                    ) : (
                      <Select value={tecnicoId} onValueChange={setTecnicoId}>
                        <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                        <SelectContent>
                          {tecnicoProfiles.filter(p => p.id !== profile?.id).map(p =>
                            <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowNewOsDialog(false); setFillNumeroOsId(null); setFillNumeroValue(""); }} className="w-full sm:w-auto">
                Fechar
              </Button>
              {fillNumeroOsId ? (
                <Button
                  onClick={async () => {
                    await handleFillNumeroOS();
                    if (fillNumeroValue.trim() && formFoundOS) {
                      setShowNewOsDialog(false);
                      // Update formFoundOS with the number and start evaluation
                      const updatedOS = { ...formFoundOS, numero_os: fillNumeroValue.trim(), status: "aberta" };
                      if (tipoServicoId && !formFoundOS.tipo_servico_id) {
                        await supabase.from("ordens_servico").update({ tipo_servico_id: tipoServicoId } as any).eq("id", formFoundOS.id);
                        updatedOS.tipo_servico_id = tipoServicoId;
                      }
                      if (atendenteId) {
                        await supabase.from("ordens_servico").update({ atendente_id: atendenteId } as any).eq("id", formFoundOS.id);
                        updatedOS.atendente_id = atendenteId;
                      }
                      if (tecnicoId) {
                        await supabase.from("ordens_servico").update({ tecnico_id: tecnicoId } as any).eq("id", formFoundOS.id);
                        updatedOS.tecnico_id = tecnicoId;
                      }
                      setFormFoundOS(updatedOS);
                      setFormOsNumero(fillNumeroValue.trim());
                      await startMyEvaluation(updatedOS);
                    }
                  }}
                  disabled={!fillNumeroValue.trim() || fillNumeroLoading}
                  className="w-full sm:w-auto press-effect"
                >
                  {fillNumeroLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Ir para Avaliação <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleCreateAndStart} disabled={!canCreateEval} className="w-full sm:w-auto press-effect">
                  Dar continuidade <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending Evaluations */}
      {pendingAvaliacoes.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-card mb-6">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" />
            <h2 className="text-body font-semibold text-foreground">Avaliações Pendentes</h2>
            <Badge variant="secondary" className="ml-auto text-xs">{pendingAvaliacoes.length}</Badge>
          </div>

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
                key={a.id} type="button" onClick={() => openPendingEvaluation(a)}
                className="w-full flex flex-col sm:grid sm:grid-cols-[1fr_120px_100px_80px_32px] sm:items-center gap-1 sm:gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors press-effect"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium text-primary font-tabular">OS #{a.ordens_servico?.numero_os}</span>
                    <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{a._ts_nome}</Badge>
                  </div>
                  <p className="text-caption text-muted-foreground truncate">{a.ordens_servico?.cliente_nome || "Sem cliente"}</p>
                </div>
                <span className="text-caption text-muted-foreground truncate hidden sm:block">{a._ts_nome}</span>
                <div className="flex items-center gap-2">
                  <Progress value={a._progress} className="h-2 flex-1 sm:w-16" />
                  <span className="text-caption font-medium text-foreground font-tabular w-8 text-right">{a._progress}%</span>
                </div>
                <Badge variant={a._progress > 0 ? "default" : "secondary"} className="text-[10px] w-fit">
                  {a._progress >= 100 ? "Aguardando Conclusão" : a._progress > 0 ? "Parcial" : "Aberta"}
                </Badge>
                <ChevronRight className="w-4 h-4 text-muted-foreground hidden sm:block" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete OS Password Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => { if (!deleteLoading) setDeleteDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Lock className="w-5 h-5" /> Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Você está prestes a excluir a <strong>OS #{deleteOsNumero}</strong> e todos os dados vinculados (avaliações, respostas e evidências). Esta ação é irreversível.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Digite sua senha para confirmar</Label>
              <Input
                type="password"
                placeholder="Sua senha de acesso"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleConfirmDeleteOS()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeleteOS} disabled={deleteLoading || !deletePassword.trim()}>
              {deleteLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
