# Reconstrução Controlada — Núcleo do Módulo Tarefas

## Princípios (não negociáveis)
- **Source of truth única:** banco. Snapshot vira cache. React state vira só UI.
- **Nada de fallback implícito, dedupe mágico, sync invisível, hidratação parcial.**
- **Rotas, tabs, layout, menu e UX preservados** — só o núcleo muda.
- **Banco não é tocado** sem migração explícita revisada.
- **Cada etapa termina com gate de aprovação do usuário** antes da próxima.

## Pré-requisito (já entregue)
Backup completo em `builder_rotinas_backup.zip` + 5 docs (`mapa_tecnico`, `fluxo`, `dependencias`, `tabelas_campos`, `pontos_de_risco`). Esse é o estado-base de rollback.

---

## Etapa 0 — Confirmação de escopo (este plano)
Antes de qualquer arquivo ser alterado, o usuário aprova:
1. Lista de arquivos a tocar (abaixo).
2. Decisão sobre **field ativo** (3 opções na Etapa 4).
3. Decisão sobre **migração de banco** (sim/não, ver Etapa 4).

---

## Etapa 1 — Limpeza congelada (sem reescrita)
Objetivo: remover código comprovadamente morto, **sem mudar comportamento**.

Ações:
- Remover `purgeLegacyBuilderDrafts` se já não houver draft legado em produção (verificar telemetria/console).
- Remover imports não usados em `tarefas_rotinasPage.tsx` (`buildAprovadorAutomatico`, `defaultAprovadorCheckItem`, `defaultSection`, `defaultField`, `defaultStep` se não referenciados).
- Marcar `operational_template_check_items` como legado (delete-only) — adicionar comentário formal e isolar em uma única função `removeLegacyCheckItems(templateId)`.
- Remover `savedAvaliadorFieldKeys` (já é `void` no openEdit).

Entregáveis: diff, ZIP, manifest, lista do que foi removido.
**Gate de aprovação.**

---

## Etapa 2 — Criar camada `core/` (vazia, com contratos)
Criar a pasta `src/modules/tarefas/core/` e os arquivos com **assinaturas e tipos**, sem implementação ainda:

```
core/
  tarefas_builder_types.ts        // FieldAtivo, SectionAtiva, BuilderState, SaveResult
  tarefas_builder_fields.ts       // loadActiveFields, saveFields
  tarefas_builder_sections.ts     // loadSections, saveSections
  tarefas_builder_snapshot.ts     // readSnapshot, writeSnapshot (cache only)
  tarefas_builder_hydrate.ts      // hydrateBuilder(templateId) → BuilderState
  tarefas_builder_save.ts         // saveBuilder(state) — orquestra tudo
  tarefas_builder_aprovador.ts    // syncAprovador (puro)
  tarefas_builder_validador.ts    // syncValidador (puro)
  tarefas_builder_visibility.ts   // resolveVisibility (puro)
  tarefas_builder_scoring.ts      // resolveScoring (puro)
```

Regras:
- Funções **puras** sempre que possível.
- Acesso ao Supabase isolado em `_repo.ts` interno.
- Zero `setState` dentro de core.

Entregáveis: arquivos novos + diff.
**Gate de aprovação.**

---

## Etapa 3 — Decisão sobre "field ativo" (bloqueia Etapa 4)
Três opções (precisamos de uma escolha do usuário):

| Opção | Como | Migração DB | Custo | Risco |
|---|---|---|---|---|
| **A. Coluna `ativo` em `operational_template_fields`** | `ALTER TABLE ADD COLUMN ativo BOOLEAN DEFAULT TRUE`; "remover" = `UPDATE ativo=false` | SIM (1 coluna + backfill) | Baixo | Baixo — padrão clássico, não quebra histórico |
| **B. Tabela relacional `operational_template_active_fields`** | Lista explícita de fields ativos por template | SIM (nova tabela) | Médio | Médio |
| **C. Snapshot oficializado (`avaliado_field_ids`) com regra estrita** | Sem mudança de DB, mas snapshot vira contrato (vazio = vazio) | NÃO | Mínimo | Mantém o snapshot como source of truth parcial — viola o princípio "snapshot ≠ mini-banco" |

**Recomendação:** Opção A. Mínima, alinhada ao princípio, resolve definitivamente o bug "perguntas removidas voltam".

**Gate de aprovação obrigatório aqui.**

---

## Etapa 4 — Migração de banco (se Opção A ou B)
Se A:
```sql
ALTER TABLE operational_template_fields
  ADD COLUMN ativo BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX idx_otf_template_ativo ON operational_template_fields(template_id, ativo);
-- Backfill: marcar como inativo todos os ids que não estão em avaliado_field_ids do snapshot
-- (script auditado e revisado linha-a-linha antes de rodar)
```

Ajustar:
- `fetchReferencedFieldIds` continua existindo, mas só serve para **logs/UI** ("este campo tem histórico"), nunca para decidir UI.
- Todos os `SELECT operational_template_fields` no app passam a filtrar `ativo=true`.

Entregáveis: migração + script de backfill auditável + plano de rollback (`UPDATE ... ativo=true; DROP COLUMN`).
**Gate de aprovação obrigatório.**

---

## Etapa 5 — Reescrita de `hydrate` e `save` (core)
Implementar de fato:
- `hydrateBuilder(templateId)`: lê banco (com `ativo=true`), monta `BuilderState`. **Sem fallbacks**.
- `saveBuilder(state)`: transação lógica → upsert sections, upsert fields ativos, **soft-delete** dos removidos (`ativo=false`), atualiza snapshot **só como cache derivado**.
- `saveFieldsOnly` deixa de existir como caminho paralelo — vira chamada do mesmo `saveBuilder`.

A page `tarefas_rotinasPage.tsx` passa a chamar:
```ts
const state = await hydrateBuilder(t.id);
setBuilderState(state);
// ...
await saveBuilder(builderState);
```

Estados React reduzidos a um único `builderState` (ou poucos slices coesos).

Entregáveis: diff completo + testes manuais documentados.
**Gate de aprovação.**

---

## Etapa 6 — Snapshot vira cache
- Remover qualquer leitura crítica do snapshot.
- `ada_config_snapshot.checklists` mantém-se **apenas** como cache para resumos rápidos / relatórios.
- `openEdit` ignora `avaliado_field_ids` para decidir UI (usa `ativo=true` do banco).
- Snapshot é regravado pelo `saveBuilder` sempre como derivação do estado.

**Gate de aprovação.**

---

## Etapa 7 — Aprovador / Validador limpos
- `syncAprovadorReplicadasFromFields` movido para `core/tarefas_builder_aprovador.ts` como função pura.
- Replicadas sempre derivadas do estado de fields ativos no momento do save (sem hydrate paralelo).
- Validador idem.
- `StepChecklistAprovador` e `StepChecklistValidador` continuam sendo só apresentação.

**Gate de aprovação.**

---

## Etapa 8 — Auditoria de botões e tabs
- Varredura de `TarefasBuilderWizard` + tabs (`tarefas_tabGeral`, `tarefas_tabRecorrencia`, `tarefas_tabFormBuilder`, etc).
- Lista de botões/tabs sem função real ou com placeholder.
- Cada item: ou implementa função real ou é removido. **Sem placebo.**

Entregáveis: relatório `auditoria_botoes_tabs.md` + diff.
**Gate de aprovação.**

---

## Etapa 9 — Limpeza final + reorganização de pastas
- Mover utilitários puros restantes para `core/` ou `utils/`.
- Remover arquivos comprovadamente sem import (`rg -l`).
- Confirmar estrutura final:
  ```
  src/modules/tarefas/
    pages/  components/  components/builder/
    hooks/  services/  utils/  types/  core/
  ```
- Manifest final + ZIP de comparação contra backup inicial.

**Gate final.**

---

## Arquivos previstos para alteração
| Etapa | Arquivos |
|---|---|
| 1 | `tarefas_rotinasPage.tsx` (limpeza imports/dead code) |
| 2 | **novos** em `core/` |
| 4 | migração SQL + backfill |
| 5 | `tarefas_rotinasPage.tsx`, novos `core/*` |
| 6 | `core/tarefas_builder_snapshot.ts`, `tarefas_rotinasPage.tsx` |
| 7 | `core/tarefas_builder_aprovador.ts`, `core/tarefas_builder_validador.ts`, `checklistNormalizers.ts` (provável obsoleto) |
| 8 | `TarefasBuilderWizard.tsx`, `tarefas_tab*.tsx`, subcomponentes builder |
| 9 | Reorganização final |

**Não tocados:** `src/integrations/supabase/*`, hooks de execução/auditoria/aprovação fora do builder, qualquer outra tela do app.

---

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Migração de DB com dados em produção | Backfill em dry-run + revisão linha-a-linha + janela de manutenção |
| Quebrar telas que leem snapshot | Mapeamento prévio de todos os leitores do snapshot antes da Etapa 6 |
| Perda de regra implícita não documentada | Cada etapa tem gate; rollback via revert da chat |
| Aprovador/Validador desincronizados | Etapa 7 inclui teste manual roteirizado |

---

## O que preciso do usuário antes de começar
1. **Aprovar este plano** (ou pedir ajustes).
2. **Escolher Opção A / B / C** da Etapa 3.
3. **Confirmar autorização para migração de banco** (se A ou B).
4. Confirmar que aceita o modelo etapa-por-etapa com gate (sem execução em massa).

Sem essas respostas, **nada será alterado**.
