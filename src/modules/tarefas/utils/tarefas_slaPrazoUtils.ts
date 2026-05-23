export const TAREFAS_PLANO_ACAO_SLA_PADRAO_MS = 12 * 3600 * 1000;

export const TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS = {
  executorTarefaHoras: 12,
  executorPlanoAprovadorHoras: 12,
  aprovadorAprovarHoras: 6,
  aprovadorPlanoAuditorHoras: 6,
  excluirFimSemana: true,
} as const;

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

export interface TarefasSlaResponsabilidades {
  executorTarefaHoras: number;
  executorPlanoAprovadorHoras: number;
  aprovadorAprovarHoras: number;
  aprovadorPlanoAuditorHoras: number;
  excluirFimSemana: boolean;
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

const primeiroNumero = (...values: unknown[]) => {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

const primeiroBooleano = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return null;
};

export const tarefasExtrairSlaResponsabilidades = (assignment: any): TarefasSlaResponsabilidades => {
  const frozen = assignment?.template_snapshot ?? {};
  const live = assignment?.operational_templates?.ada_config_snapshot ?? {};
  const frozenSnap = frozen?.ada_config_snapshot ?? frozen;
  const frozenSla = frozenSnap?.sla_responsabilidades ?? {};
  const liveSla = live?.sla_responsabilidades ?? {};

  return {
    executorTarefaHoras:
      primeiroNumero(frozenSla.executor_tarefa_horas, liveSla.executor_tarefa_horas) ??
      TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS.executorTarefaHoras,
    executorPlanoAprovadorHoras:
      primeiroNumero(frozenSla.executor_plano_aprovador_horas, liveSla.executor_plano_aprovador_horas) ??
      TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS.executorPlanoAprovadorHoras,
    aprovadorAprovarHoras:
      primeiroNumero(frozenSla.aprovador_aprovar_horas, liveSla.aprovador_aprovar_horas) ??
      TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS.aprovadorAprovarHoras,
    aprovadorPlanoAuditorHoras:
      primeiroNumero(frozenSla.aprovador_plano_auditor_horas, liveSla.aprovador_plano_auditor_horas) ??
      TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS.aprovadorPlanoAuditorHoras,
    excluirFimSemana:
      primeiroBooleano(frozenSla.excluir_fim_semana, liveSla.excluir_fim_semana, frozenSnap.exceto_fds, live.exceto_fds) ??
      TAREFAS_SLA_RESPONSABILIDADE_DEFAULTS.excluirFimSemana,
  };
};

const isFimSemana = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

const moverParaProximoDiaUtil = (date: Date) => {
  const cursor = new Date(date);
  while (isFimSemana(cursor)) {
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return cursor;
};

const inicioProximoFimSemana = (date: Date) => {
  const cursor = new Date(date);
  const diasAteSabado = 6 - cursor.getDay();
  cursor.setDate(cursor.getDate() + diasAteSabado);
  cursor.setHours(0, 0, 0, 0);
  return cursor;
};

export const tarefasAdicionarHorasUteis = ({
  inicio,
  horas,
  excluirFimSemana = true,
}: {
  inicio: unknown;
  horas: number;
  excluirFimSemana?: boolean;
}) => {
  const inicioMs = tarefasDataMs(inicio);
  const horasValidas = Number(horas);
  if (!inicioMs || !Number.isFinite(horasValidas) || horasValidas <= 0) return null;

  if (!excluirFimSemana) {
    return new Date(inicioMs + horasValidas * HORA_MS).toISOString();
  }

  let cursor = moverParaProximoDiaUtil(new Date(inicioMs));
  let restanteMs = horasValidas * HORA_MS;

  while (restanteMs > 0) {
    cursor = moverParaProximoDiaUtil(cursor);
    const fimSemana = inicioProximoFimSemana(cursor);
    const disponivelMs = fimSemana.getTime() - cursor.getTime();

    if (restanteMs <= disponivelMs) {
      cursor = new Date(cursor.getTime() + restanteMs);
      restanteMs = 0;
    } else {
      restanteMs -= Math.max(0, disponivelMs);
      cursor = new Date(fimSemana);
      cursor.setDate(cursor.getDate() + 2);
      cursor.setHours(0, 0, 0, 0);
    }
  }

  return cursor.toISOString();
};

export const tarefasCalcularPrazoHorasUteisStatus = ({
  inicio,
  horas,
  referencia,
  excluirFimSemana = true,
  semReferenciaUsaAgora = false,
}: {
  inicio: unknown;
  horas: number;
  referencia: unknown;
  excluirFimSemana?: boolean;
  semReferenciaUsaAgora?: boolean;
}) => {
  const prazo = tarefasAdicionarHorasUteis({ inicio, horas, excluirFimSemana });
  return {
    ...tarefasCalcularPrazoStatus({ prazo, referencia, semReferenciaUsaAgora }),
    prazoCalculado: prazo,
  };
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

export const tarefasCalcularPrazoPlanoPadraoStatus = (
  plano: {
    criado_em?: unknown;
    prazo_resolucao?: unknown;
    prazo_alterado?: boolean | null;
    prazo_prorrogado?: boolean | null;
  },
  options: {
    horas?: number | null;
    excluirFimSemana?: boolean;
  } = {},
) => {
  const prazoPadrao = options.horas
    ? tarefasAdicionarHorasUteis({
        inicio: plano.criado_em,
        horas: options.horas,
        excluirFimSemana: options.excluirFimSemana ?? true,
      })
    : tarefasPrazoPadraoPlano(plano.criado_em);
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
