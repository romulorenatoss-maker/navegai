import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AvaliacaoOSPage from "./pages/AvaliacaoOSPage";
import SetoresPage from "./pages/SetoresPage";
import ColaboradoresPage from "./pages/ColaboradoresPage";
import TiposServicoPage from "./pages/TiposServicoPage";

import PerguntasPage from "./pages/PerguntasPage";
import ChecklistsCadastroPage from "./pages/ChecklistsCadastroPage";
import ClientesPage from "./pages/ClientesPage";
import MinhasAvaliacoesPage from "./pages/MinhasAvaliacoesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import DesempenhoColaboradorPage from "./pages/DesempenhoColaboradorPage";
import LeadsPage from "./pages/LeadsPage";
import FilaLeadsPage from "./pages/FilaLeadsPage";
import DashboardLeadsPage from "./pages/DashboardLeadsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 min - avoid refetching unchanged data
      gcTime: 10 * 60 * 1000, // 10 min - keep in cache longer
      refetchOnWindowFocus: false, // don't refetch on tab switch
      retry: 1, // reduce retries on failure
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/avaliacoes/pesquisa" element={<AvaliacaoOSPage />} />
              <Route path="/avaliacoes/perguntas" element={<PerguntasPage />} />
              <Route path="/avaliacoes/minhas" element={<MinhasAvaliacoesPage />} />
              <Route path="/checklists/cadastro" element={<ChecklistsCadastroPage />} />
              <Route path="/checklists/execucao" element={<PlaceholderPage title="Execução de Checklist" description="Painel de tarefas do executor." />} />
              <Route path="/checklists/gestao" element={<PlaceholderPage title="Gestão de Checklists" description="Acompanhe todas as tarefas geradas pelos checklists." />} />
              <Route path="/cadastros/setores" element={<SetoresPage />} />
              <Route path="/cadastros/avaliadores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/clientes" element={<ClientesPage />} />
              <Route path="/cadastros/servicos" element={<TiposServicoPage />} />
              
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/fila" element={<FilaLeadsPage />} />
              <Route path="/leads/dashboard" element={<DashboardLeadsPage />} />
              <Route path="/desempenho" element={<DesempenhoColaboradorPage />} />
              <Route path="/auditoria" element={<PlaceholderPage title="Auditoria" description="Registro completo de todas as ações do sistema." />} />
              <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" description="Configurações gerais do sistema." />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
