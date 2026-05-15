// src/modules/tarefas/components/rotinas/RotinasTabAuditor.tsx
// O Auditor audita a ATUAÇÃO DO APROVADOR — nunca avalia o executor diretamente.
// Perguntas AUTO + MANUAIS. Sem REPLICADAS do Avaliado.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Settings2, AlertTriangle, Info } from "lucide-react";
import { TemplateForm } from "@/modules/tarefas/types/tarefas_types";
import {
  RotinaCheckItem,
  ORIGEM_BADGE,
  TIPO_LABEL,
  METRICA_LABEL,
  defaultRotinaCheckItem,
} from "./rotinas_types";
import { cn } from "@/lib/utils";

interface Props {
  auditorConfigurado: boolean;
  form: TemplateForm;
  setForm: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
  items: RotinaCheckItem[];
  setItems: React.Dispatch<React.SetStateAction<RotinaCheckItem[]>>;
  onSave: () => Promise<void>;
  saving: boolean;
}

function ItemConfig({ item, onUpdate, onClose }: { item: RotinaCheckItem; onUpdate: (i: RotinaCheckItem) => void; onClose: () => void }) {
  return (
    <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/10 space-y-4">
      {item.origem === "manual" && (
        <div className="space-y-1">
          <Label className="text-xs">Texto da pergunta</Label>
          <Input value={item.pergunta} onChange={(e) => onUpdate({ ...item, pergunta: e.target.value })} placeholder="Ex: Aprovador seguiu o protocolo?" className="text-xs" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo de resposta</Label>
          <Select value={item.tipo} onValueChange={(v: any) => onUpdate({ ...item, tipo: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sim_nao">Sim / Não</SelectItem>
              <SelectItem value="conforme_nao_conforme">Conforme / Não conforme</SelectItem>
              <SelectItem value="nota">Nota (0–100)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Peso (pontos que vale)</Label>
          <Input type="number" min={0} value={item.peso} onChange={(e) => onUpdate({ ...item, peso: +e.target.value || 0 })} className="h-8 text-xs" />
        </div>
      </div>
      <div className="border border-border rounded-md p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id={`na-${item.tempId}`} checked={item.permite_na} onCheckedChange={(v) => onUpdate({ ...item, permite_na: !!v })} />
          <label htmlFor={`na-${item.tempId}`} className="text-xs font-medium cursor-pointer">Permite N/A — não desconta ponto</label>
        </div>
        {item.permite_na && (
          <div className="flex items-center gap-2 ml-6">
            <Checkbox id={`just-${item.tempId}`} checked={item.exige_justificativa_na} onCheckedChange={(v) => onUpdate({ ...item, exige_justificativa_na: !!v })} />
            <label htmlFor={`just-${item.tempId}`} className="text-xs cursor-pointer">Exige justificativa ao marcar N/A</label>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <Info className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">Quando N/A é marcado, esta pergunta não entra no cálculo da nota final.</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onClose}>Fechar configuração</Button>
      </div>
    </div>
  );
}

function ItemRow({ item, onToggle, onUpdate, onDelete, canDelete }: {
  item: RotinaCheckItem;
  onToggle: () => void;
  onUpdate: (i: RotinaCheckItem) => void;
  onDelete?: () => void;
  canDelete: boolean;
}) {
  const [configOpen, setConfigOpen] = useState(false);
  const badge = ORIGEM_BADGE[item.origem];
  const metricaLabel = item.metrica_calculo ? METRICA_LABEL[item.metrica_calculo] : null;

  return (
    <div className={cn("border rounded-lg overflow-hidden", !item.ativo && "opacity-50")}>
      <div className="flex items-center gap-3 px-3 py-2.5 bg-card">
        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0", badge.cls)}>{badge.label}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{item.pergunta || <span className="italic text-muted-foreground">Pergunta sem texto</span>}</p>
          <p className="text-[10px] text-muted-foreground">
            {TIPO_LABEL[item.tipo]} · Nota: <span className="font-medium">{item.peso}</span>
            {metricaLabel && item.origem === "automatica_sistema" && <> · <span className="text-primary/70">Auto: {metricaLabel}</span></>}
            {item.permite_na && <> · <span className="text-emerald-600 dark:text-emerald-400">N/A permitido</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setConfigOpen((v) => !v)} className="p-1 text-muted-foreground hover:text-primary transition-colors"><Settings2 className="w-3.5 h-3.5" /></button>
          <Switch checked={item.ativo} onCheckedChange={onToggle} />
          {canDelete && onDelete && (
            <button type="button" onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors text-xs">✕</button>
          )}
        </div>
      </div>
      {configOpen && <ItemConfig item={item} onUpdate={onUpdate} onClose={() => setConfigOpen(false)} />}
    </div>
  );
}

export function RotinasTabAuditor({ auditorConfigurado, form, setForm, items, setItems, onSave, saving }: Props) {
  const totalPontos = items.filter((i) => i.ativo).reduce((sum, i) => sum + i.peso, 0);
  const totalAuto = items.filter((i) => i.ativo && i.origem === "automatica_sistema").length;
  const totalManual = items.filter((i) => i.ativo && i.origem === "manual").length;

  const toggle = (tempId: string) => setItems((prev) => prev.map((i) => i.tempId === tempId ? { ...i, ativo: !i.ativo } : i));
  const update = (updated: RotinaCheckItem) => setItems((prev) => prev.map((i) => i.tempId === updated.tempId ? updated : i));
  const remove = (tempId: string) => setItems((prev) => prev.filter((i) => i.tempId !== tempId));
  const addManual = () => setItems((prev) => [...prev, defaultRotinaCheckItem()]);

  if (!auditorConfigurado) {
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-950/30 dark:border-amber-800">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Auditor não configurado</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Configure o Auditor na aba <strong>Geral</strong> para habilitar esta aba.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1">
      {/* Checkbox master */}
      <div className="flex items-center gap-3 border border-border rounded-lg px-4 py-3 bg-card">
        <Switch
          checked={!!form.bloquear_fechamento_com_contingencia}
          onCheckedChange={(v) => setForm("bloquear_fechamento_com_contingencia", v)}
          id="requer-auditoria"
        />
        <div>
          <label htmlFor="requer-auditoria" className="text-sm font-medium cursor-pointer">Esta rotina requer auditoria</label>
          <p className="text-[10px] text-muted-foreground">Quando ativo, a tarefa passa pela auditoria após aprovação.</p>
        </div>
      </div>

      {/* SLA do Auditor */}
      <div className="space-y-1.5">
        <Label className="text-xs">SLA do Auditor (horas)</Label>
        <Input
          type="number" min={1}
          value={form.prazo_sla_correcao_horas || 48}
          onChange={(e) => setForm("prazo_sla_correcao_horas", +e.target.value || 48)}
          className="h-8 text-xs w-40"
        />
        <p className="text-[10px] text-muted-foreground">Tempo máximo para o auditor responder após o aprovador concluir.</p>
      </div>

      {/* Contador */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border border-border rounded-lg">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{totalAuto} automáticas</span>
          <span>·</span>
          <span>{totalManual} manuais</span>
        </div>
        <div className="text-sm font-semibold">
          Total: <span className="text-primary">{totalPontos}</span> pontos
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {items.map((item) => (
          <ItemRow
            key={item.tempId} item={item}
            onToggle={() => toggle(item.tempId)}
            onUpdate={update}
            onDelete={() => remove(item.tempId)}
            canDelete={item.origem === "manual"}
          />
        ))}
      </div>

      <button type="button" onClick={addManual} className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
        <Plus className="w-3.5 h-3.5" />
        Adicionar pergunta manual
      </button>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Auditor"}
        </Button>
      </div>
    </div>
  );
}
