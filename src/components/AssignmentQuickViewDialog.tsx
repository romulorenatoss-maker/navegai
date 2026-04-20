import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Props {
  assignmentId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

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

const fmtDate = (d?: string | null, withTime = false) =>
  d ? format(new Date(d), withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: ptBR }) : "—";

export default function AssignmentQuickViewDialog({ assignmentId, open, onOpenChange }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["assignment-quick-view", assignmentId],
    enabled: !!assignmentId && open,
    queryFn: async () => {
      const { data: a, error } = await supabase
        .from("operational_assignments")
        .select(`
          id, numero_tarefa, status, data_prevista, created_at, inicio_em, fim_em,
          horario_inicio_previsto, horario_limite, observacao,
          score_executor, score_avaliador, score_avaliado, score_final_ajustado, pontuacao_obtida,
          template_id,
          operational_templates(nome, descricao),
          responsavel:profiles!operational_assignments_responsavel_id_fkey(id, nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(id, nome),
          avaliado:profiles!operational_assignments_avaliado_id_fkey(id, nome),
          aprovador:profiles!operational_assignments_aprovador_id_fkey(id, nome),
          setor_executor:setores!operational_assignments_setor_executor_id_fkey(id, nome),
          setor_avaliador:setores!operational_assignments_setor_avaliador_id_fkey(id, nome),
          setor_avaliado:setores!operational_assignments_setor_avaliado_id_fkey(id, nome)
        `)
        .eq("id", assignmentId!)
        .maybeSingle();
      if (error) throw error;

      const [{ data: history }, { data: contingencies }] = await Promise.all([
        supabase
          .from("operational_assignment_history")
          .select("id, tipo_evento, etapa, data_hora, usuario_id, profiles:profiles!operational_assignment_history_usuario_id_fkey(nome)")
          .eq("assignment_id", assignmentId!)
          .order("data_hora", { ascending: false })
          .limit(20),
        supabase
          .from("operational_contingencies")
          .select("id, numero_contingencia, descricao, status, created_at")
          .eq("assignment_id", assignmentId!)
          .order("created_at", { ascending: false }),
      ]);

      return { a, history: history || [], contingencies: contingencies || [] };
    },
  });

  const a: any = data?.a;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Tarefa #{a?.numero_tarefa ?? "…"}
          </DialogTitle>
          <DialogDescription>{a?.operational_templates?.nome ?? "Carregando..."}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] px-6 pb-6">
          {isLoading || !a ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center text-xs font-medium px-2 py-0.5 rounded capitalize", STATUS_COLORS[a.status] || "bg-muted text-muted-foreground")}>
                  {a.status?.replace(/_/g, " ")}
                </span>
                {a.operational_templates?.descricao && (
                  <span className="text-xs text-muted-foreground">{a.operational_templates.descricao}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Criada em" value={fmtDate(a.created_at, true)} />
                <Info label="Data prevista" value={fmtDate(a.data_prevista)} />
                <Info label="Início previsto" value={a.horario_inicio_previsto ?? "—"} />
                <Info label="Horário limite" value={a.horario_limite ?? "—"} />
                <Info label="Iniciada em" value={fmtDate(a.inicio_em, true)} />
                <Info label="Finalizada em" value={fmtDate(a.fim_em, true)} />
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-semibold mb-2">Responsáveis</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Info label="Executor" value={a.responsavel?.nome ?? "—"} sub={a.setor_executor?.nome} />
                  <Info label="Avaliador" value={a.avaliador?.nome ?? "—"} sub={a.setor_avaliador?.nome} />
                  <Info label="Avaliado" value={a.avaliado?.nome ?? "—"} sub={a.setor_avaliado?.nome} />
                  <Info label="Aprovador" value={a.aprovador?.nome ?? "—"} />
                </div>
              </div>

              {(a.score_executor != null || a.score_avaliador != null || a.score_final_ajustado != null) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Pontuações</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <Info label="Executor" value={a.score_executor ?? "—"} />
                      <Info label="Avaliador" value={a.score_avaliador ?? "—"} />
                      <Info label="Avaliado" value={a.score_avaliado ?? "—"} />
                      <Info label="Final ajustado" value={a.score_final_ajustado ?? a.pontuacao_obtida ?? "—"} />
                    </div>
                  </div>
                </>
              )}

              {a.observacao && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Observação</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.observacao}</p>
                  </div>
                </>
              )}

              {data!.contingencies.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Planos de Ação ({data!.contingencies.length})</h4>
                    <div className="space-y-2">
                      {data!.contingencies.map((c: any) => (
                        <div key={c.id} className="border rounded-md p-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">#{c.numero_contingencia}</span>
                            <Badge variant="outline" className="capitalize">{c.status?.replace(/_/g, " ")}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.descricao}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {data!.history.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Histórico recente</h4>
                    <div className="space-y-1.5">
                      {data!.history.map((h: any) => (
                        <div key={h.id} className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground min-w-[110px]">{fmtDate(h.data_hora, true)}</span>
                          <div className="flex-1">
                            <span className="font-medium capitalize">{h.tipo_evento?.replace(/_/g, " ")}</span>
                            {h.etapa && <span className="text-muted-foreground"> · {h.etapa}</span>}
                            {h.profiles?.nome && <span className="text-muted-foreground"> · {h.profiles.nome}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, sub }: { label: string; value: any; sub?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
