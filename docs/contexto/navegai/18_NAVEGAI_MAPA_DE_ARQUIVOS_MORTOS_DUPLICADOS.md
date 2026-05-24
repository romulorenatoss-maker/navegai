# Navegai - Arquivos Mortos, Duplicados e Suspeitos

| Arquivo | Tipo | Motivo da suspeita | Usado por | Duplicado de | Risco | Acao recomendada | Pode remover? |
|---|---|---|---|---|---|---|---|
| `src/pages/DashboardOperacionalKPIPage.tsx` | page | rota nao encontrada em `App.tsx` | NAO ENCONTRADO NO CODIGO | tarefas dashboard | medio | buscar referencias antes | nao sem aprovacao |
| `src/pages/FilaTarefasLeadsPage.tsx` | page | rota `/leads/fila-tarefas` usa `FilaLeadsPage` | NAO ENCONTRADO NO CODIGO | `FilaLeadsPage.tsx` | medio | validar historico | nao sem aprovacao |
| `src/pages/InconsistenciasPage.tsx` | page | rota nao listada em `App.tsx` no mapeamento inicial | NAO ENCONTRADO NO CODIGO | avaliacoes/inconsistencias | medio | buscar referencias | nao sem aprovacao |
| `src/pages/InconsistenciasVinculadasPage.tsx` | page | rota nao listada em `App.tsx` no mapeamento inicial | NAO ENCONTRADO NO CODIGO | avaliacoes/inconsistencias | medio | buscar referencias | nao sem aprovacao |
| `src/pages/Index.tsx` | page | rota raiz usa `DashboardPage.tsx`, nao `Index.tsx` | NAO ENCONTRADO NO CODIGO | Dashboard | baixo | buscar referencias | nao sem aprovacao |
| `diff_*.md` na raiz | docs soltas | relatorios antigos fora de `reports`/`docs` | manual | NAO APLICAVEL | baixo | manter ate confirmar | nao sem aprovacao |
| referencias `V2` em migrations/docs | historico | gabarito proibe novas V2, mas legado existe | migrations/docs | NAO APLICAVEL | medio | nao replicar padrao V2 | nao |
