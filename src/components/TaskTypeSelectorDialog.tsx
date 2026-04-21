import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ClipboardList, Workflow, ChevronRight, ChevronLeft, Building2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TaskType = "simples" | "inspecao";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Recebe tipo + setor (setor pode ser "" se usuário pular) */
  onPick: (data: { type: TaskType; setorId: string }) => void;
}

/**
 * Wizard 2 passos: 1) Tipo de tarefa  2) Setor.
 * Mobile-first. O setor escolhido aqui filtra a lista de avaliados no QuickTaskDialog.
 */
export default function TaskTypeSelectorDialog({ open, onOpenChange, onPick }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [type, setType] = useState<TaskType | null>(null);
  const [setorId, setSetorId] = useState<string>("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setType(null);
      setSetorId("");
    }
  }, [open]);

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_taskpicker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const options: { type: TaskType; title: string; desc: string; icon: any; accent: string }[] = useMemo(() => ([
    {
      type: "simples",
      title: "Tarefa Simples",
      desc: "Lista única de campos. Ideal para checklists curtos.",
      icon: ClipboardList,
      accent: "from-primary/10 to-primary/5 border-primary/30 hover:border-primary",
    },
    {
      type: "inspecao",
      title: "Inspeção por Etapa",
      desc: "Workflow com etapas, evidências e plano de ação.",
      icon: Workflow,
      accent: "from-amber-500/10 to-amber-500/5 border-amber-500/30 hover:border-amber-500",
    },
  ]), []);

  const handleAdvance = () => {
    if (step === 1 && type) setStep(2);
  };

  const handleConfirm = () => {
    if (!type) return;
    onPick({ type, setorId });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">
            {step === 1 ? "Qual tipo de tarefa deseja criar?" : "Para qual setor?"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === 1
              ? "Escolha o formato que melhor se adapta ao trabalho."
              : "Os avaliados serão filtrados pelos colaboradores do setor escolhido."}
          </DialogDescription>

          {/* Stepper */}
          <div className="flex items-center gap-1.5 mt-3">
            {[1, 2].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  step >= n ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="px-5 pb-5 space-y-3">
            {options.map((o) => {
              const Icon = o.icon;
              const selected = type === o.type;
              return (
                <button
                  key={o.type}
                  onClick={() => setType(o.type)}
                  className={cn(
                    "w-full text-left rounded-lg border-2 p-4 transition-all bg-gradient-to-br",
                    "active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring",
                    "min-h-[88px] flex items-start gap-3 group",
                    o.accent,
                    selected && "ring-2 ring-primary border-primary"
                  )}
                >
                  <div className="rounded-md bg-card p-2 shrink-0 border border-border">
                    <Icon className="w-5 h-5 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{o.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{o.desc}</p>
                  </div>
                  {selected ? (
                    <Check className="w-4 h-4 text-primary self-center shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground self-center shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  )}
                </button>
              );
            })}

            <div className="flex items-center gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleAdvance} disabled={!type}>
                Avançar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="px-5 pb-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Setor da tarefa
              </Label>
              <Select value={setorId || "__none"} onValueChange={(v) => setSetorId(v === "__none" ? "" : v)}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Selecionar setor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem setor (todos os colaboradores)</SelectItem>
                  {(setores as any[]).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Se escolher um setor, somente os colaboradores vinculados a ele aparecerão na lista de avaliados.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="flex-1">
                <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                Continuar <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
