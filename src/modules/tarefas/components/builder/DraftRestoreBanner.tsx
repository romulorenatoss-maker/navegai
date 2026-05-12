import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}

export function DraftRestoreBanner({ savedAt, onRestore, onDiscard }: Props) {
  const date = new Date(savedAt);
  const ts = date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return (
    <div className="flex items-start gap-3 px-3 py-2 mx-3 mt-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700">
      <History className="w-4 h-4 text-amber-700 dark:text-amber-300 mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          Encontramos um rascunho não salvo
        </p>
        <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
          Última edição local: {ts}. Deseja restaurar?
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button type="button" size="sm" variant="outline" onClick={onRestore} className="h-7 text-xs">
          Restaurar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDiscard}
          className="h-7 w-7 p-0 text-amber-800 dark:text-amber-200"
          aria-label="Descartar rascunho"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
