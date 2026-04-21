import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, ListChecks, Users, Sliders, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldDetailDialog } from "@/modules/operacional/components/TabFormBuilder";
import { DynamicFieldRenderer, SnapshotField } from "@/modules/operacional/components/DynamicFieldRenderer";
import { FIELD_TYPES, SectionForm, FieldForm, defaultSection, getLocalToday, defaultTemplate } from "@/modules/operacional/types";
import { cn } from "@/lib/utils";
import { defaultField } from "@/modules/operacional/types";
import { Plus, Trash2, Settings2, Copy, Settings, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// localStorage keys for default penalty values (per-user defaults set via gear icon)
const LS_DEFAULTS_KEY = "quicktask_workflow_defaults_v1";
interface WorkflowDefaults {
  penalidade_fora_prazo: number;
  penalidade_contingencia: number;
  penalidade_sla_contingencia: number;
}
const loadDefaults = (): WorkflowDefaults => {
  try {
    const raw = localStorage.getItem(LS_DEFAULTS_KEY);
    if (raw) return { ...{ penalidade_fora_prazo: defaultTemplate.penalidade_fora_prazo, penalidade_contingencia: defaultTemplate.penalidade_contingencia, penalidade_sla_contingencia: defaultTemplate.penalidade_sla_contingencia }, ...JSON.parse(raw) };
  } catch {}
  return {
    penalidade_fora_prazo: defaultTemplate.penalidade_fora_prazo,
    penalidade_contingencia: defaultTemplate.penalidade_contingencia,
    penalidade_sla_contingencia: defaultTemplate.penalidade_sla_contingencia,
  };
};
const saveDefaults = (d: WorkflowDefaults) => {
  try { localStorage.setItem(LS_DEFAULTS_KEY, JSON.stringify(d)); } catch {}
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultAvaliadoId?: string;
  /** Tipo escolhido no seletor inicial. "simples" oculta workflow de etapas/seções e simplifica a Step 2. */
  taskType?: "simples" | "inspecao";
}

type Step = 1 | 2 | 3;

export default function QuickTaskDialog({ open, onOpenChange, defaultAvaliadoId, taskType = "inspecao" }: Props) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [setorId, setSetorId] = useState("");
  const [dataPrevista, setDataPrevista] = useState(getLocalToday());
  const [horarioLimite, setHorarioLimite] = useState("18:00");
  // Recorrência (opcional)
  const [recorrenciaAtiva, setRecorrenciaAtiva] = useState(false);
  const [recorrenciaTipo, setRecorrenciaTipo] = useState<"diaria" | "semanal" | "mensal">("diaria");
  const [recorrenciaDias, setRecorrenciaDias] = useState<number[]>([]); // 0=dom..6=sab
  const [recorrenciaDataFim, setRecorrenciaDataFim] = useState("");
  // Responsáveis
  const [avaliadoId, setAvaliadoId] = useState(""); // quem responde + recebe nota
  const [requerValidacao, setRequerValidacao] = useState(false);
  const [validadorMode, setValidadorMode] = useState<"individual" | "setor">("individual");
  const [validadorId, setValidadorId] = useState("");
  const [validadorSetorId, setValidadorSetorId] = useState("");
  const [requerPlanoAcao, setRequerPlanoAcao] = useState(false);
  const [planoAcaoMode, setPlanoAcaoMode] = useState<"individual" | "setor">("individual");
  const [planoAcaoId, setPlanoAcaoId] = useState("");
  const [planoAcaoSetorId, setPlanoAcaoSetorId] = useState("");
  const [requerAprovacao, setRequerAprovacao] = useState(false);
  const [aprovadorMode, setAprovadorMode] = useState<"individual" | "setor">("individual");
  const [aprovadorId, setAprovadorId] = useState("");
  const [aprovadorSetorId, setAprovadorSetorId] = useState("");

  // Step 2 state
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [fields, setFields] = useState<FieldForm[]>([]);
  const [editingField, setEditingField] = useState<FieldForm | null>(null);
  const [isNewField, setIsNewField] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});

  // Step 3 state — Prazos & Notas (replicando TabWorkflow)
  const [slaHoras, setSlaHoras] = useState(24);
  const [penalidadeForaPrazo, setPenalidadeForaPrazo] = useState(defaultTemplate.penalidade_fora_prazo);
  const [penalidadeContingencia, setPenalidadeContingencia] = useState(defaultTemplate.penalidade_contingencia);
  const [penalidadeSlaContingencia, setPenalidadeSlaContingencia] = useState(defaultTemplate.penalidade_sla_contingencia);
  const [habilitarPerguntasAutomaticas, setHabilitarPerguntasAutomaticas] = useState(true);
  const [pesoNotaMaxima, setPesoNotaMaxima] = useState(100);

  const reset = () => {
    setStep(1);
    setNome(""); setDescricao(""); setSetorId("");
    setDataPrevista(getLocalToday()); setHorarioLimite("18:00");
    setRecorrenciaAtiva(false); setRecorrenciaTipo("diaria"); setRecorrenciaDias([]); setRecorrenciaDataFim("");
    setAvaliadoId("");
    setRequerValidacao(false); setValidadorMode("individual"); setValidadorId(""); setValidadorSetorId("");
    setRequerPlanoAcao(false); setPlanoAcaoMode("individual"); setPlanoAcaoId(""); setPlanoAcaoSetorId("");
    setRequerAprovacao(false); setAprovadorMode("individual"); setAprovadorId(""); setAprovadorSetorId("");
    setSections([]); setFields([]);
    const d = loadDefaults();
    setSlaHoras(24);
    setPenalidadeForaPrazo(d.penalidade_fora_prazo);
    setPenalidadeContingencia(d.penalidade_contingencia);
    setPenalidadeSlaContingencia(d.penalidade_sla_contingencia);
    setHabilitarPerguntasAutomaticas(true);
    setPesoNotaMaxima(100);
  };

  useEffect(() => {
    if (open) {
      reset();
      const s = defaultSection(0);
      s.nome = "Itens";
      setSections([s]);
      // Pré-seleciona o avaliado quando há um default (visão admin de outro user)
      if (defaultAvaliadoId) setAvaliadoId(defaultAvaliadoId);
    }
  }, [open, defaultAvaliadoId]);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ["profiles_quicktask"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: setores = [] } = useQuery({
    queryKey: ["setores_quicktask"],
    queryFn: async () => {
      const { data, error } = await supabase.from("setores").select("*").eq("ativo", true).order("nome");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Tarefa "para si mesmo" → criador == avaliado
  const isSelfTask = !!profile?.id && avaliadoId === profile.id;

  // Validador: nunca pode ser o avaliado (não pode validar a si mesmo)
  const validadorOptions = useMemo(
    () => (colaboradores as any[]).filter((c) => c.id !== avaliadoId),
    [colaboradores, avaliadoId]
  );

  // Aprovador: nunca pode ser o avaliado. Em tarefa "para si mesmo" também exclui o criador.
  const aprovadorOptions = useMemo(() => {
    return (colaboradores as any[]).filter((c) => {
      if (avaliadoId && c.id === avaliadoId) return false;
      if (isSelfTask && c.id === profile?.id) return false;
      return true;
    });
  }, [colaboradores, isSelfTask, profile?.id, avaliadoId]);

  // Responsável pelo Plano de Ação: nunca pode ser o avaliado.
  const planoAcaoOptions = useMemo(() => {
    return (colaboradores as any[]).filter((c) => {
      if (avaliadoId && c.id === avaliadoId) return false;
      if (isSelfTask && c.id === profile?.id) return false;
      return true;
    });
  }, [colaboradores, isSelfTask, profile?.id, avaliadoId]);

  const planoAcaoOk = !requerPlanoAcao
    || (planoAcaoMode === "individual" && !!planoAcaoId && planoAcaoId !== avaliadoId)
    || (planoAcaoMode === "setor" && !!planoAcaoSetorId);

  const planoAcaoEnabled = requerPlanoAcao
    && ((planoAcaoMode === "individual" && !!planoAcaoId) || (planoAcaoMode === "setor" && !!planoAcaoSetorId));

  const aprovadorOk = !requerAprovacao
    || (aprovadorMode === "individual" && !!aprovadorId && aprovadorId !== avaliadoId && (!isSelfTask || aprovadorId !== profile?.id))
    || (aprovadorMode === "setor" && !!aprovadorSetorId);

  const canAdvanceStep1 = nome.trim().length > 0
    && !!avaliadoId
    && !!dataPrevista
    && planoAcaoOk
    && aprovadorOk;

  // Quando o responsável pelo plano de ação é desabilitado, limpa qualquer
  // regra "gera_contingencia" que tenha sido configurada nos campos.
  useEffect(() => {
    if (planoAcaoEnabled) return;
    setFields(prev => prev.map(f => {
      if (!f.opcoes_regras?.length) return f;
      const cleaned = f.opcoes_regras.map((o: any) => o.gera_contingencia ? { ...o, gera_contingencia: false, requer_evidencia: true } : o);
      return { ...f, opcoes_regras: cleaned, gera_contingencia: false };
    }));
  }, [planoAcaoEnabled]);

  const canAdvanceStep2 = fields.length > 0;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Sessão inválida");
      if (!canAdvanceStep1) throw new Error("Preencha os dados de designação");
      if (!canAdvanceStep2) throw new Error("Adicione ao menos 1 campo com nome");

      // Determinar se a tarefa terá pontuação válida:
      // só pontua se houver perguntas configuradas para o aprovador responder
      const temPerguntasAprovador = fields.some(f => f.aprovador_verificar && f.aprovador_pergunta?.trim());
      const pontuacaoValida = temPerguntasAprovador;
      const aprovacaoAtiva = requerAprovacao && pontuacaoValida;

      // 1) cria template ad-hoc (recorrência única)
      const templatePayload: any = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        tipo_execucao: "checklist_inspecao",
        setor_id: setorId || null,
        responsavel_id: avaliadoId,
        recorrencia_tipo: "unica",
        data_inicio: dataPrevista,
        data_fim: dataPrevista,
        horario_inicio_previsto: "08:00",
        horario_limite_execucao: horarioLimite,
        sla_horas: slaHoras,
        penalidade_fora_prazo: pontuacaoValida ? penalidadeForaPrazo : 0,
        penalidade_contingencia: pontuacaoValida ? penalidadeContingencia : 0,
        penalidade_sla_contingencia: pontuacaoValida ? penalidadeSlaContingencia : 0,
        executor_profile_id: avaliadoId,
        executor_setor_id: setorId || null,
        avaliador_profile_id: requerValidacao && validadorMode === "individual" ? validadorId : null,
        avaliador_setor_id: requerValidacao && validadorMode === "setor" ? validadorSetorId : null,
        avaliado_profile_id: avaliadoId,
        aprovador_profile_id: aprovacaoAtiva && aprovadorMode === "individual" ? aprovadorId : null,
        aprovador_setor_id: aprovacaoAtiva && aprovadorMode === "setor" ? aprovadorSetorId : null,
        responsavel_contingencia_id: planoAcaoEnabled && planoAcaoMode === "individual" ? planoAcaoId : null,
        validador_contingencia_profile_id: planoAcaoEnabled && planoAcaoMode === "individual" ? planoAcaoId : null,
        validador_contingencia_setor_id: planoAcaoEnabled && planoAcaoMode === "setor" ? planoAcaoSetorId : null,
        requer_aprovacao_gestor: aprovacaoAtiva,
        modo_pontuacao: pontuacaoValida ? "pontuar_avaliado" : "sem_pontuacao",
        destino_score: "individual",
        tipo_atribuicao_avaliado: "individual",
        habilitar_perguntas_automaticas: pontuacaoValida ? habilitarPerguntasAutomaticas : false,
        ativo: true,
        origem: "ad_hoc",
      };

      const { data: tpl, error: tplErr } = await (supabase as any)
        .from("operational_templates").insert(templatePayload).select().single();
      if (tplErr) throw tplErr;
      const templateId = tpl.id;

      // 2) sections
      const sectionIdMap: Record<string, string> = {};
      let insertedSections: any[] = [];
      if (sections.length > 0) {
        const { data: insSecs, error } = await (supabase as any).from("operational_template_sections").insert(
          sections.map((s, i) => ({
            template_id: templateId, nome: s.nome || `Seção ${i + 1}`, descricao: s.descricao || null,
            peso: s.peso, ordem: i, cor: s.cor,
            horario_inicio: s.horario_inicio || null, horario_fim: s.horario_fim || null,
          }))
        ).select();
        if (error) throw error;
        insertedSections = insSecs || [];
        sections.forEach((s, i) => { sectionIdMap[s.tempId] = insSecs[i].id; });
      }

      // 3) fields
      let insertedFields: any[] = [];
      if (fields.length > 0) {
        const fieldsPayload = fields.map((f) => ({
          template_id: templateId,
          section_id: sectionIdMap[f.sectionTempId] || null,
          label: f.label || "Campo sem nome",
          descricao: f.descricao || null,
          tipo: f.tipo, ordem: f.ordem,
          obrigatorio: f.obrigatorio, peso: f.peso,
          nota_maxima: pesoNotaMaxima,
          penalidade_reprovacao: f.penalidade_reprovacao,
          impacta_score: f.impacta_score,
          criticidade: f.criticidade, gera_contingencia: f.gera_contingencia,
          exige_evidencia: f.exige_evidencia, tipo_evidencia: f.tipo_evidencia || "foto",
          opcoes: f.opcoes?.length > 0 ? f.opcoes : null,
          opcoes_regras: f.opcoes_regras?.length > 0 ? f.opcoes_regras : [],
          validacao: f.validacao, condicao_visibilidade: f.condicao_visibilidade,
          formula: f.formula,
          visivel_para: f.visivel_para, editavel_por: f.editavel_por,
          aprovador_verificar: f.aprovador_verificar || false,
          aprovador_pergunta: f.aprovador_verificar ? (f.aprovador_pergunta || null) : null,
          aprovador_tipo_resposta: f.aprovador_tipo_resposta || "conforme",
          aprovador_peso: f.aprovador_peso ?? 1,
          aprovador_obriga_observacao_nao: f.aprovador_obriga_observacao_nao ?? true,
          aprovador_exige_evidencia_nao: f.aprovador_exige_evidencia_nao ?? false,
          aprovador_tipos_evidencia: f.aprovador_tipos_evidencia || ["foto"],
        }));
        const { data: insFields, error } = await (supabase as any)
          .from("operational_template_fields").insert(fieldsPayload).select();
        if (error) throw error;
        insertedFields = insFields || [];
      }

      // 3.5) Build template snapshot (igual TabTarefasExecutadas) para a execução renderizar os campos
      const snapshot = {
        versao: 1,
        nome: templatePayload.nome,
        descricao: templatePayload.descricao,
        sla_horas: templatePayload.sla_horas,
        permite_devolucao_parcial: false,
        requer_aprovacao_gestor: templatePayload.requer_aprovacao_gestor,
        bloquear_fechamento_com_contingencia: false,
        gerar_contingencia_automatica: false,
        peso_recorrencia: 1.0,
        modo_pontuacao: templatePayload.modo_pontuacao,
        destino_score: templatePayload.destino_score,
        horario_inicio_previsto: templatePayload.horario_inicio_previsto,
        horario_limite_execucao: templatePayload.horario_limite_execucao,
        tolerancia_minutos: 0,
        habilitar_perguntas_automaticas: templatePayload.habilitar_perguntas_automaticas,
        penalidade_fora_prazo: templatePayload.penalidade_fora_prazo,
        penalidade_contingencia: templatePayload.penalidade_contingencia,
        penalidade_sla_contingencia: templatePayload.penalidade_sla_contingencia,
        responsaveis: {
          executor_profile_id: templatePayload.executor_profile_id,
          executor_setor_id: templatePayload.executor_setor_id,
          avaliador_profile_id: templatePayload.avaliador_profile_id,
          avaliador_setor_id: templatePayload.avaliador_setor_id,
          avaliado_profile_id: templatePayload.avaliado_profile_id,
          avaliado_setor_id: null,
          aprovador_profile_id: templatePayload.aprovador_profile_id,
          aprovador_setor_id: templatePayload.aprovador_setor_id,
          validador_contingencia_profile_id: templatePayload.validador_contingencia_profile_id,
          validador_contingencia_setor_id: templatePayload.validador_contingencia_setor_id,
        },
        sections: insertedSections.map((s: any) => ({
          id: s.id, nome: s.nome, descricao: s.descricao, peso: s.peso, ordem: s.ordem, cor: s.cor,
          horario_inicio: s.horario_inicio, horario_fim: s.horario_fim,
        })),
        fields: insertedFields.map((f: any) => ({
          id: f.id, section_id: f.section_id, label: f.label, descricao: f.descricao,
          tipo: f.tipo, ordem: f.ordem, obrigatorio: f.obrigatorio, peso: f.peso,
          nota_maxima: f.nota_maxima, penalidade_reprovacao: f.penalidade_reprovacao,
          impacta_score: f.impacta_score, criticidade: f.criticidade,
          gera_contingencia: f.gera_contingencia, exige_evidencia: f.exige_evidencia,
          tipo_evidencia: f.tipo_evidencia, opcoes: f.opcoes, opcoes_regras: f.opcoes_regras,
          condicao_visibilidade: f.condicao_visibilidade, validacao: f.validacao,
          formula: f.formula, visivel_para: f.visivel_para, editavel_por: f.editavel_por,
          aprovador_verificar: f.aprovador_verificar, aprovador_pergunta: f.aprovador_pergunta,
          aprovador_tipo_resposta: f.aprovador_tipo_resposta, aprovador_peso: f.aprovador_peso,
          aprovador_obriga_observacao_nao: f.aprovador_obriga_observacao_nao,
          aprovador_exige_evidencia_nao: f.aprovador_exige_evidencia_nao,
          aprovador_tipos_evidencia: f.aprovador_tipos_evidencia,
        })),
      };

      // 4) cria assignment imediato para o avaliado (executor + recebe nota)
      const assignPayload: any = {
        template_id: templateId,
        responsavel_id: avaliadoId,
        data_prevista: dataPrevista,
        horario_limite: horarioLimite || null,
        status: "pendente",
        created_by: profile.id,
        avaliador_id: requerValidacao && validadorMode === "individual" ? validadorId : null,
        avaliado_id: avaliadoId,
        aprovador_id: aprovacaoAtiva && aprovadorMode === "individual" ? aprovadorId : null,
        validador_contingencia_id: planoAcaoEnabled && planoAcaoMode === "individual" ? planoAcaoId : null,
        setor_avaliador_id: requerValidacao && validadorMode === "setor" ? validadorSetorId : null,
        setor_executor_id: setorId || null,
        template_versao: 1,
        template_snapshot: snapshot,
        rodada_atual: 1,
      };
      const { error: assignErr } = await (supabase as any)
        .from("operational_assignments").insert(assignPayload);
      if (assignErr) throw assignErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operational_assignments"] });
      qc.invalidateQueries({ queryKey: ["operational_templates"] });
      toast.success("Tarefa criada e enviada ao responsável.");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar tarefa"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">Nova Tarefa Individual</DialogTitle>
          {/* Stepper */}
          <div className="flex items-center gap-2 mt-3">
            {[
              { n: 1, label: "Designação", icon: Users },
              { n: 2, label: "Campos", icon: ListChecks },
              { n: 3, label: "Prazo & Notas", icon: Sliders },
            ].map((s, i) => {
              const Icon = s.icon;
              const active = step === s.n;
              const done = step > s.n;
              return (
                <div key={s.n} className="flex items-center gap-2 flex-1">
                  <div className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors flex-1",
                    active && "bg-primary text-primary-foreground border-primary",
                    done && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300/50",
                    !active && !done && "bg-muted text-muted-foreground border-border",
                  )}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{s.n}</span>
                  </div>
                  {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome da tarefa *</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Limpar entrada principal" maxLength={120} />
              </div>

              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes (opcional)" rows={2} maxLength={500} />
              </div>

              {/* Responsáveis */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Responsáveis</Label>
                </div>

                <div className="space-y-1.5">
                  <Label>Avaliado *</Label>
                  <Select value={avaliadoId} onValueChange={setAvaliadoId}>
                    <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                    <SelectContent>
                      {(colaboradores as any[]).map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Pessoa que responde a tarefa e recebe a nota.</p>
                </div>

                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Responsável pelo Plano de Ação</Label>
                      <p className="text-[11px] text-muted-foreground">Quem trata o plano de ação gerado por este formulário. Sem responsável, os campos não poderão "gerar plano de ação" — apenas exigir evidência obrigatória.</p>
                    </div>
                    <Switch checked={requerPlanoAcao} onCheckedChange={setRequerPlanoAcao} />
                  </div>
                  {requerPlanoAcao && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={planoAcaoMode === "individual"} onChange={() => setPlanoAcaoMode("individual")} />
                          Individual
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={planoAcaoMode === "setor"} onChange={() => setPlanoAcaoMode("setor")} />
                          Setorial
                        </label>
                      </div>
                      {planoAcaoMode === "individual" ? (
                        <Select value={planoAcaoId} onValueChange={setPlanoAcaoId} disabled={!avaliadoId}>
                          <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar colaborador..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
                          <SelectContent>
                            {planoAcaoOptions.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={planoAcaoSetorId} onValueChange={setPlanoAcaoSetorId}>
                          <SelectTrigger><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
                          <SelectContent>
                            {(setores as any[]).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Aprovador</Label>
                      <p className="text-[11px] text-muted-foreground">Valida a nota final. Não pode ser o próprio avaliado. Pode ser uma pessoa ou um setor.</p>
                    </div>
                    <Switch checked={requerAprovacao} onCheckedChange={setRequerAprovacao} />
                  </div>
                  {requerAprovacao && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={aprovadorMode === "individual"} onChange={() => setAprovadorMode("individual")} />
                          Individual
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={aprovadorMode === "setor"} onChange={() => setAprovadorMode("setor")} />
                          Setorial
                        </label>
                      </div>
                      {aprovadorMode === "individual" ? (
                        <Select value={aprovadorId} onValueChange={setAprovadorId} disabled={!avaliadoId}>
                          <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar colaborador..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
                          <SelectContent>
                            {aprovadorOptions.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={aprovadorSetorId} onValueChange={setAprovadorSetorId}>
                          <SelectTrigger><SelectValue placeholder="Selecionar setor..." /></SelectTrigger>
                          <SelectContent>
                            {(setores as any[]).map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {isSelfTask && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">Tarefa criada para si mesmo: o aprovador não pode ser você.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Data prevista *</Label>
                  <Input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Horário limite</Label>
                  <Input type="time" value={horarioLimite} onChange={(e) => setHorarioLimite(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">Formulários e Campos</p>
                <Button type="button" size="sm" onClick={() => {
                  const novo = defaultField(sections[0]?.tempId || "", fields.length);
                  novo.label = "";
                  setEditingField(novo);
                  setIsNewField(true);
                }}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Novo Formulário
                </Button>
              </div>

              {fields.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
                  <p className="text-sm">Nenhum campo criado.</p>
                  <p className="text-xs">Clique em "Novo Formulário" para adicionar uma pergunta.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.sort((a, b) => a.ordem - b.ordem).map((field, idx) => {
                    const snapshot: SnapshotField = {
                      id: field.tempId,
                      label: field.label,
                      descricao: field.descricao,
                      tipo: field.tipo,
                      ordem: field.ordem,
                      obrigatorio: field.obrigatorio,
                      peso: field.peso,
                      nota_maxima: field.nota_maxima,
                      penalidade_reprovacao: field.penalidade_reprovacao,
                      impacta_score: field.impacta_score,
                      criticidade: field.criticidade,
                      gera_contingencia: field.gera_contingencia,
                      exige_evidencia: field.exige_evidencia,
                      tipo_evidencia: field.tipo_evidencia,
                      opcoes: field.opcoes as string[],
                      opcoes_regras: field.opcoes_regras as any,
                      validacao: field.validacao,
                      condicao_visibilidade: field.condicao_visibilidade,
                      formula: field.formula,
                      visivel_para: field.visivel_para,
                      editavel_por: field.editavel_por,
                    };
                    return (
                      <div
                        key={field.tempId}
                        className="bg-card border border-border rounded-lg p-3 group hover:border-primary/40 transition-colors space-y-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground font-mono w-5 text-right pt-0.5">{idx + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{FIELD_TYPES[field.tipo] || field.tipo}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-60 group-hover:opacity-100"
                            onClick={() => { setEditingField(field); setIsNewField(false); }}
                            title="Configurar campo (regras, plano de ação, evidências, etc.)"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-60 group-hover:opacity-100"
                            onClick={() => {
                              const copia: FieldForm = { ...field, tempId: crypto.randomUUID(), id: undefined, label: field.label + " (cópia)", ordem: fields.length };
                              setFields(prev => [...prev, copia]);
                            }}
                            title="Duplicar campo"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive opacity-60 group-hover:opacity-100"
                            onClick={() => setFields(prev => prev.filter(f => f.tempId !== field.tempId))}
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <div className="pl-7">
                          <DynamicFieldRenderer
                            field={snapshot}
                            answer={previewAnswers[field.tempId]}
                            userRole="executor"
                            disabled={false}
                            allAnswers={previewAnswers}
                            onChange={(val) => setPreviewAnswers(prev => ({ ...prev, [field.tempId]: val }))}
                            assignmentId="preview"
                            showValidation={false}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {editingField && (
                <FieldDetailDialog
                  field={editingField}
                  setores={setores as any[]}
                  planoAcaoEnabled={planoAcaoEnabled}
                  onSave={(updates) => {
                    if (isNewField) {
                      setFields(prev => [...prev, { ...editingField, ...updates }]);
                    } else {
                      setFields(prev => prev.map(f => f.tempId === editingField.tempId ? { ...f, ...updates } : f));
                    }
                    setEditingField(null);
                    setIsNewField(false);
                  }}
                  onClose={() => { setEditingField(null); setIsNewField(false); }}
                />
              )}
            </div>
          )}

          {step === 3 && (() => {
            const uniqueAprovadorFields = fields.filter(f => f.aprovador_verificar && f.aprovador_pergunta?.trim());
            const temPerguntasAprovador = uniqueAprovadorFields.length > 0;
            const autoQuestions = [
              { label: "Tarefa executada fora do prazo?", pontos: penalidadeForaPrazo, set: setPenalidadeForaPrazo, defaultKey: "penalidade_fora_prazo" as const },
              { label: "Houve plano de ação nesta tarefa?", pontos: penalidadeContingencia, set: setPenalidadeContingencia, defaultKey: "penalidade_contingencia" as const },
              { label: "Plano de Ação resolvido dentro do prazo?", pontos: penalidadeSlaContingencia, set: setPenalidadeSlaContingencia, defaultKey: "penalidade_sla_contingencia" as const },
            ];
            const totalPenalidades = habilitarPerguntasAutomaticas ? autoQuestions.reduce((s, q) => s + q.pontos, 0) : 0;
            const totalCampos = uniqueAprovadorFields.reduce((s, f) => s + f.aprovador_peso, 0);
            const totalGeral = totalCampos + totalPenalidades;

            const setAsDefault = (key: keyof WorkflowDefaults, value: number) => {
              const current = loadDefaults();
              saveDefaults({ ...current, [key]: value });
              toast.success(`Valor padrão atualizado: ${value} pontos`);
            };

            return (
              <div className="space-y-4">
                {/* Aviso quando não há perguntas de aprovador */}
                {!temPerguntasAprovador && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Tarefa sem pontuação</p>
                      <p>Esta tarefa não terá nota nem etapa de aprovação porque não há perguntas configuradas para o aprovador responder. Será criada apenas como lembrete. Para habilitar pontuação, volte à etapa <strong>Campos</strong> e ative <em>"Aprovador deve verificar"</em> em pelo menos um campo.</p>
                    </div>
                  </div>
                )}

                {/* Alerta quando ultrapassa 100 pontos */}
                {temPerguntasAprovador && totalGeral > 100 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Pontuação acima do limite</p>
                      <p>O total de pontos é <strong>{totalGeral}</strong> e ultrapassa o limite recomendado de <strong>100</strong>. Você ainda pode prosseguir, mas considere revisar os pesos.</p>
                    </div>
                  </div>
                )}

                {/* Perguntas de Aprovação Final — replica TabWorkflow */}
                <div className={cn("bg-muted/50 rounded-lg border border-border p-4 space-y-4", !temPerguntasAprovador && "opacity-50 pointer-events-none")}>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Perguntas de Aprovação Final</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {autoQuestions.map((q) => (
                      <div key={q.defaultKey} className="space-y-1.5">
                        <Label className="text-xs">
                          {q.defaultKey === "penalidade_fora_prazo" && "Penalidade fora do prazo (pontos)"}
                          {q.defaultKey === "penalidade_contingencia" && "Penalidade por plano de ação (pontos)"}
                          {q.defaultKey === "penalidade_sla_contingencia" && "Penalidade SLA plano de ação (pontos)"}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={q.pontos}
                          onChange={(e) => q.set(+e.target.value || 0)}
                        />
                        <p className="text-[10px] text-muted-foreground">Padrão definido em Rotinas Operacionais.</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Switch checked={habilitarPerguntasAutomaticas} onCheckedChange={setHabilitarPerguntasAutomaticas} />
                    <div>
                      <Label className="cursor-pointer text-sm">Habilitar perguntas automáticas na aprovação</Label>
                      <p className="text-[11px] text-muted-foreground">Gera automaticamente perguntas sobre prazo, plano de ação e SLA na aprovação final.</p>
                    </div>
                  </div>

                  {/* Tabela unificada de pontuação */}
                  <div className="border border-border rounded-lg overflow-hidden mt-3 bg-card">
                    <div className="bg-muted px-3 py-2">
                      <p className="text-xs font-semibold">Resumo de Pontuação</p>
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px] text-center text-xs">#</TableHead>
                          <TableHead className="text-xs">Pergunta / Campo</TableHead>
                          <TableHead className="w-[100px] text-center text-xs">Tipo</TableHead>
                          <TableHead className="w-[80px] text-right text-xs">Pontos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {habilitarPerguntasAutomaticas && autoQuestions.map((q, i) => (
                          <TableRow key={`auto-${i}`} className="bg-destructive/5">
                            <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="text-xs font-medium">{q.label}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="destructive" className="text-[10px]">Automática</Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-destructive">-{q.pontos}</TableCell>
                          </TableRow>
                        ))}

                        {habilitarPerguntasAutomaticas && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={3} className="text-[10px] font-medium text-right text-muted-foreground">Subtotal Penalidades</TableCell>
                            <TableCell className="text-right text-xs font-bold text-destructive">-{totalPenalidades}</TableCell>
                          </TableRow>
                        )}

                        {uniqueAprovadorFields.map((f, i) => {
                          const idx = (habilitarPerguntasAutomaticas ? autoQuestions.length : 0) + i + 1;
                          return (
                            <TableRow key={f.tempId}>
                              <TableCell className="text-center text-xs text-muted-foreground">{idx}</TableCell>
                              <TableCell className="text-xs">
                                <div className="font-medium">{f.aprovador_pergunta}</div>
                                <div className="text-[10px] text-muted-foreground">Campo: {f.label || "(sem nome)"}</div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="text-[10px]">Aprovador</Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">{f.aprovador_peso}</TableCell>
                            </TableRow>
                          );
                        })}

                        {uniqueAprovadorFields.length > 0 && (
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={3} className="text-[10px] font-medium text-right text-muted-foreground">Subtotal Campos</TableCell>
                            <TableCell className="text-right text-xs font-bold">{totalCampos}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={3} className="text-xs font-bold text-right">Pontos Totais</TableCell>
                          <TableCell className="text-right text-xs font-bold">{totalGeral}</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>

                    {uniqueAprovadorFields.length === 0 && !habilitarPerguntasAutomaticas && (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        Configure perguntas para o aprovador na aba "Campos".
                      </div>
                    )}
                  </div>
                </div>

                {/* Resumo */}
                <div className="bg-muted/40 border border-border rounded-md p-3 space-y-1">
                  <p className="text-xs font-semibold text-foreground">Resumo</p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p><strong>Tarefa:</strong> {nome || "—"}</p>
                    <p><strong>Avaliado:</strong> {(colaboradores as any[]).find((c) => c.id === avaliadoId)?.nome || "—"}</p>
                    <p><strong>Data:</strong> {dataPrevista} • limite {horarioLimite}</p>
                    <p><strong>Pontuação:</strong> {temPerguntasAprovador ? `Ativa — ${totalGeral} pontos totais` : "Desativada (lembrete)"}</p>
                    <p><strong>Aprovação:</strong> {temPerguntasAprovador && requerAprovacao ? ((colaboradores as any[]).find((c) => c.id === aprovadorId)?.nome || "—") : "Não"}</p>
                    <p><strong>Campos:</strong> {fields.length} em {sections.length} seção(ões)</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between gap-2 shrink-0 bg-card">
          <Button
            type="button"
            variant="outline"
            onClick={() => step === 1 ? onOpenChange(false) : setStep((step - 1) as Step)}
            disabled={create.isPending}
          >
            {step === 1 ? "Cancelar" : (<><ChevronLeft className="w-4 h-4 mr-1" />Voltar</>)}
          </Button>

          {step < 3 ? (
            <Button
              type="button"
              onClick={() => setStep((step + 1) as Step)}
              disabled={(step === 1 && !canAdvanceStep1) || (step === 2 && !canAdvanceStep2)}
            >
              Avançar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Criando…</> : <><Check className="w-4 h-4 mr-1.5" />Criar Tarefa</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
