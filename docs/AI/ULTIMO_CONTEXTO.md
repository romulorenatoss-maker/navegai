# ULTIMO CONTEXTO

Data: 2026-05-21

## Estado atual

- Branch: `main`.
- Ultimo commit antes desta memoria unica: `93deb6aa`.
- Objetivo atual: consolidar toda memoria persistente de IA em `docs/AI/`.

## Contexto funcional recente

- O drawer de `/tarefas/minhas` foi consolidado para usar os paineis oficiais em `src/modules/tarefas/fluxo`.
- A R0 do executor foi protegida contra overwrite por migration nova.
- Artefatos finais do rebuild anterior existem como historico de deploy, mas a memoria ativa agora vive apenas em `docs/AI/`.
- Limpeza posterior removeu os hooks legados de permissao/aprovacao/auditoria/revisao e o painel legado orfao. Grep em source sem docs deve retornar zero para esses nomes.
- Ajuste posterior de UI corrigiu apenas responsividade mobile em `/tarefas/minhas` e paineis oficiais do fluxo, sem alterar regras, hooks, RPCs, banco ou permissoes.
- Ajuste posterior refinou o padrao visual do drawer de `/tarefas/minhas`: removeu o card duplicado do executor e padronizou o `DynamicFieldRenderer` como card responsivo, sem alterar regras, hooks, RPCs, banco, triggers, status ou permissoes.

## Regra de continuidade

Em novas tarefas, comece por `docs/AI/AI_BOOT.md`.
Nao use arquivos antigos de memoria fora de `docs/AI/` como regra ativa.
