import { ListChecks, Play, Eye, ShieldCheck, AlertTriangle, Clock, CheckCheck, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";

export type OperationalChipFilter =
  | "todas"
  | "executar"
  | "avaliar"
  | "aprovar"
  | "plano_acao"
  | "contingencias"
  | "atrasadas"
  | "concluidas";

interface ChipDef {
  key: OperationalChipFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const CHIPS: ChipDef[] = [
  { key: "todas",         label: "Todas",         icon: ListChecks,     color: "#3b82f6" },
  { key: "executar",      label: "Para Executar", icon: Play,           color: "#f97316" },
  { key: "avaliar",       label: "Para Avaliar",  icon: Eye,            color: "#8b5cf6" },
  { key: "aprovar",       label: "Para Aprovar",  icon: ShieldCheck,    color: "#06b6d4" },
  { key: "plano_acao",    label: "Plano de Ação", icon: ClipboardList,  color: "#f59e0b" },
  { key: "contingencias", label: "Contingências", icon: AlertTriangle,  color: "#ef4444" },
  { key: "atrasadas",     label: "Atrasadas",     icon: Clock,          color: "#dc2626" },
  { key: "concluidas",    label: "Concluídas",    icon: CheckCheck,     color: "#22c55e" },
];

interface Props {
  value: OperationalChipFilter;
  onChange: (v: OperationalChipFilter) => void;
  counts: Partial<Record<OperationalChipFilter, number>>;
}

export function OperationalChipFilterBar({ value, onChange, counts }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-3 snap-x">
      {CHIPS.map((c) => {
        const Icon = c.icon;
        const active = value === c.key;
        const count = counts[c.key] ?? 0;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className={cn(
              "snap-start shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium transition-all",
              active
                ? "border-transparent text-white shadow-sm"
                : "bg-card border-border text-muted-foreground hover:bg-muted/60",
            )}
            style={active ? { backgroundColor: c.color } : undefined}
            aria-pressed={active}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{c.label}</span>
            {c.key !== "todas" && count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                  active ? "bg-white/25 text-white" : "bg-muted text-foreground",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default OperationalChipFilterBar;
