# Navegai - Problemas, Riscos e Pendencias

## 1. Lista priorizada

| ID | Problema | Tipo | Severidade | Modulo | Arquivo | Risco | Acao recomendada | Status |
|---|---|---|---|---|---|---|---|---|
| R1 | Paginas legadas fazem insert/update/delete direto no Supabase | arquitetura/seguranca | alta | avaliacoes/leads/cadastros | `src/pages/*` | regra critica no frontend | migrar por action para services/RPCs | aberto |
| R2 | Functions admin/storage usam secrets/service role | seguranca | alta | configuracoes/tarefas | `supabase/functions/*` | bypass RLS se auth falhar | revisar validacao por function | aberto |
| R3 | Tarefas tem muitas migrations redefinindo RPCs | arquitetura | alta | tarefas | `supabase/migrations/202605*` | divergencia entre mapa e banco real | usar migration mais recente e docs existentes | aberto |
| R4 | `/auditoria` e placeholder | tela paralela/pendencia | media | auditoria | `src/App.tsx` | rota promete tela sem funcao | criar contrato ou remover | aberto |
| R5 | Possiveis arquivos nao roteados | arquivo morto | media | geral | `DashboardOperacionalKPIPage`, `FilaTarefasLeadsPage` | manutencao confusa | validar com busca antes de remover | aberto |
| R6 | Exportacao/download sem contrato unico | seguranca | media | relatorios/tarefas/propostas | varios | vazamento/copia | mapear por action antes de alterar | aberto |
| R7 | `.env` existe no repo local | secrets | alta | ambientes | `.env` | risco se commitado | confirmar `.gitignore`, nunca imprimir conteudo | monitorar |

## 2. Pendencias de confirmacao com usuario

| Pendencia | Motivo | Opcoes | Recomendacao |
|---|---|---|---|
| Nome comercial oficial | mapa assumiu Navegai | Navegai / Navegai Metricas / outro | confirmar antes de documentacao publica. |
| Auditoria | rota placeholder | implementar / esconder / manter pendente | decidir antes de promessa ao usuario final. |
| Modularizacao de Leads/Avaliacoes/Cadastros | hoje vivem em `src/pages` | migrar gradual / manter | migrar por demanda, sem refactor grande. |
