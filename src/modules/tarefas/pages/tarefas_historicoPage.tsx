import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TarefasHistoricoPage() {
  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ["tarefas_historico"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_audit_trail")
        .select("id, assignment_id, acao, origem, detalhes, created_at, profiles:executado_por(nome)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Historico de Tarefas
        </h1>
        <p className="text-sm text-muted-foreground">Ultimos eventos registrados no modulo Tarefas.</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Eventos recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando historico...</p>}
          {!isLoading && eventos.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado.</p>
          )}
          {eventos.map((evento: any) => (
            <div key={evento.id} className="rounded-md border border-border p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <p className="text-sm font-medium break-words">{evento.acao || "Evento"}</p>
                <span className="text-xs text-muted-foreground">
                  {evento.created_at ? new Date(evento.created_at).toLocaleString("pt-BR") : ""}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Origem: {evento.origem || "-"} | Usuario: {evento.profiles?.nome || "-"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
