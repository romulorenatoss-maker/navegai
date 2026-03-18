import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon, Filter, Trophy, TrendingUp, Users, Phone,
  ArrowRightLeft, Target, BarChart3, Medal, Search
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface ProfileData {
  id: string;
  nome: string;
}

interface RankEntry {
  profileId: string;
  nome: string;
  leadsCriados: number;
  conversoes: number;
  taxaConversao: number;
  interacoes: number;
  mediaTentativas: number;
  transferencias: number;
}

export default function DashboardVendasPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [appliedStart, setAppliedStart] = useState<Date | undefined>(startOfMonth(now));
  const [appliedEnd, setAppliedEnd] = useState<Date | undefined>(endOfMonth(now));

  const handleBuscar = () => { setAppliedStart(startDate); setAppliedEnd(endDate); };

  const from = appliedStart ? startOfDay(appliedStart).toISOString() : startOfDay(startOfMonth(now)).toISOString();
  const to = appliedEnd ? endOfDay(appliedEnd).toISOString() : endOfDay(endOfMonth(now)).toISOString();

  // All active profiles (atendentes)
  const { data: profiles = [] } = useQuery({
    queryKey: ["dashboard-vendas-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      return (data || []) as ProfileData[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // All leads created or captured per user in period
  const { data: allLeadsCriados = [] } = useQuery({
    queryKey: ["dashboard-vendas-leads-criados-v2", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, usuario_id")
        .in("tipo_evento", ["lead_criado", "criacao", "lead_capturado"])
        .gte("data_evento", from)
        .lte("data_evento", to);
      return data || [];
    },
  });

  // All conversions in period — attributed to convertido_por (atendente que fez a venda)
  const { data: allConversoes = [] } = useQuery({
    queryKey: ["dashboard-vendas-conversoes-v4", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, data_evento")
        .eq("tipo_evento", "conversao_cliente")
        .gte("data_evento", from)
        .lte("data_evento", to);
      if (!data?.length) return [];

      // Get convertido_por from leads table
      const leadIds = [...new Set(data.map(d => d.lead_id))];
      const { data: leads } = await supabase
        .from("leads")
        .select("id, convertido_por")
        .in("id", leadIds);

      const convertidoPorByLead: Record<string, string | null> = {};
      leads?.forEach((l: any) => { convertidoPorByLead[l.id] = l.convertido_por; });

      return data.map(d => ({ lead_id: d.lead_id, data_evento: d.data_evento, convertido_por: convertidoPorByLead[d.lead_id] || null }));
    },
  });

  // All interactions in period
  const { data: allInteracoes = [] } = useQuery({
    queryKey: ["dashboard-vendas-interacoes", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_interacoes")
        .select("id, colaborador_id")
        .gte("data_interacao", from)
        .lte("data_interacao", to);
      return data || [];
    },
  });

  // All transfers in period
  const { data: allTransferencias = [] } = useQuery({
    queryKey: ["dashboard-vendas-transferencias", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, usuario_id")
        .in("tipo_evento", ["transferencia_automatica", "transferencia_manual"])
        .gte("data_evento", from)
        .lte("data_evento", to);
      return data || [];
    },
  });

  // Build ranking data
  const rankData = useMemo<RankEntry[]>(() => {
    const profileMap = new Map<string, RankEntry>();

    profiles.forEach(p => {
      profileMap.set(p.id, {
        profileId: p.id,
        nome: p.nome,
        leadsCriados: 0,
        conversoes: 0,
        taxaConversao: 0,
        interacoes: 0,
        mediaTentativas: 0,
        transferencias: 0,
      });
    });

    // Leads created per user
    const leadsPerUser: Record<string, Set<string>> = {};
    allLeadsCriados.forEach(a => {
      if (!a.usuario_id) return;
      if (!leadsPerUser[a.usuario_id]) leadsPerUser[a.usuario_id] = new Set();
      leadsPerUser[a.usuario_id].add(a.lead_id);
    });

    // Apply leads count
    Object.entries(leadsPerUser).forEach(([uid, leads]) => {
      const entry = profileMap.get(uid);
      if (entry) entry.leadsCriados = leads.size;
    });

    // Conversions attributed to lead creator
    allConversoes.forEach(c => {
      if (!c.criador_id) return;
      const entry = profileMap.get(c.criador_id);
      if (entry) entry.conversoes++;
    });

    // Interactions per user
    allInteracoes.forEach(i => {
      const entry = profileMap.get(i.colaborador_id);
      if (entry) entry.interacoes++;
    });

    // Transfers per user
    allTransferencias.forEach(t => {
      const entry = profileMap.get(t.usuario_id);
      if (entry) entry.transferencias++;
    });

    // Calculate rates — cap conversion rate at 100%
    profileMap.forEach(entry => {
      if (entry.leadsCriados > 0) {
        const raw = (entry.conversoes / entry.leadsCriados) * 100;
        entry.taxaConversao = Math.min(raw, 100);
      } else {
        entry.taxaConversao = 0;
      }
      entry.mediaTentativas = entry.conversoes > 0 ? entry.interacoes / entry.conversoes : 0;
    });

    // Only show users with at least some activity, sorted by conversions
    const sorted = [...profileMap.values()]
      .filter(e => e.leadsCriados > 0 || e.conversoes > 0 || e.interacoes > 0)
      .sort((a, b) => b.conversoes - a.conversoes);

    // Assign tied positions (same conversions = same rank)
    let currentRank = 1;
    sorted.forEach((entry, idx) => {
      if (idx === 0) {
        (entry as any).rank = currentRank;
      } else {
        if (entry.conversoes === sorted[idx - 1].conversoes) {
          (entry as any).rank = (sorted[idx - 1] as any).rank;
        } else {
          currentRank = idx + 1;
          (entry as any).rank = currentRank;
        }
      }
    });

    return sorted;
  }, [profiles, allConversoes, allLeadsCriados, allInteracoes, allTransferencias]);

  // Per-metric rankings
  const metricRankings = useMemo(() => {
    const metrics: { key: keyof RankEntry; label: string; icon: React.ReactNode; format: (v: number) => string; higherBetter: boolean }[] = [
      { key: "conversoes", label: "Conversões", icon: <Target className="w-4 h-4" />, format: v => String(v), higherBetter: true },
      { key: "taxaConversao", label: "Taxa de Conversão", icon: <TrendingUp className="w-4 h-4" />, format: v => `${v.toFixed(1)}%`, higherBetter: true },
      { key: "leadsCriados", label: "Leads Atribuídos", icon: <Users className="w-4 h-4" />, format: v => String(v), higherBetter: true },
      { key: "interacoes", label: "Total de Interações", icon: <Phone className="w-4 h-4" />, format: v => String(v), higherBetter: true },
      { key: "mediaTentativas", label: "Média Tentativas/Conversão", icon: <BarChart3 className="w-4 h-4" />, format: v => v.toFixed(1), higherBetter: false },
      { key: "transferencias", label: "Transferências Realizadas", icon: <ArrowRightLeft className="w-4 h-4" />, format: v => String(v), higherBetter: false },
    ];

    return metrics.map(m => {
      const sorted = [...rankData]
        .filter(r => (r[m.key] as number) > 0)
        .sort((a, b) => m.higherBetter
          ? (b[m.key] as number) - (a[m.key] as number)
          : (a[m.key] as number) - (b[m.key] as number)
        );
      return { ...m, ranked: sorted };
    });
  }, [rankData]);

  // Chart data: conversions per day per top users (by creator)
  const chartData = useMemo(() => {
    const top5 = rankData.slice(0, 5);
    const grouped: Record<string, Record<string, number>> = {};
    allConversoes.forEach(c => {
      if (!c.criador_id) return;
      const top = top5.find(t => t.profileId === c.criador_id);
      if (!top) return;
      const date = format(new Date(c.data_evento), "dd/MM");
      if (!grouped[date]) grouped[date] = {};
      grouped[date][top.nome] = (grouped[date][top.nome] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([date, users]) => ({ date, ...users }))
      .sort((a, b) => {
        const [da, ma] = a.date.split("/").map(Number);
        const [db, mb] = b.date.split("/").map(Number);
        return (ma * 100 + da) - (mb * 100 + db);
      });
  }, [allConversoes, rankData]);

  const top5Names = rankData.slice(0, 5).map(r => r.nome);
  const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  const getMedalColor = (idx: number) => {
    if (idx === 0) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    if (idx === 1) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    if (idx === 2) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    return "bg-muted text-muted-foreground";
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="w-5 h-5" /> Dashboard de Vendas
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparativo de performance de vendas entre todos os atendentes.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {startDate ? format(startDate, "dd/MM/yyyy") : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">até</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {endDate ? format(endDate, "dd/MM/yyyy") : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} />
              </PopoverContent>
            </Popover>
            <Button size="sm" className="h-8 text-xs" onClick={handleBuscar}>
              <Search className="w-3.5 h-3.5 mr-1" /> Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Metric ranking cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {metricRankings.map(metric => (
          <Card key={metric.key as string}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {metric.icon}
                {metric.label}
                {!metric.higherBetter && (
                  <Badge variant="outline" className="text-[10px] ml-auto">Menor = Melhor</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {metric.ranked.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">Sem dados no período</p>
              ) : (
                <div className="space-y-1.5">
                  {metric.ranked.slice(0, 5).map((r, idx) => (
                    <div key={r.profileId} className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                        getMedalColor(idx)
                      )}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 truncate text-foreground">{r.nome}</span>
                      <Badge variant="secondary" className="text-xs font-mono">
                        {metric.format(r[metric.key] as number)}
                      </Badge>
                    </div>
                  ))}
                  {metric.ranked.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      +{metric.ranked.length - 5} colaboradores
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Full ranking table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Medal className="w-4 h-4" />
            Ranking Geral Detalhado
            <Badge variant="secondary" className="text-xs ml-auto">{rankData.length} atendentes</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Atendente</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Conversões</TableHead>
                  <TableHead className="text-center">Taxa</TableHead>
                  <TableHead className="text-center">Interações</TableHead>
                  <TableHead className="text-center">Média Tent.</TableHead>
                  <TableHead className="text-center">Transferências</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma atividade no período selecionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  rankData.map((r) => {
                    const rank = (r as any).rank ?? 1;
                    return (
                    <TableRow key={r.profileId}>
                      <TableCell>
                        <span className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                          getMedalColor(rank - 1)
                        )}>
                          {rank}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="text-center">{r.leadsCriados}</TableCell>
                      <TableCell className="text-center font-semibold">{r.conversoes}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.taxaConversao >= 30 ? "default" : r.taxaConversao >= 15 ? "secondary" : "outline"} className="text-xs">
                          {r.taxaConversao.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{r.interacoes}</TableCell>
                      <TableCell className="text-center">{r.mediaTentativas.toFixed(1)}</TableCell>
                      <TableCell className="text-center">{r.transferencias}</TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Chart: conversions per day (top 5) */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Conversões por Dia — Top 5
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--popover-foreground))",
                  }}
                />
                <Legend />
                {top5Names.map((name, i) => (
                  <Bar key={name} dataKey={name} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
