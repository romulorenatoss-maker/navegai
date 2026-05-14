/**
 * FieldConfigSheet — modal/sheet de configuração de uma pergunta do Aprovador.
 *
 * Reutilizado por:
 *   - Aba Aprovador do builder (cada item da lista única)
 *   - Configurações > Pontuação/SLA (cada pergunta padrão do pacote)
 *
 * Mantém o mesmo conjunto de regras das perguntas do Avaliado:
 * tipo, peso, evidência, instrução, opções, regras por opção, ponderação,
 * permissões (devolução, plano de ação, conclusão, aumento de prazo).
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Save } from "lucide-react";
import type { AprovadorCheckItemForm, AprovadorTipoResposta } from "./types";

type Editable = Pick<
  AprovadorCheckItemForm,
  | "pergunta_padrao"
  | "tipo_resposta"
  | "peso"
  | "exige_observacao"
  | "exige_evidencia"
  | "permite_devolucao"
  | "gera_plano_acao"
  | "permite_conclusao"
  | "permite_aumento_prazo"
  | "permite_ponderacao_auditor"
  | "exige_justificativa_ponderacao"
  | "penalidade_reprovacao"
  | "sla_horas"
  | "instrucao_url"
  | "instrucao_tipo"
>;

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  /** True quando origem = replicada_avaliado: bloqueia edição da pergunta-base. */
  perguntaBloqueada?: boolean;
  value: Editable;
  onSave: (next: Editable) => void;
}

const TIPO_LABEL: Record<AprovadorTipoResposta, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  nota: "Nota (0–100)",
};

export function FieldConfigSheet({ open, onOpenChange, title, perguntaBloqueada, value, onSave }: Props) {
  const [draft, setDraft] = useState<Editable>(value);

  useEffect(() => { setDraft(value); }, [value, open]);

  const upd = <K extends keyof Editable>(k: K, v: Editable[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const handleSave = () => { onSave(draft); onOpenChange(false); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Settings2 className="w-4 h-4 text-primary" />
            {title ?? "Configurar pergunta"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Pergunta</Label>
            <Textarea
              value={draft.pergunta_padrao}
              onChange={e => upd("pergunta_padrao", e.target.value)}
              maxLength={300}
              placeholder="Pergunta exibida ao aprovador"
              disabled={perguntaBloqueada}
              className="min-h-[60px]"
            />
            {perguntaBloqueada && (
              <p className="text-[11px] text-muted-foreground">
                Pergunta replicada do Avaliado. Edite no campo original para alterar o texto.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select
                value={draft.tipo_resposta}
                onValueChange={v => upd("tipo_resposta", v as AprovadorTipoResposta)}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as AprovadorTipoResposta[]).map(k => (
                    <SelectItem key={k} value={k} className="text-xs">{TIPO_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Peso</Label>
              <Input
                type="number" min={0} max={100}
                className="h-9 text-xs"
                value={draft.peso}
                onChange={e => upd("peso", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Penalidade por resposta ruim (pts)</Label>
              <Input
                type="number" min={0} max={100}
                className="h-9 text-xs"
                value={draft.penalidade_reprovacao ?? ""}
                placeholder="Padrão da camada"
                onChange={e => upd("penalidade_reprovacao", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SLA da pergunta (horas)</Label>
              <Input
                type="number" min={0}
                className="h-9 text-xs"
                value={draft.sla_horas ?? ""}
                placeholder="Padrão da camada"
                onChange={e => upd("sla_horas", e.target.value === "" ? undefined : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Comportamentos</p>
            <div className="grid grid-cols-2 gap-2">
              <ToggleField label="Exige justificativa/observação" checked={!!draft.exige_observacao} onChange={v => upd("exige_observacao", v)} />
              <ToggleField label="Exige evidência (anexo)" checked={!!draft.exige_evidencia} onChange={v => upd("exige_evidencia", v)} />
              <ToggleField label="Permite devolução" checked={!!draft.permite_devolucao} onChange={v => upd("permite_devolucao", v)} />
              <ToggleField label="Gera plano de ação" checked={!!draft.gera_plano_acao} onChange={v => upd("gera_plano_acao", v)} />
              <ToggleField label="Permite conclusão" checked={!!draft.permite_conclusao} onChange={v => upd("permite_conclusao", v)} />
              <ToggleField label="Permite aumento de prazo" checked={!!draft.permite_aumento_prazo} onChange={v => upd("permite_aumento_prazo", v)} />
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Ponderação pelo auditor</p>
            <div className="grid grid-cols-1 gap-2">
              <ToggleField label="Permite ponderação manual da nota" checked={!!draft.permite_ponderacao_auditor} onChange={v => upd("permite_ponderacao_auditor", v)} />
              <ToggleField label="Exige justificativa ao ponderar" checked={!!draft.exige_justificativa_ponderacao} onChange={v => upd("exige_justificativa_ponderacao", v)} />
            </div>
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Anexo de instrução</p>
            <div className="grid grid-cols-1 gap-2">
              <div className="space-y-1.5">
                <Label className="text-[11px]">URL do anexo</Label>
                <Input
                  className="h-8 text-xs"
                  value={draft.instrucao_url ?? ""}
                  placeholder="https://… (foto/vídeo/documento)"
                  onChange={e => upd("instrucao_url", e.target.value || undefined)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Tipo de anexo</Label>
                <Select
                  value={draft.instrucao_tipo ?? "documento"}
                  onValueChange={v => upd("instrucao_tipo", v)}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="foto" className="text-xs">Foto</SelectItem>
                    <SelectItem value="video" className="text-xs">Vídeo</SelectItem>
                    <SelectItem value="documento" className="text-xs">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> Salvar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/60 bg-muted/30">
      <Label className="text-[11px] leading-tight">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
