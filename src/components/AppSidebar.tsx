import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ClipboardCheck,
  FileSearch,
  ListChecks,
  PlayCircle,
  FolderKanban,
  BarChart3,
  Shield,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  Users,
  HelpCircle,
  Wrench,
  LogOut,
} from "lucide-react";

const navSections = [
  {
    title: "Principal",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    title: "Avaliações",
    items: [
      { to: "/avaliacoes/pesquisa", icon: FileSearch, label: "Pesquisa de OS" },
    ],
  },
  {
    title: "Checklists",
    items: [
      { to: "/checklists/cadastro", icon: ListChecks, label: "Cadastro" },
      { to: "/checklists/execucao", icon: PlayCircle, label: "Execução" },
      { to: "/checklists/gestao", icon: FolderKanban, label: "Gestão" },
      { to: "/avaliacoes/perguntas", icon: HelpCircle, label: "Perguntas" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { to: "/cadastros/setores", icon: Building2, label: "Setores" },
      { to: "/cadastros/colaboradores", icon: Users, label: "Colaboradores" },
      { to: "/cadastros/clientes", icon: ClipboardCheck, label: "Clientes" },
      { to: "/cadastros/servicos", icon: Wrench, label: "Serviços" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/relatorios", icon: BarChart3, label: "Relatórios" },
      { to: "/auditoria", icon: Shield, label: "Auditoria" },
      { to: "/configuracoes", icon: Settings, label: "Configurações" },
    ],
  },
];

interface AppSidebarProps {
  userName?: string;
  onSignOut?: () => void;
}

export function AppSidebar({ userName = "Usuário", onSignOut }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="h-screen bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border fixed left-0 top-0 z-40"
    >
      {/* Header */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
                <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
              </div>
              <span className="font-semibold text-body whitespace-nowrap">Nexus Ops</span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center mx-auto">
            <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navSections.map((section) => (
          <div key={section.title}>
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-caption text-sidebar-muted uppercase tracking-wider px-2 mb-1"
                >
                  {section.title}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-3 px-2 py-2 rounded-md text-body transition-colors duration-150 press-effect ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          className="whitespace-nowrap overflow-hidden"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 shrink-0 space-y-1">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-body text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors press-effect"
        >
          {collapsed ? <ChevronRight className="w-4 h-4 shrink-0 mx-auto" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
          {!collapsed && <span>Recolher</span>}
        </button>
        <button onClick={onSignOut} className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-body text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors press-effect">
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </motion.aside>
  );
}
