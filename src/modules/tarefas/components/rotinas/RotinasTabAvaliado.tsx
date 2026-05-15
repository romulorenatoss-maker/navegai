// src/modules/tarefas/components/rotinas/RotinasTabAvaliado.tsx
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, GripVertical, Trash2, Copy, ChevronDown, ChevronRight, Save, Clock, Settings2 } from "lucide-react";
import { SectionForm, FieldForm, OpcaoRegra, defaultSection, defaultField, FIELD_TYPES, SECTION_COLORS, getDefaultOpcoesRegras } from "@/modules/tarefas/types/tarefas_types";
import { cn } from "@/lib/utils";

interface Props {
  sections: SectionForm[];
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>;
  fields: FieldForm[];
  setFields: React.Dispatch<React.SetStateAction<FieldForm[]>>;
  onSave: () => Promise<void>;
  saving: boolean;
  onFieldsChanged: (fields: FieldForm[]) => void;
}

const TIPO_OPTIONS = Object.entries(FIELD_TYPES).map(([value, label]) => ({ value, label }));

const EVIDENCIA_OPTIONS = [
  { value: "foto", label: "📷 Foto" },
  { value: "video", label: "🎥 Vídeo" },
  { value: "audio", label: "🎵 Áudio" },
  { value: "qualquer", label: "📎 Qualquer" },
];

const COR_BADGE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400",
  destructive: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400",
  muted: "bg-muted text-muted-foreground border-border",
};

// ── Componente de regra por resposta ──────────────────────────────────────────
function RegraRow({ regra, onUpdate, isNa }: {
  regra: OpcaoRegra;
  onUpdate: (patch: Partial<OpcaoRegra>) => void;
  isNa: boolean;
}) {
  const [open, setOpen] = useState(false);

  // N/A só tem observação obrigatória, sem plano de ação ou evidência
  return (
    <div className={cn("border rounded-md overflow-hidden", open ? "border-primary/40" : "border-border")}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border", COR_BADGE[regra.cor] || COR_BADGE.muted)}>
          {regra.label}
        </span>
        <span className="flex-1 text-[10px] text-muted-foreground">
          {isNa
            ? (regra.requer_descricao ? "Observação obrigatória" : "Sem regras")
            : [
                regra.gera_contingencia && "Plano de ação",
                regra.requer_evidencia && `Evidência (${(regra.tipos_evidencia || []).join(", ")})`,
                regra.requer_descricao && "Observação",
              ].filter(Boolean).join(" · ") || "Sem regras"
          }
        </span>
        {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/10 space-y-3">
          {/* N/A: só observação */}
          {isNa ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`na-obs-${regra.valor}`}
                checked={regra.requer_descricao}
                onCheckedChange={v => onUpdate({ requer_descricao: !!v })}
              />
              <label htmlFor={`na-obs-${regra.valor}`} className="text-xs cursor-pointer">
                Exige observação/justificativa obrigatória
              </label>
            </div>
          ) : (
            <>
              {/* Plano de ação */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`plano-${regra.valor}`}
                  checked={regra.gera_contingencia}
                  onCheckedChange={v => onUpdate({ gera_contingencia: !!v })}
                />
                <label htmlFor={`plano-${regra.valor}`} className="text-xs cursor-pointer font-medium">
                  Gera plano de ação
                </label>
              </div>

              {/* Observação */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`obs-${regra.valor}`}
                  checked={regra.requer_descricao}
                  onCheckedChange={v => onUpdate({ requer_descricao: !!v })}
                />
                <label htmlFor={`obs-${regra.valor}`} className="text-xs cursor-pointer">
                  Observação obrigatória
                </label>
              </div>

              {/* Evidência */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`evid-${regra.valor}`}
                    checked={regra.requer_evidencia}
                    onCheckedChange={v => onUpdate({ requer_evidencia: !!v })}
                  />
                  <label htmlFor={`evid-${regra.valor}`} className="text-xs cursor-pointer">
                    Evidência obrigatória
                  </label>
                </div>
                {regra.requer_evidencia && (
                  <div className="ml-6 flex flex-wrap gap-1.5">
                    {EVIDENCIA_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          const atual = regra.tipos_evidencia || [];
                          const next = atual.includes(opt.value)
                            ? atual.filter(v => v !== opt.value)
                            : [...atual.filter(v => v !== "qualquer"), opt.value];
                          onUpdate({ tipos_evidencia: next.length > 0 ? next : ["qualquer"] });
                        }}
                        className={cn(
                          "px-2 py-1 rounded border text-[10px] font-medium transition-colors",
                          (regra.tipos_evidencia || []).includes(opt.value)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── FieldRow ─────────────────────────────────────────────────────────────────
function FieldRow({ field, onUpdate, onDelete, onDuplicate }: {
  field: FieldForm;
  onUpdate: (f: FieldForm) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [exp, setExp] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Garante opcoes_regras sempre com N/A por padrão
  const opcoes: OpcaoRegra[] = field.opcoes_regras?.length > 0
    ? field.opcoes_regras
    : getDefaultOpcoesRegras(field.tipo);

  const updateRegra = (valor: string, patch: Partial<OpcaoRegra>) => {
    const updated = opcoes.map(r => r.valor === valor ? { ...r, ...patch } : r);
    onUpdate({ ...field, opcoes_regras: updated });
  };

  // Badges de resumo de regras ativas
  const temPlano = opcoes.some(r => r.gera_contingencia);
  const temEvidencia = opcoes.some(r => r.requer_evidencia);

  return (
    <div className="border border-border rounded-md bg-card ml-6">
      {/* Linha principal */}
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />
        <button type="button" onClick={() => setExp(v => !v)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <span className="text-xs font-medium text-foreground truncate flex-1">
            {field.label || <span className="text-muted-foreground italic">Pergunta sem nome</span>}
          </span>
          {/* Badges de regras ativas */}
          {temPlano && <span className="text-[9px] px-1 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 shrink-0">Plano</span>}
          {temEvidencia && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 shrink-0">Evidência</span>}
          <Badge variant="outline" className="text-[10px] shrink-0">{FIELD_TYPES[field.tipo] || field.tipo}</Badge>
          {exp ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
        </button>
        <button type="button" onClick={onDuplicate} className="p-1 text-muted-foreground hover:text-primary transition-colors"><Copy className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>

      {exp && (
        <div className="px-3 pb-3 pt-1 border-t border-border space-y-3">
          {/* Nome */}
          <div className="space-y-1">
            <Label className="text-xs">Nome da pergunta</Label>
            <Input
              value={field.label}
              onChange={e => onUpdate({ ...field, label: e.target.value })}
              placeholder="Ex: Área estava limpa?"
              className="h-8 text-xs"
            />
          </div>

          {/* Tipo + Peso */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select
                value={field.tipo}
                onValueChange={v => onUpdate({ ...field, tipo: v, opcoes_regras: getDefaultOpcoesRegras(v) })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso</Label>
              <Input type="number" min={1} value={field.peso} onChange={e => onUpdate({ ...field, peso: +e.target.value || 1 })} className="h-8 text-xs" />
            </div>
          </div>

          {/* Obrigatório */}
          <div className="flex items-center gap-2">
            <Switch
              checked={field.obrigatorio}
              onCheckedChange={v => onUpdate({ ...field, obrigatorio: v })}
              id={`obrig-${field.tempId}`}
            />
            <label htmlFor={`obrig-${field.tempId}`} className="text-xs cursor-pointer">Obrigatório responder</label>
          </div>

          {/* Preview das respostas */}
          {opcoes.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Preview das opções</Label>
              <div className="flex flex-wrap gap-1.5">
                {opcoes.map(r => (
                  <span key={r.valor} className={cn("inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium", COR_BADGE[r.cor] || COR_BADGE.muted)}>
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Regras por resposta */}
          {opcoes.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setShowRules(v => !v)}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {showRules ? "Ocultar regras por resposta" : "Configurar regras por resposta"}
              </button>
              {showRules && (
                <div className="space-y-1.5 border border-border rounded-lg p-2 bg-muted/10">
                  <p className="text-[10px] text-muted-foreground">Configure o que acontece quando cada resposta é marcada:</p>
                  {opcoes.map(regra => (
                    <RegraRow
                      key={regra.valor}
                      regra={regra}
                      onUpdate={patch => updateRegra(regra.valor, patch)}
                      isNa={regra.valor === "na"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────────────────
function SectionCard({ section, fieldsDoSection, onUpdateSection, onDeleteSection, onAddField, onUpdateField, onDeleteField, onDuplicateField, colorIdx }: {
  section: SectionForm;
  fieldsDoSection: FieldForm[];
  onUpdateSection: (s: SectionForm) => void;
  onDeleteSection: () => void;
  onAddField: () => void;
  onUpdateField: (f: FieldForm) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (f: FieldForm) => void;
  colorIdx: number;
}) {
  const [exp, setExp] = useState(true);
  const cor = SECTION_COLORS[colorIdx % SECTION_COLORS.length];
  const isAgrupador = fieldsDoSection.length > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-card">
        <GripVertical className="w-4 h-4 text-muted-foreground/30 shrink-0 cursor-grab" />
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
        <Input
          value={section.nome}
          onChange={e => onUpdateSection({ ...section, nome: e.target.value })}
          onClick={e => e.stopPropagation()}
          placeholder="Nome da etapa"
          className="flex-1 h-7 text-sm font-medium border-0 p-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0"
        />
        <Badge variant="outline" className="text-[10px] shrink-0">
          {isAgrupador ? `${fieldsDoSection.length} pergunta${fieldsDoSection.length > 1 ? "s" : ""}` : "Pergunta"}
        </Badge>
        <Input type="number" min={1} value={section.peso} onChange={e => onUpdateSection({ ...section, peso: +e.target.value || 1 })} className="w-14 h-7 text-xs text-center shrink-0" title="Peso" />
        <button type="button" onClick={() => setExp(v => !v)} className="p-1 text-muted-foreground">
          {exp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <button type="button" onClick={onDeleteSection} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-4 h-4" /></button>
      </div>

      {exp && (
        <div className="px-3 pb-3 pt-2 border-t border-border bg-muted/10 space-y-3">
          {/* Horários */}
          <div className="flex items-center gap-3 flex-wrap">
            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Início</Label>
              <Input type="time" value={section.horario_inicio || ""} onChange={e => onUpdateSection({ ...section, horario_inicio: e.target.value })} className="h-7 text-xs w-28" />
            </div>
            <span className="text-xs text-muted-foreground">até</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Fim</Label>
              <Input type="time" value={section.horario_fim || ""} onChange={e => onUpdateSection({ ...section, horario_fim: e.target.value })} className="h-7 text-xs w-28" />
            </div>
            <span className="text-[10px] text-muted-foreground ml-auto">Sem horário → cada pergunta exige horário próprio.</span>
          </div>

          {/* Se não tem filhos, mostra tipo de resposta da etapa */}
          {!isAgrupador && (
            <div className="space-y-1">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select value={(section as any).tipo_resposta_etapa || "conforme"} onValueChange={v => onUpdateSection({ ...section, ...({ tipo_resposta_etapa: v } as any) })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o tipo..." /></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Esta etapa funciona como pergunta única. Adicionar uma pergunta interna converterá em formulário/agrupador.</p>
            </div>
          )}

          {/* Perguntas */}
          <div className="space-y-2">
            {fieldsDoSection.map(f => (
              <FieldRow key={f.tempId} field={f} onUpdate={onUpdateField} onDelete={() => onDeleteField(f.tempId)} onDuplicate={() => onDuplicateField(f)} />
            ))}
          </div>

          <button type="button" onClick={onAddField} className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            Adicionar pergunta nesta etapa
          </button>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export function RotinasTabAvaliado({ sections, setSections, fields, setFields, onSave, saving, onFieldsChanged }: Props) {
  const addSection = () => setSections(prev => [...prev, defaultSection(prev.length)]);

  const updateSection = useCallback((updated: SectionForm) => {
    setSections(prev => prev.map(s => s.tempId === updated.tempId ? updated : s));
  }, [setSections]);

  const deleteSection = useCallback((tempId: string) => {
    setSections(prev => prev.filter(s => s.tempId !== tempId));
    setFields(prev => {
      const next = prev.filter(f => f.sectionTempId !== tempId);
      onFieldsChanged(next);
      return next;
    });
  }, [setSections, setFields, onFieldsChanged]);

  const addField = useCallback((sectionTempId: string) => {
    const ordem = fields.filter(f => f.sectionTempId === sectionTempId).length;
    const novo = defaultField(sectionTempId, ordem);
    // Inicializa com N/A por padrão
    novo.opcoes_regras = getDefaultOpcoesRegras(novo.tipo);
    setFields(prev => {
      const next = [...prev, novo];
      onFieldsChanged(next);
      return next;
    });
  }, [fields, setFields, onFieldsChanged]);

  const updateField = useCallback((updated: FieldForm) => {
    setFields(prev => {
      const next = prev.map(f => f.tempId === updated.tempId ? updated : f);
      onFieldsChanged(next);
      return next;
    });
  }, [setFields, onFieldsChanged]);

  const deleteField = useCallback((tempId: string) => {
    setFields(prev => {
      const next = prev.filter(f => f.tempId !== tempId);
      onFieldsChanged(next);
      return next;
    });
  }, [setFields, onFieldsChanged]);

  const duplicateField = useCallback((original: FieldForm) => {
    const clone: FieldForm = {
      ...original,
      tempId: crypto.randomUUID(),
      id: undefined,
      label: original.label + " (cópia)",
      ordem: fields.filter(f => f.sectionTempId === original.sectionTempId).length,
    };
    setFields(prev => {
      const next = [...prev, clone];
      onFieldsChanged(next);
      return next;
    });
  }, [fields, setFields, onFieldsChanged]);

  return (
    <div className="space-y-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Estrutura da Tarefa</h3>
          <p className="text-[11px] text-muted-foreground">Toda estrutura é uma etapa. Adicione perguntas dentro para transformá-la em formulário.</p>
        </div>
        <Button size="sm" variant="outline" onClick={addSection}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar Etapa/Formulário
        </Button>
      </div>

      {sections.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center text-muted-foreground text-sm">
          Nenhuma etapa criada. Clique em "Adicionar Etapa/Formulário" para começar.
        </div>
      )}

      <div className="space-y-3">
        {sections.map((sec, idx) => (
          <SectionCard
            key={sec.tempId} section={sec} colorIdx={idx}
            fieldsDoSection={fields.filter(f => f.sectionTempId === sec.tempId)}
            onUpdateSection={updateSection}
            onDeleteSection={() => deleteSection(sec.tempId)}
            onAddField={() => addField(sec.tempId)}
            onUpdateField={updateField}
            onDeleteField={deleteField}
            onDuplicateField={duplicateField}
          />
        ))}
      </div>

      <div className="flex justify-end pt-2 border-t border-border">
        <Button onClick={onSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando..." : "Salvar Avaliado"}
        </Button>
      </div>
    </div>
  );
}
