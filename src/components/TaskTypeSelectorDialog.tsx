import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, Workflow, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TaskType = "simples" | "inspecao";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (type: TaskType) => void;
}

/**
 * Seletor inicial: pergunta o tipo de tarefa antes de abrir o QuickTaskDialog.
 * Layout otimizado para mobile (cards verticais empilhados, área de toque grande).
 */
export default function TaskTypeSelectorDialog({ open, onOpenChange, onPick }: Props) {
  const options: { type: TaskType; title: string; desc: string; icon: any; accent: string }[] = [
    {
      type: "simples",
      title: "Tarefa Simples",
      desc: "Uma única lista de campos / perguntas. Ideal para tarefas rápidas, lembretes ou checklists curtos.",
      icon: ClipboardList,
      accent: "from-primary/10 to-primary/5 border-primary/30 hover:border-primary",
    },
    {
      type: "inspecao",
      title: "Inspeção por Etapa",
      desc: "Workflow estruturado com seções/etapas, evidências e regras de plano de ação. Use para auditorias e inspeções.",
      icon: Workflow,
      accent: "from-amber-500/10 to-amber-500/5 border-amber-500/30 hover:border-amber-500",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">Qual tipo de tarefa deseja criar?</DialogTitle>
          <DialogDescription className="text-xs">
            Escolha o formato que melhor se adapta ao trabalho.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.type}
                onClick={() => onPick(o.type)}
                className={cn(
                  "w-full text-left rounded-lg border-2 p-4 transition-all bg-gradient-to-br",
                  "active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring",
                  "min-h-[88px] flex items-start gap-3 group",
                  o.accent
                )}
              >
                <div className="rounded-md bg-card p-2 shrink-0 border border-border">
                  <Icon className="w-5 h-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{o.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{o.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            );
          })}

          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
