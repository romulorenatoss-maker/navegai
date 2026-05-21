# Correcao visual do drawer /tarefas/minhas

Escopo executado: somente layout/estilo do drawer oficial de `/tarefas/minhas`, com foco no padrao visual mobile e desktop do formulario do executor.

## Causa encontrada

O mobile nao caia em um componente diferente. O drawer renderiza `FluxoExecutorPanel`, e o formulario real da pergunta e desenhado por `DynamicFieldRenderer`.

O bloco visual estranho `#numero · nome` vinha de um card de cabecalho duplicado dentro de `FluxoExecutorPanel`, repetindo metadados que ja existem no header do drawer.

## Arquivos alterados

- `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_fluxoExecutorPanel.tsx`
- `src/modules/tarefas/components/tarefas_dynamicFieldRenderer.tsx`

## O que mudou

- Header do drawer ficou mais compacto: `p-3 sm:p-4`, titulo com `text-sm sm:text-base`, `break-words`, `whitespace-normal` e metadados em segunda linha.
- Removido o card duplicado do executor que mostrava `#numero · nome` e status dentro do corpo.
- `DynamicFieldRenderer` agora renderiza a pergunta como `Card` + `CardContent`.
- Botoes `Conforme/Nao Conforme/N/A` e `Sim/Nao/N/A` viraram grid responsivo: 1 coluna no mobile, 2 ou 3 colunas no desktop conforme quantidade de opcoes.
- Textos longos receberam `break-words`, `whitespace-normal`, `max-w-full` via card e botoes `w-full`.

## Nao alterado

- Nenhuma regra de negocio.
- Nenhum hook.
- Nenhuma RPC.
- Nenhum banco.
- Nenhum trigger.
- Nenhum status.
- Nenhuma permissao.

## Validacao

- `npm.cmd run build`: passou.
- `git diff --check`: passou, com avisos normais de CRLF no Windows.
- Playwright gerou prints mobile/desktop, mas a rota local redirecionou para `/login` por falta de sessao autenticada.

