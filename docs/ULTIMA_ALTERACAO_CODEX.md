# ULTIMA ALTERACAO CODEX

Data: 2026-05-21

## Objetivo

Preparar o repositorio para rodar no Lovable/GitHub com instalacao npm consistente e registrar a memoria inicial de governanca, incluindo o padrao global obrigatorio de arquitetura.

Base sincronizada: `origin/main` apos rebuild de tarefas do Claude ate `f43586ef`.

## Arquivos alterados

- `.gitignore`
- `package-lock.json`

## Arquivos criados

- `docs/PADRAO_ARQUITETURA_E_GOVERNANCA.md`
- `docs/MEMORIA_PROJETO_CODEX.md`
- `docs/ULTIMA_ALTERACAO_CODEX.md`

## Arquivos removidos

- Nenhum.

## Banco/RPC/Trigger impactados

- Nenhum. Nao houve alteracao em migrations, tabelas, RPCs, triggers ou Edge Functions.

## Diff real

- `.gitignore`: adiciona `.tools` para impedir commit do Node portatil local.
- `package-lock.json`: sincronizado com `package.json` por `npm install`, incluindo dependencias que ja estavam declaradas no manifest mas faltavam no lockfile.
- `docs/PADRAO_ARQUITETURA_E_GOVERNANCA.md`: registra o padrao obrigatorio de arquitetura, governanca, banco, modulo/menu, nomenclatura e validacao.
- `docs/MEMORIA_PROJETO_CODEX.md`: memoria inicial do projeto.
- `docs/ULTIMA_ALTERACAO_CODEX.md`: registro desta alteracao.

## Validacao feita

- `npm install` executado com Node portatil local.
- Servidor Vite abriu em `http://127.0.0.1:8080/` antes desta alteracao documental.
- `npm install --package-lock-only` executado apos sincronizar com `origin/main`.
- `npm run build` executado com sucesso apos commits do Claude.
- `npm test` executado com sucesso apos commits do Claude: 2 arquivos, 12 testes passaram.
- Avisos nao bloqueantes do build: Browserslist desatualizado, chunks grandes, `eval` em dependencia `bluebird`, imports dinamicos que nao geram chunk separado.

## Rollback sugerido

- Reverter o commit desta alteracao.
- Alternativa manual: remover `.tools` do `.gitignore`, restaurar `package-lock.json` do commit anterior e apagar os dois arquivos de docs criados.

## Pendencias

- Rodar `npm audit` em tarefa separada e decidir atualizacoes com possivel impacto.
- Confirmar no Lovable apos push se o ambiente usa npm ou bun.
