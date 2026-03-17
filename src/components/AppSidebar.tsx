import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, FileSearch, ListChecks, PlayCircle, FolderKanban,
  BarChart3, Building2, Users, HelpCircle, Wrench, LogOut, Star,
  PanelLeftClose, PanelLeft, UserPlus, ListOrdered, LayoutGrid, Settings, UserCheck, ClipboardList,
  FileUp, MessageSquare, FileBarChart, Archive, MapPin, Megaphone, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const allNavSections = [
  {
    title: "Principal",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard OS" },
      { to: "/leads/dashboard", icon: LayoutGrid, label: "Dashboard de Leads" },
    ],
  },
  {
    title: "Avaliações",
    items: [
      { to: "/avaliacoes/pesquisa", icon: FileSearch, label: "Criar OS / Buscar" },
      { to: "/avaliacoes/minhas", icon: Star, label: "Minhas Avaliações" },
      { to: "/leads", icon: UserPlus, label: "Meus Leads" },
      { to: "/assistente", icon: Bot, label: "Assistente" },
    ],
  },
  {
    title: "Leads",
    items: [
      { to: "/leads/fila", icon: ListOrdered, label: "Gerenciador de Leads" },
      { to: "/leads/arquivados", icon: Archive, label: "Leads Arquivados" },
      { to: "/leads/importador", icon: FileUp, label: "Importador de Leads" },
      { to: "/leads/campanhas", icon: Megaphone, label: "Campanhas" },
    ],
  },
  {
    title: "Checklists",
    items: [
      { to: "/checklists/cadastro", icon: ListChecks, label: "Cadastro" },
      { to: "/checklists/execucao", icon: PlayCircle, label: "Execução" },
      { to: "/checklists/gestao", icon: FolderKanban, label: "Gestão" },
    ],
  },
  {
    title: "Cadastros",
    items: [
      { to: "/cadastros/setores", icon: Building2, label: "Setores" },
      { to: "/cadastros/servicos", icon: Wrench, label: "Tipos de Serviço" },
      { to: "/avaliacoes/perguntas", icon: HelpCircle, label: "Perguntas" },
      { to: "/leads/objecoes", icon: MessageSquare, label: "Objeções" },
      { to: "/cadastros/clientes", icon: ClipboardCheck, label: "Clientes" },
      { to: "/cadastros/enderecos", icon: MapPin, label: "Endereços" },
    ],
  },
  {
    title: "Configurações",
    items: [
      { to: "/cadastros/colaboradores", icon: Users, label: "Colaboradores" },
      { to: "/leads/rotina", icon: Settings, label: "Rotina de Tentativas" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/relatorios", icon: BarChart3, label: "Relatórios de OS" },
      { to: "/leads/relatorios", icon: FileBarChart, label: "Relatórios de Leads" },
      { to: "/desempenho", icon: UserCheck, label: "Desempenho" },
      { to: "/auditoria", icon: ClipboardList, label: "Auditoria" },
      { to: "/configuracoes", icon: Settings, label: "Configurações" },
    ],
  },
];

interface AppSidebarProps {
  userName?: string;
  onSignOut?: () => void;
  onNavigate?: () => void;
  isAdmin?: boolean;
  allowedScreens?: string[];
  canViewPath?: (path: string) => boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  badgeCounts?: Record<string, number>;
}

export function AppSidebar({ userName = "Usuário", onSignOut, onNavigate, isAdmin = false, allowedScreens = [], canViewPath, collapsed = false, onToggleCollapse, badgeCounts = {} }: AppSidebarProps) {
  const location = useLocation();

  const navSections = allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (isAdmin) return true;
        if (canViewPath) return canViewPath(item.to);
        return allowedScreens.includes(item.to);
      }),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Header: Logo + Collapse toggle */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-7 h-7 rounded-md bg-sidebar-primary flex items-center justify-center shrink-0">
              <span className="text-sidebar-primary-foreground text-xs font-bold">N</span>
            </div>
            {!collapsed && <span className="font-semibold text-sm whitespace-nowrap">Navegai Metricas</span>}
          </div>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md hover:bg-sidebar-accent/50 transition-colors text-sidebar-foreground/60 hover:text-sidebar-foreground shrink-0"
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Navigation - all sections expanded */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 px-3 mb-1">
                  {section.title}
                </p>
              )}
              {collapsed && section.title !== "Principal" && (
                <div className="mx-2 my-1 border-t border-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = location.pathname === item.to;
                  const badgeCount = badgeCounts[item.to] || 0;
                  const linkContent = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-3 rounded-md text-sm transition-colors relative",
                        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <span className="relative shrink-0">
                        <item.icon className="w-4 h-4" />
                        {badgeCount > 0 && collapsed && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
                            {badgeCount}
                          </span>
                        )}
                      </span>
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {!collapsed && badgeCount > 0 && (
                        <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 animate-pulse">
                          {badgeCount}
                        </span>
                      )}
                    </NavLink>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.to}>
                        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                          {badgeCount > 0 && <span className="ml-1 text-destructive font-bold">({badgeCount})</span>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return linkContent;
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="border-t border-sidebar-border p-2 shrink-0">
          {!collapsed && (
            <p className="text-xs text-sidebar-foreground/60 truncate mb-1.5 px-2">{userName}</p>
          )}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { onSignOut?.(); onNavigate?.(); }}
                  className="w-full flex items-center justify-center p-2.5 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Sair</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => { onSignOut?.(); onNavigate?.(); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
