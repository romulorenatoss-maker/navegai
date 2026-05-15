// src/modules/tarefas/components/rotinas/RotinasTabAvaliado.tsx
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, GripVertical, Trash2, Copy, ChevronDown, ChevronRight, Save, Clock } from "lucide-react";
import { SectionForm, FieldForm, defaultSection, defaultField, FIELD_TYPES, SECTION_COLORS } from "@/modules/tarefas/types/tarefas_types";
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

function FieldRow({ field, onUpdate, onDelete, onDuplicate }: {
  field: FieldForm;
  onUpdate: (f: FieldForm) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [exp, setExp] = useState(false);
  return (
    <div className="border border-border rounded-md bg-card ml-6">
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0 cursor-grab" />
        <button type="button" onClick={() => setExp((v) => !v)} className="flex-1 flex items-center gap-2 text-left min-w-0">
          <span className="text-xs font-medium text-foreground truncate flex-1">
            {field.label || <span className="text-muted-foreground italic">Pergunta sem nome</span>}
          </span>
          <Badge variant="outline" className="text-[10px] shrink-0">{FIELD_TYPES[field.tipo] || field.tipo}</Badge>
          {exp ? <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />}
        </button>
        <button type="button" onClick={onDuplicate} className="p-1 text-muted-foreground hover:text-primary transition-colors"><Copy className="w-3.5 h-3.5" /></button>
        <button type="button" onClick={onDelete} className="p-1 text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      {exp && (
        <div className="px-3 pb-3 pt-1 border-t border-border space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nome da pergunta</Label>
            <Input value={field.label} onChange={(e) => onUpdate({ ...field, label: e.target.value })} placeholder="Ex: Área estava limpa?" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select value={field.tipo} onValueChange={(v) => onUpdate({ ...field, tipo: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Peso</Label>
              <Input type="number" min={1} value={field.peso} onChange={(e) => onUpdate({ ...field, peso: +e.target.value || 1 })} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            {[
              { key: "obrigatorio", label: "Obrigatório" },
              { key: "gera_contingencia", label: "Gera contingência" },
              { key: "exige_evidencia", label: "Exige evidência" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Switch checked={(field as any)[key]} onCheckedChange={(v) => onUpdate({ ...field, [key]: v })} id={`${field.tempId}-${key}`} />
                <label htmlFor={`${field.tempId}-${key}`} className="text-xs cursor-pointer">{label}</label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
          onChange={(e) => onUpdateSection({ ...section, nome: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Nome da etapa"
          className="flex-1 h-7 text-sm font-medium border-0 p-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-w-0"
        />
        <Badge variant="outline" className="text-[10px] shrink-0">
          {isAgrupador ? `${fieldsDoSection.length} pergunta${fieldsDoSection.length > 1 ? "s" : ""}` : "Pergunta"}
        </Badge>
        <Input type="number" min={1} value={section.peso} onChange={(e) => onUpdateSection({ ...section, peso: +e.target.value || 1 })} className="w-14 h-7 text-xs text-center shrink-0" title="Peso" />
        <button type="button" onClick={() => setExp((v) => !v)} className="p-1 text-muted-foreground">
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
              <Input type="time" value={section.horario_inicio || ""} onChange={(e) => onUpdateSection({ ...section, horario_inicio: e.target.value })} className="h-7 text-xs w-28" />
            </div>
            <span className="text-xs text-muted-foreground">até</span>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Fim</Label>
              <Input type="time" value={section.horario_fim || ""} onChange={(e) => onUpdateSection({ ...section, horario_fim: e.target.value })} className="h-7 text-xs w-28" />
            </div>
            <span className="text-[10px] text-muted-foreground ml-auto">Sem horário → cada pergunta exige horário próprio.</span>
          </div>

          {/* Se não tem filhos, mostra tipo de resposta da etapa */}
          {!isAgrupador && (
            <div className="space-y-1">
              <Label className="text-xs">Tipo de resposta</Label>
              <Select value={(section as any).tipo_resposta_etapa || "conforme"} onValueChange={(v) => onUpdateSection({ ...section, ...({ tipo_resposta_etapa: v } as any) })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Escolha o tipo..." /></SelectTrigger>
                <SelectContent>{TIPO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Esta etapa funciona como pergunta única. Adicionar uma pergunta interna converterá em formulário/agrupador.</p>
            </div>
          )}

          {/* Perguntas */}
          <div className="space-y-2">
            {fieldsDoSection.map((f) => (
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

export function RotinasTabAvaliado({ sections, setSections, fields, setFields, onSave, saving, onFieldsChanged }: Props) {
  const addSection = () => setSections((prev) => [...prev, defaultSection(prev.length)]);

  const updateSection = useCallback((updated: SectionForm) => {
    setSections((prev) => prev.map((s) => s.tempId === updated.tempId ? updated : s));
  }, [setSections]);

  const deleteSection = useCallback((tempId: string) => {
    setSections((prev) => prev.filter((s) => s.tempId !== tempId));
    setFields((prev) => {
      const next = prev.filter((f) => f.sectionTempId !== tempId);
      onFieldsChanged(next);
      return next;
    });
  }, [setSections, setFields, onFieldsChanged]);

  const addField = useCallback((sectionTempId: string) => {
    const ordem = fields.filter((f) => f.sectionTempId === sectionTempId).length;
    const novo = defaultField(sectionTempId, ordem);
    setFields((prev) => {
      const next = [...prev, novo];
      onFieldsChanged(next);
      return next;
    });
  }, [fields, setFields, onFieldsChanged]);

  const updateField = useCallback((updated: FieldForm) => {
    setFields((prev) => {
      const next = prev.map((f) => f.tempId === updated.tempId ? updated : f);
      onFieldsChanged(next);
      return next;
    });
  }, [setFields, onFieldsChanged]);

  const deleteField = useCallback((tempId: string) => {
    setFields((prev) => {
      const next = prev.filter((f) => f.tempId !== tempId);
      onFieldsChanged(next);
      return next;
    });
  }, [setFields, onFieldsChanged]);

  const duplicateField = useCallback((original: FieldForm) => {
    const clone: FieldForm = { ...original, tempId: crypto.randomUUID(), id: undefined, label: original.label + " (cópia)", ordem: fields.filter((f) => f.sectionTempId === original.sectionTempId).length };
    setFields((prev) => {
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
            fieldsDoSection={fields.filter((f) => f.sectionTempId === sec.tempId)}
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
