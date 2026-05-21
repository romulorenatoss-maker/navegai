# Ajuste mobile - /tarefas/minhas

Escopo executado: somente responsividade mobile da tela oficial `/tarefas/minhas` e dos paineis oficiais em `src/modules/tarefas/fluxo/components/`.

Nao houve alteracao de regra de negocio, hook, RPC, trigger, banco, status ou permissao.

## Arquivos de layout alterados

- `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoAprovadorPanel.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoAuditorPanel.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoPerguntaHistoricoCard.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoPlanoAprovadorCard.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoPlanoAuditorCard.tsx`

## Causa mobile encontrada

- Filtros da tela usavam larguras fixas (`w-[140px]`, `w-[150px]`, `w-[180px]`, `w-[200px]`) em linha horizontal.
- Headers de cards usavam `flex items-center justify-between` sem quebra responsiva.
- Textos longos de pergunta/plano nao tinham `break-words` e `whitespace-normal`.
- Cards de planos nao protegiam o container com `max-w-full` e `overflow-hidden`.
- Botoes de formularios e rodape do drawer permaneciam lado a lado no mobile.
- Titulo do drawer usava `truncate`, ocultando conteudo em vez de quebrar linha.

## Correcao aplicada

- `flex-col sm:flex-row` para filtros, headers e botoes.
- `w-full sm:w-*` para inputs, selects e botoes no mobile.
- `max-w-full`, `overflow-hidden`, `break-words`, `whitespace-normal` nos cards e textos.
- Padding do drawer ajustado para `p-3 sm:p-4`.

## Validacao

- `npm.cmd run build`: passou.
- `git diff --check`: passou sem erro, apenas avisos de CRLF do Git no Windows.
- Playwright gerou prints mobile e desktop, mas a rota redirecionou para `/login` por falta de sessao autenticada local.

