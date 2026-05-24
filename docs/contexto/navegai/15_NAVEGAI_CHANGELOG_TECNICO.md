# Navegai - Changelog Tecnico

## Registro

### 2026-05-24 00:45 - Memoria tecnica viva oficializada no git

- Pedido do usuario: adicionar os mapeamentos atualizados e regras dentro do diretorio git para qualquer IA ler como padrao.
- Tipo: documentacao/processo
- Modulo: geral
- Arquivos alterados: `AGENTS.md`, `docs/contexto/navegai/README_USO_RAPIDO_NAVEGAI.md`, `15_NAVEGAI_CHANGELOG_TECNICO.md`.
- Mapas atualizados: README da memoria e changelog.
- Actions alteradas: nenhuma.
- RPCs/triggers/policies alteradas: nenhuma.
- Tabelas alteradas: nenhuma.
- Permissoes alteradas: nenhuma.
- Risco: baixo, somente instrucao e documentacao.
- Rollback: remover `AGENTS.md` e reverter README/changelog.
- Observacao: a pasta oficial para leitura de IA passa a ser `docs/contexto/navegai/`.

### 2026-05-24 00:30 - Etapas locais no executor de tarefas

- Pedido do usuario: restaurar/implementar fluxo por etapas no topo do drawer de execucao sem criar tela paralela e sem mexer em aprovador/auditor.
- Tipo: frontend localizado
- Modulo: tarefas/fluxo executor
- Arquivos alterados: `tarefas_fluxoExecutorPanel.tsx`, `tarefas_dynamicFieldRenderer.tsx`, `tarefas_fluxoTypes.ts`, mapas de contexto e proposta futura em `src/modules/tarefas/docs`.
- Mapas atualizados: botoes/actions, fluxos principais, changelog.
- Actions alteradas: adicionadas actions locais visuais de iniciar/finalizar etapa; envio oficial ao aprovador mantido.
- RPCs/triggers/policies alteradas: nenhuma.
- Tabelas alteradas: nenhuma.
- Permissoes alteradas: nenhuma.
- Risco: medio, altera interacao do executor no drawer e bloqueio visual por etapa.
- Rollback: reverter os arquivos listados acima.
- Teste recomendado: validar tarefa com 1 etapa, 2 etapas, obrigatorios, evidencia obrigatoria, bloqueio/liberacao de etapa e envio final ao aprovador.
- Observacao: persistencia real de tempo por etapa ficou documentada separadamente e nao foi implementada nesta fase.

### 2026-05-24 00:00 - Setup de memoria tecnica V4

- Pedido do usuario: aplicar procedimento de mapeamento para acelerar execucao e alteracao de comandos.
- Tipo: mapa
- Modulo: geral
- Arquivos alterados: `docs/contexto/navegai/00_*` ate `25_*`
- Mapas atualizados: todos os mapas iniciais.
- Actions alteradas: nenhuma.
- RPCs/triggers/policies alteradas: nenhuma.
- Tabelas alteradas: nenhuma.
- Permissoes alteradas: nenhuma.
- Risco: baixo, somente documentacao.
- Rollback: remover `docs/contexto/navegai/`.
- Teste recomendado: `npm run test` e revisar mapas antes de usar como fonte definitiva.
- Observacao: mapeamento inicial baseado em leitura estatica; campos nao validados foram marcados como `NAO ENCONTRADO NO CODIGO`.
