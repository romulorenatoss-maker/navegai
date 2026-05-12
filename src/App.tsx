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
import OperationalCadastroPage from "./modules/tarefas/pages/tarefas_rotinasPage";
import OperationalExecucaoPage from "./modules/tarefas/pages/tarefas_minhasTarefasPage";
import OperationalGestaoPage from "./modules/tarefas/pages/tarefas_gestaoPage";
import OperationalAvaliacaoPage from "./modules/tarefas/pages/tarefas_avaliacaoPage";
import OperationalAprovacaoPage from "./modules/tarefas/pages/tarefas_aprovacaoPage";
import OperationalContingenciasPage from "./modules/tarefas/pages/tarefas_contingenciasPage";

import CadastroEnderecosPage from "./pages/CadastroEnderecosPage";
import ClientesPage from "./pages/ClientesPage";
import MinhasAvaliacoesPage from "./pages/MinhasAvaliacoesPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import RelatoriosPage from "./pages/RelatoriosPage";
import RelatorioTarefasPage from "./modules/tarefas/pages/tarefas_relatoriosPage";
import DesempenhoColaboradorPage from "./pages/DesempenhoColaboradorPage";
import DesempenhoOperacionalPage from "./modules/tarefas/pages/tarefas_desempenhoPage";
import DashboardTempoAvaliacoes from "./modules/avaliacoes/pages/avaliacoes_tempoAvaliacoesPage";

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
import ProdutosConversacionalPage from "./modules/propostas/pages/ProdutosConversacionalPage";
import TemplateImportPage from "./modules/propostas/pages/TemplateImportPage";
import PropostaSetupPage from "./modules/propostas/pages/PropostaSetupPage";
import PropostaConversacionalPage from "./modules/propostas/pages/PropostaConversacionalPage";
import PropostasPerguntasPage from "./modules/propostas/pages/PropostasPerguntasPage";
import PropostaDadosRenderPage from "./modules/propostas/pages/PropostaDadosRenderPage";
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
              {/* MÓDULO TAREFAS */}
              <Route path="/tarefas/rotinas" element={<OperationalCadastroPage />} />
              <Route path="/tarefas/minhas" element={<OperationalExecucaoPage />} />
              <Route path="/tarefas/gestao" element={<OperationalGestaoPage />} />
              {/* Fase B: rotas legadas viram wrappers que abrem /tarefas/minhas com chip pré-selecionado */}
              <Route path="/tarefas/avaliacao" element={<Navigate to="/tarefas/minhas?chip=avaliar&from=avaliacao" replace />} />
              <Route path="/tarefas/aprovacao" element={<Navigate to="/tarefas/minhas?chip=aprovar&from=aprovacao" replace />} />
              <Route path="/tarefas/contingencias" element={<Navigate to="/tarefas/minhas?chip=contingencias&from=contingencias" replace />} />
              {/* Redirects legados (/operacional/* e /checklists/*) */}
              <Route path="/operacional/cadastro" element={<Navigate to="/tarefas/rotinas" replace />} />
              <Route path="/operacional/execucao" element={<Navigate to="/tarefas/minhas" replace />} />
              <Route path="/operacional/gestao" element={<Navigate to="/tarefas/gestao" replace />} />
              <Route path="/operacional/avaliacao" element={<Navigate to="/tarefas/minhas?chip=avaliar&from=operacional_avaliacao" replace />} />
              <Route path="/operacional/aprovacao" element={<Navigate to="/tarefas/minhas?chip=aprovar&from=operacional_aprovacao" replace />} />
              <Route path="/operacional/contingencias" element={<Navigate to="/tarefas/minhas?chip=contingencias&from=operacional_contingencias" replace />} />
              <Route path="/checklists/execucao" element={<Navigate to="/tarefas/minhas" replace />} />
              <Route path="/checklists/gestao" element={<Navigate to="/tarefas/gestao" replace />} />
              <Route path="/checklists/cadastro" element={<Navigate to="/tarefas/rotinas" replace />} />
              <Route path="/checklists/avaliacao" element={<Navigate to="/tarefas/minhas?chip=avaliar&from=checklists_avaliacao" replace />} />
              <Route path="/checklists/aprovacao" element={<Navigate to="/tarefas/minhas?chip=aprovar&from=checklists_aprovacao" replace />} />
              <Route path="/checklists/contingencias" element={<Navigate to="/tarefas/minhas?chip=contingencias&from=checklists_contingencias" replace />} />
              
              
              <Route path="/cadastros/setores" element={<SetoresPage />} />
              <Route path="/cadastros/avaliadores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/colaboradores" element={<ColaboradoresPage />} />
              <Route path="/cadastros/clientes" element={<ClientesPage />} />
              <Route path="/cadastros/servicos" element={<TiposServicoPage />} />
              <Route path="/cadastros/enderecos" element={<CadastroEnderecosPage />} />
              
              <Route path="/relatorios" element={<RelatoriosPage />} />
              <Route path="/tarefas/relatorios" element={<RelatorioTarefasPage />} />
              <Route path="/relatorios/tarefas" element={<Navigate to="/tarefas/relatorios" replace />} />
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
              <Route path="/tarefas/desempenho" element={<DesempenhoOperacionalPage />} />
              <Route path="/avaliacoes/tempo-avaliacoes" element={<DashboardTempoAvaliacoes />} />
              <Route path="/tarefas/tempo-avaliacoes" element={<Navigate to="/avaliacoes/tempo-avaliacoes" replace />} />
              <Route path="/desempenho/operacional" element={<Navigate to="/tarefas/desempenho" replace />} />
              <Route path="/desempenho/tempo-avaliacoes" element={<Navigate to="/avaliacoes/tempo-avaliacoes" replace />} />
              <Route path="/assistente" element={<AssistentePage />} />
              {/* MÓDULO PROPOSTAS — isolado */}
              <Route path="/propostas" element={<PropostaHistoricoPage />} />
              <Route path="/propostas/nova" element={<PropostaCreatePage />} />
              <Route path="/propostas/setup" element={<PropostaSetupPage />} />
              <Route path="/propostas/conversa" element={<PropostaConversacionalPage />} />
              <Route path="/propostas/dados-render" element={<PropostaDadosRenderPage />} />
              <Route path="/propostas/perguntas" element={<PropostasPerguntasPage />} />
              <Route path="/propostas/:id/preview" element={<PropostaPreviewPage />} />
              <Route path="/propostas/:id" element={<PropostaPreviewPage />} />
              <Route path="/propostas/templates" element={<TemplateImportPage />} />
              <Route path="/propostas/produtos" element={<ProdutosConversacionalPage />} />
              <Route path="/propostas/produtos/grid" element={<PropostaProdutosPage />} />
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
