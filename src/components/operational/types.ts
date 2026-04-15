export interface StepForm {
  id?: string;
  tempId: string;
  nome: string;
  ordem: number;
  peso: number;
  horario_inicio: string;
  horario_fim: string;
  prazo_limite_minutos: number | null;
  exige_foto: boolean;
  exige_observacao: boolean;
  exige_video: boolean;
}

export interface SectionForm {
  id?: string;
  tempId: string;
  nome: string;
  descricao: string;
  peso: number;
  ordem: number;
  cor: string;
  horario_inicio: string;
  horario_fim: string;
}

export interface OpcaoRegra {
  valor: string;
  label: string;
  cor: string;
  requer_descricao: boolean;
  requer_evidencia: boolean;
  gera_contingencia: boolean;
}

export const getDefaultOpcoesRegras = (tipo: string): OpcaoRegra[] => {
  if (tipo === "conforme") return [
    { valor: "conforme", label: "Conforme", cor: "success", requer_descricao: false, requer_evidencia: false, gera_contingencia: false },
    { valor: "nao_conforme", label: "Não Conforme", cor: "destructive", requer_descricao: true, requer_evidencia: false, gera_contingencia: false },
    { valor: "na", label: "N/A", cor: "muted", requer_descricao: false, requer_evidencia: false, gera_contingencia: false },
  ];
  if (tipo === "sim_nao") return [
    { valor: "sim", label: "Sim", cor: "success", requer_descricao: false, requer_evidencia: false, gera_contingencia: false },
    { valor: "nao", label: "Não", cor: "destructive", requer_descricao: true, requer_evidencia: false, gera_contingencia: false },
    { valor: "na", label: "N/A", cor: "muted", requer_descricao: false, requer_evidencia: false, gera_contingencia: false },
  ];
  if (tipo === "nota_avaliacao") return [
    { valor: "aprovado", label: "Aprovado (≥ mínimo)", cor: "success", requer_descricao: false, requer_evidencia: false, gera_contingencia: false },
    { valor: "reprovado", label: "Reprovado (< mínimo)", cor: "destructive", requer_descricao: true, requer_evidencia: false, gera_contingencia: false },
  ];
  return [];
};

export interface FieldForm {
  id?: string;
  tempId: string;
  sectionTempId: string;
  label: string;
  descricao: string;
  tipo: string;
  ordem: number;
  obrigatorio: boolean;
  peso: number;
  nota_maxima: number;
  penalidade_reprovacao: number;
  impacta_score: boolean;
  criticidade: string;
  gera_contingencia: boolean;
  exige_evidencia: boolean;
  tipo_evidencia: string;
  opcoes: any[];
  opcoes_regras: OpcaoRegra[];
  validacao: any;
  condicao_visibilidade: any;
  formula: any;
  visivel_para: string[];
  editavel_por: string[];
  // Pergunta do aprovador
  aprovador_verificar: boolean;
  aprovador_pergunta: string;
  aprovador_tipo_resposta: string;
  aprovador_peso: number;
  aprovador_obriga_observacao_nao: boolean;
  aprovador_exige_evidencia_nao: boolean;
  aprovador_tipos_evidencia: string[];
}

export interface TemplateForm {
  nome: string;
  descricao: string;
  tipo_execucao: string;
  setor_id: string;
  responsavel_id: string;
  recorrencia_tipo: string;
  dias_da_semana: number[];
  intervalo_dias: number;
  pular_semanas: number;
  dia_fixo_mes: number | null;
  data_inicio: string;
  data_fim: string;
  repetir_sempre: boolean;
  horario_inicio_previsto: string;
  horario_limite_execucao: string;
  tolerancia_minutos: number;
  sla_horas: number;
  gerar_contingencia_automatica: boolean;
  prazo_sla_correcao_horas: number;
  requer_aprovacao_gestor: boolean;
  bloquear_fechamento_com_contingencia: boolean;
  permite_devolucao_parcial: boolean;
  executor_profile_id: string;
  executor_setor_id: string;
  avaliador_profile_id: string;
  avaliador_setor_id: string;
  avaliado_profile_id: string;
  avaliado_setor_id: string;
  aprovador_profile_id: string;
  aprovador_setor_id: string;
  validador_contingencia_profile_id: string;
  validador_contingencia_setor_id: string;
  modo_pontuacao: string;
  destino_score: string;
  peso_recorrencia: number;
  tipo_atribuicao_avaliado: string;
  penalidade_contingencia: number;
  penalidade_sla_contingencia: number;
  penalidade_fora_prazo: number;
  habilitar_perguntas_automaticas: boolean;
}

export const FIELD_TYPES: Record<string, string> = {
  conforme: "Conforme / Não Conforme",
  sim_nao: "Sim / Não",
  nota_avaliacao: "Nota (numérica)",
  texto: "Texto livre",
  numero: "Número",
  data: "Data",
  hora: "Hora",
  select: "Seleção (opções)",
  multi_select: "Seleção Múltipla",
  foto: "Foto / Imagem",
  arquivo: "Arquivo",
  assinatura: "Assinatura",
};

export const CRITICIDADE_OPTIONS = [
  { value: "baixa", label: "Baixa", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "media", label: "Média", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "alta", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "critica", label: "Crítica", color: "bg-red-100 text-red-700 border-red-200" },
];

export const ROLES = ["executor", "avaliador", "aprovador"];

export const SECTION_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6",
  "#8b5cf6", "#ec4899", "#6b7280", "#14b8a6", "#f43f5e",
];

export const getLocalToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const defaultTemplate: TemplateForm = {
  nome: "", descricao: "", tipo_execucao: "checklist_inspecao", setor_id: "", responsavel_id: "",
  recorrencia_tipo: "unica", dias_da_semana: [], intervalo_dias: 1, pular_semanas: 0,
  dia_fixo_mes: null, data_inicio: getLocalToday(), data_fim: "", repetir_sempre: false,
  horario_inicio_previsto: "08:00", horario_limite_execucao: "18:00", tolerancia_minutos: 0,
  sla_horas: 24,
  gerar_contingencia_automatica: false, prazo_sla_correcao_horas: 24,
  requer_aprovacao_gestor: false, bloquear_fechamento_com_contingencia: false,
  permite_devolucao_parcial: false,
  executor_profile_id: "", executor_setor_id: "",
  avaliador_profile_id: "", avaliador_setor_id: "",
  avaliado_profile_id: "", avaliado_setor_id: "",
  aprovador_profile_id: "", aprovador_setor_id: "",
  validador_contingencia_profile_id: "", validador_contingencia_setor_id: "",
  modo_pontuacao: "pontuar_avaliado", destino_score: "individual",
  peso_recorrencia: 2.0,
  tipo_atribuicao_avaliado: "individual",
  penalidade_contingencia: 10,
  penalidade_sla_contingencia: 15,
  penalidade_fora_prazo: 20,
  habilitar_perguntas_automaticas: true,
};

export const defaultField = (sectionTempId: string, ordem: number): FieldForm => ({
  tempId: crypto.randomUUID(),
  sectionTempId,
  label: "",
  descricao: "",
  tipo: "conforme",
  ordem,
  obrigatorio: true,
  peso: 1,
  nota_maxima: 100,
  penalidade_reprovacao: 100,
  impacta_score: true,
  criticidade: "media",
  gera_contingencia: false,
  exige_evidencia: false,
  tipo_evidencia: "foto",
  opcoes: [],
  opcoes_regras: [],
  validacao: null,
  condicao_visibilidade: null,
  formula: null,
  visivel_para: ["executor", "avaliador"],
  editavel_por: ["executor"],
  aprovador_verificar: false,
  aprovador_pergunta: "",
  aprovador_tipo_resposta: "conforme",
  aprovador_peso: 1,
  aprovador_obriga_observacao_nao: true,
  aprovador_exige_evidencia_nao: false,
  aprovador_tipos_evidencia: ["foto"],
});

export const defaultSection = (ordem: number): SectionForm => ({
  tempId: crypto.randomUUID(),
  nome: "",
  descricao: "",
  peso: 1,
  ordem,
  cor: SECTION_COLORS[ordem % SECTION_COLORS.length],
  horario_inicio: "",
  horario_fim: "",
});

export const defaultStep = (ordem: number): StepForm => ({
  tempId: crypto.randomUUID(),
  nome: "",
  ordem,
  peso: 1,
  horario_inicio: "08:00",
  horario_fim: "09:00",
  prazo_limite_minutos: null,
  exige_foto: false,
  exige_observacao: false,
  exige_video: false,
});
