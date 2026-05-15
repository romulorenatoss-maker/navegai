# Aprovador sync fix — cirúrgico

## Causa raiz
- `openEdit` hidratava `aprovadorChecks` a partir de `ada_config_snapshot.checklists.aprovador`
  e do `sanitizeAprovadorChecks`, mas **não** re-sincronizava com a lista atual de `fields`
  do Avaliado. Snapshot continha replicadas órfãs → reapareciam ao reabrir.
- `upsert` (save) também serializava `aprovadorChecks` direto, sem antes reconciliar com
  os `fields` atuais → órfãos voltavam para o snapshot.

## Pontos A/B/C (checklistNormalizers.ts)
Já existentes na base atual (`isAprovadorReplicada`, detector unificado em
`normalizeAprovadorItem` por `field_id || pergunta_origem_id`, e
`syncAprovadorReplicadasFromFields`). Nenhuma alteração nova necessária neste arquivo.

## Pontos D/E/F (StepChecklistAprovador.tsx)
Já existentes na base: `useEffect` reduz a `setItems(prev => syncAprovadorReplicadasFromFields(prev, fields))`,
filtro do `ordered` usa `isAprovadorReplicada`, total `totalPeso` usa `ordered`. Sem mudanças.

## Ponto G (TarefasBuilderWizard.tsx)
Já existente: `useEffect` re-sincroniza ao mudar `fields` quando `hasAprovador`. Sem mudanças.

## Ponto H — openEdit (NOVO)
`src/modules/tarefas/pages/tarefas_rotinasPage.tsx`

```diff
- setAprovadorChecks(sanitizeAprovadorChecks(
-   apr, dedupedFields, pontuacaoConfig?.aprovador_pacote_padrao,
-   t.habilitar_perguntas_automaticas ?? true,
- ));
+ setAprovadorChecks(prev => {
+   const hydrated = sanitizeAprovadorChecks(
+     apr, dedupedFields, pontuacaoConfig?.aprovador_pacote_padrao,
+     t.habilitar_perguntas_automaticas ?? true,
+   );
+   // Re-sincroniza com fields atuais para descartar órfãos do snapshot.
+   return syncAprovadorReplicadasFromFields(hydrated, dedupedFields);
+ });
```

## Ponto I — upsert/save (NOVO)
`src/modules/tarefas/pages/tarefas_rotinasPage.tsx`

```diff
- const aprovadorSnapshot = sanitizeAprovadorChecks(
-   aprovadorChecks, fields, pontuacaoConfig?.aprovador_pacote_padrao,
-   form.habilitar_perguntas_automaticas,
- );
+ const aprovadorSync = syncAprovadorReplicadasFromFields(aprovadorChecks, fields);
+ const aprovadorSnapshot = sanitizeAprovadorChecks(
+   aprovadorSync, fields, pontuacaoConfig?.aprovador_pacote_padrao,
+   form.habilitar_perguntas_automaticas,
+ );
```

## Import adicionado
```diff
- import { normalizeAprovadorList } from "@/modules/tarefas/components/builder/checklistNormalizers";
+ import { normalizeAprovadorList, syncAprovadorReplicadasFromFields } from "@/modules/tarefas/components/builder/checklistNormalizers";
```

## Confirmação de escopo
- ✅ Apenas `src/modules/tarefas/pages/tarefas_rotinasPage.tsx` alterado nesta etapa
  (pontos A–G já estavam aplicados na base).
- ❌ Sem alteração em banco / migrations / RPCs / triggers.
- ❌ Sem alteração em `tarefas_minhasTarefasPage.tsx` (runtime).
- ❌ Sem alteração em pacote padrão / Auditor / Executor / `useBuilderDraft`.

## Resultado esperado
- Avaliado com N perguntas → Aprovador mostra N replicadas (em tempo real).
- Remover/renomear no Avaliado reflete imediatamente no Aprovador.
- Salvar e reabrir não restaura replicadas órfãs do snapshot.
- AUTO (pacote padrão) e MANUAL preservados intactos.
