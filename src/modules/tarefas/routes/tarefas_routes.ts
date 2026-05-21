export const TAREFAS_ROUTES = {
  root: "/tarefas",
  dashboard: "/tarefas/dashboard",
  detalhes: "/tarefas/detalhes/:id",
  rotinas: "/tarefas/rotinas",
  agendamentos: "/tarefas/agendamentos",
  execucao: "/tarefas/execucao",
  historico: "/tarefas/historico",
  configuracoes: "/tarefas/configuracoes",
  desempenho: "/tarefas/desempenho",
  relatorios: "/tarefas/relatorios",
} as const;

export const TAREFAS_MENU_ROUTES = [
  TAREFAS_ROUTES.dashboard,
  TAREFAS_ROUTES.execucao,
  TAREFAS_ROUTES.rotinas,
  TAREFAS_ROUTES.agendamentos,
  TAREFAS_ROUTES.historico,
  TAREFAS_ROUTES.desempenho,
  TAREFAS_ROUTES.relatorios,
  TAREFAS_ROUTES.configuracoes,
] as const;
