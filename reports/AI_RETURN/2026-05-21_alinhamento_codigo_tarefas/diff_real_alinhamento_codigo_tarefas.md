# Diff real - alinhamento codigo Tarefas com banco real

Data: 2026-05-21

Escopo executado:
- Sem SQL.
- Sem migration.
- Sem RPC.
- Sem frontend funcional.
- Sem alteracao em `supabase/migrations`.

Base usada:
- `operational_assignments.fim_em` existe.
- `operational_assignments.finalizado_em` nao existe no banco real.

## Arquivos alterados

### `src/modules/tarefas/fluxo/types/tarefas_fluxoTypes.ts`

```diff
-  finalizado_em: string | null;
+  fim_em: string | null;
```

Motivo: `TarefaFluxoAssignment` representa linha de `operational_assignments`; a coluna real e `fim_em`.

### `src/modules/tarefas/docs/tarefas_rpc_executor_enviar_respostas.md`

```diff
-5. Marca `finalizado_em = now()` se ainda nulo
+5. Marca `fim_em = now()` se ainda nulo
```

Motivo: documentacao da RPC estava apontando coluna inexistente no banco real.

### `src/modules/tarefas/docs/FLUXO_PERMISSOES.md`

```diff
-| `executor_entregou_no_prazo` / `executor_atrasou` | Executor entregou no prazo? | Sim = atrasou (tira) | `finalizado_em > prazo_execucao` ou `flag_sla_estourado` |
+| `executor_entregou_no_prazo` / `executor_atrasou` | Executor entregou no prazo? | Sim = atrasou (tira) | `fim_em > prazo_execucao` ou `flag_sla_estourado` |
```

Motivo: regra documentada deve usar a coluna real `fim_em`.

## ZIP Lovable analisado

Arquivo analisado: `C:/Users/Lenovo/Downloads/correcao_tarefas_rpc_fim_em.zip`

Conteudo:
- `migration_rpc_fix.sql`
- `diff_real_correcao_tarefas.md`
- `manifest_correcao.json`
- `validacao_fluxo_tarefas.md`

Observacao: o ZIP descreve correcao SQL/RPC de `finalizado_em` para `fim_em`, mas esta tarefa proibiu aplicar SQL, criar migration ou alterar RPC. Por isso o ZIP foi usado apenas como referencia.
