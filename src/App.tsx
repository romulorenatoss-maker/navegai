import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import OperationalCadastroPage from "./modules/operacional/pages/OperationalCadastroPage";
import OperationalExecucaoPage from "./modules/operacional/pages/OperationalExecucaoPage";
import OperationalGestaoPage from "./modules/operacional/pages/OperationalGestaoPage";
import OperationalAvaliacaoPage from "./modules/operacional/pages/OperationalAvaliacaoPage";
import OperationalAprovacaoPage from "./modules/operacional/pages/OperationalAprovacaoPage";
import OperationalContingenciasPage from "./modules/operacional/pages/OperationalContingenciasPage";

import CadastroEnderecosPage from "./pages/CadastroEnderecosPage";
import ClientesPage from "./pages/ClientesPage";
import MinhasAvaliacoesPage from "./pages/MinhasAvaliacoesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import RelatorioTarefasPage from "./pages/RelatorioTarefasPage";
import DesempenhoColaboradorPage from "./pages/DesempenhoColaboradorPage";
import DesempenhoOperacionalPage from "./pages/DesempenhoOperacionalPage";
import DashboardTempoAvaliacoes from "./pages/DashboardTempoAvaliacoes";

import LeadsPage from "./pages/LeadsPage";
import FilaLeadsPage from "./pages/FilaLeadsPage";
import DashboardLeadsPage from "./pages/DashboardLeadsPage";
import RotinaTentativasPage from "./pages/RotinaTentativasPage";
import DashboardVendasPage from "./pages/DashboardVendasPage";


import LeadsArquivadosPage from "./pages/LeadsArquivadosPage";
import ImportadorLeadsPage from "./pages/ImportadorLeadsPage";
import GerenciamentoLeadsPage from "./pages/GerenciamentoLeadsPage";
import ObjecoesLeadsPage from "./pages/ObjecoesLeadsPage";
import RelatoriosLeadsPage from "./pages/RelatoriosLeadsPage";
import CampanhasPage from "./pages/CampanhasPage";
import PermissoesPage from "./pages/PermissoesPage";
import AssistentePage from "./pages/AssistentePage";
import PropostaCreatePage from "./modules/propostas/pages/PropostaCreatePage";
import PropostaPreviewPage from "./modules/propostas/pages/PropostaPreviewPage";
import PropostaHistoricoPage from "./modules/propostas/pages/PropostaHistoricoPage";
import PropostaProdutosPage from "./modules/propostas/pages/PropostaProdutosPage";
import TemplateImportPage from "./modules/propostas/pages/TemplateImportPage";
import PropostaSetupPage from "./modules/propostas/pages/PropostaSetupPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min - cache inteligente (enterprise)
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
              <Route path="/operacional/cadastro" element={<OperationalCadastroPage />} />
              <Route path="/operacional/execucao" element={<OperationalExecucaoPage />} />
              <Route path="/operacional/gestao" element={<OperationalGestaoPage />} />
              <Route path="/operacional/avaliacao" element={<OperationalAvaliacaoPage />} />
              <Route path="/operacional/aprovacao" element={<OperationalAprovacaoPage />} />
              <Route path="/operacional/contingencias" element={<OperationalContingenciasPage />} />
              <Route path="/checklists/execucao" element={<Navigate to="/operacional/execucao" replace />} />
              <Route path="/checklists/gestao" element={<Navigate to="/operacional/gestao" replace />} />
              <Route path="/checklists/cadastro" element={<Navigate to="/operacional/cadastro" replace />} />
              <Route path="/checklists/avaliacao" element={<Navigate to="/operacional/avaliacao" replace />} />
              <Route path="/checklists/aprovacao" element={<Navigate to="/operacional/aprovacao" replace />} />
              <Route path="/checklists/contingencias" element={<Navigate to="/operacional/contingencias" replace />} />
              
              
              <Route path="/cadastros/setores" element={<SetoresPage />} />
              <Route path="/cadastros/avaliadores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/clientes" element={<ClientesPage />} />
              <Route path="/cadastros/servicos" element={<TiposServicoPage />} />
              <Route path="/cadastros/enderecos" element={<CadastroEnderecosPage />} />
              
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/relatorios/tarefas" element={<RelatorioTarefasPage />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/leads/fila" element={<FilaLeadsPage />} />
              <Route path="/leads/fila-tarefas" element={<FilaLeadsPage />} />
              
              <Route path="/leads/arquivados" element={<LeadsArquivadosPage />} />
              <Route path="/leads/dashboard" element={<DashboardLeadsPage />} />
              <Route path="/leads/dashboard-vendas" element={<DashboardVendasPage />} />
              <Route path="/leads/rotina" element={<RotinaTentativasPage />} />
              <Route path="/leads/importador" element={<ImportadorLeadsPage />} />
              <Route path="/leads/gerenciamento" element={<GerenciamentoLeadsPage />} />
              <Route path="/leads/campanhas" element={<CampanhasPage />} />
              <Route path="/leads/objecoes" element={<ObjecoesLeadsPage />} />
              <Route path="/leads/relatorios" element={<RelatoriosLeadsPage />} />
              <Route path="/desempenho" element={<DesempenhoColaboradorPage />} />
              <Route path="/desempenho/operacional" element={<DesempenhoOperacionalPage />} />
              <Route path="/desempenho/tempo-avaliacoes" element={<DashboardTempoAvaliacoes />} />
              <Route path="/assistente" element={<AssistentePage />} />
              {/* MÓDULO PROPOSTAS — isolado */}
              <Route path="/propostas" element={<PropostaHistoricoPage />} />
              <Route path="/propostas/nova" element={<PropostaCreatePage />} />
              <Route path="/propostas/setup" element={<PropostaSetupPage />} />
              <Route path="/propostas/:id/preview" element={<PropostaPreviewPage />} />
              <Route path="/propostas/:id" element={<PropostaPreviewPage />} />
              <Route path="/propostas/templates" element={<TemplateImportPage />} />
              <Route path="/propostas/produtos" element={<PropostaProdutosPage />} />
              <Route path="/auditoria" element={<PlaceholderPage title="Auditoria" description="Registro completo de todas as ações do sistema." />} />
              <Route path="/configuracoes" element={<PermissoesPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
