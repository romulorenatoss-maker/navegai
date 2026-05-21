# TESTES EXECUTADOS

- Validacao textual de memoria paralela: passou.
- `git diff --check`: passou.
- `npm.cmd run build`: passou.
- Geracao de `DIFF_COMPLETO.patch`.
- Geracao de `TREE_ANTES.txt` e `TREE_DEPOIS.txt`.

Avisos nao bloqueantes do build:

- Browserslist/caniuse-lite desatualizado.
- `eval` em dependencia `bluebird`.
- Alguns imports dinamicos nao foram separados em chunk.
- Chunks acima de 500 kB.
