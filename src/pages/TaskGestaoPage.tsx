import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Flame, TrendingUp, AlertTriangle, Users, BarChart3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NIVEL_CONFIG, PRIORIDADE_CONFIG } from "@/hooks/useTaskScoring";

export default function TaskGestaoPage() {
  const [tab, setTab] = useState("ranking");
  const [periodoFilter, setPeriodoFilter] = useState("mensal");
  const [setorFilter, setSetorFilter] = useState("todos");

  const { data: allAssignments = [] } = useQuery({
    queryKey: ["gestao_assignments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_assignments")
        .select("*, task_templates(titulo, prioridade, dificuldade, pontuacao_base, setores(id, nome)), profiles:responsavel_id(id, nome, setor_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: streaks = [] } = useQuery({
    queryKey: ["all_streaks"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("task_user_streaks").select("*, profiles:profile_id(id, nome, setor_id, setores(nome))").order("pontuacao_total", { ascending: false });
      if (error) throw error;
      return data || [];
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

  // Period filtering
  const filteredAssignments = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (periodoFilter === "semanal") {
      start = new Date(now); start.setDate(now.getDate() - 7);
    } else if (periodoFilter === "mensal") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      start = new Date(0);
    }

    return allAssignments.filter((a: any) => {
      const dateOk = new Date(a.created_at) >= start;
      const setorOk = setorFilter === "todos" || a.task_templates?.setores?.id === setorFilter;
      return dateOk && setorOk;
    });
  }, [allAssignments, periodoFilter, setorFilter]);

  // Rankings
  const ranking = useMemo(() => {
    const map = new Map<string, { nome: string; setor: string; pts: number; concluidas: number; atrasadas: number; total: number }>();
    filteredAssignments.forEach((a: any) => {
      const pid = a.profiles?.id;
      if (!pid) return;
      if (!map.has(pid)) map.set(pid, { nome: a.profiles.nome, setor: "", pts: 0, concluidas: 0, atrasadas: 0, total: 0 });
      const r = map.get(pid)!;
      r.total++;
      if (a.status === "concluida") { r.concluidas++; r.pts += a.pontuacao_obtida || 0; }
      if (a.status === "atrasada" || a.status === "nao_executada") r.atrasadas++;
    });
    return Array.from(map.values()).sort((a, b) => b.pts - a.pts);
  }, [filteredAssignments]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredAssignments.length;
    const concluidas = filteredAssignments.filter((a: any) => a.status === "concluida").length;
    const atrasadas = filteredAssignments.filter((a: any) => ["atrasada", "nao_executada"].includes(a.status)).length;
    const pendentes = filteredAssignments.filter((a: any) => ["pendente", "em_andamento"].includes(a.status)).length;
    const bloqueadas = filteredAssignments.filter((a: any) => a.status === "bloqueada").length;
    const mediaPts = concluidas > 0 ? Math.round(filteredAssignments.filter((a: any) => a.status === "concluida").reduce((s: number, a: any) => s + (a.pontuacao_obtida || 0), 0) / concluidas) : 0;
    return { total, concluidas, atrasadas, pendentes, bloqueadas, mediaPts };
  }, [filteredAssignments]);

  const medalPositions = ["🥇", "🥈", "🥉"];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-section font-semibold text-foreground">Gestão de Tarefas</h1>
          <p className="text-body text-muted-foreground">Rankings, métricas e acompanhamento de performance.</p>
        </div>
        <div className="flex gap-3">
          <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="semanal">Semanal</SelectItem>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={setorFilter} onValueChange={setSetorFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Todos setores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos setores</SelectItem>
              {setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total", value: stats.total, icon: BarChart3, color: "text-foreground" },
          { label: "Concluídas", value: stats.concluidas, icon: Trophy, color: "text-green-600" },
          { label: "Atrasadas", value: stats.atrasadas, icon: AlertTriangle, color: "text-red-500" },
          { label: "Pendentes", value: stats.pendentes, icon: TrendingUp, color: "text-blue-500" },
          { label: "Bloqueadas", value: stats.bloqueadas, icon: AlertTriangle, color: "text-orange-500" },
          { label: "Média Pts", value: stats.mediaPts, icon: Flame, color: "text-primary" },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-3 text-center">
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
            <p className={`text-lg font-bold font-tabular ${s.color}`}>{s.value}</p>
            <p className="text-caption text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="ranking">🏆 Ranking</TabsTrigger>
          <TabsTrigger value="niveis">⭐ Níveis</TabsTrigger>
          <TabsTrigger value="atrasadas">⚠️ Atrasadas</TabsTrigger>
        </TabsList>

        <TabsContent value="ranking">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-12">#</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pontos</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Concluídas</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Atrasadas</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Eficiência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ranking.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Sem dados no período selecionado.</td></tr>
                ) : ranking.slice(0, 20).map((r, i) => (
                  <tr key={i} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-center text-body font-tabular">{i < 3 ? medalPositions[i] : i + 1}</td>
                    <td className="px-4 py-3 text-body font-medium text-foreground">{r.nome}</td>
                    <td className="px-4 py-3 text-center text-body font-bold text-primary font-tabular">{r.pts}</td>
                    <td className="px-4 py-3 text-center text-body font-tabular text-green-600">{r.concluidas}</td>
                    <td className="px-4 py-3 text-center text-body font-tabular text-red-500">{r.atrasadas}</td>
                    <td className="px-4 py-3 text-center text-body font-tabular">
                      {r.total > 0 ? `${Math.round((r.concluidas / r.total) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="niveis">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Colaborador</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nível</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Pts Total</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Streak</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Máx. Streak</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {streaks.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Sem dados de nível.</td></tr>
                ) : streaks.map((s: any) => {
                  const nv = NIVEL_CONFIG[s.nivel] || NIVEL_CONFIG.bronze;
                  return (
                    <tr key={s.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-body font-medium text-foreground">{s.profiles?.nome || "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold ${nv.color}`}>{nv.icon} {nv.label}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-body font-bold font-tabular text-primary">{s.pontuacao_total}</td>
                      <td className="px-4 py-3 text-center text-body font-tabular">{s.streak_atual > 0 ? `🔥 ${s.streak_atual}` : "0"}</td>
                      <td className="px-4 py-3 text-center text-body font-tabular">{s.streak_maximo}</td>
                      <td className="px-4 py-3 text-body text-muted-foreground">{s.profiles?.setores?.nome || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="atrasadas">
          <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tarefa</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Responsável</th>
                  <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data Prevista</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Prioridade</th>
                  <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(() => {
                  const late = filteredAssignments.filter((a: any) => ["atrasada", "nao_executada"].includes(a.status));
                  if (late.length === 0) return <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma tarefa atrasada! 🎉</td></tr>;
                  return late.map((a: any) => {
                    const prio = PRIORIDADE_CONFIG[a.task_templates?.prioridade] || PRIORIDADE_CONFIG.media;
                    return (
                      <tr key={a.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-body font-medium text-foreground">{a.task_templates?.titulo || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.profiles?.nome || "—"}</td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{a.data_prevista}</td>
                        <td className="px-4 py-3 text-center"><span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${prio.class}`}>{prio.label}</span></td>
                        <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-expired">{a.status === "nao_executada" ? "Não executada" : "Atrasada"}</span></td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
