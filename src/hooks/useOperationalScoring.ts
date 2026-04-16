/**
 * Operational Performance Scoring Engine
 * Score is now calculated by DB trigger — this file provides labels/configs only.
 * The calculateOperationalScore function is kept for backward compat in gestão rankings display.
 */

export interface OperationalScoreInput {
  prazoLimite: string | null;
  fimEm: string | null;
  status: string;
  totalItens: number;
  itensConformes: number;
  evidenciaValidada: boolean | null;
  totalContingencias: number;
  contingenciasNoPrazo: number;
}

export interface OperationalScoreResult {
  pontualidade: number;
  conformidade: number;
  qualidadeEvidencia: number;
  slaCorrecoes: number;
  scoreFinal: number;
}

export function calculateOperationalScore(input: OperationalScoreInput): OperationalScoreResult {
  let pontualidade = 0;
  if (input.status === 'concluida' && input.fimEm && input.prazoLimite) {
    const prazo = new Date(input.prazoLimite).getTime();
    const fim = new Date(input.fimEm).getTime();
    if (fim <= prazo) {
      pontualidade = 100;
    } else {
      const atrasoMs = fim - prazo;
      const atrasoHoras = atrasoMs / (1000 * 60 * 60);
      pontualidade = Math.max(0, 100 - (atrasoHoras * 10));
    }
  } else if (input.status === 'nao_executada') {
    pontualidade = 0;
  } else if (input.status === 'em_andamento' || input.status === 'pendente') {
    pontualidade = 50;
  }

  let conformidade = 100;
  if (input.totalItens > 0) {
    conformidade = (input.itensConformes / input.totalItens) * 100;
  }

  let qualidadeEvidencia = 100;
  if (input.evidenciaValidada === false) {
    qualidadeEvidencia = 30;
  } else if (input.evidenciaValidada === true) {
    qualidadeEvidencia = 100;
  }

  let slaCorrecoes = 100;
  if (input.totalContingencias > 0) {
    slaCorrecoes = (input.contingenciasNoPrazo / input.totalContingencias) * 100;
  }

  const scoreFinal = Math.max(0, Math.min(100, Math.round(
    pontualidade * 0.4 +
    conformidade * 0.3 +
    qualidadeEvidencia * 0.2 +
    slaCorrecoes * 0.1
  )));

  return {
    pontualidade: Math.round(pontualidade),
    conformidade: Math.round(conformidade),
    qualidadeEvidencia: Math.round(qualidadeEvidencia),
    slaCorrecoes: Math.round(slaCorrecoes),
    scoreFinal,
  };
}

export const TIPO_EXECUCAO_LABELS: Record<string, string> = {
  simples: "Tarefa Simples",
  etapas: "Por Etapas",
  checklist_inspecao: "Checklist Inspeção",
};

export const RECORRENCIA_LABELS: Record<string, string> = {
  unica: "Única",
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  personalizada: "Personalizada",
};

export const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  pendente: { label: "Pendente", class: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  em_andamento: { label: "Em Andamento", class: "bg-blue-100 text-blue-800 border-blue-200" },
  contingenciado: { label: "Contingenciado", class: "bg-orange-100 text-orange-800 border-orange-200" },
  contingencia: { label: "Contingência", class: "bg-orange-100 text-orange-800 border-orange-200" },
  devolvida: { label: "Devolvida", class: "bg-amber-100 text-amber-800 border-amber-200" },
  concluida: { label: "Concluída", class: "badge-complete" },
  aguardando_aprovacao: { label: "Aguardando Aprovação", class: "bg-purple-100 text-purple-800 border-purple-200" },
  aguardando_avaliacao: { label: "Aguardando Avaliação", class: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  em_avaliacao: { label: "Em Avaliação", class: "bg-violet-100 text-violet-800 border-violet-200" },
  aprovada: { label: "Aprovada", class: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  reprovada: { label: "Reprovada", class: "bg-red-100 text-red-800 border-red-200" },
  reaberta: { label: "Reaberta", class: "bg-amber-100 text-amber-800 border-amber-200" },
  atrasada: { label: "Atrasada", class: "bg-orange-100 text-orange-800 border-orange-200" },
  nao_executada: { label: "Não Executada", class: "bg-red-100 text-red-800 border-red-200" },
  bloqueada: { label: "Bloqueada", class: "badge-expired" },
};

export const CONTINGENCY_STATUS: Record<string, { label: string; class: string }> = {
  aberta: { label: "Aberta", class: "bg-red-100 text-red-800 border-red-200" },
  em_andamento: { label: "Em Andamento", class: "bg-blue-100 text-blue-800 border-blue-200" },
  resolvida: { label: "Resolvida", class: "bg-green-100 text-green-800 border-green-200" },
  vencida: { label: "Vencida", class: "bg-red-200 text-red-900 border-red-300" },
  validada: { label: "Validada", class: "badge-complete" },
  descartada: { label: "Descartada", class: "bg-gray-100 text-gray-600 border-gray-200" },
};

export const AUDIT_EVENT_LABELS: Record<string, string> = {
  conclusao: "Conclusão",
  aprovacao: "Aprovação",
  reprovacao: "Reprovação",
  reabertura: "Reabertura",
  alteracao_sla: "Alteração SLA",
  alteracao_responsavel: "Alteração Responsável",
  encerramento_manual: "Encerramento Manual",
  contingencia_criada: "Contingência Criada",
  contingencia_resolvida: "Contingência Resolvida",
  contingencia_validada: "Contingência Validada",
  inicio: "Início",
  ajuste_score: "Ajuste de Score",
  avaliacao_aprovada: "Avaliação Aprovada",
  avaliacao_reprovada: "Avaliação Reprovada",
  avaliacao_devolvida: "Avaliação Devolvida",
  aprovador_respondeu_perguntas: "Aprovador Respondeu Perguntas",
  executor_visualizou: "Executor Visualizou",
  executor_iniciou: "Executor Iniciou",
  executor_respondeu_campo: "Executor Respondeu Campo",
  executor_anexou_evidencia: "Executor Anexou Evidência",
  avaliador_iniciou: "Avaliador Iniciou Avaliação",
  avaliador_revisou_campo: "Avaliador Revisou Campo",
  avaliador_gerou_contingencia: "Avaliador Gerou Contingência",
  contingencia_prazo_definido: "Prazo de Contingência Definido",
  contingencia_correcao_iniciada: "Correção Iniciada",
  contingencia_venceu_sla: "Contingência Venceu SLA",
  aprovacao_final: "Aprovação Final",
  aprovacao_devolucao: "Devolução na Aprovação",
  override_manual: "Override Manual de Score",
};

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
