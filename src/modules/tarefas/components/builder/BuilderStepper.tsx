import { Check } from "lucide-react";
import { WIZARD_STEPS, WizardStepDef, WizardStepId } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  current: WizardStepId;
  completed: Set<WizardStepId>;
  onJump: (id: WizardStepId) => void;
  isEditing: boolean;
  /** Lista filtrada (passos condicionais resolvidos). Default: WIZARD_STEPS. */
  steps?: WizardStepDef[];
}

export function BuilderStepper({ current, completed, onJump, isEditing, steps }: Props) {
  const visible = steps ?? WIZARD_STEPS;
  const currentIdx = visible.findIndex(s => s.id === current);
  return (
    <div className="border-b border-border bg-background sticky top-0 z-10">
      {/* Desktop */}
      <ol className="hidden md:flex items-center gap-1 px-4 py-3 overflow-x-auto">
        {visible.map((s, i) => {
          const isDone = completed.has(s.id);
          const isCurrent = s.id === current;
          const reachable = isEditing || i <= currentIdx || isDone;
          return (
            <li key={s.id} className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(s.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  isCurrent && "bg-primary text-primary-foreground",
                  !isCurrent && isDone && "bg-success/15 text-success hover:bg-success/25",
                  !isCurrent && !isDone && reachable && "text-muted-foreground hover:bg-muted",
                  !reachable && "text-muted-foreground/40 cursor-not-allowed",
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                    isCurrent && "bg-primary-foreground/20",
                    !isCurrent && isDone && "bg-success/30",
                    !isCurrent && !isDone && "bg-muted",
                  )}
                >
                  {isDone && !isCurrent ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {s.short}
              </button>
              {i < visible.length - 1 && <span className="text-muted-foreground/30">›</span>}
            </li>
          );
        })}
      </ol>
      {/* Mobile */}
      <div className="md:hidden px-4 py-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-foreground">
            Passo {currentIdx + 1} de {visible.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {visible[currentIdx]?.label}
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((currentIdx + 1) / Math.max(visible.length, 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
