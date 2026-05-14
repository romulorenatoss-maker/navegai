import { useMemo } from "react";
import { Plus, Trash2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ValidadorCheckItemForm,
  ValidadorCategoria,
  AprovadorTipoResposta,
  buildDefaultValidadorItems,
  defaultValidadorManualItem,
} from "./types";

interface Props {
  items: ValidadorCheckItemForm[];
  setItems: React.Dispatch<React.SetStateAction<ValidadorCheckItemForm[]>>;
}

const CATEGORIA_LABEL: Record<ValidadorCategoria, string> = {
  sla: "SLA",
  atraso: "Atraso",
  devolucao: "Devolução",
  evidencia: "Evidência",
  plano_acao: "Plano de Ação",
  conformidade_avaliador: "Conformidade Avaliador",
  conformidade_aprovador: "Conformidade Aprovador",
  manual: "Manual",
};

const CATEGORIA_COLOR: Record<ValidadorCategoria, string> = {
  sla: "bg-blue-100 text-blue-700 border-blue-200",
  atraso: "bg-amber-100 text-amber-700 border-amber-200",
  devolucao: "bg-orange-100 text-orange-700 border-orange-200",
  evidencia: "bg-purple-100 text-purple-700 border-purple-200",
  plano_acao: "bg-red-100 text-red-700 border-red-200",
  conformidade_avaliador: "bg-emerald-100 text-emerald-700 border-emerald-200",
  conformidade_aprovador: "bg-teal-100 text-teal-700 border-teal-200",
  manual: "bg-muted text-foreground border-border",
};

const TIPO_LABEL: Record<AprovadorTipoResposta, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export function StepChecklistValidador({ items, setItems }: Props) {
  const totalPeso = useMemo(() => items.reduce((s, i) => s + (i.peso || 0), 0), [items]);

  const update = (tempId: string, patch: Partial<ValidadorCheckItemForm>) =>
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, ...patch } : i)));

  const remove = (tempId: string) => setItems(prev => prev.filter(i => i.tempId !== tempId));

  const addManual = () => setItems(prev => [...prev, defaultValidadorManualItem()]);

  const restoreDefaults = () => {
    if (!confirm("Restaurar itens padrão de auditoria? Itens manuais serão preservados.")) return;
    setItems(prev => {
      const manuais = prev.filter(i => i.categoria === "manual");
      return [...buildDefaultValidadorItems(), ...manuais];
    });
  };

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2.5">
        <ClipboardCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Checklist do Validador (Auditoria)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audita o processo inteiro: SLA, atrasos, devoluções, evidências, planos de ação e conformidade do avaliador/aprovador.
            Você pode adicionar itens manuais.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso total</div>
          <div className="text-sm font-bold text-primary">{totalPeso}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addManual}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar item manual
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={restoreDefaults}>
          Restaurar padrões
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.tempId} className="border border-border rounded-lg bg-card p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
                {idx + 1}
              </span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0 ${CATEGORIA_COLOR[it.categoria]}`}>
                {CATEGORIA_LABEL[it.categoria]}
              </span>
              <Input
                className="flex-1"
                value={it.pergunta}
                onChange={e => update(it.tempId, { pergunta: e.target.value })}
                placeholder="Pergunta de auditoria"
                maxLength={300}
              />
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => remove(it.tempId)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pl-8">
              <div className="space-y-1">
                <Label className="text-[11px]">Tipo de resposta</Label>
                <Select value={it.tipo_resposta} onValueChange={v => update(it.tempId, { tipo_resposta: v as AprovadorTipoResposta })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIPO_LABEL) as AprovadorTipoResposta[]).map(k => (
                      <SelectItem key={k} value={k} className="text-xs">{TIPO_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Peso</Label>
                <Input
                  type="number" min={0} max={100}
                  className="h-8 text-xs"
                  value={it.peso}
                  onChange={e => update(it.tempId, { peso: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-border/50 bg-muted/30">
                <Label className="text-[11px] leading-tight">Exige obs.</Label>
                <Switch checked={it.exige_observacao} onCheckedChange={v => update(it.tempId, { exige_observacao: v })} />
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-border/50 bg-muted/30">
                <Label className="text-[11px] leading-tight">Exige evidência</Label>
                <Switch checked={it.exige_evidencia} onCheckedChange={v => update(it.tempId, { exige_evidencia: v })} />
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="border border-dashed border-border rounded-lg p-6 text-center text-xs text-muted-foreground">
            Nenhum item configurado. Clique em "Restaurar padrões" para começar.
          </div>
        )}
      </div>
    </div>
  );
}
