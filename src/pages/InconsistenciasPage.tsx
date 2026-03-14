import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle, ExternalLink, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface InconsistenciaRow {
  id: string;
  ordem_servico_id: string;
  pergunta_id: string;
  respostas_por_avaliador: Array<{
    avaliador_id: string;
    avaliador_nome: string;
    tipo_avaliacao: string;
    resposta: string;
    is_responsible: boolean;
  }>;
  setor_responsavel_id: string | null;
  tipo_avaliacao_responsavel_id: string | null;
  detectada_em: string;
  resolvida: boolean;
  // joined
  _os_numero?: string;
  _pergunta_texto?: string;
  _setor_nome?: string;
  _tipo_avaliacao_nome?: string;
}

const answerLabel: Record<string, { text: string; color: string }> = {
  sim: { text: "Sim", color: "text-success" },
  nao: { text: "Não", color: "text-destructive" },
  na: { text: "N/A", color: "text-muted-foreground" },
};

export default function InconsistenciasPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("all");

  const { data: inconsistencias = [], isLoading } = useQuery({
    queryKey: ["inconsistencias", filterStatus],
    queryFn: async () => {
      let query = (supabase as any)
        .from("avaliacoes_inconsistencias")
        .select("*")
        .order("detectada_em", { ascending: false });

      if (filterStatus === "open") query = query.eq("resolvida", false);
      if (filterStatus === "resolved") query = query.eq("resolvida", true);

      const { data } = await query;
      if (!data || data.length === 0) return [];

      // Enrich with OS numbers, question texts, sector names
      const osIds = [...new Set(data.map((d: any) => d.ordem_servico_id))] as string[];
      const perguntaIds = [...new Set(data.map((d: any) => d.pergunta_id))] as string[];
      const setorIds = [...new Set(data.filter((d: any) => d.setor_responsavel_id).map((d: any) => d.setor_responsavel_id))] as string[];
      const taIds = [...new Set(data.filter((d: any) => d.tipo_avaliacao_responsavel_id).map((d: any) => d.tipo_avaliacao_responsavel_id))] as string[];

      const [osRes, pergRes, setorRes, taRes] = await Promise.all([
        supabase.from("ordens_servico").select("id, numero_os").in("id", osIds),
        supabase.from("perguntas_avaliacao").select("id, pergunta").in("id", perguntaIds),
        setorIds.length > 0 ? supabase.from("setores").select("id, nome").in("id", setorIds) : { data: [] },
        taIds.length > 0 ? (supabase as any).from("tipos_avaliacao").select("id, nome").in("id", taIds) : { data: [] },
      ]);

      const osMap = new Map(osRes.data?.map(o => [o.id, o.numero_os]) || []);
      const pergMap = new Map(pergRes.data?.map(p => [p.id, p.pergunta]) || []);
      const setorMap = new Map((setorRes as any).data?.map((s: any) => [s.id, s.nome]) || []);
      const taMap = new Map((taRes as any).data?.map((t: any) => [t.id, t.nome]) || []);

      return data.map((d: any) => ({
        ...d,
        _os_numero: osMap.get(d.ordem_servico_id) || "—",
        _pergunta_texto: pergMap.get(d.pergunta_id) || "—",
        _setor_nome: setorMap.get(d.setor_responsavel_id) || "—",
        _tipo_avaliacao_nome: taMap.get(d.tipo_avaliacao_responsavel_id) || "—",
      })) as InconsistenciaRow[];
    },
  });

  const openCount = inconsistencias.filter(i => !i.resolvida).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg sm:text-section font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Inconsistências de Avaliação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Divergências detectadas quando múltiplos avaliadores respondem a mesma pergunta de forma diferente.
        </p>
      </div>

      {/* Stats + Filter */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border border-warning/20 rounded-md">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            <span className="text-sm font-medium text-warning">{openCount} abertas</span>
          </div>
          <span className="text-sm text-muted-foreground">{inconsistencias.length} total</span>
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="open">Abertas</SelectItem>
            <SelectItem value="resolved">Resolvidas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>
      ) : inconsistencias.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
          <p className="text-body font-medium text-foreground">Nenhuma inconsistência encontrada</p>
          <p className="text-sm text-muted-foreground mt-1">Todas as avaliações estão alinhadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inconsistencias.map((inc) => (
            <div
              key={inc.id}
              className={cn(
                "bg-card border rounded-lg p-4 transition-colors hover:border-primary/30 cursor-pointer",
                inc.resolvida ? "border-border opacity-70" : "border-warning/30"
              )}
              onClick={() => navigate(`/avaliacoes/pesquisa?os=${inc._os_numero}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-body font-semibold text-primary font-tabular">OS #{inc._os_numero}</span>
                    <Badge variant={inc.resolvida ? "secondary" : "destructive"} className="text-[10px]">
                      {inc.resolvida ? "Resolvida" : "INCONSISTÊNCIA"}
                    </Badge>
                  </div>
                  <p className="text-sm text-foreground">{inc._pergunta_texto}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>

              <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                <span>Setor responsável: <strong className="text-foreground">{inc._tipo_avaliacao_nome}</strong></span>
                <span>•</span>
                <span>{new Date(inc.detectada_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </div>

              {/* Answers by evaluator */}
              <div className="space-y-1.5">
                {inc.respostas_por_avaliador.map((r, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm",
                    r.is_responsible ? "bg-primary/5 border border-primary/20" : "bg-muted/50"
                  )}>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-foreground">{r.avaliador_nome}</span>
                      <span className="text-muted-foreground ml-1.5">({r.tipo_avaliacao})</span>
                    </div>
                    <span className={cn("font-bold", answerLabel[r.resposta]?.color || "text-foreground")}>
                      {answerLabel[r.resposta]?.text || r.resposta}
                    </span>
                    {r.is_responsible && (
                      <Badge variant="outline" className="text-[9px] shrink-0">OFICIAL</Badge>
                    )}
                    {!r.is_responsible && (
                      <Badge variant="secondary" className="text-[9px] shrink-0">AUDITORIA</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
