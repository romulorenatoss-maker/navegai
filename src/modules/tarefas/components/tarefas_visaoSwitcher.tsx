import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { VisaoMeta, VisaoKey } from "@/modules/tarefas/services/tarefas_bucketize";

interface Props {
  visoes: VisaoMeta[];
  value: VisaoKey;
  onChange: (v: VisaoKey) => void;
  isMobile?: boolean;
}

export function VisaoSwitcher({ visoes, value, onChange, isMobile }: Props) {
  if (visoes.length <= 1) return null;
  if (isMobile) {
    return (
      <Select value={value} onValueChange={(v) => onChange(v as VisaoKey)}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {visoes.map((v) => (
            <SelectItem key={v.key} value={v.key}>
              {v.label}{v.count > 0 ? ` (${v.count})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {visoes.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onChange(v.key)}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors",
            value === v.key
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-foreground border-border hover:bg-muted"
          )}
        >
          {v.label}
          {v.count > 0 && (
            <span className={cn(
              "inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] font-bold",
              value === v.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-foreground"
            )}>
              {v.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
