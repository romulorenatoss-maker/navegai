// Central registry of all screens in the system
// Used by: sidebar filtering, permissions management in Colaboradores

export interface ScreenDef {
  path: string;
  label: string;
  group: string;
}

export const ALL_SCREENS: ScreenDef[] = [
  // Principal
  { path: "/", label: "Dashboard", group: "Principal" },
  { path: "/leads/dashboard", label: "Dashboard de Leads", group: "Principal" },
  // Avaliações
  { path: "/avaliacoes/pesquisa", label: "Criar OS / Buscar", group: "Avaliações" },
  { path: "/avaliacoes/minhas", label: "Minhas Avaliações", group: "Avaliações" },
  { path: "/leads", label: "Meus Leads", group: "Avaliações" },
  // Checklists
  { path: "/checklists/cadastro", label: "Cadastro de Checklists", group: "Checklists" },
  { path: "/checklists/execucao", label: "Execução", group: "Checklists" },
  { path: "/checklists/gestao", label: "Gestão", group: "Checklists" },
  // Cadastros
  { path: "/cadastros/setores", label: "Setores", group: "Cadastros" },
  { path: "/cadastros/servicos", label: "Tipos de Serviço", group: "Cadastros" },
  { path: "/avaliacoes/perguntas", label: "Perguntas", group: "Cadastros" },
  { path: "/leads/objecoes", label: "Objeções", group: "Cadastros" },
  { path: "/cadastros/clientes", label: "Clientes", group: "Cadastros" },
  { path: "/cadastros/enderecos", label: "Endereços", group: "Cadastros" },
  // Leads
  { path: "/leads/fila", label: "Gerenciador de Leads", group: "Leads" },
  { path: "/leads/arquivados", label: "Leads Arquivados", group: "Leads" },
  { path: "/leads/importador", label: "Importador de Leads", group: "Leads" },
  // Configurações
  { path: "/cadastros/colaboradores", label: "Colaboradores", group: "Configurações" },
  { path: "/leads/rotina", label: "Rotina de Tentativas", group: "Configurações" },
  // Sistema
  { path: "/relatorios", label: "Relatórios de OS", group: "Sistema" },
  { path: "/leads/relatorios", label: "Relatórios de Leads", group: "Sistema" },
  { path: "/desempenho", label: "Desempenho", group: "Sistema" },
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
