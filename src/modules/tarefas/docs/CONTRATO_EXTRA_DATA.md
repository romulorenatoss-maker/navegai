# Contrato `extraData` — Tarefa Avulsa (Fase 1)

Travado em P3. Espelha o cabeçalho do hook `tarefas_useTransition.ts`.

## Regras gerais
- snake_case obrigatório.
- Campos fora do contrato são ignorados pelo hook (mas vão para audit).
- `mensagem` em `extraData` NÃO grava em `messagesService`. Para mensagens use `postMessage`.
- `justificativa` é sinônimo de `motivo` (string obrigatória nas ações que pedem motivo).

## Campos comuns
| Campo | Tipo | Uso |
|---|---|---|
| `origem_acao` | string | Onde a ação foi disparada (drawer, lista, painel) |
| `papel_usado` | OperationalRole | Papel efetivo derivado por `resolveAssignmentRole` |
| `mensagem` | string | Texto livre adicional (audit) |
| `justificativa` | string | Sinônimo de motivo |

## Por TransitionAction

### responder_executor
- `autoConcluir: boolean` — chamador decide via `canAutoConclude`
- `tempoGasto: number` (min) → `tempo_gasto_minutos`
- `nota: number|null`

### negociar_prazo_executor
- `prazo_proposto: string` (ISO) **obrigatório**
- `prazo_anterior: string` (ISO) **obrigatório**
- `rodada_renegociacao: number`

### aceitar_renegociacao_solicitante
- `novoPrazo: string` (ISO) → `data_prevista`
- `prazo_anterior: string`

### manter_prazo_solicitante / recusar_renegociacao_solicitante
- `prazo_anterior: string`

### validar_solicitante_aprovar
- `requerAvaliacao: boolean`
- `requerAprovacao: boolean`
- `avaliador_id: string`
- `aprovador_id: string`
- `nota: number|null`

### validar_solicitante_devolver
- `rodadaAtual: number`

### solicitar_plano_acao
- `plano_acao_responsavel_id: string`
- `prazo_proposto: string` (ISO)

### concluir_plano_acao
- `resumo: string`

### avaliar_aprovar
- `requerAprovacao: boolean`
- `aprovadorProfileId: string`

### aprovar_final / encerrar_final
- `aprovadorId: string`
- `scoreFinal: number`

### reabrir_solicitante / reabrir_admin (P4)
- `quem_pode_reabrir: "solicitante"|"admin"|"ambos"` (snapshot)
- `dentro_da_janela: boolean`

### cancelar_solicitante / cancelar_admin
- `reauth_token: string` quando `exige_reauth_reabertura`

## P4 — `quem_pode_reabrir` default `"ambos"`
- Solicitante reabre dentro de `janela_reabertura_horas`, com justificativa.
- Executor não reabre direto: usa `messagesService` para solicitar.
- Admin/supervisor reabre sempre; reauth quando `exige_reauth_reabertura`.
- Toda reabertura registra em audit + history.
