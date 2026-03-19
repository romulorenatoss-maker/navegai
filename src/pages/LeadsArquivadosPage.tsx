import { useState, useMemo } from "react";
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
import { Archive, Search, RefreshCw, Loader2, X, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

const fmtDate = (d: string) => {
  try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  arquivado: { label: "Arquivado", color: "bg-muted text-muted-foreground" },
  aguardando_decisao_avaliador: { label: "Aguardando Avaliador", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  perdido: { label: "Perdido", color: "bg-destructive/10 text-destructive" },
  cancelado_pendente_analise: { label: "Cancelado (Análise)", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200" },
};

export default function LeadsArquivadosPage() {
  const { profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-arquivados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .in("status_lead", ["arquivado", "aguardando_decisao_avaliador", "perdido"])
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

  // Reactivate lead (send back to queue)
  const reactivateMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Erro interno.");
      // Send to capture queue: clear responsible, set fila_captura
      await supabase.from("leads").update({
        status_lead: "fila_captura",
        responsavel_id: null,
        reserved_by: null,
        reserved_at: null,
      } as any).eq("id", leadId);

      // Cancel any old pending tasks
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
                    return (
                      <TableRow key={lead.id}>
                        <TableCell className="font-medium text-sm">{lead.nome}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {phones.map((c: any) => (
                              <Badge key={c.id} variant="outline" className="text-xs">{c.valor}</Badge>
                            ))}
                            {phones.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs border-0 ${status.color}`}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{getResponsavelNome(lead.responsavel_id)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(lead.updated_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reactivateMutation.mutate(lead.id)}
                            disabled={reactivateMutation.isPending}
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
    </div>
  );
}
