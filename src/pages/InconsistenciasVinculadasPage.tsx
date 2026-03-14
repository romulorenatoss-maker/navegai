import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Filter, CalendarIcon, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const answerLabel: Record<string, { text: string; color: string }> = {
  sim: { text: "Sim", color: "text-success" },
  nao: { text: "Não", color: "text-destructive" },
  na: { text: "N/A", color: "text-muted-foreground" },
};

function getCompetenceMonths(): { value: string; label: string }[] {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy", { locale: ptBR }) });
  }
  return months;
}

export default function InconsistenciasVinculadasPage() {
  const competenceMonths = getCompetenceMonths();
  const [competence, setCompetence] = useState(competenceMonths[0].value);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const dateRange = useMemo(() => {
    if (startDate && endDate) return { from: startDate.toISOString(), to: endDate.toISOString() };
    const [y, m] = competence.split("-").map(Number);
    const s = startOfMonth(new Date(y, m - 1));
    const e = endOfMonth(new Date(y, m - 1));
    return { from: s.toISOString(), to: e.toISOString() };
  }, [competence, startDate, endDate]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inconsistencias_vinculadas", dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("inconsistencias_vinculadas")
        .select("*")
        .gte("detectada_em", dateRange.from)
        .lte("detectada_em", dateRange.to)
        .order("detectada_em", { ascending: false });

      if (!data || data.length === 0) return [];

      const osIds = [...new Set(data.map((d: any) => d.ordem_servico_id))] as string[];
      const pIds = [...new Set(data.flatMap((d: any) => [d.pergunta_a_id, d.pergunta_b_id]))] as string[];

      const [osRes, pRes] = await Promise.all([
        supabase.from("ordens_servico").select("id, numero_os").in("id", osIds),
        supabase.from("perguntas_avaliacao").select("id, pergunta").in("id", pIds),
      ]);

      const osMap = new Map(osRes.data?.map(o => [o.id, o.numero_os]) || []);
      const pMap = new Map(pRes.data?.map(p => [p.id, p.pergunta]) || []);

      return data.map((d: any) => ({
        ...d,
        _os_numero: osMap.get(d.ordem_servico_id) || "—",
        _pergunta_a: pMap.get(d.pergunta_a_id) || "—",
        _pergunta_b: pMap.get(d.pergunta_b_id) || "—",
      }));
    },
  });

  // Analytics: questions with most inconsistencies
  const ranking = useMemo(() => {
    const map = new Map<string, { pergunta: string; count: number }>();
    for (const r of rows) {
      for (const key of ["pergunta_a_id", "pergunta_b_id"] as const) {
        const id = r[key];
        const text = key === "pergunta_a_id" ? r._pergunta_a : r._pergunta_b;
        const cur = map.get(id) || { pergunta: text, count: 0 };
        cur.count += 1;
        map.set(id, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [rows]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-section font-semibold text-foreground flex items-center gap-2">
          <Link2 className="w-5 h-5 text-primary" />
          Inconsistências entre Perguntas Vinculadas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Divergências detectadas quando perguntas vinculadas recebem respostas diferentes na mesma avaliação.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filtros:</span>
        </div>
        <Select value={competence} onValueChange={v => { setCompetence(v); setStartDate(undefined); setEndDate(undefined); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {competenceMonths.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" />
              {startDate ? format(startDate, "dd/MM/yy") : "Início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startDate} onSelect={setStartDate} locale={ptBR} /></PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" />
              {endDate ? format(endDate, "dd/MM/yy") : "Fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} /></PopoverContent>
        </Popover>
        <Badge variant="secondary" className="text-xs">{rows.length} registro{rows.length !== 1 ? "s" : ""}</Badge>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>OS</TableHead>
              <TableHead>Pergunta A</TableHead>
              <TableHead className="text-center">Resposta A</TableHead>
              <TableHead>Pergunta B</TableHead>
              <TableHead className="text-center">Resposta B</TableHead>
              <TableHead className="text-right">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma inconsistência no período.</TableCell></TableRow>
            ) : rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold text-primary font-tabular">#{r._os_numero}</TableCell>
                <TableCell className="max-w-[200px] truncate">{r._pergunta_a}</TableCell>
                <TableCell className="text-center">
                  <span className={cn("font-bold", answerLabel[r.resposta_a]?.color)}>{answerLabel[r.resposta_a]?.text || r.resposta_a}</span>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">{r._pergunta_b}</TableCell>
                <TableCell className="text-center">
                  <span className={cn("font-bold", answerLabel[r.resposta_b]?.color)}>{answerLabel[r.resposta_b]?.text || r.resposta_b}</span>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm">
                  {new Date(r.detectada_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Analytics: Questions with Most Inconsistencies */}
      {ranking.length > 0 && (
        <div className="bg-card border border-border rounded-lg shadow-card p-4">
          <h2 className="text-body font-semibold text-foreground flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-primary" />
            Perguntas com Mais Inconsistências
          </h2>
          <div className="space-y-2">
            {ranking.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-caption text-muted-foreground font-tabular w-6 text-right">{i + 1}.</span>
                <span className="flex-1 text-sm text-foreground truncate">{item.pergunta}</span>
                <Badge variant="destructive" className="text-xs font-tabular">{item.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
