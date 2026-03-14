import { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronLeft, CalendarIcon, Filter, Trophy, AlertTriangle,
  Eye, MessageSquare, Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";

function getScoreColor(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

function getScoreBg(score: number) {
  if (score >= 80) return "bg-success/10";
  if (score >= 60) return "bg-warning/10";
  return "bg-destructive/10";
}

function getCompetenceMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }
  return months;
}

export default function DesempenhoColaboradorPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile, isAdmin, hasRole } = useAuth();
  const canViewAll = isAdmin || hasRole("avaliador");

  const profileIdParam = searchParams.get("id");
  const targetProfileId = canViewAll && profileIdParam ? profileIdParam : profile?.id;

  const now = new Date();
  const [competenceMonth, setCompetenceMonth] = useState(format(now, "yyyy-MM"));
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(now));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(now));
  const [selectedOsId, setSelectedOsId] = useState<string | null>(null);

  const handleCompetenceChange = (val: string) => {
    setCompetenceMonth(val);
    const [y, m] = val.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    setStartDate(startOfMonth(d));
    setEndDate(endOfMonth(d));
  };

  const competenceMonths = useMemo(() => getCompetenceMonths(), []);

  // Employee profile
  const { data: targetProfile } = useQuery({
    queryKey: ["perf_profile", targetProfileId],
    queryFn: async () => {
      if (!targetProfileId) return null;
      const { data } = await supabase.from("profiles").select("id, nome, cargo, email, setor_id").eq("id", targetProfileId).single();
      return data;
    },
    enabled: !!targetProfileId,
  });

  // Evaluations where this employee was evaluated (as tecnico or atendente)
  const { data: evaluations = [] } = useQuery({
    queryKey: ["perf_evals", targetProfileId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const from = startDate?.toISOString() || startOfMonth(now).toISOString();
      const to = endDate ? endOfMonth(endDate).toISOString() : endOfMonth(now).toISOString();

      // Get OS where this employee is tecnico or atendente
      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id, numero_os, tipo_servico_id, created_at, cliente_nome, tecnico_id, atendente_id")
        .or(`tecnico_id.eq.${targetProfileId},atendente_id.eq.${targetProfileId},colaborador_avaliado_id.eq.${targetProfileId}`)
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false });

      if (!osData?.length) return [];

      const osIds = osData.map(o => o.id);
      const tsIds = [...new Set(osData.map(o => o.tipo_servico_id).filter(Boolean))] as string[];

      const [avalsRes, tsRes] = await Promise.all([
        supabase.from("avaliacoes").select("id, ordem_servico_id, nota_final, concluida, created_at, tipo_avaliacao_id")
          .in("ordem_servico_id", osIds).eq("concluida", true),
        tsIds.length > 0 ? supabase.from("tipos_servico").select("id, nome").in("id", tsIds) : { data: [] },
      ]);

      const tsMap: Record<string, string> = {};
      tsRes.data?.forEach(t => { tsMap[t.id] = t.nome; });

      const taIds = [...new Set(avalsRes.data?.map(a => a.tipo_avaliacao_id).filter(Boolean))] as string[];
      let taMap: Record<string, string> = {};
      if (taIds.length > 0) {
        const { data: tas } = await supabase.from("tipos_avaliacao").select("id, nome").in("id", taIds);
        tas?.forEach(t => { taMap[t.id] = t.nome; });
      }

      return osData.map(os => {
        const osAvals = avalsRes.data?.filter(a => a.ordem_servico_id === os.id) || [];
        return {
          os_id: os.id,
          numero_os: os.numero_os,
          created_at: os.created_at,
          tipo_servico: tsMap[os.tipo_servico_id || ""] || "—",
          avaliacoes: osAvals.map(a => ({
            id: a.id,
            nota_final: a.nota_final,
            tipo_avaliacao: taMap[a.tipo_avaliacao_id || ""] || "—",
            created_at: a.created_at,
          })),
        };
      });
    },
    enabled: !!targetProfileId,
  });

  // Average score
  const avgScore = useMemo(() => {
    const allNotas = evaluations.flatMap(e => e.avaliacoes.map(a => a.nota_final).filter(Boolean)) as number[];
    if (allNotas.length === 0) return null;
    return allNotas.reduce((a, b) => a + b, 0) / allNotas.length;
  }, [evaluations]);

  // Most frequent errors
  const { data: frequentErrors = [] } = useQuery({
    queryKey: ["perf_errors", targetProfileId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!targetProfileId) return [];
      const from = startDate?.toISOString() || startOfMonth(now).toISOString();
      const to = endDate ? endOfMonth(endDate).toISOString() : endOfMonth(now).toISOString();

      const { data: osData } = await supabase
        .from("ordens_servico")
        .select("id")
        .or(`tecnico_id.eq.${targetProfileId},atendente_id.eq.${targetProfileId},colaborador_avaliado_id.eq.${targetProfileId}`)
        .gte("created_at", from)
        .lte("created_at", to);

      if (!osData?.length) return [];
      const osIds = osData.map(o => o.id);

      const { data: avals } = await supabase
        .from("avaliacoes")
        .select("id")
        .in("ordem_servico_id", osIds)
        .eq("concluida", true);

      if (!avals?.length) return [];
      const avalIds = avals.map(a => a.id);

      const { data: respostas } = await supabase
        .from("respostas_avaliacao")
        .select("pergunta_id")
        .in("avaliacao_id", avalIds)
        .eq("resposta", "nao");

      if (!respostas?.length) return [];

      const errorCount: Record<string, number> = {};
      respostas.forEach(r => {
        errorCount[r.pergunta_id] = (errorCount[r.pergunta_id] || 0) + 1;
      });

      const perguntaIds = Object.keys(errorCount);
      const { data: perguntas } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta")
        .in("id", perguntaIds);

      const perguntaMap: Record<string, string> = {};
      perguntas?.forEach(p => { perguntaMap[p.id] = p.pergunta; });

      return Object.entries(errorCount)
        .map(([id, count]) => ({ pergunta_id: id, pergunta: perguntaMap[id] || "—", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    },
    enabled: !!targetProfileId,
  });

  // OS Detail dialog - full checklist review
  const { data: osDetail } = useQuery({
    queryKey: ["perf_os_detail", selectedOsId],
    queryFn: async () => {
      if (!selectedOsId) return null;
      const { data: avals } = await supabase.from("avaliacoes")
        .select("id, avaliador_id, tipo_avaliacao_id, nota_final, concluida")
        .eq("ordem_servico_id", selectedOsId);
      if (!avals?.length) return null;

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

      return avals.map(a => ({
        id: a.id,
        avaliador_nome: avaliadorNames[a.avaliador_id] || "—",
        tipo_avaliacao_nome: a.tipo_avaliacao_id ? taNames[a.tipo_avaliacao_id] || "—" : "—",
        nota_final: a.nota_final,
        concluida: a.concluida,
        respostas: (respostas || [])
          .filter(r => r.avaliacao_id === a.id)
          .map(r => ({
            ...r,
            pergunta: perguntaMap[r.pergunta_id]?.pergunta || "—",
            peso: perguntaMap[r.pergunta_id]?.peso || 0,
            ordem: perguntaMap[r.pergunta_id]?.ordem || 0,
          }))
          .sort((x, y) => x.ordem - y.ordem),
      }));
    },
    enabled: !!selectedOsId,
  });

  if (!targetProfileId) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-center">
        <p className="text-muted-foreground">Colaborador não encontrado.</p>
        <Button variant="ghost" onClick={() => navigate(-1)} className="mt-4">
          <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" className="press-effect" onClick={() => navigate(-1)}>
        <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
      </Button>

      {/* Employee Header */}
      <div className="bg-card border border-border rounded-lg shadow-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{targetProfile?.nome || "..."}</h1>
            <p className="text-sm text-muted-foreground capitalize">{targetProfile?.cargo || "—"}</p>
          </div>
          {avgScore !== null && (
            <div className={cn("px-4 py-2 rounded-lg", getScoreBg(avgScore))}>
              <p className="text-caption text-muted-foreground">Média Geral</p>
              <p className={cn("text-2xl font-bold font-tabular", getScoreColor(avgScore))}>
                {avgScore.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-card">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Filtros</span>
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5 min-w-[200px]">
            <label className="text-caption font-medium text-muted-foreground">Mês de Competência</label>
            <Select value={competenceMonth} onValueChange={handleCompetenceChange}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {competenceMonths.map(m => (
                  <SelectItem key={m.value} value={m.value} className="capitalize">{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Data</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo Serviço</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nota</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {evaluations.map(ev => {
                const bestScore = ev.avaliacoes.length > 0
                  ? ev.avaliacoes.reduce((best, a) => (a.nota_final || 0) > (best || 0) ? a.nota_final : best, 0 as number | null)
                  : null;
                return (
                  <tr key={ev.os_id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => setSelectedOsId(ev.os_id)}>
                    <td className="px-4 py-3 text-body font-medium text-primary underline underline-offset-2 font-tabular">{ev.numero_os}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{format(new Date(ev.created_at), "dd/MM/yyyy")}</td>
                    <td className="px-4 py-3 text-body text-muted-foreground">{ev.tipo_servico}</td>
                    <td className="px-4 py-3">
                      {bestScore != null ? (
                        <span className={cn("font-bold font-tabular", getScoreColor(bestScore))}>{Number(bestScore).toFixed(1)}%</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
              {evaluations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma avaliação no período.</td></tr>
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

      {/* Checklist Review Dialog */}
      <Dialog open={!!selectedOsId} onOpenChange={open => { if (!open) setSelectedOsId(null); }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Avaliação</DialogTitle>
          </DialogHeader>
          {osDetail?.map((evalDetail: any) => (
            <div key={evalDetail.id} className="border border-border rounded-lg mb-4">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", evalDetail.concluida ? "bg-success" : "bg-warning")} />
                  <h3 className="text-body font-semibold text-foreground">{evalDetail.tipo_avaliacao_nome}</h3>
                  <span className="text-caption text-muted-foreground">— {evalDetail.avaliador_nome}</span>
                </div>
                {evalDetail.nota_final != null && (
                  <span className={cn("text-body font-bold font-tabular",
                    evalDetail.nota_final >= 80 ? "text-success" : evalDetail.nota_final >= 60 ? "text-warning" : "text-destructive"
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
                          <span className="text-caption text-muted-foreground">Nota: {resp.peso}</span>
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
