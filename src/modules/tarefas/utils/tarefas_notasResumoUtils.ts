export type TarefasResumoNotasModo = "aprovador" | "auditor";

export interface TarefasResumoNotaExtraida {
  modo: TarefasResumoNotasModo;
  notaFinal: number | null;
  totalPossivel: number | null;
  pontosGanhos: number | null;
  pontosPerdidos: number | null;
  pontosDevolvidosNa: number | null;
  destinoTipo: string | null;
  destinoLabel: string | null;
  notas: any;
  logId?: string | null;
  createdAt?: string | null;
  tipoEvento?: string | null;
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const getNotasFromAuditLog = (log: any) => {
  const notas = log?.dados_novos?.notas;
  return notas && typeof notas === "object" ? notas : null;
};

export const extrairResumoNota = (log: any): TarefasResumoNotaExtraida | null => {
  const notas = getNotasFromAuditLog(log);
  if (!notas) return null;

  const modoRaw = String(notas.modo ?? "");
  const tipoEvento = String(log?.tipo_evento ?? "");
  const modo: TarefasResumoNotasModo =
    modoRaw === "auditor" || tipoEvento.includes("auditor")
      ? "auditor"
      : "aprovador";

  const totais = notas.resumo_totais ?? {};
  const scoreExistente = notas.score_existente ?? {};
  const notaFinal =
    numberOrNull(totais.pontos) ??
    (modo === "auditor"
      ? numberOrNull(scoreExistente.aprovador ?? scoreExistente.auditor)
      : numberOrNull(scoreExistente.aprovacao ?? scoreExistente.avaliado ?? scoreExistente.executor));

  return {
    modo,
    notaFinal,
    totalPossivel: numberOrNull(totais.total),
    pontosGanhos: numberOrNull(totais.pontos),
    pontosPerdidos: numberOrNull(totais.descontos),
    pontosDevolvidosNa: numberOrNull(totais.devolvidosNa),
    destinoTipo: notas.destino?.tipo ?? null,
    destinoLabel: notas.destino?.label ?? null,
    notas,
    logId: log?.id ?? null,
    createdAt: log?.created_at ?? null,
    tipoEvento,
  };
};

export const extrairResumosNotas = (auditTrail: any[] = []) => {
  const resumos = auditTrail
    .map(extrairResumoNota)
    .filter(Boolean) as TarefasResumoNotaExtraida[];

  return resumos.reduce<{
    aprovador: TarefasResumoNotaExtraida | null;
    auditor: TarefasResumoNotaExtraida | null;
    todos: TarefasResumoNotaExtraida[];
  }>(
    (acc, resumo) => {
      if (resumo.modo === "auditor") acc.auditor = resumo;
      else acc.aprovador = resumo;
      acc.todos.push(resumo);
      return acc;
    },
    { aprovador: null, auditor: null, todos: [] },
  );
};

export const getNotaResumoAssignment = (
  assignment: any,
  tipo: "executor" | "avaliado" | "aprovador" | "auditor" | "final",
): number | null => {
  const scoreLogs = Array.isArray(assignment?.score_logs) ? assignment.score_logs : [];
  const auditTrail = Array.isArray(assignment?.audit_trail) ? assignment.audit_trail : [];
  const resumos = extrairResumosNotas(auditTrail);
  const scoreLog = (tipoScore: string) =>
    numberOrNull(
      scoreLogs.find((log: any) => String(log?.tipo_score) === tipoScore)?.score_final,
    );

  if (tipo === "executor") {
    return numberOrNull(assignment?.score_executor) ?? scoreLog("executor");
  }

  if (tipo === "avaliado") {
    return (
      resumos.aprovador?.notaFinal ??
      scoreLog("avaliado") ??
      numberOrNull(assignment?.score_avaliado) ??
      numberOrNull(assignment?.score_final_ajustado) ??
      numberOrNull(assignment?.pontuacao_obtida) ??
      null
    );
  }

  if (tipo === "aprovador") {
    return (
      resumos.auditor?.notaFinal ??
      scoreLog("aprovador") ??
      numberOrNull(assignment?.score_aprovador) ??
      null
    );
  }

  if (tipo === "auditor") {
    return numberOrNull(assignment?.score_auditor) ?? scoreLog("auditor");
  }

  return (
    resumos.aprovador?.notaFinal ??
    resumos.auditor?.notaFinal ??
    numberOrNull(assignment?.score_final_ajustado) ??
    numberOrNull(assignment?.pontuacao_obtida) ??
    numberOrNull(assignment?.score_avaliado) ??
    scoreLog("avaliado") ??
    scoreLog("executor")
  );
};
