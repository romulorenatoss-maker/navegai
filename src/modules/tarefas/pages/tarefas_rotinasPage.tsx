import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Filter, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPO_EXECUCAO_LABELS, RECORRENCIA_LABELS } from "@/modules/tarefas/hooks/tarefas_useScoring";
import { TemplateForm, SectionForm, FieldForm, StepForm, defaultTemplate, defaultSection, defaultField, defaultStep } from "@/modules/tarefas/types/tarefas_types";
// (Removido) TaskTypeSelectorDialog — builder único, sem seletor prévio.
type TaskType = "simples" | "inspecao";
import { TarefasBuilderWizard } from "@/modules/tarefas/components/builder/TarefasBuilderWizard";
import { AprovadorCheckItemForm, buildAprovadorAutomatico, defaultAprovadorCheckItem } from "@/modules/tarefas/components/builder/types";
import { normalizeAprovadorList, syncAprovadorReplicadasFromFields } from "@/modules/tarefas/components/builder/checklistNormalizers";

import { getPontuacaoConfig } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";
// Draft/rascunho automático REMOVIDO: a única fonte de verdade é o estado salvo da rotina.
// Limpeza preventiva de qualquer entrada antiga ainda presente no navegador.
const LEGACY_DRAFT_PREFIX = "tarefas_builder_draft_v1::";
const purgeLegacyBuilderDrafts = () => {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_DRAFT_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

const normalizeKeyText = (value: unknown) =>
  String(value ?? "").trim().toLocaleLowerCase("pt-BR");

const fieldDuplicateKey = (field: FieldForm) => JSON.stringify([
  normalizeKeyText(field.label),
  field.tipo || "",
  Number(field.ordem) || 0,
]);

const dedupeLoadedFields = (loadedFields: FieldForm[], referencedFieldIds: Set<string>) => {
  const byKey = new Map<string, FieldForm>();
  const deduped: FieldForm[] = [];
  for (const field of loadedFields) {
    const key = fieldDuplicateKey(field);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, field);
      deduped.push(field);
      continue;
    }
    const bothHaveDifferentSections = !!existing.sectionTempId && !!field.sectionTempId && existing.sectionTempId !== field.sectionTempId;
    if (bothHaveDifferentSections) {
      deduped.push(field);
      continue;
    }
    const existingIsReferenced = !!existing.id && referencedFieldIds.has(existing.id);
    const fieldIsReferenced = !!field.id && referencedFieldIds.has(field.id);
    const shouldReplace =
      (!existingIsReferenced && fieldIsReferenced) ||
      (!existing.sectionTempId && !!field.sectionTempId);
    if (shouldReplace) {
      const idx = deduped.findIndex(f => f.tempId === existing.tempId);
      if (idx >= 0) deduped[idx] = field;
      byKey.set(key, field);
    }
  }
  return deduped.sort((a, b) => a.ordem - b.ordem);
};

const sanitizeAprovadorChecks = (
  rawItems: AprovadorCheckItemForm[],
  currentFields: FieldForm[],
  pacotePadrao: any[] | undefined,
  incluirAutomaticas: boolean,
) => {
  const uniqueFields = [...currentFields]
    .filter(f => !!f.tempId)
    .sort((a, b) => a.ordem - b.ordem);
  const baseItems = normalizeAprovadorList(rawItems);
  const replicadasPrev = baseItems.filter(item => item.origem_pergunta === "replicada_avaliado");
  const naoReplicadas = baseItems.filter(item => item.origem_pergunta !== "replicada_avaliado");
  const replicadasByField = new Map(replicadasPrev.map(item => [item.field_id, item]));
  const replicadasEspelhadas = uniqueFields.map(field => {
    const existing = replicadasByField.get(field.tempId);
    const label = field.label || "Pergunta sem nome";
    const pergunta = `Aprovador confirma: ${label}?`;
    if (!existing) return defaultAprovadorCheckItem(field.tempId, label);
    return {
      ...existing,
      field_id: field.tempId,
      field_label: label,
      pergunta_padrao: pergunta,
      origem_pergunta: "replicada_avaliado" as const,
      pergunta_origem_id: field.tempId,
    };
  });
  const normalized = [...replicadasEspelhadas, ...naoReplicadas];
  if (!incluirAutomaticas) {
    return normalized.filter(item => item.origem_pergunta !== "automatica_configuracao");
  }
  const existingConfigIds = new Set(
    normalized.map(item => item.config_global_origem_id).filter(Boolean)
  );
  const missingAutomaticas = (pacotePadrao ?? [])
    .filter(p => p.ativo !== false && !existingConfigIds.has(p.id))
    .map(p => buildAprovadorAutomatico(p));
  return normalizeAprovadorList([...normalized, ...missingAutomaticas]);
};

const fetchReferencedFieldIds = async (fieldIds: string[]) => {
  const referenced = new Set<string>();
  if (fieldIds.length === 0) return referenced;

  // Busca assignments ativos (não deletados) para filtrar respostas órfãs.
  // Respostas de assignments deletados não devem proteger o field do delete.
  const { data: activeAssignments } = await (supabase as any)
    .from("operational_assignments")
    .select("id");
  const activeAssignmentIds = new Set<string>(
    (activeAssignments || []).map((a: any) => a.id).filter(Boolean)
  );

  const readRefs = async (table: string, column: string, assignmentColumn = "assignment_id") => {
    const { data, error } = await (supabase as any)
      .from(table)
      .select(`${column}, ${assignmentColumn}`)
      .in(column, fieldIds);
    if (error) throw error;
    (data || []).forEach((row: any) => {
      if (!row?.[column]) return;
      // Só protege o field se o assignment ainda existe (não foi deletado).
      const assignmentId = row[assignmentColumn];
      if (!assignmentId || activeAssignmentIds.has(assignmentId)) {
        referenced.add(row[column]);
      }
    });
  };

  await readRefs("operational_field_answers", "field_id");
  await readRefs("operational_field_reviews", "field_id");
  await readRefs("operational_approval_answers", "field_id");
  await readRefs("operational_audit_answers", "field_id");
  await readRefs("operational_contingencies", "origin_field_id");
  // [DEBUG TEMP] inspecionar resultado de fetchReferencedFieldIds
  console.log("[DEBUG fetchReferencedFieldIds]", {
    fieldIds,
    referenced: Array.from(referenced),
  });
  return referenced;
};

const sectionPayload = (templateId: string, section: SectionForm, index: number) => ({
  template_id: templateId,
  nome: section.nome || `Seção ${index + 1}`,
  descricao: section.descricao || null,
  peso: section.peso,
  ordem: index,
  cor: section.cor,
  horario_inicio: section.horario_inicio || null,
  horario_fim: section.horario_fim || null,
});

const fieldPayload = (templateId: string, field: FieldForm, sectionIdMap: Record<string, string>) => ({
  template_id: templateId,
  section_id: sectionIdMap[field.sectionTempId] || null,
  label: field.label || "Campo sem nome",
  descricao: field.descricao || null,
  tipo: field.tipo,
  ordem: field.ordem,
  obrigatorio: field.obrigatorio,
  peso: field.peso,
  nota_maxima: field.nota_maxima,
  impacta_score: field.impacta_score,
  criticidade: field.criticidade,
  gera_contingencia: field.gera_contingencia,
  exige_evidencia: field.exige_evidencia,
  tipo_evidencia: field.tipo_evidencia || "foto",
  opcoes: field.opcoes?.length > 0 ? field.opcoes : null,
  opcoes_regras: field.opcoes_regras?.length > 0 ? field.opcoes_regras : [],
  validacao: field.validacao,
  condicao_visibilidade: field.condicao_visibilidade,
  formula: field.formula,
  visivel_para: field.visivel_para,
  editavel_por: field.editavel_por,
  aprovador_verificar: field.aprovador_verificar || false,
  aprovador_pergunta: field.aprovador_verificar ? (field.aprovador_pergunta || null) : null,
  aprovador_tipo_resposta: field.aprovador_tipo_resposta || "conforme",
  aprovador_peso: field.aprovador_peso ?? 1,
  aprovador_obriga_observacao_nao: field.aprovador_obriga_observacao_nao ?? true,
  aprovador_exige_evidencia_nao: field.aprovador_exige_evidencia_nao ?? false,
  aprovador_tipos_evidencia: field.aprovador_tipos_evidencia || ["foto"],
});

export default function OperationalCadastroPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // (Removido) seletor "Tipo de tarefa" — abre o builder direto.
  
  const [form, setForm] = useState<TemplateForm>(defaultTemplate);
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fields, setFields] = useState<FieldForm[]>([]);
  const [steps, setSteps] = useState<StepForm[]>([]);
  const [aprovadorChecks, setAprovadorChecks] = useState<AprovadorCheckItemForm[]>([]);
  const [validadorChecks, setValidadorChecks] = useState<AprovadorCheckItemForm[]>([]);
  
  const [activeTab, setActiveTab] = useState("geral");
  const [filterExecutor, setFilterExecutor] = useState("__all");
  const [filterAvaliador, setFilterAvaliador] = useState("__all");
  // Draft/rascunho removido — sem autosave, sem restore.

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["operational_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_templates")
        .select("*, setores!operational_templates_setor_id_fkey(nome)")
        // LEGADO: origem.is.null incluído por compat com templates antigos sem o campo origem.
        // Tarefas avulsas novas são sempre gravadas com origem='ad_hoc' e NÃO aparecem aqui.
        // TODO(rotinas): após migration backfill (origem='rotina' onde recorrencia_tipo!='unica'), remover origem.is.null.
        .or("origem.eq.rotina,origem.is.null")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  // Config global de Pontuação/SLA — usada para exibir as penalidades automáticas
  // como "perguntas" no topo das abas Avaliado / Aprovador / Validador.
  const { data: pontuacaoConfig } = useQuery({
    queryKey: ["tarefas_pontuacao_config"],
    queryFn: getPontuacaoConfig,
    staleTime: 60_000,
  });
  const { executorProfiles, avaliadorProfiles } = useMemo(() => {
    const execMap = new Map<string, string>();
    const avalMap = new Map<string, string>();
    const profileMap = new Map(colaboradores.map((c: any) => [c.id, c.nome]));
    for (const t of templates) {
      if (t.executor_profile_id && profileMap.has(t.executor_profile_id))
        execMap.set(t.executor_profile_id, profileMap.get(t.executor_profile_id)!);
      if (t.aprovador_profile_id && profileMap.has(t.aprovador_profile_id))
        avalMap.set(t.aprovador_profile_id, profileMap.get(t.aprovador_profile_id)!);
    }
    return {
      executorProfiles: Array.from(execMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      avaliadorProfiles: Array.from(avalMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [templates, colaboradores]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (filterExecutor !== "__all") list = list.filter((t: any) => t.executor_profile_id === filterExecutor);
    if (filterAvaliador !== "__all") list = list.filter((t: any) => t.aprovador_profile_id === filterAvaliador);
    return list;
  }, [templates, filterExecutor, filterAvaliador]);

  // Group templates by setor
  const groupedTemplates = useMemo(() => {
    const groups: { setor: string; setorId: string | null; items: any[] }[] = [];
    const map = new Map<string, any[]>();
    const order: string[] = [];
    for (const t of filteredTemplates) {
      const key = t.setor_id || "__sem_setor";
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(t);
    }
    for (const key of order) {
      const items = map.get(key)!;
      const setor = key === "__sem_setor" ? "Sem Setor" : (items[0]?.setores?.nome || "Sem Setor");
      groups.push({ setor, setorId: key === "__sem_setor" ? null : key, items });
    }
    return groups;
  }, [filteredTemplates]);

  // Drag-and-drop state
  const dragItem = useRef<{ id: string; setorKey: string } | null>(null);
  const dragOverItem = useRef<{ id: string; setorKey: string } | null>(null);

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; ordem: number }[]) => {
      for (const u of updates) {
        await (supabase as any).from("operational_templates").update({ ordem: u.ordem }).eq("id", u.id);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational_templates"] }),
  });

  const handleDragStart = useCallback((id: string, setorKey: string) => {
    dragItem.current = { id, setorKey };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string, setorKey: string) => {
    e.preventDefault();
    dragOverItem.current = { id, setorKey };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!dragItem.current || !dragOverItem.current) return;
    if (dragItem.current.setorKey !== dragOverItem.current.setorKey) return; // only within same setor
    if (dragItem.current.id === dragOverItem.current.id) return;

    const setorKey = dragItem.current.setorKey;
    const group = groupedTemplates.find(g => (g.setorId || "__sem_setor") === setorKey);
    if (!group) return;

    const items = [...group.items];
    const fromIdx = items.findIndex(i => i.id === dragItem.current!.id);
    const toIdx = items.findIndex(i => i.id === dragOverItem.current!.id);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);

    const updates = items.map((item, idx) => ({ id: item.id, ordem: idx }));
    reorderMutation.mutate(updates);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [templates, filterExecutor, filterAvaliador]);

  const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const upsert = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome é obrigatório");
      // Causa raiz: fields órfãos (sem section_id ativo) eram serializados no snapshot
      // e reapareciam como fantasmas no Aprovador ao reabrir. Filtrar antes do sync.
      const activeSectionIds = new Set(sections.map(s => s.tempId).filter(Boolean));
      const activeFields = fields.filter(f => f.sectionTempId && activeSectionIds.has(f.sectionTempId));
      const aprovadorSync = syncAprovadorReplicadasFromFields(aprovadorChecks, activeFields);
      const aprovadorSnapshot = sanitizeAprovadorChecks(
        aprovadorSync,
        activeFields,
        pontuacaoConfig?.aprovador_pacote_padrao,
        form.habilitar_perguntas_automaticas,
      );
      const activeAvaliadorFields = activeFields.map(f => ({
        id: f.id ?? null,
        key: fieldDuplicateKey(f),
      }));
      const activeAvaliadorFieldIds = activeAvaliadorFields.map(f => f.id).filter(Boolean);
      const adaSnapshotBase = (((form as any).ada_config_snapshot ?? {}) as any);
      
      const payload: any = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        tipo_execucao: form.tipo_execucao,
        setor_id: form.setor_id || null,
        responsavel_id: form.responsavel_id || null,
        recorrencia_tipo: form.recorrencia_tipo,
        dias_da_semana: form.dias_da_semana,
        intervalo_dias: form.intervalo_dias,
        pular_semanas: form.pular_semanas,
        dia_fixo_mes: form.dia_fixo_mes,
        data_inicio: form.data_inicio || null,
        data_fim: form.repetir_sempre ? null : (form.data_fim || null),
        horario_inicio_previsto: form.horario_inicio_previsto || null,
        horario_limite_execucao: form.horario_limite_execucao || null,
        tolerancia_minutos: form.tolerancia_minutos,
        sla_horas: form.sla_horas,
        gerar_contingencia_automatica: form.gerar_contingencia_automatica,
        prazo_sla_correcao_horas: form.prazo_sla_correcao_horas,
        requer_aprovacao_gestor: form.requer_aprovacao_gestor,
        bloquear_fechamento_com_contingencia: form.bloquear_fechamento_com_contingencia,
        permite_devolucao_parcial: form.permite_devolucao_parcial,
        executor_profile_id: form.executor_profile_id || null,
        executor_setor_id: form.executor_setor_id || null,
        avaliado_profile_id: form.avaliado_profile_id || null,
        avaliado_setor_id: form.avaliado_setor_id || null,
        aprovador_profile_id: form.aprovador_profile_id || null,
        aprovador_setor_id: form.aprovador_setor_id || null,
        auditor_profile_id: form.auditor_profile_id || null,
        auditor_setor_id: form.auditor_setor_id || null,
        modo_pontuacao: form.modo_pontuacao,
        destino_score: form.destino_score,
        peso_recorrencia: form.peso_recorrencia,
        tipo_atribuicao_avaliado: form.tipo_atribuicao_avaliado,
        penalidade_contingencia: form.penalidade_contingencia,
        penalidade_sla_contingencia: form.penalidade_sla_contingencia,
        penalidade_fora_prazo: form.penalidade_fora_prazo,
        habilitar_perguntas_automaticas: form.habilitar_perguntas_automaticas,
        ada_config_snapshot: {
          ...adaSnapshotBase,
          checklists: {
            ...((adaSnapshotBase.checklists ?? {}) as any),
            avaliado_fields: activeAvaliadorFields,
            avaliado_field_ids: activeAvaliadorFieldIds,
            aprovador: aprovadorSnapshot,
            validador: validadorChecks,
          },
        },
      };

      let templateId: string;
      if (editingId) {
        // Fetch current data for audit trail before updating
        const { data: currentTemplate } = await (supabase as any).from("operational_templates")
          .select("*").eq("id", editingId).single();
        
        const { error } = await (supabase as any).from("operational_templates").update(payload).eq("id", editingId);
        if (error) throw error;
        templateId = editingId;

        // Audit: log role changes
        if (currentTemplate) {
          const trackedFields = [
            "executor_profile_id", "executor_setor_id",
            "aprovador_profile_id", "aprovador_setor_id",
            "aprovador_profile_id", "aprovador_setor_id",
            "validador_contingencia_profile_id", "validador_contingencia_setor_id",
            "nome", "setor_id", "recorrencia_tipo", "tipo_execucao",
          ];
          const changes: Record<string, { de: any; para: any }> = {};
          for (const field of trackedFields) {
            const oldVal = currentTemplate[field] ?? null;
            const newVal = payload[field] ?? null;
            if (oldVal !== newVal) {
              changes[field] = { de: oldVal, para: newVal };
            }
          }
          if (Object.keys(changes).length > 0) {
            const { data: profile } = await supabase.from("profiles")
              .select("id").eq("user_id", (await supabase.auth.getUser()).data.user?.id || "").single();
            if (profile) {
              await (supabase as any).from("audit_logs").insert({
                tabela: "operational_templates",
                acao: "update_template",
                registro_id: editingId,
                user_id: profile.id,
                dados_anteriores: changes,
                dados_novos: payload,
              });
            }
          }
        }

        // Campos/seções não podem ser apagados em massa quando já existem respostas.
        // Atualizamos os registros existentes e removemos apenas órfãos sem vínculo,
        // evitando reinserir duplicados a cada salvamento.
      } else {
        const { data, error } = await (supabase as any).from("operational_templates").insert(payload).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      // Persist sections/fields
      const sectionIdMap: Record<string, string> = {};
      if (editingId) {
        for (const [i, s] of sections.entries()) {
          const payloadSection = sectionPayload(templateId, s, i);
          if (s.id) {
            const { error } = await (supabase as any).from("operational_template_sections").update(payloadSection).eq("id", s.id);
            if (error) throw error;
            sectionIdMap[s.tempId] = s.id;
          } else {
            const { data, error } = await (supabase as any).from("operational_template_sections").insert(payloadSection).select("id").single();
            if (error) throw error;
            sectionIdMap[s.tempId] = data.id;
          }
        }

        const { data: existingFields, error: existingFieldsError } = await (supabase as any)
          .from("operational_template_fields")
          .select("id")
          .eq("template_id", templateId);
        if (existingFieldsError) throw existingFieldsError;
        const existingFieldIds = (existingFields || []).map((f: any) => f.id).filter(Boolean);
        // currentFieldIds = ids dos campos que o usuário manteve na UI agora.
        // activeAvaliadorFieldIds = ids ativos (já calculado acima no upsert).
        // Um campo é removível se: saiu da UI E não tem respostas vinculadas.
        const currentFieldIds = new Set(activeAvaliadorFieldIds.filter(Boolean) as string[]);
        const referencedFieldIds = await fetchReferencedFieldIds(existingFieldIds);
        const removableFieldIds = existingFieldIds.filter((id: string) => !currentFieldIds.has(id) && !referencedFieldIds.has(id));
        // [DEBUG TEMP] inspecionar cálculo de removableFieldIds
        console.log("[DEBUG removableFieldIds]", {
          existingFieldIds,
          currentFieldIds: Array.from(currentFieldIds),
          removableFieldIds,
        });
        if (removableFieldIds.length > 0) {
          const { error } = await (supabase as any).from("operational_template_fields").delete().in("id", removableFieldIds);
          if (error) throw error;
        }

        for (const f of fields) {
          const payloadField = fieldPayload(templateId, f, sectionIdMap);
          if (f.id) {
            const { error } = await (supabase as any).from("operational_template_fields").update(payloadField).eq("id", f.id);
            if (error) throw error;
          } else {
            const { error } = await (supabase as any).from("operational_template_fields").insert(payloadField);
            if (error) throw error;
          }
        }

        const { error: stepsDeleteError } = await (supabase as any).from("operational_template_steps").delete().eq("template_id", templateId);
        if (stepsDeleteError) throw stepsDeleteError;
      } else if (sections.length > 0) {
        const { data: inserted, error } = await (supabase as any).from("operational_template_sections").insert(
          sections.map((s, i) => sectionPayload(templateId, s, i))
        ).select();
        if (error) throw error;
        sections.forEach((s, i) => { sectionIdMap[s.tempId] = inserted[i].id; });
      }

      if (!editingId && fields.length > 0) {
        const { error } = await (supabase as any).from("operational_template_fields").insert(
          fields.map(f => fieldPayload(templateId, f, sectionIdMap))
        );
        if (error) throw error;
      }

      // Insert steps
      if (steps.length > 0) {
        const { error } = await (supabase as any).from("operational_template_steps").insert(
          steps.map((s, i) => ({
            template_id: templateId, nome: s.nome || `Etapa ${i + 1}`, ordem: i,
            peso: s.peso, horario_inicio: s.horario_inicio || null, horario_fim: s.horario_fim || null,
            prazo_limite_minutos: s.prazo_limite_minutos, exige_foto: s.exige_foto,
            exige_observacao: s.exige_observacao, exige_video: s.exige_video,
          }))
        );
        if (error) throw error;
      }

      // Checklist legacy (operational_template_check_items) NÃO é mais escrito pelo novo
      // builder. A tabela é mantida viva apenas para histórico/leitura legada.
      // Substituído por: Campos + Checklist Aprovador + Checklist Validador (snapshot).
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      toast.success(editingId ? "Template atualizado (versão incrementada)." : "Template criado.");
      purgeLegacyBuilderDrafts();
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Save parcial: persiste apenas sections + fields (aba Avaliado).
  // Usado quando o usuário avança da aba "campos" sem chegar ao Resumo.
  // Só roda em edição (isEditing). Não fecha dialog, não invalida queries.
  const saveFieldsOnly = useMutation({
    mutationFn: async () => {
      if (!editingId) return;

      const activeSectionIds = new Set(sections.map(s => s.tempId).filter(Boolean));
      const activeFields = fields.filter(
        f => f.sectionTempId && activeSectionIds.has(f.sectionTempId)
      );
      const activeAvaliadorFieldIds = activeFields
        .map(f => f.id)
        .filter(Boolean) as string[];

      // Upsert sections
      const sectionIdMap: Record<string, string> = {};
      for (const [i, s] of sections.entries()) {
        const payloadSection = sectionPayload(editingId, s, i);
        if (s.id) {
          const { error } = await (supabase as any)
            .from("operational_template_sections")
            .update(payloadSection)
            .eq("id", s.id);
          if (error) throw error;
          sectionIdMap[s.tempId] = s.id;
        } else {
          const { data, error } = await (supabase as any)
            .from("operational_template_sections")
            .insert(payloadSection)
            .select("id")
            .single();
          if (error) throw error;
          sectionIdMap[s.tempId] = data.id;
          setSections(prev =>
            prev.map(sec => sec.tempId === s.tempId ? { ...sec, id: data.id } : sec)
          );
        }
      }

      // Delete fields removidos (mesma lógica do upsert)
      const { data: existingFields, error: existingFieldsError } = await (supabase as any)
        .from("operational_template_fields")
        .select("id")
        .eq("template_id", editingId);
      if (existingFieldsError) throw existingFieldsError;
      const existingFieldIds = (existingFields || []).map((f: any) => f.id).filter(Boolean);
      const currentFieldIds = new Set(activeAvaliadorFieldIds);
      const referencedFieldIds = await fetchReferencedFieldIds(existingFieldIds);
      const removableFieldIds = existingFieldIds.filter(
        (id: string) => !currentFieldIds.has(id) && !referencedFieldIds.has(id)
      );
      if (removableFieldIds.length > 0) {
        const { error } = await (supabase as any)
          .from("operational_template_fields")
          .delete()
          .in("id", removableFieldIds);
        if (error) throw error;
      }

      // Upsert fields ativos
      for (const f of activeFields) {
        const payloadField = fieldPayload(editingId, f, sectionIdMap);
        if (f.id) {
          const { error } = await (supabase as any)
            .from("operational_template_fields")
            .update(payloadField)
            .eq("id", f.id);
          if (error) throw error;
        } else {
          const { data, error } = await (supabase as any)
            .from("operational_template_fields")
            .insert(payloadField)
            .select("id")
            .single();
          if (error) throw error;
          setFields(prev =>
            prev.map(field =>
              field.tempId === f.tempId ? { ...field, id: data.id } : field
            )
          );
        }
      }

      // Atualiza avaliado_fields/avaliado_field_ids no ada_config_snapshot
      const activeAvaliadorFieldsFinal = activeFields.map(f => ({
        id: f.id ?? null,
        key: fieldDuplicateKey(f),
      }));
      const activeAvaliadorFieldIdsFinal = activeAvaliadorFieldsFinal
        .map(f => f.id)
        .filter(Boolean);

      const { data: currentTemplate } = await (supabase as any)
        .from("operational_templates")
        .select("ada_config_snapshot")
        .eq("id", editingId)
        .single();

      const currentSnap = currentTemplate?.ada_config_snapshot ?? {};
      await (supabase as any)
        .from("operational_templates")
        .update({
          ada_config_snapshot: {
            ...currentSnap,
            checklists: {
              ...(currentSnap.checklists ?? {}),
              avaliado_fields: activeAvaliadorFieldsFinal,
              avaliado_field_ids: activeAvaliadorFieldIdsFinal,
            },
          },
        })
        .eq("id", editingId);
    },
    onError: (e: any) => toast.error(`Erro ao salvar campos: ${e.message}`),
  });

  const toggleAtivo = useMutation({
    mutationFn: async (t: any) => {
      const { error } = await (supabase as any).from("operational_templates").update({ ativo: !t.ativo }).eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operational_templates"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Check if there are any assignments linked to this template
      const { count } = await supabase
        .from("operational_assignments")
        .select("id", { count: "exact", head: true })
        .eq("template_id", id);
      if (count && count > 0) {
        throw new Error(`Não é possível excluir: existem ${count} tarefa(s) executada(s) vinculada(s). Remova todas as tarefas executadas primeiro na tela de Gestão.`);
      }
      await (supabase as any).from("operational_template_check_items").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_steps").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_fields").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_sections").delete().eq("template_id", id);
      const { error } = await (supabase as any).from("operational_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_templates"] }); toast.success("Tarefa excluída."); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    // Abre o builder unificado direto (sem seletor de tipo).
    // O usuário define simples vs por etapas no próprio builder, criando agrupadores ou só perguntas.
    handleWizardPick({ type: "inspecao", setorId: "" });
  };

  const handleWizardPick = ({ type, setorId }: { type: TaskType; setorId: string }) => {
    setEditingId(null);
    const tpl = {
      ...defaultTemplate,
      tipo_execucao: type === "simples" ? "simples" : "checklist_inspecao",
      setor_id: setorId || "",
    };
    setForm(tpl);
    setSections([]);
    setFields([]);
    setSteps([]);
    // Hidrata aba Aprovador com pacote padrão da config global (apenas em criação).
    const pacote = pontuacaoConfig?.aprovador_pacote_padrao ?? [];
    setAprovadorChecks(
      pacote.filter(p => p.ativo !== false).map(p => buildAprovadorAutomatico(p))
    );
    const pacoteVal = pontuacaoConfig?.validador_pacote_padrao ?? [];
    setValidadorChecks(
      pacoteVal.filter(p => p.ativo !== false).map(p => buildAprovadorAutomatico(p))
    );
    
    setActiveTab("geral");
    purgeLegacyBuilderDrafts();
    setDialogOpen(true);
  };

  const openEdit = async (t: any) => {
    const snap: any = t.ada_config_snapshot ?? {};
    const checklistsSnap: any = snap?.checklists ?? {};
    const savedAvaliadorFieldIds = Array.isArray(checklistsSnap.avaliado_field_ids)
      ? new Set(checklistsSnap.avaliado_field_ids.filter(Boolean))
      : null;
    const savedAvaliadorFieldKeys = Array.isArray(checklistsSnap.avaliado_fields)
      ? new Set(checklistsSnap.avaliado_fields.map((f: any) => f?.key).filter(Boolean))
      : null;

    setEditingId(t.id);
    setForm({
      nome: t.nome, descricao: t.descricao || "", tipo_execucao: t.tipo_execucao,
      setor_id: t.setor_id || "", responsavel_id: t.responsavel_id || "",
      recorrencia_tipo: t.recorrencia_tipo, dias_da_semana: t.dias_da_semana || [],
      intervalo_dias: t.intervalo_dias || 1, pular_semanas: t.pular_semanas || 0,
      dia_fixo_mes: t.dia_fixo_mes, data_inicio: t.data_inicio || "", data_fim: t.data_fim || "",
      repetir_sempre: !t.data_fim && t.recorrencia_tipo !== "unica",
      horario_inicio_previsto: t.horario_inicio_previsto || "08:00",
      horario_limite_execucao: t.horario_limite_execucao || "18:00",
      tolerancia_minutos: t.tolerancia_minutos || 0, sla_horas: t.sla_horas || 24,
      gerar_contingencia_automatica: t.gerar_contingencia_automatica || false,
      prazo_sla_correcao_horas: t.prazo_sla_correcao_horas || 24,
      requer_aprovacao_gestor: t.requer_aprovacao_gestor || false,
      bloquear_fechamento_com_contingencia: t.bloquear_fechamento_com_contingencia || false,
      permite_devolucao_parcial: t.permite_devolucao_parcial || false,
      executor_profile_id: t.executor_profile_id || "",
      executor_setor_id: t.executor_setor_id || "",
      avaliado_profile_id: t.avaliado_profile_id || "",
      avaliado_setor_id: t.avaliado_setor_id || "",
      aprovador_profile_id: t.aprovador_profile_id || "",
      aprovador_setor_id: t.aprovador_setor_id || "",
      auditor_profile_id: t.auditor_profile_id || "",
      auditor_setor_id: t.auditor_setor_id || "",
      modo_pontuacao: t.modo_pontuacao || "pontuar_avaliado",
      destino_score: t.destino_score || "individual",
      tipo_atribuicao_avaliado: t.tipo_atribuicao_avaliado || "individual",
      peso_recorrencia: t.peso_recorrencia ?? 1.0,
      penalidade_contingencia: t.penalidade_contingencia ?? 10,
      penalidade_sla_contingencia: t.penalidade_sla_contingencia ?? 15,
      penalidade_fora_prazo: t.penalidade_fora_prazo ?? 20,
      habilitar_perguntas_automaticas: t.habilitar_perguntas_automaticas ?? true,
      ada_config_snapshot: snap,
    } as TemplateForm & { ada_config_snapshot?: any });

    // Load sections
    const { data: secs } = await (supabase as any).from("operational_template_sections")
      .select("*").eq("template_id", t.id).order("ordem");
    const loadedSections: SectionForm[] = (secs || []).map((s: any) => ({
      id: s.id, tempId: s.id, nome: s.nome, descricao: s.descricao || "", peso: s.peso, ordem: s.ordem, cor: s.cor || "#3b82f6",
      horario_inicio: s.horario_inicio || "", horario_fim: s.horario_fim || "",
    }));
    setSections(loadedSections);

    // Load fields
    const { data: flds } = await (supabase as any).from("operational_template_fields")
      .select("*").eq("template_id", t.id).order("ordem");
    const loadedFields: FieldForm[] = (flds || []).map((f: any) => ({
      id: f.id, tempId: f.id,
      sectionTempId: f.section_id || "",
      label: f.label, descricao: f.descricao || "", tipo: f.tipo, ordem: f.ordem,
      obrigatorio: f.obrigatorio, peso: f.peso, nota_maxima: f.nota_maxima,
      impacta_score: f.impacta_score,
      criticidade: f.criticidade, gera_contingencia: f.gera_contingencia || false,
      exige_evidencia: f.exige_evidencia || false, tipo_evidencia: f.tipo_evidencia || "foto",
      opcoes: f.opcoes || [], opcoes_regras: f.opcoes_regras || [],
      validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
      formula: f.formula, visivel_para: f.visivel_para || ["executor", "avaliador"],
      editavel_por: f.editavel_por || ["executor"],
      aprovador_verificar: f.aprovador_verificar ?? !!f.aprovador_pergunta,
      aprovador_pergunta: f.aprovador_pergunta || "",
      aprovador_tipo_resposta: f.aprovador_tipo_resposta || "conforme",
      aprovador_peso: f.aprovador_peso ?? 1,
      aprovador_obriga_observacao_nao: f.aprovador_obriga_observacao_nao ?? true,
      aprovador_exige_evidencia_nao: f.aprovador_exige_evidencia_nao ?? false,
      aprovador_tipos_evidencia: f.aprovador_tipos_evidencia || ["foto"],
    }));
    // Causa raiz: filtrar loadedFields por snapshot antigo "ressuscitava" estado obsoleto
    // (perguntas removidas voltavam ao reabrir; novas eram descartadas).
    // Banco (`operational_template_fields`) é a única fonte de verdade aqui.
    // Variáveis savedAvaliadorFieldIds/Keys ficam apenas para retrocompatibilidade
    // de leitura, mas não são mais aplicadas como filtro.
    void savedAvaliadorFieldKeys;
    // Se existe snapshot com avaliado_field_ids, usar como lista de campos ativos.
    // Campos com respostas vinculadas (referencedFieldIds) são protegidos do delete
    // mas NÃO devem reaparecer na UI se o usuário os removeu explicitamente.
    const referencedFieldIds = await fetchReferencedFieldIds(
      loadedFields.map(f => f.id).filter(Boolean) as string[],
    );
    const dedupedFields = dedupeLoadedFields(loadedFields, referencedFieldIds);

    // Filtra apenas os campos que o usuário manteve ativos (salvos em avaliado_field_ids).
    // Se não há snapshot ainda (primeiro save), usa todos os campos do banco.
    const activeLoadedFields = savedAvaliadorFieldIds && savedAvaliadorFieldIds.size > 0
      ? dedupedFields.filter(f => f.id && savedAvaliadorFieldIds.has(f.id))
      : dedupedFields;

    setFields(activeLoadedFields);

    // Load steps
    const { data: stps } = await (supabase as any).from("operational_template_steps")
      .select("*").eq("template_id", t.id).order("ordem");
    setSteps((stps || []).map((s: any) => ({
      id: s.id, tempId: s.id, nome: s.nome, ordem: s.ordem, peso: s.peso,
      horario_inicio: s.horario_inicio || "08:00", horario_fim: s.horario_fim || "09:00",
      prazo_limite_minutos: s.prazo_limite_minutos, exige_foto: s.exige_foto || false,
      exige_observacao: s.exige_observacao || false, exige_video: s.exige_video || false,
    })));

    // (Legado) operational_template_check_items NÃO é mais lido pelo novo builder.
    // Mantido vivo no banco apenas para histórico/relatórios antigos.

    // Hidrata checklists do Aprovador/Validador a partir de ada_config_snapshot.checklists
    // (Fase 2). Tolerante a registros antigos sem o campo.
    const dedupedFieldIds = new Set(activeLoadedFields.map(f => f.tempId));
    const aprRaw: any[] = Array.isArray(checklistsSnap.aprovador) ? checklistsSnap.aprovador : [];
    const apr = aprRaw.filter((i: any) => i?.origem_pergunta !== "replicada_avaliado" || dedupedFieldIds.has(i.field_id));
    const val: any[] = Array.isArray(checklistsSnap.validador) ? checklistsSnap.validador : [];
    setAprovadorChecks(prev => {
      const hydrated = sanitizeAprovadorChecks(
        apr,
        activeLoadedFields,
        pontuacaoConfig?.aprovador_pacote_padrao,
        t.habilitar_perguntas_automaticas ?? true,
      );
      // Re-sincroniza com fields atuais para descartar órfãos do snapshot.
      return syncAprovadorReplicadasFromFields(hydrated, activeLoadedFields);
    });
    // Validador: aceita formato novo (AprovadorCheckItemForm) e formato legacy
    // (ValidadorCheckItemForm com {pergunta, categoria}). Snapshots antigos são
    // convertidos preservando pergunta/peso/tipo, sem perder histórico.
    const valNormalized = val.map((i: any) => {
      if (i.pergunta_padrao) return i; // já no formato novo
      // legacy: ValidadorCheckItemForm
      return {
        ...i,
        pergunta_padrao: i.pergunta ?? "",
        field_id: "",
        origem_pergunta: "manual" as const,
      };
    });
    setValidadorChecks(
      valNormalized.length > 0
        ? normalizeAprovadorList(valNormalized)
        : []
    );

    setActiveTab("geral");
    purgeLegacyBuilderDrafts();
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Rotinas Operacionais</h1>
          <p className="text-body text-muted-foreground">Cadastre templates com seções, campos dinâmicos, workflow e recorrência.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Gerar Nova Tarefa</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={filterExecutor} onValueChange={setFilterExecutor}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Quem recebe nota" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Nota: Todos</SelectItem>
            {executorProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAvaliador} onValueChange={setFilterAvaliador}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Avaliador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Avaliador: Todos</SelectItem>
            {avaliadorProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Templates grouped by setor with drag-and-drop */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">Carregando...</div>
        ) : groupedTemplates.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center text-body text-muted-foreground">Nenhum template encontrado.</div>
        ) : groupedTemplates.map((group, groupIdx) => {
          const setorKey = group.setorId || "__sem_setor";
          const colors = [
            "bg-blue-500/15 border-blue-500/30 text-blue-700 dark:text-blue-300",
            "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
            "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
            "bg-purple-500/15 border-purple-500/30 text-purple-700 dark:text-purple-300",
            "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
            "bg-cyan-500/15 border-cyan-500/30 text-cyan-700 dark:text-cyan-300",
            "bg-orange-500/15 border-orange-500/30 text-orange-700 dark:text-orange-300",
          ];
          const colorClass = colors[groupIdx % colors.length];
          return (
            <div key={setorKey} className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
              <div className={`px-4 py-1.5 border-b ${colorClass}`}>
                <h3 className="text-xs font-semibold">{group.setor}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="w-8"></th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                      <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                      <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((t: any) => (
                      <tr
                        key={t.id}
                        draggable
                        onDragStart={() => handleDragStart(t.id, setorKey)}
                        onDragOver={(e) => handleDragOver(e, t.id, setorKey)}
                        onDrop={handleDrop}
                        className="hover:bg-muted/50 transition-colors cursor-grab active:cursor-grabbing"
                      >
                        <td className="pl-2 pr-0 py-3 text-muted-foreground/40">
                          <GripVertical className="w-4 h-4" />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-body font-medium text-foreground">{t.nome}</span>
                          {t.descricao && <p className="text-caption text-muted-foreground mt-0.5 truncate max-w-[250px]">{t.descricao}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                            {TIPO_EXECUCAO_LABELS[t.tipo_execucao] || t.tipo_execucao}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-body text-muted-foreground">{RECORRENCIA_LABELS[t.recorrencia_tipo] || t.recorrencia_tipo}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border ${t.ativo ? "badge-complete" : "badge-expired"}`}>
                            {t.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => toggleAtivo.mutate(t)} className="press-effect">
                              {t.ativo ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="press-effect"><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`Excluir tarefa "${t.nome}"? Só é possível se não houver tarefas executadas vinculadas.`)) remove.mutate(t.id); }} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Builder Wizard */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-3 border-b border-border">
            <DialogTitle className="text-base">{editingId ? "Editar Tarefa de Rotina" : "Tarefas de Rotina"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            <TarefasBuilderWizard
              isEditing={!!editingId}
              saving={upsert.isPending}
              form={form} set={set}
              sections={sections} setSections={setSections}
              fields={fields} setFields={setFields}
              steps={steps} setSteps={setSteps}
              aprovadorChecks={aprovadorChecks} setAprovadorChecks={setAprovadorChecks}
              validadorChecks={validadorChecks} setValidadorChecks={setValidadorChecks}
              setores={setores} colaboradores={colaboradores}
              templateId={editingId}
              onCancel={closeDialog}
              onSubmit={() => upsert.mutate()}
              onSaveFields={() => saveFieldsOnly.mutateAsync()}
              savingFields={saveFieldsOnly.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* (Removido) TaskTypeSelectorDialog — botão "+" abre o builder direto. */}
    </div>
  );
}
