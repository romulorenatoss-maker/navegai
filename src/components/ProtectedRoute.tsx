import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, isAdmin, allowedScreens } = useAuth();
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

  // Non-admin users: check screen permission for current path
  // Always allow certain routes that are accessible by design
  if (!isAdmin && allowedScreens.length > 0) {
    const currentPath = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const isEvalMode = currentPath === "/avaliacoes/pesquisa" && searchParams.get("mode") === "eval";
    const isDesempenhoView = currentPath === "/desempenho"; // accessible to all authenticated users
    if (!isEvalMode && !isDesempenhoView && !allowedScreens.includes(currentPath)) {
      return <Navigate to="/avaliacoes/minhas" replace />;
    }
  }

  // Non-admin with no permissions loaded yet but not loading — redirect from dashboard
  if (!isAdmin && allowedScreens.length === 0 && !loading && location.pathname === "/") {
    return <Navigate to="/avaliacoes/minhas" replace />;
  }

  return <>{children}</>;
}
