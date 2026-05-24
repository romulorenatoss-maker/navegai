# Navegai - Mapa de Erros Conhecidos

| Mensagem de erro | Quando ocorre | Modulo | Tela | Action_id | Arquivo/RPC/tabela | Causa provavel | Correcao segura | Status |
|---|---|---|---|---|---|---|---|---|
| `coluna nao existe` | Tarefas/resumo/notas | tarefas | desempenho/execucao | NAO ENCONTRADO NO CODIGO | docs em `src/modules/tarefas/docs/*colunas*` | divergencia entre frontend/RPC/migration | consultar docs do modulo e migration mais recente | conhecido |
| `PDF nao disponivel` | Preview de propostas | propostas | `/propostas/templates` | `propostas.preview_pdf` | `preview-proposta`, storage | falha CloudConvert/storage | verificar function e bucket `propostas-templates` | conhecido |
| `permissao negada` | menus/actions | geral | varias | NAO ENCONTRADO NO CODIGO | `usePermissions`, RLS/policies | rota/tela sem permissao efetiva | checar `12` e `20` | conhecido |
| `Resource not accessible by integration` | GitHub API app | devops | NAO APLICAVEL | NAO APLICAVEL | GitHub App | app sem contents write | usar PAT ou ajustar app | externo |
