import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Settings2, Copy, AlertTriangle, Camera, FileVideo, FileText, Clock, Upload, X, Mic } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionForm, FieldForm, OpcaoRegra, FIELD_TYPES, SECTION_COLORS, defaultField, defaultSection, getDefaultOpcoesRegras } from "../types/tarefas_types";
import { FieldVisibilityEditor } from "@/modules/tarefas/components/builder/FieldVisibilityEditor";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


/**
 * Configuração extra por agrupador (etapas) — vai para template_snapshot.agrupadores_config[].
 * Responsavel/status reservados, não ativados nesta fase.
 */
export interface AgrupadorExtra {
  sla_horas: number | null;
  observacao: string;
}

interface Props {
  sections: SectionForm[];
  setSections: React.Dispatch<React.SetStateAction<SectionForm[]>>;
  fields: FieldForm[];
  setFields: React.Dispatch<React.SetStateAction<FieldForm[]>>;
  setores?: any[];
  tipoExecucao?: string;
  /** Quando true, FieldDetailDialog exige horário_inicio/fim na pergunta (modo individual). */
  requireFieldHorario?: boolean;
  /** Propaga para FieldDetailDialog: habilita "gera plano de ação" nas opções. */
  planoAcaoEnabled?: boolean;
  /** Configurações extras por agrupador (somente etapas). */
  agrupadorExtras?: Record<string, AgrupadorExtra>;
  setAgrupadorExtras?: React.Dispatch<React.SetStateAction<Record<string, AgrupadorExtra>>>;
  /** Quando true, FieldDetailDialog exibe o bloco "Pergunta final para aprovação final".
   *  Derivado da Designação (requer_aprovacao_gestor / requerAprovacao). */
  aprovacaoFinalEnabled?: boolean;
  /** Quando true (Modo Global de horário), oculta os inputs de horário início/fim por etapa.
   *  As etapas herdam o horário limite global da Designação. */
  hideEtapaHorario?: boolean;
}

export function TabFormBuilder({ sections, setSections, fields, setFields, setores = [], tipoExecucao = "checklist_inspecao", requireFieldHorario = false, planoAcaoEnabled = true, agrupadorExtras = {}, setAgrupadorExtras, aprovacaoFinalEnabled = false, hideEtapaHorario = false }: Props) {
  const updateAgrupadorExtra = (tempId: string, patch: Partial<AgrupadorExtra>) => {
    if (!setAgrupadorExtras) return;
    setAgrupadorExtras(prev => ({
      ...prev,
      [tempId]: { sla_horas: prev[tempId]?.sla_horas ?? null, observacao: prev[tempId]?.observacao ?? "", ...patch },
    }));
  };
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldForm | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  /** Quando true, força exibir o card da etapa mesmo se houver apenas uma. Ativado pelo botão "Adicionar Etapa/Formulário". */
  const [etapaModeForced, setEtapaModeForced] = useState(false);
  /** tempIds de fields criados automaticamente quando a etapa é usada como pergunta principal (modo etapa-pergunta). */
  const [autoFieldIds, setAutoFieldIds] = useState<Set<string>>(new Set());
  /** Etapas que o usuário promoveu explicitamente para modo formulário (agrupador). */
  const [formularioForced, setFormularioForced] = useState<Set<string>>(new Set());

  /** Etapa funciona como pergunta principal quando o usuário ainda não a converteu em formulário
   *  e ela tem 0 ou 1 field interno. */
  const isEtapaPergunta = (sectionTempId: string) => {
    if (formularioForced.has(sectionTempId)) return false;
    const cnt = fields.filter(f => f.sectionTempId === sectionTempId).length;
    return cnt <= 1;
  };

  const getAutoField = (sectionTempId: string): FieldForm | undefined => {
    const sFields = fields.filter(f => f.sectionTempId === sectionTempId);
    if (sFields.length === 0) return undefined;
    if (sFields.length === 1 && autoFieldIds.has(sFields[0].tempId)) return sFields[0];
    if (sFields.length === 1 && !formularioForced.has(sectionTempId)) return sFields[0];
    return undefined;
  };

  const addSection = (opts?: { fromUser?: boolean }) => {
    const s = defaultSection(sections.length);
    setSections(prev => [...prev, s]);
    setExpandedSection(s.tempId);
    if (opts?.fromUser) setEtapaModeForced(true);
  };

  const removeSection = (tempId: string) => {
    setSections(prev => prev.filter(s => s.tempId !== tempId));
    setFields(prev => prev.filter(f => f.sectionTempId !== tempId));
    setFormularioForced(prev => { const n = new Set(prev); n.delete(tempId); return n; });
  };

  const updateSection = (tempId: string, key: keyof SectionForm, value: any) => {
    setSections(prev => prev.map(s => s.tempId === tempId ? { ...s, [key]: value } : s));
    // Sincroniza label do auto-field com o nome da etapa quando em modo etapa-pergunta.
    if (key === "nome" && isEtapaPergunta(tempId)) {
      const auto = getAutoField(tempId);
      if (auto) {
        setFields(prev => prev.map(f => f.tempId === auto.tempId ? { ...f, label: String(value || "") } : f));
      }
    }
  };

  /** Define o tipo de resposta da etapa-pergunta. Cria o auto-field se ainda não existir. */
  const setEtapaPerguntaTipo = (sectionTempId: string, tipo: string) => {
    const section = sections.find(s => s.tempId === sectionTempId);
    if (!section) return;
    const auto = getAutoField(sectionTempId);
    if (auto) {
      setFields(prev => prev.map(f => f.tempId === auto.tempId ? { ...f, tipo, opcoes_regras: [], opcoes: [] } : f));
    } else {
      const f = defaultField(sectionTempId, 0);
      f.label = section.nome || "";
      f.tipo = tipo;
      setAutoFieldIds(prev => { const n = new Set(prev); n.add(f.tempId); return n; });
      setFields(prev => [...prev, f]);
    }
  };

  /** Promove a etapa para modo formulário (agrupador). O auto-field, se existir,
   *  permanece como o primeiro field real. */
  const promoteToFormulario = (sectionTempId: string) => {
    setFormularioForced(prev => { const n = new Set(prev); n.add(sectionTempId); return n; });
  };

  const addField = (sectionTempId: string) => {
    const sectionFields = fields.filter(f => f.sectionTempId === sectionTempId);
    setFields(prev => [...prev, defaultField(sectionTempId, sectionFields.length)]);
  };

  /** Abre a Configuração do Campo já para uma nova pergunta (sem pré-criar no estado).
   * O save commita; cancelar descarta. Substitui o antigo modal "Novo Campo". */
  const startNewField = (sectionTempId: string) => {
    const ordem = fields.filter(f => f.sectionTempId === sectionTempId).length;
    const f = defaultField(sectionTempId, ordem);
    setEditingField(f);
    setEditingIsNew(true);
  };

  const closeEditingField = () => {
    setEditingField(null);
    setEditingIsNew(false);
  };

  const commitEditingField = (updates: Partial<FieldForm>) => {
    if (!editingField) return;
    if (editingIsNew) {
      setFields(prev => [...prev, { ...editingField, ...updates }]);
    } else {
      updateField(editingField.tempId, updates);
    }
    closeEditingField();
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

  const duplicateSection = (section: SectionForm) => {
    const newSection: SectionForm = {
      ...section,
      id: undefined,
      tempId: crypto.randomUUID(),
      nome: section.nome ? `${section.nome} (cópia)` : "",
      ordem: sections.length,
    };
    const sectionFields = fields.filter(f => f.sectionTempId === section.tempId);
    const clonedFields: FieldForm[] = sectionFields.map((f, idx) => ({
      ...f,
      id: undefined,
      tempId: crypto.randomUUID(),
      sectionTempId: newSection.tempId,
      ordem: idx,
      // Reset condicao_visibilidade pois aponta para tempIds antigos
      condicao_visibilidade: null,
    }));
    setSections(prev => [...prev, newSection]);
    setFields(prev => [...prev, ...clonedFields]);
    setExpandedSection(newSection.tempId);
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

  // ============================================================
  // Toda estrutura nasce como etapa/agrupador. Ao entrar na aba,
  // se não existir nenhuma etapa, cria automaticamente uma vazia
  // pronta para o usuário preencher.
  // ============================================================
  const ensureDefaultSection = (): string => {
    if (sections.length > 0) return sections[0].tempId;
    const s = defaultSection(0);
    s.nome = "";
    setSections([s]);
    return s.tempId;
  };

  useEffect(() => {
    if (sections.length === 0) {
      const s = defaultSection(0);
      s.nome = "";
      setSections([s]);
      setExpandedSection(s.tempId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddEtapa = () => addSection({ fromUser: true });

  // Sempre exibir o card da etapa — etapa é o elemento principal da estrutura.
  const isImplicitMode = false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Estrutura da Tarefa</p>
          <p className="text-[11px] text-muted-foreground">
            Toda estrutura é uma etapa. Adicione perguntas dentro da etapa para transformá-la em formulário.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleAddEtapa}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar Etapa/Formulário
        </Button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="sections" type="SECTION">
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
              {sections.sort((a, b) => a.ordem - b.ordem).map((section, sIdx) => {
                const sectionFields = fields.filter(f => f.sectionTempId === section.tempId).sort((a, b) => a.ordem - b.ordem);
                const isExpanded = expandedSection === section.tempId;
                const etapaPergunta = isEtapaPergunta(section.tempId);
                const autoField = getAutoField(section.tempId);

                return (
                  <Draggable key={section.tempId} draggableId={section.tempId} index={sIdx}>
                    {(dragProvided) => (
                      <div ref={dragProvided.innerRef} {...dragProvided.draggableProps}
                        className={isImplicitMode ? "" : "border border-border rounded-lg overflow-hidden bg-card"}>
                        {!isImplicitMode && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
                            <div {...dragProvided.dragHandleProps}>
                              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                            </div>
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: section.cor }} />
                            <Input value={section.nome} onChange={e => updateSection(section.tempId, "nome", e.target.value)}
                              placeholder={etapaPergunta ? "Pergunta principal (ex: O local foi limpo?)" : "Nome da etapa/formulário"}
                              className="h-7 text-sm font-medium flex-1" maxLength={100} />
                            <span className={`text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded ${etapaPergunta ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                              {etapaPergunta ? "Pergunta" : `${sectionFields.length} campo${sectionFields.length !== 1 ? "s" : ""}`}
                            </span>
                            <Input type="number" min={0.1} step={0.1} value={section.peso} onChange={e => updateSection(section.tempId, "peso", +e.target.value)}
                              className="h-7 w-16 text-sm text-center" title="Peso da etapa" />
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
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => duplicateSection(section)} title="Duplicar etapa (com campos)" aria-label="Duplicar etapa">
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeSection(section.tempId)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )}

                        {(isExpanded || isImplicitMode) && (
                          <div className={isImplicitMode ? "space-y-2" : "p-3 space-y-2"}>
                            {!isImplicitMode && (
                              <div className="space-y-1">
                                <Label className="text-xs font-medium text-foreground">Instruções da Etapa</Label>
                                <Textarea
                                  value={section.descricao}
                                  onChange={e => updateSection(section.tempId, "descricao", e.target.value)}
                                  placeholder="Orientação textual exibida ao executor antes das perguntas (opcional)."
                                  className="text-sm min-h-[64px]"
                                  maxLength={2000}
                                />
                                <p className="text-[10px] text-muted-foreground">
                                  Suporte a foto/vídeo/documento será habilitado em breve.
                                </p>
                              </div>
                            )}

                            {tipoExecucao === "etapas" && !hideEtapaHorario && (
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
                                <p className="text-[10px] text-muted-foreground max-w-[180px]">
                                  {section.horario_inicio && section.horario_fim
                                    ? "Todas as perguntas desta etapa herdam este horário (campo individual desabilitado)."
                                    : "Sem horário na etapa, cada pergunta exigirá horário próprio."}
                                </p>
                              </div>
                            )}

                            {tipoExecucao === "etapas" && setAgrupadorExtras && (
                              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 mb-2">
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground">SLA da etapa (h)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="Herda global"
                                    value={agrupadorExtras[section.tempId]?.sla_horas ?? ""}
                                    onChange={e => updateAgrupadorExtra(section.tempId, { sla_horas: e.target.value === "" ? null : Math.max(0, +e.target.value || 0) })}
                                    className="h-7 text-xs"
                                  />
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground">Observação da etapa</Label>
                                  <Input
                                    value={agrupadorExtras[section.tempId]?.observacao ?? ""}
                                    onChange={e => updateAgrupadorExtra(section.tempId, { observacao: e.target.value })}
                                    placeholder="Opcional"
                                    className="h-7 text-xs"
                                    maxLength={500}
                                  />
                                </div>
                              </div>
                            )}

                            {!section.nome.trim() && (
                              <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-md p-2 text-[11px] text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                <span>Defina o <strong>nome da etapa</strong> acima antes de adicionar campos. As perguntas só podem ser associadas a uma etapa nomeada.</span>
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

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full mt-2"
                              onClick={() => startNewField(section.tempId)}
                              disabled={!section.nome.trim()}
                              title={!section.nome.trim() ? "Defina o nome da etapa antes de adicionar campos" : undefined}
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar pergunta nesta etapa
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
          allFields={fields}
          setores={setores}
          planoAcaoEnabled={planoAcaoEnabled}
          requireFieldHorario={requireFieldHorario}
          aprovacaoFinalEnabled={aprovacaoFinalEnabled}
          onSave={commitEditingField}
          onClose={closeEditingField}
        />
      )}
    </div>
  );
}

export function FieldDetailDialog({ field, allFields = [], setores, onSave, onClose, planoAcaoEnabled = true, requireFieldHorario = false, aprovacaoFinalEnabled = false }: { field: FieldForm; allFields?: FieldForm[]; setores: any[]; onSave: (u: Partial<FieldForm>) => void; onClose: () => void; planoAcaoEnabled?: boolean; requireFieldHorario?: boolean; aprovacaoFinalEnabled?: boolean }) {
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
    const nova: OpcaoRegra = { valor, label: newOptionLabel.trim(), cor: "muted", requer_descricao: false, requer_evidencia: false, tipos_evidencia: ["qualquer"], gera_contingencia: false };
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

            {requireFieldHorario && (
              <div className="space-y-1.5 bg-primary/5 border border-primary/20 rounded-md p-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary shrink-0" />
                  <Label className="text-xs font-semibold">Horário individual desta pergunta</Label>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Modo individual ativo. Preencha aqui OU defina horário no título da etapa. O atraso será registrado individualmente.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">Início</Label>
                    <Input
                      type="time"
                      value={local.validacao?.horario_inicio || ""}
                      onChange={e => upd("validacao", { ...(local.validacao || {}), horario_inicio: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px]">Fim</Label>
                    <Input
                      type="time"
                      value={local.validacao?.horario_fim || ""}
                      onChange={e => upd("validacao", { ...(local.validacao || {}), horario_fim: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Anexo de instrução */}
            <div className="space-y-1.5">
              <Label>Anexo de Instrução (Documento, Foto ou Vídeo)</Label>
              <p className="text-caption text-muted-foreground">Anexe um modelo ou referência visual de como o procedimento deve ser executado.</p>
              {local.instrucao_url ? (
                <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg p-2">
                  {local.instrucao_tipo === "foto" && (
                    <img src={local.instrucao_url} alt="Instrução" className="w-20 h-20 object-cover rounded" />
                  )}
                  {local.instrucao_tipo === "video" && (
                    <video src={local.instrucao_url} className="w-20 h-20 object-cover rounded" />
                  )}
                  {local.instrucao_tipo === "documento" && (
                    <div className="flex items-center gap-1.5 text-sm"><FileText className="w-4 h-4" /> Documento anexado</div>
                  )}
                  <span className="flex-1 text-xs text-muted-foreground truncate">{local.instrucao_url.split("/").pop()}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { upd("instrucao_url", ""); upd("instrucao_tipo", "foto"); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <InstrucaoUploadButton label="Foto" icon={<Camera className="w-3.5 h-3.5 mr-1.5" />} accept="image/*" tipo="foto" onUpload={(url) => { upd("instrucao_url", url); upd("instrucao_tipo", "foto"); }} />
                  <InstrucaoUploadButton label="Vídeo" icon={<FileVideo className="w-3.5 h-3.5 mr-1.5" />} accept="video/*" tipo="video" onUpload={(url) => { upd("instrucao_url", url); upd("instrucao_tipo", "video"); }} />
                  <InstrucaoUploadButton label="Documento" icon={<FileText className="w-3.5 h-3.5 mr-1.5" />} accept=".pdf,.doc,.docx,.xls,.xlsx" tipo="documento" onUpload={(url) => { upd("instrucao_url", url); upd("instrucao_tipo", "documento"); }} />
                </div>
              )}
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
                              <Switch checked={opcao.requer_evidencia} onCheckedChange={v => {
                                updateOpcaoRegra(opcao.valor, { requer_evidencia: v });
                                if (!v) updateOpcaoRegra(opcao.valor, { tipos_evidencia: ["qualquer"] });
                              }} />
                              <Label className="cursor-pointer text-caption">Exigir evidência</Label>
                            </div>
                            <div className="flex items-center gap-2" title={!planoAcaoEnabled ? "Defina um Responsável pelo Plano de Ação na etapa Designação para habilitar." : undefined}>
                              <Switch
                                checked={planoAcaoEnabled && opcao.gera_contingencia}
                                disabled={!planoAcaoEnabled}
                                onCheckedChange={v => updateOpcaoRegra(opcao.valor, { gera_contingencia: v })}
                              />
                              <Label className={`cursor-pointer text-caption ${!planoAcaoEnabled ? "text-muted-foreground/60" : ""}`}>
                                Gera plano de ação{!planoAcaoEnabled && <span className="text-[10px] ml-1">(requer responsável)</span>}
                              </Label>
                            </div>
                          </div>
                          {!planoAcaoEnabled && opcao.requer_evidencia && (
                            <p className="text-[10px] text-muted-foreground pl-1">Evidência será obrigatória ao selecionar esta opção.</p>
                          )}

                          {opcao.requer_evidencia && (
                            <div className="space-y-2 pl-1">
                              <Label className="text-caption text-muted-foreground">Tipos de mídia aceitos:</Label>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { key: "foto", label: "Foto", icon: <Camera className="w-3 h-3" /> },
                                  { key: "video", label: "Vídeo", icon: <FileVideo className="w-3 h-3" /> },
                                  { key: "audio", label: "Áudio", icon: <Mic className="w-3 h-3" /> },
                                  { key: "qualquer", label: "Qualquer tipo", icon: <FileText className="w-3 h-3" /> },
                                ].map(t => {
                                  const tipos = opcao.tipos_evidencia || ["qualquer"];
                                  const selected = tipos.includes(t.key);
                                  return (
                                    <button key={t.key} type="button"
                                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-caption font-medium border transition-colors ${
                                        selected
                                          ? "bg-primary/10 border-primary/30 text-primary"
                                          : "bg-card border-border text-muted-foreground hover:bg-muted/50"
                                      }`}
                                      onClick={() => {
                                        if (t.key === "qualquer") {
                                          updateOpcaoRegra(opcao.valor, { tipos_evidencia: ["qualquer"] });
                                        } else {
                                          let next = tipos.filter((x: string) => x !== "qualquer");
                                          if (selected) {
                                            next = next.filter((x: string) => x !== t.key);
                                            if (next.length === 0) next = ["qualquer"];
                                          } else {
                                            next = [...next, t.key];
                                          }
                                          updateOpcaoRegra(opcao.valor, { tipos_evidencia: next });
                                        }
                                      }}>
                                      {t.icon} {t.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

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

          {/* ── Pré-visualização (abaixo de opções) ── */}
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
                            <div className="flex flex-wrap gap-2">
                              {(selectedOpcao.tipos_evidencia?.includes("qualquer") || selectedOpcao.tipos_evidencia?.includes("foto")) && (
                                <Button type="button" variant="outline" size="sm" className="text-caption" disabled><Camera className="w-3.5 h-3.5 mr-1.5" /> Foto</Button>
                              )}
                              {(selectedOpcao.tipos_evidencia?.includes("qualquer") || selectedOpcao.tipos_evidencia?.includes("video")) && (
                                <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileVideo className="w-3.5 h-3.5 mr-1.5" /> Vídeo</Button>
                              )}
                              {(selectedOpcao.tipos_evidencia?.includes("qualquer") || selectedOpcao.tipos_evidencia?.includes("audio")) && (
                                <Button type="button" variant="outline" size="sm" className="text-caption" disabled><Mic className="w-3.5 h-3.5 mr-1.5" /> Áudio</Button>
                              )}
                              {selectedOpcao.tipos_evidencia?.includes("qualquer") && (
                                <Button type="button" variant="outline" size="sm" className="text-caption" disabled><FileText className="w-3.5 h-3.5 mr-1.5" /> Doc</Button>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedOpcao.gera_contingencia && (
                          <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded p-2 text-caption text-orange-700 dark:text-orange-400 space-y-1">
                            <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Plano de Ação será gerada automaticamente</p>
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

          {/* ── Pergunta final para aprovação final ──
              Renderiza somente se a Designação tiver aprovação final habilitada. */}
          {aprovacaoFinalEnabled && (
            <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={local.aprovador_verificar ?? false} onCheckedChange={v => {
                  upd("aprovador_verificar", v);
                  if (!v) upd("aprovador_pergunta", "");
                }} />
                <div>
                  <Label className="cursor-pointer font-medium text-sm">Pergunta final para aprovação final</Label>
                  <p className="text-caption text-muted-foreground">O aprovador responderá uma pergunta ao revisar este campo na aprovação final.</p>
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
          )}

          <FieldVisibilityEditor
            currentTempId={local.tempId}
            allFields={allFields}
            value={local.condicao_visibilidade}
            onChange={(v) => upd("condicao_visibilidade", v)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={() => onSave(local)}>Salvar Campo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstrucaoUploadButton({ label, icon, accept, tipo, onUpload }: {
  label: string; icon: React.ReactNode; accept: string; tipo: string;
  onUpload: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("instrucoes-campos").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("instrucoes-campos").getPublicUrl(path);
      onUpload(urlData.publicUrl);
      toast.success(`${label} enviado com sucesso`);
    } catch (err: any) {
      toast.error(`Erro ao enviar: ${err.message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      <Button type="button" variant="outline" size="sm" className="text-caption" disabled={uploading}
        onClick={() => inputRef.current?.click()}>
        {uploading ? <Clock className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : icon}
        {uploading ? "Enviando..." : label}
      </Button>
    </>
  );
}
