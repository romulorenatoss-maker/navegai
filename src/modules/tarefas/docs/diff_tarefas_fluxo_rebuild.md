# DIFF — Rebuild do Fluxo de Tarefas (2026-05-21)

> Resumo das mudanças entregues nas 7 fases do rebuild. Refere ao comando
> `comando_claude_reconstruir_fluxo_tarefas.md`.

---

## COMMITS DO REBUILD

| # | Hash | Fase | Resumo |
|---|---|---|---|
| 1 | `e6b50c44` | FASE 1 | Migration consolidada — 7 RPCs oficiais + DROP 4 triggers de status |
| 2 | `388e38d2` | FASE 2 | Infra frontend — pasta `fluxo/` com types + status machine + rpcService + mapper |
| 3 | `15ae2dd3` | FASE 3 | 5 hooks — `useFluxoTarefa` (leitura único) + actions executor/aprovador/auditor + permissões |
| 4 | `d31c639f` | FASE 4 | 8 componentes — 3 painéis principais + 5 cards/banners |
| 5 | `f6793a40` | FASE 5 | Integração em `minhasTarefasPage.tsx` (substituição de painéis antigos) |
| 6 | `b15bfd65` | FASE 6 | `@deprecated` em 9 arquivos legados + doc de roadmap |
| 7 | _este_ | FASE 7 | Entregáveis (diff, manifest, rollback, checklist) |

---

## BANCO

### RPCs criadas / recriadas

| Função | Tipo | Status |
|---|---|---|
| `tarefas_rpc_executor_enviar_respostas` | NOVA | criada via CREATE OR REPLACE |
| `tarefas_rpc_executor_responder_plano_aprovador` | REFATORADA | controla status + resolve contingências |
| `tarefas_rpc_aprovador_criar_plano_executor` | NOVA (renomeada de `_criar_plano_acao`) | gate de plano auditor pendente |
| `tarefas_rpc_aprovador_aprovar_para_auditoria` | NOVA | bloqueia se planos pendentes |
| `tarefas_rpc_aprovador_responder_plano_auditor` | REFATORADA | resolve contingências + transição |
| `tarefas_rpc_auditor_criar_plano_aprovador` | NOVA (renomeada de `_criar_plano_acao`) | |
| `tarefas_rpc_auditor_aprovar_auditoria` | NOVA | finaliza tarefa |

### Triggers removidos (status controlado pelas RPCs)

| Trigger | Tabela |
|---|---|
| `tarefas_trigger_status_apos_aprovador_criar_plano` | `tarefas_planos_acao_aprovador` |
| `tarefas_trigger_status_apos_executor_responder_plano` | `tarefas_planos_acao_aprovador` |
| `tarefas_trigger_status_apos_auditor_criar_plano` | `tarefas_planos_acao_auditor` |
| `tarefas_trigger_status_apos_aprovador_responder_plano_auditor` | `tarefas_planos_acao_auditor` |

> Funções de trigger correspondentes mantidas com `COMMENT: DEPRECATED` por compat.

### Tabelas — papéis

| Tabela | Papel |
|---|---|
| `tarefas_planos_acao_aprovador` | OFICIAL — planos do aprovador para o executor |
| `tarefas_planos_acao_auditor` | OFICIAL — planos do auditor para o aprovador |
| `operational_field_answers` | OFICIAL — respostas originais do executor (R0) |
| `operational_field_reviews` | LEGADO — não usar para plano de ação |
| `operational_assignments` | mantida |
| `operational_audit_trail` | mantida — logs de status |
| `operational_score_logs` | mantida |
| `operational_contingencies` | mantida (resolvida automaticamente pelas RPCs) |

---

## FRONTEND

### Criados (`src/modules/tarefas/fluxo/`)

```
fluxo/
├── components/
│   ├── tarefas_fluxoExecutorPanel.tsx
│   ├── tarefas_fluxoAprovadorPanel.tsx
│   ├── tarefas_fluxoAuditorPanel.tsx
│   ├── tarefas_fluxoPerguntaHistoricoCard.tsx
│   ├── tarefas_fluxoPlanoAprovadorCard.tsx
│   ├── tarefas_fluxoPlanoAuditorCard.tsx
│   ├── tarefas_fluxoBannerPendenciaAuditor.tsx
│   └── tarefas_fluxoBotaoConformeNaoConforme.tsx
├── hooks/
│   ├── tarefas_useFluxoTarefa.ts        (HOOK ÚNICO de leitura)
│   ├── tarefas_useExecutorActions.ts
│   ├── tarefas_useAprovadorActions.ts
│   ├── tarefas_useAuditorActions.ts
│   └── tarefas_useFluxoPermissoes.ts
├── services/
│   ├── tarefas_fluxoStatusMachine.ts    (funções puras canXxx())
│   ├── tarefas_fluxoRpcService.ts       (única verdade de chamadas RPC)
│   └── tarefas_fluxoHistoricoMapper.ts
└── types/
    └── tarefas_fluxoTypes.ts
```

### Alterados

| Arquivo | Mudança |
|---|---|
| `pages/tarefas_minhasTarefasPage.tsx` | substitui `EmbeddedApprovalPanel`/`EmbeddedAuditPanel` por `FluxoAprovadorPanel`/`FluxoAuditorPanel` |
| `components/tarefas_embeddedActionPanels.tsx` | `@deprecated` JSDoc |
| `components/tarefas_executorPlanoAprovadorCard.tsx` | `@deprecated` JSDoc |
| `components/tarefas_painelRetornoCard.tsx` | `@deprecated` JSDoc |
| `components/tarefas_reviewFieldCard.tsx` | `@deprecated` JSDoc |
| `hooks/tarefas_useFlowPermissions.ts` | `@deprecated` JSDoc |
| `hooks/tarefas_usePlanosAcao.ts` | `@deprecated` JSDoc |
| `hooks/tarefas_useApprovalFlow.ts` | `@deprecated` JSDoc |
| `hooks/tarefas_useAuditFlow.ts` | `@deprecated` JSDoc |
| `hooks/tarefas_useAssignmentExecution.ts` | `@deprecated` parcial JSDoc |

### Não deletados (consumidores legados ativos)

Ver `tarefas_arquivos_deprecated.md` para roadmap de remoção física.

---

## BUSCAS OBRIGATÓRIAS

### 1. `operational_field_reviews` no fluxo NOVO

```
grep -R "operational_field_reviews" -l src/modules/tarefas/fluxo
```

**Resultado:** apenas `fluxo/hooks/tarefas_useFluxoTarefa.ts` (comentário NÃO referenciando a tabela). Nenhuma query/INSERT/UPDATE. ✅

### 2. RPCs antigas chamadas no frontend

```
grep -R "tarefas_rpc_aprovador_criar_plano_acao\|tarefas_rpc_auditor_criar_plano_acao" -l src/modules/tarefas
```

**Resultado:** zero chamadas ativas. Apenas comentários históricos em docs. ✅

### 3. Regra "TASK_STATUS.DEVOLVIDA libera edição"

```
grep -R "status === TASK_STATUS.DEVOLVIDA" src/modules/tarefas
```

**Resultado:** apenas em código legacy (deprecated) e regra de UI de botão "Iniciar para Responder" (que é OK — só inicia, não edita). ✅

---

*Gerado em 2026-05-21.*
