import { TAREFAS_ROUTES } from "@/modules/tarefas/routes/tarefas_routes";

export const TAREFAS_PERMISSION_KEYS = {
  dashboard: "tarefas.dashboard.visualizar",
  execucao: "tarefas.execucao.visualizar",
  rotinas: "tarefas.rotinas.visualizar",
  agendamentos: "tarefas.agendamentos.visualizar",
  historico: "tarefas.historico.visualizar",
  desempenho: "tarefas.desempenho.visualizar",
  relatorios: "tarefas.relatorios.visualizar",
  configuracoes: "tarefas.configuracoes.visualizar",
} as const;

export const TAREFAS_ACTION_KEYS = {
  criar: "tarefas.criar",
  editar: "tarefas.editar",
  excluir: "tarefas.excluir",
  executar: "tarefas.executar",
  finalizar: "tarefas.finalizar",
  reagendar: "tarefas.reagendar",
  comentar: "tarefas.comentar",
  anexar: "tarefas.anexar",
  configurar: "tarefas.configurar",
} as const;

export const TAREFAS_SCREEN_PERMISSIONS = [
  { path: TAREFAS_ROUTES.root, label: "Tarefas", permissionKey: TAREFAS_PERMISSION_KEYS.dashboard },
  { path: TAREFAS_ROUTES.dashboard, label: "Dashboard", permissionKey: TAREFAS_PERMISSION_KEYS.dashboard },
  { path: TAREFAS_ROUTES.detalhes, label: "Detalhes", permissionKey: TAREFAS_PERMISSION_KEYS.execucao },
  { path: TAREFAS_ROUTES.execucao, label: "Execução", permissionKey: TAREFAS_PERMISSION_KEYS.execucao },
  { path: TAREFAS_ROUTES.rotinas, label: "Rotinas", permissionKey: TAREFAS_PERMISSION_KEYS.rotinas },
  { path: TAREFAS_ROUTES.agendamentos, label: "Agenda", permissionKey: TAREFAS_PERMISSION_KEYS.agendamentos },
  { path: TAREFAS_ROUTES.historico, label: "Histórico", permissionKey: TAREFAS_PERMISSION_KEYS.historico },
  { path: TAREFAS_ROUTES.desempenho, label: "Desempenho", permissionKey: TAREFAS_PERMISSION_KEYS.desempenho },
  { path: TAREFAS_ROUTES.relatorios, label: "Relatórios", permissionKey: TAREFAS_PERMISSION_KEYS.relatorios },
  { path: TAREFAS_ROUTES.configuracoes, label: "Configurações", permissionKey: TAREFAS_PERMISSION_KEYS.configuracoes },
] as const;

export const TAREFAS_LEGACY_PERMISSION_PATH_MAP: Record<string, string> = {
  "/tarefas/gestao": TAREFAS_ROUTES.dashboard,
  "/tarefas/minhas": TAREFAS_ROUTES.execucao,
  "/tarefas/lista": TAREFAS_ROUTES.execucao,
  "/tarefas/aprovacao": TAREFAS_ROUTES.execucao,
  "/tarefas/avaliacao": TAREFAS_ROUTES.execucao,
  "/tarefas/contingencias": TAREFAS_ROUTES.execucao,
  "/tarefas/tempo-avaliacoes": TAREFAS_ROUTES.desempenho,
  "/relatorios/tarefas": TAREFAS_ROUTES.relatorios,
  "/desempenho/operacional": TAREFAS_ROUTES.desempenho,
};

export const TAREFAS_ROUTE_PERMISSION_FALLBACKS: Record<string, string[]> = {
  [TAREFAS_ROUTES.root]: [TAREFAS_ROUTES.dashboard],
  [TAREFAS_ROUTES.detalhes]: [TAREFAS_ROUTES.execucao],
};

export const TAREFAS_PERMISSION_ROUTES = TAREFAS_SCREEN_PERMISSIONS.map((screen) => screen.path);
