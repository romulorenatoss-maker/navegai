import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Search, Send, Filter, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// ─── Status config ─────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  importado: { label: "Importado", color: "bg-muted text-muted-foreground" },
  novo: { label: "Novo", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  fila_captura: { label: "Na Fila", color: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200" },
  em_atendimento: { label: "Em Atendimento", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  em_contato: { label: "Em Contato", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
  interessado: { label: "Interessado", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  convertido: { label: "Convertido", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  perdido: { label: "Perdido", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  arquivado: { label: "Arquivado", color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
  aguardando_decisao_avaliador: { label: "Aguardando Avaliador", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  reservado: { label: "Reservado", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  cancelado_pendente_analise: { label: "Cancelado (Análise)", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
};

const FILTER_STATUSES = [
  { value: "all", label: "Todos" },
  { value: "importado", label: "Importado" },
  { value: "novo", label: "Novo" },
  { value: "fila_captura", label: "Na Fila" },
  { value: "em_atendimento", label: "Em Atendimento" },
  { value: "em_contato", label: "Em Contato" },
  { value: "interessado", label: "Interessado" },
  { value: "convertido", label: "Convertido" },
  { value: "perdido", label: "Perdido" },
  { value: "arquivado", label: "Arquivado" },
];

const PAGE_SIZES = [10, 20, 50, 100];

interface LeadRow {
  id: string;
  nome: string;
  status_lead: string;
  data_criacao: string;
  created_at: string;
  responsavel_id: string | null;
  campanha_id: string | null;
  cidade_id: string | null;
}

function statusBadge(status: string) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-muted text-muted-foreground" };
  return <Badge className={`${cfg.color} border-0 text-[11px]`}>{cfg.label}</Badge>;
}

export default function GerenciamentoLeadsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sending state
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);

  // ─── Server-side paginated query ─────────────────
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["gerenciamento-leads", filterStatus, filterSearch, filterDateFrom?.toISOString(), filterDateTo?.toISOString(), page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("id, nome, status_lead, data_criacao, created_at, responsavel_id, campanha_id, cidade_id", { count: "exact" });

      if (filterStatus !== "all") {
        query = query.eq("status_lead", filterStatus);
      }

      if (filterSearch.trim()) {
        query = query.ilike("nome", `%${filterSearch.trim()}%`);
      }

      if (filterDateFrom) {
        query = query.gte("created_at", filterDateFrom.toISOString());
      }
      if (filterDateTo) {
        const endOfDay = new Date(filterDateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }

      query = query.order("created_at", { ascending: false }).range(page * pageSize, (page + 1) * pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { leads: (data || []) as LeadRow[], total: count || 0 };
    },
    staleTime: 15_000,
  });

  const leads = queryResult?.leads || [];
  const totalCount = queryResult?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Profiles for responsible name
  const { data: profilesMap = {} } = useQuery({
    queryKey: ["profiles-map"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { map[p.id] = p.nome; });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Campanhas for display
  const { data: campanhasMap = {} } = useQuery({
    queryKey: ["campanhas-map"],
    queryFn: async () => {
      const { data } = await supabase.from("campanhas").select("id, nome");
      const map: Record<string, string> = {};
      (data || []).forEach((c: any) => { map[c.id] = c.nome; });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ─── Selection handlers ─────────────────
  const pageLeadIds = useMemo(() => leads.map(l => l.id), [leads]);
  const allPageSelected = pageLeadIds.length > 0 && pageLeadIds.every(id => selectedIds.has(id));
  const somePageSelected = pageLeadIds.some(id => selectedIds.has(id));

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageLeadIds.forEach(id => next.delete(id));
      } else {
        pageLeadIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [allPageSelected, pageLeadIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Select all matching filter (not just page)
  const selectAllFromFilter = useCallback(async () => {
    const toastId = toast.loading("Selecionando todos...");
    try {
      let query = supabase.from("leads").select("id");
      if (filterStatus !== "all") query = query.eq("status_lead", filterStatus);
      if (filterSearch.trim()) query = query.ilike("nome", `%${filterSearch.trim()}%`);
      if (filterDateFrom) query = query.gte("created_at", filterDateFrom.toISOString());
      if (filterDateTo) {
        const endOfDay = new Date(filterDateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }
      // Fetch in batches of 1000
      let allIds: string[] = [];
      let offset = 0;
      while (true) {
        const { data } = await query.range(offset, offset + 999);
        if (!data || data.length === 0) break;
        allIds = allIds.concat(data.map((d: any) => d.id));
        if (data.length < 1000) break;
        offset += 1000;
      }
      setSelectedIds(new Set(allIds));
      toast.success(`${allIds.length} leads selecionados`, { id: toastId });
    } catch {
      toast.error("Erro ao selecionar", { id: toastId });
    }
  }, [filterStatus, filterSearch, filterDateFrom, filterDateTo]);

  // ─── Send to queue ─────────────────
  const handleSendToQueue = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { toast.error("Selecione pelo menos um lead."); return; }

    setSending(true);
    setSendProgress({ current: 0, total: ids.length });

    const BATCH_SIZE = 10;
    try {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from("leads")
          .update({ status_lead: "fila_captura", responsavel_id: null } as any)
          .in("id", batch);
        if (error) throw error;
        setSendProgress({ current: Math.min(i + BATCH_SIZE, ids.length), total: ids.length });
        if (i + BATCH_SIZE < ids.length) await new Promise(r => setTimeout(r, 200));
      }

      // Log history
      if (profile) {
        const historyBatch = ids.map(id => ({
          lead_id: id,
          usuario_id: profile.id,
          tipo_evento: "alteracao_status",
          descricao: "Lead enviado para fila de captura via gerenciamento em massa.",
        }));
        // Insert in chunks
        for (let i = 0; i < historyBatch.length; i += 50) {
          await supabase.from("lead_historico").insert(historyBatch.slice(i, i + 50));
        }
      }

      toast.success(`${ids.length} leads enviados para fila com sucesso!`);
      const sentIds = new Set(ids);
      setSelectedIds(new Set());
      // Optimistically remove sent leads from the current list
      queryClient.setQueriesData<{ leads: LeadRow[]; total: number }>(
        { queryKey: ["gerenciamento-leads"] },
        (old) => {
          if (!old) return old;
          const filtered = old.leads.filter(l => !sentIds.has(l.id));
          return { leads: filtered, total: Math.max(0, old.total - ids.length) };
        }
      );
      // Refetch in background to sync with server
      queryClient.invalidateQueries({ queryKey: ["gerenciamento-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-captura"] });
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setSending(false);
      setSendProgress(null);
    }
  }, [selectedIds, profile, queryClient]);

  // Reset page when filters change
  const handleFilterChange = useCallback((setter: (v: any) => void, value: any) => {
    setter(value);
    setPage(0);
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="p-3 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Gerenciamento de Leads</h1>
          <Badge variant="secondary" className="text-xs">{totalCount} total</Badge>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Nome do lead..."
                  value={filterSearch}
                  onChange={e => handleFilterChange(setFilterSearch, e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* Status */}
            <div className="w-44">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={filterStatus} onValueChange={v => handleFilterChange(setFilterStatus, v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date from */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">De</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 w-36 text-sm justify-start", !filterDateFrom && "text-muted-foreground")}>
                    {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDateFrom} onSelect={d => handleFilterChange(setFilterDateFrom, d)} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Date to */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Até</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 w-36 text-sm justify-start", !filterDateTo && "text-muted-foreground")}>
                    {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={filterDateTo} onSelect={d => handleFilterChange(setFilterDateTo, d)} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Clear */}
            {(filterStatus !== "all" || filterSearch || filterDateFrom || filterDateTo) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => {
                setFilterStatus("all"); setFilterSearch(""); setFilterDateFrom(undefined); setFilterDateTo(undefined);
                setPage(0); setSelectedIds(new Set());
              }}>
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-2.5 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckSquare className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
                Limpar seleção
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFromFilter}>
                Selecionar todos do filtro ({totalCount})
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {sendProgress && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{sendProgress.current}/{sendProgress.total}</span>
                </div>
              )}
              <Button size="sm" onClick={handleSendToQueue} disabled={sending} className="gap-1.5">
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Enviar para Fila
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-40">Status</TableHead>
              <TableHead className="w-36">Data Criação</TableHead>
              <TableHead className="w-44">Responsável</TableHead>
              <TableHead className="w-36">Campanha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhum lead encontrado
                </TableCell>
              </TableRow>
            ) : (
              leads.map(lead => (
                <TableRow key={lead.id} className={selectedIds.has(lead.id) ? "bg-primary/5" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => toggleOne(lead.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{lead.nome}</TableCell>
                  <TableCell>{statusBadge(lead.status_lead)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.responsavel_id ? (profilesMap[lead.responsavel_id] || "—") : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {lead.campanha_id ? (campanhasMap[lead.campanha_id] || "—") : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Linhas por página:</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(0); setSelectedIds(new Set()); }}>
              <SelectTrigger className="h-8 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(s => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {totalCount === 0 ? "0" : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)}`} de {totalCount}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
