# TESTES EXECUTADOS

- `rg` antes para provar imports reais.
- `rg` depois em source sem docs para provar zero referencias aos hooks/paineis deletados.
- `npm.cmd run build`: passou.
- `git diff --check`: executado depois do build.

Avisos do build: browserslist desatualizado, `eval` em `bluebird`, chunks grandes e imports dinamicos que nao separam chunk. Nao sao bloqueantes e ja existiam.
