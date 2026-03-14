import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "./components/AppLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AvaliacaoOSPage from "./pages/AvaliacaoOSPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/avaliacoes/pesquisa" element={<AvaliacaoOSPage />} />
            <Route path="/avaliacoes/perguntas" element={<PlaceholderPage title="Perguntas de Avaliação" description="Cadastro e ordenação de perguntas por tipo de serviço." />} />
            <Route path="/checklists/cadastro" element={<PlaceholderPage title="Cadastro de Checklists" description="Crie e configure checklists operacionais recorrentes." />} />
            <Route path="/checklists/execucao" element={<PlaceholderPage title="Execução de Checklist" description="Painel de tarefas do executor." />} />
            <Route path="/checklists/gestao" element={<PlaceholderPage title="Gestão de Checklists" description="Acompanhe todas as tarefas geradas pelos checklists." />} />
            <Route path="/cadastros/setores" element={<PlaceholderPage title="Setores" description="Gerencie os setores da organização." />} />
            <Route path="/cadastros/avaliadores" element={<PlaceholderPage title="Avaliadores" description="Cadastro e permissões dos avaliadores." />} />
            <Route path="/cadastros/colaboradores" element={<PlaceholderPage title="Colaboradores" description="Cadastro dos colaboradores e executores." />} />
            <Route path="/cadastros/servicos" element={<PlaceholderPage title="Tipos de Serviço" description="Configure os tipos de serviço disponíveis." />} />
            <Route path="/relatorios" element={<PlaceholderPage title="Relatórios" description="Relatórios de desempenho, avaliações e tarefas." />} />
            <Route path="/auditoria" element={<PlaceholderPage title="Auditoria" description="Registro completo de todas as ações do sistema." />} />
            <Route path="/configuracoes" element={<PlaceholderPage title="Configurações" description="Configurações gerais do sistema." />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
