import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ChecklistTemplateManagerProps {
  checklistId: string | null;
}

interface Pergunta {
  id: string;
  pergunta: string;
  peso: number;
  setor_avaliado_id: string | null;
  checklist_id: string | null;
  setores?: { nome: string } | null;
}

export default function ChecklistTemplateManager({ checklistId }: ChecklistTemplateManagerProps) {
  const queryClient = useQueryClient();

  // Fetch all active questions
  const { data: allPerguntas = [] } = useQuery({
    queryKey: ["all_perguntas_for_checklist"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, setor_avaliado_id, checklist_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(nome)")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data || []) as Pergunta[];
    },
  });

  // Toggle question association
  const togglePergunta = useMutation({
    mutationFn: async ({ perguntaId, isLinked }: { perguntaId: string; isLinked: boolean }) => {
      const newChecklistId = isLinked ? null : checklistId;
      const { error } = await (supabase as any)
        .from("perguntas_avaliacao")
        .update({ checklist_id: newChecklistId })
        .eq("id", perguntaId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_perguntas_for_checklist"] });
      queryClient.invalidateQueries({ queryKey: ["tipo_servico_breakdown"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!checklistId) {
    return (
      <div className="space-y-2">
        <Label>Perguntas do Checklist</Label>
        <p className="text-caption text-muted-foreground">Selecione um checklist acima para gerenciar as perguntas associadas.</p>
      </div>
    );
  }

  const linkedCount = allPerguntas.filter(p => p.checklist_id === checklistId).length;

  return (
    <div className="space-y-3">
      <Label>Perguntas do Checklist</Label>
      <p className="text-caption text-muted-foreground">
        Selecione as perguntas que pertencem a este checklist. ({linkedCount} associada{linkedCount !== 1 ? "s" : ""})
      </p>

      {allPerguntas.length === 0 ? (
        <p className="text-caption text-muted-foreground">Nenhuma pergunta cadastrada no sistema.</p>
      ) : (
        <div className="space-y-1.5 border border-border rounded-lg p-3 max-h-60 overflow-y-auto">
          {allPerguntas.map((p) => {
            const isLinked = p.checklist_id === checklistId;
            const isOtherChecklist = p.checklist_id && p.checklist_id !== checklistId;
            return (
              <label
                key={p.id}
                className={`flex items-center gap-3 cursor-pointer hover:bg-muted/50 px-2 py-1.5 rounded-md transition-colors ${isOtherChecklist ? "opacity-50" : ""}`}
              >
                <Checkbox
                  checked={isLinked}
                  disabled={!!isOtherChecklist}
                  onCheckedChange={() => togglePergunta.mutate({ perguntaId: p.id, isLinked })}
                />
                <div className="flex-1 min-w-0">
                  <span className="text-body font-medium text-foreground truncate block">{p.pergunta}</span>
                  <div className="flex gap-2 text-caption text-muted-foreground">
                    <span>Nota: {p.peso}</span>
                    {p.setores?.nome && <span>• {p.setores.nome}</span>}
                    {isOtherChecklist && <span className="text-warning">• Outro checklist</span>}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
