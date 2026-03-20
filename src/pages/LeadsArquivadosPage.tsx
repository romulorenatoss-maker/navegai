import { useState, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, Search, RefreshCw, Loader2, X, CalendarIcon, History, Trash2, CheckSquare, Square } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import AdminPasswordDialog from "@/components/AdminPasswordDialog";
import { applyPhoneMask } from "@/lib/phone-utils";

const fmtDate = (d: string) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  arquivado: { label: "Arquivado", color: "bg-muted text-muted-foreground" },
  aguardando_decisao_avaliador: { label: "Aguardando Avaliador", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  perdido: { label: "Perdido", color: "bg-destructive/10 text-destructive" },
  cancelado_pendente_analise: { label: "Cancelado (Análise)", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
};

const DELETE_BATCH_SIZE = 20;
const DELETE_BATCH_DELAY = 500;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export default function LeadsArquivadosPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [historyLeadId, setHistoryLeadId] = useState<string | null>(null);
  const [historyLeadNome, setHistoryLeadNome] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number; errors: number } | null>(null);
  const cancelDeleteRef = useRef(false);

  const { data: historico = [], isLoading: isLoadingHistorico } = useQuery({
    queryKey: ["lead-historico", historyLeadId],
    enabled: !!historyLeadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_historico")
        .select("*, profiles:usuario_id(nome)")
        .eq("lead_id", historyLeadId!)
        .order("data_evento", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-arquivados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status_lead", ["arquivado", "aguardando_decisao_avaliador", "perdido", "cancelado_pendente_analise"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const leadIds = useMemo(() => leads.map((l: any) => l.id), [leads]);

  const { data: contatos = [] } = useQuery({
    queryKey: ["leads-arquivados-contatos", leadIds],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_contatos")
        .select("*")
        .in("lead_id", leadIds);
      if (error) throw error;
      return data;
    },
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["profiles-list-archived"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });

  const getResponsavelNome = (id: string | null) => {
    if (!id) return "—";
    return responsaveis.find((p: any) => p.id === id)?.nome || "—";
  };

  const getContatos = (leadId: string) => contatos.filter((c: any) => c.lead_id === leadId && c.tipo_contato === "telefone");

  const filteredLeads = useMemo(() => {
    return leads.filter((lead: any) => {
      if (statusFilter !== "todos" && lead.status_lead !== statusFilter) return false;

      if (dateFrom) {
        const leadDate = new Date(lead.updated_at);
        if (leadDate < dateFrom) return false;
      }
      if (dateTo) {
        const leadDate = new Date(lead.updated_at);
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (leadDate > endOfDay) return false;
      }

      if (appliedSearch) {
        const term = appliedSearch.toLowerCase();
        const matchName = lead.nome.toLowerCase().includes(term);
        const matchPhone = getContatos(lead.id).some((c: any) => c.valor.includes(term));
        if (!matchName && !matchPhone) return false;
      }

      return true;
    });
  }, [leads, statusFilter, dateFrom, dateTo, appliedSearch, contatos]);

  // ─── Selection helpers ──────────────────────────
  const filteredIds = useMemo(() => filteredLeads.map((l: any) => l.id), [filteredLeads]);
  const allSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredIds));
    }
  }, [allSelected, filteredIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ─── Batch delete logic (bulk .in() per table) ──
  const deleteBatchLeads = async (batchIds: string[]): Promise<number> => {
    let errors = 0;
    // Delete all dependents in parallel using .in() — single request per table
    const depResults = await Promise.allSettled([
      supabase.from("lead_contatos").delete().in("lead_id", batchIds),
      supabase.from("lead_historico").delete().in("lead_id", batchIds),
      supabase.from("lead_interacoes").delete().in("lead_id", batchIds),
      supabase.from("lead_tarefas_contato").delete().in("lead_id", batchIds),
      supabase.from("registro_objecao_lead").delete().in("lead_id", batchIds),
      supabase.from("registro_atraso_tentativa").delete().in("lead_id", batchIds),
    ]);
    // Now delete leads themselves
    const { error } = await supabase.from("leads").delete().in("id", batchIds);
    if (error) errors += batchIds.length;
    return errors;
  };

  const executeBulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    const total = idsToDelete.length;
    let errorCount = 0;
    cancelDeleteRef.current = false;

    setDeleteProgress({ current: 0, total, errors: 0 });

    for (let i = 0; i < total; i += DELETE_BATCH_SIZE) {
      if (cancelDeleteRef.current) break;

      const batch = idsToDelete.slice(i, i + DELETE_BATCH_SIZE);
      const batchErrors = await deleteBatchLeads(batch);
      errorCount += batchErrors;

      const processed = Math.min(i + DELETE_BATCH_SIZE, total);
      setDeleteProgress({ current: processed, total, errors: errorCount });

      // Incrementally remove from cache (no full reload)
      if (batchErrors === 0) {
        const deletedSet = new Set(batch);
        queryClient.setQueriesData<any[]>(
          { queryKey: ["leads-arquivados"] },
          (old) => old ? old.filter((l: any) => !deletedSet.has(l.id)) : old
        );
        queryClient.setQueriesData<any[]>(
          { queryKey: ["leads-arquivados-contatos"] },
          (old) => old ? old.filter((c: any) => !deletedSet.has(c.lead_id)) : old
        );
      }

      // Yield to main thread between batches
      if (i + DELETE_BATCH_SIZE < total) await delay(DELETE_BATCH_DELAY);
    }

    setSelectedIds(new Set());

    // Only do a full sync at the end, not per batch
    queryClient.invalidateQueries({ queryKey: ["leads-arquivados"] });
    queryClient.invalidateQueries({ queryKey: ["leads-arquivados-contatos"] });

    if (cancelDeleteRef.current) {
      toast.info(`Remoção cancelada. ${deleteProgress?.current || 0} de ${total} leads processados.`);
    } else if (errorCount > 0) {
      toast.warning(`Remoção concluída com ${errorCount} erro(s) de ${total} leads.`);
    } else {
      toast.success(`${total} lead(s) removido(s) com sucesso!`);
    }

    setTimeout(() => setDeleteProgress(null), 2000);
  };

  // Reactivate lead
  const reactivateMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Erro interno.");
      await supabase.from("leads").update({
        status_lead: "fila_captura",
        responsavel_id: null,
        reserved_by: null,
        reserved_at: null,
      } as any).eq("id", leadId);

      await supabase.from("lead_tarefas_contato")
        .update({ status: "cancelada" } as any)
        .eq("lead_id", leadId)
        .in("status", ["pendente", "atrasado"]);

      await supabase.from("lead_historico").insert({
        lead_id: leadId, usuario_id: profile.id,
        tipo_evento: "lead_desarquivado",
        descricao: `Lead desarquivado por ${profile.nome} e enviado para fila de captura em ${new Date().toLocaleString("pt-BR")}`,
      });
    },
    onSuccess: () => {
      toast.success("Lead reativado e devolvido à fila!");
      queryClient.invalidateQueries({ queryKey: ["leads-arquivados"] });
      queryClient.invalidateQueries({ queryKey: ["leads-list"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSearch = () => setAppliedSearch(searchTerm.trim());
  const clearFilters = () => {
    setSearchTerm(""); setAppliedSearch(""); setStatusFilter("todos"); setDateFrom(undefined); setDateTo(undefined);
  };

  const isDeleting = deleteProgress !== null;
  const progressPercent = deleteProgress ? Math.round((deleteProgress.current / deleteProgress.total) * 100) : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Archive className="w-5 h-5" /> Leads Arquivados
        </h1>
        <p className="text-sm text-muted-foreground">
          Leads que finalizaram todas as tentativas ou foram arquivados.
        </p>
      </div>

      {/* Delete progress banner */}
      {isDeleting && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                <span className="text-sm font-medium">
                  Removendo leads... {deleteProgress.current} de {deleteProgress.total}
                  {deleteProgress.errors > 0 && (
                    <span className="text-destructive ml-1">({deleteProgress.errors} erro(s))</span>
                  )}
                </span>
              </div>
              {deleteProgress.current < deleteProgress.total && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { cancelDeleteRef.current = true; }}
                >
                  Cancelar
                </Button>
              )}
            </div>
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">{progressPercent}% concluído</p>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Buscar (nome ou telefone)</Label>
              <div className="flex gap-1.5">
                <Input
                  placeholder="Digite nome ou telefone..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  className="h-9 text-sm"
                />
                <Button size="sm" variant="outline" onClick={handleSearch} className="h-9 px-2.5">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="min-w-[160px]">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="arquivado">Arquivado</SelectItem>
                  <SelectItem value="aguardando_decisao_avaliador">Aguardando Avaliador</SelectItem>
                  <SelectItem value="perdido">Perdido</SelectItem>
                  <SelectItem value="cancelado_pendente_analise">Cancelado (Análise)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[140px]">
              <Label className="text-xs">De</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal text-sm", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="min-w-[140px]">
              <Label className="text-xs">Até</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-9 w-full justify-start text-left font-normal text-sm", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} />
                </PopoverContent>
              </Popover>
            </div>

            <Button size="sm" variant="ghost" onClick={clearFilters} className="h-9">
              <X className="w-3.5 h-3.5 mr-1" /> Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {isAdmin && someSelected && !isDeleting && (
        <Card className="border-destructive/30">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm font-medium">
              {selectedIds.size} lead(s) selecionado(s)
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                Limpar seleção
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowPasswordDialog(true)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Excluir permanentemente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Leads Arquivados
            <Badge variant="secondary" className="text-xs">{filteredLeads.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto max-h-[calc(100vh-380px)]">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead arquivado encontrado</div>
          ) : (
            <div className="min-w-[800px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && (
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          disabled={isDeleting}
                          aria-label="Selecionar todos"
                        />
                      </TableHead>
                    )}
                    <TableHead>Lead</TableHead>
                    <TableHead>Telefone(s)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Atualizado em</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead: any) => {
                    const status = STATUS_LABELS[lead.status_lead] || { label: lead.status_lead, color: "bg-muted text-muted-foreground" };
                    const phones = getContatos(lead.id);
                    const isSelected = selectedIds.has(lead.id);
                    return (
                      <TableRow key={lead.id} data-state={isSelected ? "selected" : undefined}>
                        {isAdmin && (
                          <TableCell>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(lead.id)}
                              disabled={isDeleting}
                              aria-label={`Selecionar ${lead.nome}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium text-sm">{lead.nome}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {phones.map((c: any) => (
                              <Badge key={c.id} variant="outline" className="text-xs">{applyPhoneMask(c.valor)}</Badge>
                            ))}
                            {phones.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${status.color}`}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{getResponsavelNome(lead.responsavel_id)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(lead.updated_at)}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setHistoryLeadId(lead.id); setHistoryLeadNome(lead.nome); }}
                            title="Histórico"
                            disabled={isDeleting}
                          >
                            <History className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reactivateMutation.mutate(lead.id)}
                            disabled={reactivateMutation.isPending || isDeleting}
                          >
                            {reactivateMutation.isPending
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                              : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                            Reativar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Histórico */}
      <Dialog open={!!historyLeadId} onOpenChange={(open) => { if (!open) setHistoryLeadId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Histórico — {historyLeadNome}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {isLoadingHistorico ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : historico.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</div>
            ) : (
              <div className="space-y-3 p-1">
                {historico.map((h: any, i: number) => (
                  <div key={h.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                      {i < historico.length - 1 && <div className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="pb-3 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(h.data_evento)} — {(h as any).profiles?.nome || "Sistema"}
                      </p>
                      <p className="text-sm">{h.descricao || h.tipo_evento}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Admin password confirmation for bulk delete */}
      <AdminPasswordDialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
        title="Excluir Leads Permanentemente"
        description={`Você está prestes a excluir ${selectedIds.size} lead(s) e todos os seus dados (contatos, histórico, interações, tarefas). Esta ação é irreversível.`}
        onConfirm={executeBulkDelete}
      />
    </div>
  );
}
