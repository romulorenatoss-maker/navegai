import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  UserPlus, PhoneCall, CheckCircle2, ArrowRightLeft,
  TrendingUp, Clock, Users, Target, AlertTriangle, X, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

// ─── Types ───
interface DrillDownConfig {
  title: string;
  filter: string;
  filterValue?: string;
}

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

  const statusCounts: Record<string, number> = {};
  (statusBreakdown || []).forEach((l) => {
    statusCounts[l.status_lead] = (statusCounts[l.status_lead] || 0) + 1;
  });

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

// ─── Status label map ───
const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_contato: "Em Contato",
  em_atendimento: "Em Atendimento",
  interessado: "Interessado",
  convertido: "Convertido",
  sem_interesse: "Sem Interesse",
  perdido: "Perdido",
  arquivado: "Arquivado",
  aguardando_decisao_avaliador: "Aguardando Avaliador",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  em_contato: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  em_atendimento: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  interessado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  convertido: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  sem_interesse: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  perdido: "bg-muted text-muted-foreground",
  arquivado: "bg-muted text-muted-foreground",
  aguardando_decisao_avaliador: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// ─── Drill-Down Dialog ───
function DrillDownDialog({
  open,
  onClose,
  config,
}: {
  open: boolean;
  onClose: () => void;
  config: DrillDownConfig | null;
}) {
  const navigate = useNavigate();

  const { data: drillData, isLoading } = useQuery({
    queryKey: ["drill-down", config?.filter, config?.filterValue],
    enabled: open && !!config,
    queryFn: async () => {
      if (!config) return { leads: [], interacoes: [], os: [] };

      const today = new Date();
      const startToday = startOfDay(today).toISOString();
      const endToday = endOfDay(today).toISOString();

      // Leads drill-down
      if (config.filter === "leads_hoje") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, responsavel_id")
          .gte("data_criacao", startToday).lte("data_criacao", endToday).order("data_criacao", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "leads_semana") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, responsavel_id")
          .gte("data_criacao", startOfWeek(today, { weekStartsOn: 1 }).toISOString())
          .lte("data_criacao", endOfWeek(today, { weekStartsOn: 1 }).toISOString())
          .order("data_criacao", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "leads_mes") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, responsavel_id")
          .gte("data_criacao", startOfMonth(today).toISOString())
          .lte("data_criacao", endOfMonth(today).toISOString())
          .order("data_criacao", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "status") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, updated_at, responsavel_id")
          .eq("status_lead", config.filterValue || "").order("updated_at", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "convertidos") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, updated_at, responsavel_id")
          .eq("status_lead", "convertido").order("updated_at", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "convertidos_hoje") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, updated_at, responsavel_id")
          .eq("status_lead", "convertido")
          .gte("updated_at", startToday).lte("updated_at", endToday)
          .order("updated_at", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "total_leads") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, responsavel_id")
          .order("data_criacao", { ascending: false }).limit(100);
        return { leads: data || [], type: "leads" };
      }
      if (config.filter === "tentativas") {
        const { data } = await supabase.from("lead_interacoes")
          .select("id, lead_id, tipo_contato, resultado, data_interacao, colaborador_id, leads(nome)")
          .order("data_interacao", { ascending: false }).limit(100);
        return { interacoes: data || [], type: "interacoes" };
      }
      if (config.filter === "tentativas_hoje") {
        const { data } = await supabase.from("lead_interacoes")
          .select("id, lead_id, tipo_contato, resultado, data_interacao, colaborador_id, leads(nome)")
          .gte("data_interacao", startToday).lte("data_interacao", endToday)
          .order("data_interacao", { ascending: false });
        return { interacoes: data || [], type: "interacoes" };
      }
      if (config.filter === "os_aguardando") {
        const { data } = await supabase.from("ordens_servico")
          .select("id, numero_os, cliente_nome, cliente_cpf, data_abertura, atendente_id")
          .eq("status", "aguardando_numero")
          .order("data_abertura", { ascending: false });
        return { os: data || [], type: "os" };
      }
      if (config.filter === "objecao") {
        const { data } = await supabase.from("registro_objecao_lead")
          .select("id, lead_id, data_registro, colaborador_id, lead_objecoes(descricao), leads(nome)")
          .order("data_registro", { ascending: false }).limit(100);
        const filtered = config.filterValue
          ? (data || []).filter((o: any) => o.lead_objecoes?.descricao === config.filterValue)
          : data || [];
        return { objecoes: filtered, type: "objecoes" };
      }
      if (config.filter === "taxa_conversao") {
        const { data } = await supabase.from("leads").select("id, nome, status_lead, data_criacao, updated_at, responsavel_id")
          .eq("status_lead", "convertido").order("updated_at", { ascending: false });
        return { leads: data || [], type: "leads" };
      }
      return { leads: [], type: "leads" };
    },
  });

  // Fetch profiles for name resolution
  const { data: profilesList = [] } = useQuery({
    queryKey: ["drill-profiles"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      return data || [];
    },
  });

  const getName = (id: string | null) => {
    if (!id) return "—";
    return profilesList.find((p: any) => p.id === id)?.nome || "—";
  };

  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
  };

  const renderContent = () => {
    if (isLoading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
    if (!drillData) return null;

    const dd = drillData as any;

    if (dd.type === "leads") {
      const leads = dd.leads || [];
      if (leads.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead encontrado</p>;
      return (
        <div className="space-y-1">
          {leads.map((l: any) => (
            <button
              key={l.id}
              onClick={() => { onClose(); navigate(`/leads?id=${l.id}`); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{l.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Criado: {fmtDate(l.data_criacao)} · Responsável: {getName(l.responsavel_id)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <Badge className={`text-[10px] border-0 ${STATUS_COLORS[l.status_lead] || "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABELS[l.status_lead] || l.status_lead}
                </Badge>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (dd.type === "interacoes") {
      const interacoes = dd.interacoes || [];
      if (interacoes.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tentativa encontrada</p>;
      return (
        <div className="space-y-1">
          {interacoes.map((i: any) => (
            <button
              key={i.id}
              onClick={() => { onClose(); navigate(`/leads?id=${i.lead_id}`); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{i.leads?.nome || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(i.data_interacao)} · {i.tipo_contato} · Por: {getName(i.colaborador_id)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {i.resultado && <span className="text-xs text-muted-foreground max-w-[120px] truncate">{i.resultado}</span>}
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (dd.type === "os") {
      const osList = dd.os || [];
      if (osList.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma OS encontrada</p>;
      return (
        <div className="space-y-1">
          {osList.map((os: any) => (
            <div key={os.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">{os.cliente_nome || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  CPF: {os.cliente_cpf || "—"} · Abertura: {fmtDate(os.data_abertura)} · Atendente: {getName(os.atendente_id)}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">{os.numero_os || "Aguardando"}</Badge>
            </div>
          ))}
        </div>
      );
    }

    if (dd.type === "objecoes") {
      const objecoes = dd.objecoes || [];
      if (objecoes.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">Nenhuma objeção encontrada</p>;
      return (
        <div className="space-y-1">
          {objecoes.map((o: any) => (
            <button
              key={o.id}
              onClick={() => { onClose(); navigate(`/leads?id=${o.lead_id}`); }}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-accent/50 transition-colors text-left group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{o.leads?.nome || "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(o.data_registro)} · Objeção: {o.lead_objecoes?.descricao || "—"}
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-base">{config?.title || "Detalhes"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {renderContent()}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Card ───
function KpiCard({ icon: Icon, label, value, subValue, color, delay = 0, onClick, onSubClick }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
  delay?: number;
  onClick?: () => void;
  onSubClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      onClick={onClick}
      className={`bg-card rounded-xl border border-border p-5 flex items-start gap-4 shadow-sm hover:shadow-md transition-all ${onClick ? "cursor-pointer hover:border-primary/30" : ""}`}
    >
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {subValue && (
          <p
            className={`text-xs text-muted-foreground mt-1 ${onSubClick ? "underline underline-offset-2 cursor-pointer hover:text-foreground" : ""}`}
            onClick={(e) => { if (onSubClick) { e.stopPropagation(); onSubClick(); } }}
          >
            {subValue}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Status bar ───
function StatusBar({ statusCounts, total, onStatusClick }: {
  statusCounts: Record<string, number>; total: number;
  onStatusClick: (status: string, label: string) => void;
}) {
  const statuses = [
    { key: "novo", label: "Novos", color: "bg-blue-500" },
    { key: "em_contato", label: "Em Contato", color: "bg-yellow-500" },
    { key: "em_atendimento", label: "Em Atendimento", color: "bg-amber-500" },
    { key: "interessado", label: "Interessados", color: "bg-teal-500" },
    { key: "convertido", label: "Convertidos", color: "bg-emerald-500" },
    { key: "sem_interesse", label: "Sem Interesse", color: "bg-red-400" },
    { key: "perdido", label: "Perdidos", color: "bg-gray-400" },
    { key: "arquivado", label: "Arquivados", color: "bg-gray-300" },
    { key: "aguardando_decisao_avaliador", label: "Aguardando Avaliador", color: "bg-orange-400" },
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
              className={`${s.color} transition-all duration-500 cursor-pointer hover:opacity-80`}
              style={{ width: `${pct}%` }}
              title={`${s.label}: ${count} (${pct.toFixed(1)}%)`}
              onClick={() => onStatusClick(s.key, s.label)}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3">
        {statuses.map((s) => {
          const count = statusCounts[s.key] || 0;
          if (count === 0) return null;
          return (
            <button
              key={s.key}
              onClick={() => onStatusClick(s.key, s.label)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span>{s.label}: <strong className="text-foreground">{count}</strong></span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Period summary ───
function PeriodSummary({ leadsHoje, leadsSemana, leadsMes, onPeriodClick }: {
  leadsHoje: number; leadsSemana: number; leadsMes: number;
  onPeriodClick: (filter: string, title: string) => void;
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
          { label: "Hoje", value: leadsHoje, filter: "leads_hoje" },
          { label: "Esta Semana", value: leadsSemana, filter: "leads_semana" },
          { label: "Este Mês", value: leadsMes, filter: "leads_mes" },
        ].map((p) => (
          <button
            key={p.label}
            onClick={() => onPeriodClick(p.filter, `Leads — ${p.label}`)}
            className="text-center p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
          >
            <p className="text-2xl font-bold text-foreground">{p.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{p.label}</p>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Page ───
export default function DashboardLeadsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [drillDown, setDrillDown] = useState<DrillDownConfig | null>(null);

  const { data: metrics, isLoading } = useQuery({
    queryKey: ["dashboard-leads-metrics"],
    queryFn: fetchLeadsAggregated,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const { data: osAguardando } = useQuery({
    queryKey: ["dashboard-leads-os-aguardando"],
    queryFn: fetchOSAguardando,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const { data: meusAtrasos = [] } = useQuery({
    queryKey: ["dashboard-meus-atrasos", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_tarefas_contato")
        .select("id, lead_id, tentativa, data_contato, periodo")
        .eq("status", "atrasado")
        .eq("responsavel_id", profile!.id);
      if (error) throw error;
      const leadIds = [...new Set((data || []).map((t) => t.lead_id))];
      if (leadIds.length === 0) return [];
      const { data: leads } = await supabase.from("leads").select("id, nome").in("id", leadIds);
      return (data || []).map((t) => ({
        ...t,
        lead_nome: leads?.find((l) => l.id === t.lead_id)?.nome || "—",
      }));
    },
    refetchInterval: 60_000,
  });

  const m = metrics || {
    totalLeads: 0, leadsHoje: 0, emAtendimento: 0, convertidos: 0,
    convertidosHoje: 0, tentativas: 0, tentativasHoje: 0,
    taxaConversao: "0.0", statusCounts: {}, leadsSemana: 0, leadsMes: 0,
    objecaoCounts: {},
  };

  const openDrill = (filter: string, title: string, filterValue?: string) => {
    setDrillDown({ title, filter, filterValue });
  };

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Painel Operacional de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Dados agregados • Clique nos indicadores para ver detalhes
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

        {/* Atrasos Alert */}
        {meusAtrasos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-destructive/10 border border-destructive/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <h3 className="text-sm font-semibold text-destructive">
                Você possui {meusAtrasos.length} tentativa(s) atrasada(s)
              </h3>
              <button
                onClick={() => navigate("/leads/fila-tarefas")}
                className="ml-auto text-xs font-medium text-destructive underline underline-offset-2 hover:opacity-80"
              >
                Ver na Fila de Tarefas →
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {meusAtrasos.slice(0, 8).map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => navigate("/leads/fila-tarefas")}
                  className="text-xs px-2 py-1 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                >
                  {a.lead_nome} • Tentativa {a.tentativa}
                </button>
              ))}
              {meusAtrasos.length > 8 && (
                <span className="text-xs text-destructive/70 self-center">+{meusAtrasos.length - 8} mais</span>
              )}
            </div>
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={UserPlus}
            label="Leads Recebidos Hoje"
            value={m.leadsHoje}
            subValue={`${m.totalLeads} total`}
            color="bg-primary/10 text-primary"
            delay={0}
            onClick={() => openDrill("leads_hoje", "Leads Recebidos Hoje")}
            onSubClick={() => openDrill("total_leads", "Todos os Leads (últimos 100)")}
          />
          <KpiCard
            icon={PhoneCall}
            label="Em Atendimento"
            value={m.emAtendimento}
            subValue={`${m.statusCounts["novo"] || 0} aguardando`}
            color="bg-amber-500/10 text-amber-600"
            delay={0.1}
            onClick={() => openDrill("status", "Leads Em Atendimento", "em_atendimento")}
            onSubClick={() => openDrill("status", "Leads Novos (Aguardando)", "novo")}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Convertidos"
            value={m.convertidos}
            subValue={`${m.convertidosHoje} hoje`}
            color="bg-emerald-500/10 text-emerald-600"
            delay={0.2}
            onClick={() => openDrill("convertidos", "Leads Convertidos")}
            onSubClick={() => openDrill("convertidos_hoje", "Convertidos Hoje")}
          />
          <KpiCard
            icon={ArrowRightLeft}
            label="Tentativas Realizadas"
            value={m.tentativas}
            subValue={`${m.tentativasHoje} hoje`}
            color="bg-violet-500/10 text-violet-600"
            delay={0.3}
            onClick={() => openDrill("tentativas", "Tentativas Realizadas (últimas 100)")}
            onSubClick={() => openDrill("tentativas_hoje", "Tentativas de Hoje")}
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
            onClick={() => openDrill("taxa_conversao", "Leads Convertidos (Taxa de Conversão)")}
          />
          <KpiCard
            icon={TrendingUp}
            label="OS Aguardando Número"
            value={osAguardando || 0}
            subValue="Geradas por conversão"
            color="bg-orange-500/10 text-orange-600"
            delay={0.25}
            onClick={() => openDrill("os_aguardando", "OS Aguardando Número")}
          />
          <KpiCard
            icon={Users}
            label="Leads Sem Interesse"
            value={m.statusCounts["sem_interesse"] || 0}
            color="bg-red-400/10 text-red-500"
            delay={0.35}
            onClick={() => openDrill("status", "Leads Sem Interesse", "sem_interesse")}
          />
          <KpiCard
            icon={Clock}
            label="Leads Perdidos"
            value={m.statusCounts["perdido"] || 0}
            color="bg-muted text-muted-foreground"
            delay={0.45}
            onClick={() => openDrill("status", "Leads Perdidos", "perdido")}
          />
        </div>

        {/* Charts area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatusBar
            statusCounts={m.statusCounts}
            total={m.totalLeads}
            onStatusClick={(key, label) => openDrill("status", `Leads — ${label}`, key)}
          />
          <PeriodSummary
            leadsHoje={m.leadsHoje}
            leadsSemana={m.leadsSemana}
            leadsMes={m.leadsMes}
            onPeriodClick={openDrill}
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
                  <button
                    key={desc}
                    onClick={() => openDrill("objecao", `Objeção: ${desc}`, desc)}
                    className="w-full flex items-center justify-between hover:bg-accent/50 rounded-md px-2 py-1.5 transition-colors cursor-pointer"
                  >
                    <span className="text-xs text-muted-foreground truncate max-w-[160px]">{desc}</span>
                    <span className="text-sm font-bold text-foreground">{count as number}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Drill-Down Dialog */}
      <DrillDownDialog
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        config={drillDown}
      />
    </div>
  );
}
