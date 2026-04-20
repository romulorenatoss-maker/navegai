import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, canViewPath, allowedScreens } = useAuth();
  const location = useLocation();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowFallback(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 12000);

    return () => window.clearTimeout(timer);
  }, [loading]);

  if (loading && !showFallback) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-body text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (loading && showFallback) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="text-body text-muted-foreground">
            O sistema demorou mais que o esperado para responder. Você já pode voltar ao login sem ficar preso nesta tela.
          </div>
          <Button onClick={() => window.location.replace("/login")}>Ir para login</Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  const currentPath = location.pathname;
  const searchParams = new URLSearchParams(location.search);
  const isEvalMode = currentPath === "/avaliacoes/pesquisa" && searchParams.get("mode") === "eval";
  const isDesempenhoView = currentPath === "/desempenho";
  // Liberado a todos: criação de tarefa individual ad-hoc
  const isOpenForAll = currentPath === "/operacional/cadastro";

  if (!isEvalMode && !isDesempenhoView && !isOpenForAll && !canViewPath(currentPath)) {
    // Redirect to the user's first allowed screen, falling back to /avaliacoes/minhas.
    // Avoids an infinite redirect loop when the user has no permission for the fallback.
    const fallback = allowedScreens.find((p) => p && p !== currentPath) ?? "/avaliacoes/minhas";
    if (fallback === currentPath) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="max-w-md text-center space-y-3">
            <div className="text-body font-medium text-foreground">Sem acesso</div>
            <div className="text-caption text-muted-foreground">
              Você não tem permissão para acessar nenhuma tela. Solicite ao administrador a liberação de pelo menos uma tela.
            </div>
            <Button onClick={() => window.location.replace("/login")}>Voltar ao login</Button>
          </div>
        </div>
      );
    }
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
