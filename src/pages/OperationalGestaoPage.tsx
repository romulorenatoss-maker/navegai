import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_CONFIG, CONTINGENCY_STATUS, calculateOperationalScore } from "@/hooks/useOperationalScoring";
import { BarChart3, AlertTriangle, CheckCircle2, Clock, Users, TrendingUp } from "lucide-react";

export default function OperationalGestaoPage() {
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [periodoFim, setPeriodoFim] = useState(new Date().toISOString().slice(0, 10));
  const [filtroSetor, setFiltroSetor] = useState("todos");
  const [filtroColaborador, setFiltroColaborador] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: assignments = [] } = useQuery({
    queryKey: ["gestao_assignments", periodoInicio, periodoFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_assignments")
        .select("*, operational_templates(nome, tipo_execucao, setor_id, setores(nome), horario_limite_execucao), profiles!operational_assignments_responsavel_id_fkey(id, nome)")
        .gte("data_prevista", periodoInicio)
        .lte("data_prevista", periodoFim)
        .order("data_prevista", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: contingencies = [] } = useQuery({
    queryKey: ["gestao_contingencies", periodoInicio, periodoFim],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_contingencies")
        .select("*, operational_assignments(data_prevista, operational_templates(nome)), profiles!operational_contingencies_responsavel_id_fkey(nome)")
        .gte("created_at", periodoInicio)
        .lte("created_at", periodoFim + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    return assignments.filter((a: any) => {
      if (filtroSetor !== "todos" && a.operational_templates?.setor_id !== filtroSetor) return false;
      if (filtroColaborador !== "todos" && a.responsavel_id !== filtroColaborador) return false;
      if (filtroStatus !== "todos" && a.status !== filtroStatus) return false;
      return true;
    });
  }, [assignments, filtroSetor, filtroColaborador, filtroStatus]);

  // Metrics
  const metrics = useMemo(() => {
    const total = filtered.length;
    const concluidas = filtered.filter((a: any) => a.status === "concluida").length;
    const atrasadas = filtered.filter((a: any) => a.status === "atrasada" || (a.data_prevista < new Date().toISOString().slice(0, 10) && !["concluida", "nao_executada"].includes(a.status))).length;
    const naoExecutadas = filtered.filter((a: any) => a.status === "nao_executada").length;
    const contingenciasAbertas = contingencies.filter((c: any) => ["aberta", "em_andamento"].includes(c.status)).length;
    const contingenciasVencidas = contingencies.filter((c: any) => c.status === "aberta" && c.prazo_sla && new Date(c.prazo_sla) < new Date()).length;
    const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0;
    const slaContingencias = contingencies.length > 0
      ? Math.round((contingencies.filter((c: any) => c.status === "validada" || c.status === "resolvida").length / contingencies.length) * 100)
      : 100;
    return { total, concluidas, atrasadas, naoExecutadas, contingenciasAbertas, contingenciasVencidas, taxaConclusao, slaContingencias };
  }, [filtered, contingencies]);

  // Rankings
  const rankings = useMemo(() => {
    const byUser: Record<string, { nome: string; total: number; concluidas: number; noPrazo: number; scoreSum: number }> = {};
    filtered.forEach((a: any) => {
      const uid = a.responsavel_id;
      if (!uid) return;
      if (!byUser[uid]) byUser[uid] = { nome: a.profiles?.nome || "—", total: 0, concluidas: 0, noPrazo: 0, scoreSum: 0 };
      byUser[uid].total++;
      if (a.status === "concluida") {
        byUser[uid].concluidas++;
        const noPrazo = a.fim_em && a.horario_limite ? new Date(a.fim_em).toTimeString() <= a.horario_limite : true;
        if (noPrazo) byUser[uid].noPrazo++;
        const score = calculateOperationalScore({
          prazoLimite: a.data_prevista + "T" + (a.horario_limite || "23:59") + ":00",
          fimEm: a.fim_em, status: a.status,
          totalItens: 1, itensConformes: 1,
          evidenciaValidada: null,
          totalContingencias: 0, contingenciasNoPrazo: 0,
        });
        byUser[uid].scoreSum += score.scoreFinal;
      }
    });
    return Object.entries(byUser)
      .map(([id, u]) => ({ id, ...u, scoreMedio: u.concluidas > 0 ? Math.round(u.scoreSum / u.concluidas) : 0, taxa: u.total > 0 ? Math.round((u.concluidas / u.total) * 100) : 0 }))
      .sort((a, b) => b.scoreMedio - a.scoreMedio);
  }, [filtered]);

  const MetricCard = ({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color?: string }) => (
    <div className="bg-card border border-border rounded-lg p-4 shadow-card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
        <span className="text-caption text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground font-tabular">{value}</p>
      {sub && <p className="text-caption text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">Gestão Operacional</h1>
        <p className="text-body text-muted-foreground">Acompanhe performance, SLA e conformidade das rotinas.</p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card mb-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-caption">De</Label>
            <Input type="date" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Até</Label>
            <Input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Setor</Label>
            <Select value={filtroSetor} onValueChange={setFiltroSetor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Colaborador</Label>
            <Select value={filtroColaborador} onValueChange={setFiltroColaborador}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-caption">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard icon={BarChart3} label="Total Rotinas" value={metrics.total} sub={`${metrics.taxaConclusao}% concluídas`} />
        <MetricCard icon={CheckCircle2} label="Concluídas" value={metrics.concluidas} color="text-green-600" />
        <MetricCard icon={Clock} label="Em Atraso" value={metrics.atrasadas} color="text-orange-600" />
        <MetricCard icon={AlertTriangle} label="Contingências" value={metrics.contingenciasAbertas} sub={`${metrics.contingenciasVencidas} vencidas`} color="text-red-600" />
      </div>

      <Tabs defaultValue="ranking">
        <TabsList className="mb-4">
          <TabsTrigger value="ranking"><Users className="w-3 h-3 mr-1" />Ranking</TabsTrigger>
          <TabsTrigger value="rotinas"><BarChart3 className="w-3 h-3 mr-1" />Rotinas</TabsTrigger>
          <TabsTrigger value="contingencias"><AlertTriangle className="w-3 h-3 mr-1" />Contingências</TabsTrigger>
        </TabsList>

        {/* Ranking */}
        <TabsContent value="ranking">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">#</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Total</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Concluídas</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Taxa</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Score Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rankings.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sem dados no período.</td></tr>
                ) : rankings.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-caption font-medium text-muted-foreground">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                    </td>
                    <td className="px-4 py-3 text-body font-medium text-foreground">{r.nome}</td>
                    <td className="px-4 py-3 text-center text-body font-tabular">{r.total}</td>
                    <td className="px-4 py-3 text-center text-body font-tabular">{r.concluidas}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${r.taxa >= 80 ? "badge-complete" : r.taxa >= 50 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200"}`}>
                        {r.taxa}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${r.scoreMedio >= 80 ? "badge-complete" : r.scoreMedio >= 50 ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-red-100 text-red-800 border-red-200"}`}>
                        {r.scoreMedio}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Rotinas */}
        <TabsContent value="rotinas">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Rotina</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Responsável</th>
                    <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Data</th>
                    <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Status</th>
                    <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Tempo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sem rotinas no período.</td></tr>
                  ) : filtered.slice(0, 100).map((a: any) => {
                    const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pendente;
                    return (
                      <tr key={a.id} className="hover:bg-muted/50">
                        <td className="px-4 py-3 text-body font-medium text-foreground">{a.operational_templates?.nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.profiles?.nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.data_prevista}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${sc.class}`}>{sc.label}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-body font-tabular">{a.tempo_gasto_minutos ? `${a.tempo_gasto_minutos}min` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Contingências */}
        <TabsContent value="contingencias">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Descrição</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Rotina</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase px-4 py-2">Responsável</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">SLA</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contingencies.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sem contingências no período.</td></tr>
                ) : contingencies.map((c: any) => {
                  const sc = CONTINGENCY_STATUS[c.status] || CONTINGENCY_STATUS.aberta;
                  const isVencida = c.prazo_sla && new Date(c.prazo_sla) < new Date() && c.status === "aberta";
                  return (
                    <tr key={c.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-body text-foreground max-w-[200px] truncate">{c.descricao}</td>
                      <td className="px-4 py-3 text-body text-muted-foreground">{c.operational_assignments?.operational_templates?.nome || "—"}</td>
                      <td className="px-4 py-3 text-body text-muted-foreground">{c.profiles?.nome || "—"}</td>
                      <td className="px-4 py-3 text-center text-caption">{c.prazo_sla ? new Date(c.prazo_sla).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${isVencida ? CONTINGENCY_STATUS.vencida.class : sc.class}`}>
                          {isVencida ? "Vencida" : sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
