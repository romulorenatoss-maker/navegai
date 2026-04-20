import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, AlertTriangle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em Andamento",
  aguardando_avaliacao: "Aguardando Avaliação",
  aguardando_aprovacao: "Aguardando Aprovação",
  devolvida: "Devolvida",
  contingenciado: "Contingenciado",
  contingencia: "Plano de Ação",
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
  contingenciado: "bg-orange-100 text-orange-800",
  contingencia: "bg-orange-100 text-orange-800",
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
    queryKey: ["operational_template_assignments", templateId],
    queryFn: async () => {
      if (!templateId) return [];
      const { data, error } = await (supabase as any)
        .from("operational_assignments")
        .select("id, numero_tarefa, status, data_prevista, inicio_em, fim_em, responsavel_id, avaliado_id, profiles!operational_assignments_responsavel_id_fkey(nome)")
        .eq("template_id", templateId)
        .order("data_prevista", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!templateId,
  });

  const generateAssignment = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Template não salvo");

      // Fetch template
      const { data: t, error: tErr } = await (supabase as any)
        .from("operational_templates")
        .select("*")
        .eq("id", templateId)
        .single();
      if (tErr) throw tErr;

      const executorId = t.executor_profile_id || t.responsavel_id;
      if (!executorId) throw new Error("Nenhum executor configurado no template.");

      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      // Check if already exists for today
      const { data: existing } = await (supabase as any)
        .from("operational_assignments")
        .select("id")
        .eq("template_id", templateId)
        .eq("data_prevista", todayStr)
        .eq("responsavel_id", executorId)
        .maybeSingle();

      if (existing) throw new Error("Já existe uma tarefa para hoje neste template.");

      // Build snapshot
      const { data: sections } = await (supabase as any)
        .from("operational_template_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("ordem");

      const { data: fields } = await (supabase as any)
        .from("operational_template_fields")
        .select("*")
        .eq("template_id", templateId)
        .order("ordem");

      const snapshot = {
        versao: t.versao || 1,
        nome: t.nome,
        descricao: t.descricao,
        sla_horas: t.sla_horas || 24,
        permite_devolucao_parcial: t.permite_devolucao_parcial || false,
        requer_aprovacao_gestor: t.requer_aprovacao_gestor || false,
        bloquear_fechamento_com_contingencia: t.bloquear_fechamento_com_contingencia || false,
        gerar_contingencia_automatica: t.gerar_contingencia_automatica || false,
        peso_recorrencia: t.peso_recorrencia || 1.0,
        modo_pontuacao: t.modo_pontuacao,
        destino_score: t.destino_score,
        horario_inicio_previsto: t.horario_inicio_previsto,
        horario_limite_execucao: t.horario_limite_execucao,
        tolerancia_minutos: t.tolerancia_minutos || 0,
        responsaveis: {
          executor_profile_id: t.executor_profile_id || null,
          executor_setor_id: t.executor_setor_id || null,
          avaliador_profile_id: t.avaliador_profile_id || null,
          avaliador_setor_id: t.avaliador_setor_id || null,
          avaliado_profile_id: t.avaliado_profile_id || null,
          avaliado_setor_id: t.avaliado_setor_id || null,
          aprovador_profile_id: t.aprovador_profile_id || null,
          aprovador_setor_id: t.aprovador_setor_id || null,
          validador_contingencia_profile_id: t.validador_contingencia_profile_id || null,
          validador_contingencia_setor_id: t.validador_contingencia_setor_id || null,
        },
        sections: (sections || []).map((s: any) => ({
          id: s.id,
          nome: s.nome,
          descricao: s.descricao,
          peso: s.peso,
          ordem: s.ordem,
          cor: s.cor,
          horario_inicio: s.horario_inicio,
          horario_fim: s.horario_fim,
        })),
        fields: (fields || []).map((f: any) => ({
          id: f.id,
          section_id: f.section_id,
          label: f.label,
          descricao: f.descricao,
          tipo: f.tipo,
          ordem: f.ordem,
          obrigatorio: f.obrigatorio,
          peso: f.peso,
          nota_maxima: f.nota_maxima,
          penalidade_reprovacao: f.penalidade_reprovacao,
          impacta_score: f.impacta_score,
          criticidade: f.criticidade,
          gera_contingencia: f.gera_contingencia,
          exige_evidencia: f.exige_evidencia,
          tipo_evidencia: f.tipo_evidencia,
          opcoes: f.opcoes,
          opcoes_regras: f.opcoes_regras,
          condicao_visibilidade: f.condicao_visibilidade,
          validacao: f.validacao,
          formula: f.formula,
          visivel_para: f.visivel_para,
          editavel_por: f.editavel_por,
        })),
      };

      const { error: insErr } = await (supabase as any)
        .from("operational_assignments")
        .insert({
          template_id: t.id,
          responsavel_id: executorId,
          avaliador_id: t.avaliador_profile_id || null,
          avaliado_id: t.avaliado_profile_id || null,
          aprovador_id: t.aprovador_profile_id || null,
          validador_contingencia_id: t.validador_contingencia_profile_id || null,
          setor_executor_id: t.executor_setor_id || t.setor_id || null,
          setor_avaliador_id: t.avaliador_setor_id || null,
          setor_avaliado_id: t.avaliado_setor_id || null,
          data_prevista: todayStr,
          horario_inicio_previsto: t.horario_inicio_previsto || null,
          horario_limite: t.horario_limite_execucao || null,
          status: "pendente",
          template_versao: t.versao || 1,
          template_snapshot: snapshot,
          rodada_atual: 1,
        });

      if (insErr) throw insErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_template_assignments", templateId] });
      toast.success("Tarefa gerada com sucesso para hoje!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAssignment = useMutation({
    mutationFn: async (id: string) => {
      // Delete all related data — order matters for FK constraints without cascade
      // Contingency resolution logs (FK to contingencies)
      const { data: contIds } = await (supabase as any)
        .from("operational_contingencies")
        .select("id")
        .eq("assignment_id", id);
      if (contIds?.length) {
        const ids = contIds.map((c: any) => c.id);
        await (supabase as any).from("operational_contingency_resolution_logs").delete().in("contingency_id", ids);
      }
      // Score logs and overrides
      await (supabase as any).from("operational_score_logs").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_score_overrides").delete().eq("assignment_id", id);
      // Field reviews and answers
      await (supabase as any).from("operational_field_reviews").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_field_answers").delete().eq("assignment_id", id);
      // Execution data
      await (supabase as any).from("operational_execution_check_answers").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_execution_step_logs").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_execution_logs").delete().eq("assignment_id", id);
      // Contingencies (after resolution logs)
      await (supabase as any).from("operational_contingencies").delete().eq("assignment_id", id);
      // Approval and history
      await (supabase as any).from("operational_approval_answers").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_assignment_history").delete().eq("assignment_id", id);
      await (supabase as any).from("operational_audit_trail").delete().eq("assignment_id", id);
      // Finally, the assignment itself
      const { error } = await (supabase as any).from("operational_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_template_assignments", templateId] });
      toast.success("Tarefa e todos os registros vinculados excluídos.");
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
          <p className="text-xs text-muted-foreground">Gerencie tarefas deste template. Use o botão "Gerar Tarefa" para criar manualmente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{assignments.length} tarefa{assignments.length !== 1 ? "s" : ""}</Badge>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={() => generateAssignment.mutate()}
            disabled={generateAssignment.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            {generateAssignment.isPending ? "Gerando..." : "Gerar Tarefa"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma tarefa gerada para este template.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {assignments.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between p-3 bg-card rounded-lg border border-border">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {a.numero_tarefa && (
                    <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      #{String(a.numero_tarefa).padStart(4, "0")}
                    </span>
                  )}
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
                  if (window.confirm("Excluir esta tarefa?")) {
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
          "Gerar Tarefa" cria uma tarefa para hoje com todos os horários e responsáveis configurados. Ela aparecerá imediatamente na fila de execução.
        </p>
      </div>
    </div>
  );
}
