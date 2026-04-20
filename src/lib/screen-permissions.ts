// Central registry of all screens in the system
// Used by: sidebar filtering, permissions management in Colaboradores

export interface ScreenDef {
  path: string;
  label: string;
  group: string;
}

export const ALL_SCREENS: ScreenDef[] = [
  // Principal
  { path: "/", label: "Dashboard OS", group: "Principal" },
  { path: "/leads/dashboard", label: "Dashboard de Leads", group: "Principal" },
  { path: "/leads/dashboard-vendas", label: "Dashboard Vendas", group: "Principal" },
  // Avaliações
  { path: "/avaliacoes/pesquisa", label: "Criar OS / Buscar", group: "Avaliações" },
  { path: "/avaliacoes/minhas", label: "Minhas Avaliações", group: "Avaliações" },
  { path: "/leads", label: "Meus Leads", group: "Avaliações" },
  { path: "/assistente", label: "Assistente Naví", group: "Avaliações" },
  // Leads
  { path: "/leads/fila", label: "Gerenciador de Leads", group: "Leads" },
  { path: "/leads/arquivados", label: "Leads Arquivados", group: "Leads" },
  { path: "/leads/importador", label: "Importador de Leads", group: "Leads" },
  { path: "/leads/gerenciamento", label: "Gerenciamento de Leads", group: "Leads" },
  { path: "/leads/campanhas", label: "Campanhas", group: "Leads" },
  // Tarefas
  { path: "/operacional/gestao", label: "Dash de Tarefas", group: "Tarefas" },
  { path: "/operacional/execucao", label: "Minhas Tarefas", group: "Tarefas" },
  { path: "/operacional/planos de ação", label: "Planos de Ação", group: "Tarefas" },
  { path: "/operacional/aprovacao", label: "Aprovação Final", group: "Tarefas" },
  { path: "/operacional/cadastro", label: "Rotinas Operacionais", group: "Tarefas" },
  // Cadastros
  { path: "/cadastros/setores", label: "Setores", group: "Cadastros" },
  { path: "/cadastros/servicos", label: "Tipos de Serviço", group: "Cadastros" },
  { path: "/avaliacoes/perguntas", label: "Perguntas", group: "Cadastros" },
  { path: "/leads/objecoes", label: "Objeções", group: "Cadastros" },
  { path: "/cadastros/clientes", label: "Clientes", group: "Cadastros" },
  { path: "/cadastros/enderecos", label: "Endereços", group: "Cadastros" },
  // Configurações
  { path: "/cadastros/colaboradores", label: "Colaboradores", group: "Configurações" },
  { path: "/leads/rotina", label: "Rotina de Tentativas", group: "Configurações" },
  // Sistema
  { path: "/relatorios", label: "Relatórios de OS", group: "Sistema" },
  { path: "/relatorios/tarefas", label: "Relatório de Tarefas", group: "Sistema" },
  { path: "/leads/relatorios", label: "Relatórios de Leads", group: "Sistema" },
  { path: "/desempenho", label: "Desempenho", group: "Sistema" },
  { path: "/desempenho/operacional", label: "Desempenho Operacional", group: "Sistema" },
  { path: "/auditoria", label: "Auditoria", group: "Sistema" },
  { path: "/configuracoes", label: "Configurações", group: "Sistema" },
];

// Group screens by group name
export function groupScreens(): Record<string, ScreenDef[]> {
  const groups: Record<string, ScreenDef[]> = {};
  ALL_SCREENS.forEach((s) => {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  });
  return groups;
}
