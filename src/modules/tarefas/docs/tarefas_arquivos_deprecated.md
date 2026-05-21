# Arquivos legados deprecated (rebuild do fluxo — 2026-05-21)

> Estes arquivos foram **DEPRECATED** durante a Fase 6 do rebuild do fluxo de tarefas.
> Eles ainda existem porque têm consumidores **fora do escopo** do rebuild (gestaoPage, avaliador legado).
> **Não usar em código novo.** Toda regra de fluxo executor→aprovador→auditor mora em `src/modules/tarefas/fluxo/`.

---

## Hooks deprecated

| Arquivo | Substituto | Notas |
|---|---|---|
| `hooks/tarefas_useFlowPermissions.ts` | `fluxo/hooks/tarefas_useFluxoPermissoes.ts` | Mesmas regras, novo nome em pt-br |
| `hooks/tarefas_usePlanosAcao.ts` | `fluxo/hooks/tarefas_useFluxoTarefa.ts` + `useExecutorActions` / `useAprovadorActions` / `useAuditorActions` | Hook único de leitura + actions separadas |
| `hooks/tarefas_useApprovalFlow.ts` | `fluxo/hooks/tarefas_useFluxoTarefa.ts` + `useAprovadorActions` | gestaoPage ainda usa para aprovação rápida — futuro: migrar |
| `hooks/tarefas_useAuditFlow.ts` | `fluxo/hooks/tarefas_useFluxoTarefa.ts` + `useAuditorActions` | sem consumidor ativo após rebuild |
| `hooks/tarefas_useAssignmentExecution.ts` | (não substituído) | mantido por enquanto — gerencia respostas locais antes do envio R0. Futuro: integrar ao FluxoExecutorPanel |

## Componentes deprecated

| Arquivo | Substituto | Notas |
|---|---|---|
| `components/tarefas_embeddedActionPanels.tsx` | `fluxo/components/tarefas_fluxoAprovadorPanel.tsx` + `tarefas_fluxoAuditorPanel.tsx` | `EmbeddedReviewPanel` (avaliador legado) ainda presente — fora do escopo do rebuild |
| `components/tarefas_executorPlanoAprovadorCard.tsx` | (manter por compat) | reusado pelo `FluxoExecutorPanel`. Futuro: absorver no novo componente |
| `components/tarefas_painelRetornoCard.tsx` | (não substituído) | renderiza retorno simples ao executor — manter |
| `components/tarefas_reviewFieldCard.tsx` | (não substituído) | usado pelo avaliador legado |

---

## Resumo arquitetural

| Camada | Antigo | Novo (oficial) |
|---|---|---|
| **Banco — RPCs** | `tarefas_rpc_aprovador_criar_plano_acao`, `tarefas_rpc_auditor_criar_plano_acao` | `tarefas_rpc_executor_enviar_respostas`, `tarefas_rpc_executor_responder_plano_aprovador`, `tarefas_rpc_aprovador_criar_plano_executor`, `tarefas_rpc_aprovador_aprovar_para_auditoria`, `tarefas_rpc_aprovador_responder_plano_auditor`, `tarefas_rpc_auditor_criar_plano_aprovador`, `tarefas_rpc_auditor_aprovar_auditoria` |
| **Banco — Tabelas (plano)** | `operational_field_reviews` (legacy, só leitura) | `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor` |
| **Banco — Triggers de status** | 4 triggers `tarefas_trigger_status_apos_*` (drop em 20260521) | Status controlado pelas RPCs |
| **Frontend — Leitura** | `useApprovalFlow` + `useAuditFlow` + `usePlanosAcao` (3 hooks distintos) | `useFluxoTarefa` (hook único) |
| **Frontend — Actions** | mutations espalhadas | `useExecutorActions`, `useAprovadorActions`, `useAuditorActions` |
| **Frontend — Permissões** | `useFlowPermissions` (regras misturadas) | `useFluxoPermissoes` + `tarefas_fluxoStatusMachine` (funções puras) |
| **Frontend — Painéis** | `EmbeddedApprovalPanel`, `EmbeddedAuditPanel` | `FluxoAprovadorPanel`, `FluxoAuditorPanel`, `FluxoExecutorPanel` |
| **Frontend — RPC calls** | espalhados pelos hooks | `tarefasFluxoRpcService` (única verdade) |

---

## Roadmap pós-deprecation

1. **Migrar `gestaoPage.tsx`** para usar `useAprovadorActions.aprovarParaAuditoria` em vez de `useApprovalFlow.finalDecision` → permite remover `useApprovalFlow.ts`.
2. **Refatorar avaliador legado** (`EmbeddedReviewPanel`) para integrar ao novo fluxo ou descontinuar — remove `tarefas_reviewFieldCard.tsx` e o resto de `embeddedActionPanels.tsx`.
3. **Absorver R0 do executor** dentro do `FluxoExecutorPanel` (sem `useAssignmentExecution`) → remove o hook.
4. **Excluir fisicamente** os 9 arquivos quando não houver consumidor.

---

*Documento criado durante Fase 6 do rebuild — 2026-05-21.*
