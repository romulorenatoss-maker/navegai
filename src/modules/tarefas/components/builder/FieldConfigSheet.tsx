/**
 * FieldConfigSheet — modal/sheet de configuração de uma pergunta do Aprovador.
 *
 * Tipo de resposta limitado a opções marcáveis (sem texto livre):
 *   - conforme_nao_conforme
 *   - sim_nao
 *   - selecao (única)
 *   - selecao_multipla (checkbox)
 *
 * Cada opção tem regras próprias:
 *   - gera_plano_acao  → cria plano de ação padrão para refazer
 *   - exige_observacao → exige justificativa para tirar o ponto
 *   - exige_evidencia  → exige anexo/foto
 *   - permite_devolucao → habilita o aprovador a devolver para correção
 *
 * O aprovador, em runtime, decide se devolve ou apenas registra justificativa.
 */
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Save, Plus, Trash2 } from "lucide-react";
import type {
  AprovadorCheckItemForm,
  AprovadorTipoResposta,
  CamadaTipoResposta,
  RegraPorOpcao,
} from "./types";

type TipoMarcavel = Extract<CamadaTipoResposta, "conforme_nao_conforme" | "sim_nao" | "selecao" | "selecao_multipla"> | "excelente_bom_ruim";

type Editable = Pick<
  AprovadorCheckItemForm,
  | "pergunta_padrao"
  | "tipo_resposta"
  | "tipo"
  | "opcoes"
  | "regras_por_opcao"
  | "peso"
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
  perguntaBloqueada?: boolean;
  value: Editable;
  onSave: (next: Editable) => void;
}

const TIPO_LABEL: Record<TipoMarcavel, string> = {
  conforme_nao_conforme: "Conforme / Não conforme",
  sim_nao: "Sim / Não",
  excelente_bom_ruim: "Excelente / Bom / Ruim",
  selecao: "Seleção única (botões)",
  selecao_multipla: "Seleção múltipla (checkbox)",
};

const DEFAULT_OPCOES: Record<TipoMarcavel, string[]> = {
  conforme_nao_conforme: ["Conforme", "Não conforme", "N/A"],
  sim_nao: ["Sim", "Não", "N/A"],
  excelente_bom_ruim: ["Excelente", "Bom", "Ruim"],
  selecao: ["Opção 1", "Opção 2"],
  selecao_multipla: ["Opção 1", "Opção 2"],
};

/** Heurística: opções "negativas" recebem regras padrão de NC. */
const isNegativa = (label: string) => {
  const l = label.toLowerCase().trim();
  return l === "não conforme" || l === "nao conforme" || l === "não" || l === "nao"
    || l === "ruim" || l.startsWith("reprov");
};

const defaultRegra = (label: string): RegraPorOpcao => ({
  valor: label,
  exige_observacao: isNegativa(label),
  exige_evidencia: false,
  gera_plano_acao: isNegativa(label),
  permite_devolucao: isNegativa(label),
});

const tipoSimplificado = (t: TipoMarcavel): AprovadorTipoResposta => {
  if (t === "conforme_nao_conforme") return "conforme_nao_conforme";
  if (t === "sim_nao") return "sim_nao";
  return "conforme_nao_conforme"; // fallback compat
};

export function FieldConfigSheet({ open, onOpenChange, title, perguntaBloqueada, value, onSave }: Props) {
  const [draft, setDraft] = useState<Editable>(value);

  useEffect(() => { setDraft(value); }, [value, open]);

  const tipoAtual: TipoMarcavel = useMemo(() => {
    const t = (draft.tipo ?? draft.tipo_resposta) as string;
    if (t === "selecao" || t === "selecao_multipla" || t === "sim_nao" || t === "conforme_nao_conforme") return t as TipoMarcavel;
    return "conforme_nao_conforme";
  }, [draft.tipo, draft.tipo_resposta]);

  const opcoes = draft.opcoes && draft.opcoes.length > 0 ? draft.opcoes : DEFAULT_OPCOES[tipoAtual];
  const regras = draft.regras_por_opcao ?? [];

  const upd = <K extends keyof Editable>(k: K, v: Editable[K]) =>
    setDraft(prev => ({ ...prev, [k]: v }));

  const changeTipo = (novo: TipoMarcavel) => {
    const novasOpcoes = DEFAULT_OPCOES[novo];
    setDraft(prev => ({
      ...prev,
      tipo: novo,
      tipo_resposta: tipoSimplificado(novo),
      opcoes: novasOpcoes,
      regras_por_opcao: novasOpcoes.map(defaultRegra),
    }));
  };

  const setOpcao = (idx: number, novoLabel: string) => {
    const ops = [...opcoes];
    const antigo = ops[idx];
    ops[idx] = novoLabel;
    const regs = [...regras];
    const ri = regs.findIndex(r => r.valor === antigo);
    if (ri >= 0) regs[ri] = { ...regs[ri], valor: novoLabel };
    else regs.push(defaultRegra(novoLabel));
    setDraft(prev => ({ ...prev, opcoes: ops, regras_por_opcao: regs }));
  };

  const addOpcao = () => {
    const novaLabel = `Opção ${opcoes.length + 1}`;
    setDraft(prev => ({
      ...prev,
      opcoes: [...opcoes, novaLabel],
      regras_por_opcao: [...regras, defaultRegra(novaLabel)],
    }));
  };

  const removeOpcao = (idx: number) => {
    const alvo = opcoes[idx];
    setDraft(prev => ({
      ...prev,
      opcoes: opcoes.filter((_, i) => i !== idx),
      regras_por_opcao: regras.filter(r => r.valor !== alvo),
    }));
  };

  const setRegra = (label: string, patch: Partial<RegraPorOpcao>) => {
    const regs = [...regras];
    const ri = regs.findIndex(r => r.valor === label);
    if (ri >= 0) regs[ri] = { ...regs[ri], ...patch };
    else regs.push({ ...defaultRegra(label), ...patch });
    setDraft(prev => ({ ...prev, regras_por_opcao: regs }));
  };

  const getRegra = (label: string): RegraPorOpcao =>
    regras.find(r => r.valor === label) ?? defaultRegra(label);

  const podeEditarOpcoes = tipoAtual === "selecao" || tipoAtual === "selecao_multipla";

  const handleSave = () => {
    onSave({
      ...draft,
      tipo: tipoAtual,
      tipo_resposta: tipoSimplificado(tipoAtual),
      opcoes,
      regras_por_opcao: opcoes.map(getRegra),
    });
    onOpenChange(false);
  };

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
                value={tipoAtual}
                onValueChange={v => changeTipo(v as TipoMarcavel)}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABEL) as TipoMarcavel[]).map(k => (
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

          {/* Opções + regras por opção */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Opções e ações por resposta
              </p>
              {podeEditarOpcoes && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={addOpcao}>
                  <Plus className="w-3 h-3 mr-1" /> Opção
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {opcoes.map((label, idx) => {
                const r = getRegra(label);
                return (
                  <div key={`${label}-${idx}`} className="border border-border/60 rounded-md p-2 bg-muted/20 space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 text-xs flex-1"
                        value={label}
                        onChange={e => setOpcao(idx, e.target.value)}
                        disabled={!podeEditarOpcoes}
                      />
                      {podeEditarOpcoes && (
                        <Button
                          type="button" size="sm" variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeOpcao(idx)}
                          disabled={opcoes.length <= 2}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <ToggleField
                        label="Gera plano de ação (refazer)"
                        checked={!!r.gera_plano_acao}
                        onChange={v => setRegra(label, { gera_plano_acao: v })}
                      />
                      <ToggleField
                        label="Exige justificativa (tirar ponto)"
                        checked={!!r.exige_observacao}
                        onChange={v => setRegra(label, { exige_observacao: v })}
                      />
                      <ToggleField
                        label="Exige evidência (anexo)"
                        checked={!!r.exige_evidencia}
                        onChange={v => setRegra(label, { exige_evidencia: v })}
                      />
                      <ToggleField
                        label="Permite devolução"
                        checked={!!r.permite_devolucao}
                        onChange={v => setRegra(label, { permite_devolucao: v })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Em runtime, o aprovador escolhe se devolve para correção ou apenas registra a justificativa
              para concluir tirando o ponto. A devolução só fica disponível se a opção marcada permitir.
            </p>
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
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded border border-border/60 bg-card">
      <Label className="text-[11px] leading-tight">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
