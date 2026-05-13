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
import { getPontuacaoConfig } from "@/modules/tarefas/services/tarefas_pontuacao_config_service";

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
  // Plano de Ação — quem responde quando uma pergunta gerar plano de ação.
  // Fluxo: escolher setor responsável → marcar "qualquer um do setor" OU escolher usuário específico.
  const [planoAcaoSetorId, setPlanoAcaoSetorId] = useState("");
  const [planoAcaoQualquer, setPlanoAcaoQualquer] = useState(true); // default: qualquer um do setor
  const [planoAcaoUsuarioId, setPlanoAcaoUsuarioId] = useState("");
  // Estados legados mantidos como no-op para não quebrar referências no payload (eliminados abaixo).
  const requerPlanoAcao = true;
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
  // DERIVADO da Designação: perguntas automáticas existem se, e somente se, há aprovação final.
  // Sem toggle manual nesta etapa.
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
    setPlanoAcaoResp("avaliado"); setPlanoAcaoUsuarioId("");
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
  // Em contexto avulsa: blindagem — recorrência sempre desligada.
  useEffect(() => {
    if (isAvulsa && recorrenciaAtiva) setRecorrenciaAtiva(false);
  }, [isAvulsa, recorrenciaAtiva]);

  // Sincroniza perguntas automáticas com a Designação (regra única).
  useEffect(() => {
    setHabilitarPerguntasAutomaticas(requerAprovacao);
  }, [requerAprovacao]);

  // Carrega defaults globais de Pontuação/Notas (Configurações → Tarefas → Pontuação).
  // Aplica somente ao abrir o diálogo — edição local na tarefa NÃO altera o padrão global.
  const { data: pontGlobal } = useQuery({
    queryKey: ["tarefas_pontuacao_config"],
    queryFn: getPontuacaoConfig,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (!open || !pontGlobal) return;
    setPenalidadeForaPrazo(pontGlobal.penalidade_fora_prazo);
    setPenalidadeContingencia(pontGlobal.penalidade_contingencia);
    setPenalidadeSlaContingencia(pontGlobal.penalidade_sla_contingencia);
    setPesoNotaMaxima(pontGlobal.nota_maxima);
    setHabilitarPerguntasAutomaticas(pontGlobal.pontuacao_automatica_padrao && requerAprovacao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pontGlobal]);

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
      const { data, error } = await supabase.from("setores").select("id, nome, ativo, responsavel_padrao_id").eq("ativo", true).order("nome");
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

  // Usuários do setor disponíveis para "Plano de Ação → Usuário do setor"
  const planoAcaoUsuariosSetor = useMemo(() => {
    if (!setorId) return [] as any[];
    const ids = new Set((colaboradorSetores as any[]).filter((cs) => cs.setor_id === setorId).map((cs) => cs.profile_id));
    return (colaboradores as any[]).filter((c) => ids.has(c.id));
  }, [colaboradores, colaboradorSetores, setorId]);

  // Responsável padrão do setor selecionado (pode ser null se setor não tiver definido).
  const setorSelecionado = useMemo(() => (setores as any[]).find((s) => s.id === setorId), [setores, setorId]);
  const responsavelPadraoSetorId: string | null = setorSelecionado?.responsavel_padrao_id || null;

  // Resolve para os campos do payload (validador_contingencia_*).
  const { planoAcaoProfileIdResolvido, planoAcaoSetorIdResolvido } = useMemo(() => {
    switch (planoAcaoResp) {
      case "avaliado":
        return { planoAcaoProfileIdResolvido: avaliadoId || null, planoAcaoSetorIdResolvido: null };
      case "usuario_setor":
        return { planoAcaoProfileIdResolvido: planoAcaoUsuarioId || null, planoAcaoSetorIdResolvido: null };
      case "setor_inteiro":
        return { planoAcaoProfileIdResolvido: null, planoAcaoSetorIdResolvido: setorId || null };
      case "responsavel_padrao_setor":
        return { planoAcaoProfileIdResolvido: responsavelPadraoSetorId, planoAcaoSetorIdResolvido: null };
      default:
        return { planoAcaoProfileIdResolvido: null, planoAcaoSetorIdResolvido: null };
    }
  }, [planoAcaoResp, avaliadoId, planoAcaoUsuarioId, setorId, responsavelPadraoSetorId]);

  const planoAcaoOk =
    (planoAcaoResp === "avaliado" && !!avaliadoId) ||
    (planoAcaoResp === "usuario_setor" && !!planoAcaoUsuarioId) ||
    (planoAcaoResp === "setor_inteiro" && !!setorId) ||
    (planoAcaoResp === "responsavel_padrao_setor" && !!responsavelPadraoSetorId);

  // Limpa seleção de usuário se setor mudar e o usuário não pertencer mais ao novo setor.
  useEffect(() => {
    if (planoAcaoUsuarioId && !planoAcaoUsuariosSetor.some((c: any) => c.id === planoAcaoUsuarioId)) {
      setPlanoAcaoUsuarioId("");
    }
  }, [planoAcaoUsuariosSetor, planoAcaoUsuarioId]);

  const aprovadorOk = !requerAprovacao
    || (aprovadorMode === "individual" && !!aprovadorId && aprovadorId !== avaliadoId && (!isSelfTask || aprovadorId !== profile?.id))
    || (aprovadorMode === "setor" && !!aprovadorSetorId);

  const validadorOk = !requerValidacao
    || (validadorMode === "individual" && !!validadorId && validadorId !== avaliadoId)
    || (validadorMode === "setor" && !!validadorSetorId);

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

  // (Removido) cleanup que desabilitava gera_contingencia quando não havia
  // responsável global pelo plano de ação. Agora a regra é por pergunta.

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
    && !!setorId
    && !!dataPrevista
    && planoAcaoOk
    && validadorOk
    && aprovadorOk;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile?.id) throw new Error("Sessão inválida");
      if (!canAdvanceStep1) throw new Error("Adicione ao menos 1 pergunta na estrutura");
      if (!canAdvanceStep2) throw new Error("Preencha os dados de designação");

      // Determinar se a tarefa terá pontuação válida:
      // só pontua se houver perguntas configuradas para o aprovador responder
      const temPerguntasAprovador = fields.some(f => f.aprovador_verificar && f.aprovador_pergunta?.trim());
      const pontuacaoValida = temPerguntasAprovador;
      const aprovacaoAtiva = requerAprovacao && pontuacaoValida;

      // 1) cria template (ad-hoc se única; rotina recorrente se ativa)
      const templatePayload: any = {
        nome: derivedNome,
        descricao: descricao.trim() || null,
        tipo_execucao: taskType === "simples" ? "simples" : "checklist_inspecao",
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
        avaliador_profile_id: requerValidacao && validadorMode === "individual" ? (validadorId || null) : null,
        avaliador_setor_id: requerValidacao && validadorMode === "setor" ? (validadorSetorId || null) : null,
        avaliado_profile_id: avaliadoId,
        aprovador_profile_id: aprovacaoAtiva && aprovadorMode === "individual" ? (aprovadorId || null) : null,
        aprovador_setor_id: aprovacaoAtiva && aprovadorMode === "setor" ? (aprovadorSetorId || null) : null,
        responsavel_contingencia_id: planoAcaoProfileIdResolvido,
        validador_contingencia_profile_id: planoAcaoProfileIdResolvido,
        validador_contingencia_setor_id: planoAcaoSetorIdResolvido,
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
        // Builder único — configs extras por agrupador (SLA próprio, observação).
        // Modo simples: ainda gravamos o array para compatibilidade futura, com herança implícita (sla_horas=null).
        // Responsável/status próprio por etapa: chaves reservadas, NÃO ativadas nesta fase.
        agrupadores_config: insertedSections.map((s: any, idx: number) => {
          const tempId = sections[idx]?.tempId;
          const extra = tempId ? agrupadorExtras[tempId] : undefined;
          return {
            section_id: s.id,
            section_index: idx,
            sla_horas: taskType === "simples" ? null : (extra?.sla_horas ?? null),
            observacao: extra?.observacao || null,
            // reservados (não ativados):
            responsavel_profile_id: null,
            status: null,
          };
        }),
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
        avaliador_id: requerValidacao && validadorMode === "individual" ? (validadorId || null) : null,
        avaliado_id: avaliadoId,
        aprovador_id: aprovacaoAtiva && aprovadorMode === "individual" ? (aprovadorId || null) : null,
        validador_contingencia_id: planoAcaoProfileIdResolvido,
        setor_avaliador_id: requerValidacao && validadorMode === "setor" ? (validadorSetorId || null) : null,
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
              { n: 2, label: "Estrutura", icon: ListChecks },
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
              <p className="text-[11px] text-muted-foreground">
                Título derivado: <strong>{derivedNome}</strong>
                {nome.trim() ? " (override manual ativo)" : ""}
              </p>

              {/* Responsáveis */}
              <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <Label className="text-sm font-semibold">Responsáveis</Label>
                </div>

                <div className="space-y-1.5">
                  <Label>Setor da tarefa *</Label>
                  <Select value={setorId} onValueChange={setSetorId} disabled={!!initialSetorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar setor..." />
                    </SelectTrigger>
                    <SelectContent>
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
                  <Select value={avaliadoId} onValueChange={setAvaliadoId} disabled={!setorId}>
                    <SelectTrigger><SelectValue placeholder={!setorId ? "Selecione o setor primeiro" : (avaliadoOptions.length === 0 ? "Nenhum colaborador no setor" : "Selecionar...")} /></SelectTrigger>
                    <SelectContent>
                      {avaliadoOptions.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Pessoa que responde a tarefa e recebe a nota. Filtrada pelos colaboradores vinculados ao setor.
                  </p>
                </div>

                {/* Plano de Ação — responsável obrigatório (definido na Designação). */}
                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div>
                    <Label className="text-sm">Quem responde Plano de Ação? *</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Quando uma pergunta gerar não conformidade/plano de ação, esta pessoa (ou setor) receberá a pendência em "Minhas Tarefas".
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    <label className={cn("flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1.5", planoAcaoResp === "avaliado" && "border-primary bg-primary/5")}>
                      <input type="radio" checked={planoAcaoResp === "avaliado"} onChange={() => setPlanoAcaoResp("avaliado")} />
                      Próprio avaliado
                    </label>
                    <label className={cn("flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1.5", planoAcaoResp === "usuario_setor" && "border-primary bg-primary/5", !setorId && "opacity-50 cursor-not-allowed")}>
                      <input type="radio" checked={planoAcaoResp === "usuario_setor"} onChange={() => setPlanoAcaoResp("usuario_setor")} disabled={!setorId} />
                      Usuário específico do setor
                    </label>
                    <label className={cn("flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1.5", planoAcaoResp === "setor_inteiro" && "border-primary bg-primary/5", !setorId && "opacity-50 cursor-not-allowed")}>
                      <input type="radio" checked={planoAcaoResp === "setor_inteiro"} onChange={() => setPlanoAcaoResp("setor_inteiro")} disabled={!setorId} />
                      Setor inteiro
                    </label>
                    <label className={cn("flex items-center gap-1.5 cursor-pointer rounded-md border px-2 py-1.5", planoAcaoResp === "responsavel_padrao_setor" && "border-primary bg-primary/5", (!setorId || !responsavelPadraoSetorId) && "opacity-50 cursor-not-allowed")}>
                      <input type="radio" checked={planoAcaoResp === "responsavel_padrao_setor"} onChange={() => setPlanoAcaoResp("responsavel_padrao_setor")} disabled={!setorId || !responsavelPadraoSetorId} />
                      Responsável padrão do setor
                    </label>
                  </div>
                  {planoAcaoResp === "usuario_setor" && (
                    <Select value={planoAcaoUsuarioId} onValueChange={setPlanoAcaoUsuarioId}>
                      <SelectTrigger><SelectValue placeholder={planoAcaoUsuariosSetor.length === 0 ? "Nenhum usuário no setor" : "Selecionar usuário..."} /></SelectTrigger>
                      <SelectContent>
                        {planoAcaoUsuariosSetor.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {planoAcaoResp === "responsavel_padrao_setor" && setorId && !responsavelPadraoSetorId && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Este setor não possui responsável padrão definido. Configure em Setores ou escolha outra opção.
                    </p>
                  )}
                  {planoAcaoResp === "responsavel_padrao_setor" && responsavelPadraoSetorId && (
                    <p className="text-[10px] text-muted-foreground">
                      Será atribuído a: {(colaboradores as any[]).find((c) => c.id === responsavelPadraoSetorId)?.nome || "—"}
                    </p>
                  )}
                </div>

                <div className="border-t border-border/60 pt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm">Avaliação técnica (quem confere a execução?)</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Confere se a tarefa foi feita corretamente. Pode confirmar, devolver com observação ou solicitar ajuste. <strong>Não aplica nota.</strong> Não pode ser o próprio avaliado.
                      </p>
                    </div>
                    <Switch checked={requerValidacao} onCheckedChange={setRequerValidacao} />
                  </div>
                  {requerValidacao && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={validadorMode === "individual"} onChange={() => setValidadorMode("individual")} />
                          Individual
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" checked={validadorMode === "setor"} onChange={() => setValidadorMode("setor")} />
                          Setorial
                        </label>
                      </div>
                      {validadorMode === "individual" ? (
                        <Select value={validadorId} onValueChange={setValidadorId} disabled={!avaliadoId}>
                          <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar conferente..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
                          <SelectContent>
                            {validadorOptions.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={validadorSetorId} onValueChange={setValidadorSetorId}>
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
                      <Label className="text-sm">Aprovação final e pontuação (quem aprova e pontua?)</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Faz a aprovação final, aplica nota e penalidades automáticas. Não pode ser o próprio avaliado. Pode ser uma pessoa ou um setor.
                      </p>
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
                          <SelectTrigger><SelectValue placeholder={avaliadoId ? "Selecionar aprovador..." : "Escolha o avaliado primeiro"} /></SelectTrigger>
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

              {/* (Removido) Bloco "Fluxo Operacional" da avulsa.
                  Os toggles antigos (exige_aceite_executor, exige_validacao_solicitante,
                  permite_devolver, permite_plano_acao, renegociacao, etc.) saíram da UI
                  para alinhar ao novo conceito de conformidade por item.
                  O JSON `solicitacao_config` continua sendo gravado com os defaults
                  preservados (DEFAULT_SOLICITACAO_CONFIG) para compatibilidade de leitura
                  com tarefas avulsas legadas. */}
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
                planoAcaoEnabled={true}
                agrupadorExtras={agrupadorExtras}
                setAgrupadorExtras={setAgrupadorExtras}
                aprovacaoFinalEnabled={requerAprovacao}
                hideEtapaHorario={horarioModo === "global"}
              />

              {/* Opções avançadas — título manual e descrição (recolhido) */}
              <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground">
                    <ChevronDown className={cn("w-3.5 h-3.5 mr-1 transition-transform", advancedOpen && "rotate-180")} />
                    Opções avançadas (título manual, descrição)
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-2 border-t border-border mt-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Título manual (opcional — sobrescreve a derivação)</Label>
                    <Input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder={`Auto: "${derivedNome}"`}
                      maxLength={120}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Em branco → usa o nome do primeiro agrupador → primeira pergunta → "Tarefa sem título".
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição (opcional)</Label>
                    <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Detalhes da tarefa" rows={2} maxLength={500} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
            // Pontuação só aparece quando há aprovador ativo OU perguntas configuradas OU automáticas habilitadas.
            // Regra única: a existência de pontuação/perguntas automáticas/penalidades nasce
            // SOMENTE da etapa Designação ("Aprovação final e pontuação").
            const mostrarPontuacao = requerAprovacao;

            const setAsDefault = (key: keyof WorkflowDefaults, value: number) => {
              const current = loadDefaults();
              saveDefaults({ ...current, [key]: value });
              toast.success(`Valor padrão atualizado: ${value} pontos`);
            };

            return (
              <div className="space-y-4">
                {/* Aviso: aprovador ativo mas sem perguntas configuradas */}
                {requerAprovacao && !temPerguntasAprovador && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Aprovador sem perguntas de pontuação</p>
                      <p>O aprovador foi designado mas nenhum campo está marcado como <em>"Aprovador deve verificar"</em>. Volte à etapa <strong>Estrutura</strong> para configurar perguntas de pontuação, ou use as perguntas automáticas abaixo.</p>
                    </div>
                  </div>
                )}

                {/* Aviso: tarefa sem nenhuma pontuação configurada */}
                {!mostrarPontuacao && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-muted/40">
                    <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">Tarefa sem nota nem aprovação</p>
                      <p>Esta tarefa será criada apenas como execução/lembrete, com prazo e SLA operacional. Para habilitar pontuação, ative <strong>"Aprovação final e pontuação"</strong> na etapa <strong>Designação</strong>.</p>
                    </div>
                  </div>
                )}

                {/* Alerta quando ultrapassa 100 pontos */}
                {mostrarPontuacao && totalGeral > 100 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Pontuação acima do limite</p>
                      <p>O total de pontos é <strong>{totalGeral}</strong> e ultrapassa o limite recomendado de <strong>100</strong>. Você ainda pode prosseguir, mas considere revisar os pesos.</p>
                    </div>
                  </div>
                )}

                {/* Perguntas de Aprovação Final — só renderiza quando há pontuação ativa */}
                {mostrarPontuacao && (
                <div className="bg-muted/50 rounded-lg border border-border p-4 space-y-4">
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

                  {/* Toggle removido — perguntas automáticas são derivadas de "Aprovação final e pontuação" (Designação). */}

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
                            <TableCell className="text-center text-xs"><Badge variant="outline" className="text-[10px]">Automática</Badge></TableCell>
                            <TableCell className="text-right text-xs">{q.pontos}</TableCell>
                          </TableRow>
                        ))}
                        {uniqueAprovadorFields.map((f, i) => (
                          <TableRow key={`field-${f.tempId}`}>
                            <TableCell className="text-center text-xs text-muted-foreground">{(habilitarPerguntasAutomaticas ? autoQuestions.length : 0) + i + 1}</TableCell>
                            <TableCell className="text-xs">{f.aprovador_pergunta}</TableCell>
                            <TableCell className="text-center text-xs"><Badge variant="secondary" className="text-[10px]">{f.aprovador_tipo_resposta}</Badge></TableCell>
                            <TableCell className="text-right text-xs">{f.aprovador_peso}</TableCell>
                          </TableRow>
                        ))}
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
                )}

                {/* Resumo */}
                <div className="bg-muted/40 border border-border rounded-md p-3 space-y-1">
                  <p className="text-xs font-semibold text-foreground">Resumo</p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <p><strong>Tarefa:</strong> {derivedNome}</p>
                    <p><strong>Avaliado:</strong> {(colaboradores as any[]).find((c) => c.id === avaliadoId)?.nome || "—"}</p>
                    <p><strong>Data:</strong> {dataPrevista} • limite {horarioLimite}</p>
                    <p><strong>Avaliador (conferência):</strong> {requerValidacao
                      ? (validadorMode === "individual"
                          ? ((colaboradores as any[]).find((c) => c.id === validadorId)?.nome || "—")
                          : ((setores as any[]).find((s) => s.id === validadorSetorId)?.nome || "—") + " (setor)")
                      : "Não"}</p>
                    <p><strong>Aprovador (pontuação):</strong> {requerAprovacao
                      ? (aprovadorMode === "individual"
                          ? ((colaboradores as any[]).find((c) => c.id === aprovadorId)?.nome || "—")
                          : ((setores as any[]).find((s) => s.id === aprovadorSetorId)?.nome || "—") + " (setor)")
                      : "Não"}</p>
                    <p><strong>Pontuação:</strong> {mostrarPontuacao ? `Ativa — ${totalGeral} pontos totais` : "Desativada (lembrete)"}</p>
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
              disabled={(step === 1 && !canAdvanceStep2) || (step === 2 && !canAdvanceStep1)}
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
