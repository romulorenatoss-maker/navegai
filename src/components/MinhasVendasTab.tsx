import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon, Filter, Trophy, TrendingUp, Users, Phone,
  ArrowRightLeft, Target, BarChart3
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

  // Leads received by current user in period
  const { data: leadsRecebidos = [] } = useQuery({
    queryKey: ["minhas-vendas-leads", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      // Leads where this user was responsible at some point (via historico)
      const { data: historico } = await supabase
        .from("lead_historico")
        .select("lead_id, tipo_evento, data_evento, descricao")
        .eq("usuario_id", profileId!)
        .gte("data_evento", from)
        .lte("data_evento", to)
        .in("tipo_evento", [
          "transferencia_automatica", "transferencia_manual", "transferencia_decisao",
          "lead_capturado", "lead_criado", "criacao"
        ]);

      // Also get leads directly assigned
      const { data: directLeads } = await supabase
        .from("leads")
        .select("id, nome, status_lead, created_at")
        .eq("responsavel_id", profileId!)
        .gte("created_at", from)
        .lte("created_at", to);

      const leadIds = new Set<string>();
      historico?.forEach(h => leadIds.add(h.lead_id));
      directLeads?.forEach(l => leadIds.add(l.id));

      return Array.from(leadIds);
    },
  });

  // Conversions — attributed to the lead's responsavel_id (salesperson), not who logged the event
  const { data: conversoes = [] } = useQuery({
    queryKey: ["minhas-vendas-conversoes", profileId, from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data } = await supabase
        .from("lead_historico")
        .select("lead_id, data_evento, descricao")
        .eq("tipo_evento", "conversao_cliente")
        .gte("data_evento", from)
        .lte("data_evento", to);
      if (!data?.length) return [];
      // Get leads to find who was responsible
      const leadIds = [...new Set(data.map(d => d.lead_id))];
      const { data: leads } = await supabase.from("leads").select("id, responsavel_id").in("id", leadIds);
      const leadResponsavel: Record<string, string | null> = {};
      leads?.forEach(l => { leadResponsavel[l.id] = l.responsavel_id; });
      return data
        .filter(d => leadResponsavel[d.lead_id] === profileId)
        .map(d => ({ lead_id: d.lead_id, data_evento: d.data_evento }));
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

  // Ranking: conversions attributed to lead's responsavel_id
  const { data: ranking = [] } = useQuery({
    queryKey: ["minhas-vendas-ranking", from, to],
    enabled: !!profileId,
    queryFn: async () => {
      const { data: allConversoes } = await supabase
        .from("lead_historico")
        .select("lead_id")
        .eq("tipo_evento", "conversao_cliente")
        .gte("data_evento", from)
        .lte("data_evento", to);

      if (!allConversoes?.length) return [];

      const leadIds = [...new Set(allConversoes.map(c => c.lead_id))];
      const { data: leads } = await supabase.from("leads").select("id, responsavel_id").in("id", leadIds);
      const leadResponsavel: Record<string, string | null> = {};
      leads?.forEach(l => { leadResponsavel[l.id] = l.responsavel_id; });

      const countByUser: Record<string, number> = {};
      allConversoes.forEach(c => {
        const resp = leadResponsavel[c.lead_id];
        if (resp) countByUser[resp] = (countByUser[resp] || 0) + 1;
      });

      const userIds = Object.keys(countByUser);
      if (!userIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome")
        .in("id", userIds);

      const nameMap: Record<string, string> = {};
      profiles?.forEach(p => { nameMap[p.id] = p.nome; });

      return Object.entries(countByUser)
        .map(([uid, count]) => ({ uid, nome: nameMap[uid] || "—", conversoes: count }))
        .sort((a, b) => b.conversoes - a.conversoes);
    },
  });

  // Metrics
  const totalLeads = leadsRecebidos.length;
  const totalConversoes = conversoes.length;
  const totalTransferencias = transferencias.length;
  const totalInteracoes = interacoes.length;
  const taxaConversao = totalLeads > 0 ? ((totalConversoes / totalLeads) * 100) : 0;
  const mediaTentativasPorConversao = totalConversoes > 0 ? (totalInteracoes / totalConversoes) : 0;

  // Ranking position
  const myRankingPos = useMemo(() => {
    if (!profileId || !ranking.length) return null;
    const idx = ranking.findIndex(r => r.uid === profileId);
    if (idx === -1) return { position: ranking.length + 1, total: ranking.length + 1 };
    return { position: idx + 1, total: ranking.length };
  }, [ranking, profileId]);

  // Chart: conversions per week/day
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
        <MetricCard icon={<Users className="w-4 h-4" />} label="Leads Recebidos" value={totalLeads} />
        <MetricCard icon={<Target className="w-4 h-4" />} label="Convertidos" value={totalConversoes} accent />
        <MetricCard icon={<ArrowRightLeft className="w-4 h-4" />} label="Transferências" value={totalTransferencias} />
        <MetricCard icon={<Phone className="w-4 h-4" />} label="Tentativas" value={totalInteracoes} />
        <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Taxa Conversão" value={`${taxaConversao.toFixed(1)}%`} accent />
        <MetricCard icon={<BarChart3 className="w-4 h-4" />} label="Média Tent./Conv." value={mediaTentativasPorConversao.toFixed(1)} />
      </div>

      {/* Ranking + Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ranking */}
        <div className="bg-card border border-border rounded-lg shadow-card">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Trophy className="w-4 h-4 text-primary" />
            <h2 className="text-body font-semibold text-foreground">Ranking de Conversões</h2>
            {myRankingPos && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {myRankingPos.position}º/{myRankingPos.total}
              </Badge>
            )}
          </div>
          <div className="p-4">
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conversão no período</p>
            ) : (
              <div className="space-y-2">
                {ranking.slice(0, 10).map((r, idx) => {
                  const isMe = r.uid === profileId;
                  return (
                    <div key={r.uid} className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm",
                      isMe ? "bg-primary/10 border border-primary/20" : "bg-muted/50"
                    )}>
                      <span className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                        idx === 0 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
                        idx === 1 ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" :
                        idx === 2 ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {idx + 1}
                      </span>
                      <span className={cn("flex-1 font-medium", isMe && "text-primary")}>{r.nome} {isMe && "(Você)"}</span>
                      <Badge variant={isMe ? "default" : "secondary"} className="text-xs">{r.conversoes}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
