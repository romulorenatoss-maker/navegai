import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STATUS_CONFIG } from "@/modules/tarefas/hooks/tarefas_useScoring";

export default function TarefasAgendamentosPage() {
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: agendamentos = [], isLoading } = useQuery({
    queryKey: ["tarefas_agendamentos", hoje],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("id, numero_tarefa, data_prevista, horario_limite, status, template_snapshot, operational_templates(nome)")
        .gte("data_prevista", hoje)
        .order("data_prevista", { ascending: true })
        .order("horario_limite", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          Agenda de Tarefas
        </h1>
        <p className="text-sm text-muted-foreground">Tarefas futuras organizadas por data e horario.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Agendamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando agenda...</p>}
          {!isLoading && agendamentos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa futura encontrada.</p>
          )}
          {agendamentos.map((item: any) => {
            const nome = item.template_snapshot?.nome || item.operational_templates?.nome || "Tarefa";
            const status = STATUS_CONFIG[item.status];
            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">
                    #{String(item.numero_tarefa ?? "").padStart(4, "0")} - {nome}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {item.data_prevista || "--"} {item.horario_limite ? `as ${item.horario_limite}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={status?.class}>{status?.label || item.status}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
