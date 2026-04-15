import { useState } from "react";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Settings2, Copy, AlertTriangle, Camera, FileVideo, FileText } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionForm, FieldForm, FIELD_TYPES, SECTION_COLORS, defaultField, defaultSection } from "./types";

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
                                          {field.gera_contingencia && <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-200 bg-orange-100 text-orange-700">Conting.</span>}
                                          {field.aprovador_verificar && <span className="text-[10px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">Aprovador</span>}
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

  const answerOptions = local.aprovador_tipo_resposta === "sim_nao"
    ? [
        { label: "Sim", value: "sim" as const, cls: "bg-success text-success-foreground" },
        { label: "Não", value: "nao" as const, cls: "bg-destructive text-destructive-foreground" },
        { label: "N/A", value: "na" as const, cls: "bg-muted text-foreground" },
      ]
    : [
        { label: "Conforme", value: "sim" as const, cls: "bg-success text-success-foreground" },
        { label: "Não Conf.", value: "nao" as const, cls: "bg-destructive text-destructive-foreground" },
        { label: "N/A", value: "na" as const, cls: "bg-muted text-foreground" },
      ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Configuração do Campo</DialogTitle></DialogHeader>
        <div className="space-y-5">

          {/* ── Informações Básicas ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Informações Básicas</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pergunta do Avaliador *</Label>
                <Input value={local.label} onChange={e => upd("label", e.target.value)} placeholder="Ex: Verificar nível do óleo" maxLength={255} />
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
          </div>

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

          {/* ── Regras do Campo ── */}
          <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Regras do Campo</p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Switch checked={local.obrigatorio} onCheckedChange={v => upd("obrigatorio", v)} />
                <Label className="cursor-pointer text-sm">Obrigatório</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={local.impacta_score} onCheckedChange={v => upd("impacta_score", v)} />
                <Label className="cursor-pointer text-sm">Impacta Score</Label>
              </div>
            </div>

            {/* Contingência */}
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Switch checked={local.gera_contingencia} onCheckedChange={v => upd("gera_contingencia", v)} />
                <div>
                  <Label className="cursor-pointer text-sm font-medium">Gera Contingência</Label>
                  <p className="text-caption text-muted-foreground">Se marcado "Não Conforme", cria contingência automaticamente para o executor resolver.</p>
                </div>
              </div>

              {local.gera_contingencia && (
                <div className="pl-4 border-l-2 border-orange-300 space-y-2">
                  <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-caption space-y-1.5">
                    <p className="font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" /> O que acontece ao reprovar:
                    </p>
                    <ul className="text-orange-600 dark:text-orange-400/80 space-y-0.5 pl-5 list-disc">
                      <li>Uma contingência é criada automaticamente para o executor</li>
                      <li>O executor recebe uma pendência com prazo SLA para solucionar</li>
                      <li>Um cronômetro de tempo decorrido é iniciado</li>
                      <li>Penalidades de gamificação são aplicadas conforme configurado em Workflow</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Evidência */}
            <div className="space-y-3 border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Switch checked={local.exige_evidencia} onCheckedChange={v => upd("exige_evidencia", v)} />
                <div>
                  <Label className="cursor-pointer text-sm font-medium">Exige Evidência</Label>
                  <p className="text-caption text-muted-foreground">Executor deve anexar evidência ao responder este campo.</p>
                </div>
              </div>

              {local.exige_evidencia && (
                <div className="pl-4 border-l-2 border-primary/30 space-y-2">
                  <Label className="text-caption">Tipo de evidência aceito</Label>
                  <div className="flex gap-2">
                    {[
                      { tipo: "foto", label: "Foto", icon: Camera, desc: "Executor tira ou envia foto como prova" },
                      { tipo: "video", label: "Vídeo", icon: FileVideo, desc: "Executor grava ou envia vídeo" },
                      { tipo: "arquivo", label: "Arquivo", icon: FileText, desc: "Executor anexa PDF, planilha ou doc" },
                    ].map(ev => (
                      <button key={ev.tipo} type="button" onClick={() => upd("tipo_evidencia", ev.tipo)}
                        className={`flex flex-col items-center gap-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                          local.tipo_evidencia === ev.tipo
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-card border-border text-muted-foreground hover:bg-muted"
                        }`}>
                        <ev.icon className="w-4 h-4" />
                        {ev.label}
                      </button>
                    ))}
                    <button type="button" onClick={() => upd("tipo_evidencia", "qualquer")}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded text-xs font-medium border transition-colors ${
                        local.tipo_evidencia === "qualquer"
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}>Qualquer</button>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {local.tipo_evidencia === "foto" && "O executor precisará tirar ou enviar uma foto como comprovação."}
                    {local.tipo_evidencia === "video" && "O executor precisará gravar ou enviar um vídeo como comprovação."}
                    {local.tipo_evidencia === "arquivo" && "O executor precisará anexar um documento (PDF, planilha, etc)."}
                    {local.tipo_evidencia === "qualquer" && "O executor pode enviar qualquer tipo de arquivo como comprovação."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Pergunta do Aprovador ── */}
          <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center gap-3">
              <Switch checked={local.aprovador_verificar ?? false} onCheckedChange={v => {
                upd("aprovador_verificar", v);
                if (!v) upd("aprovador_pergunta", "");
              }} />
              <div>
                <Label className="cursor-pointer font-medium text-sm">Verificação do Aprovador</Label>
                <p className="text-caption text-muted-foreground">Aprovador responderá uma pergunta ao revisar este campo na aprovação final.</p>
              </div>
            </div>

            {local.aprovador_verificar && (
              <div className="space-y-4 pt-2">
                {/* Pergunta + Nota lado a lado */}
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div className="space-y-1.5">
                    <Label>Pergunta <span className="text-destructive">*</span></Label>
                    <Input
                      value={local.aprovador_pergunta || ""}
                      onChange={e => upd("aprovador_pergunta", e.target.value)}
                      placeholder="Ex: O campo foi preenchido corretamente?"
                      maxLength={500}
                    />
                    {!local.aprovador_pergunta?.trim() && (
                      <p className="text-xs text-destructive">Obrigatório.</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nota</Label>
                    <Input type="number" min={1} max={100} value={local.aprovador_peso ?? 1} onChange={e => upd("aprovador_peso", +e.target.value)} />
                  </div>
                </div>

                {/* Tipo de resposta */}
                <div className="space-y-1.5">
                  <Label>Tipo de Resposta</Label>
                  <div className="flex gap-2">
                    {[
                      { v: "conforme", l: "Conforme / Não Conforme / N/A" },
                      { v: "sim_nao", l: "Sim / Não / N/A" },
                    ].map(opt => (
                      <button key={opt.v} type="button" onClick={() => upd("aprovador_tipo_resposta", opt.v)}
                        className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
                          local.aprovador_tipo_resposta === opt.v
                            ? "bg-primary/10 border-primary text-primary"
                            : "bg-card border-border text-muted-foreground hover:bg-muted"
                        }`}>{opt.l}</button>
                    ))}
                  </div>
                </div>

                {/* Condições ao reprovar */}
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ao Reprovar</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={local.aprovador_obriga_observacao_nao} onCheckedChange={v => upd("aprovador_obriga_observacao_nao", v)} />
                      <Label className="cursor-pointer text-sm">Observação obrigatória</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={local.aprovador_exige_evidencia_nao} onCheckedChange={v => upd("aprovador_exige_evidencia_nao", v)} />
                      <Label className="cursor-pointer text-sm">Exigir evidência</Label>
                    </div>
                  </div>

                  {local.aprovador_exige_evidencia_nao && (
                    <div className="pl-4 border-l-2 border-primary/20">
                      <Label className="text-caption mb-1.5 block">Tipos de evidência aceitos</Label>
                      <div className="flex gap-2">
                        {[
                          { tipo: "foto", label: "Foto", icon: Camera },
                          { tipo: "video", label: "Vídeo", icon: FileVideo },
                          { tipo: "documento", label: "Documento", icon: FileText },
                        ].map(ev => (
                          <button key={ev.tipo} type="button" onClick={() => toggleEvidenciaTipo(ev.tipo)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border transition-colors ${
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
                </div>

                {/* ── Pré-visualização ── */}
                {local.aprovador_pergunta?.trim() && (
                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pré-visualização</p>
                    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{local.aprovador_pergunta}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-caption text-muted-foreground">Nota: <strong>{local.aprovador_peso ?? 1}</strong></span>
                            {local.gera_contingencia && (
                              <span className="text-caption text-orange-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Gera contingência
                              </span>
                            )}
                            {local.exige_evidencia && (
                              <span className="text-caption text-primary flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Evidência ({local.tipo_evidencia})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
                          {answerOptions.map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setPreviewAnswer(previewAnswer === opt.value ? null : opt.value)}
                              className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 min-w-[48px] ${
                                previewAnswer === opt.value ? opt.cls : "text-foreground hover:bg-background/50"
                              }`}>{opt.label}</button>
                          ))}
                        </div>
                      </div>

                      {previewAnswer === "nao" && (
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-caption text-destructive font-medium">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Reprovado — {local.aprovador_obriga_observacao_nao ? "descrição obrigatória" : "descrição opcional"}
                          </div>
                          {local.aprovador_obriga_observacao_nao && (
                            <Textarea placeholder="Descreva a irregularidade..." className="bg-card h-16 text-caption" disabled />
                          )}
                          {local.aprovador_exige_evidencia_nao && (
                            <div>
                              <Label className="text-caption mb-1.5 block">Evidência obrigatória</Label>
                              <div className="flex gap-2">
                                {(local.aprovador_tipos_evidencia || []).map(t => {
                                  const icons: Record<string, typeof Camera> = { foto: Camera, video: FileVideo, documento: FileText };
                                  const Icon = icons[t] || FileText;
                                  return (
                                    <Button key={t} type="button" variant="outline" size="sm" className="text-caption" disabled>
                                      <Icon className="w-3.5 h-3.5 mr-1.5" /> {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {local.gera_contingencia && (
                            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded p-2 text-caption text-orange-700 dark:text-orange-400 space-y-1">
                              <p className="flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Contingência será gerada automaticamente
                              </p>
                              <p className="text-orange-600 dark:text-orange-400/80">Executor receberá pendência com prazo SLA e cronômetro de tempo decorrido.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {previewAnswer === "sim" && (
                        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded p-2 text-caption text-emerald-700 dark:text-emerald-400">
                          ✓ Aprovado — +{local.aprovador_peso ?? 1} pontos
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
