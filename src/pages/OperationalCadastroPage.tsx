import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIPO_EXECUCAO_LABELS, RECORRENCIA_LABELS } from "@/hooks/useOperationalScoring";
import { TemplateForm, SectionForm, FieldForm, defaultTemplate, defaultSection, defaultField } from "@/components/operational/types";
import { TabGeral } from "@/components/operational/TabGeral";
import { TabFormBuilder } from "@/components/operational/TabFormBuilder";
import { TabWorkflow } from "@/components/operational/TabWorkflow";
import { TabRecorrencia } from "@/components/operational/TabRecorrencia";

export default function OperationalCadastroPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number>(1);
  const [form, setForm] = useState<TemplateForm>(defaultTemplate);
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fields, setFields] = useState<FieldForm[]>([]);
  const [activeTab, setActiveTab] = useState("geral");
  const [filterExecutor, setFilterExecutor] = useState("__all");
  const [filterAvaliador, setFilterAvaliador] = useState("__all");
  const [filterAvaliado, setFilterAvaliado] = useState("__all");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["operational_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_templates")
        .select("*, setores!operational_templates_setor_id_fkey(nome)")
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

  // Build profile maps for filters — only show names that have templates associated
  const { executorProfiles, avaliadorProfiles, avaliadoProfiles } = useMemo(() => {
    const execMap = new Map<string, string>();
    const avalMap = new Map<string, string>();
    const avdoMap = new Map<string, string>();
    const profileMap = new Map(colaboradores.map((c: any) => [c.id, c.nome]));
    for (const t of templates) {
      if (t.executor_profile_id && profileMap.has(t.executor_profile_id))
        execMap.set(t.executor_profile_id, profileMap.get(t.executor_profile_id)!);
      if (t.avaliador_profile_id && profileMap.has(t.avaliador_profile_id))
        avalMap.set(t.avaliador_profile_id, profileMap.get(t.avaliador_profile_id)!);
      if (t.avaliado_profile_id && profileMap.has(t.avaliado_profile_id))
        avdoMap.set(t.avaliado_profile_id, profileMap.get(t.avaliado_profile_id)!);
    }
    return {
      executorProfiles: Array.from(execMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      avaliadorProfiles: Array.from(avalMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      avaliadoProfiles: Array.from(avdoMap, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [templates, colaboradores]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (filterExecutor !== "__all") list = list.filter((t: any) => t.executor_profile_id === filterExecutor);
    if (filterAvaliador !== "__all") list = list.filter((t: any) => t.avaliador_profile_id === filterAvaliador);
    if (filterAvaliado !== "__all") list = list.filter((t: any) => t.avaliado_profile_id === filterAvaliado);
    return list;
  }, [templates, filterExecutor, filterAvaliador, filterAvaliado]);

  const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const upsert = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome é obrigatório");
      
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
        avaliador_profile_id: form.avaliador_profile_id || null,
        avaliador_setor_id: form.avaliador_setor_id || null,
        avaliado_profile_id: form.avaliado_profile_id || null,
        avaliado_setor_id: form.avaliado_setor_id || null,
        aprovador_profile_id: form.aprovador_profile_id || null,
        aprovador_setor_id: form.aprovador_setor_id || null,
        validador_contingencia_profile_id: form.validador_contingencia_profile_id || null,
        validador_contingencia_setor_id: form.validador_contingencia_setor_id || null,
        modo_pontuacao: form.modo_pontuacao,
        destino_score: form.destino_score,
        peso_recorrencia: form.peso_recorrencia,
        tipo_atribuicao_avaliado: form.tipo_atribuicao_avaliado,
        penalidade_contingencia: form.penalidade_contingencia,
        penalidade_sla_contingencia: form.penalidade_sla_contingencia,
        habilitar_perguntas_automaticas: form.habilitar_perguntas_automaticas,
      };

      let templateId: string;
      if (editingId) {
        // Increment version
        const { data: current } = await (supabase as any).from("operational_templates").select("versao").eq("id", editingId).single();
        payload.versao = (current?.versao || 1) + 1;
        const { error } = await (supabase as any).from("operational_templates").update(payload).eq("id", editingId);
        if (error) throw error;
        templateId = editingId;
        // Clean old sections/fields
        await (supabase as any).from("operational_template_fields").delete().eq("template_id", templateId);
        await (supabase as any).from("operational_template_sections").delete().eq("template_id", templateId);
      } else {
        payload.versao = 1;
        const { data, error } = await (supabase as any).from("operational_templates").insert(payload).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      // Insert sections
      const sectionIdMap: Record<string, string> = {};
      if (sections.length > 0) {
        const { data: inserted, error } = await (supabase as any).from("operational_template_sections").insert(
          sections.map((s, i) => ({
            template_id: templateId, nome: s.nome || `Seção ${i + 1}`, descricao: s.descricao || null,
            peso: s.peso, ordem: i, cor: s.cor,
          }))
        ).select();
        if (error) throw error;
        sections.forEach((s, i) => { sectionIdMap[s.tempId] = inserted[i].id; });
      }

      // Insert fields
      if (fields.length > 0) {
        const { error } = await (supabase as any).from("operational_template_fields").insert(
          fields.map(f => ({
            template_id: templateId,
            section_id: sectionIdMap[f.sectionTempId] || null,
            label: f.label || "Campo sem nome",
            descricao: f.descricao || null,
            tipo: f.tipo, ordem: f.ordem,
            obrigatorio: f.obrigatorio, peso: f.peso, nota_maxima: f.nota_maxima,
            penalidade_reprovacao: f.penalidade_reprovacao, impacta_score: f.impacta_score,
            criticidade: f.criticidade, gera_contingencia: f.gera_contingencia,
            exige_evidencia: f.exige_evidencia, tipo_evidencia: f.tipo_evidencia || "foto",
            opcoes: f.opcoes?.length > 0 ? f.opcoes : null,
            validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
            formula: f.formula,
            visivel_para: f.visivel_para, editavel_por: f.editavel_por,
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      toast.success(editingId ? "Template atualizado (versão incrementada)." : "Template criado.");
      closeDialog();
    },
    onError: (e: any) => toast.error(e.message),
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
      await (supabase as any).from("operational_template_fields").delete().eq("template_id", id);
      await (supabase as any).from("operational_template_sections").delete().eq("template_id", id);
      const { error } = await (supabase as any).from("operational_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_templates"] }); toast.success("Template excluído."); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultTemplate);
    setSections([]);
    setFields([]);
    setActiveTab("geral");
    setDialogOpen(true);
  };

  const openEdit = async (t: any) => {
    setEditingId(t.id);
    setEditingVersion(t.versao || 1);
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
      avaliador_profile_id: t.avaliador_profile_id || "",
      avaliador_setor_id: t.avaliador_setor_id || "",
      avaliado_profile_id: t.avaliado_profile_id || "",
      avaliado_setor_id: t.avaliado_setor_id || "",
      aprovador_profile_id: t.aprovador_profile_id || "",
      aprovador_setor_id: t.aprovador_setor_id || "",
      validador_contingencia_profile_id: t.validador_contingencia_profile_id || "",
      validador_contingencia_setor_id: t.validador_contingencia_setor_id || "",
      modo_pontuacao: t.modo_pontuacao || "pontuar_avaliado",
      destino_score: t.destino_score || "individual",
      tipo_atribuicao_avaliado: t.tipo_atribuicao_avaliado || "individual",
      peso_recorrencia: t.peso_recorrencia ?? 1.0,
      penalidade_contingencia: t.penalidade_contingencia ?? 10,
      penalidade_sla_contingencia: t.penalidade_sla_contingencia ?? 15,
      habilitar_perguntas_automaticas: t.habilitar_perguntas_automaticas ?? true,
    });

    // Load sections
    const { data: secs } = await (supabase as any).from("operational_template_sections")
      .select("*").eq("template_id", t.id).order("ordem");
    const loadedSections: SectionForm[] = (secs || []).map((s: any) => ({
      id: s.id, tempId: s.id, nome: s.nome, descricao: s.descricao || "", peso: s.peso, ordem: s.ordem, cor: s.cor || "#3b82f6",
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
      penalidade_reprovacao: f.penalidade_reprovacao, impacta_score: f.impacta_score,
      criticidade: f.criticidade, gera_contingencia: f.gera_contingencia || false,
      exige_evidencia: f.exige_evidencia || false, tipo_evidencia: f.tipo_evidencia || "foto",
      opcoes: f.opcoes || [], validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
      formula: f.formula, visivel_para: f.visivel_para || ["executor", "avaliador"],
      editavel_por: f.editavel_por || ["executor"],
    }));
    setFields(loadedFields);

    setActiveTab("geral");
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Template Builder — Rotinas Operacionais</h1>
          <p className="text-body text-muted-foreground">Cadastre templates com seções, campos dinâmicos, workflow e recorrência.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Novo Template</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={filterExecutor} onValueChange={setFilterExecutor}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Executor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Executor: Todos</SelectItem>
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
        <Select value={filterAvaliado} onValueChange={setFilterAvaliado}>
          <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Avaliado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Avaliado: Todos</SelectItem>
            {avaliadoProfiles.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Templates table */}
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                <th className="text-center text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Versão</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : filteredTemplates.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhum template encontrado.</td></tr>
              ) : filteredTemplates.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-body font-medium text-foreground">{t.nome}</span>
                    {t.descricao && <p className="text-caption text-muted-foreground mt-0.5 truncate max-w-[250px]">{t.descricao}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-caption font-medium border badge-active">
                      {TIPO_EXECUCAO_LABELS[t.tipo_execucao] || t.tipo_execucao}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{t.setores?.nome || "—"}</td>
                  <td className="px-4 py-3 text-body text-muted-foreground">{RECORRENCIA_LABELS[t.recorrencia_tipo] || t.recorrencia_tipo}</td>
                  <td className="px-4 py-3 text-center text-body font-tabular text-muted-foreground">v{t.versao || 1}</td>
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
                      <Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`Excluir template "${t.nome}"? Esta ação é irreversível e removerá todas as seções e campos associados.`)) remove.mutate(t.id); }} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? `Editar Template (v${editingVersion})` : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4 flex-wrap h-auto gap-1">
                <TabsTrigger value="geral" className="flex-1 min-w-[60px]">Geral</TabsTrigger>
                <TabsTrigger value="campos" className="flex-1 min-w-[80px]">Campos</TabsTrigger>
                <TabsTrigger value="workflow" className="flex-1 min-w-[70px]">Workflow</TabsTrigger>
                <TabsTrigger value="recorrencia" className="flex-1 min-w-[80px]">Recorrência</TabsTrigger>
              </TabsList>

              <TabsContent value="geral">
                <TabGeral form={form} set={set} setores={setores} colaboradores={colaboradores} />
              </TabsContent>
              <TabsContent value="campos">
                <TabFormBuilder sections={sections} setSections={setSections} fields={fields} setFields={setFields} setores={setores} />
              </TabsContent>
              <TabsContent value="workflow">
                <TabWorkflow form={form} set={set} fields={fields} />
              </TabsContent>
              <TabsContent value="recorrencia">
                <TabRecorrencia form={form} set={set} />
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? "Salvando..." : editingId ? "Atualizar Template" : "Criar Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
