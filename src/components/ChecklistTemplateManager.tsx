import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface ChecklistTemplateManagerProps {
  tipoServicoId: string | null; // null when creating new
}

interface Checklist {
  id: string;
  titulo: string;
  tipo_servico_id: string | null;
}

interface Pergunta {
  id: string;
  pergunta: string;
  peso: number;
  setor_avaliado_id: string | null;
  setores?: { nome: string } | null;
}

export default function ChecklistTemplateManager({ tipoServicoId }: ChecklistTemplateManagerProps) {
  const queryClient = useQueryClient();
  const [newChecklistTitle, setNewChecklistTitle] = useState("");
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);

  // Fetch checklists for this service type
  const { data: checklists = [] } = useQuery({
    queryKey: ["checklists_for_tipo", tipoServicoId],
    queryFn: async () => {
      if (!tipoServicoId) return [];
      const { data, error } = await supabase
        .from("checklists")
        .select("id, titulo, tipo_servico_id")
        .eq("tipo_servico_id", tipoServicoId)
        .order("titulo");
      if (error) throw error;
      return data as Checklist[];
    },
    enabled: !!tipoServicoId,
  });

  // Fetch all available questions
  const { data: allPerguntas = [] } = useQuery({
    queryKey: ["all_perguntas_for_checklist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perguntas_avaliacao")
        .select("id, pergunta, peso, setor_avaliado_id, setores!perguntas_avaliacao_setor_avaliado_id_fkey(nome)")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as Pergunta[];
    },
  });

  // Fetch linked question IDs for expanded checklist
  const { data: linkedPerguntaIds = [] } = useQuery({
    queryKey: ["checklist_perguntas_links", expandedChecklist],
    queryFn: async () => {
      if (!expandedChecklist) return [];
      const { data } = await (supabase as any)
        .from("checklist_perguntas")
        .select("pergunta_id")
        .eq("checklist_id", expandedChecklist);
      return (data || []).map((r: any) => r.pergunta_id as string);
    },
    enabled: !!expandedChecklist,
  });

  // Create checklist
  const createChecklist = useMutation({
    mutationFn: async () => {
      if (!tipoServicoId || !newChecklistTitle.trim()) return;
      const { error } = await supabase.from("checklists").insert({
        titulo: newChecklistTitle.trim(),
        tipo_servico_id: tipoServicoId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists_for_tipo", tipoServicoId] });
      setNewChecklistTitle("");
      toast.success("Checklist criado.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete checklist
  const deleteChecklist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists_for_tipo", tipoServicoId] });
      toast.success("Checklist excluído.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Toggle question link
  const togglePergunta = useMutation({
    mutationFn: async ({ checklistId, perguntaId, linked }: { checklistId: string; perguntaId: string; linked: boolean }) => {
      if (linked) {
        await (supabase as any).from("checklist_perguntas").delete().eq("checklist_id", checklistId).eq("pergunta_id", perguntaId);
      } else {
        await (supabase as any).from("checklist_perguntas").insert({ checklist_id: checklistId, pergunta_id: perguntaId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist_perguntas_links", expandedChecklist] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!tipoServicoId) {
    return (
      <div className="space-y-2">
        <Label>Checklists Associados</Label>
        <p className="text-caption text-muted-foreground">Salve o tipo de serviço primeiro para gerenciar checklists.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label>Checklists Associados</Label>
      <p className="text-caption text-muted-foreground">
        Cada checklist agrupa perguntas que serão carregadas na avaliação deste tipo de serviço.
      </p>

      {/* Create new checklist */}
      <div className="flex gap-2">
        <Input
          placeholder="Título do novo checklist"
          value={newChecklistTitle}
          onChange={(e) => setNewChecklistTitle(e.target.value)}
          className="flex-1"
        />
        <Button
          type="button"
          size="sm"
          onClick={() => createChecklist.mutate()}
          disabled={!newChecklistTitle.trim() || createChecklist.isPending}
          className="press-effect"
        >
          <Plus className="w-4 h-4 mr-1" /> Criar
        </Button>
      </div>

      {/* Checklist list */}
      {checklists.length === 0 ? (
        <p className="text-caption text-muted-foreground">Nenhum checklist associado.</p>
      ) : (
        <div className="space-y-2">
          {checklists.map((cl) => (
            <ChecklistItem
              key={cl.id}
              checklist={cl}
              isExpanded={expandedChecklist === cl.id}
              onToggleExpand={() => setExpandedChecklist(expandedChecklist === cl.id ? null : cl.id)}
              onDelete={() => deleteChecklist.mutate(cl.id)}
              allPerguntas={allPerguntas}
              linkedPerguntaIds={expandedChecklist === cl.id ? linkedPerguntaIds : []}
              onTogglePergunta={(perguntaId, linked) =>
                togglePergunta.mutate({ checklistId: cl.id, perguntaId, linked })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistItem({
  checklist,
  isExpanded,
  onToggleExpand,
  onDelete,
  allPerguntas,
  linkedPerguntaIds,
  onTogglePergunta,
}: {
  checklist: Checklist;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  allPerguntas: Pergunta[];
  linkedPerguntaIds: string[];
  onTogglePergunta: (perguntaId: string, linked: boolean) => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="text-body font-medium text-foreground">{checklist.titulo}</span>
          <span className="text-caption text-muted-foreground">
            ({linkedPerguntaIds.length} perguntas)
          </span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="press-effect text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
          {allPerguntas.length === 0 ? (
            <p className="text-caption text-muted-foreground">Nenhuma pergunta cadastrada no sistema.</p>
          ) : (
            allPerguntas.map((p) => {
              const isLinked = linkedPerguntaIds.includes(p.id);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 px-2 py-1.5 rounded-md transition-colors"
                >
                  <Checkbox
                    checked={isLinked}
                    onCheckedChange={() => onTogglePergunta(p.id, isLinked)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-body font-medium text-foreground truncate block">{p.pergunta}</span>
                    <div className="flex gap-2 text-caption text-muted-foreground">
                      <span>Nota: {p.peso}</span>
                      {p.setores?.nome && <span>• {p.setores.nome}</span>}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
