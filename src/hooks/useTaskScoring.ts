/**
 * Task scoring engine — calculates points based on execution timing.
 * Score is always clamped between 0 and 100.
 */

interface ScoreInput {
  pontuacao_base: number;
  bonus_antecipacao: number;
  penalidade_atraso: number;
  penalidade_nao_execucao: number;
  meta_execucao_minutos: number | null;
  prazo_limite: string; // ISO timestamp
  inicio_em: string | null;
  fim_em: string | null;
  tempo_gasto_minutos: number | null;
  status: string;
}

interface ScoreResult {
  total: number;
  breakdown: { tipo: string; valor: number; descricao: string }[];
}

export function calculateTaskScore(input: ScoreInput): ScoreResult {
  const breakdown: ScoreResult["breakdown"] = [];

  if (input.status === "nao_executada") {
    breakdown.push({ tipo: "penalidade_nao_execucao", valor: -input.penalidade_nao_execucao, descricao: "Tarefa não executada" });
    return { total: 0, breakdown };
  }

  if (input.status === "bloqueada") {
    return { total: 0, breakdown: [{ tipo: "base", valor: 0, descricao: "Tarefa bloqueada — aguardando validação" }] };
  }

  if (input.status !== "concluida") {
    return { total: 0, breakdown: [] };
  }

  // Base score
  breakdown.push({ tipo: "base", valor: input.pontuacao_base, descricao: "Pontuação base" });
  let total = input.pontuacao_base;

  const prazo = new Date(input.prazo_limite).getTime();
  const fim = input.fim_em ? new Date(input.fim_em).getTime() : Date.now();

  // Early completion bonus
  if (fim < prazo) {
    breakdown.push({ tipo: "bonus_antecipacao", valor: input.bonus_antecipacao, descricao: "Concluída antes do prazo" });
    total += input.bonus_antecipacao;
  }

  // Time goal bonus
  if (input.meta_execucao_minutos && input.tempo_gasto_minutos && input.tempo_gasto_minutos <= input.meta_execucao_minutos) {
    breakdown.push({ tipo: "bonus_meta_tempo", valor: 10, descricao: "Dentro da meta de tempo" });
    total += 10;
  }

  // Late penalty
  if (fim > prazo) {
    breakdown.push({ tipo: "penalidade_atraso", valor: -input.penalidade_atraso, descricao: "Concluída após o prazo" });
    total -= input.penalidade_atraso;
  }

  return { total: Math.max(0, Math.min(100, total)), breakdown };
}

export function getNivelFromPontuacao(pontuacao: number): string {
  if (pontuacao >= 10000) return "diamante";
  if (pontuacao >= 5000) return "platina";
  if (pontuacao >= 2500) return "ouro";
  if (pontuacao >= 1000) return "prata";
  return "bronze";
}

export const NIVEL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  bronze: { label: "Bronze", color: "text-amber-700", icon: "🥉" },
  prata: { label: "Prata", color: "text-slate-400", icon: "🥈" },
  ouro: { label: "Ouro", color: "text-yellow-500", icon: "🥇" },
  platina: { label: "Platina", color: "text-cyan-400", icon: "💎" },
  diamante: { label: "Diamante", color: "text-violet-400", icon: "👑" },
};

export const PRIORIDADE_CONFIG: Record<string, { label: string; class: string }> = {
  baixa: { label: "Baixa", class: "badge-active" },
  media: { label: "Média", class: "badge-active" },
  alta: { label: "Alta", class: "bg-orange-100 text-orange-800 border-orange-200" },
  critica: { label: "Crítica", class: "bg-red-100 text-red-800 border-red-200" },
};

export const DIFICULDADE_CONFIG: Record<string, { label: string; defaults: { base: number; bonus: number; atraso: number; naoExec: number } }> = {
  facil: { label: "Fácil", defaults: { base: 70, bonus: 10, atraso: 15, naoExec: 30 } },
  media: { label: "Média", defaults: { base: 80, bonus: 10, atraso: 20, naoExec: 40 } },
  dificil: { label: "Difícil", defaults: { base: 90, bonus: 10, atraso: 25, naoExec: 50 } },
};
