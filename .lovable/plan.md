# Reconstrução do Núcleo do Builder de Rotinas

## Escopo confirmado por você

Apagar `checklistNormalizers.ts` e reescrever 4 arquivos do builder mantendo apenas o layout visual. **Nenhuma regra antiga de normalização, sync, hidratação inline ou save parcial é preservada.**

## Volume real

| Arquivo | Linhas | Ação |
|---|---|---|
| `pages/tarefas_rotinasPage.tsx` | 1055 | Reescrever |
| `components/builder/StepChecklistAprovador.tsx` | 275 | Reescrever |
| `components/builder/StepChecklistValidador.tsx` | 254 | Reescrever |
| `components/builder/TarefasBuilderWizard.tsx` | 222 | Reescrever |
| `components/builder/checklistNormalizers.ts` | 212 | Deletar |
| `core/tarefas_builder_*.ts` | — | (Re)criar 6 arquivos |

Total: ~2.000 linhas de rewrite + criação. Não dá pra fazer tudo num único call sem perder UX/tabs.

## Confirmações necessárias antes de eu tocar em qualquer arquivo

Esses pontos não estão no seu texto e mudam o resultado. Preciso da sua decisão escrita:

1. **`field.id` ausente em fields novos.** A regra `buildActiveFieldIds` só inclui fields com `id`. Field recém-criado pelo usuário (ainda sem `id` do banco) **não entra** no snapshot. Confirma que isso é intencional? (na prática significa: não dá pra salvar sem antes inserir no banco e recarregar — ou o save tem que persistir fields novos antes de montar o snapshot).

2. **`StepChecklistAprovador` reescrito sem normalizer.** Hoje ele usa `defaultAprovadorCheckItem`, `isAprovadorReplicada`, `normalizeAprovadorList` para pesos, SLA, opções, regras, evidência, ponderação. **Você quer perder tudo isso** e ficar só com `{ field_id, pergunta, ativo }` minimalista? Ou manter a UI atual (peso/SLA/evidência/etc.) e só remover o sync automático? Sua instrução literal implica perda total — confirme.

3. **`StepChecklistValidador` idem.** Hoje normaliza `tipo_resposta`, peso, opções, ponderação, SLA. `rebuildValidadorChecks` proposto **só faz `filter(Boolean)`** — descarta toda lógica. Confirma perda total?

4. **Migration de banco.** Você disse antes "NÃO mexer em banco". Confirmando: **não vou criar coluna `ativo` nem nada novo**. O contrato continua sendo: fields ativos = `snapshot.checklists.avaliado_field_ids`. Banco fica intacto.

5. **`saveFieldsOnly` atualmente é chamada no auto-save da aba Builder.** Removendo, o auto-save da aba precisa virar `upsert` completo. Isso é mais lento (salva tudo). Confirma?

6. **Componentes que importam normalizer indiretamente** (`tarefas_useContingencyManagement`, `tarefas_embeddedContingencyPanel`) usam `operational_template_check_items` mas **não importam o normalizer**. Eles ficam intactos — só removo `operational_template_check_items` do código do **builder**, não das contingências. Confirma?

## Ordem de execução proposta (após suas respostas)

```text
Fase A — Core (zero impacto, só cria arquivos)
  1. Criar/reescrever 6 arquivos em src/modules/tarefas/core/
     - tarefas_builder_fields.ts
     - tarefas_builder_snapshot.ts
     - tarefas_builder_hydrate.ts
     - tarefas_builder_aprovador.ts
     - tarefas_builder_validador.ts
     - tarefas_builder_save.ts

Fase B — Page (alto risco)
  2. Reescrever tarefas_rotinasPage.tsx
     - openEdit usa core
     - save unificado (sem saveFieldsOnly)
     - sem dedupe, sem fallback, sem hydrate inline
     - mantém tabs, layout, dialogs

Fase C — Builder Wizard
  3. Reescrever TarefasBuilderWizard.tsx (sem normalizers)
  4. Reescrever StepChecklistAprovador.tsx
  5. Reescrever StepChecklistValidador.tsx

Fase D — Limpeza
  6. Deletar checklistNormalizers.ts
  7. Verificar imports órfãos (rg)
  8. Build check

Fase E — Entrega
  9. diff + ZIP + manifest
```

Cada fase tem gate. Se algo quebrar visualmente em B, paro antes de C/D.

## O que NÃO farei sem nova confirmação

- Tocar em `tarefas_useContingencyManagement.ts`
- Tocar em `tarefas_embeddedContingencyPanel.tsx`
- Tocar em qualquer hook do executor/avaliado/auditor
- Tocar em `FieldConfigSheet.tsx`, `BuilderStepper.tsx`, `StepResumo.tsx`, `FieldVisibilityEditor.tsx`
- Migrations SQL
- Edge functions

## Risco principal

Reescrever Aprovador/Validador "sem aproveitar regra antiga" significa **perder configuração visível ao usuário** (peso, SLA, evidência, opções por resposta). Se o objetivo é "snapshot ≠ ressuscita pergunta", isso é resolvido só com o `rebuildAprovadorChecks` filtrando por `field_id`. Os outros campos (peso, SLA…) podem ser preservados sem quebrar o objetivo.

**Recomendo (mas só executo se você confirmar):** manter os campos de configuração no Aprovador/Validador (peso, SLA, evidência, opções), mas remover toda a sincronização automática e os normalizers legados. O filtro por `field_id` ativo é suficiente pra resolver "pergunta ressuscitada".

## Aguardando

Responda os 6 pontos acima (mesmo que com "sim a tudo literal" ou "aceito a recomendação") e eu executo Fase A→E em sequência, parando entre fases.
