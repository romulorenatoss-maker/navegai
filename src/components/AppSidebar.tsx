import { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, FileSearch, ListChecks, PlayCircle, FolderKanban,
  BarChart3, Building2, Users, HelpCircle, Wrench, LogOut, Star, ClipboardList,
  AlertTriangle, Link2, ChevronDown, Menu, X,
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
  mobile?: boolean;
  onNavigate?: () => void;
  isAdmin?: boolean;
  allowedScreens?: string[];
}

// Desktop dropdown menu item
function NavDropdown({ section, onNavigate }: { section: typeof allNavSections[0]; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const hasActive = section.items.some(item => location.pathname === item.to);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Single item sections (like Dashboard) render as direct link
  if (section.items.length === 1) {
    const item = section.items[0];
    const isActive = location.pathname === item.to;
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="w-4 h-4" />
        {item.label}
      </NavLink>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
          hasActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        {section.title}
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          {section.items.map(item => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => { setOpen(false); onNavigate?.(); }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-popover-foreground hover:bg-accent/50"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ userName = "Usuário", onSignOut, mobile, onNavigate, isAdmin = false, allowedScreens = [] }: AppSidebarProps) {
  const location = useLocation();

  const navSections = allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isAdmin || allowedScreens.includes(item.to)),
    }))
    .filter((section) => section.items.length > 0);

  // Mobile: vertical list
  if (mobile) {
    return (
      <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center">
              <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
            </div>
            <span className="font-semibold text-body whitespace-nowrap">Nexus Ops</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section) => (
            <div key={section.title}>
              <p className="text-caption text-sidebar-muted uppercase tracking-wider px-2 mb-1">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.to;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 px-2 py-2 rounded-md text-body transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-2 shrink-0">
          <button
            onClick={() => { onSignOut?.(); onNavigate?.(); }}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-body text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    );
  }

  // Desktop: horizontal nav bar
  return (
    <nav className="flex items-center gap-1 overflow-x-auto">
      {navSections.map((section) => (
        <NavDropdown key={section.title} section={section} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
