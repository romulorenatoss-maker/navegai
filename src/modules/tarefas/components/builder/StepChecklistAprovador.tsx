import { useEffect, useMemo } from "react";
import { ShieldCheck, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldForm } from "@/modules/tarefas/types/tarefas_types";
import {
  AprovadorCheckItemForm,
  AprovadorTipoResposta,
  defaultAprovadorCheckItem,
} from "./types";

interface Props {
  fields: FieldForm[];
  items: AprovadorCheckItemForm[];
  setItems: React.Dispatch<React.SetStateAction<AprovadorCheckItemForm[]>>;
}

const TIPO_LABEL: Record<AprovadorTipoResposta, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export function StepChecklistAprovador({ fields, items, setItems }: Props) {
  // Replicação automática (idempotente):
  // - cria item para cada field novo
  // - remove itens órfãos (field excluído)
  // - mantém ajustes locais (peso, tipo, evidência…) via field_id
  // - atualiza o cache field_label/pergunta_padrao quando o label muda
  useEffect(() => {
    setItems(prev => {
      const byField = new Map(prev.map(i => [i.field_id, i]));
      const fieldIds = new Set(fields.map(f => f.tempId));

      // Itens novos + atualização de label
      const next: AprovadorCheckItemForm[] = fields.map(f => {
        const existing = byField.get(f.tempId);
        if (existing) {
          // só atualiza label/pergunta_padrao se ainda estava no padrão antigo
          const oldLabel = existing.field_label || "";
          const labelChanged = oldLabel !== f.label;
          const wasDefaultPergunta =
            !existing.pergunta_padrao ||
            existing.pergunta_padrao === `Aprovador confirma: ${oldLabel}?`;
          return {
            ...existing,
            field_label: f.label,
            pergunta_padrao:
              labelChanged && wasDefaultPergunta
                ? `Aprovador confirma: ${f.label}?`
                : existing.pergunta_padrao,
          };
        }
        return defaultAprovadorCheckItem(f.tempId, f.label || "Pergunta sem nome");
      });

      // Mantém ordem por fields; órfãos já removidos por filtro implícito acima
      const orphans = prev.filter(i => !fieldIds.has(i.field_id));
      if (next.length === prev.length && orphans.length === 0) {
        // possivelmente nada mudou — comparar superficialmente
        const same = next.every((n, idx) => {
          const p = prev[idx];
          return p && p.field_id === n.field_id && p.field_label === n.field_label && p.pergunta_padrao === n.pergunta_padrao;
        });
        if (same) return prev;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const update = (tempId: string, patch: Partial<AprovadorCheckItemForm>) =>
    setItems(prev => prev.map(i => (i.tempId === tempId ? { ...i, ...patch } : i)));

  const totalPeso = useMemo(() => items.reduce((s, i) => s + (i.peso || 0), 0), [items]);

  if (fields.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg p-8 text-center">
        <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground">Nenhuma pergunta operacional ainda</p>
        <p className="text-xs text-muted-foreground mt-1">
          Adicione perguntas na aba <strong>Campos</strong> para que o aprovador tenha o que verificar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex items-start gap-2.5">
        <ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Checklist do Aprovador Final</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cada pergunta da aba Campos gerou automaticamente um item de aprovação. Ajuste peso, tipo de resposta e
            comportamentos (devolução, plano de ação, evidência) por item.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso total</div>
          <div className="text-sm font-bold text-primary">{totalPeso}</div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.tempId} className="border border-border rounded-lg bg-card p-3 space-y-3">
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Pergunta original: <span className="text-foreground font-medium normal-case">{it.field_label || "—"}</span>
                </div>
                <Input
                  className="mt-1"
                  value={it.pergunta_padrao}
                  onChange={e => update(it.tempId, { pergunta_padrao: e.target.value })}
                  placeholder="Pergunta exibida ao aprovador"
                  maxLength={300}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
              <ToggleField label="Exige observação" checked={it.exige_observacao} onChange={v => update(it.tempId, { exige_observacao: v })} />
              <ToggleField label="Exige evidência" checked={it.exige_evidencia} onChange={v => update(it.tempId, { exige_evidencia: v })} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 border-t border-border/50">
              <ToggleField label="Permite devolução" checked={it.permite_devolucao} onChange={v => update(it.tempId, { permite_devolucao: v })} />
              <ToggleField label="Gera plano de ação" checked={it.gera_plano_acao} onChange={v => update(it.tempId, { gera_plano_acao: v })} />
              <ToggleField label="Permite conclusão" checked={it.permite_conclusao} onChange={v => update(it.tempId, { permite_conclusao: v })} />
              <ToggleField label="Permite aumento de prazo" checked={it.permite_aumento_prazo} onChange={v => update(it.tempId, { permite_aumento_prazo: v })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/50 bg-muted/30">
      <Label className="text-[11px] leading-tight">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
