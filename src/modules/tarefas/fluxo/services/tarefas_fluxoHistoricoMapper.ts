/**
 * tarefas_fluxoHistoricoMapper.ts
 *
 * Funções puras que transformam dados crus (assignment + field_answers +
 * planos_acao_aprovador + planos_acao_auditor + template snapshot) numa
 * estrutura única `TarefaFluxoData` consumível pelos painéis.
 *
 * Todas as funções aqui são SEM side effects. Só projeção/normalização.
 */

import {
  TAREFAS_FLUXO_STATUS,
  type TarefaFluxoAssignment,
  type TarefaFluxoData,
  type TarefaFluxoPergunta,
  type TarefasFluxoPapel,
  type PlanoAprovador,
  type PlanoAuditor,
  type PerguntaSnapshot,
  type RespostaOriginal,
} from "../types/tarefas_fluxoTypes";
import {
  canAprovadorCriarPlanoExecutor,
  canAprovadorResponderPlanoAuditor,
  canAuditorCriarPlanoAprovador,
  canExecutorResponderPlanoAprovador,
} from "./tarefas_fluxoStatusMachine";

// ============================================================================
// Determina papel do usuário
// ============================================================================
export function derivarPapelUsuario(
  assignment: TarefaFluxoAssignment,
  profileId: string | null,
  isAdmin: boolean,
): TarefasFluxoPapel {
  if (!profileId) return "spectator";

  // Status final → spectator (mantém UI read-only)
  if (
    assignment.status === TAREFAS_FLUXO_STATUS.CONCLUIDA ||
    assignment.status === TAREFAS_FLUXO_STATUS.APROVADA ||
    assignment.status === TAREFAS_FLUXO_STATUS.REPROVADA
  ) {
    return "spectator";
  }

  // Por status: papel ativo no momento
  if (assignment.status === TAREFAS_FLUXO_STATUS.AGUARDANDO_AUDITORIA) {
    if (assignment.auditor_id === profileId) return "auditor";
  }
  if (
    assignment.status === TAREFAS_FLUXO_STATUS.AGUARDANDO_APROVACAO
  ) {
    if (assignment.aprovador_id === profileId || assignment.avaliador_id === profileId) {
      return "aprovador";
    }
  }
  if (
    assignment.status === TAREFAS_FLUXO_STATUS.DEVOLVIDA ||
    assignment.status === TAREFAS_FLUXO_STATUS.PENDENTE ||
    assignment.status === TAREFAS_FLUXO_STATUS.EM_ANDAMENTO
  ) {
    if (assignment.responsavel_id === profileId) return "executor";
  }

  // Fallback por papel (pra ver/auditar mesmo fora do status ativo)
  if (assignment.responsavel_id === profileId) return "executor";
  if (assignment.aprovador_id === profileId || assignment.avaliador_id === profileId) return "aprovador";
  if (assignment.auditor_id === profileId) return "auditor";
  if (assignment.created_by === profileId) return "criador";
  if (isAdmin) return "admin";

  return "spectator";
}

// ============================================================================
// Extrai perguntas do template_snapshot
// ============================================================================
export function extrairPerguntasSnapshot(
  assignment: TarefaFluxoAssignment,
): PerguntaSnapshot[] {
  const snap = assignment?.template_snapshot ?? null;
  const liveSnap = assignment?.operational_templates ?? null;
  const status = assignment?.status;

  // Usa snapshot vivo para tarefas não-finais; congelado para finais
  const isLive =
    status &&
    status !== TAREFAS_FLUXO_STATUS.CONCLUIDA &&
    status !== TAREFAS_FLUXO_STATUS.APROVADA &&
    status !== TAREFAS_FLUXO_STATUS.REPROVADA;

  const base = snap;
  const ada = isLive ? liveSnap?.ada_config_snapshot : null;
  const fields: PerguntaSnapshot[] =
    Array.isArray(base?.fields)
      ? (base.fields as PerguntaSnapshot[])
      : ada && Array.isArray(ada.fields)
        ? ada.fields
        : [];

  return fields
    .filter((f) => !["secao", "divisor", "titulo"].includes(String(f.tipo)))
    .sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
}

// ============================================================================
// Monta cada pergunta consolidada
// ============================================================================
export function montarPerguntas(args: {
  perguntasSnapshot: PerguntaSnapshot[];
  respostasOriginais: RespostaOriginal[];
  planosAprovador: PlanoAprovador[];
  planosAuditor: PlanoAuditor[];
  status: string;
  papel: TarefasFluxoPapel;
}): TarefaFluxoPergunta[] {
  const {
    perguntasSnapshot,
    respostasOriginais,
    planosAprovador,
    planosAuditor,
    status,
    papel,
  } = args;

  const planosAuditorPendentes = planosAuditor.filter((p) => !p.respondido);

  return perguntasSnapshot.map((p) => {
    const respostaOriginal =
      respostasOriginais.find((r) => r.field_id === p.id) ?? null;

    const planosDoCampoAprov = planosAprovador
      .filter((x) => x.field_id === p.id && (x.respondido || !x.deleted_at))
      .sort((a, b) => (a.rodada || 0) - (b.rodada || 0));

    const planosDoCampoAudit = planosAuditor
      .filter((x) => x.field_id === p.id)
      .sort((a, b) => (a.rodada || 0) - (b.rodada || 0));

    const planosAprovPendentesDoCampo = planosDoCampoAprov.filter((x) => !x.respondido);

    // Permissões derivadas
    const podeExecutorResponderPlano =
      papel === "executor" &&
      canExecutorResponderPlanoAprovador(status, planosAprovPendentesDoCampo);

    const podeAprovadorCriarPlanoExecutor =
      papel === "aprovador" &&
      canAprovadorCriarPlanoExecutor(status, planosAuditorPendentes, p.id);

    const podeAprovadorResponderPlanoAuditor =
      papel === "aprovador" &&
      canAprovadorResponderPlanoAuditor(
        status,
        planosDoCampoAudit.filter((x) => !x.respondido),
      );

    const podeAuditorCriarPlanoAprovador =
      papel === "auditor" && canAuditorCriarPlanoAprovador(status);

    return {
      fieldId: p.id,
      label: p.label,
      tipo: p.tipo,
      obrigatorio: !!p.obrigatorio,
      ordem: Number(p.ordem ?? 0),
      snapshot: p,
      respostaOriginalExecutor: respostaOriginal,
      planosAprovador: planosDoCampoAprov,
      planosAuditor: planosDoCampoAudit,
      podeExecutorResponderPlano,
      podeAprovadorCriarPlanoExecutor,
      podeAprovadorResponderPlanoAuditor,
      podeAuditorCriarPlanoAprovador,
    };
  });
}

// ============================================================================
// Builder final: tudo junto
// ============================================================================
export function construirTarefaFluxoData(args: {
  assignment: TarefaFluxoAssignment;
  respostasOriginais: RespostaOriginal[];
  planosAprovador: PlanoAprovador[];
  planosAuditor: PlanoAuditor[];
  contingencias?: any[];
  profileId: string | null;
  isAdmin: boolean;
}): TarefaFluxoData {
  const papel = derivarPapelUsuario(args.assignment, args.profileId, args.isAdmin);
  const perguntasSnapshot = extrairPerguntasSnapshot(args.assignment);
  const perguntas = montarPerguntas({
    perguntasSnapshot,
    respostasOriginais: args.respostasOriginais,
    planosAprovador: args.planosAprovador,
    planosAuditor: args.planosAuditor,
    status: args.assignment.status,
    papel,
  });

  return {
    assignment: args.assignment,
    perguntas,
    contingencias: args.contingencias ?? [],
    papelUsuario: papel,
    planosAprovadorPendentes: args.planosAprovador.filter((p) => !p.respondido && !p.deleted_at),
    planosAuditorPendentes: args.planosAuditor.filter((p) => !p.respondido),
  };
}
