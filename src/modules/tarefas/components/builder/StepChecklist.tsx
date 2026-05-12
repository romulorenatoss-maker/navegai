import { Plus, Trash2, GripVertical, Camera, MessageSquare, AlertTriangle, Lock } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { CheckItemForm, defaultCheckItem } from "./types";

interface Props {
  items: CheckItemForm[];
  setItems: React.Dispatch<React.SetStateAction<CheckItemForm[]>>;
  protectedIds?: Set<string>;
}

const TIPO_LABELS: Record<CheckItemForm["tipo_resposta"], string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  texto: "Texto livre",
  numero: "Número",
};

export function StepChecklist({ items, setItems, protectedIds }: Props) {
  const isProtected = (it: CheckItemForm) => !!(it.id && protectedIds?.has(it.id));
  const add = () => setItems(prev => [...prev, defaultCheckItem(prev.length)]);
  const remove = (tempId: string) => {
    const target = items.find(i => i.tempId === tempId);
    if (target && isProtected(target)) {
      toast.warning("Este item já possui respostas e não pode ser removido (preserva o histórico).");
      return;
    }
    setItems(prev => prev.filter(i => i.tempId !== tempId).map((i, idx) => ({ ...i, ordem: idx })));
  };
  const update = (tempId: string, patch: Partial<CheckItemForm>) =>
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, ...patch } : i)));

  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    setItems(prev => {
      const arr = [...prev].sort((a, b) => a.ordem - b.ordem);
      const [moved] = arr.splice(r.source.index, 1);
      arr.splice(r.destination!.index, 0, moved);
      return arr.map((i, idx) => ({ ...i, ordem: idx }));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-foreground">Checklist operacional</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Itens de execução rápida (ticagem). Separados das perguntas avaliativas (Campos).
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Novo item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <p className="text-sm">Nenhum item de checklist.</p>
          <p className="text-xs mt-1">Use checklist para marcações operacionais rápidas.</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="checklist-items">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {[...items]
                  .sort((a, b) => a.ordem - b.ordem)
                  .map((it, idx) => (
                    <Draggable key={it.tempId} draggableId={it.tempId} index={idx}>
                      {(prov) => (
                        <div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          className="border border-border rounded-lg bg-card p-3"
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              {...prov.dragHandleProps}
                              className="text-muted-foreground/50 hover:text-foreground mt-2 shrink-0"
                              aria-label="Arrastar"
                            >
                              <GripVertical className="w-4 h-4" />
                            </button>
                            <div className="flex-1 space-y-2.5">
                              <Input
                                value={it.pergunta}
                                onChange={e => update(it.tempId, { pergunta: e.target.value })}
                                placeholder="Pergunta / item operacional"
                                className="font-medium"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">Tipo de resposta</Label>
                                  <Select
                                    value={it.tipo_resposta}
                                    onValueChange={v => update(it.tempId, { tipo_resposta: v as any })}
                                  >
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(TIPO_LABELS).map(([k, l]) => (
                                        <SelectItem key={k} value={k}>{l}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-[11px] text-muted-foreground">Peso</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={it.peso}
                                    onChange={e => update(it.tempId, { peso: Number(e.target.value) || 0 })}
                                    className="h-9"
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-3 pt-1">
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <Switch
                                    checked={it.exige_foto}
                                    onCheckedChange={v => update(it.tempId, { exige_foto: v })}
                                  />
                                  <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                                  Foto
                                </label>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <Switch
                                    checked={it.exige_observacao}
                                    onCheckedChange={v => update(it.tempId, { exige_observacao: v })}
                                  />
                                  <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                                  Observação
                                </label>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                  <Switch
                                    checked={it.gera_contingencia_se_reprovado}
                                    onCheckedChange={v => update(it.tempId, { gera_contingencia_se_reprovado: v })}
                                  />
                                  <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                                  Gera contingência se reprovado
                                </label>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(it.tempId)}
                              className="text-destructive shrink-0"
                              aria-label="Remover"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
