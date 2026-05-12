import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Check, ListChecks, Users, Sliders, Loader2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldDetailDialog, TabFormBuilder, type AgrupadorExtra } from "@/modules/tarefas/components/tarefas_tabFormBuilder";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DynamicFieldRenderer, SnapshotField } from "@/modules/tarefas/components/tarefas_dynamicFieldRenderer";
import { FIELD_TYPES, SectionForm, FieldForm, defaultSection, getLocalToday, defaultTemplate } from "@/modules/tarefas/types/tarefas_types";
import { cn } from "@/lib/utils";
import { defaultField } from "@/modules/tarefas/types/tarefas_types";
import { Plus, Trash2, Settings2, Copy, Settings, AlertCircle, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DEFAULT_SOLICITACAO_CONFIG, type SolicitacaoConfig } from "@/modules/tarefas/services/tarefas_solicitacaoConfig";

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
  /** Setor pré-selecionado no wizard inicial (trava o campo Setor no Step 1 e filtra avaliados). */
  initialSetorId?: string;
  /**
   * Contexto de origem da criação:
   * - "rotina": permite ativar recorrência (vira rotina em /tarefas/rotinas).
   * - "avulsa": oculta bloco de recorrência e força origem='ad_hoc'. Usado pelo botão "+" de /tarefas/minhas.
   * Default "rotina" para compat com chamadas existentes.
   */
  origemContexto?: "rotina" | "avulsa";
}

type Step = 1 | 2 | 3;

export default function QuickTaskDialog({ open, onOpenChange, defaultAvaliadoId, taskType = "inspecao", initialSetorId = "", origemContexto = "rotina" }: Props) {
  const isAvulsa = origemContexto === "avulsa";
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [setorId, setSetorId] = useState("");
  const [dataPrevista, setDataPrevista] = useState(getLocalToday());
  const [horarioLimite, setHorarioLimite] = useState("18:00");
  // Modo de horário (apenas para inspeção): "global" usa horarioLimite p/ tudo;
  // "individual" desabilita horarioLimite e exige horário por etapa OU por pergunta.
  const [horarioModo, setHorarioModo] = useState<"global" | "individual">("global");
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

  // Fase 1B.3 — Fluxo Operacional (somente avulsa). Persistido em template_snapshot.solicitacao_config.
  const [solicitacaoConfig, setSolicitacaoConfig] = useState<SolicitacaoConfig>(DEFAULT_SOLICITACAO_CONFIG);
  const updateSolicitacaoConfig = (patch: Partial<SolicitacaoConfig>) =>
    setSolicitacaoConfig((prev) => ({ ...prev, ...patch }));

  // Configurações extras por agrupador (apenas modo etapas). Vão em template_snapshot.agrupadores_config[].
  // Responsável/status próprio por etapa: chaves reservadas no JSON, NÃO ativadas nesta fase.
  const [agrupadorExtras, setAgrupadorExtras] = useState<Record<string, AgrupadorExtra>>({});
  // Toggle "Opções avançadas" do Step 1 (título/descrição manuais).
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const reset = () => {
    setStep(1);
    setNome(""); setDescricao(""); setSetorId(initialSetorId || "");
    setDataPrevista(getLocalToday()); setHorarioLimite("18:00"); setHorarioModo("global");
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
    setSolicitacaoConfig(DEFAULT_SOLICITACAO_CONFIG);
    setAgrupadorExtras({});
    setAdvancedOpen(false);
  };

  useEffect(() => {
    if (open) {
      reset();
      const s = defaultSection(0);
      s.nome = "Itens da tarefa";
      setSections([s]);
      // Pré-seleciona o avaliado quando há um default (visão admin de outro user)
      if (defaultAvaliadoId) setAvaliadoId(defaultAvaliadoId);
    }
  }, [open, defaultAvaliadoId]);

  // Em contexto avulsa: blindagem — recorrência sempre desligada.
  useEffect(() => {
    if (isAvulsa && recorrenciaAtiva) setRecorrenciaAtiva(false);
  }, [isAvulsa, recorrenciaAtiva]);

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

  // Vínculos colaborador↔setor para filtrar "Quem recebe a nota" pelo Setor da Rotina
  const { data: colaboradorSetores = [] } = useQuery({
    queryKey: ["colaborador_setores_quicktask"],
    queryFn: async () => {
      const { data, error } = await supabase.from("colaborador_setores").select("profile_id, setor_id");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Lista de colaboradores filtrada pelo setor da rotina (se selecionado)
  const avaliadoOptions = useMemo(() => {
    if (!setorId) return colaboradores as any[];
    const idsDoSetor = new Set(
      (colaboradorSetores as any[])
        .filter((cs) => cs.setor_id === setorId)
        .map((cs) => cs.profile_id)
    );
    return (colaboradores as any[]).filter((c) => idsDoSetor.has(c.id));
  }, [colaboradores, colaboradorSetores, setorId]);

  // Se o setor mudar e o avaliado atual não pertencer mais a ele, limpa seleção
  useEffect(() => {
    if (!setorId || !avaliadoId) return;
    if (!avaliadoOptions.some((c: any) => c.id === avaliadoId)) {
      setAvaliadoId("");
    }
  }, [setorId, avaliadoId, avaliadoOptions]);

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

  // Derivação automática do título da tarefa.
  // Prioridade: override manual (nome) → primeiro agrupador → primeira pergunta → fallback.
  const derivedNome = useMemo(() => {
    const t = nome.trim();
    if (t) return t;
    const s0 = sections[0]?.nome?.trim();
    if (s0 && s0 !== "Itens da tarefa") return s0;
    const f0 = fields[0]?.label?.trim();
    if (f0) return f0;
    if (s0) return s0; // "Itens da tarefa" como último recurso de seção
    return "Tarefa sem título";
  }, [nome, sections, fields]);

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

  // Validação do builder (modo individual em etapas):
  // cada etapa precisa de horário próprio OU todas as perguntas com horário.
  const horarioValidationError = useMemo(() => {
    if (taskType === "simples" || horarioModo === "global") return null;
    for (const sec of sections) {
      const secHasTime = !!(sec.horario_inicio && sec.horario_fim);
      if (secHasTime) continue;
      const secFields = fields.filter(f => f.sectionTempId === sec.tempId);
      if (secFields.length === 0) continue;
      const allFieldsHaveTime = secFields.every(f => f.validacao?.horario_inicio && f.validacao?.horario_fim);
      if (!allFieldsHaveTime) {
        return `Etapa "${sec.nome || "(sem nome)"}" precisa de horário no título OU horário em todas as perguntas.`;
      }
    }
    return null;
  }, [sections, fields, horarioModo, taskType]);

  // Step 1 = Estrutura (builder). Step 2 = Designação. Step 3 = Prazos & Notas.
  const canAdvanceStep1 = fields.length > 0 && !horarioValidationError;
  const canAdvanceStep2 = !!avaliadoId
    && !!dataPrevista
    && planoAcaoOk
    && aprovadorOk;

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

      // 1) cria template (ad-hoc se única; rotina recorrente se ativa)
      const templatePayload: any = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        tipo_execucao: taskType === "simples" ? "tarefa_simples" : "checklist_inspecao",
        setor_id: setorId || null,
        responsavel_id: avaliadoId,
        recorrencia_tipo: recorrenciaAtiva ? recorrenciaTipo : "unica",
        dias_da_semana: recorrenciaAtiva && recorrenciaTipo === "semanal" ? recorrenciaDias : null,
        data_inicio: dataPrevista,
        data_fim: recorrenciaAtiva ? (recorrenciaDataFim || null) : dataPrevista,
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
        // Recorrente vai pra "Rotinas Operacionais" (origem rotina); pontual permanece ad_hoc
        // Tarefa avulsa (botão "+" da Minhas Tarefas) NUNCA vira rotina.
        origem: isAvulsa ? "ad_hoc" : (recorrenciaAtiva ? "rotina" : "ad_hoc"),
        // NOTE: operational_templates não possui coluna created_by.
        // Autoria do criador é registrada em operational_assignments.created_by (linha abaixo).
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
        // Fase 1B.3 — Fluxo Operacional para tarefa avulsa (sem migration; lido em runtime).
        ...(isAvulsa ? { solicitacao_config: solicitacaoConfig } : {}),
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
      toast.success(
        recorrenciaAtiva
          ? "Rotina criada! Template adicionado em Rotinas Operacionais e tarefa de hoje enviada ao responsável."
          : "Tarefa criada e enviada ao responsável."
      );
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao criar tarefa"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">
            {taskType === "simples" ? "Nova Tarefa Simples" : "Nova Inspeção por Etapa"}
          </DialogTitle>
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
                  <Label>Setor da tarefa {initialSetorId ? "" : "(opcional)"}</Label>
                  <Select value={setorId || "__none"} onValueChange={(v) => setSetorId(v === "__none" ? "" : v)} disabled={!!initialSetorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar setor..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem setor</SelectItem>
                      {(setores as any[]).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {initialSetorId && (
                    <p className="text-[10px] text-muted-foreground">Setor definido no passo anterior.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Avaliado *</Label>
                  <Select value={avaliadoId} onValueChange={setAvaliadoId}>
                    <SelectTrigger><SelectValue placeholder={setorId && avaliadoOptions.length === 0 ? "Nenhum colaborador no setor" : "Selecionar..."} /></SelectTrigger>
                    <SelectContent>
                      {avaliadoOptions.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    {setorId
                      ? "Lista filtrada pelos colaboradores vinculados ao setor."
                      : "Pessoa que responde a tarefa e recebe a nota."}
                  </p>
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
                  <Label>{recorrenciaAtiva ? "Início *" : "Data prevista *"}</Label>
                  <Input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Horário limite {horarioModo === "individual" && taskType !== "simples" ? "(desabilitado — modo individual)" : ""}</Label>
                  <Input
                    type="time"
                    value={horarioLimite}
                    onChange={(e) => setHorarioLimite(e.target.value)}
                    disabled={horarioModo === "individual" && taskType !== "simples"}
                  />
                </div>
              </div>

              {/* Modo de horário (apenas inspeção) */}
              {taskType !== "simples" && (
                <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/30">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Label className="text-sm font-semibold">Modo de horário das etapas</Label>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={horarioModo === "global"} onChange={() => setHorarioModo("global")} />
                          <span><strong>Global</strong> — todas as etapas seguem o "Horário limite" acima</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={horarioModo === "individual"} onChange={() => setHorarioModo("individual")} />
                          <span><strong>Individual por etapa</strong> — cada etapa (ou cada pergunta) tem seu próprio horário</span>
                        </label>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        No modo individual, o "Horário limite" da designação fica desabilitado. Em cada etapa: defina horário no título da etapa OU defina horário em <strong>todas</strong> as perguntas dessa etapa. Atrasos serão registrados individualmente.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Recorrência (opcional) — oculta em contexto avulsa (botão "+" da Minhas Tarefas) */}
              {isAvulsa ? (
                <div className="border border-dashed border-border rounded-lg p-3 bg-muted/20">
                  <p className="text-[11px] text-muted-foreground">
                    Tarefa avulsa: não vira rotina. Para criar rotina recorrente, use a tela <strong>Rotinas Operacionais</strong>.
                  </p>
                </div>
              ) : (
                <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm font-semibold">Recorrência</Label>
                      <p className="text-[11px] text-muted-foreground">Se ativada, esta tarefa vira uma rotina e aparecerá em <strong>Rotinas Operacionais</strong>. A tarefa de hoje também é gerada automaticamente.</p>
                    </div>
                    <Switch checked={recorrenciaAtiva} onCheckedChange={setRecorrenciaAtiva} />
                  </div>
                  {recorrenciaAtiva && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Frequência</Label>
                        <Select value={recorrenciaTipo} onValueChange={(v: any) => setRecorrenciaTipo(v)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="diaria">Diária</SelectItem>
                            <SelectItem value="semanal">Semanal (escolher dias)</SelectItem>
                            <SelectItem value="mensal">Mensal (mesmo dia do mês)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {recorrenciaTipo === "semanal" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Dias da semana</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((d, i) => {
                              const active = recorrenciaDias.includes(i);
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setRecorrenciaDias(prev => active ? prev.filter(x => x !== i) : [...prev, i].sort())}
                                  className={cn(
                                    "h-9 min-w-[44px] px-3 rounded-md border text-xs font-medium transition-colors",
                                    active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:border-primary/50"
                                  )}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Data fim (opcional)</Label>
                        <Input type="date" value={recorrenciaDataFim} onChange={(e) => setRecorrenciaDataFim(e.target.value)} placeholder="Sem fim" />
                        <p className="text-[10px] text-muted-foreground">Deixe em branco para rotina contínua.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Fase 1B.3 — Fluxo Operacional (apenas avulsa) */}
              {isAvulsa && (
                <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div>
                    <Label className="text-sm font-semibold">Fluxo Operacional</Label>
                    <p className="text-[11px] text-muted-foreground">Como o executor recebe e devolve esta tarefa avulsa. Persistido no snapshot da tarefa.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.exige_aceite_executor}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ exige_aceite_executor: v })}
                      />
                      <span><strong>Exige aceite do executor</strong><br /><span className="text-muted-foreground">Tarefa abre como "Aguardando aceite".</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.exige_validacao_solicitante}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ exige_validacao_solicitante: v })}
                      />
                      <span><strong>Exige validação do solicitante</strong><br /><span className="text-muted-foreground">Após o executor responder, eu valido antes de fechar.</span></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.permite_devolver}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ permite_devolver: v })}
                      />
                      <span><strong>Permite devolver ao executor</strong></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.permite_plano_acao}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ permite_plano_acao: v })}
                      />
                      <span><strong>Permite plano de ação</strong></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.renegociacao.permite}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ renegociacao: { ...solicitacaoConfig.renegociacao, permite: v } })}
                      />
                      <span><strong>Permite renegociação de prazo</strong></span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.exige_reauth_reabertura}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ exige_reauth_reabertura: v })}
                      />
                      <span><strong>Exige re-autenticação para reabrir</strong></span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Limite de renegociações</Label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={solicitacaoConfig.renegociacao.limite}
                        onChange={(e) => updateSolicitacaoConfig({ renegociacao: { ...solicitacaoConfig.renegociacao, limite: Math.max(0, +e.target.value || 0) } })}
                        disabled={!solicitacaoConfig.renegociacao.permite}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Janela reabertura (h)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={solicitacaoConfig.janela_reabertura_horas}
                        onChange={(e) => updateSolicitacaoConfig({ janela_reabertura_horas: Math.max(0, +e.target.value || 0) })}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Sem movimento (h, opcional)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Global"
                        value={solicitacaoConfig.sem_movimento_horas ?? ""}
                        onChange={(e) => updateSolicitacaoConfig({ sem_movimento_horas: e.target.value === "" ? null : Math.max(0, +e.target.value || 0) })}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px]">Quem pode reabrir</Label>
                      <Select
                        value={solicitacaoConfig.quem_pode_reabrir}
                        onValueChange={(v: any) => updateSolicitacaoConfig({ quem_pode_reabrir: v })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ambos">Ambos (padrão)</SelectItem>
                          <SelectItem value="solicitante">Apenas solicitante</SelectItem>
                          <SelectItem value="admin">Apenas admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <label className="flex items-end gap-2 text-xs cursor-pointer p-2 rounded border border-border bg-card">
                      <Switch
                        checked={solicitacaoConfig.exigir_justificativa_atraso}
                        onCheckedChange={(v) => updateSolicitacaoConfig({ exigir_justificativa_atraso: v })}
                      />
                      <span><strong>Exigir justificativa em atraso</strong></span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              {horarioValidationError && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-semibold">Horário individual incompleto</p>
                    <p>{horarioValidationError}</p>
                  </div>
                </div>
              )}

              <TabFormBuilder
                sections={sections}
                setSections={setSections}
                fields={fields}
                setFields={setFields}
                setores={setores as any[]}
                tipoExecucao={taskType === "simples" ? "tarefa_simples" : "etapas"}
                requireFieldHorario={taskType !== "simples" && horarioModo === "individual"}
                planoAcaoEnabled={planoAcaoEnabled}
              />
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
