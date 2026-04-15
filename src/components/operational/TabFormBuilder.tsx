import { useState } from "react";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Settings2, Copy, AlertTriangle, Camera, FileVideo, FileText } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionForm, FieldForm, FIELD_TYPES, CRITICIDADE_OPTIONS, SECTION_COLORS, defaultField, defaultSection } from "./types";

interface Props {
  sections: SectionForm[];
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>;
  fields: FieldForm[];
  setFields: React.Dispatch<React.SetStateAction<FieldForm[]>>;
  setores?: any[];
}

export function TabFormBuilder({ sections, setSections, fields, setFields, setores = [] }: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldForm | null>(null);

  const addSection = () => {
    const s = defaultSection(sections.length);
    setSections(prev => [...prev, s]);
    setExpandedSection(s.tempId);
  };

  const removeSection = (tempId: string) => {
    setSections(prev => prev.filter(s => s.tempId !== tempId));
    setFields(prev => prev.filter(f => f.sectionTempId !== tempId));
  };

  const updateSection = (tempId: string, key: keyof SectionForm, value: any) => {
    setSections(prev => prev.map(s => s.tempId === tempId ? { ...s, [key]: value } : s));
  };

  const addField = (sectionTempId: string) => {
    const sectionFields = fields.filter(f => f.sectionTempId === sectionTempId);
    setFields(prev => [...prev, defaultField(sectionTempId, sectionFields.length)]);
  };

  const removeField = (tempId: string) => {
    setFields(prev => prev.filter(f => f.tempId !== tempId));
  };

  const updateField = (tempId: string, updates: Partial<FieldForm>) => {
    setFields(prev => prev.map(f => f.tempId === tempId ? { ...f, ...updates } : f));
  };

  const duplicateField = (field: FieldForm) => {
    const sectionFields = fields.filter(f => f.sectionTempId === field.sectionTempId);
    const newField: FieldForm = { ...field, tempId: crypto.randomUUID(), id: undefined, label: field.label + " (cópia)", ordem: sectionFields.length };
    setFields(prev => [...prev, newField]);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, type } = result;

    if (type === "SECTION") {
      setSections(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(source.index, 1);
        arr.splice(destination.index, 0, moved);
        return arr.map((s, i) => ({ ...s, ordem: i }));
      });
      return;
    }

    const srcSectionId = source.droppableId;
    const dstSectionId = destination.droppableId;

    setFields(prev => {
      const srcFields = prev.filter(f => f.sectionTempId === srcSectionId).sort((a, b) => a.ordem - b.ordem);
      const [movedField] = srcFields.splice(source.index, 1);
      const updated = { ...movedField, sectionTempId: dstSectionId };

      if (srcSectionId === dstSectionId) {
        srcFields.splice(destination.index, 0, updated);
        const reordered = srcFields.map((f, i) => ({ ...f, ordem: i }));
        return prev.filter(f => f.sectionTempId !== srcSectionId).concat(reordered);
      } else {
        const dstFields = prev.filter(f => f.sectionTempId === dstSectionId).sort((a, b) => a.ordem - b.ordem);
        dstFields.splice(destination.index, 0, updated);
        const reorderedSrc = srcFields.map((f, i) => ({ ...f, ordem: i }));
        const reorderedDst = dstFields.map((f, i) => ({ ...f, ordem: i }));
        return prev.filter(f => f.sectionTempId !== srcSectionId && f.sectionTempId !== dstSectionId).concat(reorderedSrc, reorderedDst);
      }
    });
  };

  const crit = (c: string) => CRITICIDADE_OPTIONS.find(o => o.value === c);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Seções e Campos</p>
        <Button type="button" variant="outline" size="sm" onClick={addSection}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Seção
        </Button>
      </div>

      {sections.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
          <p className="text-sm">Nenhuma seção criada.</p>
          <p className="text-caption">Adicione uma seção para começar a construir o formulário.</p>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="sections" type="SECTION">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
              {sections.sort((a, b) => a.ordem - b.ordem).map((section, sIdx) => {
                const sectionFields = fields.filter(f => f.sectionTempId === section.tempId).sort((a, b) => a.ordem - b.ordem);
                const isExpanded = expandedSection === section.tempId;

                return (
                  <Draggable key={section.tempId} draggableId={section.tempId} index={sIdx}>
                    {(dragProvided) => (
                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}
                        className="border border-border rounded-lg overflow-hidden bg-card">
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                          <div {...dragProvided.dragHandleProps}>
                            <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                          </div>
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: section.cor }} />
                          <Input value={section.nome} onChange={e => updateSection(section.tempId, "nome", e.target.value)}
                            placeholder="Nome da seção" className="h-7 text-sm font-medium flex-1" maxLength={100} />
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{sectionFields.length} campo{sectionFields.length !== 1 ? "s" : ""}</span>
                          <Input type="number" min={0.1} step={0.1} value={section.peso} onChange={e => updateSection(section.tempId, "peso", +e.target.value)}
                            className="h-7 w-16 text-sm text-center" title="Peso da seção" />
                          <Select value={section.cor} onValueChange={v => updateSection(section.tempId, "cor", v)}>
                            <SelectTrigger className="h-7 w-10 p-1">
                              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: section.cor }} />
                            </SelectTrigger>
                            <SelectContent>
                              {SECTION_COLORS.map(c => (
                                <SelectItem key={c} value={c}>
                                  <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full" style={{ backgroundColor: c }} />{c}</div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedSection(isExpanded ? null : section.tempId)}>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSection(section.tempId)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="p-3 space-y-2">
                            <Input value={section.descricao} onChange={e => updateSection(section.tempId, "descricao", e.target.value)}
                              placeholder="Descrição da seção (opcional)" className="text-sm mb-2" maxLength={500} />

                            <Droppable droppableId={section.tempId} type="FIELD">
                              {(fieldProvided) => (
                                <div ref={fieldProvided.innerRef} {...fieldProvided.droppableProps} className="space-y-1.5 min-h-[40px]">
                                  {sectionFields.map((field, fIdx) => (
                                    <Draggable key={field.tempId} draggableId={field.tempId} index={fIdx}>
                                      {(fDrag) => (
                                        <div ref={fDrag.innerRef} {...fDrag.draggableProps}
                                          className="flex items-center gap-2 bg-background border border-border rounded-md px-2 py-1.5 group hover:border-primary/30 transition-colors">
                                          <div {...fDrag.dragHandleProps}>
                                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground cursor-grab" />
                                          </div>
                                          <span className="text-caption text-muted-foreground font-tabular w-5">{fIdx + 1}.</span>
                                          <Input value={field.label} onChange={e => updateField(field.tempId, { label: e.target.value })}
                                            placeholder="Label do campo" className="h-7 text-sm flex-1" maxLength={255} />
                                          <Select value={field.tipo} onValueChange={v => updateField(field.tempId, { tipo: v })}>
                                            <SelectTrigger className="h-7 w-[140px] text-caption"><SelectValue /></SelectTrigger>
                                            <SelectContent>{Object.entries(FIELD_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                                          </Select>
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${crit(field.criticidade)?.color || ""}`}>
                                            {crit(field.criticidade)?.label}
                                          </span>
                                          {field.obrigatorio && <span className="text-[10px] text-primary font-medium">Obrig.</span>}
                                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => setEditingField(field)}>
                                            <Settings2 className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => duplicateField(field)}>
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100" onClick={() => removeField(field.tempId)}>
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {fieldProvided.placeholder}
                                </div>
                              )}
                            </Droppable>

                            <Button type="button" variant="outline" size="sm" className="w-full mt-2" onClick={() => addField(section.tempId)}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Campo
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editingField && (
        <FieldDetailDialog
          field={editingField}
          setores={setores}
          onSave={(updates) => { updateField(editingField.tempId, updates); setEditingField(null); }}
          onClose={() => setEditingField(null)}
        />
      )}
    </div>
  );
}

function FieldDetailDialog({ field, setores, onSave, onClose }: { field: FieldForm; setores: any[]; onSave: (u: Partial<FieldForm>) => void; onClose: () => void }) {
  const [local, setLocal] = useState<FieldForm>({ ...field });
  const upd = <K extends keyof FieldForm>(k: K, v: FieldForm[K]) => setLocal(f => ({ ...f, [k]: v }));
  const [previewAnswer, setPreviewAnswer] = useState<"sim" | "nao" | "na" | null>(null);

  const toggleEvidenciaTipo = (tipo: string) => {
    const current = local.aprovador_tipos_evidencia || [];
    upd("aprovador_tipos_evidencia", current.includes(tipo) ? current.filter(t => t !== tipo) : [...current, tipo]);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Configuração do Campo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Campo básico */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Label *</Label>
              <Input value={local.label} onChange={e => upd("label", e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={local.tipo} onValueChange={v => upd("tipo", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(FIELD_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição / Instrução</Label>
            <Textarea value={local.descricao} onChange={e => upd("descricao", e.target.value)} placeholder="Instruções para o executor..." maxLength={1000} />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { k: "obrigatorio" as const, l: "Obrigatório" },
              { k: "gera_contingencia" as const, l: "Gera Contingência" },
              { k: "exige_evidencia" as const, l: "Exige Evidência" },
            ].map(t => (
              <div key={t.k} className="flex items-center gap-2">
                <Switch checked={local[t.k] as boolean} onCheckedChange={v => upd(t.k, v)} />
                <Label className="cursor-pointer">{t.l}</Label>
              </div>
            ))}
          </div>

          {local.exige_evidencia && (
            <div className="space-y-1.5">
              <Label>Tipo de Evidência</Label>
              <Select value={local.tipo_evidencia} onValueChange={v => upd("tipo_evidencia", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="foto">Foto</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="arquivo">Arquivo</SelectItem>
                  <SelectItem value="qualquer">Qualquer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {(local.tipo === "select" || local.tipo === "multi_select") && (
            <div className="space-y-1.5">
              <Label>Opções (uma por linha)</Label>
              <Textarea
                value={(local.opcoes || []).join("\n")}
                onChange={e => upd("opcoes", e.target.value.split("\n").filter(Boolean))}
                placeholder="Opção 1&#10;Opção 2&#10;Opção 3"
                rows={4}
              />
            </div>
          )}

          {/* ── Avaliação do Aprovador (molde OS) ── */}
          <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={local.aprovador_verificar ?? false} onCheckedChange={v => {
                upd("aprovador_verificar", v);
                if (!v) upd("aprovador_pergunta", "");
              }} />
              <div>
                <Label className="cursor-pointer font-medium">Deseja que o aprovador verifique este campo?</Label>
                <p className="text-caption text-muted-foreground">Se ativado, o aprovador responderá uma pergunta ao revisar este campo.</p>
              </div>
            </div>

            {local.aprovador_verificar && (
              <>
                {/* Pergunta */}
                <div className="space-y-1.5">
                  <Label>Pergunta <span className="text-destructive">*</span></Label>
                  <Input
                    value={local.aprovador_pergunta || ""}
                    onChange={e => upd("aprovador_pergunta", e.target.value)}
                    placeholder="Ex: O campo foi preenchido corretamente?"
                    maxLength={500}
                    required
                  />
                  {!local.aprovador_pergunta?.trim() && (
                    <p className="text-xs text-destructive">Preencha a pergunta do aprovador.</p>
                  )}
                </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Tipo de resposta */}
              <div className="space-y-1.5">
                <Label>Tipo de Resposta</Label>
                <Select value={local.aprovador_tipo_resposta || "conforme"} onValueChange={v => upd("aprovador_tipo_resposta", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conforme">Conforme / Não Conforme / N/A</SelectItem>
                    <SelectItem value="sim_nao">Sim / Não / N/A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Nota (peso) */}
              <div className="space-y-1.5">
                <Label>Nota</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={local.aprovador_peso ?? 1}
                  onChange={e => upd("aprovador_peso", +e.target.value)}
                />
              </div>
            </div>

            {/* Condições ao reprovar */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Switch checked={local.aprovador_obriga_observacao_nao} onCheckedChange={v => upd("aprovador_obriga_observacao_nao", v)} />
                <Label className="cursor-pointer text-caption">Observação obrigatória ao reprovar</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={local.aprovador_exige_evidencia_nao} onCheckedChange={v => upd("aprovador_exige_evidencia_nao", v)} />
                <Label className="cursor-pointer text-caption">Exigir evidência ao reprovar</Label>
              </div>
            </div>

            {local.aprovador_exige_evidencia_nao && (
              <div className="space-y-1.5 pl-4 border-l-2 border-primary/20">
                <Label className="text-caption">Tipos de evidência aceitos</Label>
                <div className="flex gap-2">
                  {[
                    { tipo: "foto", label: "Foto", icon: Camera },
                    { tipo: "video", label: "Vídeo", icon: FileVideo },
                    { tipo: "documento", label: "Documento", icon: FileText },
                  ].map(ev => (
                    <button key={ev.tipo} type="button" onClick={() => toggleEvidenciaTipo(ev.tipo)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-caption border transition-colors ${
                        (local.aprovador_tipos_evidencia || []).includes(ev.tipo) 
                          ? "bg-primary/10 border-primary text-primary" 
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}>
                      <ev.icon className="w-3.5 h-3.5" /> {ev.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pré-visualização (igual OS) */}
            {local.aprovador_pergunta && (
              <div className="space-y-2">
                <Label className="text-caption text-muted-foreground uppercase tracking-wider">Pré-visualização</Label>
                <div className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{local.aprovador_pergunta}</p>
                      <p className="text-caption text-muted-foreground">Nota: {local.aprovador_peso ?? 1}</p>
                    </div>
                    <div className="flex bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
                      {(local.aprovador_tipo_resposta === "sim_nao"
                        ? [
                            { label: "Sim", value: "sim" as const, cls: "bg-success text-success-foreground" },
                            { label: "Não", value: "nao" as const, cls: "bg-destructive text-destructive-foreground" },
                            { label: "N/A", value: "na" as const, cls: "bg-muted text-foreground" },
                          ]
                        : [
                            { label: "Conforme", value: "sim" as const, cls: "bg-success text-success-foreground" },
                            { label: "Não Conf.", value: "nao" as const, cls: "bg-destructive text-destructive-foreground" },
                            { label: "N/A", value: "na" as const, cls: "bg-muted text-foreground" },
                          ]
                      ).map(opt => (
                        <button key={opt.value} type="button" onClick={() => setPreviewAnswer(previewAnswer === opt.value ? null : opt.value)}
                          className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 min-w-[48px] ${
                            previewAnswer === opt.value ? opt.cls : "text-foreground hover:bg-background/50"
                          }`}>{opt.label}</button>
                      ))}
                    </div>
                  </div>

                  {previewAnswer === "nao" && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mt-3 space-y-3">
                      <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {local.aprovador_obriga_observacao_nao ? "Descrição obrigatória" : "Descrição (opcional)"}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-caption">Descrição {local.aprovador_obriga_observacao_nao ? "*" : ""}</Label>
                        <Textarea placeholder="Descreva a irregularidade..." className="bg-card h-20 text-caption" disabled />
                      </div>
                      {local.aprovador_exige_evidencia_nao && (
                        <div>
                          <Label className="text-caption mb-1.5 block">Evidência obrigatória</Label>
                          <div className="flex gap-2">
                            {(local.aprovador_tipos_evidencia || []).includes("foto") && (
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><Camera className="w-3.5 h-3.5 mr-1.5" /> Foto</Button>
                            )}
                            {(local.aprovador_tipos_evidencia || []).includes("video") && (
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileVideo className="w-3.5 h-3.5 mr-1.5" /> Vídeo</Button>
                            )}
                            {(local.aprovador_tipos_evidencia || []).includes("documento") && (
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileText className="w-3.5 h-3.5 mr-1.5" /> Doc</Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => onSave(local)}>Salvar Campo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
