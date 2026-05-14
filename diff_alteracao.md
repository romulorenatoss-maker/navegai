# Remoção do sistema de rascunho/restore — Builder de Rotina

## Arquivos alterados
- `src/modules/tarefas/pages/tarefas_rotinasPage.tsx`
  - Removidos: import de `useDraftAutosave/loadDraft/clearDraft/BuilderDraftPayload`,
    estado `pendingDraft`, chamada `useDraftAutosave`, `loadDraft` em `openNew`/`openEdit`,
    `clearDraft` em `onSuccess`, funções `restoreDraft` e `discardDraft`, props
    `draftToRestore/onRestoreDraft/onDiscardDraft` passadas ao wizard, limpeza de
    `pendingDraft` em `closeDialog`.
  - Adicionado helper `purgeLegacyBuilderDrafts()` que apaga qualquer chave antiga
    `tarefas_builder_draft_v1::*` do `localStorage` ao abrir o builder e ao salvar.
- `src/modules/tarefas/components/builder/TarefasBuilderWizard.tsx`
  - Removidos: import de `DraftRestoreBanner` e `BuilderDraftPayload`, props
    `draftToRestore/onRestoreDraft/onDiscardDraft`, renderização do banner.
- `src/modules/tarefas/components/builder/useBuilderDraft.ts` — **deletado**.
- `src/modules/tarefas/components/builder/DraftRestoreBanner.tsx` — **deletado**.

## Onde o draft era salvo
- `localStorage`, prefixo `tarefas_builder_draft_v1::<templateId|__new__>`,
  com debounce de 800 ms via `useDraftAutosave` enquanto o diálogo ficasse aberto.

## Onde o restore foi removido
- `openNew`: não chama mais `loadDraft(null)` nem seta `pendingDraft`.
- `openEdit`: não chama mais `loadDraft(t.id)` nem seta `pendingDraft`.
- Wizard: banner `DraftRestoreBanner` removido — não há mais popup/banner de restaurar.
- `restoreDraft`/`discardDraft` deixaram de existir.

## Comportamento resultante
- A única fonte de verdade passa a ser o registro salvo de
  `operational_templates` (carregado em `openEdit`).
- Edições não salvas são perdidas ao fechar — esperado.
- Cache local antigo é purgado automaticamente ao abrir/salvar o builder,
  evitando que rascunhos legados ressurjam.

## Confirmação de escopo
- ❌ Sem alterações em banco/schema.
- ❌ Sem migrations criadas.
- ❌ Sem alteração em RPC/edge functions.
- ❌ Sem alteração em runtime de execução (`tarefas_minhasTarefasPage.tsx`),
  cron, auditor, fluxo, SLA ou pacote padrão.
- ✅ Mudanças restritas à UI do builder da rotina.
