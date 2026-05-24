# Navegai - Mapa de Arquivos Mortos e Duplicados

## 1. Suspeitos

| Item | Tipo | Caminho | Motivo | Acao recomendada |
|---|---|---|---|---|
| Relatorios de IA | Artefatos | `reports/AI_RETURN/*` | Pacotes/diffs antigos | Nao remover sem aprovacao |
| Memoria antiga | Docs | `docs/AI/*` | Pode conflitar com memoria nova | Preferir `docs/contexto/navegai` |
| Docs antigas tarefas | Docs | `src/modules/tarefas/docs/*` | Referencias uteis mas dispersas | Consultar so quando tarefa pedir |
| Pages legadas | Organizacao | `src/pages/*` | Fora de `src/modules` | Nao mover sem refatoracao aprovada |
| `FilaLeadsPage` e `FilaTarefasLeadsPage` | Possivel duplicidade | `src/pages` | Fluxos proximos | Validar uso antes de alterar |

## 2. Arquivos que NAO devem ser apagados sem analise

- `supabase/migrations/*`
- `src/integrations/supabase/types.ts`
- `package-lock.json`, `bun.lock`, `bun.lockb`
- `docs/tarefas_fluxo_validacao_final.md` e docs finais existentes, se forem evidencias de entrega
