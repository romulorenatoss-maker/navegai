import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AssignmentCard } from "@/modules/operacional/components/AssignmentCard";

/**
 * Painel embutido na seção "Aguardando Avaliação" da página de Execução.
 *
 * Abas no mesmo nível: Minhas | Pendentes | Aprovados | Histórico
 *  - "Minhas": somente itens onde o usuário participa (responsavel/avaliador/avaliado/aprovador)
 *  - As 3 demais espelham as abas da página "Aprovação Final" (mesmo fluxo/dados).
 *
 * Usuário comum vê apenas "Minhas". Admin vê todas.
 * Clique em um card navega para /operacional/aprovacao para preservar as ações.
 */
export function AguardandoAvaliacaoPanel({ viewAsProfileId }: { viewAsProfileId?: string | null } = {}) {
  const navigate = useNavigate();
  const { profile, isAdmin } = useAuth();
  const targetId = viewAsProfileId || profile?.id;

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["aguardando_avaliacao_panel", profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      let query = (supabase as any)
        .from("operational_assignments")
        .select(`*, operational_templates(nome, tipo_execucao),
          executor:profiles!operational_assignments_responsavel_id_fkey(nome),
          avaliador:profiles!operational_assignments_avaliador_id_fkey(nome),
          avaliado:profiles!operational_assignments_avaliado_id_fkey(nome)`)
        .in("status", ["aguardando_aprovacao", "aprovada", "reprovada", "concluida", "devolvida"])
        .order("updated_at", { ascending: false });
      if (!isAdmin) {
        query = query.or(
          `aprovador_id.eq.${profile.id},avaliador_id.eq.${profile.id},responsavel_id.eq.${profile.id},avaliado_id.eq.${profile.id}`
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.id,
    staleTime: 15000,
  });

  const pendentes = useMemo(() => assignments.filter((a: any) => a.status === "aguardando_aprovacao"), [assignments]);
  const aprovados = useMemo(() => assignments.filter((a: any) => a.status === "aprovada"), [assignments]);
  const historico = useMemo(
    () => assignments.filter((a: any) => ["concluida", "reprovada", "devolvida"].includes(a.status)).slice(0, 50),
    [assignments]
  );

  const minhas = useMemo(() => {
    if (!targetId) return [];
    return assignments.filter((a: any) =>
      a.aprovador_id === targetId ||
      a.avaliador_id === targetId ||
      a.responsavel_id === targetId ||
      a.avaliado_id === targetId
    );
  }, [assignments, targetId]);

  const openItem = (_a: any) => navigate("/operacional/aprovacao");

  const renderList = (list: any[], emptyMsg: string) => {
    if (isLoading) return <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>;
    if (list.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">{emptyMsg}</p>;
    return <div className="space-y-3">{list.map((a: any) => <AssignmentCard key={a.id} assignment={a} onClick={openItem} />)}</div>;
  };

  // Usuário comum sem nada designado: não mostra abas
  if (!isAdmin && minhas.length === 0) {
    if (isLoading) return <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>;
    return <p className="text-xs text-muted-foreground text-center py-4">Nenhuma rotina aguardando avaliação atribuída a você.</p>;
  }

  // Usuário comum com itens designados: apenas "Minhas"
  if (!isAdmin) {
    return (
      <Tabs defaultValue="minhas" className="w-full">
        <TabsList className="h-8 mb-2">
          <TabsTrigger value="minhas" className="text-xs h-6 px-2">
            Minhas <span className="ml-1 px-1.5 rounded-full text-[10px] bg-primary/20 text-primary">{minhas.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="minhas" className="mt-0">
          {renderList(minhas, "Nenhuma rotina aguardando avaliação.")}
        </TabsContent>
      </Tabs>
    );
  }

  const tabs = [
    { key: "minhas", label: "Minhas", list: minhas, accent: "bg-primary/20 text-primary", empty: "Nenhuma rotina atribuída a você." },
    { key: "pendentes", label: "Pendentes", list: pendentes, accent: "bg-purple-500/20 text-purple-700", empty: "Nenhuma aprovação pendente." },
    { key: "aprovados", label: "Aprovados", list: aprovados, accent: "bg-emerald-500/20 text-emerald-700", empty: "Nenhum aprovado recente." },
    { key: "historico", label: "Histórico", list: historico, accent: "bg-muted text-muted-foreground", empty: "Nenhum histórico." },
  ];

  return (
    <Tabs defaultValue="minhas" className="w-full">
      <TabsList className="h-8 mb-2 flex-wrap gap-1 w-full">
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-xs h-6 px-2 flex-1 min-w-[80px]">
            {t.label}
            {t.list.length > 0 && (
              <span className={`ml-1 px-1.5 rounded-full text-[10px] ${t.accent}`}>{t.list.length}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-0">
          {renderList(t.list, t.empty)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
