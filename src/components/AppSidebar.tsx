import { useState, useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, FileSearch, ListChecks, PlayCircle, FolderKanban,
  BarChart3, Building2, Users, HelpCircle, Wrench, LogOut, Star,
  PanelLeftClose, PanelLeft, UserPlus, ListOrdered, LayoutGrid, Settings, UserCheck, ClipboardList,
  FileUp, MessageSquare, FileBarChart, Archive, MapPin, Megaphone, Bot, Trophy, CheckSquare,
  AlertTriangle, PieChart, ChevronDown, Clock,
} from "lucide-react";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

const allNavSections = [
  {
    title: "Principal",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard OS" },
      { to: "/leads/dashboard", icon: LayoutGrid, label: "Dashboard de Leads" },
      { to: "/leads/dashboard-vendas", icon: Trophy, label: "Dashboard Vendas" },
    ],
  },
  {
    title: "Dashboards",
    items: [
      { to: "/desempenho/tempo-avaliacoes", icon: Clock, label: "Análise Operacional" },
    ],
  },
  {
    title: "Avaliações",
    items: [
      { to: "/avaliacoes/pesquisa", icon: FileSearch, label: "Criar OS / Buscar" },
      { to: "/avaliacoes/minhas", icon: Star, label: "Minhas Avaliações" },
      { to: "/leads", icon: UserPlus, label: "Meus Leads" },
      { to: "/assistente", icon: Bot, label: "Assistente Naví" },
    ],
  },
  {
    title: "Leads",
    items: [
      { to: "/leads/fila", icon: ListOrdered, label: "Gerenciador de Leads" },
      { to: "/leads/arquivados", icon: Archive, label: "Leads Arquivados" },
      { to: "/leads/importador", icon: FileUp, label: "Importador de Leads" },
      { to: "/leads/gerenciamento", icon: CheckSquare, label: "Gerenciamento de Leads" },
      { to: "/leads/campanhas", icon: Megaphone, label: "Campanhas" },
    ],
  },
  {
    title: "Tarefas",
    items: [
      { to: "/operacional/gestao", icon: FolderKanban, label: "Dash de Tarefas" },
      { to: "/operacional/execucao", icon: PlayCircle, label: "Minhas Tarefas" },
      { to: "/operacional/cadastro", icon: ListChecks, label: "Rotinas Operacionais" },
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
      { to: "/relatorios/tarefas", icon: FileBarChart, label: "Relatório de Tarefas" },
      { to: "/leads/relatorios", icon: FileBarChart, label: "Relatórios de Leads" },
      { to: "/desempenho", icon: UserCheck, label: "Desempenho" },
      { to: "/desempenho/operacional", icon: BarChart3, label: "Desempenho Operacional" },
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

  const navSections = useMemo(() =>
    allNavSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (isAdmin) return true;
          if (canViewPath) return canViewPath(item.to);
          return allowedScreens.includes(item.to);
        }),
      }))
      .filter((section) => section.items.length > 0),
    [isAdmin, canViewPath, allowedScreens]
  );

  // Find which section contains the active route
  const activeSectionTitle = useMemo(() => {
    for (const section of navSections) {
      if (section.items.some(item => item.to === location.pathname)) {
        return section.title;
      }
    }
    return navSections[0]?.title ?? null;
  }, [navSections, location.pathname]);

  // Accordion: only one section open at a time
  const [openSection, setOpenSection] = useState<string | null>(activeSectionTitle);

  // When route changes, auto-open the section that contains it
  const effectiveOpen = openSection ?? activeSectionTitle;

  const toggleSection = (title: string) => {
    setOpenSection(prev => prev === title ? null : title);
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="h-full bg-sidebar text-sidebar-foreground flex flex-col">
        {/* Header */}
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

        {/* Navigation - accordion groups */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {navSections.map((section) => {
            const isOpen = effectiveOpen === section.title;
            const sectionHasActive = section.items.some(item => item.to === location.pathname);

            return (
              <div key={section.title}>
                {/* Collapsed sidebar: separator between groups */}
                {collapsed ? (
                  <>
                    {section.title !== navSections[0]?.title && (
                      <div className="mx-2 my-1 border-t border-sidebar-border" />
                    )}
                    <div className="space-y-0.5">
                      {section.items.map((item) => {
                        const isActive = location.pathname === item.to;
                        const badgeCount = badgeCounts[item.to] || 0;
                        return (
                          <Tooltip key={item.to}>
                            <TooltipTrigger asChild>
                              <NavLink
                                to={item.to}
                                onClick={onNavigate}
                                className={cn(
                                  "flex items-center justify-center rounded-md text-sm transition-colors relative px-2 py-2.5",
                                  isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                                )}
                              >
                                <span className="relative shrink-0">
                                  <item.icon className="w-4 h-4" />
                                  {badgeCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1 animate-pulse">
                                      {badgeCount}
                                    </span>
                                  )}
                                </span>
                              </NavLink>
                            </TooltipTrigger>
                            <TooltipContent side="right" sideOffset={8}>
                              {item.label}
                              {badgeCount > 0 && <span className="ml-1 text-destructive font-bold">({badgeCount})</span>}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Group header - clickable to toggle */}
                    <button
                      onClick={() => toggleSection(section.title)}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors",
                        sectionHasActive
                          ? "text-sidebar-foreground/70"
                          : "text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
                      )}
                    >
                      <span>{section.title}</span>
                      <ChevronDown className={cn(
                        "w-3 h-3 transition-transform duration-200",
                        isOpen ? "rotate-0" : "-rotate-90"
                      )} />
                    </button>

                    {/* Items - collapsible */}
                    <div className={cn(
                      "overflow-hidden transition-all duration-200",
                      isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                    )}>
                      <div className="space-y-0.5 pb-1">
                        {section.items.map((item) => {
                          const isActive = location.pathname === item.to;
                          const badgeCount = badgeCounts[item.to] || 0;
                          return (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              onClick={onNavigate}
                              className={cn(
                                "flex items-center gap-3 rounded-md text-sm transition-colors relative px-3 py-2",
                                isActive
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                              )}
                            >
                              <item.icon className="w-4 h-4 shrink-0" />
                              <span className="flex-1">{item.label}</span>
                              {badgeCount > 0 && (
                                <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 animate-pulse">
                                  {badgeCount}
                                </span>
                              )}
                            </NavLink>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
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
