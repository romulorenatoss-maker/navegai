import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GripVertical, Trash2, Plus, MessageSquare, Package } from "lucide-react";
import { toast } from "sonner";
import {
  listarFluxo,
  adicionarItemFluxo,
  reordenarFluxo,
  removerItemFluxo,
  listarCategoriasProdutos,
  type PropostasFluxoItem,
  type FluxoTipo,
} from "../services/propostasFluxoService";
import { listarPerguntas, type PropostasPerguntaSetup } from "../services/propostasPerguntasService";

interface Props {
  templateId: string;
}

export function FluxoPropostaBuilder({ templateId }: Props) {
  const [itens, setItens] = useState<PropostasFluxoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [tipo, setTipo] = useState<FluxoTipo>("pergunta");
  const [perguntas, setPerguntas] = useState<PropostasPerguntaSetup[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listarFluxo(templateId);
      setItens(data);
      console.log("[fluxo] itens carregados", { total: data.length, ordem: data.map((i) => i.referencia) });
    } catch (e) {
      console.error("[fluxo] erro ao carregar", e);
      toast.error("Erro ao carregar fluxo");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrirModal() {
    setModalOpen(true);
    try {
      const [perg, cats] = await Promise.all([listarPerguntas(true), listarCategoriasProdutos()]);
      setPerguntas(perg.filter((p) => !!p.campo_token));
      setCategorias(cats);
    } catch (e) {
      console.error("[fluxo] erro ao carregar opções", e);
    }
  }

  async function adicionar(tipoSel: FluxoTipo, referencia: string, label: string) {
    try {
      await adicionarItemFluxo({ template_id: templateId, tipo: tipoSel, referencia, label });
      toast.success("Item adicionado ao fluxo");
      setModalOpen(false);
      await carregar();
    } catch (e) {
      console.error("[fluxo] erro ao adicionar", e);
      toast.error("Erro ao adicionar item");
    }
  }

  async function remover(id: string) {
    try {
      await removerItemFluxo(id);
      setItens((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      console.error("[fluxo] erro ao remover", e);
      toast.error("Erro ao remover item");
    }
  }

  async function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = itens.findIndex((i) => i.id === active.id);
    const newIdx = itens.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const novo = arrayMove(itens, oldIdx, newIdx).map((it, idx) => ({ ...it, ordem: idx + 1 }));
    setItens(novo); // otimista
    try {
      await reordenarFluxo(novo.map((it) => ({ id: it.id, ordem: it.ordem })));
      console.log("[fluxo] reordenado", { ordem: novo.map((i) => i.referencia) });
    } catch (e) {
      console.error("[fluxo] erro ao reordenar", e);
      toast.error("Erro ao reordenar — recarregando");
      carregar();
    }
  }

  return (
    <div className="border rounded-md bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Fluxo da proposta</h3>
          <p className="text-xs text-muted-foreground">Defina a ordem das perguntas e blocos. Arraste para reordenar.</p>
        </div>
        <Button type="button" size="sm" onClick={abrirModal}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar ao fluxo
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Carregando fluxo...</div>
      ) : itens.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded">
          Nenhuma etapa no fluxo. Clique em "Adicionar ao fluxo".
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {itens.map((item, idx) => (
                <FluxoLinha key={item.id} item={item} index={idx + 1} onRemove={() => remover(item.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar ao fluxo</DialogTitle>
            <DialogDescription>Escolha entre uma pergunta ou um bloco de produtos.</DialogDescription>
          </DialogHeader>

          <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as FluxoTipo)} className="grid grid-cols-2 gap-2">
            <Label htmlFor="t-pergunta" className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="pergunta" id="t-pergunta" />
              <span className="text-sm">Pergunta</span>
            </Label>
            <Label htmlFor="t-bloco" className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-accent has-[[data-state=checked]]:border-primary">
              <RadioGroupItem value="bloco" id="t-bloco" />
              <span className="text-sm">Bloco (categoria)</span>
            </Label>
          </RadioGroup>

          <div className="max-h-72 overflow-auto border rounded-md divide-y">
            {tipo === "pergunta" ? (
              perguntas.length === 0 ? (
                <span className="block px-3 py-2 text-xs text-muted-foreground">Nenhuma pergunta com campo_token disponível.</span>
              ) : (
                perguntas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => adicionar("pergunta", p.campo_token!, p.pergunta)}
                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2"
                  >
                    <span className="text-sm">{p.pergunta}</span>
                    <code className="text-xs text-muted-foreground">{`{${p.campo_token}}`}</code>
                  </button>
                ))
              )
            ) : (
              categorias.length === 0 ? (
                <span className="block px-3 py-2 text-xs text-muted-foreground">Nenhuma categoria disponível.</span>
              ) : (
                categorias.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => adicionar("bloco", c, `Bloco: ${c}`)}
                    className="w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between gap-2"
                  >
                    <span className="text-sm capitalize">{c}</span>
                    <code className="text-xs text-muted-foreground">{`#${c}`}</code>
                  </button>
                ))
              )
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FluxoLinha({ item, index, onRemove }: { item: PropostasFluxoItem; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const Icon = item.tipo === "pergunta" ? MessageSquare : Package;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 border rounded-md p-2 bg-background"
    >
      <button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="text-xs text-muted-foreground w-6 text-center">{index}</span>
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs uppercase font-medium text-muted-foreground w-16">{item.tipo}</span>
      <span className="text-sm flex-1 truncate">{item.label || item.referencia}</span>
      <code className="text-xs text-muted-foreground">{item.tipo === "bloco" ? `#${item.referencia}` : `{${item.referencia}}`}</code>
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </li>
  );
}
