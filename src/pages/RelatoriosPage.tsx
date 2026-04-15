import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CalendarIcon, Filter, Trash2, Download, Loader2,
  FileText, Search, Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminPasswordDialog from "@/components/AdminPasswordDialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

// --- Types ---
interface OSRow {
  id: string;
  numero_os: string;
  status: string;
  data_abertura: string;
  cliente_nome: string | null;
  tipo_servico_id: string | null;
  tipo_servico_nome: string | null;
  colaborador_avaliado_id: string | null;
  tecnico_nome: string | null;
  atendente_nome: string | null;
}

// --- Helpers ---

const statusText: Record<string, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

const statusBadge: Record<string, string> = {
  aberta: "border-warning/40 bg-warning/10 text-warning",
  em_andamento: "border-primary/40 bg-primary/10 text-primary",
  concluida: "border-success/40 bg-success/10 text-success",
};

// --- Main ---
export default function RelatoriosPage() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();

  // Filters
  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));

  // Advanced filters
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [filterSetor, setFilterSetor] = useState<string>("todos");
  const [filterAvaliador, setFilterAvaliador] = useState<string>("todos");
  const [filterAvaliado, setFilterAvaliado] = useState<string>("todos");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterNumeroOS, setFilterNumeroOS] = useState("");

  // Filter options (loaded from DB)
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([]);
  const [avaliadores, setAvaliadores] = useState<{ id: string; nome: string }[]>([]);
  const [avaliados, setAvaliados] = useState<{ id: string; nome: string }[]>([]);

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      const [setoresRes, profilesRes] = await Promise.all([
        supabase.from("setores").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("profiles").select("id, nome, cargo").eq("ativo", true).order("nome"),
      ]);
      setSetores(setoresRes.data || []);
      const profiles = profilesRes.data || [];
      setAvaliadores(profiles.filter((p) => p.cargo === "administrador" || p.cargo === "avaliador"));
      setAvaliados(profiles);
    };
    loadFilterOptions();
  }, []);

  const getFilterDates = () => ({
    from: startDate ? startOfDay(startDate).toISOString() : startOfDay(startOfMonth(now)).toISOString(),
    to: endDate ? endOfDay(endDate).toISOString() : endOfDay(endOfMonth(now)).toISOString(),
  });

  // Data
  const [osList, setOsList] = useState<OSRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Export selected dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Export all filtered
  const [exportAllLoading, setExportAllLoading] = useState(false);

  

  // Fetch OS
  // Detect if searching by OS number or client name (direct search mode — ignores other filters)
  const isDirectSearch = filterNumeroOS.trim() !== "" || filterCliente.trim() !== "";

  const fetchOS = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("ordens_servico")
      .select("id, numero_os, status, data_abertura, cliente_nome, tipo_servico_id, colaborador_avaliado_id, atendente_id, tecnico_id, cliente_id");

    if (isDirectSearch) {
      // Direct search: only apply OS number and/or client name filters, ignore everything else
      if (filterNumeroOS.trim()) {
        query = query.ilike("numero_os", `%${filterNumeroOS.trim()}%`);
      }
      if (filterCliente.trim()) {
        query = query.ilike("cliente_nome", `%${filterCliente.trim()}%`);
      }
    } else {
      // Combined filters mode: date range + all other filters
      const { from, to } = getFilterDates();
      query = query.gte("data_abertura", from).lte("data_abertura", to);

      if (filterStatus !== "todos") {
        query = query.eq("status", filterStatus as "aberta" | "em_andamento" | "concluida");
      }
      if (filterAvaliado !== "todos") {
        query = query.or(`colaborador_avaliado_id.eq.${filterAvaliado},atendente_id.eq.${filterAvaliado},tecnico_id.eq.${filterAvaliado}`);
      }
    }

    const { data: osData } = await query.order("data_abertura", { ascending: false });

    if (!osData) {
      setOsList([]);
      setLoading(false);
      return;
    }

    const osIds = osData.map((o) => o.id);

    // Fetch tipo_servico names, os_perguntas, respostas, and avaliacoes in parallel
    const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];

    const [tiposRes, osPerguntasRes, respostasRes, avaliacoesForFilterRes] = await Promise.all([
      tipoIds.length > 0
        ? supabase.from("tipos_servico").select("id, nome, setor_id").in("id", tipoIds)
        : Promise.resolve({ data: [] }),
      supabase.from("os_perguntas").select("os_id, pergunta_id").in("os_id", osIds),
      supabase.from("respostas_avaliacao").select("ordem_servico_id, pergunta_id, resposta").in("ordem_servico_id", osIds).not("resposta", "is", null),
      supabase.from("avaliacoes").select("ordem_servico_id, avaliador_id").in("ordem_servico_id", osIds),
    ]);

    const tipoNames: Record<string, string> = {};
    const tipoSetorMap: Record<string, string | null> = {};
    (tiposRes.data || []).forEach((t: any) => { tipoNames[t.id] = t.nome; tipoSetorMap[t.id] = t.setor_id; });

    // Build os_perguntas count per OS
    const perguntaCountByOS: Record<string, number> = {};
    (osPerguntasRes.data || []).forEach((op: any) => {
      perguntaCountByOS[op.os_id] = (perguntaCountByOS[op.os_id] || 0) + 1;
    });

    // Build answered count per OS (distinct pergunta_id)
    const answeredByOS: Record<string, Set<string>> = {};
    (respostasRes.data || []).forEach((r: any) => {
      if (!r.ordem_servico_id) return;
      if (!answeredByOS[r.ordem_servico_id]) answeredByOS[r.ordem_servico_id] = new Set();
      answeredByOS[r.ordem_servico_id].add(r.pergunta_id);
    });

    // Build avaliador map per OS
    const avaliadorByOS: Record<string, Set<string>> = {};
    (avaliacoesForFilterRes.data || []).forEach((a: any) => {
      if (!avaliadorByOS[a.ordem_servico_id]) avaliadorByOS[a.ordem_servico_id] = new Set();
      avaliadorByOS[a.ordem_servico_id].add(a.avaliador_id);
    });
    // Fetch profile names for tecnico and atendente
    const profileIds = [...new Set(osData.flatMap((o) => [o.tecnico_id, o.atendente_id]).filter(Boolean))] as string[];
    const profileNamesMap: Record<string, string> = {};
    if (profileIds.length > 0) {
      const { data: profilesData } = await supabase.from("profiles").select("id, nome").in("id", profileIds);
      (profilesData || []).forEach((p: any) => { profileNamesMap[p.id] = p.nome; });
    }

    let results = osData.map((os) => ({
      ...os,
      status: os.status,
      tipo_servico_nome: os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || null : null,
      setor_id: os.tipo_servico_id ? tipoSetorMap[os.tipo_servico_id] || null : null,
      avaliador_ids: avaliadorByOS[os.id] || new Set<string>(),
      tecnico_nome: os.tecnico_id ? profileNamesMap[os.tecnico_id] || null : null,
      atendente_nome: os.atendente_id ? profileNamesMap[os.atendente_id] || null : null,
    }));

    // Client-side filters only apply in combined mode (not direct search)
    if (!isDirectSearch) {
      if (filterSetor !== "todos") {
        results = results.filter((o) => o.setor_id === filterSetor);
      }
      if (filterAvaliador !== "todos") {
        results = results.filter((o) => o.avaliador_ids.has(filterAvaliador));
      }
    }

    setOsList(
      results.map(({ setor_id, avaliador_ids, ...rest }) => rest)
    );
    setSelected(new Set());
    setLoading(false);
  }, [startDate, endDate, filterStatus, filterSetor, filterAvaliador, filterAvaliado, filterCliente, filterNumeroOS]);

  // Only auto-fetch on mount
  useEffect(() => { fetchOS(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Selection
  const allSelected = osList.length > 0 && selected.size === osList.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(osList.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Delete (called after password confirmed by AdminPasswordDialog)
  const executeDeleteSelected = async () => {
    if (!user) return;

    const osIds = [...selected];

    // 1. Get avaliacoes for these OS
    const { data: avaliacoes } = await supabase
      .from("avaliacoes")
      .select("id")
      .in("ordem_servico_id", osIds);
    const avalIds = avaliacoes?.map((a) => a.id) || [];

    // 2. Get evidencia URLs to delete from storage
    if (avalIds.length > 0) {
      const { data: respostas } = await supabase
        .from("respostas_avaliacao")
        .select("evidencia_url")
        .in("avaliacao_id", avalIds)
        .not("evidencia_url", "is", null);

      if (respostas && respostas.length > 0) {
        const paths = respostas
          .map((r) => r.evidencia_url)
          .filter(Boolean)
          .map((url) => {
            const match = url!.match(/evidencias\/(.+)$/);
            return match ? match[1] : null;
          })
          .filter(Boolean) as string[];

        if (paths.length > 0) {
          await supabase.storage.from("evidencias").remove(paths);
        }
      }

      // 3. Delete respostas
      await supabase.from("respostas_avaliacao").delete().in("avaliacao_id", avalIds);
    }

    // 4. Delete inconsistencias (both types)
    await supabase.from("avaliacoes_inconsistencias").delete().in("ordem_servico_id", osIds);
    await supabase.from("inconsistencias_vinculadas").delete().in("ordem_servico_id", osIds);

    // 5. Delete os_perguntas
    await supabase.from("os_perguntas").delete().in("os_id", osIds);

    // 6. Delete avaliacoes
    if (avalIds.length > 0) {
      await supabase.from("avaliacoes").delete().in("id", avalIds);
    }

    // 7. Delete OS
    await supabase.from("ordens_servico").delete().in("id", osIds);

    // 8. Audit log
    for (const osId of osIds) {
      const osInfo = osList.find((o) => o.id === osId);
      await supabase.from("audit_logs").insert({
        user_id: user.id,
        acao: "exclusao_relatorio",
        tabela: "ordens_servico",
        registro_id: osId,
        dados_anteriores: osInfo ? { numero_os: osInfo.numero_os, cliente_nome: osInfo.cliente_nome } : null,
      });
    }

    toast.success(`${osIds.length} OS(s) e todos os dados vinculados foram excluídos.`);
    fetchOS();
  };

  // Export CSV — columnar format with questions as headers, showing scores
  const handleExportSelected = async () => {
    if (selected.size === 0) return;
    setExportLoading(true);

    try {
      const osIds = [...selected];

      // 1. Get OS data
      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, data_abertura, cliente_nome, cliente_cpf, tipo_servico_id, colaborador_avaliado_id, tecnico_id, atendente_id")
        .in("id", osIds);

      if (!osData || osData.length === 0) {
        toast.error("Nenhum dado encontrado.");
        setExportLoading(false);
        return;
      }

      // 2. Parallel fetches
      const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];
      const [tiposRes, osPerguntasRes, respostasRes, avaliacoesRes] = await Promise.all([
        tipoIds.length > 0
          ? supabase.from("tipos_servico").select("id, nome").in("id", tipoIds)
          : Promise.resolve({ data: [] }),
        supabase.from("os_perguntas").select("os_id, pergunta_id").in("os_id", osIds),
        supabase.from("respostas_avaliacao").select("ordem_servico_id, pergunta_id, resposta, avaliador_id").in("ordem_servico_id", osIds),
        supabase.from("avaliacoes").select("id, ordem_servico_id, avaliador_id, nota_final, concluida_em, created_at").in("ordem_servico_id", osIds),
      ]);

      const tipoNames: Record<string, string> = {};
      (tiposRes.data || []).forEach((t: any) => { tipoNames[t.id] = t.nome; });

      // 3. Get ALL perguntas linked to these OS (ordered)
      const allPerguntaIds = [...new Set((osPerguntasRes.data || []).map((op: any) => op.pergunta_id))];
      let perguntas: { id: string; pergunta: string; ordem: number; peso: number }[] = [];
      if (allPerguntaIds.length > 0) {
        const { data } = await supabase
          .from("perguntas_avaliacao")
          .select("id, pergunta, ordem, peso")
          .in("id", allPerguntaIds)
          .order("ordem");
        perguntas = data || [];
      }

      const perguntaPeso: Record<string, number> = {};
      perguntas.forEach((p) => { perguntaPeso[p.id] = p.peso; });

      // 4. Build perguntas per OS
      const perguntasByOS: Record<string, Set<string>> = {};
      (osPerguntasRes.data || []).forEach((op: any) => {
        if (!perguntasByOS[op.os_id]) perguntasByOS[op.os_id] = new Set();
        perguntasByOS[op.os_id].add(op.pergunta_id);
      });

      // 5. Build respostas map: os_id -> pergunta_id -> resposta
      const respostasByOS: Record<string, Record<string, string>> = {};
      (respostasRes.data || []).forEach((r: any) => {
        if (!r.ordem_servico_id) return;
        if (!respostasByOS[r.ordem_servico_id]) respostasByOS[r.ordem_servico_id] = {};
        if (r.resposta) respostasByOS[r.ordem_servico_id][r.pergunta_id] = r.resposta;
      });

      // 6. Get profile names
      const profileIds = [
        ...new Set([
          ...(avaliacoesRes.data?.map((a) => a.avaliador_id) || []),
          ...osData.map((o) => o.colaborador_avaliado_id).filter(Boolean) as string[],
          ...osData.map((o) => o.tecnico_id).filter(Boolean) as string[],
          ...osData.map((o) => o.atendente_id).filter(Boolean) as string[],
        ]),
      ];
      let profileNames: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", profileIds);
        profiles?.forEach((p) => { profileNames[p.id] = p.nome; });
      }

      // 7. Build CSV — questions as columns with score values
      const fixedHeaders = [
        "Número OS", "Nome Cliente", "CPF Cliente", "Data Avaliação",
        "Avaliador", "Tipo Serviço", "Colaborador Avaliado", "Hora Conclusão", "Nota Final"
      ];
      // Header shows "Pergunta (Peso: X)"
      const questionHeaders = perguntas.map((p) => `${p.pergunta} (Peso: ${p.peso})`);
      const csvHeader = [...fixedHeaders, ...questionHeaders].map(escapeCSV).join(";");

      const csvRows: string[] = [];
      for (const os of osData) {
        const osAvals = avaliacoesRes.data?.filter((a) => a.ordem_servico_id === os.id) || [];
        const osRespostas = respostasByOS[os.id] || {};

        // Calculate nota from responses
        let totalPeso = 0;
        let earnedPeso = 0;
        const osPerguntaIds = perguntasByOS[os.id] || new Set();
        for (const pid of osPerguntaIds) {
          const resp = osRespostas[pid];
          const peso = perguntaPeso[pid] || 1;
          if (!resp) continue;
          totalPeso += peso;
          if (resp === "sim" || resp === "na") earnedPeso += peso;
        }
        const calculatedNota = totalPeso > 0 ? ((earnedPeso / totalPeso) * 100) : null;

        // Use avaliacao nota_final if available, otherwise calculated
        const bestNota = osAvals.length > 0 && osAvals[0].nota_final != null
          ? osAvals[0].nota_final
          : calculatedNota;

        const avaliadorNome = osAvals.length > 0 ? (profileNames[osAvals[0].avaliador_id] || "") : "";
        const dataAval = osAvals.length > 0 ? format(new Date(osAvals[0].created_at), "dd/MM/yyyy") : format(new Date(os.data_abertura), "dd/MM/yyyy");
        const horaConclusao = osAvals.length > 0 && osAvals[0].concluida_em
          ? format(new Date(osAvals[0].concluida_em), "dd/MM/yyyy HH:mm")
          : "";

        const row = [
          os.numero_os,
          os.cliente_nome || "",
          os.cliente_cpf || "",
          dataAval,
          avaliadorNome,
          os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || "" : "",
          os.colaborador_avaliado_id ? profileNames[os.colaborador_avaliado_id] || "" : "",
          horaConclusao,
          bestNota != null ? bestNota.toFixed(2).replace(".", ",") : "",
          ...perguntas.map((p) => {
            const resp = osRespostas[p.id];
            if (!resp) return "";
            if (resp === "na") return p.peso.toString(); // N/A pontua igual SIM
            if (resp === "sim") return p.peso.toString();
            if (resp === "nao") return "0";
            return "";
          }),
        ];
        csvRows.push(row.map(escapeCSV).join(";"));
      }

      const csvContent = "\uFEFF" + csvHeader + "\n" + csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio_os_${startDate ? format(startDate, "yyyy-MM-dd") : "export"}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Exportação de ${selected.size} OS(s) concluída.`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Export ALL filtered results (only concluídas)
  const handleExportAllFiltered = async () => {
    const concluidasList = osList.filter((os) => os.status === "concluida");
    if (concluidasList.length === 0) {
      toast.error("Nenhuma OS concluída disponível para exportação.");
      return;
    }

    setExportAllLoading(true);
    try {
      const osIds = concluidasList.map((os) => os.id);

      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, status, data_abertura, cliente_nome, cliente_cpf, tipo_servico_id, colaborador_avaliado_id, tecnico_id, atendente_id")
        .in("id", osIds);

      if (!osData || osData.length === 0) {
        toast.error("Nenhum dado encontrado.");
        setExportAllLoading(false);
        return;
      }

      const tipoIds = [...new Set(osData.map((o) => o.tipo_servico_id).filter(Boolean))] as string[];
      const [tiposRes, osPerguntasRes, respostasRes, avaliacoesRes] = await Promise.all([
        tipoIds.length > 0
          ? supabase.from("tipos_servico").select("id, nome").in("id", tipoIds)
          : Promise.resolve({ data: [] }),
        supabase.from("os_perguntas").select("os_id, pergunta_id").in("os_id", osIds),
        supabase.from("respostas_avaliacao").select("ordem_servico_id, pergunta_id, resposta, avaliador_id").in("ordem_servico_id", osIds),
        supabase.from("avaliacoes").select("id, ordem_servico_id, avaliador_id, nota_final, concluida_em, created_at").in("ordem_servico_id", osIds),
      ]);

      const tipoNames: Record<string, string> = {};
      (tiposRes.data || []).forEach((t: any) => { tipoNames[t.id] = t.nome; });

      const allPerguntaIds = [...new Set((osPerguntasRes.data || []).map((op: any) => op.pergunta_id))];
      let perguntas: { id: string; pergunta: string; ordem: number; peso: number }[] = [];
      if (allPerguntaIds.length > 0) {
        const { data } = await supabase
          .from("perguntas_avaliacao")
          .select("id, pergunta, ordem, peso")
          .in("id", allPerguntaIds)
          .order("ordem");
        perguntas = data || [];
      }

      const perguntaPeso: Record<string, number> = {};
      perguntas.forEach((p) => { perguntaPeso[p.id] = p.peso; });

      const perguntasByOS: Record<string, Set<string>> = {};
      (osPerguntasRes.data || []).forEach((op: any) => {
        if (!perguntasByOS[op.os_id]) perguntasByOS[op.os_id] = new Set();
        perguntasByOS[op.os_id].add(op.pergunta_id);
      });

      const respostasByOS: Record<string, Record<string, string>> = {};
      (respostasRes.data || []).forEach((r: any) => {
        if (!r.ordem_servico_id) return;
        if (!respostasByOS[r.ordem_servico_id]) respostasByOS[r.ordem_servico_id] = {};
        if (r.resposta) respostasByOS[r.ordem_servico_id][r.pergunta_id] = r.resposta;
      });

      const profileIds = [
        ...new Set([
          ...(avaliacoesRes.data?.map((a) => a.avaliador_id) || []),
          ...osData.map((o) => o.colaborador_avaliado_id).filter(Boolean) as string[],
          ...osData.map((o) => o.tecnico_id).filter(Boolean) as string[],
          ...osData.map((o) => o.atendente_id).filter(Boolean) as string[],
        ]),
      ];
      let profileNames: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, nome").in("id", profileIds);
        profiles?.forEach((p) => { profileNames[p.id] = p.nome; });
      }

      // Build Excel data
      const fixedHeaders = [
        "Número OS", "Nome Cliente", "CPF Cliente", "Data Abertura",
        "Avaliador", "Tipo Serviço", "Colaborador Avaliado", "Hora Conclusão", "Nota Final"
      ];
      const questionHeaders = perguntas.map((p) => `${p.pergunta} (Peso: ${p.peso})`);
      const allHeaders = [...fixedHeaders, ...questionHeaders];
      const wsData: (string | number)[][] = [allHeaders];
      for (const os of osData) {
        const osAvals2 = avaliacoesRes.data?.filter((a) => a.ordem_servico_id === os.id) || [];
        const osRespostas2 = respostasByOS[os.id] || {};

        let tp = 0; let ep = 0;
        const opIds = perguntasByOS[os.id] || new Set();
        for (const pid of opIds) {
          const resp = osRespostas2[pid]; const peso = perguntaPeso[pid] || 1;
          if (!resp) continue; tp += peso;
          if (resp === "sim" || resp === "na") ep += peso;
        }
        const cn2 = tp > 0 ? ((ep / tp) * 100) : null;
        const bn = osAvals2.length > 0 && osAvals2[0].nota_final != null ? osAvals2[0].nota_final : cn2;
        const avNome = osAvals2.length > 0 ? (profileNames[osAvals2[0].avaliador_id] || "") : "";
        const hc = osAvals2.length > 0 && osAvals2[0].concluida_em ? format(new Date(osAvals2[0].concluida_em), "dd/MM/yyyy HH:mm") : "";

        wsData.push([
          os.numero_os,
          os.cliente_nome || "",
          os.cliente_cpf || "",
          format(new Date(os.data_abertura), "dd/MM/yyyy"),
          avNome,
          os.tipo_servico_id ? tipoNames[os.tipo_servico_id] || "" : "",
          os.colaborador_avaliado_id ? profileNames[os.colaborador_avaliado_id] || "" : "",
          hc,
          bn != null ? Number(bn.toFixed(2)) : "",
          ...perguntas.map((p) => {
            const resp = osRespostas2[p.id];
            if (!resp) return "";
            if (resp === "na" || resp === "sim") return p.peso;
            if (resp === "nao") return 0;
            return "";
          }),
        ]);
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      
      // Auto-size columns
      const colWidths = allHeaders.map((h, i) => {
        const maxLen = Math.max(h.length, ...wsData.slice(1).map(r => String(r[i] ?? "").length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws["!cols"] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, "Relatório");
      XLSX.writeFile(wb, `relatorio_filtrado_${format(new Date(), "yyyy-MM-dd_HHmm")}.xlsx`);

      toast.success(`Relatório exportado com ${osData.length} OS(s) concluída(s).`);
    } catch (err: any) {
      toast.error("Erro ao exportar: " + err.message);
    } finally {
      setExportAllLoading(false);
    }
  };

  // Access is now controlled by permissoes_tela — no admin block needed

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-section font-semibold text-foreground">Relatórios de OS</h1>
        <p className="text-body text-muted-foreground">Gerencie e exporte dados de Ordens de Serviço</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
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

          <Button onClick={fetchOS} disabled={loading} className="h-9">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            Buscar
          </Button>
        </div>

        {/* Advanced Filters Row */}
        <div className="flex flex-wrap gap-4 items-end mt-4 pt-4 border-t border-border">
          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Status</label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aberta">Aberta</SelectItem>
                <SelectItem value="em_andamento">Em andamento</SelectItem>
                <SelectItem value="concluida">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Setor</label>
            <Select value={filterSetor} onValueChange={setFilterSetor}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {setores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Avaliador</label>
            <Select value={filterAvaliador} onValueChange={setFilterAvaliador}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {avaliadores.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Avaliado</label>
            <Select value={filterAvaliado} onValueChange={setFilterAvaliado}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {avaliados.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[160px]">
            <label className="text-caption font-medium text-muted-foreground">Cliente</label>
            <Input
              className="h-9"
              placeholder="Buscar cliente..."
              value={filterCliente}
              onChange={(e) => setFilterCliente(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label className="text-caption font-medium text-muted-foreground">Nº OS</label>
            <Input
              className="h-9"
              placeholder="Buscar OS..."
              value={filterNumeroOS}
              onChange={(e) => setFilterNumeroOS(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-lg p-3 shadow-card flex items-center justify-between"
        >
          <span className="text-body font-medium text-foreground">
            {selected.size} OS(s) selecionada(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportDialogOpen(true)}
              disabled={exportLoading}
            >
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              Exportar Excel
            </Button>
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir Selecionadas
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="text-body font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Ordens de Serviço ({osList.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const concluidasCount = osList.filter((os) => os.status === "concluida").length;
                if (concluidasCount === 0) {
                  toast.error("Nenhuma OS concluída disponível para exportação.");
                  return;
                }
                handleExportAllFiltered();
              }}
              disabled={exportAllLoading || osList.length === 0}
            >
              {exportAllLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
              Exportar Relatório ({osList.filter((os) => os.status === "concluida").length})
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2 w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      className="translate-y-[1px]"
                      {...(someSelected ? { "data-state": "indeterminate" } : {})}
                    />
                  </th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data Abertura</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo de Serviço</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-16">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {osList.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-muted/50 transition-colors",
                      selected.has(item.id) && "bg-primary/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-body font-medium font-tabular text-foreground">{item.numero_os}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground font-tabular">
                      {format(new Date(item.data_abertura), "dd/MM/yyyy")}
                    </td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.cliente_nome || "—"}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{item.tipo_servico_nome || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", statusBadge[item.status])}>
                        {statusText[item.status] || item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Abrir avaliação"
                        onClick={() => navigate(`/avaliacoes/pesquisa?os=${item.numero_os}&mode=eval`)}
                      >
                        <Eye className="w-4 h-4 text-primary" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {osList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">
                      Nenhuma OS encontrada no período selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Password Dialog */}
      <AdminPasswordDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Confirmar Exclusão"
        description={`Você está prestes a excluir ${selected.size} OS(s) e todos os dados vinculados (respostas, evidências, avaliações e inconsistências). Esta ação é irreversível.`}
        onConfirm={executeDeleteSelected}
      />

      {/* Export Selected Password Dialog */}
      <AdminPasswordDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Confirmar Exportação"
        description={`Informe sua senha para exportar ${selected.size} OS(s) selecionada(s).`}
        onConfirm={handleExportSelected}
      />

    </div>
  );
}

function escapeCSV(val: string): string {
  if (val.includes(";") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
