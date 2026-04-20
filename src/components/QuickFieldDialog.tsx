import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X, Eye, Check } from "lucide-react";
import { FieldForm, defaultField, getDefaultOpcoesRegras, FIELD_TYPES } from "@/modules/operacional/types";
import { DynamicFieldRenderer, SnapshotField } from "@/modules/operacional/components/DynamicFieldRenderer";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** TempId da seção onde o campo será incluído */
  sectionTempId: string;
  /** Próxima ordem para o campo */
  nextOrdem: number;
  /** Callback recebe o FieldForm já no formato do sistema (estrutura existente) */
  onAdd: (field: FieldForm) => void;
}

/**
 * Modal simplificado de criação rápida de campo.
 * Apenas alimenta a estrutura `FieldForm` existente — não cria engine nova.
 * Após incluir, o campo aparece no TabFormBuilder com todos os botões/configs avançadas.
 */
const TIPOS_SIMPLES = Object.entries(FIELD_TYPES).map(([value, label]) => ({ value, label }));

export default function QuickFieldDialog({ open, onOpenChange, sectionTempId, nextOrdem, onAdd }: Props) {
  const [label, setLabel] = useState("");
  const [tipo, setTipo] = useState("texto");
  const [opcoes, setOpcoes] = useState<string[]>(["Opção 1", "Opção 2"]);
  const [novaOpcao, setNovaOpcao] = useState("");

  useEffect(() => {
    if (open) {
      setLabel("");
      setTipo("texto");
      setOpcoes(["Opção 1", "Opção 2"]);
      setNovaOpcao("");
    }
  }, [open]);

  // Constroi um FieldForm completo usando defaultField (estrutura atual)
  const builtField: FieldForm = useMemo(() => {
    const base = defaultField(sectionTempId, nextOrdem);
    base.label = label.trim() || "Novo campo";
    base.tipo = tipo;
    if (tipo === "select") {
      base.opcoes = opcoes.filter(o => o.trim().length > 0);
    }
    if (tipo === "conforme" || tipo === "sim_nao" || tipo === "nota_avaliacao") {
      base.opcoes_regras = getDefaultOpcoesRegras(tipo);
    }
    return base;
  }, [label, tipo, opcoes, sectionTempId, nextOrdem]);

  // Snapshot field para renderizar no preview com a engine atual
  const snapshotPreview: SnapshotField = useMemo(() => ({
    id: builtField.tempId,
    label: builtField.label,
    descricao: builtField.descricao,
    tipo: builtField.tipo,
    ordem: builtField.ordem,
    obrigatorio: builtField.obrigatorio,
    peso: builtField.peso,
    nota_maxima: builtField.nota_maxima,
    penalidade_reprovacao: builtField.penalidade_reprovacao,
    impacta_score: builtField.impacta_score,
    criticidade: builtField.criticidade,
    gera_contingencia: builtField.gera_contingencia,
    exige_evidencia: builtField.exige_evidencia,
    tipo_evidencia: builtField.tipo_evidencia,
    opcoes: builtField.opcoes as string[],
    opcoes_regras: builtField.opcoes_regras as any,
    validacao: builtField.validacao,
    condicao_visibilidade: builtField.condicao_visibilidade,
    formula: builtField.formula,
    visivel_para: builtField.visivel_para,
    editavel_por: builtField.editavel_por,
  }), [builtField]);

  const canAdd = label.trim().length > 0 && (tipo !== "select" || opcoes.filter(o => o.trim()).length >= 1);

  const handleAdicionarOpcao = () => {
    const v = novaOpcao.trim();
    if (!v) return;
    setOpcoes(prev => [...prev, v]);
    setNovaOpcao("");
  };

  const handleSubmit = () => {
    if (!canAdd) return;
    onAdd(builtField);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Novo Campo
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Crie rapidamente. Configurações avançadas continuam disponíveis após incluir.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 1. Nome */}
          <div className="space-y-1.5">
            <Label>Nome do campo *</Label>
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Ex: Local higienizado?"
              maxLength={120}
              autoFocus
            />
          </div>

          {/* 2. Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_SIMPLES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Opções para tipo select */}
          {tipo === "select" && (
            <div className="space-y-2 border border-border rounded-md p-3 bg-muted/30">
              <Label className="text-xs">Opções de seleção</Label>
              <div className="flex flex-wrap gap-1.5">
                {opcoes.map((o, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-card border border-border rounded px-2 py-0.5 text-xs">
                    {o}
                    <button
                      type="button"
                      onClick={() => setOpcoes(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Input
                  value={novaOpcao}
                  onChange={e => setNovaOpcao(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAdicionarOpcao(); } }}
                  placeholder="Adicionar opção..."
                  className="h-8 text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAdicionarOpcao}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* 3. Preview usando engine atual (DynamicFieldRenderer) */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Eye className="w-3.5 h-3.5" />
              Pré-visualização
            </div>
            <div className="bg-muted/30 rounded-md p-2 border border-dashed border-border">
              <DynamicFieldRenderer
                field={snapshotPreview}
                answer={undefined}
                userRole="executor"
                disabled={true}
                allAnswers={{}}
                onChange={() => {}}
                assignmentId="preview"
                showValidation={false}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Visualização desabilitada. O campo aparecerá com todas as configurações disponíveis no construtor.
            </p>
          </div>
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-card">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canAdd}>
            <Check className="w-4 h-4 mr-1.5" />
            Incluir Campo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
