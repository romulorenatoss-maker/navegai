/**
 * tarefas_bucketize.ts — NÚCLEO ÚNICO de derivações operacionais.
 *
 * Toda regra de filtro/status/SLA/ordenação da Central Operacional
 * (/tarefas/minhas) deve passar por aqui. Componentes não duplicam lógica.
 *
 * Fase 1B.1 — adições aditivas para o motor da tarefa avulsa:
 *  - novos buckets: aguardandoAceite, renegociacaoPendente,
 *    aguardandoValidacaoMinha, respostaRecebida, limiteRenegociacao
 *  - planoAcao agora reconhece status em_plano_acao
 *  - sem_movimento_horas hierárquico (template > global)
 *  - SLA continua rodando em em_plano_acao (via SLA_RUNNING_STATUSES)
 *
 * Buckets antigos preservados (compatibilidade total).
 * Sem alterações de banco/RPC/triggers.
 */
import {
  TASK_STATUS,
  FINAL_STATUSES as STATUS_FINAIS,
  isSlaRunning,
} from "@/modules/tarefas/services/tarefas_statusConstants";
import { getSolicitacaoConfig } from "@/modules/tarefas/services/tarefas_solicitacaoConfig";

export type SlaKind = "operacional" | "avaliacao" | "aprovacao" | "total";

export interface SlaInfo {
  kind: SlaKind;
  /** prazo final (ISO) */
  due: string | null;
  /** ms restantes (negativo = estourado) */
  msRemaining: number | null;
  /** "ok" | "near" | "estourado" | "na" */
  status: "ok" | "near" | "estourado" | "na";
}

export interface AssignmentSla {
  operacional: SlaInfo;
  avaliacao: SlaInfo;
  aprovacao: SlaInfo;
  total: SlaInfo;
  /** SLA "atual" — derivado do status da tarefa. Usado para badge único. */
  current: SlaInfo;
}

export interface BucketizeOptions {
  profileId: string | null | undefined;
  isAdmin: boolean;
  /** Sem movimento: período em horas sem updated_at. Default 48h.
   *  Pode ser sobrescrito por template_snapshot.solicitacao_config.sem_movimento_horas. */
  semMovimentoHours?: number;
  /** Janelas de SLA (horas) para etapas que não têm prazo explícito. */
  slaAvaliacaoHours?: number;
  slaAprovacaoHours?: number;
  /** Tarefa total: a partir de created_at. Default 72h. */
  slaTotalHours?: number;
  /** "near" quando faltam menos que isso (ms). Default 2h. */
  nearMs?: number;
}

const DEFAULTS = {
  semMovimentoHours: 48,
  slaAvaliacaoHours: 24,
  slaAprovacaoHours: 24,
  slaTotalHours: 72,
  nearMs: 2 * 3600 * 1000,
};

const FINAL_STATUS_SET = new Set<string>(STATUS_FINAIS as ReadonlyArray<string>);

function buildDue(dateIso: string | null, addHours = 0): string | null {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  if (addHours) d.setTime(d.getTime() + addHours * 3600 * 1000);
  return d.toISOString();
}

function makeSla(kind: SlaKind, due: string | null, nearMs: number): SlaInfo {
  if (!due) return { kind, due: null, msRemaining: null, status: "na" };
  const ms = new Date(due).getTime() - Date.now();
  const status: SlaInfo["status"] = ms < 0 ? "estourado" : ms <= nearMs ? "near" : "ok";
  return { kind, due, msRemaining: ms, status };
}

/** Resolve sem_movimento_horas hierárquico: template > opção > default. */
export function resolveSemMovimentoHours(a: any, opts?: { semMovimentoHours?: number }): number {
  try {
    const cfg = getSolicitacaoConfig(a);
    if (cfg.sem_movimento_horas != null && Number.isFinite(cfg.sem_movimento_horas)) {
      return Number(cfg.sem_movimento_horas);
    }
  } catch { /* tolerante */ }
  return opts?.semMovimentoHours ?? DEFAULTS.semMovimentoHours;
}

export function computeSla(a: any, opts: BucketizeOptions = { profileId: null, isAdmin: false }): AssignmentSla {
  const o = { ...DEFAULTS, ...opts };
  // Operacional: data_prevista + horario_limite (ou 23:59:59)
  const opDueRaw = a.data_prevista
    ? `${a.data_prevista}T${a.horario_limite || "23:59:59"}`
    : null;
  const operacional = makeSla("operacional", opDueRaw ? new Date(opDueRaw).toISOString() : null, o.nearMs);

  const avaliacao = [TASK_STATUS.AGUARDANDO_AVALIACAO, TASK_STATUS.EM_AVALIACAO].includes(a.status)
    ? makeSla("avaliacao", buildDue(a.updated_at, o.slaAvaliacaoHours), o.nearMs)
    : makeSla("avaliacao", null, o.nearMs);

  const aprovacao = a.status === TASK_STATUS.AGUARDANDO_APROVACAO
    ? makeSla("aprovacao", buildDue(a.updated_at, o.slaAprovacaoHours), o.nearMs)
    : makeSla("aprovacao", null, o.nearMs);

  const total = makeSla("total", buildDue(a.created_at, o.slaTotalHours), o.nearMs);

  // SLA atual: prioriza etapa de avaliação/aprovação se ativa; senão, operacional.
  // Operacional continua rodando em em_plano_acao (SLA_RUNNING_STATUSES inclui EM_PLANO_ACAO).
  let current = operacional;
  if (avaliacao.due) current = avaliacao;
  else if (aprovacao.due) current = aprovacao;

  return { operacional, avaliacao, aprovacao, total, current };
}

export function isLate(a: any): boolean {
  if (FINAL_STATUS_SET.has(a.status)) return false;
  if (!isSlaRunning(a.status)) {
    // status onde SLA não corre (ex.: aguardando_aceite_prazo, aguardando_validacao)
    // ainda consideramos prazo operacional original
  }
  const sla = computeSla(a);
  return sla.current.status === "estourado";
}

export function isSemMovimento(a: any, hoursOverride?: number): boolean {
  if (FINAL_STATUS_SET.has(a.status)) return false;
  if (!a.updated_at) return false;
  const hours = hoursOverride ?? resolveSemMovimentoHours(a);
  const ageMs = Date.now() - new Date(a.updated_at).getTime();
  return ageMs > hours * 3600 * 1000;
}

/** Renegociação atingiu/excedeu o limite configurado.
 *  Lê de a.rodada_renegociacao (se exposto) ou de a.template_snapshot ... .renegociacao.limite. */
export function isLimiteRenegociacaoExcedido(a: any): boolean {
  try {
    const cfg = getSolicitacaoConfig(a);
    if (!cfg.renegociacao.permite) return false;
    const rodadas = Number(a.rodada_renegociacao ?? 0);
    return rodadas >= Number(cfg.renegociacao.limite ?? 3);
  } catch { return false; }
}

// ============================================================
// SORT
// ============================================================
export type SortKey = "sla" | "atraso" | "prioridade" | "criacao" | "movimento";

const PRIORIDADE_RANK: Record<string, number> = {
  critica: 0, alta: 1, media: 2, normal: 3, baixa: 4,
};

export function sortAssignments(list: any[], key: SortKey): any[] {
  const arr = [...list];
  switch (key) {
    case "sla": {
      arr.sort((a, b) => {
        const ra = computeSla(a).current.msRemaining ?? Number.POSITIVE_INFINITY;
        const rb = computeSla(b).current.msRemaining ?? Number.POSITIVE_INFINITY;
        return ra - rb;
      });
      break;
    }
    case "atraso": {
      arr.sort((a, b) => {
        const la = isLate(a) ? (computeSla(a).current.msRemaining ?? 0) : Number.POSITIVE_INFINITY;
        const lb = isLate(b) ? (computeSla(b).current.msRemaining ?? 0) : Number.POSITIVE_INFINITY;
        return la - lb;
      });
      break;
    }
    case "prioridade": {
      arr.sort((a, b) => {
        const pa = PRIORIDADE_RANK[a.prioridade ?? "normal"] ?? 99;
        const pb = PRIORIDADE_RANK[b.prioridade ?? "normal"] ?? 99;
        return pa - pb;
      });
      break;
    }
    case "criacao":
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      break;
    case "movimento":
      arr.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      break;
  }
  return arr;
}

// ============================================================
// BUCKETS
// ============================================================
export interface Buckets {
  // Executor (legado)
  pendentes: any[];
  emExecucao: any[];
  devolvidas: any[];
  planoAcao: any[];
  contingencias: any[];
  concluidas: any[];
  // Executor (Fase 1B — novos)
  /** Tarefas avulsas chegando para o executor decidir aceitar/negociar. */
  aguardandoAceite: any[];

  // Avaliador
  aguardandoAvaliacao: any[];
  reavaliar: any[];
  avaliadas: any[];

  // Aprovador
  aguardandoAprovacao: any[];
  reprovadas: any[];
  aprovadas: any[];

  // Designador (criadas por mim)
  criadasPorMim: any[];
  aguardandoRetorno: any[];
  atrasadas: any[];
  slaEstourado: any[];
  semMovimento: any[];
  acompanhamentoGeral: any[];
  // Designador (Fase 1B — novos)
  /** Renegociação proposta pelo executor aguardando minha decisão. */
  renegociacaoPendente: any[];
  /** Tarefas em aguardando_validacao onde EU sou o solicitante. */
  aguardandoValidacaoMinha: any[];
  /** Subset de aguardandoValidacaoMinha — resposta nova ainda não vista (placeholder). */
  respostaRecebida: any[];
  /** Atingiu o limite de rodadas de renegociação configurado. */
  limiteRenegociacao: any[];

  // Setor
  doMeuSetor: any[];
  pendentesSetor: any[];
  emAvaliacaoSetor: any[];
  emAprovacaoSetor: any[];
}

const empty = (): Buckets => ({
  pendentes: [], emExecucao: [], devolvidas: [], planoAcao: [], contingencias: [], concluidas: [],
  aguardandoAceite: [],
  aguardandoAvaliacao: [], reavaliar: [], avaliadas: [],
  aguardandoAprovacao: [], reprovadas: [], aprovadas: [],
  criadasPorMim: [], aguardandoRetorno: [], atrasadas: [], slaEstourado: [], semMovimento: [], acompanhamentoGeral: [],
  renegociacaoPendente: [], aguardandoValidacaoMinha: [], respostaRecebida: [], limiteRenegociacao: [],
  doMeuSetor: [], pendentesSetor: [], emAvaliacaoSetor: [], emAprovacaoSetor: [],
});

export function bucketize(
  assignments: any[],
  opts: BucketizeOptions,
  setorIds: string[] = [],
): Buckets {
  const me = opts.profileId;
  const isAdmin = opts.isAdmin;
  const b = empty();
  const setorSet = new Set(setorIds);

  // Status que indicam "aguardando retorno do executor" para o solicitante (compat + novos)
  const AGUARDANDO_RETORNO_STATUSES: string[] = [
    TASK_STATUS.PENDENTE,
    TASK_STATUS.EM_ANDAMENTO,
    TASK_STATUS.AGUARDANDO_AVALIACAO,
    TASK_STATUS.EM_AVALIACAO,
    TASK_STATUS.AGUARDANDO_APROVACAO,
    TASK_STATUS.DEVOLVIDA,
    TASK_STATUS.REABERTA,
    // Fase 1B
    TASK_STATUS.ABERTA,
    TASK_STATUS.AGUARDANDO_ACEITE_PRAZO,
    TASK_STATUS.EM_PLANO_ACAO,
  ];

  for (const a of assignments) {
    const isResp = a.responsavel_id === me;
    const isAval = a.avaliador_id === me;
    const isAprov = a.aprovador_id === me;
    const isCriador = a.created_by === me;
    const inMySetor = a.setor_id && setorSet.has(a.setor_id);

    // === Executor ===
    if (isResp || isAdmin) {
      if (a.status === TASK_STATUS.PENDENTE) b.pendentes.push(a);
      if ([TASK_STATUS.EM_ANDAMENTO, TASK_STATUS.REABERTA].includes(a.status)) b.emExecucao.push(a);
      if (a.status === TASK_STATUS.DEVOLVIDA) b.devolvidas.push(a);
      if ([TASK_STATUS.REPROVADA, TASK_STATUS.DEVOLVIDA, TASK_STATUS.EM_PLANO_ACAO].includes(a.status)) b.planoAcao.push(a);
      if ([TASK_STATUS.CONTINGENCIADO, "contingencia"].includes(a.status)) b.contingencias.push(a);
      if ([TASK_STATUS.CONCLUIDA, TASK_STATUS.APROVADA].includes(a.status)) b.concluidas.push(a);
      // Fase 1B: aguardando aceite (nova tarefa avulsa) ou aguardando aceite de novo prazo
      if ([TASK_STATUS.ABERTA, TASK_STATUS.AGUARDANDO_ACEITE_PRAZO].includes(a.status)) b.aguardandoAceite.push(a);
    }

    // === Avaliador ===
    if (isAval || isAdmin) {
      if (a.status === TASK_STATUS.AGUARDANDO_AVALIACAO) b.aguardandoAvaliacao.push(a);
      if (a.status === TASK_STATUS.EM_AVALIACAO) b.reavaliar.push(a);
      if (["avaliada", TASK_STATUS.AGUARDANDO_APROVACAO, TASK_STATUS.APROVADA].includes(a.status) && (isAval || isAdmin)) b.avaliadas.push(a);
    }

    // === Aprovador ===
    if (isAprov || isAdmin) {
      if (a.status === TASK_STATUS.AGUARDANDO_APROVACAO) b.aguardandoAprovacao.push(a);
      if (a.status === TASK_STATUS.REPROVADA) b.reprovadas.push(a);
      if (a.status === TASK_STATUS.APROVADA) b.aprovadas.push(a);
    }

    // === Designador (criou e não é o executor) ===
    if ((isCriador && !isResp) || isAdmin) {
      if (isCriador && !isResp) b.criadasPorMim.push(a);
      if (isCriador && !isResp && AGUARDANDO_RETORNO_STATUSES.includes(a.status)) b.aguardandoRetorno.push(a);
      if (isCriador && !isResp && isLate(a)) b.atrasadas.push(a);
      if (isCriador && !isResp && computeSla(a).current.status === "estourado") b.slaEstourado.push(a);
      if (isCriador && !isResp && isSemMovimento(a)) b.semMovimento.push(a);
      if (isCriador && !isResp) b.acompanhamentoGeral.push(a);

      // Fase 1B — novos
      if (isCriador && !isResp && a.status === TASK_STATUS.AGUARDANDO_ACEITE_PRAZO) {
        // Renegociação: solicitante precisa decidir
        b.renegociacaoPendente.push(a);
      }
      if (isCriador && !isResp && a.status === TASK_STATUS.AGUARDANDO_VALIDACAO) {
        b.aguardandoValidacaoMinha.push(a);
        // respostaRecebida = subset "novo" — placeholder usa flag opcional `seen_by_solicitante`
        // (sem schema change; trata ausente como "não vista").
        if (!a.seen_by_solicitante) b.respostaRecebida.push(a);
      }
      if (isCriador && !isResp && isLimiteRenegociacaoExcedido(a)) {
        b.limiteRenegociacao.push(a);
      }
    }

    // === Setor ===
    if (inMySetor) {
      b.doMeuSetor.push(a);
      if ([TASK_STATUS.PENDENTE, TASK_STATUS.EM_ANDAMENTO, TASK_STATUS.DEVOLVIDA, TASK_STATUS.REABERTA, TASK_STATUS.ABERTA].includes(a.status)) b.pendentesSetor.push(a);
      if ([TASK_STATUS.AGUARDANDO_AVALIACAO, TASK_STATUS.EM_AVALIACAO].includes(a.status)) b.emAvaliacaoSetor.push(a);
      if (a.status === TASK_STATUS.AGUARDANDO_APROVACAO) b.emAprovacaoSetor.push(a);
    }
  }

  return b;
}

// ============================================================
// VISÕES DISPONÍVEIS — derivadas dinamicamente do contexto real
// ============================================================
export type VisaoKey = "executor" | "avaliador" | "aprovador" | "designador" | "setor" | "admin";

export interface VisaoMeta {
  key: VisaoKey;
  label: string;
  count: number;
}

export function availableVisoes(b: Buckets, ctx: { isAdmin: boolean; hasSetor: boolean }): VisaoMeta[] {
  const out: VisaoMeta[] = [];
  // Executor — soma legado + aguardandoAceite (Fase 1B)
  const exec = b.pendentes.length + b.emExecucao.length + b.devolvidas.length
    + b.planoAcao.length + b.contingencias.length + b.aguardandoAceite.length;
  out.push({ key: "executor", label: "Executor", count: exec });

  if (b.aguardandoAvaliacao.length + b.reavaliar.length + b.avaliadas.length > 0)
    out.push({ key: "avaliador", label: "Avaliador", count: b.aguardandoAvaliacao.length + b.reavaliar.length });

  if (b.aguardandoAprovacao.length + b.reprovadas.length + b.aprovadas.length > 0)
    out.push({ key: "aprovador", label: "Aprovador", count: b.aguardandoAprovacao.length });

  if (b.criadasPorMim.length > 0) {
    // Designador — destaca pendências exigindo MINHA ação como solicitante
    const pendenciasMinhas = b.aguardandoRetorno.length
      + b.renegociacaoPendente.length
      + b.aguardandoValidacaoMinha.length;
    out.push({ key: "designador", label: "Criadas por Mim", count: pendenciasMinhas });
  }

  if (ctx.hasSetor && b.doMeuSetor.length > 0)
    out.push({ key: "setor", label: "Setor", count: b.pendentesSetor.length });

  if (ctx.isAdmin)
    out.push({ key: "admin", label: "Admin", count: 0 });

  return out;
}
