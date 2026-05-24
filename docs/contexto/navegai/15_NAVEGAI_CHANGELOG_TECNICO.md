# Navegai - Changelog Tecnico

## 2026-05-24 - Storage seguro mobile

- Incidente prevenido: Safari/iOS/WebView pode lancar `SecurityError` ao acessar `localStorage`/`sessionStorage`, causando tela branca antes do React montar.
- Correcao Lovable incorporada: `src/integrations/supabase/client.ts` usa storage seguro com fallback em memoria para Auth do Supabase.
- Ajuste complementar: `src/hooks/useSessionTracker.ts` usa helpers `safeSessionGet`, `safeSessionSet` e `safeSessionRemove` tambem no `beforeunload` e no encerramento de sessao.
- Regra futura: nao acessar storage do navegador direto em codigo de boot/sessao; sempre usar wrapper seguro.

## 2026-05-24 - Hotfix RPC de etapas indisponivel

- Incidente reportado: ao iniciar etapa no mobile, Supabase retornou `Could not find the function public.tarefas_rpc_executor_iniciar_etapa(...) in the schema cache`.
- Causa provavel: frontend publicado chegou antes da migration/RPC estar aplicada ou antes do cache PostgREST atualizar.
- Correcao: `tarefas_fluxoExecutorPanel.tsx` agora cai para modo local se RPC de etapa/autosave estiver indisponivel, sem travar a tela.
- Ajuste visual: botoes Iniciar/Finalizar desabilitados agora ficam claramente cinza no mobile.
- Regra futura: toda RPC nova usada pelo frontend precisa de fallback ou bloqueio visual ate o banco estar disponivel.

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
