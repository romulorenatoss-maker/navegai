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
  // Avaliações
  { path: "/avaliacoes/pesquisa", label: "Pesquisa de OS", group: "Avaliações" },
  { path: "/avaliacoes/minhas", label: "Minhas Avaliações", group: "Avaliações" },
  { path: "/avaliacoes/inconsistencias", label: "Inconsistências", group: "Avaliações" },
  { path: "/avaliacoes/inconsistencias-vinculadas", label: "Incons. Vinculadas", group: "Avaliações" },
  // Checklists
  { path: "/checklists/cadastro", label: "Cadastro de Checklists", group: "Checklists" },
  { path: "/checklists/execucao", label: "Execução de Checklist", group: "Checklists" },
  { path: "/checklists/gestao", label: "Gestão de Checklists", group: "Checklists" },
  { path: "/avaliacoes/perguntas", label: "Perguntas", group: "Checklists" },
  // Cadastros
  { path: "/cadastros/setores", label: "Setores", group: "Cadastros" },
  { path: "/cadastros/colaboradores", label: "Colaboradores", group: "Cadastros" },
  { path: "/cadastros/clientes", label: "Clientes", group: "Cadastros" },
  { path: "/cadastros/servicos", label: "Serviços", group: "Cadastros" },
  { path: "/cadastros/tipos-avaliacao", label: "Tipos Avaliação", group: "Cadastros" },
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
