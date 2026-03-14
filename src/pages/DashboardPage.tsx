import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardCheck, Clock, CheckCircle2, Trophy, Users, BarChart3,
  CalendarIcon, Filter, AlertCircle, Hourglass, ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

// --- Types ---
interface OSRow {
  id: string;
  numero_os: string;
  status: string;
  created_at: string;
  cliente_nome: string | null;
  cliente_id: string | null;
  tipo_servico_id: string | null;
}

interface OSWithProgress extends OSRow {
  tipo_servico_nome: string | null;
  total_perguntas: number;
  total_respondidas: number;
  progress: number;
}

interface ClienteRanking {
  cliente_id: string;
  cliente_nome: string;
  os_count: number;
}

interface TecnicoMedia {
  profile_id: string;
  nome: string;
  media: number;
  total_avaliacoes: number;
  setor_nome: string;
}

interface SetorMedia {
  setor_id: string;
  setor_nome: string;
  media: number;
  total_avaliacoes: number;
}

interface PendingOS {
  os_id: string;
  numero_os: string;
  cliente_nome: string | null;
  tipo_servico_nome: string | null;
  colaborador_avaliado_nome: string | null;
  pending_count: number;
  progress: number;
  setor_pendente_nome: string | null;
}

interface SectorPending {
  setor_id: string;
  setor_nome: string;
  pending_count: number;
}

// --- Helpers ---
function getCompetenceMonths(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }
  return months;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-success/10";
  if (score >= 60) return "bg-warning/10";
  return "bg-destructive/10";
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const statusBadge: Record<string, string> = {
  aberta: "border-warning/40 bg-warning/10 text-warning",
  em_andamento: "border-primary/40 bg-primary/10 text-primary",
  concluida: "border-success/40 bg-success/10 text-success",
};

const statusText: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

// --- Main ---
export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();

  const now = new Date();
  const [competenceMonth, setCompetenceMonth] = useState(format(now, "yyyy-MM"));
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));

  const handleCompetenceChange = (val: string) => {
    setCompetenceMonth(val);
    const [y, m] = val.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    setStartDate(startOfMonth(d));
    setEndDate(endOfMonth(d));
  };

  // Data state
  const [allOS, setAllOS] = useState<OSWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [ranking, setRanking] = useState<ClienteRanking[]>([]);
  const [tecnicoMedias, setTecnicoMedias] = useState<TecnicoMedia[]>([]);
  const [setorMedias, setSetorMedias] = useState<SetorMedia[]>([]);

  // Pending sections
  const [pendingMySector, setPendingMySector] = useState<PendingOS[]>([]);
  const [pendingOtherSector, setPendingOtherSector] = useState<PendingOS[]>([]);
  const [completedOS, setCompletedOS] = useState<PendingOS[]>([]);

  // Admin: pending count per sector
  const [sectorPendingSummary, setSectorPendingSummary] = useState<SectorPending[]>([]);

  // Fetch OS with progress
  useEffect(() => {
    const fetch = async () => {
      setLoading(true);

      const from = startDate ? startDate.toISOString() : startOfMonth(now).toISOString();
      const to = endDate ? endOfMonth(endDate).toISOString() : endOfMonth(now).toISOString();

      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, created_at, cliente_nome, cliente_id, tipo_servico_id")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false });

      if (!osData || osData.length === 0) {
        setAllOS([]);
        setLoading(false);
        return;
      }

      const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];
      let tipoNames: Record<string, string> = {};
      if (tipoIds.length > 0) {
        const { data: tipos } = await supabase.from("tipos_servico").select("id, nome").in("id", tipoIds);
        tipos?.forEach((t) => { tipoNames[t.id] = t.nome; });
      }

      const osIds = osData.map((o) => o.id);
      const { data: avaliacoes } = await supabase
        .from("avaliacoes")
        .select("id, ordem_servico_id, concluida")
        .in("ordem_servico_id", osIds);

      const avalIds = avaliacoes?.map((a) => a.id) || [];

      const { data: allPerguntas } = await supabase
        .from("perguntas_avaliacao")
        .select("id, tipo_servico_id")
        .eq("ativo", true);

      // FIX: Fetch responses by ordem_servico_id (shared across all evaluators)
      const answeredByOS: Record<string, Set<string>> = {};
      if (osIds.length > 0) {
        const { data: allResp } = await supabase
          .from("respostas_avaliacao")
          .select("ordem_servico_id, pergunta_id")
          .in("ordem_servico_id", osIds)
          .not("resposta", "is", null);
        
        allResp?.forEach((r: any) => {
          if (r.ordem_servico_id) {
            if (!answeredByOS[r.ordem_servico_id]) answeredByOS[r.ordem_servico_id] = new Set();
            answeredByOS[r.ordem_servico_id].add(r.pergunta_id);
          }
        });
      }

      const result: OSWithProgress[] = osData.map((os) => {
        const osAvals = avaliacoes?.filter((a) => a.ordem_servico_id === os.id) || [];
        const perguntasForOS = allPerguntas?.filter(
          (p) => !p.tipo_servico_id || p.tipo_servico_id === os.tipo_servico_id
        ) || [];
        const totalPerguntas = perguntasForOS.length;
        const osAnswered = answeredByOS[os.id] || new Set();
        const totalRespondidas = perguntasForOS.filter(p => osAnswered.has(p.id)).length;
        const progress = totalPerguntas > 0 ? Math.round((totalRespondidas / totalPerguntas) * 100) : 0;

        let computedStatus: string;
        if (totalRespondidas === 0) {
          computedStatus = "aberta";
        } else if (progress >= 100 && osAvals.length > 0 && osAvals.every((a) => a.concluida)) {
          computedStatus = "concluida";
        } else {
          computedStatus = "em_andamento";
        }

        return {
          ...os,
          status: computedStatus,
          tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
          total_perguntas: totalPerguntas,
          total_respondidas: totalRespondidas,
          progress,
        };
      });

      setAllOS(result);
      setLoading(false);
    };

    fetch();
  }, [startDate, endDate]);

  // Fetch pending OS by sector for current evaluator
  useEffect(() => {
    if (!profile) return;
    const fetchPending = async () => {
      const { data: sectorLinks } = await supabase
        .from("colaborador_setores").select("setor_id").eq("profile_id", profile.id);
      let mySetorIds = sectorLinks?.map(l => l.setor_id) || [];
      if (mySetorIds.length === 0 && profile.setor_id) mySetorIds = [profile.setor_id];
      if (mySetorIds.length === 0 && !isAdmin) { setPendingMySector([]); setPendingOtherSector([]); setCompletedOS([]); return; }

      const { data: openOS } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, cliente_nome, tipo_servico_id, status, colaborador_avaliado_id, atendente_id, tecnico_id")
        .order("created_at", { ascending: false });
      if (!openOS?.length) { setPendingMySector([]); setPendingOtherSector([]); setCompletedOS([]); return; }

      const osIds = openOS.map(o => o.id);
      const tipoIds = [...new Set(openOS.map(o => o.tipo_servico_id).filter(Boolean))] as string[];

      // Collect all profile IDs we need to resolve names for
      const profileIdsToResolve = new Set<string>();
      openOS.forEach(o => {
        if (o.colaborador_avaliado_id) profileIdsToResolve.add(o.colaborador_avaliado_id);
        if (o.atendente_id) profileIdsToResolve.add(o.atendente_id);
        if (o.tecnico_id) profileIdsToResolve.add(o.tecnico_id);
      });

      const [tiposRes, perguntasRes, avalsRes, setoresRes, profilesRes] = await Promise.all([
        tipoIds.length > 0 ? supabase.from("tipos_servico").select("id, nome").in("id", tipoIds) : { data: [] },
        supabase.from("perguntas_avaliacao").select("id, tipo_servico_id, setor_avaliado_id").eq("ativo", true),
        supabase.from("avaliacoes").select("id, ordem_servico_id, avaliador_id, concluida").in("ordem_servico_id", osIds),
        supabase.from("setores").select("id, nome").eq("ativo", true),
        profileIdsToResolve.size > 0 ? supabase.from("profiles").select("id, nome").in("id", [...profileIdsToResolve]) : { data: [] },
      ]);

      const tipoNames: Record<string, string> = {};
      (tiposRes.data as any[])?.forEach((t: any) => { tipoNames[t.id] = t.nome; });
      const setoresMap: Record<string, string> = {};
      (setoresRes.data as any[])?.forEach((s: any) => { setoresMap[s.id] = s.nome; });
      const profileNames: Record<string, string> = {};
      (profilesRes.data as any[])?.forEach((p: any) => { profileNames[p.id] = p.nome; });

      const allPerguntas = perguntasRes.data || [];
      const allAvals = avalsRes.data || [];

      // FIX: Fetch responses by ordem_servico_id (shared across all evaluators)
      let allRespostas: any[] = [];
      if (osIds.length > 0) {
        const { data: resp } = await supabase
          .from("respostas_avaliacao").select("ordem_servico_id, pergunta_id, resposta")
          .in("ordem_servico_id", osIds).not("resposta", "is", null);
        allRespostas = resp || [];
      }
      // Key: os_id:pergunta_id — one response per OS+question regardless of evaluator
      const answeredSet = new Set(allRespostas.map((r: any) => `${r.ordem_servico_id}:${r.pergunta_id}`));

      const myPending: PendingOS[] = [];
      const otherPending: PendingOS[] = [];
      const completed: PendingOS[] = [];

      for (const os of openOS) {
        const perguntasForOS = allPerguntas.filter(p => !p.tipo_servico_id || p.tipo_servico_id === os.tipo_servico_id);
        if (perguntasForOS.length === 0) continue;

        const myQuestions = isAdmin ? perguntasForOS : perguntasForOS.filter(p => !p.setor_avaliado_id || mySetorIds.includes(p.setor_avaliado_id));
        const otherQuestions = isAdmin ? [] : perguntasForOS.filter(p => p.setor_avaliado_id && !mySetorIds.includes(p.setor_avaliado_id));
        const myAval = allAvals.find(a => a.ordem_servico_id === os.id && a.avaliador_id === profile.id);
        const osAvals = allAvals.filter(a => a.ordem_servico_id === os.id);

        const myUnanswered = myQuestions.filter(q => !myAval || !answeredSet.has(`${myAval.id}:${q.id}`));

        // Count unique questions answered by ANY evaluator for this OS
        const uniqueAnswered = perguntasForOS.filter(q =>
          osAvals.some(a => answeredSet.has(`${a.id}:${q.id}`))
        ).length;
        const progress = perguntasForOS.length > 0 ? Math.round((uniqueAnswered / perguntasForOS.length) * 100) : 0;

        // Resolve colaborador avaliado name
        const colabId = os.colaborador_avaliado_id || os.atendente_id || os.tecnico_id;
        const colabNome = colabId ? profileNames[colabId] || null : null;

        // Find which setores still have unanswered questions
        const pendingSetorIds = new Set<string>();
        for (const q of perguntasForOS) {
          if (!q.setor_avaliado_id) continue;
          const answered = osAvals.some(a => answeredSet.has(`${a.id}:${q.id}`));
          if (!answered) pendingSetorIds.add(q.setor_avaliado_id);
        }
        const pendingSetorNames = [...pendingSetorIds].map(id => setoresMap[id] || "Sem setor");

        if (progress >= 100 && osAvals.every(a => a.concluida)) {
          completed.push({
            os_id: os.id, numero_os: os.numero_os, cliente_nome: os.cliente_nome,
            tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
            colaborador_avaliado_nome: colabNome, pending_count: 0, progress: 100,
            setor_pendente_nome: null,
          });
        } else if (myUnanswered.length > 0) {
          myPending.push({
            os_id: os.id, numero_os: os.numero_os, cliente_nome: os.cliente_nome,
            tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
            colaborador_avaliado_nome: colabNome, pending_count: myUnanswered.length, progress,
            setor_pendente_nome: null,
          });
        } else if (otherQuestions.length > 0) {
          const otherUnanswered = otherQuestions.some(q =>
            !osAvals.some(a => a.avaliador_id !== profile.id && answeredSet.has(`${a.id}:${q.id}`))
          );
          if (otherUnanswered) {
            // Find which other setor(s) are pending
            const otherPendingSetores = [...pendingSetorIds]
              .filter(id => !mySetorIds.includes(id))
              .map(id => setoresMap[id] || "Sem setor");

            otherPending.push({
              os_id: os.id, numero_os: os.numero_os, cliente_nome: os.cliente_nome,
              tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
              colaborador_avaliado_nome: colabNome, pending_count: 0, progress,
              setor_pendente_nome: otherPendingSetores.join(", ") || "Outro setor",
            });
          }
        }
      }

      // Admin: calculate pending by sector
      if (isAdmin) {
        const sectorOSCount: Record<string, Set<string>> = {};
        for (const os of openOS.filter(o => o.status !== "concluida")) {
          const perguntasForOS = allPerguntas.filter(p => !p.tipo_servico_id || p.tipo_servico_id === os.tipo_servico_id);
          const osAvals = allAvals.filter(a => a.ordem_servico_id === os.id);

          for (const q of perguntasForOS) {
            if (!q.setor_avaliado_id) continue;
            const answered = osAvals.some(a => answeredSet.has(`${a.id}:${q.id}`));
            if (!answered) {
              if (!sectorOSCount[q.setor_avaliado_id]) sectorOSCount[q.setor_avaliado_id] = new Set();
              sectorOSCount[q.setor_avaliado_id].add(os.id);
            }
          }
        }

        const summary: SectorPending[] = Object.entries(sectorOSCount)
          .map(([setorId, osSet]) => ({
            setor_id: setorId,
            setor_nome: setoresMap[setorId] || "Sem setor",
            pending_count: osSet.size,
          }))
          .sort((a, b) => b.pending_count - a.pending_count);
        setSectorPendingSummary(summary);
      }

      setPendingMySector(myPending);
      setPendingOtherSector(otherPending);
      setCompletedOS(completed.slice(0, 20)); // limit to last 20
    };
    fetchPending();
  }, [profile, isAdmin, startDate, endDate]);

  // Fetch ranking + scores
  useEffect(() => {
    const fetchRanking = async () => {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const { data } = await supabase
        .from("ordens_servico")
        .select("cliente_id, cliente_nome")
        .gte("created_at", sixtyDaysAgo.toISOString())
        .not("cliente_id", "is", null);
      if (!data) return;
      const countMap: Record<string, { nome: string; count: number }> = {};
      data.forEach((os: any) => {
        if (!os.cliente_id) return;
        if (!countMap[os.cliente_id]) countMap[os.cliente_id] = { nome: os.cliente_nome || "Sem nome", count: 0 };
        countMap[os.cliente_id].count++;
      });
      const sorted = Object.entries(countMap)
        .map(([id, v]) => ({ cliente_id: id, cliente_nome: v.nome, os_count: v.count }))
        .filter((c) => c.os_count >= 2)
        .sort((a, b) => b.os_count - a.os_count)
        .slice(0, 10);
      setRanking(sorted);
    };

    const fetchScores = async () => {
      const from = startDate ? startDate.toISOString() : startOfMonth(now).toISOString();
      const to = endDate ? endOfMonth(endDate).toISOString() : endOfMonth(now).toISOString();

      const { data: osInPeriod } = await supabase
        .from("ordens_servico")
        .select("id, tecnico_id, atendente_id, colaborador_avaliado_id, tipo_servico_id")
        .gte("created_at", from)
        .lte("created_at", to);

      if (!osInPeriod?.length) { setTecnicoMedias([]); setSetorMedias([]); return; }

      const osIds = osInPeriod.map(o => o.id);
      const { data: avaliacoes } = await supabase
        .from("avaliacoes")
        .select("nota_final, ordem_servico_id")
        .in("ordem_servico_id", osIds)
        .eq("concluida", true)
        .not("nota_final", "is", null);

      if (!avaliacoes?.length) { setTecnicoMedias([]); setSetorMedias([]); return; }

      const osMap: Record<string, typeof osInPeriod[0]> = {};
      osInPeriod.forEach(o => { osMap[o.id] = o; });

      const tecMap: Record<string, { notas: number[] }> = {};
      avaliacoes.forEach((a: any) => {
        const os = osMap[a.ordem_servico_id];
        if (!os) return;
        const colabId = os.colaborador_avaliado_id || os.tecnico_id || os.atendente_id;
        if (!colabId || a.nota_final == null) return;
        if (!tecMap[colabId]) tecMap[colabId] = { notas: [] };
        tecMap[colabId].notas.push(a.nota_final);
      });

      const colabIds = Object.keys(tecMap);
      if (colabIds.length === 0) { setTecnicoMedias([]); setSetorMedias([]); return; }

      const { data: profiles } = await supabase.from("profiles").select("id, nome, setor_id").in("id", colabIds);
      const { data: setorLinks } = await supabase.from("colaborador_setores").select("profile_id, setor_id").in("profile_id", colabIds);

      const profileSetores: Record<string, string[]> = {};
      setorLinks?.forEach((l) => {
        if (!profileSetores[l.profile_id]) profileSetores[l.profile_id] = [];
        profileSetores[l.profile_id].push(l.setor_id);
      });
      profiles?.forEach((p) => {
        if (!profileSetores[p.id] && p.setor_id) profileSetores[p.id] = [p.setor_id];
      });

      const allSetorIds = new Set<string>();
      profiles?.forEach((p) => { if (p.setor_id) allSetorIds.add(p.setor_id); });
      setorLinks?.forEach((l) => allSetorIds.add(l.setor_id));

      let setorNames: Record<string, string> = {};
      if (allSetorIds.size > 0) {
        const { data: setores } = await supabase.from("setores").select("id, nome").in("id", [...allSetorIds]);
        setores?.forEach((s) => { setorNames[s.id] = s.nome; });
      }

      const tecMedias: TecnicoMedia[] = [];
      profiles?.forEach((p) => {
        const entry = tecMap[p.id];
        if (entry) {
          const avg = entry.notas.reduce((a, b) => a + b, 0) / entry.notas.length;
          const pSetores = profileSetores[p.id] || [];
          const primarySetorName = pSetores.length > 0 ? (setorNames[pSetores[0]] || "Sem setor") : "Sem setor";
          tecMedias.push({ profile_id: p.id, nome: p.nome, media: avg, total_avaliacoes: entry.notas.length, setor_nome: primarySetorName });
        }
      });
      tecMedias.sort((a, b) => b.media - a.media);
      setTecnicoMedias(tecMedias);

      const setorScoreMap: Record<string, { nome: string; notas: number[] }> = {};
      Object.entries(tecMap).forEach(([profileId, entry]) => {
        const setores = profileSetores[profileId] || [];
        setores.forEach((setorId) => {
          if (!setorScoreMap[setorId]) setorScoreMap[setorId] = { nome: setorNames[setorId] || "Sem setor", notas: [] };
          setorScoreMap[setorId].notas.push(...entry.notas);
        });
      });

      const sMedias: SetorMedia[] = Object.entries(setorScoreMap).map(([id, v]) => ({
        setor_id: id, setor_nome: v.nome,
        media: v.notas.reduce((a, b) => a + b, 0) / v.notas.length,
        total_avaliacoes: v.notas.length,
      }));
      sMedias.sort((a, b) => b.media - a.media);
      setSetorMedias(sMedias);
    };

    fetchRanking();
    fetchScores();
  }, [startDate, endDate]);

  // Split OS by status
  const osAbertas = useMemo(() => allOS.filter((o) => o.status === "aberta"), [allOS]);
  const osEmAndamento = useMemo(() => allOS.filter((o) => o.status === "em_andamento"), [allOS]);
  const osConcluidas = useMemo(() => allOS.filter((o) => o.status === "concluida"), [allOS]);

  const [statusFilter, setStatusFilter] = useState<"all" | "aberta" | "em_andamento" | "concluida">("all");

  const filteredOS = useMemo(() => {
    if (statusFilter === "all") return allOS;
    if (statusFilter === "em_andamento") return allOS.filter((o) => o.status === "em_andamento" || o.status === "aberta");
    return allOS.filter((o) => o.status === statusFilter);
  }, [allOS, statusFilter]);

  const handleClickOS = (os: OSWithProgress) => {
    navigate(`/avaliacoes/pesquisa?os=${os.numero_os}&mode=eval`);
  };

  const cards = [
    { label: "Total de OS", value: allOS.length, icon: ClipboardCheck, color: "text-foreground", filter: "all" as const },
    { label: "Em Andamento", value: osEmAndamento.length + osAbertas.length, icon: Clock, color: "text-primary", filter: "em_andamento" as const },
    { label: "Concluídas", value: osConcluidas.length, icon: CheckCircle2, color: "text-success", filter: "concluida" as const },
  ];

  const competenceMonths = useMemo(() => getCompetenceMonths(), []);

  // --- Section toggle state ---
  const [showCompleted, setShowCompleted] = useState(false);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-section font-semibold text-foreground">Dashboard</h1>
        <p className="text-body text-muted-foreground">Visão geral das Ordens de Serviço</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <label className="text-caption font-medium text-muted-foreground">Mês de Competência</label>
            <Select value={competenceMonth} onValueChange={handleCompetenceChange}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {competenceMonths.map((m) => (
                  <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Início</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-caption font-medium text-muted-foreground">Data Fim</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("h-9 w-[160px] justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Selecionar"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus className="p-3 pointer-events-auto" locale={ptBR} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => (
          <motion.div
            key={card.label}
            variants={itemVariants}
            className={cn(
              "bg-card border rounded-lg p-4 shadow-card cursor-pointer transition-all",
              statusFilter === card.filter ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"
            )}
            onClick={() => setStatusFilter(statusFilter === card.filter ? "all" : card.filter)}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-caption text-muted-foreground font-medium uppercase tracking-wider">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <span className="text-section font-semibold text-foreground font-tabular">{card.value}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Admin: Pending by Sector */}
      {isAdmin && sectorPendingSummary.length > 0 && (
        <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning" />
            <h2 className="text-body font-semibold text-foreground">Pendências por Setor</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {sectorPendingSummary.map(s => (
              <div key={s.setor_id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                <span className="text-body font-medium text-foreground">{s.setor_nome}</span>
                <span className={cn(
                  "text-body font-bold font-tabular px-2 py-0.5 rounded",
                  s.pending_count > 3 ? "bg-destructive/10 text-destructive" :
                  s.pending_count > 1 ? "bg-warning/10 text-warning" :
                  "bg-primary/10 text-primary"
                )}>{s.pending_count} OS</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 1: Minhas Avaliações Pendentes */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-warning" />
          <h2 className="text-body font-semibold text-foreground">Minhas Avaliações Pendentes</h2>
          <span className="text-caption text-muted-foreground">({pendingMySector.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador Avaliado</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pendentes</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-36">Progresso</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingMySector.length > 0 ? pendingMySector.map(item => (
                <tr key={item.os_id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3 text-body font-medium text-primary font-tabular">#{item.numero_os}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-foreground">{item.colaborador_avaliado_nome || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="destructive" className="font-tabular">{item.pending_count}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Progress value={item.progress} className="h-2 flex-1" />
                      <span className="text-caption font-medium font-tabular text-muted-foreground w-10 text-right">{item.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}&mode=eval`)}
                      className="press-effect"
                    >
                      Responder <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-success" />
                    Nenhuma avaliação pendente no seu setor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 2: Avaliações Pendentes de Outros Setores */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-body font-semibold text-foreground">Avaliações Aguardando Outros Setores</h2>
          <span className="text-caption text-muted-foreground">({pendingOtherSector.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador Avaliado</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor Pendente</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-36">Progresso</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pendingOtherSector.length > 0 ? pendingOtherSector.map(item => (
                <tr key={item.os_id} className="hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}&mode=eval`)}>
                  <td className="px-4 py-3 text-body font-medium text-foreground font-tabular">#{item.numero_os}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-foreground">{item.colaborador_avaliado_nome || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-warning border-warning/40 bg-warning/10">
                      {item.setor_pendente_nome || "Outro setor"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Progress value={item.progress} className="h-2 flex-1" />
                      <span className="text-caption font-medium font-tabular text-muted-foreground w-10 text-right">{item.progress}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border border-warning/40 bg-warning/10 text-warning">
                      Aguardando
                    </span>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">
                    Nenhuma OS aguardando outro setor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* SECTION 3: Avaliações Concluídas */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <h2 className="text-body font-semibold text-foreground">Avaliações Concluídas</h2>
            <span className="text-caption text-muted-foreground">({completedOS.length})</span>
          </div>
          {completedOS.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowCompleted(!showCompleted)} className="text-xs">
              {showCompleted ? "Ocultar" : "Mostrar"}
            </Button>
          )}
        </div>
        {showCompleted && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador Avaliado</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-36">Progresso</th>
                  <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {completedOS.map(item => (
                  <tr key={item.os_id} className="hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}&mode=eval`)}>
                    <td className="px-4 py-3 text-body font-medium text-foreground font-tabular">#{item.numero_os}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-foreground">{item.colaborador_avaliado_nome || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={100} className="h-2 flex-1" />
                        <span className="text-caption font-medium font-tabular text-success w-10 text-right">100%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border border-success/40 bg-success/10 text-success">
                        Concluída
                      </span>
                    </td>
                  </tr>
                ))}
                {completedOS.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma avaliação concluída.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!showCompleted && completedOS.length > 0 && (
          <div className="px-4 py-3 text-center text-caption text-muted-foreground">
            {completedOS.length} avaliação(ões) concluída(s). Clique em "Mostrar" para ver.
          </div>
        )}
      </motion.div>

      {/* OS Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Clock className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-body font-semibold text-foreground">
              Todas as Ordens de Serviço
              {statusFilter !== "all" && (
                <span className="text-muted-foreground font-normal ml-1">— {statusText[statusFilter]}</span>
              )}
              <span className="text-muted-foreground font-normal ml-1">({filteredOS.length})</span>
            </h2>
            {statusFilter !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setStatusFilter("all")} className="text-xs text-muted-foreground">
                Mostrar todas
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-40">Progresso</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredOS.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => handleClickOS(item)}>
                    <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2 font-tabular">{item.numero_os}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={item.progress} className="h-2 flex-1" />
                        <span className="text-caption font-medium font-tabular text-muted-foreground w-10 text-right">{item.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusBadge[item.status])}>
                        {statusText[item.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredOS.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma OS encontrada no período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Score averages - by sector */}
      {setorMedias.length > 0 && (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {setorMedias.map((s) => (
            <motion.div key={s.setor_id} variants={itemVariants}
              className="bg-card border border-border rounded-lg p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-caption text-muted-foreground font-medium uppercase tracking-wider">Média {s.setor_nome}</span>
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div className={cn("inline-flex px-3 py-1 rounded-lg", getScoreBg(s.media))}>
                <span className={cn("text-section font-bold font-tabular", getScoreColor(s.media))}>{s.media.toFixed(1)}%</span>
              </div>
              <p className="text-caption text-muted-foreground mt-1">{s.total_avaliacoes} avaliação(ões)</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Employee Rankings by Sector */}
      {tecnicoMedias.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {(() => {
            const groups = new Map<string, TecnicoMedia[]>();
            tecnicoMedias.forEach(t => {
              const setor = t.setor_nome || "Sem setor";
              if (!groups.has(setor)) groups.set(setor, []);
              groups.get(setor)!.push(t);
            });

            return Array.from(groups.entries()).map(([setorNome, employees]) => (
              <motion.div key={setorNome} variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <h2 className="text-body font-semibold text-foreground">Ranking — {setorNome}</h2>
                </div>
                <div className="divide-y divide-border">
                  {employees.map((t, i) => (
                    <div key={t.profile_id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/desempenho?id=${t.profile_id}`)}>
                      <span className="text-caption font-medium text-muted-foreground font-tabular w-6">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body font-medium text-primary underline underline-offset-2 truncate">{t.nome}</p>
                        <p className="text-caption text-muted-foreground">{t.total_avaliacoes} avaliação(ões)</p>
                      </div>
                      <div className={cn("px-3 py-1 rounded-lg", getScoreBg(t.media))}>
                        <span className={cn("text-body font-bold font-tabular", getScoreColor(t.media))}>{t.media.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ));
          })()}
        </div>
      )}

      {/* Client ranking */}
      <motion.div variants={itemVariants} initial="hidden" animate="show" className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Trophy className="w-4 h-4 text-warning" />
          <h2 className="text-body font-semibold text-foreground">Clientes com mais OS nos últimos 60 dias</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-12">#</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Qtd. OS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ranking.map((r, i) => (
                <tr key={r.cliente_id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate(`/cadastros/clientes?id=${r.cliente_id}`)}>
                  <td className="px-4 py-3 text-body font-tabular text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2">{r.cliente_nome}</td>
                  <td className="px-4 py-3 text-body font-semibold font-tabular text-right">{r.os_count}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum dado nos últimos 60 dias.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
