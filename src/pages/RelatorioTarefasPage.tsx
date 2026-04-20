import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Trash2, ChevronDown, ChevronRight, FileBarChart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
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

export default function RelatorioTarefasPage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [toDelete, setToDelete] = useState<AssignmentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["relatorio-tarefas", dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let q = supabase
        .from("operational_assignments")
        .select("id, template_id, status, data_prevista, created_at, numero_tarefa, operational_templates(titulo)")
        .order("created_at", { ascending: false });
      if (dateFrom) q = q.gte("created_at", dateFrom.toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        template_id: r.template_id,
        status: r.status,
        data_prevista: r.data_prevista,
        created_at: r.created_at,
        numero_tarefa: r.numero_tarefa,
        template_titulo: r.operational_templates?.titulo ?? "Sem título",
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

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const aid = toDelete.id;
      // Apaga registros filhos (NÃO toca em operational_templates / rotina)
      const tables = [
        "operational_contingency_resolution_logs", // via contingências (CASCADE? caso não, apagar manual)
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

      // resolution_logs depende de contingencies — apaga por contingency_id primeiro
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

      for (const t of tables) {
        if (t === "operational_contingency_resolution_logs") continue;
        const { error } = await (supabase as any).from(t).delete().eq("assignment_id", aid);
        if (error) logSystem.warn(`Falha ao limpar ${t}`, { error: error.message, assignmentId: aid });
      }

      const { error: delErr } = await supabase
        .from("operational_assignments")
        .delete()
        .eq("id", aid);
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
            Tarefas geradas a partir das rotinas operacionais. A exclusão remove apenas a tarefa e seus registros — a rotina é preservada.
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
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Criadas até</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          {(dateFrom || dateTo) && (
            <Button variant="ghost" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
              Limpar
            </Button>
          )}
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
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhuma tarefa encontrada.</CardContent></Card>
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
                              <Badge variant="outline" className="capitalize">{row.status.replace(/_/g, " ")}</Badge>
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
