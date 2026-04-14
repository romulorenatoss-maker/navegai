/**
 * Operational Performance Scoring Engine
 * Score = Pontualidade(40%) + Conformidade(30%) + Qualidade Evidência(20%) + SLA Correções(10%)
 * Always clamped 0–100
 */

export interface OperationalScoreInput {
  // Pontualidade
  prazoLimite: string | null; // ISO timestamp
  fimEm: string | null;
  status: string;
  // Conformidade
  totalItens: number;
  itensConformes: number;
  // Qualidade Evidência
  evidenciaValidada: boolean | null; // null = sem revisão manual → default 100
  // SLA Correções
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
  // Pontualidade (40%)
  let pontualidade = 0;
  if (input.status === 'concluida' && input.fimEm && input.prazoLimite) {
    const prazo = new Date(input.prazoLimite).getTime();
    const fim = new Date(input.fimEm).getTime();
    if (fim <= prazo) {
      pontualidade = 100;
    } else {
      const atrasoMs = fim - prazo;
      const atrasoHoras = atrasoMs / (1000 * 60 * 60);
      pontualidade = Math.max(0, 100 - (atrasoHoras * 10)); // -10 per hour late
    }
  } else if (input.status === 'nao_executada') {
    pontualidade = 0;
  } else if (input.status === 'em_andamento' || input.status === 'pendente') {
    pontualidade = 50; // partial
  }

  // Conformidade (30%)
  let conformidade = 100;
  if (input.totalItens > 0) {
    conformidade = (input.itensConformes / input.totalItens) * 100;
  }

  // Qualidade Evidência (20%)
  let qualidadeEvidencia = 100; // default if no manual review
  if (input.evidenciaValidada === false) {
    qualidadeEvidencia = 30;
  } else if (input.evidenciaValidada === true) {
    qualidadeEvidencia = 100;
  }

  // SLA Correções (10%)
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
  concluida: { label: "Concluída", class: "badge-complete" },
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
};

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
