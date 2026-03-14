import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, FileSearch, ListChecks, PlayCircle, FolderKanban,
  BarChart3, Building2, Users, HelpCircle, Wrench, LogOut, Star, ClipboardList,
  AlertTriangle, Link2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const allNavSections = [
  {
    title: "Principal",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { to: "/cadastros/setores", icon: Building2, label: "Setores" },
      { to: "/cadastros/colaboradores", icon: Users, label: "Colaboradores" },
      { to: "/cadastros/clientes", icon: ClipboardCheck, label: "Clientes" },
      { to: "/cadastros/servicos", icon: Wrench, label: "Tipos de Serviço" },
      { to: "/cadastros/tipos-avaliacao", icon: ClipboardList, label: "Tipos de Avaliação" },
    ],
  },
  {
    title: "Perguntas & Checklists",
    items: [
      { to: "/avaliacoes/perguntas", icon: HelpCircle, label: "Perguntas" },
      { to: "/checklists/cadastro", icon: ListChecks, label: "Cadastro" },
      { to: "/checklists/execucao", icon: PlayCircle, label: "Execução" },
      { to: "/checklists/gestao", icon: FolderKanban, label: "Gestão" },
    ],
  },
  {
    title: "Avaliações",
    items: [
      { to: "/avaliacoes/pesquisa", icon: FileSearch, label: "Pesquisa de OS" },
      { to: "/avaliacoes/minhas", icon: Star, label: "Minhas Avaliações" },
      { to: "/avaliacoes/inconsistencias", icon: AlertTriangle, label: "Inconsistências" },
      { to: "/avaliacoes/inconsistencias-vinculadas", icon: Link2, label: "Incons. Vinculadas" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/relatorios", icon: BarChart3, label: "Relatórios" },
    ],
  },
];

interface AppSidebarProps {
  userName?: string;
  onSignOut?: () => void;
  onNavigate?: () => void;
  isAdmin?: boolean;
  allowedScreens?: string[];
}

function CollapsibleSection({ section, onNavigate }: { section: typeof allNavSections[0]; onNavigate?: () => void }) {
  const location = useLocation();
  const hasActive = section.items.some(item => location.pathname === item.to);
  const [open, setOpen] = useState(hasActive);

  // Single item sections render without collapsible
  if (section.items.length === 1) {
    const item = section.items[0];
    const isActive = location.pathname === item.to;
    return (
      <div>
        <NavLink
          to={item.to}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground/70 transition-colors"
      >
        {section.title}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map(item => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ userName = "Usuário", onSignOut, onNavigate, isAdmin = false, allowedScreens = [] }: AppSidebarProps) {
  const navSections = allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAdmin || allowedScreens.includes(item.to)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
            <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
          </div>
          <span className="font-semibold text-sm whitespace-nowrap">Nexus Ops</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
        {navSections.map((section) => (
          <CollapsibleSection key={section.title} section={section} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* User + Logout */}
      <div className="border-t border-sidebar-border p-3 shrink-0">
        <p className="text-xs text-sidebar-foreground/60 truncate mb-2 px-1">{userName}</p>
        <button
          onClick={() => { onSignOut?.(); onNavigate?.(); }}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}
