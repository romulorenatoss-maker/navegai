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
  // Cadastros (ordem de setup)
  { path: "/cadastros/setores", label: "Setores", group: "Cadastros" },
  { path: "/cadastros/colaboradores", label: "Colaboradores", group: "Cadastros" },
  { path: "/cadastros/clientes", label: "Clientes", group: "Cadastros" },
  { path: "/cadastros/servicos", label: "Tipos de Serviço", group: "Cadastros" },
  // Perguntas & Checklists
  { path: "/avaliacoes/perguntas", label: "Perguntas", group: "Perguntas & Checklists" },
  { path: "/checklists/cadastro", label: "Cadastro de Checklists", group: "Perguntas & Checklists" },
  { path: "/checklists/execucao", label: "Execução", group: "Perguntas & Checklists" },
  { path: "/checklists/gestao", label: "Gestão", group: "Perguntas & Checklists" },
  // Avaliações
  { path: "/avaliacoes/pesquisa", label: "Criar OS / Buscar", group: "Avaliações" },
  { path: "/avaliacoes/minhas", label: "Minhas Avaliações", group: "Avaliações" },
  // Leads
  { path: "/leads", label: "Gestão de Leads", group: "Leads" },
  { path: "/leads/fila", label: "Fila de Atendimento", group: "Leads" },
  // Sistema
  { path: "/relatorios", label: "Relatórios", group: "Sistema" },
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
