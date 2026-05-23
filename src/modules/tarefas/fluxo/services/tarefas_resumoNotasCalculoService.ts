import type { TarefaFluxoData, TarefaFluxoPergunta } from "../types/tarefas_fluxoTypes";
import {
  tarefasCalcularPrazoPlanoPadraoStatus,
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

const falha = (resposta: "sim" | "nao", label: string, fonte: string, ocorrencias: ResultadoCalculoOcorrencia[] = []): ResultadoCalculoAutomatico => ({
  resposta,
  label,
  tiraPonto: true,
  calculavel: true,
  fonte,
  ocorrencias,
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

const PLANO_ACAO_SLA_PADRAO_MS = 24 * 3600 * 1000;
const MINUTO_MS = 60 * 1000;

const dataMs = (value: unknown) => {
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
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

const planosAtrasados = (data: TarefaFluxoData) => {
  const contingenciasAtrasadas = data.contingencias.filter((c: any) => {
    if (c.dentro_prazo === false) return true;
    const prazo = dataMs(c.prazo_resolucao ?? c.prazo_sla);
    if (!prazo) return false;
    const ref = dataMs(c.resolvida_em ?? c.resolvido_em) ?? Date.now();
    return ref > prazo;
  });

  const planos = data.perguntas.flatMap((p) => [...p.planosAprovador, ...p.planosAuditor]);
  const planosOficiaisAtrasados = planos.filter((p: any) => {
    const prazo = dataMs(p.prazo_resolucao);
    if (!prazo) return false;
    const ref = dataMs(p.respondido_em) ?? Date.now();
    return ref > prazo;
  });

  return [...contingenciasAtrasadas, ...planosOficiaisAtrasados];
};

const todosPlanosAprovador = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((p) => p.planosAprovador).filter((p) => !p.deleted_at);

const todosPlanosAuditor = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((p) => p.planosAuditor).filter((p) => !p.deleted_at);

const planosComPergunta = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((pergunta) => [
    ...pergunta.planosAprovador.map((plano) => ({ plano, perguntaLabel: pergunta.label, origem: "Plano do aprovador" })),
    ...pergunta.planosAuditor.map((plano) => ({ plano, perguntaLabel: pergunta.label, origem: "Plano do auditor" })),
  ]).filter(({ plano }) => !plano.deleted_at);

const planosAprovadorComPergunta = (data: TarefaFluxoData) =>
  data.perguntas.flatMap((pergunta) =>
    pergunta.planosAprovador.map((plano) => ({ plano, perguntaLabel: pergunta.label, origem: "Plano do aprovador" })),
  ).filter(({ plano }) => !plano.deleted_at);

const prazoPlanoAcimaDoPadrao = (plano: any) => {
  if (plano?.prazo_alterado === true || plano?.prazo_prorrogado === true) return true;
  const criado = dataMs(plano?.criado_em);
  const prazo = dataMs(plano?.prazo_resolucao);
  if (!criado || !prazo) return false;

  const prazoPadrao = criado + PLANO_ACAO_SLA_PADRAO_MS;
  return Math.floor(prazo / MINUTO_MS) > Math.floor(prazoPadrao / MINUTO_MS);
};

const planosComPrazoAcimaDoPadrao = (planos: any[]) =>
  planos.filter((plano) => prazoPlanoAcimaDoPadrao(plano));

const ocorrenciaPrazoPlanoPadrao = ({
  plano,
  perguntaLabel,
  origem,
}: {
  plano: any;
  perguntaLabel: string;
  origem: string;
}): ResultadoCalculoOcorrencia => {
  const status = tarefasCalcularPrazoPlanoPadraoStatus(plano);
  return {
    titulo: `${origem} R${plano.rodada ?? "-"} - ${perguntaLabel}`,
    status: status.status === "fora_prazo" ? "fora_prazo" : "no_prazo",
    prazoPrevistoLabel: status.prazoPadraoLabel,
    prazoRealLabel: status.prazoDefinidoLabel ?? tarefasFormatarDataHora(plano.prazo_resolucao),
    diferencaLabel: status.diferencaLabel,
    detalhe: status.detalheLabel,
  };
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
  const planosAuditor = todosPlanosAuditor(data);
  const atrasados = planosAtrasados(data);
  const prorrogacoes = [...planosAprovador, ...planosAuditor, ...data.contingencias].filter(
    (x: any) => x?.prazo_alterado === true || x?.prazo_prorrogado === true,
  );
  const planosComPrazoAlterado = planosComPrazoAcimaDoPadrao([...planosAprovador, ...planosAuditor]);
  const planosComPerguntaLista = planosComPergunta(data);

  switch (metrica) {
    case "executor_entregou_no_prazo": {
      const fim = dataMs(a.fim_em);
      const prazo = dataMs(a.prazo_execucao);
      const atrasou = !!a.flag_sla_estourado || (!!fim && !!prazo && fim > prazo);
      return atrasou
        ? falha("sim", "Sim - entregou fora do prazo", "assignment.fim_em/prazo_execucao + flag_sla_estourado")
        : ok("nao", "Nao - entregou no prazo", "assignment.fim_em/prazo_execucao + flag_sla_estourado");
    }

    case "executor_teve_atraso_etapa": {
      const qtd = atrasados.length || (a.flag_sla_etapa_estourado || a.flag_atraso_plano_acao ? 1 : 0);
      return qtd > 0
        ? falha("sim", `Sim - ${qtd} etapa(s) com atraso`, "planos/contingencias + flags SLA")
        : ok("nao", "Nao - todas etapas no prazo", "planos/contingencias + flags SLA");
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
        ? falha("sim", `Sim - ${planosAprovador.length} devolucao(oes)/plano(s)`, "tarefas_planos_acao_aprovador")
        : ok("nao", "Nao - sem devolucoes", "tarefas_planos_acao_aprovador");

    case "executor_teve_nao_conforme":
    case "plano_acao_foi_criado":
      return planosAprovador.length > 0
        ? falha("sim", `Sim - ${planosAprovador.length} plano(s)/nao conformidade(s)`, "tarefas_planos_acao_aprovador")
        : ok("nao", "Nao - todos conformes", "tarefas_planos_acao_aprovador");

    case "plano_acao_sla_estourado":
    case "executor_plano_atrasado":
      return a.flag_atraso_plano_acao || atrasados.length > 0
        ? falha("sim", "Sim - plano entregue com atraso", "planos/contingencias + flag_atraso_plano_acao")
        : ok("nao", "Nao - dentro do prazo", "planos/contingencias + flag_atraso_plano_acao");

    case "executor_reincidencia":
      return a.flag_reincidencia_atraso || atrasados.length >= 2
        ? falha("sim", "Sim - reincidencia de atraso", "planos/contingencias + flag_reincidencia_atraso")
        : ok("nao", "Nao", "planos/contingencias + flag_reincidencia_atraso");

    case "executor_prazo_prorrogado":
    case "plano_acao_prazo_prorrogado": {
      const ocorrencias = planosComPerguntaLista
        .filter(({ plano }) => prazoPlanoAcimaDoPadrao(plano))
        .map(ocorrenciaPrazoPlanoPadrao);
      return prorrogacoes.length > 0 || planosComPrazoAlterado.length > 0 || !!a.flag_atraso_plano_acao
        ? falha("sim", "Sim - prazo foi prorrogado", "planos.prazo_resolucao vs criado_em + SLA padrao", ocorrencias)
        : ok("nao", "Nao", "planos.prazo_resolucao vs criado_em + SLA padrao");
    }

    case "plano_acao_prazo_prorrogado_2x": {
      const ocorrencias = planosComPerguntaLista
        .filter(({ plano }) => prazoPlanoAcimaDoPadrao(plano))
        .map(ocorrenciaPrazoPlanoPadrao);
      return prorrogacoes.length >= 2 || planosComPrazoAlterado.length >= 2 || !!a.flag_reincidencia_atraso
        ? falha("sim", "Sim - prorrogado 2x ou mais", "planos.prazo_resolucao vs criado_em + SLA padrao", ocorrencias)
        : ok("nao", "Nao", "planos.prazo_resolucao vs criado_em + SLA padrao");
    }

    case "aprovador_manteve_sla_padrao": {
      const planosDoAprovadorAlterados = planosAprovadorComPergunta(data)
        .filter(({ plano }) => prazoPlanoAcimaDoPadrao(plano));
      const ocorrencias = planosDoAprovadorAlterados.map(ocorrenciaPrazoPlanoPadrao);
      return planosDoAprovadorAlterados.length > 0
        ? falha("nao", `Nao - ${planosDoAprovadorAlterados.length} plano(s) acima do SLA padrao`, "tarefas_planos_acao_aprovador.prazo_resolucao vs criado_em + SLA padrao", ocorrencias)
        : ok("sim", "Sim - manteve SLA padrao", "tarefas_planos_acao_aprovador.prazo_resolucao vs criado_em + SLA padrao");
    }

    case "aprovador_respondeu_no_sla":
      return a.flag_sla_etapa_estourado
        ? falha("sim", "Sim - avaliou fora do SLA", "flag_sla_etapa_estourado")
        : ok("nao", "Nao - avaliou no prazo", "flag_sla_etapa_estourado");

    case "aprovador_reabriu_tarefa":
      return (a.rodada_atual ?? 1) > 1 || planosAprovador.length > 0
        ? falha("sim", "Sim - devolveu/reabriu", "rodada_atual + tarefas_planos_acao_aprovador")
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
