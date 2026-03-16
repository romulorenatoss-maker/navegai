import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, RefreshCw, Loader2, UserCheck } from "lucide-react";

export default function LeadsFinalizadosPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-finalizados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("status_lead", "aguardando_decisao_avaliador")
        .order("updated_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: configFluxo } = useQuery({
    queryKey: ["config-fluxo-leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("configuracao_fluxo_leads").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rotina = [] } = useQuery({
    queryKey: ["rotina-tentativas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rotina_tentativas_leads").select("*").order("tentativa_numero");
      if (error) throw error;
      return data;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");
      await supabase.from("leads").update({ status_lead: "arquivado" }).eq("id", leadId);
      await supabase.from("lead_historico").insert({
        lead_id: leadId,
        usuario_id: profile.id,
        tipo_evento: "lead_arquivado",
        descricao: "Lead arquivado pelo avaliador.",
      });
    },
    onSuccess: () => {
      toast.success("Lead arquivado.");
      queryClient.invalidateQueries({ queryKey: ["leads-finalizados"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const restartMutation = useMutation({
    mutationFn: async (leadId: string) => {
      if (!profile) throw new Error("Perfil não encontrado.");

      // Reset lead status
      await supabase.from("leads").update({ status_lead: "em_contato" }).eq("id", leadId);

      // Create first tarefa
      const firstRotina = rotina.find((r: any) => r.tentativa_numero === 1);
      const periodo = firstRotina?.periodo_contato || "manha";
      const diasApos = firstRotina?.dias_apos_anterior || 0;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + diasApos);
      const periodoHora = periodo === "manha" ? 9 : periodo === "tarde" ? 14 : 19;
      nextDate.setHours(periodoHora, 0, 0, 0);

      await supabase.from("lead_tarefas_contato").insert({
        lead_id: leadId,
        tentativa: 1,
        data_contato: nextDate.toISOString(),
        periodo,
        status: "pendente",
        responsavel_id: profile.id,
      });

      await supabase.from("lead_historico").insert({
        lead_id: leadId,
        usuario_id: profile.id,
        tipo_evento: "rotina_reiniciada",
        descricao: "Rotina de tentativas reiniciada pelo avaliador.",
      });
    },
    onSuccess: () => {
      toast.success("Rotina reiniciada!");
      queryClient.invalidateQueries({ queryKey: ["leads-finalizados"] });
      queryClient.invalidateQueries({ queryKey: ["fila-tarefas-leads"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const fmtDate = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }); } catch { return d; }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <UserCheck className="w-5 h-5" /> Leads com Tentativas Finalizadas
        </h1>
        <p className="text-sm text-muted-foreground">
          Leads aguardando decisão do avaliador após finalizar todas as tentativas.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Aguardando Decisão
            <Badge variant="secondary" className="text-xs">{leads.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : leads.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Nenhum lead aguardando decisão</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Última Atualização</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead: any) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium text-sm">{lead.nome}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(lead.updated_at)}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => archiveMutation.mutate(lead.id)}
                          disabled={archiveMutation.isPending}
                          className="press-effect"
                        >
                          <Archive className="w-3.5 h-3.5 mr-1" /> Arquivar
                        </Button>
                        {configFluxo?.permitir_reiniciar_rotina && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => restartMutation.mutate(lead.id)}
                            disabled={restartMutation.isPending}
                            className="press-effect"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reiniciar Rotina
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
