import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, canViewPath } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-body text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Admin bypasses all route restrictions
  if (isAdmin) {
    return <>{children}</>;
  }

  const currentPath = location.pathname;
  const searchParams = new URLSearchParams(location.search);
  const isEvalMode = currentPath === "/avaliacoes/pesquisa" && searchParams.get("mode") === "eval";
  const isDesempenhoView = currentPath === "/desempenho";

  if (!isEvalMode && !isDesempenhoView && !canViewPath(currentPath)) {
    // Redirect to first allowed screen or minhas avaliacoes
    return <Navigate to="/avaliacoes/minhas" replace />;
  }

  return <>{children}</>;
}
