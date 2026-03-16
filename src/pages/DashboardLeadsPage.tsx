import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  UserPlus, PhoneCall, CheckCircle2, ArrowRightLeft,
  TrendingUp, Clock, Users, Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Fetch helpers ───
const fetchLeadsAggregated = async () => {
  const today = new Date();
  const startToday = startOfDay(today).toISOString();
  const endToday = endOfDay(today).toISOString();

  const [
    { count: totalLeads },
    { count: leadsHoje },
    { count: emAtendimento },
    { count: convertidos },
    { count: convertidosHoje },
    { count: tentativas },
    { count: tentativasHoje },
    { data: statusBreakdown },
    { count: leadsSemana },
    { count: leadsMes },
    { data: topObjecoes },
  ] = await Promise.all([
    supabase.from("leads").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .gte("data_criacao", startToday).lte("data_criacao", endToday),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .eq("status_lead", "em_atendimento"),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .eq("status_lead", "convertido"),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .eq("status_lead", "convertido")
      .gte("updated_at", startToday).lte("updated_at", endToday),
    supabase.from("lead_interacoes").select("*", { count: "exact", head: true }),
    supabase.from("lead_interacoes").select("*", { count: "exact", head: true })
      .gte("data_interacao", startToday).lte("data_interacao", endToday),
    supabase.from("leads").select("status_lead"),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .gte("data_criacao", startOfWeek(today, { weekStartsOn: 1 }).toISOString())
      .lte("data_criacao", endOfWeek(today, { weekStartsOn: 1 }).toISOString()),
    supabase.from("leads").select("*", { count: "exact", head: true })
      .gte("data_criacao", startOfMonth(today).toISOString())
      .lte("data_criacao", endOfMonth(today).toISOString()),
    supabase.from("registro_objecao_lead").select("objecao_id, lead_objecoes(descricao)"),
  ]);

  // Aggregate status breakdown
  const statusCounts: Record<string, number> = {};
  (statusBreakdown || []).forEach((l) => {
    statusCounts[l.status_lead] = (statusCounts[l.status_lead] || 0) + 1;
  });

  // Aggregate objeções
  const objecaoCounts: Record<string, number> = {};
  (topObjecoes || []).forEach((o: any) => {
    const desc = o.lead_objecoes?.descricao || "Outra";
    objecaoCounts[desc] = (objecaoCounts[desc] || 0) + 1;
  });

  const taxaConversao = (totalLeads || 0) > 0
    ? ((convertidos || 0) / (totalLeads || 1) * 100).toFixed(1)
    : "0.0";

  return {
    totalLeads: totalLeads || 0,
    leadsHoje: leadsHoje || 0,
    emAtendimento: emAtendimento || 0,
    convertidos: convertidos || 0,
    convertidosHoje: convertidosHoje || 0,
    tentativas: tentativas || 0,
    tentativasHoje: tentativasHoje || 0,
    taxaConversao,
    statusCounts,
    leadsSemana: leadsSemana || 0,
    leadsMes: leadsMes || 0,
    objecaoCounts,
  };
};

const fetchOSAguardando = async () => {
  const { count } = await supabase.from("ordens_servico")
    .select("*", { count: "exact", head: true })
    .eq("status", "aguardando_numero");
  return count || 0;
};

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, subValue, color, delay = 0 }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="bg-card rounded-xl border border-border p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
      </div>
    </motion.div>
  );
}

// ─── Status bar ───
function StatusBar({ statusCounts, total }: { statusCounts: Record<string, number>; total: number }) {
  const statuses = [
    { key: "novo", label: "Novos", color: "bg-blue-500" },
    { key: "em_atendimento", label: "Em Atendimento", color: "bg-amber-500" },
    { key: "convertido", label: "Convertidos", color: "bg-emerald-500" },
    { key: "sem_interesse", label: "Sem Interesse", color: "bg-red-400" },
    { key: "perdido", label: "Perdidos", color: "bg-gray-400" },
  ];

  if (total === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.3 }}
      className="bg-card rounded-xl border border-border p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição por Status</h3>
      <div className="h-4 rounded-full overflow-hidden flex bg-muted">
        {statuses.map((s) => {
          const count = statusCounts[s.key] || 0;
          const pct = (count / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={s.key}
              className={`${s.color} transition-all duration-500`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3">
        {statuses.map((s) => {
          const count = statusCounts[s.key] || 0;
          if (count === 0) return null;
          return (
            <div key={s.key} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span>{s.label}: <strong className="text-foreground">{count}</strong></span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Period summary ───
function PeriodSummary({ leadsHoje, leadsSemana, leadsMes }: {
  leadsHoje: number; leadsSemana: number; leadsMes: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.3 }}
      className="bg-card rounded-xl border border-border p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-foreground mb-4">Leads por Período</h3>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Hoje", value: leadsHoje },
          { label: "Esta Semana", value: leadsSemana },
          { label: "Este Mês", value: leadsMes },
        ].map((p) => (
          <div key={p.label} className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold text-foreground">{p.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{p.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Page ───
export default function DashboardLeadsPage() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-leads-metrics"],
    queryFn: fetchLeadsAggregated,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    staleTime: 60 * 1000,
  });

  const { data: osAguardando } = useQuery({
    queryKey: ["dashboard-leads-os-aguardando"],
    queryFn: fetchOSAguardando,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const m = metrics || {
    totalLeads: 0, leadsHoje: 0, emAtendimento: 0, convertidos: 0,
    convertidosHoje: 0, tentativas: 0, tentativasHoje: 0,
    taxaConversao: "0.0", statusCounts: {}, leadsSemana: 0, leadsMes: 0,
    objecaoCounts: {},
  };

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Painel Operacional de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Dados agregados • Atualização automática a cada 5 min
              {metrics && (
                <span className="ml-2 text-xs opacity-60">
                  Última: {format(new Date(), "HH:mm", { locale: ptBR })}
                </span>
              )}
            </p>
          </div>
          {isLoading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="w-4 h-4 animate-spin" />
              Carregando...
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={UserPlus}
            label="Leads Recebidos Hoje"
            value={m.leadsHoje}
            subValue={`${m.totalLeads} total`}
            color="bg-primary/10 text-primary"
            delay={0}
          />
          <KpiCard
            icon={PhoneCall}
            label="Em Atendimento"
            value={m.emAtendimento}
            subValue={`${m.statusCounts["novo"] || 0} aguardando`}
            color="bg-amber-500/10 text-amber-600"
            delay={0.1}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Convertidos"
            value={m.convertidos}
            subValue={`${m.convertidosHoje} hoje`}
            color="bg-emerald-500/10 text-emerald-600"
            delay={0.2}
          />
          <KpiCard
            icon={ArrowRightLeft}
            label="Tentativas Realizadas"
            value={m.tentativas}
            subValue={`${m.tentativasHoje} hoje`}
            color="bg-violet-500/10 text-violet-600"
            delay={0.3}
          />
        </div>

        {/* Second row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={Target}
            label="Taxa de Conversão"
            value={`${m.taxaConversao}%`}
            color="bg-emerald-500/10 text-emerald-600"
            delay={0.15}
          />
          <KpiCard
            icon={TrendingUp}
            label="OS Aguardando Número"
            value={osAguardando || 0}
            subValue="Geradas por conversão"
            color="bg-orange-500/10 text-orange-600"
            delay={0.25}
          />
          <KpiCard
            icon={Users}
            label="Leads Sem Interesse"
            value={m.statusCounts["sem_interesse"] || 0}
            color="bg-red-400/10 text-red-500"
            delay={0.35}
          />
          <KpiCard
            icon={Clock}
            label="Leads Perdidos"
            value={m.statusCounts["perdido"] || 0}
            color="bg-muted text-muted-foreground"
            delay={0.45}
          />
        </div>

        {/* Charts area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusBar statusCounts={m.statusCounts} total={m.totalLeads} />
          <PeriodSummary
            leadsHoje={m.leadsHoje}
            leadsSemana={m.leadsSemana}
            leadsMes={m.leadsMes}
          />
          {/* Top Objeções */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.3 }}
            className="bg-card rounded-xl border border-border p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-foreground mb-4">Principais Objeções</h3>
            {Object.keys(m.objecaoCounts).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Nenhuma objeção registrada</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(m.objecaoCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5).map(([desc, count]) => (
                  <div key={desc} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{desc}</span>
                    <span className="text-sm font-bold text-foreground">{count as number}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
