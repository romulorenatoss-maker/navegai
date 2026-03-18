import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon, Filter, Trophy, TrendingUp, Users, Phone,
  ArrowRightLeft, Target, BarChart3, Eye
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function MinhasVendasTab() {
  const { profile } = useAuth();
  const profileId = profile?.id;

  const now = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [appliedStart, setAppliedStart] = useState<Date | undefined>(startOfMonth(now));
  const [appliedEnd, setAppliedEnd] = useState<Date | undefined>(endOfMonth(now));

  const handleBuscar = () => {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  };

  const from = appliedStart ? startOfDay(appliedStart).toISOString() : startOfDay(startOfMonth(now)).toISOString();
  const to = appliedEnd ? endOfDay(appliedEnd).toISOString() : endOfDay(endOfMonth(now)).toISOString();

  // Leads: converted leads where convertido_por=me, OR active leads where responsavel_id=me
  const { data: leadsCriados = [] } = useQuery({
    queryKey: ["minhas-vendas-leads-criados-v4", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, responsavel_id, convertido_por, status_lead")
        .gte("data_criacao", from)
        .lte("data_criacao", to)
        .or(`responsavel_id.eq.${profileId},convertido_por.eq.${profileId}`);

      const leadIds = new Set<string>();
      data?.forEach(d => {
        if (d.status_lead === 'convertido' && d.convertido_por === profileId) {
          leadIds.add(d.id);
        } else if (d.status_lead !== 'convertido' && d.responsavel_id === profileId) {
          leadIds.add(d.id);
        }
      });
      return Array.from(leadIds);
    },
  });

  // Conversions where convertido_por = current user (atendente que fez a venda)
  const { data: conversoes = [] } = useQuery({
    queryKey: ["minhas-vendas-conversoes-v4", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      // Get all conversions in period
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, data_evento")
        .eq("tipo_evento", "conversao_cliente")
        .gte("data_evento", from)
        .lte("data_evento", to);
      if (!data?.length) return [];

      // Filter by convertido_por = current user
      const leadIds = [...new Set(data.map(d => d.lead_id))];
      const { data: leads } = await supabase
        .from("leads")
        .select("id, convertido_por")
        .in("id", leadIds)
        .eq("convertido_por", profileId!);

      const myConvertedLeadIds = new Set(leads?.map(l => l.id) || []);

      return data
        .filter(d => myConvertedLeadIds.has(d.lead_id))
        .map(d => ({ lead_id: d.lead_id, data_evento: d.data_evento }));
    },
  });

  // Fetch lead names for converted leads
  const { data: convertedLeadDetails = [] } = useQuery({
    queryKey: ["minhas-vendas-converted-details", conversoes.map(c => c.lead_id).join(",")],
    enabled: conversoes.length > 0,
    queryFn: async () => {
      const leadIds = [...new Set(conversoes.map(c => c.lead_id))];
      if (!leadIds.length) return [];
      const { data } = await supabase
        .from("leads")
        .select("id, nome")
        .in("id", leadIds);
      return data || [];
    },
  });

  // Transfers made by this user
  const { data: transferencias = [] } = useQuery({
    queryKey: ["minhas-vendas-transferencias", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, data_evento")
        .eq("usuario_id", profileId!)
        .in("tipo_evento", ["transferencia_automatica", "transferencia_manual"])
        .gte("data_evento", from)
        .lte("data_evento", to);
      return data || [];
    },
  });

  // Interactions (attempts)
  const { data: interacoes = [] } = useQuery({
    queryKey: ["minhas-vendas-interacoes", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_interacoes")
        .select("id, data_interacao")
        .eq("colaborador_id", profileId!)
        .gte("data_interacao", from)
        .lte("data_interacao", to);
      return data || [];
    },
  });

  // Ranking: based on convertido_por (same logic as dashboard)
  const { data: ranking = [] } = useQuery({
    queryKey: ["minhas-vendas-ranking-v3", from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data: allConversoes } = await supabase
        .from("lead_historico")
        .select("lead_id")
        .eq("tipo_evento", "conversao_cliente")
        .gte("data_evento", from)
        .lte("data_evento", to);

      if (!allConversoes?.length) return [];

      // Get convertido_por from leads table
      const leadIds = [...new Set(allConversoes.map(c => c.lead_id))];
      const { data: leads } = await supabase
        .from("leads")
        .select("id, convertido_por")
        .in("id", leadIds);

      // Count conversions per convertido_por
      const countByUser: Record<string, number> = {};
      leads?.forEach((l: any) => {
        if (l.convertido_por) countByUser[l.convertido_por] = (countByUser[l.convertido_por] || 0) + 1;
      });

      const userIds = Object.keys(countByUser);
      if (!userIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);

      const nameMap: Record<string, string> = {};
      profiles?.forEach(p => { nameMap[p.id] = p.nome; });

      const sorted = Object.entries(countByUser)
        .map(([uid, count]) => ({ uid, nome: nameMap[uid] || "—", conversoes: count }))
        .sort((a, b) => b.conversoes - a.conversoes);

      // Assign tied positions
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
    },
  });

  // Metrics
  const totalLeads = leadsCriados.length;
  const totalConversoes = conversoes.length;
  const totalTransferencias = transferencias.length;
  const totalInteracoes = interacoes.length;
  const taxaConversao = totalLeads > 0 ? Math.min((totalConversoes / totalLeads) * 100, 100) : 0;
  const mediaTentativasPorConversao = totalConversoes > 0 ? (totalInteracoes / totalConversoes) : 0;

  // Ranking position with ties
  const myRankingPos = useMemo(() => {
    if (!profileId || !ranking.length) return null;
    const me = ranking.find((r: any) => r.uid === profileId);
    if (!me) return { position: ranking.length + 1, total: ranking.length + 1 };
    return { position: (me as any).rank ?? 1, total: ranking.length };
  }, [ranking, profileId]);

  // Build converted leads list for the table
  const convertedLeadsList = useMemo(() => {
    const leadNameMap: Record<string, string> = {};
    convertedLeadDetails.forEach(l => { leadNameMap[l.id] = l.nome; });

    return conversoes.map(c => ({
      lead_id: c.lead_id,
      nome: leadNameMap[c.lead_id] || "—",
      data_conversao: c.data_evento,
    })).sort((a, b) => new Date(b.data_conversao).getTime() - new Date(a.data_conversao).getTime());
  }, [conversoes, convertedLeadDetails]);

  // Chart: conversions per day
  const chartData = useMemo(() => {
    if (!conversoes.length) return [];
    const grouped: Record<string, number> = {};
    conversoes.forEach(c => {
      const key = format(new Date(c.data_evento), "dd/MM");
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([date, count]) => ({ date, conversoes: count }))
      .sort((a, b) => {
        const [da, ma] = a.date.split("/").map(Number);
        const [db, mb] = b.date.split("/").map(Number);
        return (ma * 100 + da) - (mb * 100 + db);
      });
  }, [conversoes]);

  return (
    <div className="space-y-6">
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

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={<Users className="w-4 h-4" />} label="Meus Leads" value={totalLeads} />
        <MetricCard icon={<Target className="w-4 h-4" />} label="Convertidos" value={totalConversoes} accent />
        <MetricCard icon={<ArrowRightLeft className="w-4 h-4" />} label="Transferências" value={totalTransferencias} />
        <MetricCard icon={<Phone className="w-4 h-4" />} label="Tentativas" value={totalInteracoes} />
        <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Taxa Conversão" value={`${taxaConversao.toFixed(1)}%`} accent />
        <MetricCard icon={<BarChart3 className="w-4 h-4" />} label="Média Tent./Conv." value={mediaTentativasPorConversao.toFixed(1)} />
      </div>

      {/* Ranking + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking Position Card */}
        <div className="bg-card border border-border rounded-lg shadow-card flex flex-col items-center justify-center p-6 text-center">
          <Trophy className="w-8 h-8 text-primary mb-3" />
          <h2 className="text-sm font-semibold text-muted-foreground mb-1">Ranking de Vendas</h2>
          {myRankingPos ? (
            <>
              <p className="text-4xl font-bold text-primary">{myRankingPos.position}º</p>
              <p className="text-sm text-muted-foreground mt-1">
                de {myRankingPos.total} colaborador{myRankingPos.total > 1 ? "es" : ""}
              </p>
              <p className="text-xs text-muted-foreground mt-2">no período selecionado</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-2">Sem conversões no período</p>
          )}
        </div>

        {/* Conversions Chart */}
        <div className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-body font-semibold text-foreground">Conversões por Dia</h2>
          </div>
          <div className="p-4">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma conversão no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="conversoes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Conversões" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Converted Leads List */}
      <div className="bg-card border border-border rounded-lg shadow-card">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          <h2 className="text-body font-semibold text-foreground">Leads Convertidos</h2>
          <Badge variant="secondary" className="text-xs ml-auto">{convertedLeadsList.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-center">Data Conversão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {convertedLeadsList.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma conversão no período selecionado.
                  </TableCell>
                </TableRow>
              ) : (
                convertedLeadsList.map((item) => (
                  <TableRow key={`${item.lead_id}-${item.data_conversao}`}>
                    <TableCell>
                      <Eye className="w-4 h-4 text-primary" />
                    </TableCell>
                    <TableCell className="font-medium">{item.nome}</TableCell>
                    <TableCell className="text-center text-sm">
                      {format(new Date(item.data_conversao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={cn("shadow-card", accent && "border-primary/30")}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
          {icon}
          <span className="text-caption font-medium uppercase tracking-wider truncate">{label}</span>
        </div>
        <p className={cn("text-xl font-bold font-tabular", accent ? "text-primary" : "text-foreground")}>{value}</p>
      </CardContent>
    </Card>
  );
}
