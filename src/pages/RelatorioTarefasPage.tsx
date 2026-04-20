import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Trash2, ChevronDown, ChevronRight, FileBarChart, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { logSystem } from "@/modules/operacional/services/systemLogger";

interface AssignmentRow {
  id: string;
  template_id: string;
  status: string;
  data_prevista: string;
  created_at: string;
  numero_tarefa: number;
  template_titulo: string;
}

const STATUS_OPTIONS = [
  { value: "__all", label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "aguardando_avaliacao", label: "Aguardando avaliação" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação" },
  { value: "devolvida", label: "Devolvida" },
  { value: "contingenciado", label: "Contingenciada" },
  { value: "contingencia", label: "Contingência" },
  { value: "concluida", label: "Concluída" },
  { value: "aprovada", label: "Aprovada" },
  { value: "nao_executada", label: "Não executada" },
];

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-muted text-muted-foreground",
  em_andamento: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  aguardando_avaliacao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  aguardando_aprovacao: "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  devolvida: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  contingenciado: "bg-destructive/15 text-destructive",
  contingencia: "bg-destructive/15 text-destructive",
  concluida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  aprovada: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  nao_executada: "bg-muted text-muted-foreground",
};

export default function RelatorioTarefasPage() {
  const queryClient = useQueryClient();
  // Pending filters (form state)
  const [pendingFrom, setPendingFrom] = useState<Date | undefined>();
  const [pendingTo, setPendingTo] = useState<Date | undefined>();
  const [pendingStatus, setPendingStatus] = useState<string>("__all");
  // Applied filters (used in query)
  const [filters, setFilters] = useState<{ from?: Date; to?: Date; status: string }>({ status: "__all" });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [toDelete, setToDelete] = useState<AssignmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["relatorio-tarefas", filters],
    queryFn: async () => {
      let q = supabase
        .from("operational_assignments")
        .select("id, template_id, status, data_prevista, created_at, numero_tarefa, operational_templates(nome)")
        .order("created_at", { ascending: false });

      if (filters.from) q = q.gte("created_at", filters.from.toISOString());
      if (filters.to) {
        const end = new Date(filters.to);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (filters.status !== "__all") q = q.eq("status", filters.status);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        template_id: r.template_id,
        status: r.status,
        data_prevista: r.data_prevista,
        created_at: r.created_at,
        numero_tarefa: r.numero_tarefa,
        template_titulo: r.operational_templates?.nome ?? "Sem título",
      })) as AssignmentRow[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    (data || []).forEach((r) => {
      const key = r.template_titulo;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const toggleGroup = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

  const handleSearch = () => {
    setFilters({ from: pendingFrom, to: pendingTo, status: pendingStatus });
  };
  const handleClear = () => {
    setPendingFrom(undefined);
    setPendingTo(undefined);
    setPendingStatus("__all");
    setFilters({ status: "__all" });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const aid = toDelete.id;
      const { data: cgs } = await supabase
        .from("operational_contingencies")
        .select("id")
        .eq("assignment_id", aid);
      const cgIds = (cgs || []).map((c: any) => c.id);
      if (cgIds.length) {
        await supabase
          .from("operational_contingency_resolution_logs")
          .delete()
          .in("contingency_id", cgIds);
      }

      const tables = [
        "operational_contingencies",
        "operational_field_answers",
        "operational_field_reviews",
        "operational_approval_answers",
        "operational_execution_check_answers",
        "operational_execution_step_logs",
        "operational_execution_logs",
        "operational_assignment_history",
        "operational_audit_trail",
        "operational_score_logs",
        "operational_score_overrides",
      ] as const;
      for (const t of tables) {
        const { error } = await (supabase as any).from(t).delete().eq("assignment_id", aid);
        if (error) logSystem.warn(`Falha ao limpar ${t}`, { error: error.message, assignmentId: aid });
      }

      const { error: delErr } = await supabase.from("operational_assignments").delete().eq("id", aid);
      if (delErr) throw delErr;

      logSystem.info("Tarefa excluída via relatório", { assignmentId: aid, template: toDelete.template_titulo });
      toast.success("Tarefa e registros removidos. Rotina preservada.");
      queryClient.invalidateQueries({ queryKey: ["relatorio-tarefas"] });
      queryClient.invalidateQueries({ queryKey: ["operational_assignments"] });
      setToDelete(null);
    } catch (err: any) {
      logSystem.error("Falha ao excluir tarefa do relatório", err);
      toast.error("Erro ao excluir: " + (err?.message ?? "desconhecido"));
    } finally {
      setDeleting(false);
    }
  };

  const totalAssignments = data?.length ?? 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileBarChart className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Relatório de Tarefas</h1>
          <p className="text-sm text-muted-foreground">
            Tarefas geradas pelas rotinas operacionais (todos os status). Excluir uma tarefa remove apenas seus registros — a rotina é preservada.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Criadas a partir de</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !pendingFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {pendingFrom ? format(pendingFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={pendingFrom} onSelect={setPendingFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Criadas até</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !pendingTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {pendingTo ? format(pendingTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={pendingTo} onSelect={setPendingTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select value={pendingStatus} onValueChange={setPendingStatus}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSearch} disabled={isFetching}>
            <Search className="w-4 h-4 mr-2" /> Buscar
          </Button>
          <Button variant="ghost" onClick={handleClear}>Limpar</Button>
          <div className="ml-auto text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalAssignments}</span> tarefa(s)
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma tarefa encontrada com os filtros aplicados.</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([titulo, items]) => {
            const isOpen = openGroups[titulo] ?? true;
            return (
              <Card key={titulo}>
                <button
                  onClick={() => toggleGroup(titulo)}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <h3 className="font-semibold text-left">{titulo}</h3>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                </button>
                {isOpen && (
                  <CardContent className="pt-0">
                    <div className="border rounded-md divide-y">
                      {items.map((row) => (
                        <div key={row.id} className="flex items-center justify-between p-3 gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">#{row.numero_tarefa}</span>
                              <span className={cn("inline-flex items-center text-xs font-medium px-2 py-0.5 rounded capitalize", STATUS_COLORS[row.status] || "bg-muted text-muted-foreground")}>
                                {row.status.replace(/_/g, " ")}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                Prevista: {format(new Date(row.data_prevista), "dd/MM/yyyy")}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                · Criada em {format(new Date(row.created_at), "dd/MM/yyyy HH:mm")}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setToDelete(row)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Excluir
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa #{toDelete?.numero_tarefa}?</AlertDialogTitle>
            <AlertDialogDescription>
              Serão removidos a tarefa <strong>"{toDelete?.template_titulo}"</strong> e <strong>todos os registros e logs gerados por ela</strong> (respostas, avaliações, contingências, históricos e auditoria).
              <br /><br />
              <strong>A rotina operacional NÃO será excluída</strong> — apenas esta execução específica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Excluindo..." : "Confirmar exclusão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
