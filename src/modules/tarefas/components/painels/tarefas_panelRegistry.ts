/**
 * Registry declarativo de painéis embarcados (Fase 1B.2).
 *
 * SEM if/else aninhado. Cada painel é uma entrada com:
 *  - match(ctx) → boolean
 *  - priority (menor = mais alto)
 *  - resolveMode(ctx) opcional
 *  - requiredAction (RBAC) opcional
 *  - component lazy
 *
 * Adicionar novo painel = adicionar uma entrada. Nada mais.
 */
import { lazy } from "react";
import { TASK_STATUS } from "@/modules/tarefas/services/tarefas_statusConstants";
import type { PanelEntry } from "./tarefas_panelTypes";

const AceitePrazo = lazy(() =>
  import("./tarefas_embeddedAceitePrazoPanel").then((m) => ({ default: m.EmbeddedAceitePrazoPanel })),
);
const ValidacaoSolicitante = lazy(() =>
  import("./tarefas_embeddedValidacaoSolicitantePanel").then((m) => ({ default: m.EmbeddedValidacaoSolicitantePanel })),
);
const PlanoAcao = lazy(() =>
  import("./tarefas_embeddedPlanoAcaoPanel").then((m) => ({ default: m.EmbeddedPlanoAcaoPanel })),
);
const Avaliacao = lazy(() =>
  import("./tarefas_embeddedAvaliacaoPanel").then((m) => ({ default: m.EmbeddedAvaliacaoPanel })),
);
const Aprovacao = lazy(() =>
  import("./tarefas_embeddedAprovacaoPanel").then((m) => ({ default: m.EmbeddedAprovacaoPanel })),
);

export const PANEL_REGISTRY: PanelEntry[] = [
  // === Aceite de prazo (executor ou solicitante decidindo renegociação) ===
  {
    id: "aceitePrazo",
    label: "Aceite de prazo",
    priority: 10,
    match: (c) =>
      (c.status === TASK_STATUS.ABERTA && (c.isResp || c.isAdmin)) ||
      (c.status === TASK_STATUS.AGUARDANDO_ACEITE_PRAZO && (c.isResp || c.isCriador || c.isAdmin)),
    resolveMode: (c) => {
      if (c.status === TASK_STATUS.ABERTA) return "executor";
      // AGUARDANDO_ACEITE_PRAZO: quem decide depende de quem propôs.
      // Heurística declarativa: se eu sou criador (e não executor), sou solicitante decidindo.
      if (c.isCriador && !c.isResp) return "solicitante";
      return "executor";
    },
    component: AceitePrazo,
  },

  // === Validação pelo solicitante ===
  {
    id: "validacaoSolicitante",
    label: "Validação do solicitante",
    priority: 10,
    match: (c) =>
      c.status === TASK_STATUS.AGUARDANDO_VALIDACAO && (c.isCriador || c.isAdmin),
    requiredAction: "validar_solicitante_aprovar",
    component: ValidacaoSolicitante,
  },

  // === Plano de ação ===
  {
    id: "planoAcao",
    label: "Plano de ação",
    priority: 10,
    match: (c) =>
      c.status === TASK_STATUS.EM_PLANO_ACAO && (c.isResp || c.isAdmin),
    requiredAction: "concluir_plano_acao",
    component: PlanoAcao,
  },
  {
    // mesmo painel, modo somente leitura para o solicitante acompanhando
    id: "planoAcao",
    label: "Plano de ação (acompanhar)",
    priority: 20,
    match: (c) =>
      c.status === TASK_STATUS.EM_PLANO_ACAO && c.isCriador && !c.isResp,
    component: PlanoAcao,
  },

  // === Avaliação (wrapper fino do fluxo legado) ===
  {
    id: "avaliacao",
    label: "Avaliação técnica",
    priority: 10,
    match: (c) =>
      [TASK_STATUS.AGUARDANDO_AVALIACAO, TASK_STATUS.EM_AVALIACAO].includes(c.status as any) &&
      (c.isAval || c.isAdmin),
    requiredAction: "avaliar_tarefa",
    component: Avaliacao,
  },

  // === Aprovação (wrapper fino do fluxo legado) ===
  {
    id: "aprovacao",
    label: "Aprovação",
    priority: 10,
    match: (c) =>
      c.status === TASK_STATUS.AGUARDANDO_APROVACAO && (c.isAprov || c.isAdmin),
    requiredAction: "aprovar_tarefa",
    component: Aprovacao,
  },
];
