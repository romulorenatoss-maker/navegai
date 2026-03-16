import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3, TrendingUp, Users, Target, Clock, MessageSquare, Loader2,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo", em_atendimento: "Em Atendimento", convertido: "Convertido",
  sem_interesse: "Sem Interesse", perdido: "Perdido", arquivado: "Arquivado",
  aguardando_decisao_avaliador: "Aguardando Decisão",
};

export default function RelatoriosLeadsPage() {
  const [periodo, setPeriodo] = useState("30");

  const dataInicio = useMemo(() => subDays(new Date(), parseInt(periodo)).toISOString(), [periodo]);

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["relatorio-leads", periodo],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").gte("data_criacao", dataInicio);
      if (error) throw error;
      return data;
    },
  });

  const { data: interacoes = [] } = useQuery({
    queryKey: ["relatorio-interacoes", periodo],
    queryFn: async () => {
      const { data, error } = await supabase.from("lead_interacoes").select("*").gte("data_interacao", dataInicio);
      if (error) throw error;
      return data;
    },
  });

  const { data: objecoes = [] } = useQuery({
    queryKey: ["relatorio-objecoes", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registro_objecao_lead")
        .select("*, lead_objecoes(descricao)")
        .gte("data_registro", dataInicio);
      if (error) throw error;
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["relatorio-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  // Metrics
  const totalLeads = leads.length;
  const convertidos = leads.filter((l) => l.status_lead === "convertido").length;
  const taxaConversao = totalLeads > 0 ? ((convertidos / totalLeads) * 100).toFixed(1) : "0.0";
  const totalTentativas = interacoes.length;

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  leads.forEach((l) => { statusCounts[l.status_lead] = (statusCounts[l.status_lead] || 0) + 1; });

  // Top objeções
  const objecaoCounts: Record<string, number> = {};
  objecoes.forEach((o: any) => {
    const desc = o.lead_objecoes?.descricao || "Desconhecida";
    objecaoCounts[desc] = (objecaoCounts[desc] || 0) + 1;
  });
  const topObjecoes = Object.entries(objecaoCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Per-avaliador stats
  const avaliadorStats = useMemo(() => {
    const map: Record<string, { nome: string; tentativas: number; conversoes: number }> = {};
    interacoes.forEach((i: any) => {
      if (!map[i.colaborador_id]) {
        const p = profiles.find((p) => p.id === i.colaborador_id);
        map[i.colaborador_id] = { nome: p?.nome || "—", tentativas: 0, conversoes: 0 };
      }
      map[i.colaborador_id].tentativas++;
    });
    leads.filter((l) => l.status_lead === "convertido" && l.responsavel_id).forEach((l) => {
      if (map[l.responsavel_id!]) map[l.responsavel_id!].conversoes++;
    });
    return Object.values(map).sort((a, b) => b.conversoes - a.conversoes);
  }, [interacoes, leads, profiles]);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Relatórios de Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">Análise detalhada do módulo de leads</p>
          </div>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loadingLeads ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10"><Users className="w-4 h-4 text-primary" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total de Leads</p>
                      <p className="text-xl font-bold">{totalLeads}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10"><Target className="w-4 h-4 text-emerald-600" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground">Convertidos</p>
                      <p className="text-xl font-bold">{convertidos}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10"><TrendingUp className="w-4 h-4 text-amber-600" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground">Taxa Conversão</p>
                      <p className="text-xl font-bold">{taxaConversao}%</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-violet-500/10"><Clock className="w-4 h-4 text-violet-600" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground">Tentativas</p>
                      <p className="text-xl font-bold">{totalTentativas}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Status Breakdown */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Distribuição por Status</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between py-1">
                        <span className="text-sm">{STATUS_LABELS[status] || status}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(count / totalLeads) * 100}%` }} />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Top Objeções */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Principais Objeções</CardTitle></CardHeader>
                <CardContent>
                  {topObjecoes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma objeção registrada</p>
                  ) : (
                    <div className="space-y-2">
                      {topObjecoes.map(([desc, count]) => (
                        <div key={desc} className="flex items-center justify-between py-1">
                          <span className="text-sm">{desc}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Per-avaliador */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> Desempenho por Avaliado</CardTitle></CardHeader>
              <CardContent>
                {avaliadorStats.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead className="text-center">Tentativas</TableHead>
                        <TableHead className="text-center">Conversões</TableHead>
                        <TableHead className="text-center">Taxa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {avaliadorStats.map((a, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{a.nome}</TableCell>
                          <TableCell className="text-center">{a.tentativas}</TableCell>
                          <TableCell className="text-center">{a.conversoes}</TableCell>
                          <TableCell className="text-center">
                            {a.tentativas > 0 ? ((a.conversoes / a.tentativas) * 100).toFixed(1) : "0.0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
