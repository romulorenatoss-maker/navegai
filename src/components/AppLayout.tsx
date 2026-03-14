import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/contexts/AuthContext";

export function AppLayout() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar userName={profile?.nome || "Usuário"} />
      <main className="ml-[240px] min-h-screen transition-all duration-200">
        <Outlet />
      </main>
    </div>
  );
}
