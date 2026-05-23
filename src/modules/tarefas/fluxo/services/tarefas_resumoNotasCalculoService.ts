import type { TarefaFluxoData, TarefaFluxoPergunta } from "../types/tarefas_fluxoTypes";
import {
  tarefasAdicionarHorasUteis,
  tarefasCalcularPrazoHorasUteisStatus,
  tarefasCalcularPrazoStatus,
  tarefasExtrairSlaResponsabilidades,
  tarefasFormatarDataHora,
} from "@/modules/tarefas/utils/tarefas_slaPrazoUtils";

export type ResumoNotasCalculoModo = "aprovador" | "auditor";

export interface ResultadoCalculoAutomatico {
  resposta: "sim" | "nao" | null;
  label: string;
  tiraPonto: boolean;
  calculavel: boolean;
  fonte: string;
  ocorrencias?: ResultadoCalculoOcorrencia[];
  quantidadePenalidades?: number;
}

export interface ResultadoCalculoOcorrencia {
  titulo: string;
  status: "no_prazo" | "fora_prazo";
  prazoPrevistoLabel: string | null;
  prazoRealLabel: string | null;
  diferencaLabel: string;
  detalhe: string;
}

const semDados = (fonte: string): ResultadoCalculoAutomatico => ({
  resposta: null,
  label: "Sem dados suficientes",
  tiraPonto: false,
  calculavel: false,
  fonte,
  ocorrencias: [],
});

const ok = (resposta: "sim" | "nao", label: string, fonte: string, ocorrencias: ResultadoCalculoOcorrencia[] = []): ResultadoCalculoAutomatico => ({
  resposta,
  label,
  tiraPonto: false,
  calculavel: true,
  fonte,
  ocorrencias,
});

const falha = (
  resposta: "sim" | "nao",
  label: string,
  fonte: string,
  ocorrencias: ResultadoCalculoOcorrencia[] = [],
  quantidadePenalidades = 1,
): ResultadoCalculoAutomatico => ({
  resposta,
  label,
  tiraPonto: true,
  calculavel: true,
  fonte,
  ocorrencias,
  quantidadePenalidades: Math.max(1, quantidadePenalidades),
});

const normalizarMetrica = (metrica: string) => {
  const mapa: Record<string, string> = {
    prazo_global: "executor_entregou_no_prazo",
    executor_atrasou: "executor_entregou_no_prazo",
    atraso_etapa: "executor_teve_atraso_etapa",
    obrigatorias_respondidas: "executor_obrigatorias_respondidas",
    evidencias_anexadas: "executor_evidencias_anexadas",
    respostas_nao_conformes: "executor_teve_nao_conforme",
    devolucao: "executor_teve_devolucao",
    plano_acao_aberto: "plano_acao_foi_criado",
    plano_acao_sla: "plano_acao_sla_estourado",
    plano_acao_vencido: "plano_acao_sla_estourado",
    plano_acao_prorrogacao: "plano_acao_prazo_prorrogado",
    prorrogacao_plano_acao: "plano_acao_prazo_prorrogado",
    plano_acao_prorrogacao_multipla: "plano_acao_prazo_prorrogado_2x",
    prorrogacao_plano_acao_recorrente: "plano_acao_prazo_prorrogado_2x",
    aprovador_fora_sla: "aprovador_respondeu_no_sla",
    aprovou_com_alerta_pendente: "aprovador_aprovou_com_pendencia",
    aprovador_reabriu_ou_devolveu: "aprovador_reabriu_tarefa",
    aprovador_prorrogou_sla: "aprovador_manteve_sla_padrao",
    aprovador_manteve_sla: "aprovador_manteve_sla_padrao",
  };
  return mapa[metrica] ?? metrica;
};

const dataMs = (value: unknown) => {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const maxDataIso = (values: unknown[]) => {
  const ms = values.map(dataMs).filter((v): v is number => v !== null);
  if (ms.length === 0) return null;
  return new Date(Math.max(...ms)).toISOString();
};

const eventosPorTipo = (data: TarefaFluxoData, tipos: string[]) =>
  data.auditTrail
    .filter((evento) => tipos.includes(String(evento.tipo_evento)))
    .map((evento) => evento.created_at)
    .filter(Boolean);

const primeiraDataDepois = (values: unknown[], inicio: unknown) => {
  const inicioMs = dataMs(inicio);
  if (!inicioMs) return null;
  const posterior = values
    .map(dataMs)
    .filter((ms): ms is number => ms !== null && ms >= inicioMs)
    .sort((a, b) => a - b)[0];
  return posterior ? new Date(posterior).toISOString() : null;
};

const respostaPreenchida = (p: TarefaFluxoPergunta) => {
  const r = p.respostaOriginalExecutor;
  if (!r) return false;
  if (r.valor_booleano !== null && r.valor_booleano !== undefined) return true;
  if (r.valor_numero !== null && r.valor_numero !== undefined) return true;
  if (typeof r.valor_texto === "string" && r.valor_texto.trim()) return true;
  if (r.evidencia_url || r.evidencia_anexo_id) return true;
  if (r.valor_json && Object.keys(r.valor_json as Record<string, unknown>).length > 0) return true;
  return false;
};

const exigeEvidencia = (p: TarefaFluxoPergunta) => {
  const s: any = p.snapshot ?? {};
  return !!(
    s.exige_evidencia ||
    s.evidencia_obrigatoria ||
    s.aprovador_exige_evidencia_nao ||
    s.tipo_evidencia
  );
};

const respostaPlanoCompleta = (resposta: any) => {
  if (!resposta || typeof resposta !== "object") return false;
  return Object.values(resposta).some((item: any) =>
    !!item?.evidencia_url ||
    !!item?.evidencia_anexo_id ||
    !!String(item?.valor_texto ?? "").trim()
  );
};

const itemObrigatorioSemResposta = (plano: any) => {
  const itens = Array.isArray(plano?.itens_plano) ? plano.itens_plano : [];
  if (itens.length === 0) return false;
  const respostas = plano?.resposta_valor_json ?? {};
  return itens.some((item: any, idx: number) => {
    if (!item?.obrigatorio) return false;
    const r = respostas[String(idx)] ?? {};
    if (item.tipo === "texto" || item.tipo === "descricao") {
      return !String(r.valor_texto ?? "").trim();
    }
    return !r.evidencia_url && !r.evidencia_anexo_id;
  });
};

const todosPlanosAprovador = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((p) => p.planosAprovador).filter((p) => !p.deleted_at);

const planosAprovadorComPergunta = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((pergunta) =>
    pergunta.planosAprovador.map((plano) => ({ plano, perguntaLabel: pergunta.label, origem: "Plano do aprovador" })),
  ).filter(({ plano }) => !plano.deleted_at);

const planosAuditorComPergunta = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((pergunta) =>
    pergunta.planosAuditor.map((plano) => ({ plano, perguntaLabel: pergunta.label, origem: "Plano do auditor" })),
  ).filter(({ plano }) => !plano.deleted_at);

const planosComPerguntaPorModo = (data: TarefaFluxoData, modo: ResumoNotasCalculoModo) =>
  modo === "auditor" ? planosAuditorComPergunta(data) : planosAprovadorComPergunta(data);

const prazoPlanoAcimaDoPadrao = (plano: any, horas: number, excluirFimSemana: boolean) => {
  if (plano?.prazo_alterado === true || plano?.prazo_prorrogado === true) return true;
  const prazoPadrao = tarefasAdicionarHorasUteis({
    inicio: plano?.criado_em,
    horas,
    excluirFimSemana,
  });
  const prazo = dataMs(plano?.prazo_resolucao);
  const padrao = dataMs(prazoPadrao);
  if (!padrao || !prazo) return false;

  return Math.floor(prazo / 60000) > Math.floor(padrao / 60000);
};

const obterSlaPlanoModo = (data: TarefaFluxoData, modo: ResumoNotasCalculoModo) => {
  const sla = tarefasExtrairSlaResponsabilidades(data.assignment);
  return {
    horas: modo === "auditor" ? sla.aprovadorPlanoAuditorHoras : sla.executorPlanoAprovadorHoras,
    excluirFimSemana: sla.excluirFimSemana,
  };
};

const ocorrenciaPrazoPlanoPadrao = ({
  plano,
  perguntaLabel,
  origem,
  horas,
  excluirFimSemana,
}: {
  plano: any;
  perguntaLabel: string;
  origem: string;
  horas: number;
  excluirFimSemana: boolean;
}): ResultadoCalculoOcorrencia => {
  const prazoPadrao = tarefasAdicionarHorasUteis({
    inicio: plano.criado_em,
    horas,
    excluirFimSemana,
  });
  const status = tarefasCalcularPrazoStatus({
    prazo: prazoPadrao,
    referencia: plano.prazo_resolucao,
  });
  const foraPadrao = plano?.prazo_alterado === true || plano?.prazo_prorrogado === true || status.status === "fora_prazo";
  return {
    titulo: `${origem} R${plano.rodada ?? "-"} - ${perguntaLabel}`,
    status: foraPadrao ? "fora_prazo" : "no_prazo",
    prazoPrevistoLabel: tarefasFormatarDataHora(prazoPadrao),
    prazoRealLabel: tarefasFormatarDataHora(plano.prazo_resolucao),
    diferencaLabel: status.diferencaLabel,
    detalhe: foraPadrao
      ? `prazo definido acima do SLA padrao em ${status.diferencaLabel || "tempo nao calculado"}`
      : "prazo definido dentro do SLA padrao",
  };
};

const ocorrenciaRespostaPlano = ({
  plano,
  perguntaLabel,
  origem,
}: {
  plano: any;
  perguntaLabel: string;
  origem: string;
}): ResultadoCalculoOcorrencia | null => {
  const status = tarefasCalcularPrazoStatus({
    prazo: plano.prazo_resolucao,
    referencia: plano.respondido_em,
    semReferenciaUsaAgora: !plano.respondido,
  });
  if (status.status === "sem_prazo") return null;
  return {
    titulo: `${origem} R${plano.rodada ?? "-"} - ${perguntaLabel}`,
    status: status.status === "fora_prazo" ? "fora_prazo" : "no_prazo",
    prazoPrevistoLabel: status.prazoLabel,
    prazoRealLabel: status.referenciaLabel,
    diferencaLabel: status.diferencaLabel,
    detalhe: status.detalheLabel,
  };
};

const calcularOcorrenciasRespostaPlanos = (data: TarefaFluxoData, modo: ResumoNotasCalculoModo) =>
  planosComPerguntaPorModo(data, modo)
    .map(ocorrenciaRespostaPlano)
    .filter((item): item is ResultadoCalculoOcorrencia => !!item);

const calcularOcorrenciasPrazoAcimaPadrao = (data: TarefaFluxoData, modo: ResumoNotasCalculoModo) => {
  const { horas, excluirFimSemana } = obterSlaPlanoModo(data, modo);
  return planosComPerguntaPorModo(data, modo)
    .filter(({ plano }) => prazoPlanoAcimaDoPadrao(plano, horas, excluirFimSemana))
    .map((item) => ocorrenciaPrazoPlanoPadrao({ ...item, horas, excluirFimSemana }));
};

const calcularOcorrenciasAprovadorAprovacao = (data: TarefaFluxoData) => {
  const sla = tarefasExtrairSlaResponsabilidades(data.assignment);
  const aprovacoes = eventosPorTipo(data, ["aprovador_aprovou_para_auditoria"]);
  const planosAprovador = planosAprovadorComPergunta(data);
  const acoesAprovador = [
    ...aprovacoes,
    ...planosAprovador.map(({ plano }) => plano.criado_em),
  ].filter(Boolean);

  const inicioR0 =
    eventosPorTipo(data, ["executor_enviou_respostas"])[0] ??
    maxDataIso(data.perguntas.map((p) => p.respostaOriginalExecutor?.respondido_em));
  const inicios = [
    ...(inicioR0 ? [{ titulo: "Resposta original do executor", inicio: inicioR0 }] : []),
    ...planosAprovador
      .filter(({ plano }) => !!plano.respondido_em)
      .map(({ plano, perguntaLabel }) => ({
        titulo: `Resposta do executor ao plano R${plano.rodada ?? "-"} - ${perguntaLabel}`,
        inicio: plano.respondido_em,
      })),
  ];

  return inicios
    .map(({ titulo, inicio }) => {
      const fim = primeiraDataDepois(acoesAprovador, inicio);
      const status = tarefasCalcularPrazoHorasUteisStatus({
        inicio,
        horas: sla.aprovadorAprovarHoras,
        referencia: fim,
        excluirFimSemana: sla.excluirFimSemana,
        semReferenciaUsaAgora: false,
      });
      if (status.status === "sem_prazo") return null;
      return {
        titulo,
        status: status.status === "fora_prazo" ? "fora_prazo" : "no_prazo",
        prazoPrevistoLabel: status.prazoLabel,
        prazoRealLabel: status.referenciaLabel,
        diferencaLabel: status.diferencaLabel,
        detalhe: status.detalheLabel,
      } satisfies ResultadoCalculoOcorrencia;
    })
    .filter((item): item is ResultadoCalculoOcorrencia => !!item);
};

const calcularOcorrenciasAtrasoExecucao = (data: TarefaFluxoData) => {
  const a: any = data.assignment;
  const ocorrencias: ResultadoCalculoOcorrencia[] = [];
  const entrega = tarefasCalcularPrazoStatus({
    prazo: a.prazo_execucao,
    referencia:
      eventosPorTipo(data, ["executor_enviou_respostas"])[0] ??
      maxDataIso(data.perguntas.map((p) => p.respostaOriginalExecutor?.respondido_em)) ??
      a.fim_em,
  });
  if (entrega.status !== "sem_prazo") {
    ocorrencias.push({
      titulo: "Entrega da tarefa pelo executor",
      status: entrega.status === "fora_prazo" ? "fora_prazo" : "no_prazo",
      prazoPrevistoLabel: entrega.prazoLabel,
      prazoRealLabel: entrega.referenciaLabel,
      diferencaLabel: entrega.diferencaLabel,
      detalhe: entrega.detalheLabel,
    });
  }
  return [
    ...ocorrencias,
    ...calcularOcorrenciasRespostaPlanos(data, "aprovador"),
  ];
};

export function calcularRespostaAutomatica(
  data: TarefaFluxoData | null,
  modo: ResumoNotasCalculoModo,
  metricaOriginal: string,
): ResultadoCalculoAutomatico {
  if (!data) return semDados("fluxo nao carregado");
  const a: any = data.assignment;
  const metrica = normalizarMetrica(metricaOriginal);
  const planosAprovador = todosPlanosAprovador(data);
  const ocorrenciasAtrasoExecucao = calcularOcorrenciasAtrasoExecucao(data);

  switch (metrica) {
    case "executor_entregou_no_prazo": {
      const entrega = ocorrenciasAtrasoExecucao.find((o) => o.titulo === "Entrega da tarefa pelo executor");
      const atrasou = !!a.flag_sla_estourado || entrega?.status === "fora_prazo";
      return atrasou
        ? falha("sim", "Fora do prazo - executor entregou depois do limite", "assignment.prazo_execucao + resposta executor", entrega ? [entrega] : [])
        : ok("nao", "No prazo - executor entregou dentro do limite", "assignment.prazo_execucao + resposta executor", entrega ? [entrega] : []);
    }

    case "executor_teve_atraso_etapa": {
      const atrasos = ocorrenciasAtrasoExecucao.filter((o) => o.status === "fora_prazo");
      const qtd = atrasos.length || (a.flag_sla_etapa_estourado || a.flag_atraso_plano_acao ? 1 : 0);
      return qtd > 0
        ? falha("sim", `${qtd} etapa(s) fora do prazo`, "prazo_execucao + planos do aprovador", atrasos, qtd)
        : ok("nao", "Todas as etapas no prazo", "prazo_execucao + planos do aprovador", ocorrenciasAtrasoExecucao);
    }

    case "executor_obrigatorias_respondidas": {
      const faltando = data.perguntas.filter((p) => p.obrigatorio && !respostaPreenchida(p));
      return faltando.length > 0
        ? falha("nao", `Nao - ${faltando.length} obrigatoria(s) sem resposta`, "fields obrigatorios + operational_field_answers")
        : ok("sim", "Sim - todas respondidas", "fields obrigatorios + operational_field_answers");
    }

    case "executor_evidencias_anexadas": {
      const semEvidencia = data.perguntas.filter((p) => {
        if (!exigeEvidencia(p)) return false;
        const r = p.respostaOriginalExecutor;
        return !r?.evidencia_url && !r?.evidencia_anexo_id;
      });
      return semEvidencia.length > 0
        ? falha("nao", `Nao - ${semEvidencia.length} sem evidencia`, "fields exige_evidencia + operational_field_answers")
        : ok("sim", "Sim - todas anexadas", "fields exige_evidencia + operational_field_answers");
    }

    case "executor_teve_devolucao":
      return planosAprovador.length > 0
        ? falha("sim", `Sim - ${planosAprovador.length} devolucao(oes)/plano(s)`, "tarefas_planos_acao_aprovador", [], planosAprovador.length)
        : ok("nao", "Nao - sem devolucoes", "tarefas_planos_acao_aprovador");

    case "executor_teve_nao_conforme":
    case "plano_acao_foi_criado":
      return planosAprovador.length > 0
        ? falha("sim", `Sim - ${planosAprovador.length} plano(s)/nao conformidade(s)`, "tarefas_planos_acao_aprovador", [], planosAprovador.length)
        : ok("nao", "Nao - todos conformes", "tarefas_planos_acao_aprovador");

    case "plano_acao_sla_estourado":
    case "executor_plano_atrasado": {
      const ocorrencias = calcularOcorrenciasRespostaPlanos(data, modo);
      const atrasos = ocorrencias.filter((o) => o.status === "fora_prazo");
      return atrasos.length > 0
        ? falha("sim", `${atrasos.length} plano(s) respondido(s) fora do SLA`, "planos.prazo_resolucao/respondido_em por responsabilidade", atrasos, atrasos.length)
        : ok("nao", "Planos respondidos dentro do prazo", "planos.prazo_resolucao/respondido_em por responsabilidade", ocorrencias);
    }

    case "executor_reincidencia": {
      const planosRecorrentes = planosAprovador.filter((plano) => Number(plano.rodada ?? 1) > 1);
      const qtd = planosRecorrentes.length || (a.flag_reincidencia_atraso ? 1 : 0);
      return qtd > 0
        ? falha("sim", `${qtd} reincidencia(s) de plano do executor`, "tarefas_planos_acao_aprovador.rodada > 1", [], qtd)
        : ok("nao", "Sem reincidencia", "tarefas_planos_acao_aprovador.rodada > 1");
    }

    case "executor_prazo_prorrogado":
    case "plano_acao_prazo_prorrogado": {
      const ocorrencias = calcularOcorrenciasPrazoAcimaPadrao(data, modo);
      return ocorrencias.length > 0
        ? falha("sim", `${ocorrencias.length} plano(s) com prazo acima do SLA padrao`, "planos.prazo_resolucao vs criado_em + SLA configurado", ocorrencias, ocorrencias.length)
        : ok("nao", "SLA padrao mantido nos planos", "planos.prazo_resolucao vs criado_em + SLA configurado");
    }

    case "plano_acao_prazo_prorrogado_2x": {
      const planosRecorrentes = planosComPerguntaPorModo(data, modo)
        .filter(({ plano }) => Number(plano.rodada ?? 1) > 1);
      const { horas, excluirFimSemana } = obterSlaPlanoModo(data, modo);
      const ocorrencias = planosRecorrentes.map((item) =>
        ocorrenciaPrazoPlanoPadrao({ ...item, horas, excluirFimSemana }),
      );
      return planosRecorrentes.length > 0
        ? falha("sim", `${planosRecorrentes.length} reincidencia(s) de plano`, "planos.rodada > 1 por responsabilidade", ocorrencias, planosRecorrentes.length)
        : ok("nao", "Sem reincidencia de plano", "planos.rodada > 1 por responsabilidade");
    }

    case "aprovador_manteve_sla_padrao": {
      const { horas, excluirFimSemana } = obterSlaPlanoModo(data, "auditor");
      const planosDoAprovadorAlterados = planosAuditorComPergunta(data)
        .filter(({ plano }) => prazoPlanoAcimaDoPadrao(plano, horas, excluirFimSemana));
      const ocorrencias = planosDoAprovadorAlterados.map((item) =>
        ocorrenciaPrazoPlanoPadrao({ ...item, horas, excluirFimSemana }),
      );
      return planosDoAprovadorAlterados.length > 0
        ? falha("nao", `${planosDoAprovadorAlterados.length} plano(s) do auditor acima do SLA padrao`, "tarefas_planos_acao_auditor.prazo_resolucao vs criado_em + SLA do aprovador", ocorrencias, planosDoAprovadorAlterados.length)
        : ok("sim", "SLA padrao mantido nos planos do auditor", "tarefas_planos_acao_auditor.prazo_resolucao vs criado_em + SLA do aprovador");
    }

    case "aprovador_respondeu_no_sla": {
      const ocorrencias = calcularOcorrenciasAprovadorAprovacao(data);
      const atrasos = ocorrencias.filter((o) => o.status === "fora_prazo");
      return atrasos.length > 0
        ? falha("sim", `${atrasos.length} acao(oes) do aprovador fora do SLA`, "executor_enviou/respondeu_plano -> aprovador criou plano/enviou auditoria", atrasos, atrasos.length)
        : ok("nao", "Aprovador respondeu dentro do SLA", "executor_enviou/respondeu_plano -> aprovador criou plano/enviou auditoria", ocorrencias);
    }

    case "aprovador_reabriu_tarefa":
      return (a.rodada_atual ?? 1) > 1 || planosAprovador.length > 0
        ? falha("sim", `Sim - ${planosAprovador.length || 1} devolucao(oes)/plano(s)`, "rodada_atual + tarefas_planos_acao_aprovador", [], planosAprovador.length || 1)
        : ok("nao", "Nao", "rodada_atual + tarefas_planos_acao_aprovador");

    case "aprovador_aprovou_com_pendencia": {
      const pendentes = planosAprovador.filter((plano) => !respostaPlanoCompleta(plano.resposta_valor_json) || itemObrigatorioSemResposta(plano));
      return pendentes.length > 0
        ? falha("sim", `Sim - ${pendentes.length} plano(s) com pendencia`, "tarefas_planos_acao_aprovador.resposta_valor_json")
        : ok("nao", "Nao - sem pendencia ativa", "tarefas_planos_acao_aprovador.resposta_valor_json");
    }

    case "manual":
      return semDados("pergunta manual");

    default:
      return modo === "auditor"
        ? semDados(`metrica auditor nao mapeada: ${metricaOriginal}`)
        : semDados(`metrica executor nao mapeada: ${metricaOriginal}`);
  }
}
