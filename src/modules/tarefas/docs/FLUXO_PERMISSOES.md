# Fluxo de Permissões — Módulo Tarefas

> **Documento de referência.** Toda alteração no fluxo de aprovação/auditoria
> DEVE consultar este documento antes. Toda regra nova DEVE ser adicionada
> ao hook `useFlowPermissions` — nunca espalhada na UI.

---

## Princípios fundamentais

1. **Quem age = quem o STATUS define.** Nunca o papel do usuário.
   - Status `aguardando_auditoria` → ação é do auditor, mesmo que o usuário também seja aprovador.
2. **UI nunca decide nada sozinha.** Toda permissão vem do hook `useFlowPermissions`.
3. **Registro passado é imutável.** Plano R1 respondido fica congelado quando vai para R2.
4. **Backend é fonte da verdade.** Frontend só renderiza decisões já tomadas.
5. **1 regra = 1 RPC + 1 trigger.** Cada transição de status tem sua função própria no Supabase.

---

## Mapa de estados

```
[criada]
    ↓
PENDENTE / EM_ANDAMENTO
    │  executor responde
    ↓
AGUARDANDO_APROVACAO
    │
    ├─── aprovador devolve campo ──→ DEVOLVIDA ──→ executor refaz ──→ AGUARDANDO_APROVACAO
    │
    └─── aprovador aprova tudo ──→ AGUARDANDO_AUDITORIA
                                       │
                                       ├─── auditor confirma ──→ CONCLUIDA  ◀── FIM
                                       │
                                       └─── auditor devolve campo ──→ AGUARDANDO_APROVACAO
                                                                          │  (com plano auditor pendente)
                                                                          ↓
                                                                       aprovador responde
                                                                          │
                                                                          ↓
                                                                       AGUARDANDO_AUDITORIA
                                                                          │  (plano auditor respondido)
                                                                          ↓
                                                                       auditor avalia resposta
                                                                          │
                                                                          ├─── Conforme + Confirmar ──→ CONCLUIDA
                                                                          └─── NC ──→ AGUARDANDO_APROVACAO (loop)
```

---

## Tabela de permissões por fase

| Fase | Status | Plano auditor | Executor | Aprovador | Auditor |
|---|---|---|---|---|---|
| 1 — Executor preenche | pendente / em_andamento / reaberta | — | ✅ edita tudo | ❌ não vê | ❌ não vê |
| 2 — Aprovador avalia | aguardando_aprovacao | sem | ❌ read-only | ✅ tudo livre | ❌ não vê |
| 3 — Executor refaz | devolvida | — | ✅ só devolvidos | ❌ read-only | ❌ não vê |
| 4 — Aprovador avalia R{n} | aguardando_aprovacao | sem | ❌ read-only | ✅ Conforme/NC do plano | ❌ não vê |
| 5 — Auditor avalia | aguardando_auditoria | — | ❌ não vê | 🔒 TUDO travado | ✅ tudo livre |
| 6 — Auditor devolveu | aguardando_aprovacao | **pendente** | ❌ não vê | 🔒 só campo devolvido livre | ❌ read-only |
| 7 — Auditor avalia resposta | aguardando_auditoria | respondido | ❌ não vê | 🔒 TUDO travado | ✅ marca Conforme/NC |
| FINAL | concluida / aprovada | — | ❌ read-only | ❌ read-only | ❌ read-only |

---

## Como o hook decide

`useFlowPermissions(assignment, meusSetorIds?)` — `profile` e `isAdmin` vêm de `useAuth()` automaticamente.

### 1. Detecta o papel do usuário

```ts
status === AGUARDANDO_AUDITORIA  →  role = "auditor"
status === AGUARDANDO_APROVACAO  →  role = "aprovador"
status DEVOLVIDA / PENDENTE / EM_ANDAMENTO  →  role = "executor"
status final  →  role = "spectator"
```

Se a pessoa não tem permissão no papel do status atual, vê como `spectator` (read-only).

### 2. Carrega planos do auditor

Query única: `operational_field_reviews` com `criado_por_papel='auditor'` e `destinatario_papel='aprovador'`.

- `hasAuditorPlansPending` = existe algum com `respondido != true`
- `fieldsDevolvidosPeloAuditor` = Set dos `field_id` desses planos pendentes

### 3. Computa permissões

```ts
approverPanelRestricted =
    status === AGUARDANDO_AUDITORIA
    || (status === AGUARDANDO_APROVACAO && hasAuditorPlansPending)

canApproverDecideField(fieldId) =
    aprovadorEmAcao
    && (
        !hasAuditorPlansPending
        || fieldsDevolvidosPeloAuditor.has(fieldId)
    )

canApproverFinalize =
    aprovadorEmAcao
    && (
        !hasAuditorPlansPending
        || fieldsDevolvidosPeloAuditor.size > 0
    )
```

### 4. UI sempre consulta `perms.X` — nunca calcula sozinha

❌ Errado:
```tsx
{assignment.status === "aguardando_auditoria" && ...}
```

✅ Certo:
```tsx
{perms.approverPanelRestricted && ...}
{perms.canApproverDecideField(f.id) && <Button>Conforme</Button>}
<Button disabled={!perms.canApproverFinalize} title={perms.approverButtonTooltip}>Aprovar</Button>
```

---

## Backend — RPCs e triggers propostos (1 regra = 1 função)

> Aplicar via Supabase Dashboard ou migration manual.

### Transições

| RPC | Quando | O que faz |
|---|---|---|
| `tarefas_rpc_executor_submeter` | executor envia resposta | status → aguardando_aprovacao |
| `tarefas_rpc_aprovador_devolver_campo` | aprovador devolve campo | cria field_review devolvido + status → devolvida |
| `tarefas_rpc_aprovador_aprovar` | aprovador finaliza | calcula score · marca planos auditor respondido · status → aguardando_auditoria |
| `tarefas_rpc_auditor_criar_plano` | auditor pede campo de volta | cria field_review com criado_por_papel='auditor' + status → aguardando_aprovacao |
| `tarefas_rpc_auditor_confirmar` | auditor finaliza | grava score do aprovador · status → concluida |

### Triggers de validação

| Trigger | Tabela | Função |
|---|---|---|
| `tarefas_trigger_bloqueia_edicao_fora_status` | operational_assignments | rejeita UPDATE em campos protegidos quando status não permite |
| `tarefas_trigger_score_automatico` | operational_assignments (status change) | calcula `score_aprovacao` e `score_auditor` na transição correta |
| `tarefas_trigger_flag_atraso_plano` | operational_field_reviews | marca `flag_atraso_plano_acao` no assignment quando prazo do plano estoura |

---

## Pontos de atenção (bugs históricos)

1. **Dado órfão em `operational_field_reviews`** — auditor plans antigos com `respondido=null` ficam em `planosAuditorPendentes` permanentemente, destravando campos indevidamente. **Solução:** garantir que `respondido` default seja `false` (não NULL) e auditor planos sempre tenham esse valor explícito.
2. **Status muda mas cache da query não invalida** — sempre usar `staleTime: 0` + `refetchOnMount: true` para `planosDoAuditor` e `fieldReviewsAuditor`.
3. **`emAuditoria` checked direto na UI** — sempre que ver isso, trocar por `perms.X`.

---

## Como adicionar uma nova regra

1. Edite `tarefas_useFlowPermissions.ts` adicionando a permissão ao retorno.
2. Atualize esta tabela de permissões.
3. Crie RPC + trigger correspondente no backend.
4. Use `perms.suaNovaPermissao` na UI — nunca `assignment.status === "..."` direto.

---

*Última atualização: 2026-05-20 — reescrita do fluxo para fonte única de verdade.*
