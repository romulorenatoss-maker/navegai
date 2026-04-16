import { useState, useRef } from "react";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Settings2, Copy, AlertTriangle, Camera, FileVideo, FileText, Clock, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionForm, FieldForm, OpcaoRegra, FIELD_TYPES, SECTION_COLORS, defaultField, defaultSection, getDefaultOpcoesRegras } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  sections: SectionForm[];
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>;
  fields: FieldForm[];
  setFields: React.Dispatch<React.SetStateAction<FieldForm[]>>;
  setores?: any[];
  tipoExecucao?: string;
}

export function TabFormBuilder({ sections, setSections, fields, setFields, setores = [], tipoExecucao = "checklist_inspecao" }: Props) {
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

                            {tipoExecucao === "etapas" && (
                              <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-md p-2 mb-2">
                                <Clock className="w-4 h-4 text-primary shrink-0" />
                                <div className="flex items-center gap-2 flex-1">
                                  <div className="space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground">Horário Início</Label>
                                    <Input type="time" value={section.horario_inicio || ""} onChange={e => updateSection(section.tempId, "horario_inicio" as any, e.target.value)}
                                      className="h-7 text-xs w-[110px]" />
                                  </div>
                                  <span className="text-muted-foreground text-xs mt-3">até</span>
                                  <div className="space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground">Horário Fim</Label>
                                    <Input type="time" value={section.horario_fim || ""} onChange={e => updateSection(section.tempId, "horario_fim" as any, e.target.value)}
                                      className="h-7 text-xs w-[110px]" />
                                  </div>
                                </div>
                                <p className="text-[10px] text-muted-foreground max-w-[180px]">Campos desta etapa devem ser preenchidos neste horário. Fora do prazo = atraso automático.</p>
                              </div>
                            )}

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
  const [previewAnswer, setPreviewAnswer] = useState<string | null>(null);
  const [expandedOption, setExpandedOption] = useState<string | null>(null);
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const tiposComOpcoes = ["conforme", "sim_nao", "nota_avaliacao", "select", "multi_select"];
  const temOpcoes = tiposComOpcoes.includes(local.tipo);

  const opcoesRegras: OpcaoRegra[] = local.opcoes_regras?.length > 0
    ? local.opcoes_regras
    : getDefaultOpcoesRegras(local.tipo);

  const handleTipoChange = (novoTipo: string) => {
    upd("tipo", novoTipo);
    const defaults = getDefaultOpcoesRegras(novoTipo);
    upd("opcoes_regras", defaults);
    setPreviewAnswer(null);
    setExpandedOption(null);
  };

  const updateOpcaoRegra = (valor: string, updates: Partial<OpcaoRegra>) => {
    const current = opcoesRegras.map(o => o.valor === valor ? { ...o, ...updates } : o);
    upd("opcoes_regras", current);
  };

  const addCustomOption = () => {
    if (!newOptionLabel.trim()) return;
    const valor = newOptionLabel.trim().toLowerCase().replace(/\s+/g, "_");
    const nova: OpcaoRegra = { valor, label: newOptionLabel.trim(), cor: "muted", requer_descricao: false, requer_evidencia: false, gera_contingencia: false };
    upd("opcoes_regras", [...opcoesRegras, nova]);
    upd("opcoes", [...(local.opcoes || []), newOptionLabel.trim()]);
    setNewOptionLabel("");
  };

  const removeCustomOption = (valor: string) => {
    upd("opcoes_regras", opcoesRegras.filter(o => o.valor !== valor));
    upd("opcoes", (local.opcoes || []).filter((o: string) => o.toLowerCase().replace(/\s+/g, "_") !== valor));
  };

  const getCorClass = (cor: string, active: boolean) => {
    if (!active) return "text-foreground hover:bg-background/50";
    if (cor === "success") return "bg-success text-success-foreground";
    if (cor === "destructive") return "bg-destructive text-destructive-foreground";
    return "bg-muted text-foreground";
  };

  const selectedOpcao = opcoesRegras.find(o => o.valor === previewAnswer);

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
                <Select value={local.tipo} onValueChange={handleTipoChange}>
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


          {/* ── Opções e Regras por Botão ── */}
          {temOpcoes && (
            <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Opções de Resposta — Regras por Botão
              </p>
              <p className="text-caption text-muted-foreground">
                Configure individualmente o que acontece ao clicar em cada opção. Clique para expandir.
              </p>

              {(local.tipo === "select" || local.tipo === "multi_select") && (
                <div className="flex gap-2">
                  <Input value={newOptionLabel} onChange={e => setNewOptionLabel(e.target.value)}
                    placeholder="Nova opção..." className="flex-1 h-8 text-sm"
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustomOption())} />
                  <Button type="button" variant="outline" size="sm" onClick={addCustomOption} disabled={!newOptionLabel.trim()}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                {opcoesRegras.map(opcao => {
                  const isExpanded = expandedOption === opcao.valor;
                  const isCustom = local.tipo === "select" || local.tipo === "multi_select";
                  const hasAnyRule = opcao.requer_descricao || opcao.requer_evidencia || opcao.gera_contingencia;

                  return (
                    <div key={opcao.valor} className="border border-border rounded-lg overflow-hidden bg-card">
                      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedOption(isExpanded ? null : opcao.valor)}>
                        <div className={`w-3 h-3 rounded-full shrink-0 ${
                          opcao.cor === "success" ? "bg-success" : opcao.cor === "destructive" ? "bg-destructive" : "bg-muted-foreground/40"
                        }`} />
                        <span className="text-sm font-medium flex-1">{opcao.label}</span>
                        {hasAnyRule && (
                          <div className="flex gap-1">
                            {opcao.requer_descricao && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Desc.</span>}
                            {opcao.requer_evidencia && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">Evid.</span>}
                            {opcao.gera_contingencia && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800">Conting.</span>}
                          </div>
                        )}
                        {!hasAnyRule && <span className="text-caption text-muted-foreground">Sem regras</span>}
                        {isCustom && (
                          <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive"
                            onClick={e => { e.stopPropagation(); removeCustomOption(opcao.valor); }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div className="flex items-center gap-2">
                              <Switch checked={opcao.requer_descricao} onCheckedChange={v => updateOpcaoRegra(opcao.valor, { requer_descricao: v })} />
                              <Label className="cursor-pointer text-caption">Descrição obrigatória</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={opcao.requer_evidencia} onCheckedChange={v => updateOpcaoRegra(opcao.valor, { requer_evidencia: v })} />
                              <Label className="cursor-pointer text-caption">Exigir evidência</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch checked={opcao.gera_contingencia} onCheckedChange={v => updateOpcaoRegra(opcao.valor, { gera_contingencia: v })} />
                              <Label className="cursor-pointer text-caption">Gera contingência</Label>
                            </div>
                          </div>
                          {opcao.gera_contingencia && (
                            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded p-2 text-caption text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Executor receberá pendência com prazo SLA e cronômetro.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {opcoesRegras.length === 0 && (local.tipo === "select" || local.tipo === "multi_select") && (
                <p className="text-center text-caption text-muted-foreground py-4">Adicione opções acima para configurar as regras.</p>
              )}
            </div>
          )}

          {/* ── Verificação do Aprovador ── */}
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
                <div className="grid grid-cols-[1fr_100px] gap-3">
                  <div className="space-y-1.5">
                    <Label>Pergunta <span className="text-destructive">*</span></Label>
                    <Input value={local.aprovador_pergunta || ""} onChange={e => upd("aprovador_pergunta", e.target.value)}
                      placeholder="Ex: O campo foi preenchido corretamente?" maxLength={500} />
                    {!local.aprovador_pergunta?.trim() && <p className="text-xs text-destructive">Obrigatório.</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nota</Label>
                    <Input type="number" min={1} max={100} value={local.aprovador_peso ?? 1} onChange={e => upd("aprovador_peso", +e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Pré-visualização ── */}
          {local.label?.trim() && temOpcoes && opcoesRegras.length > 0 && (
            <div className="space-y-2">
              <p className="text-caption text-muted-foreground uppercase tracking-wider font-semibold">Pré-visualização</p>
              <div className="bg-muted/30 border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-body font-medium text-foreground">{local.label}</p>
                    {local.aprovador_verificar && local.aprovador_pergunta?.trim() && (
                      <p className="text-caption text-muted-foreground mt-0.5">Nota: {local.aprovador_peso ?? 1}</p>
                    )}
                  </div>
                  <div className="flex bg-muted rounded-md p-0.5 gap-0.5 shrink-0">
                    {opcoesRegras.map(opt => (
                      <button key={opt.valor} type="button"
                        onClick={() => setPreviewAnswer(previewAnswer === opt.valor ? null : opt.valor)}
                        className={`px-3 py-1.5 rounded text-caption font-medium transition-all duration-150 min-w-[48px] ${
                          getCorClass(opt.cor, previewAnswer === opt.valor)
                        }`}>{opt.label}</button>
                    ))}
                  </div>
                </div>
                <AnimatePresence>
                  {selectedOpcao && (selectedOpcao.requer_descricao || selectedOpcao.requer_evidencia || selectedOpcao.gera_contingencia) && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className={`border rounded-lg p-3 mt-3 space-y-3 ${
                        selectedOpcao.cor === "destructive" ? "bg-destructive/5 border-destructive/20"
                          : selectedOpcao.cor === "success" ? "bg-success/5 border-success/20"
                          : "bg-muted/50 border-border"
                      }`}>
                        {selectedOpcao.requer_descricao && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-caption font-medium text-destructive">
                              <AlertTriangle className="w-3.5 h-3.5" /> Descrição obrigatória
                            </div>
                            <Textarea placeholder="Descreva a irregularidade..." className="bg-card h-20 text-caption" disabled />
                          </div>
                        )}
                        {selectedOpcao.requer_evidencia && (
                          <div>
                            <Label className="text-caption mb-1.5 block">Evidência obrigatória</Label>
                            <div className="flex gap-2">
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><Camera className="w-3.5 h-3.5 mr-1.5" /> Foto</Button>
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileVideo className="w-3.5 h-3.5 mr-1.5" /> Vídeo</Button>
                              <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileText className="w-3.5 h-3.5 mr-1.5" /> Doc</Button>
                            </div>
                          </div>
                        )}
                        {selectedOpcao.gera_contingencia && (
                          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded p-2 text-caption text-orange-700 dark:text-orange-400 space-y-1">
                            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Contingência será gerada automaticamente</p>
                            <p className="text-orange-600 dark:text-orange-400/80">Executor receberá pendência com prazo SLA e cronômetro de tempo decorrido.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  {selectedOpcao && !selectedOpcao.requer_descricao && !selectedOpcao.requer_evidencia && !selectedOpcao.gera_contingencia && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <div className={`rounded p-2 mt-3 text-caption ${
                        selectedOpcao.cor === "success" ? "bg-success/10 border border-success/20 text-success" : "bg-muted/50 border border-border text-muted-foreground"
                      }`}>
                        {selectedOpcao.cor === "success" ? `✓ ${selectedOpcao.label} — Nenhuma ação adicional` : `${selectedOpcao.label} — Sem regras configuradas`}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => onSave(local)}>Salvar Campo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
