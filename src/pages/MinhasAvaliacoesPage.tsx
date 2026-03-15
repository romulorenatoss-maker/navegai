import { useState, useMemo } from "react";
import { fetchNotasPorSetor, calcularMediaColaborador, calcularNotaPorOS } from "@/hooks/useNotasPorSetor";
import { getScoreColorClass, getScoreBgClass } from "@/lib/score-colors";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarIcon, Filter, Trophy, AlertTriangle,
  Eye, MessageSquare, Loader2, FileText, Download
} from "lucide-react";
import { exportOSPdf } from "@/lib/export-os-pdf";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function MinhasAvaliacoesPage() {
  const { profile } = useAuth();
  const targetProfileId = profile?.id;

  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [appliedStart, setAppliedStart] = useState<Date | undefined>(startOfMonth(now));
  const [appliedEnd, setAppliedEnd] = useState<Date | undefined>(endOfMonth(now));
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("desempenho");

  const handleBuscar = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  };

  // Evaluations in date range (concluída only)
  const { data: evaluations = [] } = useQuery({
    queryKey: ["minhas_perf_evals", targetProfileId, appliedStart?.toISOString(), appliedEnd?.toISOString()],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const from = appliedStart ? startOfDay(appliedStart).toISOString() : startOfDay(startOfMonth(now)).toISOString();
      const to = appliedEnd ? endOfDay(appliedEnd).toISOString() : endOfDay(endOfMonth(now)).toISOString();

      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, tipo_servico_id, created_at, data_abertura, cliente_nome, tecnico_id, atendente_id, status")
        .or(`tecnico_id.eq.${targetProfileId},atendente_id.eq.${targetProfileId},colaborador_avaliado_id.eq.${targetProfileId}`)
        .eq("status", "concluida")
        .gte("data_abertura", from)
        .lte("data_abertura", to)
        .order("data_abertura", { ascending: false });

      if (!osData?.length) return [];

      const tsIds = [...new Set(osData.map(o => o.tipo_servico_id).filter(Boolean))] as string[];
      let tsMap: Record<string, string> = {};
      if (tsIds.length > 0) {
        const { data: tss } = await supabase.from("tipos_servico").select("id, nome").in("id", tsIds);
        tss?.forEach(t => { tsMap[t.id] = t.nome; });
      }

      return osData.map(os => ({
        os_id: os.id,
        numero_os: os.numero_os,
        created_at: os.created_at,
        cliente_nome: os.cliente_nome,
        tipo_servico: tsMap[os.tipo_servico_id || ""] || "—",
        atendente_id: os.atendente_id,
        tecnico_id: os.tecnico_id,
      }));
    },
    enabled: !!targetProfileId,
  });

  // All OS (for OS tab)
  const { data: allOsList = [] } = useQuery({
    queryKey: ["minhas_all_os", targetProfileId],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, tipo_servico_id, created_at, cliente_nome, status, data_conclusao, atendente_id, tecnico_id")
        .or(`tecnico_id.eq.${targetProfileId},atendente_id.eq.${targetProfileId},colaborador_avaliado_id.eq.${targetProfileId}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!osData?.length) return [];

      const tsIds = [...new Set(osData.map(o => o.tipo_servico_id).filter(Boolean))] as string[];
      let tsMap: Record<string, string> = {};
      if (tsIds.length > 0) {
        const { data: tss } = await supabase.from("tipos_servico").select("id, nome").in("id", tsIds);
        tss?.forEach(t => { tsMap[t.id] = t.nome; });
      }

      const oldestDate = osData[osData.length - 1]?.created_at;
      const notas = await fetchNotasPorSetor(oldestDate);

      return osData.map(os => ({
        ...os,
        tipo_servico_nome: tsMap[os.tipo_servico_id || ""] || "—",
        avg_nota: calcularNotaPorOS(notas, targetProfileId, os.id),
      }));
    },
    enabled: !!targetProfileId,
  });

  // Average score
  const { data: notasPorSetorData = [] } = useQuery({
    queryKey: ["minhas_notas_setor", targetProfileId, appliedStart?.toISOString(), appliedEnd?.toISOString()],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const from = appliedStart ? startOfDay(appliedStart).toISOString() : startOfDay(startOfMonth(now)).toISOString();
      const to = appliedEnd ? endOfDay(appliedEnd).toISOString() : endOfDay(endOfMonth(now)).toISOString();
      return fetchNotasPorSetor(from, to);
    },
    enabled: !!targetProfileId,
  });

  const avgScore = useMemo(() => {
    if (!targetProfileId) return null;
    return calcularMediaColaborador(notasPorSetorData, targetProfileId);
  }, [notasPorSetorData, targetProfileId]);

  // Most frequent errors
  const { data: frequentErrors = [] } = useQuery({
    queryKey: ["minhas_errors", targetProfileId, appliedStart?.toISOString(), appliedEnd?.toISOString()],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const from = appliedStart ? startOfDay(appliedStart).toISOString() : startOfDay(startOfMonth(now)).toISOString();
      const to = appliedEnd ? endOfDay(appliedEnd).toISOString() : endOfDay(endOfMonth(now)).toISOString();

      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id")
        .or(`tecnico_id.eq.${targetProfileId},atendente_id.eq.${targetProfileId},colaborador_avaliado_id.eq.${targetProfileId}`)
        .gte("data_abertura", from)
        .lte("data_abertura", to);

      if (!osData?.length) return [];
      const osIds = osData.map(o => o.id);

      const { data: avals } = await supabase
        .from("avaliacoes").select("id").in("ordem_servico_id", osIds).eq("concluida", true);
      if (!avals?.length) return [];

      const { data: respostas } = await supabase
        .from("respostas_avaliacao").select("pergunta_id").in("avaliacao_id", avals.map(a => a.id)).eq("resposta", "nao");
      if (!respostas?.length) return [];

      const errorCount: Record<string, number> = {};
      respostas.forEach(r => { errorCount[r.pergunta_id] = (errorCount[r.pergunta_id] || 0) + 1; });

      const perguntaIds = Object.keys(errorCount);
      const { data: perguntas } = await supabase.from("perguntas_avaliacao").select("id, pergunta").in("id", perguntaIds);
      const perguntaMap: Record<string, string> = {};
      perguntas?.forEach(p => { perguntaMap[p.id] = p.pergunta; });

      return Object.entries(errorCount)
        .map(([id, count]) => ({ pergunta_id: id, pergunta: perguntaMap[id] || "—", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    enabled: !!targetProfileId,
  });

  // OS Detail dialog
  const { data: osDetailData } = useQuery({
    queryKey: ["minhas_os_detail", selectedOsId],
    queryFn: async () => {
      if (!selectedOsId) return null;

      const { data: osInfo } = await supabase.from("ordens_servico")
        .select("cliente_nome, cliente_cpf, numero_os")
        .eq("id", selectedOsId).single();

      const { data: avals } = await supabase.from("avaliacoes")
        .select("id, avaliador_id, tipo_avaliacao_id, nota_final, concluida, concluida_em")
        .eq("ordem_servico_id", selectedOsId);
      if (!avals?.length) return { osInfo, avaliacoes: [] };

      const avalIds = avals.map(a => a.id);
      const { data: respostas } = await supabase.from("respostas_avaliacao")
        .select("avaliacao_id, pergunta_id, resposta, observacao, evidencia_url")
        .in("avaliacao_id", avalIds);

      const perguntaIds = [...new Set(respostas?.map(r => r.pergunta_id) || [])];
      let perguntaMap: Record<string, { pergunta: string; peso: number; ordem: number }> = {};
      if (perguntaIds.length > 0) {
        const { data: perguntas } = await supabase.from("perguntas_avaliacao")
          .select("id, pergunta, peso, ordem").in("id", perguntaIds).order("ordem");
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

      return {
        osInfo,
        avaliacoes: avals.map(a => {
          const avalRespostas = (respostas || [])
            .filter(r => r.avaliacao_id === a.id)
            .map(r => ({
              ...r,
              pergunta: perguntaMap[r.pergunta_id]?.pergunta || "—",
              peso: perguntaMap[r.pergunta_id]?.peso || 0,
              ordem: perguntaMap[r.pergunta_id]?.ordem || 0,
            }))
            .sort((x, y) => x.ordem - y.ordem);

          const totalPeso = avalRespostas.reduce((acc, r) => r.resposta ? acc + r.peso : acc, 0);
          const earnedPeso = avalRespostas.reduce((acc, r) => (r.resposta === "sim" || r.resposta === "na") ? acc + r.peso : acc, 0);
          const calculatedNota = totalPeso > 0 ? (earnedPeso / totalPeso) * 100 : null;

          return {
            id: a.id,
            avaliador_nome: avaliadorNames[a.avaliador_id] || "—",
            tipo_avaliacao_nome: a.tipo_avaliacao_id ? taNames[a.tipo_avaliacao_id] || "—" : "—",
            nota_final: calculatedNota ?? a.nota_final,
            concluida: a.concluida,
            concluida_em: a.concluida_em,
            respostas: avalRespostas,
          };
        }),
      };
    },
    enabled: !!selectedOsId,
  });

  const osDetail = osDetailData?.avaliacoes;
  const osDetailInfo = osDetailData?.osInfo;

  const myRole = (os: any) => {
    if (os.atendente_id === targetProfileId && os.tecnico_id === targetProfileId) return "Atendente + Técnico";
    if (os.atendente_id === targetProfileId) return "Atendente";
    if (os.tecnico_id === targetProfileId) return "Técnico";
    return "—";
  };

  const statusLabel: Record<string, { text: string; color: string }> = {
    aberta: { text: "Aberta", color: "bg-warning/10 text-warning border-warning/30" },
    em_andamento: { text: "Em andamento", color: "bg-primary/10 text-primary border-primary/30" },
    concluida: { text: "Concluída", color: "bg-success/10 text-success border-success/30" },
  };

  if (!targetProfileId) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <p className="text-muted-foreground">Perfil não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Employee Header */}
      <div className="bg-card border border-border rounded-lg shadow-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{profile?.nome || "..."}</h1>
            <p className="text-sm text-muted-foreground">Minhas Avaliações</p>
          </div>
          {avgScore !== null && (
            <div className={cn("px-4 py-2 rounded-lg", getScoreBgClass(avgScore))}>
              <p className="text-caption text-muted-foreground">Média Geral</p>
              <p className={cn("text-2xl font-bold font-tabular", getScoreColorClass(avgScore))}>
                {avgScore.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="desempenho" className="flex items-center gap-1.5">
            <Trophy className="w-4 h-4" /> Desempenho
          </TabsTrigger>
          <TabsTrigger value="os_avaliadas" className="flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> OS Avaliadas
          </TabsTrigger>
        </TabsList>

        {/* Desempenho Tab */}
        <TabsContent value="desempenho" className="space-y-6 mt-4">
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
              <Button onClick={handleBuscar} className="h-9">
                <Filter className="w-4 h-4 mr-1.5" /> Buscar
              </Button>
            </div>
          </div>

          {/* Evaluation History */}
          <div className="bg-card border border-border rounded-lg shadow-card">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <h2 className="text-body font-semibold text-foreground">Histórico de Avaliações</h2>
              <Badge variant="secondary" className="ml-auto text-xs">{evaluations.length} OS</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Meu Papel</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo Serviço</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nota</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {evaluations.map(ev => {
                    const osNota = calcularNotaPorOS(notasPorSetorData, targetProfileId, ev.os_id);
                    return (
                      <tr key={ev.os_id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedOsId(ev.os_id)}>
                        <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2 font-tabular">{ev.numero_os}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{ev.cliente_nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{myRole(ev)}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{format(new Date(ev.created_at), "dd/MM/yyyy")}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{ev.tipo_servico}</td>
                        <td className="px-4 py-3">
                          {osNota != null ? (
                            <span className={cn("font-bold font-tabular", getScoreColorClass(osNota))}>{osNota.toFixed(1)}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                  {evaluations.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma avaliação no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Most Frequent Errors */}
          {frequentErrors.length > 0 && (
            <div className="bg-card border border-border rounded-lg shadow-card">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                <h2 className="text-body font-semibold text-foreground">Erros Mais Frequentes</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pergunta</th>
                      <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-32">Nº de Erros</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {frequentErrors.map(err => (
                      <tr key={err.pergunta_id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 text-body text-foreground">{err.pergunta}</td>
                        <td className="px-4 py-3 text-body font-bold text-destructive font-tabular text-right">{err.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* OS Avaliadas Tab */}
        <TabsContent value="os_avaliadas" className="space-y-4 mt-4">
          <div className="bg-card border border-border rounded-lg shadow-card">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <h2 className="text-body font-semibold text-foreground">Todas as OS Avaliadas</h2>
              <Badge variant="secondary" className="ml-auto text-xs">{allOsList.length} OS</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">OS</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Cliente</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Meu Papel</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo Serviço</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nota</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allOsList.map(os => {
                    const sl = statusLabel[os.status] || { text: os.status, color: "bg-muted text-muted-foreground" };
                    return (
                      <tr key={os.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-body font-medium text-primary font-tabular cursor-pointer underline underline-offset-2"
                          onClick={() => setSelectedOsId(os.id)}>
                          {os.numero_os}
                        </td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{os.cliente_nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{myRole(os)}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{format(new Date(os.created_at), "dd/MM/yyyy")}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{os.tipo_servico_nome}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border", sl.color)}>
                            {sl.text}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {os.avg_nota != null ? (
                            <span className={cn("font-bold font-tabular", getScoreColorClass(os.avg_nota))}>{os.avg_nota.toFixed(1)}%</span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedOsId(os.id)}>
                            <Eye className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {allOsList.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma OS encontrada.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Checklist Review Dialog */}
      <Dialog open={!!selectedOsId} onOpenChange={open => { if (!open) setSelectedOsId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Detalhes da Avaliação</DialogTitle>
              {osDetail && osDetail.length > 0 && osDetail.every((e: any) => e.concluida) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => {
                    const osNum = osDetailInfo?.numero_os || selectedOsId || "sem-numero";
                    exportOSPdf({
                      numero_os: osNum,
                      cliente_nome: osDetailInfo?.cliente_nome,
                      cliente_cpf: osDetailInfo?.cliente_cpf,
                      colaborador_nome: profile?.nome,
                      avaliacoes: osDetail.map((e: any) => ({
                        avaliador_nome: e.avaliador_nome,
                        tipo_avaliacao_nome: e.tipo_avaliacao_nome,
                        nota_final: e.nota_final,
                        concluida: e.concluida,
                        concluida_em: e.concluida_em,
                        respostas: e.respostas,
                      })),
                    });
                  }}
                >
                  <Download className="w-4 h-4" /> Exportar PDF
                </Button>
              )}
            </div>
          </DialogHeader>
          {osDetailInfo && (
            <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 mb-2 space-y-1">
              <p className="text-sm text-foreground"><span className="font-medium text-muted-foreground">Cliente:</span> {osDetailInfo.cliente_nome || "—"}</p>
              <p className="text-sm text-foreground"><span className="font-medium text-muted-foreground">CPF:</span> {osDetailInfo.cliente_cpf || "—"}</p>
            </div>
          )}
          {osDetail?.map((evalDetail: any) => (
            <div key={evalDetail.id} className="border border-border rounded-lg mb-4">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", evalDetail.concluida ? "bg-success" : "bg-warning")} />
                  <span className="text-caption text-muted-foreground">Avaliador:</span>
                  <h3 className="text-body font-semibold text-foreground">{evalDetail.avaliador_nome}</h3>
                  {evalDetail.concluida_em && (
                    <span className="text-caption text-muted-foreground ml-1">• {format(new Date(evalDetail.concluida_em), "dd/MM/yyyy HH:mm")}</span>
                  )}
                </div>
                {evalDetail.nota_final != null && (
                  <span className={cn("text-body font-bold font-tabular",
                    evalDetail.nota_final >= 85 ? "text-success" : evalDetail.nota_final >= 75 ? "text-warning" : "text-destructive"
                  )}>
                    {Number(evalDetail.nota_final).toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="divide-y divide-border">
                {evalDetail.respostas.map((resp: any, idx: number) => (
                  <div key={resp.pergunta_id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-caption font-medium text-muted-foreground font-tabular w-6 shrink-0 pt-0.5">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{resp.pergunta}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border",
                            resp.resposta === "sim" ? "border-success/40 bg-success/10 text-success" :
                            resp.resposta === "nao" ? "border-destructive/40 bg-destructive/10 text-destructive" :
                            "border-muted-foreground/30 bg-muted text-muted-foreground"
                          )}>
                            {resp.resposta === "sim" ? "SIM" : resp.resposta === "nao" ? "NÃO" : "N/A"}
                          </span>
                          <span className="text-caption text-muted-foreground">Peso: {resp.peso}</span>
                        </div>
                        {resp.observacao && (
                          <div className="mt-2 bg-muted/50 border border-border rounded p-2">
                            <p className="text-caption text-muted-foreground flex items-center gap-1 mb-0.5">
                              <MessageSquare className="w-3 h-3" /> Observação:
                            </p>
                            <p className="text-sm text-foreground">{resp.observacao}</p>
                          </div>
                        )}
                        {resp.evidencia_url && (
                          <div className="mt-2">
                            <img src={resp.evidencia_url} alt="Evidência"
                              className="rounded-lg border border-border max-h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => window.open(resp.evidencia_url, "_blank")} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
