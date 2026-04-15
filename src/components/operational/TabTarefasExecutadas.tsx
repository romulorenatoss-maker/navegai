import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  aguardando_avaliacao: "Aguardando Avaliação",
  aguardando_aprovacao: "Aguardando Aprovação",
  devolvida: "Devolvida",
  concluida: "Concluída",
  aprovada: "Aprovada",
  nao_executada: "Não Executada",
};

const STATUS_COLORS: Record<string, string> = {
  pendente: "bg-muted text-muted-foreground",
  em_andamento: "bg-primary/10 text-primary",
  aguardando_avaliacao: "bg-amber-100 text-amber-700",
  aguardando_aprovacao: "bg-purple-100 text-purple-700",
  devolvida: "bg-orange-100 text-orange-700",
  concluida: "bg-emerald-100 text-emerald-700",
  aprovada: "bg-green-100 text-green-700",
  nao_executada: "bg-red-100 text-red-700",
};

interface Props {
  templateId: string | null;
}

export function TabTarefasExecutadas({ templateId }: Props) {
  const qc = useQueryClient();

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["template_assignments", templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("id, status, data_prevista, inicio_em, fim_em, responsavel_id, avaliado_id, profiles!operational_assignments_responsavel_id_fkey(nome)")
        .eq("template_id", templateId)
        .not("inicio_em", "is", null)
        .order("data_prevista", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      // Delete related data first
      await (supabase as any).from("operational_field_answers").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_field_reviews").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_execution_check_answers").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_execution_step_logs").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_execution_logs").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_contingencies").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_approval_answers").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_assignment_history").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_audit_trail").delete().eq("assignment_id", id);
      const { error } = await (supabase as any).from("operational_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template_assignments", templateId] });
      toast.success("Tarefa excluída. Uma nova será gerada conforme configuração do ciclo.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!templateId) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Salve o template primeiro para visualizar tarefas executadas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Tarefas Executadas</p>
          <p className="text-xs text-muted-foreground">Tarefas que foram iniciadas neste template. Excluir uma tarefa fará com que seja regenerada conforme o ciclo.</p>
        </div>
        <Badge variant="outline">{assignments.length} tarefa{assignments.length !== 1 ? "s" : ""}</Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa iniciada para este template.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {assignments.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[a.status] || "bg-muted text-muted-foreground"}`}>
                    {STATUS_LABELS[a.status] || a.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Data: {a.data_prevista ? format(new Date(a.data_prevista + "T12:00:00"), "dd/MM/yyyy") : "—"}
                  </span>
                  {a.profiles?.nome && (
                    <span className="text-xs text-muted-foreground">• {a.profiles.nome}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {a.inicio_em && <span>Início: {format(new Date(a.inicio_em), "dd/MM HH:mm")}</span>}
                  {a.fim_em && <span>Fim: {format(new Date(a.fim_em), "dd/MM HH:mm")}</span>}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive h-8 w-8 p-0 shrink-0"
                onClick={() => {
                  if (window.confirm("Excluir esta tarefa? Ela será regenerada conforme a configuração do ciclo.")) {
                    deleteAssignment.mutate(a.id);
                  }
                }}
                disabled={deleteAssignment.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Ao excluir uma tarefa, o sistema irá regenerá-la automaticamente de acordo com a configuração de recorrência e data de início do ciclo.
        </p>
      </div>
    </div>
  );
}
