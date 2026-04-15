import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X, GripVertical, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TIPO_EXECUCAO_LABELS, RECORRENCIA_LABELS, DIAS_SEMANA } from "@/hooks/useOperationalScoring";

interface StepForm { nome: string; ordem: number; horario_previsto: string; prazo_limite_minutos: number; exige_foto: boolean; exige_video: boolean; exige_observacao: boolean; }
interface CheckItemForm { pergunta: string; ordem: number; tipo_resposta: string; exige_foto: boolean; exige_observacao: boolean; gera_contingencia_se_reprovado: boolean; }

interface TemplateForm {
  nome: string; descricao: string; tipo_execucao: string; setor_id: string; responsavel_id: string;
  recorrencia_tipo: string; dias_da_semana: number[]; intervalo_dias: number; pular_semanas: number;
  dia_fixo_mes: number | null; data_inicio: string; data_fim: string; repetir_sempre: boolean;
  horario_inicio_previsto: string; horario_limite_execucao: string; tolerancia_minutos: number;
  exigir_foto: boolean; exigir_video: boolean; exigir_observacao: boolean;
  gerar_contingencia_automatica: boolean; prazo_sla_correcao_horas: number; responsavel_contingencia_id: string;
  requer_aprovacao_gestor: boolean; bloquear_fechamento_com_contingencia: boolean;
}

const defaultForm: TemplateForm = {
  nome: "", descricao: "", tipo_execucao: "simples", setor_id: "", responsavel_id: "",
  recorrencia_tipo: "unica", dias_da_semana: [], intervalo_dias: 1, pular_semanas: 0,
  dia_fixo_mes: null, data_inicio: new Date().toISOString().slice(0, 10), data_fim: "", repetir_sempre: false,
  horario_inicio_previsto: "08:00", horario_limite_execucao: "18:00", tolerancia_minutos: 0,
  exigir_foto: false, exigir_video: false, exigir_observacao: false,
  gerar_contingencia_automatica: false, prazo_sla_correcao_horas: 24, responsavel_contingencia_id: "",
  requer_aprovacao_gestor: false, bloquear_fechamento_com_contingencia: false,
};

// ---- Preview de recorrência ----
function generatePreviewDates(form: TemplateForm): Date[] {
  if (form.recorrencia_tipo === "unica") {
    const d = form.data_inicio ? new Date(form.data_inicio + "T12:00:00") : new Date();
    return [d];
  }

  const now = new Date();
  const start = form.repetir_sempre || !form.data_inicio
    ? now
    : new Date(form.data_inicio + "T00:00:00");
  const endLimit = new Date(now);
  endLimit.setMonth(endLimit.getMonth() + 3);
  const end = form.data_fim && !form.repetir_sempre
    ? new Date(Math.min(new Date(form.data_fim + "T23:59:59").getTime(), endLimit.getTime()))
    : endLimit;

  const dates: Date[] = [];
  const cursor = new Date(Math.max(start.getTime(), now.getTime()));
  cursor.setHours(0, 0, 0, 0);
  const maxDates = 50;

  if (form.recorrencia_tipo === "diaria") {
    while (cursor <= end && dates.length < maxDates) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (form.recorrencia_tipo === "semanal") {
    const dias = form.dias_da_semana.length > 0 ? form.dias_da_semana : [1, 2, 3, 4, 5];
    while (cursor <= end && dates.length < maxDates) {
      if (dias.includes(cursor.getDay())) {
        dates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (form.recorrencia_tipo === "mensal") {
    const diaFixo = form.dia_fixo_mes || cursor.getDate();
    const m = new Date(cursor);
    m.setDate(diaFixo);
    if (m < cursor) m.setMonth(m.getMonth() + 1);
    while (m <= end && dates.length < maxDates) {
      dates.push(new Date(m));
      m.setMonth(m.getMonth() + 1);
    }
  } else if (form.recorrencia_tipo === "personalizada") {
    const dias = form.dias_da_semana.length > 0 ? form.dias_da_semana : null;
    const intervalo = form.intervalo_dias || 1;
    let weekCounter = 0;
    let lastWeek = -1;

    while (cursor <= end && dates.length < maxDates) {
      const curWeek = Math.floor(cursor.getTime() / (7 * 24 * 60 * 60 * 1000));
      if (curWeek !== lastWeek) {
        lastWeek = curWeek;
        weekCounter++;
      }
      const skipThisWeek = form.pular_semanas > 0 && weekCounter % (form.pular_semanas + 1) !== 1;
      const diaMatch = !dias || dias.includes(cursor.getDay());

      if (!skipThisWeek && diaMatch) {
        dates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + (dias ? 1 : intervalo));
    }
  }

  return dates;
}

const DIAS_SEMANA_FULL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function RecurrencePreview({ form }: { form: TemplateForm }) {
  const dates = useMemo(() => generatePreviewDates(form), [
    form.recorrencia_tipo, form.dias_da_semana, form.intervalo_dias, form.pular_semanas,
    form.dia_fixo_mes, form.data_inicio, form.data_fim, form.repetir_sempre,
  ]);

  if (form.recorrencia_tipo === "unica" && !form.data_inicio) return null;

  const horario = form.horario_inicio_previsto || null;
  const horarioLimite = form.horario_limite_execucao || null;

  // Group by month
  const grouped: Record<string, Date[]> = {};
  for (const d of dates) {
    const key = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    (grouped[key] ??= []).push(d);
  }

  return (
    <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium text-foreground">
          Preview — próximas {dates.length} ocorrências
        </p>
        {form.repetir_sempre && (
          <span className="text-caption bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">∞ Sem fim</span>
        )}
      </div>

      {dates.length === 0 ? (
        <p className="text-caption text-muted-foreground text-center py-2">
          Nenhuma data gerada. Verifique a configuração de recorrência.
        </p>
      ) : (
        <div className="max-h-[200px] overflow-y-auto space-y-3 pr-1">
          {Object.entries(grouped).map(([month, monthDates]) => (
            <div key={month}>
              <p className="text-caption font-semibold text-muted-foreground uppercase tracking-wider mb-1 capitalize">
                {month}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {monthDates.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-card border border-border rounded px-2 py-1.5 text-caption"
                  >
                    <span className="font-medium text-foreground">
                      {d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                    <span className="text-muted-foreground">
                      {DIAS_SEMANA_FULL[d.getDay()].slice(0, 3)}
                    </span>
                    {horario && (
                      <span className="text-primary font-medium ml-auto">{horario}</span>
                    )}
                    {horarioLimite && horario && (
                      <span className="text-muted-foreground">– {horarioLimite}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dates.length >= 50 && (
        <p className="text-caption text-muted-foreground italic">Mostrando até 50 ocorrências (3 meses).</p>
      )}
    </div>
  );
}

export default function OperationalCadastroPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(defaultForm);
  const [steps, setSteps] = useState<StepForm[]>([]);
  const [checkItems, setCheckItems] = useState<CheckItemForm[]>([]);
  const [activeTab, setActiveTab] = useState("geral");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["operational_templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("operational_templates")
        .select("*, setores(nome), profiles!operational_templates_responsavel_id_fkey(nome)")
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
  });

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_ativos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data;
    },
  });

  const set = <K extends keyof TemplateForm>(k: K, v: TemplateForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const toggleDia = (dia: number) => {
    setForm(f => ({ ...f, dias_da_semana: f.dias_da_semana.includes(dia) ? f.dias_da_semana.filter(d => d !== dia) : [...f.dias_da_semana, dia].sort() }));
  };

  const upsert = useMutation({
    mutationFn: async () => {
      const payload: any = {
        nome: form.nome, descricao: form.descricao || null, tipo_execucao: form.tipo_execucao,
        setor_id: form.setor_id || null, responsavel_id: form.responsavel_id || null,
        recorrencia_tipo: form.recorrencia_tipo, dias_da_semana: form.dias_da_semana,
        intervalo_dias: form.intervalo_dias, pular_semanas: form.pular_semanas,
        dia_fixo_mes: form.dia_fixo_mes, data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        horario_inicio_previsto: form.horario_inicio_previsto || null,
        horario_limite_execucao: form.horario_limite_execucao || null,
        tolerancia_minutos: form.tolerancia_minutos,
        exigir_foto: form.exigir_foto, exigir_video: form.exigir_video, exigir_observacao: form.exigir_observacao,
        gerar_contingencia_automatica: form.gerar_contingencia_automatica,
        prazo_sla_correcao_horas: form.prazo_sla_correcao_horas,
        responsavel_contingencia_id: form.responsavel_contingencia_id || null,
      };

      let templateId: string;
      if (editingId) {
        const { error } = await (supabase as any).from("operational_templates").update(payload).eq("id", editingId);
        if (error) throw error;
        templateId = editingId;
        // Clean old children
        await (supabase as any).from("operational_template_steps").delete().eq("template_id", templateId);
        await (supabase as any).from("operational_template_check_items").delete().eq("template_id", templateId);
      } else {
        const { data, error } = await (supabase as any).from("operational_templates").insert(payload).select().single();
        if (error) throw error;
        templateId = data.id;
      }

      // Insert steps
      if (form.tipo_execucao === "etapas" && steps.length > 0) {
        const { error } = await (supabase as any).from("operational_template_steps").insert(
          steps.map((s, i) => ({ template_id: templateId, nome: s.nome, ordem: i, horario_previsto: s.horario_previsto || null, prazo_limite_minutos: s.prazo_limite_minutos, exige_foto: s.exige_foto, exige_video: s.exige_video, exige_observacao: s.exige_observacao }))
        );
        if (error) throw error;
      }

      // Insert check items
      if (form.tipo_execucao === "checklist_inspecao" && checkItems.length > 0) {
        const { error } = await (supabase as any).from("operational_template_check_items").insert(
          checkItems.map((c, i) => ({ template_id: templateId, pergunta: c.pergunta, ordem: i, tipo_resposta: c.tipo_resposta, exige_foto: c.exige_foto, exige_observacao: c.exige_observacao, gera_contingencia_se_reprovado: c.gera_contingencia_se_reprovado }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      toast.success(editingId ? "Template atualizado." : "Template criado.");
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
      const { error } = await (supabase as any).from("operational_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["operational_templates"] }); toast.success("Template excluído."); },
    onError: (e: any) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingId(null); setForm(defaultForm); setSteps([]); setCheckItems([]); setActiveTab("geral"); setDialogOpen(true);
  };

  const openEdit = async (t: any) => {
    setEditingId(t.id);
    setForm({
      nome: t.nome, descricao: t.descricao || "", tipo_execucao: t.tipo_execucao,
      setor_id: t.setor_id || "", responsavel_id: t.responsavel_id || "",
      recorrencia_tipo: t.recorrencia_tipo, dias_da_semana: t.dias_da_semana || [],
      intervalo_dias: t.intervalo_dias || 1, pular_semanas: t.pular_semanas || 0,
      dia_fixo_mes: t.dia_fixo_mes, data_inicio: t.data_inicio || "", data_fim: t.data_fim || "",
      repetir_sempre: !t.data_inicio && !t.data_fim && t.recorrencia_tipo !== "unica",
      horario_inicio_previsto: t.horario_inicio_previsto || "08:00",
      horario_limite_execucao: t.horario_limite_execucao || "18:00",
      tolerancia_minutos: t.tolerancia_minutos || 0,
      exigir_foto: t.exigir_foto, exigir_video: t.exigir_video, exigir_observacao: t.exigir_observacao,
      gerar_contingencia_automatica: t.gerar_contingencia_automatica,
      prazo_sla_correcao_horas: t.prazo_sla_correcao_horas || 24,
      responsavel_contingencia_id: t.responsavel_contingencia_id || "",
    });

    // Load steps
    if (t.tipo_execucao === "etapas") {
      const { data } = await (supabase as any).from("operational_template_steps").select("*").eq("template_id", t.id).order("ordem");
      setSteps((data || []).map((s: any) => ({ nome: s.nome, ordem: s.ordem, horario_previsto: s.horario_previsto || "", prazo_limite_minutos: s.prazo_limite_minutos, exige_foto: s.exige_foto, exige_video: s.exige_video, exige_observacao: s.exige_observacao })));
    } else { setSteps([]); }

    // Load check items
    if (t.tipo_execucao === "checklist_inspecao") {
      const { data } = await (supabase as any).from("operational_template_check_items").select("*").eq("template_id", t.id).order("ordem");
      setCheckItems((data || []).map((c: any) => ({ pergunta: c.pergunta, ordem: c.ordem, tipo_resposta: c.tipo_resposta, exige_foto: c.exige_foto, exige_observacao: c.exige_observacao, gera_contingencia_se_reprovado: c.gera_contingencia_se_reprovado })));
    } else { setCheckItems([]); }

    setActiveTab("geral"); setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  const addStep = () => setSteps(s => [...s, { nome: "", ordem: s.length, horario_previsto: "", prazo_limite_minutos: 60, exige_foto: false, exige_video: false, exige_observacao: false }]);
  const removeStep = (i: number) => setSteps(s => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, field: keyof StepForm, val: any) => setSteps(s => s.map((step, idx) => idx === i ? { ...step, [field]: val } : step));

  const addCheckItem = () => setCheckItems(c => [...c, { pergunta: "", ordem: c.length, tipo_resposta: "conforme_nao_conforme", exige_foto: false, exige_observacao: false, gera_contingencia_se_reprovado: false }]);
  const removeCheckItem = (i: number) => setCheckItems(c => c.filter((_, idx) => idx !== i));
  const updateCheckItem = (i: number, field: keyof CheckItemForm, val: any) => setCheckItems(c => c.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  // Drag & drop for steps
  const dragStepIdx = useRef<number | null>(null);
  const handleStepDragStart = useCallback((i: number) => { dragStepIdx.current = i; }, []);
  const handleStepDrop = useCallback((targetIdx: number) => {
    const from = dragStepIdx.current;
    if (from === null || from === targetIdx) return;
    setSteps(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(targetIdx, 0, moved);
      return arr.map((s, i) => ({ ...s, ordem: i }));
    });
    dragStepIdx.current = null;
  }, []);

  // Drag & drop for check items
  const dragCheckIdx = useRef<number | null>(null);
  const handleCheckDragStart = useCallback((i: number) => { dragCheckIdx.current = i; }, []);
  const handleCheckDrop = useCallback((targetIdx: number) => {
    const from = dragCheckIdx.current;
    if (from === null || from === targetIdx) return;
    setCheckItems(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(targetIdx, 0, moved);
      return arr.map((c, i) => ({ ...c, ordem: i }));
    });
    dragCheckIdx.current = null;
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-section font-semibold text-foreground">Configurador de Rotinas</h1>
          <p className="text-body text-muted-foreground">Cadastre templates de rotinas operacionais com etapas, checklists e contingências.</p>
        </div>
        <Button onClick={openCreate} className="press-effect"><Plus className="w-4 h-4 mr-2" /> Nova Rotina</Button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Nome</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Tipo</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Setor</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Recorrência</th>
                <th className="text-left text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Status</th>
                <th className="text-right text-caption font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Carregando...</td></tr>
              ) : templates.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-body text-muted-foreground">Nenhuma rotina cadastrada.</td></tr>
              ) : templates.map((t: any) => (
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
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(t.id)} className="press-effect text-destructive"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Editar Rotina" : "Nova Rotina"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); upsert.mutate(); }}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full mb-4">
                <TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger>
                <TabsTrigger value="recorrencia" className="flex-1">Recorrência</TabsTrigger>
                <TabsTrigger value="evidencias" className="flex-1">Evidências</TabsTrigger>
                {form.tipo_execucao === "etapas" && <TabsTrigger value="etapas" className="flex-1">Etapas</TabsTrigger>}
                {form.tipo_execucao === "checklist_inspecao" && <TabsTrigger value="checklist" className="flex-1">Checklist</TabsTrigger>}
                <TabsTrigger value="contingencia" className="flex-1">Contingência</TabsTrigger>
              </TabsList>

              {/* GERAL */}
              <TabsContent value="geral" className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Nome da Rotina *</Label>
                  <Input value={form.nome} onChange={e => set("nome", e.target.value)} required placeholder="Ex: Inspeção de equipamentos" />
                </div>
                <div className="space-y-1.5">
                  <Label>Descrição</Label>
                  <Textarea value={form.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Detalhes da rotina..." />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tipo de Execução *</Label>
                    <Select value={form.tipo_execucao} onValueChange={v => set("tipo_execucao", v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TIPO_EXECUCAO_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Setor</Label>
                    <Select value={form.setor_id} onValueChange={v => set("setor_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{setores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Responsável</Label>
                    <Select value={form.responsavel_id} onValueChange={v => set("responsavel_id", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Horário Início</Label>
                    <Input type="time" value={form.horario_inicio_previsto} onChange={e => set("horario_inicio_previsto", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Horário Limite</Label>
                    <Input type="time" value={form.horario_limite_execucao} onChange={e => set("horario_limite_execucao", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tolerância (min)</Label>
                    <Input type="number" min={0} value={form.tolerancia_minutos} onChange={e => set("tolerancia_minutos", +e.target.value)} />
                  </div>
                </div>
              </TabsContent>

              {/* RECORRÊNCIA */}
              <TabsContent value="recorrencia" className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Tipo de Recorrência</Label>
                  <Select value={form.recorrencia_tipo} onValueChange={v => set("recorrencia_tipo", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RECORRENCIA_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {form.recorrencia_tipo !== "unica" && (
                  <div className="flex items-center gap-2 bg-muted/50 rounded-lg border border-border p-3">
                    <Switch
                      checked={form.repetir_sempre}
                      onCheckedChange={v => {
                        set("repetir_sempre", v);
                        if (v) { set("data_inicio", ""); set("data_fim", ""); }
                      }}
                    />
                    <div>
                      <Label className="cursor-pointer">Repetir sempre</Label>
                      <p className="text-caption text-muted-foreground">Ignora data início/fim e gera automaticamente na próxima ocorrência configurada.</p>
                    </div>
                  </div>
                )}

                {!form.repetir_sempre && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Data Início</Label>
                      <Input type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Data Fim (opcional)</Label>
                      <Input type="date" value={form.data_fim} onChange={e => set("data_fim", e.target.value)} />
                    </div>
                  </div>
                )}

                {(form.recorrencia_tipo === "semanal" || form.recorrencia_tipo === "personalizada") && (
                  <div className="space-y-1.5">
                    <Label>Dias da Semana</Label>
                    <div className="flex gap-2 flex-wrap">
                      {DIAS_SEMANA.map((d, i) => (
                        <button key={i} type="button" onClick={() => toggleDia(i)}
                          className={`px-3 py-1.5 rounded-md text-caption font-medium border transition-colors ${form.dias_da_semana.includes(i) ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:bg-muted"}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {form.recorrencia_tipo === "personalizada" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Intervalo (dias)</Label>
                      <Input type="number" min={1} value={form.intervalo_dias} onChange={e => set("intervalo_dias", +e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pular Semanas</Label>
                      <Input type="number" min={0} value={form.pular_semanas} onChange={e => set("pular_semanas", +e.target.value)} />
                    </div>
                  </div>
                )}
                {form.recorrencia_tipo === "mensal" && (
                  <div className="space-y-1.5">
                    <Label>Dia Fixo do Mês</Label>
                    <Input type="number" min={1} max={31} value={form.dia_fixo_mes || ""} onChange={e => set("dia_fixo_mes", +e.target.value || null)} />
                  </div>
                )}

                {/* PREVIEW DE DATAS */}
                <RecurrencePreview form={form} />
              </TabsContent>

              {/* EVIDÊNCIAS */}
              <TabsContent value="evidencias" className="space-y-4">
                <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
                  <p className="text-caption font-medium text-muted-foreground uppercase tracking-wider">Requisitos de Evidência</p>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <Switch checked={form.exigir_foto} onCheckedChange={v => set("exigir_foto", v)} />
                      <Label className="cursor-pointer">Exigir Foto</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={form.exigir_video} onCheckedChange={v => set("exigir_video", v)} />
                      <Label className="cursor-pointer">Exigir Vídeo</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={form.exigir_observacao} onCheckedChange={v => set("exigir_observacao", v)} />
                      <Label className="cursor-pointer">Obrigar Observação</Label>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ETAPAS */}
              {form.tipo_execucao === "etapas" && (
                <TabsContent value="etapas" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Etapas da Execução</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addStep}><Plus className="w-3 h-3 mr-1" />Etapa</Button>
                  </div>
                  {steps.length === 0 && <p className="text-caption text-muted-foreground text-center py-4">Nenhuma etapa. Adicione pelo menos uma.</p>}
                  {steps.map((s, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleStepDragStart(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleStepDrop(i)}
                      className="bg-muted/50 rounded-lg border border-border p-3 space-y-2 cursor-default"
                    >
                      <div className="flex items-center gap-2">
                        <span className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" title="Arraste para reordenar">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <span className="text-caption font-medium text-muted-foreground">#{i + 1}</span>
                        <Input value={s.nome} onChange={e => updateStep(i, "nome", e.target.value)} placeholder="Nome da etapa" className="flex-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(i)} className="text-destructive"><X className="w-3 h-3" /></Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="time" value={s.horario_previsto} onChange={e => updateStep(i, "horario_previsto", e.target.value)} placeholder="Horário" />
                        <Input type="number" min={1} value={s.prazo_limite_minutos} onChange={e => updateStep(i, "prazo_limite_minutos", +e.target.value)} />
                        <div className="flex items-center gap-2 text-caption">
                          <Switch checked={s.exige_foto} onCheckedChange={v => updateStep(i, "exige_foto", v)} /><span>Foto</span>
                          <Switch checked={s.exige_observacao} onCheckedChange={v => updateStep(i, "exige_observacao", v)} /><span>Obs.</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              )}

              {/* CHECKLIST */}
              {form.tipo_execucao === "checklist_inspecao" && (
                <TabsContent value="checklist" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Itens do Checklist</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addCheckItem}><Plus className="w-3 h-3 mr-1" />Item</Button>
                  </div>
                  {checkItems.length === 0 && <p className="text-caption text-muted-foreground text-center py-4">Nenhum item. Adicione pelo menos um.</p>}
                  {checkItems.map((c, i) => (
                    <div
                      key={i}
                      draggable
                      onDragStart={() => handleCheckDragStart(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleCheckDrop(i)}
                      className="bg-muted/50 rounded-lg border border-border p-3 space-y-2 cursor-default"
                    >
                      <div className="flex items-center gap-2">
                        <span className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" title="Arraste para reordenar">
                          <GripVertical className="w-4 h-4" />
                        </span>
                        <span className="text-caption font-medium text-muted-foreground">#{i + 1}</span>
                        <Input value={c.pergunta} onChange={e => updateCheckItem(i, "pergunta", e.target.value)} placeholder="Pergunta/item de inspeção" className="flex-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeCheckItem(i)} className="text-destructive"><X className="w-3 h-3" /></Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={c.tipo_resposta} onValueChange={v => updateCheckItem(i, "tipo_resposta", v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="conforme_nao_conforme">Conforme / Não Conforme</SelectItem>
                            <SelectItem value="sim_nao">Sim / Não</SelectItem>
                            <SelectItem value="texto">Texto Livre</SelectItem>
                            <SelectItem value="numero">Numérico</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-3 text-caption">
                          <Switch checked={c.exige_foto} onCheckedChange={v => updateCheckItem(i, "exige_foto", v)} /><span>Foto</span>
                          <Switch checked={c.gera_contingencia_se_reprovado} onCheckedChange={v => updateCheckItem(i, "gera_contingencia_se_reprovado", v)} /><span>Contingência</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              )}

              {/* CONTINGÊNCIA */}
              <TabsContent value="contingencia" className="space-y-4">
                <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.gerar_contingencia_automatica} onCheckedChange={v => set("gerar_contingencia_automatica", v)} />
                    <Label className="cursor-pointer">Gerar contingência automática em não conformidade</Label>
                  </div>
                  {form.gerar_contingencia_automatica && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Prazo SLA Correção (horas)</Label>
                        <Input type="number" min={1} value={form.prazo_sla_correcao_horas} onChange={e => set("prazo_sla_correcao_horas", +e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Responsável Contingência</Label>
                        <Select value={form.responsavel_contingencia_id} onValueChange={v => set("responsavel_contingencia_id", v)}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>{colaboradores.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
              <Button type="submit" disabled={upsert.isPending} className="press-effect">
                {upsert.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
