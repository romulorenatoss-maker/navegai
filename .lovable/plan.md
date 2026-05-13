## Análise prévia (causa antes de alterar)

Hoje o sistema usa **4 blocos**: Avaliado, Avaliador (Plano de Ação), Aprovador, Validador Final. O escopo solicitado introduz um modelo de **5 papéis** com separação conceitual nova: **Respondente** (executa o checklist) ≠ **Avaliado** (recebe a nota). Isso muda regras de negócio, não só UI.

### Arquivos atuais impactados (mapeados)

1. `src/modules/tarefas/components/responsaveis/TarefasResponsaveisBlocks.tsx` — componente de blocos atual (4 papéis).
2. `src/modules/tarefas/components/tarefas_quickCreateDialog.tsx` — modal de tarefa avulsa.
3. `src/modules/tarefas/components/tarefas_tabGeral.tsx` — aba Geral do builder de rotinas.
4. `src/modules/tarefas/components/tarefas_tabWorkflow.tsx` — aba Workflow (regras de aprovação).
5. `src/modules/tarefas/pages/tarefas_rotinasPage.tsx` — página/wizard de rotinas.
6. `src/modules/tarefas/types/tarefas_types.ts` — `TemplateForm`, payload.

### Funções/áreas que mudam de comportamento

- `buildRespFromForm` / `handleBlocksChange` (mapeamento legacy ↔ blocos).
- Payload de save de rotina e tarefa avulsa (precisa novo array `template_snapshot.responsaveis_multi[papel]`).
- Hooks de execução/aprovação que hoje tratam `executor_*` como "quem responde **e** é avaliado" — passarão a tratar Respondente e Avaliado separados.
- `tarefas_useApprovalFlow`, `tarefas_useAssignmentExecution`, `tarefas_useScoring`, `tarefas_canTransition`: regras de "quem cria plano de ação" e "quem fecha" precisam considerar Aprovador Final como autoridade exclusiva quando configurado.

### Pontos sensíveis (preciso da sua confirmação antes de mexer)

**A. Modelo de dados — Respondente é NOVO.** Hoje `executor_profile_id` significa "quem executa". A imagem separa Respondente de Avaliado. Opções:
   - **A1 (mínima/recomendada):** mapear `executor_*` = **Respondente**, e usar campos novos `avaliado_*` (que já existem no schema) como **Avaliado**. Sem migration.
   - **A2:** criar colunas novas `respondente_*` em `tarefas_templates` / `tarefa_assignments`. Requer migration.

**B. Multi-select e "Setor todo".** Hoje só grava 1 colaborador (legacy). Para "Setor todo" e múltiplos individuais sem migration, gravamos array em `template_snapshot.responsaveis_multi[papel]` (snapshot JSON). Tarefa avulsa precisa de campo equivalente em `tarefa_assignments` (também via snapshot/extra_data).

**C. Stepper de 4 etapas (Responsáveis → Perguntas → Fluxo & Prazos → Resumo).** Hoje a rotina usa wizard de 6 etapas (`WIZARD_STEPS` em `builder/types.ts`: Tipo, Geral, Campos, Checklist, Fluxo, Resumo). A imagem mostra **outro fluxo, mais curto, focado em tarefa avulsa/quick create**. Preciso confirmar:
   - Aplicar stepper de 4 só na **tarefa avulsa** (quickCreateDialog) e manter rotinas com o wizard atual de 6 etapas, **substituindo apenas o conteúdo do bloco Responsáveis** (como você disse: "preservar Nome/Descrição/Tipo/Setor da Rotina, substituir apenas a área de Responsáveis")?
   - Ou também trocar o wizard de rotinas para o de 4 etapas?

**D. Regra "Aprovador Final exclusivo do Plano de Ação".** Hoje quem cria PA é o "Avaliador (Plano de Ação)" (bloco 2 atual). A nova regra inverte: PA pertence ao **Aprovador Final**. Isso afeta:
   - Botões em `tarefas_useApprovalFlow` / painéis embarcados (`painels/*`).
   - RBAC em `tarefas_rbac.ts` (`canCreatePlanoAcao`, `canCloseAssignment`).
   - Compatibilidade: tarefas existentes (registros antigos) — manter regra antiga para elas ou migrar?

**E. "Setor da Rotina" preservado.** Você pediu para manter, mas a iteração anterior removeu esse campo (derivado do Avaliado). Reintroduzir como campo manual?

---

## Proposta de execução (após sua confirmação dos pontos A–E)

### Fase 1 — UI (sem regras de negócio)

1. Reescrever `TarefasResponsaveisBlocks.tsx` como **`TarefasResponsaveisV2.tsx`** com 5 blocos, 3 colunas (Setor / Setor todo / Individual), banner azul, mensagens de apoio, legenda Obrigatório/Opcional, layout responsivo (cards collapsíveis no mobile via `useIsMobile`).
2. Manter o componente antigo (não deletar) até validação — rollback trivial.
3. Integrar V2 em `tarefas_quickCreateDialog.tsx` com stepper de 4 etapas (Responsáveis / Perguntas / Fluxo & Prazos / Resumo).
4. Integrar V2 em `tarefas_tabGeral.tsx` substituindo apenas o bloco Responsáveis (sem alterar Nome/Descrição/Tipo/Setor da Rotina — re-adicionar Setor da Rotina como campo manual).

### Fase 2 — Persistência (snapshot)

5. Estender `TemplateForm` com `responsaveis_multi: { respondente, avaliado, avaliador, aprovador_final, validador_final: { modo: 'setor_todo'|'individual', setor_id, profile_ids[] } }`.
6. Mapeamento legacy (retrocompat):
   - `executor_*` = primeiro do Respondente
   - `avaliado_*` = primeiro do Avaliado
   - `avaliador_*` / `validador_contingencia_*` = primeiro do Avaliador
   - `aprovador_*` = primeiro do Aprovador Final
   - `ada_*` = Validador Final
7. Gravar array completo em `template_snapshot.responsaveis_multi`.

### Fase 3 — Regras (Aprovador Final = autoridade do PA)

8. Em `tarefas_rbac.ts`: novas helpers `isAprovadorFinal`, `canCreatePlanoAcao` agora prioriza Aprovador Final; fallback para regra antiga quando snapshot não tem o novo formato.
9. Hooks de execução: passa `respondenteIds` separado de `avaliadoIds`. Nota final pertence ao Avaliado.
10. Painéis (`planoAcao`, `aprovacao`): match() considera Aprovador Final como dono.

### Fase 4 — Entregáveis

11. Diff completo, manifest, script de rollback (reverter para componente V1), checklist de regras alteradas.

---

## Risco

- Fase 3 toca lógica crítica de aprovação/scoring. **Sugestão:** entregar Fases 1+2 primeiro (UI + persistência no snapshot, sem mudar quem aprova), validar visualmente, e só depois Fase 3 (mudança de autoridade do PA) em PR separado.

---

## Decisões que preciso de você antes de implementar

1. **A1 ou A2** para Respondente? (recomendo A1)
2. **C** — stepper de 4 etapas só no quick create, mantendo wizard atual da rotina? (recomendo sim)
3. **D** — aplicar nova regra de Aprovador Final imediatamente ou só Fase 1+2 agora e Fase 3 depois? (recomendo Fase 1+2 agora)
4. **E** — Setor da Rotina volta como campo manual obrigatório, ou continua derivado do Avaliado?
5. Tarefas/rotinas **já existentes** continuam com regra antiga (retrocompat) ou também passam pelo novo modelo?

Aguardo sua confirmação para começar.
