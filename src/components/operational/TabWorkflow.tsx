import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { TemplateForm } from "./types";

interface Props {
  form: TemplateForm;
  set: <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => void;
}

export function TabWorkflow({ form, set }: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Aprovação</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.requer_aprovacao_gestor} onCheckedChange={v => set("requer_aprovacao_gestor", v)} />
          <div>
            <Label className="cursor-pointer">Requer aprovação do gestor</Label>
            <p className="text-caption text-muted-foreground">Após avaliação, o assignment aguarda aprovação final.</p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Devolução</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.permite_devolucao_parcial} onCheckedChange={v => set("permite_devolucao_parcial", v)} />
          <div>
            <Label className="cursor-pointer">Permitir devolução parcial por campo</Label>
            <p className="text-caption text-muted-foreground">Avaliador pode devolver campos específicos em vez do assignment inteiro.</p>
          </div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
        <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Contingência</p>
        <div className="flex items-center gap-3">
          <Switch checked={form.gerar_contingencia_automatica} onCheckedChange={v => set("gerar_contingencia_automatica", v)} />
          <div>
            <Label className="cursor-pointer">Gerar contingência automática</Label>
            <p className="text-caption text-muted-foreground">Campos marcados como "gera contingência" criam registro automaticamente quando reprovados.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={form.bloquear_fechamento_com_contingencia} onCheckedChange={v => set("bloquear_fechamento_com_contingencia", v)} />
          <div>
            <Label className="cursor-pointer">Bloquear fechamento com contingências abertas</Label>
            <p className="text-caption text-muted-foreground">Impede conclusão enquanto houver contingências pendentes.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Prazo SLA Correção (horas)</Label>
          <Input type="number" min={1} value={form.prazo_sla_correcao_horas} onChange={e => set("prazo_sla_correcao_horas", +e.target.value)} className="max-w-[200px]" />
        </div>
      </div>
    </div>
  );
}
