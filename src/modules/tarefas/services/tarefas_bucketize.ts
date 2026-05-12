/**
 * tarefas_bucketize.ts — NÚCLEO ÚNICO de derivações operacionais.
 *
 * Toda regra de filtro/status/SLA/ordenação da Central Operacional
 * (/tarefas/minhas) deve passar por aqui. Componentes não duplicam lógica.
 *
 * Sem alterações de banco/RPC/triggers.
 */

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
  /** Sem movimento: período em horas sem updated_at. Default 48h. */
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

const FINAL_STATUSES = new Set(["concluida", "aprovada", "nao_executada", "reprovada"]);

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

export function computeSla(a: any, opts: BucketizeOptions = { profileId: null, isAdmin: false }): AssignmentSla {
  const o = { ...DEFAULTS, ...opts };
  // Operacional: data_prevista + horario_limite (ou 23:59:59)
  const opDueRaw = a.data_prevista
    ? `${a.data_prevista}T${a.horario_limite || "23:59:59"}`
    : null;
  const operacional = makeSla("operacional", opDueRaw ? new Date(opDueRaw).toISOString() : null, o.nearMs);

  const avaliacao = ["aguardando_avaliacao", "em_avaliacao"].includes(a.status)
    ? makeSla("avaliacao", buildDue(a.updated_at, o.slaAvaliacaoHours), o.nearMs)
    : makeSla("avaliacao", null, o.nearMs);

  const aprovacao = a.status === "aguardando_aprovacao"
    ? makeSla("aprovacao", buildDue(a.updated_at, o.slaAprovacaoHours), o.nearMs)
    : makeSla("aprovacao", null, o.nearMs);

  const total = makeSla("total", buildDue(a.created_at, o.slaTotalHours), o.nearMs);

  let current = operacional;
  if (avaliacao.due) current = avaliacao;
  else if (aprovacao.due) current = aprovacao;

  return { operacional, avaliacao, aprovacao, total, current };
}

export function isLate(a: any): boolean {
  if (FINAL_STATUSES.has(a.status)) return false;
  const sla = computeSla(a);
  return sla.current.status === "estourado";
}

export function isSemMovimento(a: any, hours = DEFAULTS.semMovimentoHours): boolean {
  if (FINAL_STATUSES.has(a.status)) return false;
  if (!a.updated_at) return false;
  const ageMs = Date.now() - new Date(a.updated_at).getTime();
  return ageMs > hours * 3600 * 1000;
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
  // Executor
  pendentes: any[];
  emExecucao: any[];
  devolvidas: any[];
  planoAcao: any[];
  contingencias: any[];
  concluidas: any[];
  // Avaliador
  aguardandoAvaliacao: any[];
  reavaliar: any[];
  avaliadas: any[];
  // Aprovador
  aguardandoAprovacao: any[];
  reprovadas: any[];
  aprovadas: any[];
  // Designador
  criadasPorMim: any[];
  aguardandoRetorno: any[];
  atrasadas: any[];
  slaEstourado: any[];
  semMovimento: any[];
  acompanhamentoGeral: any[];
  // Setor
  doMeuSetor: any[];
  pendentesSetor: any[];
  emAvaliacaoSetor: any[];
  emAprovacaoSetor: any[];
}

const empty = (): Buckets => ({
  pendentes: [], emExecucao: [], devolvidas: [], planoAcao: [], contingencias: [], concluidas: [],
  aguardandoAvaliacao: [], reavaliar: [], avaliadas: [],
  aguardandoAprovacao: [], reprovadas: [], aprovadas: [],
  criadasPorMim: [], aguardandoRetorno: [], atrasadas: [], slaEstourado: [], semMovimento: [], acompanhamentoGeral: [],
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

  for (const a of assignments) {
    const isResp = a.responsavel_id === me;
    const isAval = a.avaliador_id === me;
    const isAprov = a.aprovador_id === me;
    const isCriador = a.created_by === me;
    const inMySetor = a.setor_id && setorSet.has(a.setor_id);

    // === Executor ===
    if (isResp || isAdmin) {
      if (a.status === "pendente") b.pendentes.push(a);
      if (["em_andamento", "reaberta"].includes(a.status)) b.emExecucao.push(a);
      if (a.status === "devolvida") b.devolvidas.push(a);
      if (["reprovada", "devolvida"].includes(a.status)) b.planoAcao.push(a);
      if (["contingenciado", "contingencia"].includes(a.status)) b.contingencias.push(a);
      if (["concluida", "aprovada"].includes(a.status)) b.concluidas.push(a);
    }

    // === Avaliador ===
    if (isAval || isAdmin) {
      if (a.status === "aguardando_avaliacao") b.aguardandoAvaliacao.push(a);
      if (a.status === "em_avaliacao") b.reavaliar.push(a);
      if (["avaliada", "aguardando_aprovacao", "aprovada"].includes(a.status) && (isAval || isAdmin)) b.avaliadas.push(a);
    }

    // === Aprovador ===
    if (isAprov || isAdmin) {
      if (a.status === "aguardando_aprovacao") b.aguardandoAprovacao.push(a);
      if (a.status === "reprovada") b.reprovadas.push(a);
      if (a.status === "aprovada") b.aprovadas.push(a);
    }

    // === Designador ===
    if ((isCriador && !isResp) || isAdmin) {
      if (isCriador && !isResp) b.criadasPorMim.push(a);
      if (
        isCriador && !isResp &&
        ["pendente", "em_andamento", "aguardando_avaliacao", "em_avaliacao", "aguardando_aprovacao", "devolvida", "reaberta"].includes(a.status)
      ) b.aguardandoRetorno.push(a);
      if (isCriador && !isResp && isLate(a)) b.atrasadas.push(a);
      if (isCriador && !isResp && computeSla(a).current.status === "estourado") b.slaEstourado.push(a);
      if (isCriador && !isResp && isSemMovimento(a, opts.semMovimentoHours)) b.semMovimento.push(a);
      if (isCriador && !isResp) b.acompanhamentoGeral.push(a);
    }

    // === Setor ===
    if (inMySetor) {
      b.doMeuSetor.push(a);
      if (["pendente", "em_andamento", "devolvida", "reaberta"].includes(a.status)) b.pendentesSetor.push(a);
      if (["aguardando_avaliacao", "em_avaliacao"].includes(a.status)) b.emAvaliacaoSetor.push(a);
      if (a.status === "aguardando_aprovacao") b.emAprovacaoSetor.push(a);
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
  const exec = b.pendentes.length + b.emExecucao.length + b.devolvidas.length + b.planoAcao.length + b.contingencias.length;
  if (exec > 0 || true) out.push({ key: "executor", label: "Executor", count: exec });
  if (b.aguardandoAvaliacao.length + b.reavaliar.length + b.avaliadas.length > 0)
    out.push({ key: "avaliador", label: "Avaliador", count: b.aguardandoAvaliacao.length + b.reavaliar.length });
  if (b.aguardandoAprovacao.length + b.reprovadas.length + b.aprovadas.length > 0)
    out.push({ key: "aprovador", label: "Aprovador", count: b.aguardandoAprovacao.length });
  if (b.criadasPorMim.length > 0)
    out.push({ key: "designador", label: "Criadas por Mim", count: b.aguardandoRetorno.length });
  if (ctx.hasSetor && b.doMeuSetor.length > 0)
    out.push({ key: "setor", label: "Setor", count: b.pendentesSetor.length });
  if (ctx.isAdmin)
    out.push({ key: "admin", label: "Admin", count: 0 });
  return out;
}
