import { Eye, EyeOff, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldForm } from "@/modules/tarefas/types/tarefas_types";

/**
 * Persisted shape (compatível com coluna JSONB existente em operational_template_fields.condicao_visibilidade):
 * null  → sempre visível
 * { campo_tempId: string, operador: Operador, valor?: any }
 */
export type VisibilityOperator =
  | "igual"
  | "diferente"
  | "contem"
  | "vazio"
  | "preenchido"
  | "maior"
  | "menor";

const OPERADOR_LABELS: Record<VisibilityOperator, string> = {
  igual: "é igual a",
  diferente: "é diferente de",
  contem: "contém",
  vazio: "está vazio",
  preenchido: "está preenchido",
  maior: "é maior que",
  menor: "é menor que",
};

const OPERADORES_SEM_VALOR: VisibilityOperator[] = ["vazio", "preenchido"];

interface Props {
  /** Campo atual sendo editado (excluído da lista de candidatos). */
  currentTempId: string;
  /** Todos os campos do template (para listar candidatos). */
  allFields: FieldForm[];
  value: any;
  onChange: (next: any) => void;
}

export function FieldVisibilityEditor({ currentTempId, allFields, value, onChange }: Props) {
  const cond = value && typeof value === "object" ? value : null;
  const enabled = !!cond;

  const candidates = allFields.filter(f => f.tempId !== currentTempId && (f.label || "").trim().length > 0);

  const enable = () => {
    const first = candidates[0];
    onChange({
      campo_tempId: first?.tempId ?? "",
      operador: "igual" as VisibilityOperator,
      valor: "",
    });
  };

  const disable = () => onChange(null);

  const update = (patch: any) => onChange({ ...(cond || {}), ...patch });

  const refField = candidates.find(f => f.tempId === cond?.campo_tempId);
  const op = (cond?.operador as VisibilityOperator) || "igual";
  const semValor = OPERADORES_SEM_VALOR.includes(op);

  // Opções referência (se o campo de origem tem opções fechadas)
  const refOptions: { valor: string; label: string }[] = (refField?.opcoes_regras || [])
    .map((o: any) => ({ valor: o.valor, label: o.label }))
    .filter(o => o.valor);

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {enabled ? <Eye className="w-3.5 h-3.5 text-primary" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />}
          <Label className="text-xs font-medium">Visibilidade condicional</Label>
        </div>
        {enabled ? (
          <Button type="button" variant="ghost" size="sm" onClick={disable} className="h-7 text-xs gap-1">
            <X className="w-3 h-3" /> Sempre visível
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={enable} className="h-7 text-xs"
            disabled={candidates.length === 0}>
            Mostrar somente se…
          </Button>
        )}
      </div>

      {!enabled && (
        <p className="text-[11px] text-muted-foreground">
          {candidates.length === 0
            ? "Crie outros campos primeiro para definir uma regra de visibilidade."
            : "Este campo aparece sempre. Ative para mostrá-lo apenas quando outro campo atender uma condição."}
        </p>
      )}

      {enabled && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-1">
              <Label className="text-[10px] text-muted-foreground">Campo de origem</Label>
              <Select value={cond.campo_tempId || ""} onValueChange={v => update({ campo_tempId: v, valor: "" })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                <SelectContent>
                  {candidates.map(f => (
                    <SelectItem key={f.tempId} value={f.tempId}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Operador</Label>
              <Select value={op} onValueChange={(v: VisibilityOperator) => update({ operador: v, valor: OPERADORES_SEM_VALOR.includes(v) ? null : (cond.valor ?? "") })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(OPERADOR_LABELS) as VisibilityOperator[]).map(k => (
                    <SelectItem key={k} value={k}>{OPERADOR_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Valor</Label>
              {semValor ? (
                <Input value="—" disabled className="h-8 text-xs" />
              ) : refOptions.length > 0 ? (
                <Select value={String(cond.valor ?? "")} onValueChange={v => update({ valor: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
                  <SelectContent>
                    {refOptions.map(o => (
                      <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={String(cond.valor ?? "")}
                  onChange={e => update({ valor: e.target.value })}
                  placeholder="Valor"
                  className="h-8 text-xs"
                />
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Mostrar este campo somente se{" "}
            <span className="font-medium text-foreground">{refField?.label || "(campo)"}</span>{" "}
            <span className="font-medium text-foreground">{OPERADOR_LABELS[op]}</span>
            {!semValor && (
              <> <span className="font-medium text-foreground">{String(cond.valor ?? "")}</span></>
            )}
            .
          </p>
        </div>
      )}
    </div>
  );
}
