export const TAREFAS_PLANO_ACAO_SLA_PADRAO_MS = 24 * 3600 * 1000;

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

export type TarefasPrazoStatus = "no_prazo" | "fora_prazo" | "sem_prazo";

export interface TarefasPrazoResumo {
  status: TarefasPrazoStatus;
  prazoMs: number | null;
  referenciaMs: number | null;
  prazoLabel: string | null;
  referenciaLabel: string | null;
  diferencaMs: number;
  diferencaLabel: string;
  badgeLabel: string;
  detalheLabel: string;
}

export const tarefasDataMs = (value: unknown) => {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

export const tarefasFormatarDataHora = (value: unknown) => {
  const ms = tarefasDataMs(value);
  if (!ms) return null;
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const tarefasFormatarDuracao = (msOriginal: number) => {
  const ms = Math.abs(msOriginal);
  const dias = Math.floor(ms / DIA_MS);
  const horas = Math.floor((ms % DIA_MS) / HORA_MS);
  const minutos = Math.max(1, Math.floor((ms % HORA_MS) / MINUTO_MS));

  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
};

export const tarefasCalcularPrazoStatus = ({
  prazo,
  referencia,
  semReferenciaUsaAgora = false,
}: {
  prazo: unknown;
  referencia: unknown;
  semReferenciaUsaAgora?: boolean;
}): TarefasPrazoResumo => {
  const prazoMs = tarefasDataMs(prazo);
  const referenciaMs = tarefasDataMs(referencia) ?? (semReferenciaUsaAgora ? Date.now() : null);

  if (!prazoMs || !referenciaMs) {
    return {
      status: "sem_prazo",
      prazoMs,
      referenciaMs,
      prazoLabel: tarefasFormatarDataHora(prazo),
      referenciaLabel: tarefasFormatarDataHora(referencia),
      diferencaMs: 0,
      diferencaLabel: "",
      badgeLabel: "Sem prazo comparavel",
      detalheLabel: "Sem prazo comparavel",
    };
  }

  const foraPrazo = Math.floor(referenciaMs / MINUTO_MS) > Math.floor(prazoMs / MINUTO_MS);
  const diferencaMs = referenciaMs - prazoMs;
  const diferencaLabel = tarefasFormatarDuracao(diferencaMs);

  return {
    status: foraPrazo ? "fora_prazo" : "no_prazo",
    prazoMs,
    referenciaMs,
    prazoLabel: tarefasFormatarDataHora(prazo),
    referenciaLabel: tarefasFormatarDataHora(referencia),
    diferencaMs,
    diferencaLabel,
    badgeLabel: foraPrazo ? `Fora do prazo +${diferencaLabel}` : "No prazo",
    detalheLabel: foraPrazo
      ? `passou ${diferencaLabel} do limite`
      : `respondeu ${diferencaLabel} antes do limite`,
  };
};

export const tarefasPrazoPadraoPlano = (criadoEm: unknown) => {
  const criadoMs = tarefasDataMs(criadoEm);
  if (!criadoMs) return null;
  return new Date(criadoMs + TAREFAS_PLANO_ACAO_SLA_PADRAO_MS).toISOString();
};

export const tarefasCalcularPrazoPlanoPadraoStatus = (plano: {
  criado_em?: unknown;
  prazo_resolucao?: unknown;
  prazo_alterado?: boolean | null;
  prazo_prorrogado?: boolean | null;
}) => {
  const prazoPadrao = tarefasPrazoPadraoPlano(plano.criado_em);
  const status = tarefasCalcularPrazoStatus({
    prazo: prazoPadrao,
    referencia: plano.prazo_resolucao,
  });
  const alteradoPorFlag = plano.prazo_alterado === true || plano.prazo_prorrogado === true;
  const foraPadrao = alteradoPorFlag || status.status === "fora_prazo";

  return {
    ...status,
    status: foraPadrao ? ("fora_prazo" as const) : status.status,
    prazoPadrao,
    prazoPadraoLabel: tarefasFormatarDataHora(prazoPadrao),
    prazoDefinidoLabel: tarefasFormatarDataHora(plano.prazo_resolucao),
    badgeLabel: foraPadrao
      ? `Fora do SLA padrao +${status.diferencaLabel || "alterado"}`
      : "SLA padrao mantido",
    detalheLabel: foraPadrao
      ? `prazo definido acima do SLA padrao em ${status.diferencaLabel || "tempo nao calculado"}`
      : "prazo definido dentro do SLA padrao",
  };
};
