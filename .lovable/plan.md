## Análise atual

**Pacote padrão do Aprovador (referência a reutilizar)**
- `tarefas_pontuacao_config_service.ts` → `aprovador_pacote_padrao` + `APROVADOR_PACOTE_PADRAO_DEFAULT`, tipos `AprovadorPerguntaPadrao` / `AprovadorMetricaCalculo` / `AprovadorTipoPadrao`.
- `TarefasConfigPontuacao.tsx` → componente `PacotePadraoAprovadorCard` (Card + lista + Switch + `FieldConfigSheet`) renderizado dentro da subaba **Pontuação / Notas**.
- `StepChecklistAprovador.tsx` → consome o pacote via `getPontuacaoConfig()` e injeta itens com `buildAprovadorAutomatico(...)`. Lista única ordenada (REPLICADA → AUTO → MANUAL), modal único = `FieldConfigSheet`.
- `types.ts` → `AprovadorCheckItemForm`, `defaultAprovadorManualItem`, `buildAprovadorAutomatico`, `AprovadorOrigem`.
- Persistência: `ada_config_snapshot.checklists.{aprovador,validador}` (sem migration).

**Validador hoje**
- `StepChecklistValidador.tsx` usa UI própria (categorias, sem AUTO, sem `FieldConfigSheet`) e `VALIDADOR_DEFAULT_ITEMS` hardcoded em `types.ts`.
- Não há pacote padrão global do Validador em `tarefas_pontuacao_config`.
- Persistido em `ada_config_snapshot.checklists.validador` (compatível ao reusar `AprovadorCheckItemForm` para itens AUTO/MANUAL).

**“Avaliação do Avaliador” (a remover)**
- Subaba `ada` em `ConfiguracoesPage.tsx` → `TarefasConfigAdA.tsx`.
- Página `tarefas_avaliacaoAvaliadorPage.tsx` (rota `/tarefas/avaliacao-avaliador/:id`) + navegação em `tarefas_minhasTarefasPage.tsx:336`.
- Service `tarefas_ada_config_service.ts` (singleton `tarefas_ada_config`).
- `tarefas_tabWorkflow.tsx` chama `getAdaConfig()` e popula `ada_config_snapshot` (usado também para guardar `checklists`).
- **Coluna `ada_config_snapshot` em tarefas/rotinas é COMPARTILHADA** — guarda também `checklists.aprovador` e `checklists.validador`. NÃO pode ser removida.

## Mudanças mínimas e localizadas

### 1) Service `tarefas_pontuacao_config_service.ts`
- Adicionar tipo `ValidadorMetricaCalculo` (sla_aprovador, justificativa_nc, evidencia_aprovador, regras_pergunta, plano_acao_aprovador, ponderacao_manual, plausibilidade_ponderacao, manual).
- Adicionar `validador_pacote_padrao: AprovadorPerguntaPadrao[]` no shape `TarefasPontuacaoConfig` (reuso do mesmo tipo do Aprovador para que TODA UI/modal funcione sem mudanças).
- `VALIDADOR_PACOTE_PADRAO_DEFAULT` com as 7 perguntas (peso somando 100).
- `getPontuacaoConfig` faz merge com fallback default; `setPontuacaoConfig` persiste o campo novo.

### 2) Migration mínima
- `ALTER TABLE tarefas_pontuacao_config ADD COLUMN IF NOT EXISTS validador_pacote_padrao jsonb DEFAULT '[]'::jsonb;`
- Sem mudar trigger, sem dropar nada.

### 3) `TarefasConfigPontuacao.tsx`
- Generalizar `PacotePadraoAprovadorCard` em `PacotePadraoCard` (props: `title`, `description`, `items`, `onChange`, `defaults`) — mantendo 100% do layout/modal atuais.
- Renderizar dois cards: Aprovador (acima) e Validador/Auditor (abaixo). Mesmo `FieldConfigSheet`, mesmo botão Salvar (único save persiste ambos).

### 4) `StepChecklistValidador.tsx` — substituir conteúdo, manter contrato externo
- Refatorar para usar **mesmo padrão visual** do Aprovador: lista única, badges AUTO/MANUAL, `FieldConfigSheet`.
- Itens passam a ser `AprovadorCheckItemForm` (reuso). Um adapter no `tarefas_rotinasPage.tsx` e `tarefas_tabWorkflow.tsx` (onde `setItems` é tipado) recebe o tipo novo.
- Carrega o pacote do Validador via `getPontuacaoConfig().validador_pacote_padrao` com `buildAprovadorAutomatico`.
- Bloco de auditoria: cada card AUTO/MANUAL terá um `<details>` "Ver dados auditáveis" exibindo, quando disponível, resposta do Executor / Aprovador / justificativa / anexos / ponderação / plano de ação / SLA / atrasos / reaberturas. Em construção da rotina (sem assignment), o bloco mostra apenas legenda “Disponível na execução”. Sem nova RPC: dados vêm do `ada_config_snapshot` da execução, lido pelo painel de auditoria já existente.

### 5) `types.ts`
- Manter `ValidadorCheckItemForm` e `VALIDADOR_DEFAULT_ITEMS` como **legacy** (não remover) → garante compat com snapshots antigos.
- Adicionar `defaultValidadorPacote()` que devolve `AprovadorCheckItemForm[]` derivado do pacote do Validador.
- Adicionar `normalizeValidadorLegacy(items)` em `checklistNormalizers.ts`: se snapshot vier no formato antigo (`ValidadorCheckItemForm`), converte para `AprovadorCheckItemForm` mantendo pergunta/peso/tipo (sem perder histórico).

### 6) Remoção da aba “Avaliação do Avaliador”
- `ConfiguracoesPage.tsx`: remover `TabsTrigger value="ada"` + `TabsContent` + import.
- `App.tsx`: remover rota `/tarefas/avaliacao-avaliador/:id` + import.
- `tarefas_minhasTarefasPage.tsx:336`: remover navegação (o usuário responderá agora pelas perguntas replicadas/AUTO do Aprovador, que já existem).
- **Manter no codebase (legacy, não importados em UI)**: `tarefas_avaliacaoAvaliadorPage.tsx`, `TarefasConfigAdA.tsx`, `tarefas_ada_config_service.ts`. Razão: `ada_config_snapshot` continua usado pelo Aprovador/Validador para guardar checklists; manter o service evita quebrar histórico/Hooks indiretos. Marcar com comentário `@legacy` no topo dos 3 arquivos.
- `tarefas_tabWorkflow.tsx`: remover `getAdaConfig()` automático que sobrescreve `ada_config_snapshot` apenas com config do AdA — ajuste mínimo: só popular se snapshot ainda não tem `checklists` (preserva `checklists.aprovador/validador`). Não altera comportamento atual de checklists.
- Tabela `tarefas_ada_config` permanece intocada (legacy).

### 7) Cálculo de notas
- Não alterar engine. A nota do Validador continua somando pelos itens do checklist Validador no snapshot — agora vinda do mesmo shape `AprovadorCheckItemForm`.
- Trigger DB inalterado.

## Compatibilidade

- Rotinas antigas: `checklists.validador` legado (`ValidadorCheckItemForm`) é convertido on-read pelo normalizer; nada é regravado até o usuário salvar.
- Snapshots `ada_config_snapshot` continuam válidos (mesma chave `checklists`).
- Histórico de avaliações AdA preservado via service legacy.

## Arquivos a alterar

1. `supabase/migrations/<timestamp>_validador_pacote_padrao.sql` (novo)
2. `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`
3. `src/modules/tarefas/components/configuracoes/TarefasConfigPontuacao.tsx`
4. `src/modules/tarefas/components/builder/StepChecklistValidador.tsx`
5. `src/modules/tarefas/components/builder/types.ts` (defaults validador, sem remover legacy)
6. `src/modules/tarefas/components/builder/checklistNormalizers.ts`
7. `src/modules/tarefas/components/builder/TarefasBuilderWizard.tsx` (tipo do state validador → `AprovadorCheckItemForm[]`)
8. `src/modules/tarefas/pages/tarefas_rotinasPage.tsx` (load/save validador com novo tipo)
9. `src/pages/ConfiguracoesPage.tsx` (remover trigger/content `ada`)
10. `src/App.tsx` (remover rota `/tarefas/avaliacao-avaliador/:id`)
11. `src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx` (remover navegação para a página antiga)
12. `src/modules/tarefas/components/tarefas_tabWorkflow.tsx` (não sobrescrever `checklists`)

## Confirmação solicitada

1. **Migration** adicionando coluna `validador_pacote_padrao jsonb` em `tarefas_pontuacao_config` — OK?
2. **Manter** `tarefas_ada_config`, `tarefas_avaliacaoAvaliadorPage.tsx`, `TarefasConfigAdA.tsx`, `tarefas_ada_config_service.ts` como **legacy** (apenas remover do menu e da rota), conforme regra “não apagar histórico” — OK?
3. **Reuso de `AprovadorCheckItemForm`** para o checklist Validador (com normalizer p/ snapshots antigos), em vez de manter dois shapes — OK?

Ao confirmar, aplico as 12 alterações acima em sequência e gero o diff completo + checklist de validação.