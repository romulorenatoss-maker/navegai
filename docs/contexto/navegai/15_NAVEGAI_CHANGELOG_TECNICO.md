# Navegai - Changelog Tecnico

## 2026-05-24 - Memoria de incidente Supabase client

- Incidente reportado: tela branca em mobile/desktop apos publicar.
- Causa confirmada pelo Lovable: `src/integrations/supabase/client.ts` usava `import.meta.env.VITE_SUPABASE_URL`; no bundle publicado ficou `undefined`, gerando `supabaseUrl is required` no boot.
- Correcao aplicada no Lovable: restaurar padrao Lovable com Supabase URL e anon/publishable key disponiveis diretamente no client frontend.
- Regra futura: nao converter `client.ts` para depender somente de `import.meta.env` sem validar deploy publicado; service role e demais secrets continuam proibidos no frontend.

## 2026-05-24 - Etapas do executor persistentes

- Pedido: gravar inicio/fim de etapa, tempo decorrido, atraso de inicio/fim e manter respostas/anexos ao fechar/reabrir.
- Banco/RPC: criada migration `20260524170000_tarefas_etapas_execucao_persistente.sql`.
- Tabela: `operational_assignment_stage_runs`.
- RPCs: `tarefas_rpc_executor_iniciar_etapa`, `tarefas_rpc_executor_finalizar_etapa`, `tarefas_rpc_executor_autosalvar_respostas`.
- Frontend: `tarefas_fluxoExecutorPanel.tsx` passou a usar estado de etapa vindo do banco; `tarefas_execucaoPage.tsx` e `tarefas_tarefaCard.tsx` exibem etapa em andamento e tempo decorrido na lista.
- Regra preservada: `Enviar respostas ao aprovador` continua sendo o unico comando que muda a tarefa para `aguardando_aprovacao`.

## 2026-05-24 - Setup de memoria tecnica

- Pedido: aplicar gabarito global e criar mapas para acelerar leitura/escrita.
- Criado: `docs/contexto/navegai/00_*` ate `25_*`.
- Implementacao funcional: nenhuma.
- Banco/RPC/trigger/policy: nao alterados.
- Regra futura: toda alteracao deve atualizar mapa especifico, indice quando aplicavel e este changelog.

## Referencias recentes observadas

- Commit remoto atual antes do setup: `3bc7ef94` / historico local indicava `5e338e32` antes dos testes.
- Ultima migration observada: `20260524154658_551e81ea-9256-4610-a24d-a8e785b1d0f9.sql`.
