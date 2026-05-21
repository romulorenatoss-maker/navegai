# REGRAS DE NEGOCIO AFETADAS

- Fluxo executor/aprovador/auditor fica concentrado nos hooks e services oficiais de `src/modules/tarefas/fluxo/`.
- Historico imutavel e R0 travada foram preservados; nao houve alteracao SQL.
- A aprovacao rapida em gestao agora chama action oficial do aprovador para aprovacao.
- Reprovacao em gestao ainda usa `useOperationalTransition`, pois nao existe RPC oficial de reprovar no fluxo novo e criar uma agora seria novo motor/regra fora do pedido.
