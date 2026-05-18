// src/modules/tarefas/components/rotinas/RotinasModal.tsx
// Modal com 5 abas fixas: Geral | Avaliado | Aprovador | Auditor | Rotina
// Cada aba tem save independente — sem wizard, sem builder antigo.
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateForm, SectionForm, FieldForm, defaultTemplate, defaultSection } from "@/modules/tarefas/types/tarefas_types";
import {
  RotinaCheckItem,
  PERGUNTAS_PADRAO_APROVADOR,
  PERGUNTAS_PADRAO_AUDITOR,
} from "./rotinas_types";
import { RotinasTabGeral } from "./RotinasTabGeral";
import { RotinasTabAvaliado } from "./RotinasTabAvaliado";
import { RotinasTabAprovador } from "./RotinasTabAprovador";
import { RotinasTabAuditor } from "./RotinasTabAuditor";
import { RotinasTabRotina } from "./RotinasTabRotina";

interface Props {
  open: boolean;
  onClose: () => void;
  templateId: string | null;
  setores: any[];
  colaboradores: any[];
  colaboradorSetores: any[];
  destinoAba?: "padrao" | "minhas";
  createdBy?: string;
}

type AbaKey = "geral" | "avaliado" | "aprovador" | "auditor" | "rotina" | "informacoes";

// ─── Helpers de save ──────────────────────────────────────────────────────────

function buildGeralPayload(form: TemplateForm, destinoAba: "padrao" | "minhas", createdBy?: string) {
  return {
    nome: form.nome.trim(),
    descricao: form.descricao?.trim() || null,
    tipo_execucao: form.tipo_execucao,
    setor_id: form.setor_id || null,
    executor_profile_id: form.executor_profile_id || null,
    executor_setor_id: form.executor_setor_id || null,
    avaliado_profile_id: form.avaliado_profile_id || null,
    avaliado_setor_id: form.avaliado_setor_id || null,
    aprovador_profile_id: form.aprovador_profile_id || null,
    aprovador_setor_id: form.aprovador_setor_id || null,
    auditor_profile_id: form.auditor_profile_id || null,
    auditor_setor_id: form.auditor_setor_id || null,
    requer_aprovacao_gestor: form.requer_aprovacao_gestor,
    destino_aba: destinoAba,
    ...(createdBy ? { created_by: createdBy } : {}),
  };
}

function buildRotinaPayload(form: TemplateForm) {
  return {
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
    prazo_sla_correcao_horas: form.prazo_sla_correcao_horas,
    peso_recorrencia: form.peso_recorrencia,
    exceto_fds: form.exceto_fds ?? false,
  };
}

async function upsertTemplate(templateId: string | null, payload: any): Promise<string> {
  if (templateId) {
    const { error } = await (supabase as any).from("operational_templates").update(payload).eq("id", templateId);
    if (error) throw error;
    return templateId;
  } else {
    const { data, error } = await (supabase as any).from("operational_templates").insert(payload).select("id").single();
    if (error) throw error;
    return data.id;
  }
}

async function saveFieldsToDb(
  templateId: string,
  sections: SectionForm[],
  fields: FieldForm[]
): Promise<{ sections: SectionForm[]; fields: FieldForm[] }> {

  // ── IDs que a UI quer manter ──
  const keepSectionIds = new Set(sections.map((s) => s.id).filter(Boolean) as string[]);
  const keepFieldIds   = new Set(fields.map((f) => f.id).filter(Boolean) as string[]);

  // ── Delete fields removidos da UI (sem histórico de respostas — tenta direto) ──
  const { data: dbFields } = await (supabase as any)
    .from("operational_template_fields")
    .select("id")
    .eq("template_id", templateId);

  const fieldIdsToDelete = (dbFields || [])
    .map((f: any) => f.id)
    .filter((id: string) => !keepFieldIds.has(id));

  if (fieldIdsToDelete.length > 0) {
    // Só deleta se não tiver respostas vinculadas
    const { data: comResposta } = await (supabase as any)
      .from("operational_field_answers")
      .select("field_id")
      .in("field_id", fieldIdsToDelete);
    const comRespostaIds = new Set((comResposta || []).map((r: any) => r.field_id));
    const deletaveis = fieldIdsToDelete.filter((id: string) => !comRespostaIds.has(id));
    if (deletaveis.length > 0) {
      await (supabase as any).from("operational_template_fields").delete().in("id", deletaveis);
    }
  }

  // ── Delete sections removidas da UI ──
  const { data: dbSections } = await (supabase as any)
    .from("operational_template_sections")
    .select("id")
    .eq("template_id", templateId);

  const sectionIdsToDelete = (dbSections || [])
    .map((s: any) => s.id)
    .filter((id: string) => !keepSectionIds.has(id));

  if (sectionIdsToDelete.length > 0) {
    await (supabase as any).from("operational_template_sections").delete().in("id", sectionIdsToDelete);
  }

  // ── Upsert sections ──
  const sectionIdMap: Record<string, string> = {};
  const savedSections: SectionForm[] = [];

  for (const [i, s] of sections.entries()) {
    const payload = {
      template_id: templateId,
      nome: s.nome || `Etapa ${i + 1}`,
      descricao: s.descricao || null,
      peso: s.peso,
      ordem: i,
      cor: s.cor,
      horario_inicio: s.horario_inicio || null,
      horario_fim: s.horario_fim || null,
    };
    if (s.id) {
      const { error } = await (supabase as any).from("operational_template_sections").update(payload).eq("id", s.id);
      if (error) throw error;
      sectionIdMap[s.tempId] = s.id;
      savedSections.push(s);
    } else {
      const { data, error } = await (supabase as any).from("operational_template_sections").insert(payload).select("id").single();
      if (error) throw error;
      sectionIdMap[s.tempId] = data.id;
      savedSections.push({ ...s, id: data.id });
    }
  }

  // ── Upsert fields ──
  const savedFields: FieldForm[] = [];
  for (const f of fields) {
    if (!f.sectionTempId || !sectionIdMap[f.sectionTempId]) continue;
    const payload = {
      template_id: templateId,
      section_id: sectionIdMap[f.sectionTempId],
      label: f.label || "Campo sem nome",
      descricao: f.descricao || null,
      tipo: f.tipo,
      ordem: f.ordem,
      obrigatorio: f.obrigatorio,
      peso: f.peso,
      nota_maxima: f.nota_maxima,
      impacta_score: f.impacta_score,
      criticidade: f.criticidade,
      gera_contingencia: f.gera_contingencia,
      exige_evidencia: f.exige_evidencia,
      tipo_evidencia: f.tipo_evidencia || "foto",
      opcoes: f.opcoes?.length > 0 ? f.opcoes : null,
      opcoes_regras: f.opcoes_regras?.length > 0 ? f.opcoes_regras : null,
    };
    if (f.id) {
      const { error } = await (supabase as any).from("operational_template_fields").update(payload).eq("id", f.id);
      if (error) throw error;
      savedFields.push(f);
    } else {
      const { data, error } = await (supabase as any).from("operational_template_fields").insert(payload).select("id").single();
      if (error) throw error;
      savedFields.push({ ...f, id: data.id, tempId: data.id, sectionTempId: sectionIdMap[f.sectionTempId] });
    }
  }

  // ── Atualiza snapshot com avaliado_field_ids ──
  const fieldIds = savedFields.map((f) => f.id).filter(Boolean);
  const { data: snapAtual } = await (supabase as any)
    .from("operational_templates")
    .select("ada_config_snapshot")
    .eq("id", templateId)
    .single();
  const snapExistente = snapAtual?.ada_config_snapshot ?? {};
  await (supabase as any).from("operational_templates").update({
    ada_config_snapshot: {
      ...snapExistente,
      checklists: {
        ...(snapExistente.checklists ?? {}),
        avaliado_field_ids: fieldIds,
      },
    },
  }).eq("id", templateId);

  return { sections: savedSections, fields: savedFields };
}

async function saveChecklistToDb(
  templateId: string,
  chave: "aprovador" | "auditor",
  items: RotinaCheckItem[],
  extraPayload?: Record<string, any>
) {
  // "auditor" é salvo como "validador" no snapshot para manter compatibilidade
  // com tarefas_minhasTarefasPage que lê checklists.validador
  const chaveSnapshot = chave === "auditor" ? "validador" : "aprovador";

  // Lê snapshot atual para não sobrescrever a outra chave
  const { data: tmpl } = await (supabase as any).from("operational_templates").select("ada_config_snapshot").eq("id", templateId).single();
  const snapAtual = tmpl?.ada_config_snapshot ?? {};
  const checklistsAtuais = snapAtual.checklists ?? {};

  await (supabase as any).from("operational_templates").update({
    ada_config_snapshot: {
      ...snapAtual,
      checklists: {
        ...checklistsAtuais,
        [chaveSnapshot]: items,
      },
    },
    ...extraPayload,
  }).eq("id", templateId);
}

// ─── Carregamento ──────────────────────────────────────────────────────────

async function loadTemplate(templateId: string) {
  const { data: tmpl, error } = await (supabase as any)
    .from("operational_templates")
    .select("*, setores!operational_templates_setor_id_fkey(nome)")
    .eq("id", templateId)
    .single();
  if (error) throw error;

  const { data: secs } = await (supabase as any)
    .from("operational_template_sections")
    .select("*").eq("template_id", templateId).order("ordem");

  const { data: flds } = await (supabase as any)
    .from("operational_template_fields")
    .select("*").eq("template_id", templateId).order("ordem");

  const snap = tmpl.ada_config_snapshot ?? {};
  const aprovadorItems: RotinaCheckItem[] = Array.isArray(snap.checklists?.aprovador)
    ? snap.checklists.aprovador
    : PERGUNTAS_PADRAO_APROVADOR.map((p) => ({ ...p, tempId: crypto.randomUUID() }));
  const auditorItems: RotinaCheckItem[] = Array.isArray(snap.checklists?.auditor)
    ? snap.checklists.validador
    : PERGUNTAS_PADRAO_AUDITOR.map((p) => ({ ...p, tempId: crypto.randomUUID() }));

  const loadedSections: SectionForm[] = (secs || []).map((s: any) => ({
    id: s.id, tempId: s.id, nome: s.nome, descricao: s.descricao || "",
    peso: s.peso, ordem: s.ordem, cor: s.cor || "#3b82f6",
    horario_inicio: s.horario_inicio || "", horario_fim: s.horario_fim || "",
  }));

  const loadedFields: FieldForm[] = (flds || []).map((f: any) => ({
    id: f.id, tempId: f.id, sectionTempId: f.section_id || "",
    label: f.label, descricao: f.descricao || "", tipo: f.tipo, ordem: f.ordem,
    obrigatorio: f.obrigatorio, peso: f.peso, nota_maxima: f.nota_maxima ?? 100,
    impacta_score: f.impacta_score ?? true, criticidade: f.criticidade ?? "media",
    gera_contingencia: f.gera_contingencia || false,
    exige_evidencia: f.exige_evidencia || false, tipo_evidencia: f.tipo_evidencia || "foto",
    opcoes: f.opcoes || [], opcoes_regras: f.opcoes_regras || [],
    validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
    formula: f.formula, visivel_para: f.visivel_para || ["executor", "avaliador"],
    editavel_por: f.editavel_por || ["executor"],
    instrucao_url: f.instrucao_url || "", instrucao_tipo: f.instrucao_tipo || "foto",
    aprovador_verificar: false, aprovador_pergunta: "", aprovador_tipo_resposta: "conforme",
    aprovador_peso: 1, aprovador_obriga_observacao_nao: true,
    aprovador_exige_evidencia_nao: false, aprovador_tipos_evidencia: ["foto"],
  }));

  const form: TemplateForm & { ada_config_snapshot?: any } = {
    nome: tmpl.nome, descricao: tmpl.descricao || "", tipo_execucao: tmpl.tipo_execucao,
    setor_id: tmpl.setor_id || "", responsavel_id: tmpl.responsavel_id || "",
    recorrencia_tipo: tmpl.recorrencia_tipo, dias_da_semana: tmpl.dias_da_semana || [],
    intervalo_dias: tmpl.intervalo_dias || 1, pular_semanas: tmpl.pular_semanas || 0,
    dia_fixo_mes: tmpl.dia_fixo_mes, data_inicio: tmpl.data_inicio || "",
    data_fim: tmpl.data_fim || "", repetir_sempre: !tmpl.data_fim && tmpl.recorrencia_tipo !== "unica",
    horario_inicio_previsto: tmpl.horario_inicio_previsto || "08:00",
    horario_limite_execucao: tmpl.horario_limite_execucao || "18:00",
    tolerancia_minutos: tmpl.tolerancia_minutos || 0, sla_horas: tmpl.sla_horas || 24,
    gerar_contingencia_automatica: tmpl.gerar_contingencia_automatica || false,
    prazo_sla_correcao_horas: tmpl.prazo_sla_correcao_horas || 24,
    requer_aprovacao_gestor: tmpl.requer_aprovacao_gestor || false,
    bloquear_fechamento_com_contingencia: tmpl.bloquear_fechamento_com_contingencia || false,
    permite_devolucao_parcial: tmpl.permite_devolucao_parcial || false,
    executor_profile_id: tmpl.executor_profile_id || "",
    executor_setor_id: tmpl.executor_setor_id || "",
    avaliado_profile_id: tmpl.avaliado_profile_id || "",
    avaliado_setor_id: tmpl.avaliado_setor_id || "",
    aprovador_profile_id: tmpl.aprovador_profile_id || "",
    aprovador_setor_id: tmpl.aprovador_setor_id || "",
    auditor_profile_id: tmpl.auditor_profile_id || "",
    auditor_setor_id: tmpl.auditor_setor_id || "",
    modo_pontuacao: tmpl.modo_pontuacao || "pontuar_avaliado",
    destino_score: tmpl.destino_score || "individual",
    peso_recorrencia: tmpl.peso_recorrencia ?? 1.0,
    tipo_atribuicao_avaliado: tmpl.tipo_atribuicao_avaliado || "individual",
    penalidade_contingencia: tmpl.penalidade_contingencia ?? 10,
    penalidade_sla_contingencia: tmpl.penalidade_sla_contingencia ?? 15,
    penalidade_fora_prazo: tmpl.penalidade_fora_prazo ?? 20,
    habilitar_perguntas_automaticas: tmpl.habilitar_perguntas_automaticas ?? true,
    exceto_fds: tmpl.exceto_fds ?? false,
  };

  return { form, sections: loadedSections, fields: loadedFields, aprovadorItems, auditorItems };
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function RotinasModal({ open, onClose, templateId, setores, colaboradores, colaboradorSetores, destinoAba = "padrao", createdBy }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<AbaKey>("geral");
  const [currentId, setCurrentId] = useState<string | null>(templateId);

  const [form, setFormState] = useState<TemplateForm>({ ...defaultTemplate });
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fields, setFields] = useState<FieldForm[]>([]);
  const [aprovadorItems, setAprovadorItems] = useState<RotinaCheckItem[]>(
    PERGUNTAS_PADRAO_APROVADOR.map((p) => ({ ...p, tempId: crypto.randomUUID() }))
  );
  const [auditorItems, setAuditorItems] = useState<RotinaCheckItem[]>(
    PERGUNTAS_PADRAO_AUDITOR.map((p) => ({ ...p, tempId: crypto.randomUUID() }))
  );

  const [saving, setSaving] = useState<Record<AbaKey, boolean>>({
    geral: false, avaliado: false, aprovador: false, auditor: false, rotina: false, informacoes: false,
  });
  const [loading, setLoading] = useState(false);
  const [tarefasAbertas, setTarefasAbertas] = useState(0);
  const [tmplInfo, setTmplInfo] = useState<{ criador_nome: string | null; created_at: string | null; recorrencia_tipo: string | null; horario_inicio_previsto: string | null; data_inicio: string | null } | null>(null);

  const set = useCallback(<K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => {
    setFormState((prev) => ({ ...prev, [k]: v }));
  }, []);

  // Carrega ao abrir
  useEffect(() => {
    if (!open) return;
    setCurrentId(templateId);
    setActiveTab("geral");

    if (templateId) {
      setLoading(true);
      loadTemplate(templateId)
        .then(async ({ form: f, sections: s, fields: fl, aprovadorItems: ai, auditorItems: aui }) => {
          setFormState(f);
          setSections(s);
          setFields(fl);
          setAprovadorItems(ai);
          setAuditorItems(aui);
          // Verifica tarefas abertas
          const { count } = await (supabase as any)
            .from("operational_assignments")
            .select("id", { count: "exact", head: true })
            .eq("template_id", templateId)
            .in("status", ["pendente", "em_andamento", "devolvida", "aguardando_aprovacao", "aguardando_auditoria"]);
          setTarefasAbertas(count || 0);
          // Carrega info do criador
          const { data: rawTmpl } = await (supabase as any)
            .from("operational_templates")
            .select("created_at, recorrencia_tipo, horario_inicio_previsto, data_inicio, criador:profiles!operational_templates_created_by_fkey(nome)")
            .eq("id", templateId)
            .single();
          if (rawTmpl) {
            setTmplInfo({
              criador_nome: rawTmpl.criador?.nome ?? null,
              created_at: rawTmpl.created_at ?? null,
              recorrencia_tipo: rawTmpl.recorrencia_tipo ?? null,
              horario_inicio_previsto: rawTmpl.horario_inicio_previsto ?? null,
              data_inicio: rawTmpl.data_inicio ?? null,
            });
          }
        })
        .catch((e) => toast.error("Erro ao carregar template: " + e.message))
        .finally(() => setLoading(false));
    } else {
      setFormState({ ...defaultTemplate });
      setSections([]);
      setFields([]);
      setAprovadorItems(PERGUNTAS_PADRAO_APROVADOR.map((p) => ({ ...p, tempId: crypto.randomUUID() })));
      setAuditorItems(PERGUNTAS_PADRAO_AUDITOR.map((p) => ({ ...p, tempId: crypto.randomUUID() })));
    }
  }, [open, templateId]);

  const setSaving1 = (aba: AbaKey, v: boolean) =>
    setSaving((prev) => ({ ...prev, [aba]: v }));

  const invalidate = () => qc.invalidateQueries({ queryKey: ["operational_templates"] });

  // ── Save Geral ──
  const saveGeral = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório."); return; }
    setSaving1("geral", true);
    try {
      const id = await upsertTemplate(currentId, buildGeralPayload(form, destinoAba, !currentId ? createdBy : undefined));
      if (!currentId) setCurrentId(id);
      invalidate();
      toast.success("Geral salvo.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving1("geral", false);
    }
  };

  // ── Save Avaliado ──
  const saveAvaliado = async () => {
    if (!currentId) { toast.error("Salve a aba Geral primeiro."); return; }

    // Verifica se há tarefas em andamento vinculadas — avisa mas não bloqueia
    const { count } = await (supabase as any)
      .from("operational_assignments")
      .select("id", { count: "exact", head: true })
      .eq("template_id", currentId)
      .in("status", ["pendente", "em_andamento", "devolvida", "aguardando_aprovacao", "aguardando_auditoria"]);

    if (count && count > 0) {
      const confirmar = window.confirm(
        `Existem ${count} tarefa(s) em andamento vinculadas a esta rotina.\n\nAs alterações serão aplicadas nas próximas aberturas dessas tarefas. Tarefas já concluídas não serão afetadas.\n\nDeseja continuar salvando?`
      );
      if (!confirmar) return;
    }

    setSaving1("avaliado", true);
    try {
      const { sections: s, fields: f } = await saveFieldsToDb(currentId, sections, fields);
      setSections(s);
      setFields(f);
      invalidate();
      toast.success("Avaliado salvo.");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
      console.error("saveAvaliado error:", e);
    } finally {
      setSaving1("avaliado", false);
    }
  };

  // ── Save Aprovador ──
  const saveAprovador = async () => {
    if (!currentId) { toast.error("Salve a aba Geral primeiro."); return; }
    setSaving1("aprovador", true);
    try {
      await saveChecklistToDb(currentId, "aprovador", aprovadorItems, {
        requer_aprovacao_gestor: form.requer_aprovacao_gestor,
        sla_horas: form.sla_horas,
        prazo_sla_correcao_horas: form.prazo_sla_correcao_horas,
      });
      invalidate();
      toast.success("Aprovador salvo.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving1("aprovador", false);
    }
  };

  // ── Save Auditor ──
  const saveAuditor = async () => {
    if (!currentId) { toast.error("Salve a aba Geral primeiro."); return; }
    setSaving1("auditor", true);
    try {
      await saveChecklistToDb(currentId, "auditor", auditorItems, {
        bloquear_fechamento_com_contingencia: form.bloquear_fechamento_com_contingencia,
      });
      invalidate();
      toast.success("Auditor salvo.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving1("auditor", false);
    }
  };

  // ── Save Rotina ──
  const saveRotina = async () => {
    if (!currentId) { toast.error("Salve a aba Geral primeiro."); return; }
    setSaving1("rotina", true);
    try {
      await upsertTemplate(currentId, buildRotinaPayload(form));
      invalidate();
      toast.success("Rotina salva.");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving1("rotina", false);
    }
  };

  const aprovadorConfigurado = !!(form.aprovador_profile_id || form.aprovador_setor_id);
  const auditorConfigurado = !!(form.auditor_profile_id || form.auditor_setor_id);

  const ABAS: { key: AbaKey; label: string }[] = [
    { key: "geral", label: "Geral" },
    { key: "avaliado", label: "Avaliado" },
    { key: "aprovador", label: "Aprovador" },
    { key: "auditor", label: "Auditor" },
    { key: "rotina", label: "Rotina" },
    ...(currentId ? [{ key: "informacoes" as AbaKey, label: "Informações" }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-3.5 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            {currentId ? "Editar Tarefa de Rotina" : "Nova Tarefa de Rotina"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AbaKey)} className="flex-1 flex flex-col min-h-0">
            <TabsList className="shrink-0 mx-5 mt-3 mb-0 justify-start border-b border-border rounded-none bg-transparent h-auto p-0 gap-0">
              {ABAS.map(({ key, label }) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm font-medium"
                >
                  {label}
                  {(key === "aprovador" && !aprovadorConfigurado) && <span className="ml-1.5 text-[10px] text-amber-500">!</span>}
                  {(key === "auditor" && !auditorConfigurado) && <span className="ml-1.5 text-[10px] text-amber-500">!</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <TabsContent value="geral" className="mt-0 h-full">
                <RotinasTabGeral form={form} set={set} setores={setores}
                  colaboradores={colaboradores} colaboradorSetores={colaboradorSetores}
                  onSave={saveGeral} saving={saving.geral} />
              </TabsContent>

              {/* Banner de bloqueio quando há tarefas abertas */}
              {tarefasAbertas > 0 && activeTab !== "geral" && (
                <div className="m-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 dark:bg-amber-950/30 dark:border-amber-800">
                  <span className="text-amber-600 text-lg shrink-0">⚠️</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      {tarefasAbertas} tarefa{tarefasAbertas > 1 ? "s" : ""} em andamento
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Esta rotina não pode ser editada enquanto houver tarefas abertas ou em andamento. 
                      Aguarde todas as tarefas serem concluídas ou cancele-as antes de editar.
                    </p>
                  </div>
                </div>
              )}

              <TabsContent value="avaliado" className="mt-0 h-full">
                {tarefasAbertas === 0 ? (
                  <RotinasTabAvaliado
                    sections={sections} setSections={setSections}
                    fields={fields} setFields={setFields}
                    onSave={saveAvaliado} saving={saving.avaliado}
                    onFieldsChanged={setFields}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="aprovador" className="mt-0 h-full">
                {tarefasAbertas === 0 ? (
                  <RotinasTabAprovador
                    aprovadorConfigurado={aprovadorConfigurado}
                    form={form} setForm={set}
                    items={aprovadorItems} setItems={setAprovadorItems}
                    onSave={saveAprovador} saving={saving.aprovador}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="auditor" className="mt-0 h-full">
                {tarefasAbertas === 0 ? (
                  <RotinasTabAuditor
                    auditorConfigurado={auditorConfigurado}
                    form={form} setForm={set}
                    items={auditorItems} setItems={setAuditorItems}
                    onSave={saveAuditor} saving={saving.auditor}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="rotina" className="mt-0 h-full">
                {tarefasAbertas === 0 ? (
                  <RotinasTabRotina form={form} set={set} templateId={currentId} onSave={saveRotina} saving={saving.rotina} />
                ) : null}
              </TabsContent>

              <TabsContent value="informacoes" className="mt-0 h-full">
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded border bg-card space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Criador</p>
                      <p className="text-sm font-medium">{tmplInfo?.criador_nome ?? "—"}</p>
                    </div>
                    <div className="p-4 rounded border bg-card space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Criado em</p>
                      <p className="text-sm font-medium">
                        {tmplInfo?.created_at
                          ? new Date(tmplInfo.created_at).toLocaleString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded border bg-card space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Próxima execução do cron</p>
                    <p className="text-sm font-medium">
                      {tmplInfo?.recorrencia_tipo && tmplInfo?.data_inicio && tmplInfo?.horario_inicio_previsto
                        ? (() => {
                            const hoje = new Date();
                            hoje.setHours(0, 0, 0, 0);
                            const dataInicio = new Date(tmplInfo.data_inicio + "T00:00:00");
                            const proxima = dataInicio >= hoje ? dataInicio : hoje;
                            return `${proxima.toLocaleDateString("pt-BR")} às ${tmplInfo.horario_inicio_previsto.slice(0, 5)}`;
                          })()
                        : "Não configurado"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      O cron roda diariamente e gera as tarefas conforme a recorrência configurada na aba Rotina.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
