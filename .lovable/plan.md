# Limpeza Arquitetural do Módulo Tarefas

Operação grande, irreversível em parte (drop conceitual de Avaliador/Validador/AdA). Antes de tocar em qualquer arquivo ou rodar migration, preciso da sua confirmação explícita do escopo e da ordem de fases. Conforme suas regras: nada será alterado sem o "ok" final.

---

## Escopo aceito

Fluxo oficial passa a ser **somente**: `Executor → Avaliado → Aprovador → Auditor`.
Removido conceitualmente: Avaliador, Conferência Técnica, Validador separado, AdA / Avaliação do Avaliador.

Módulo OS legado (`AvaliacaoOSPage`, `RelatoriosPage`, tabelas `ordens_servico`, `perguntas_avaliacao`, etc.) **não será tocado**.

---

## Estratégia de execução em 6 fases

Cada fase entrega artefatos e pode ser pausada/revertida antes da próxima.

### Fase 0 — Backup e baseline (sem alteração)
- `backup_tarefas_pre_limpeza.zip` (snapshot dos ~40 arquivos do módulo)
- `mapa_arquivos_alterados.md` (matriz arquivo × ação: remover/renomear/alterar)
- `mapa_banco_rpc_triggers.md` (estado atual de colunas, funções, triggers)
- `manifest_limpeza_fluxo_tarefas.json` (inventário formal)

### Fase 1 — Banco: novas colunas + migração de dados (aditiva, sem DROP)
Migration `migration_fase1_aditiva.sql`:
- Adiciona em `operational_assignments`:
  - `auditor_id`, `auditor_inicio_em`, `auditor_fim_em`, `score_auditor`, `setor_auditor_id`
  - `aprovado_em`, `aprovado_por`, `auditado_em`, `auditado_por`
  - Cancelamento: `cancelada_em/por/motivo/justificada`
  - Reagendamento: `reagendada_em/por/motivo`, `data_prevista_original`, `horario_limite_original`, `reagendamento_justificado`
  - Atestado: `possui_atestado`, `atestado_url`, `atestado_aprovado/_por/_em`
  - Média: `excluir_da_media`, `motivo_exclusao_media`
- Cria `operational_action_plans` (com RLS).
- Cria `tarefas_auditor_pacote_padrao` espelhando `tarefas_pontuacao_config` (ou renomeia interno mantendo alias).
- Migra dados: `avaliador_id → auditor_id` onde aplicável; copia `validador_pacote_padrao → auditor_pacote_padrao`.
- Colunas antigas (`avaliador_id`, `score_avaliador`, `ada_*`) ficam como **legado read-only** — nada novo escreve.
- Rollback: `rollback_fase1.sql` (DROPs reversos).

### Fase 2 — Score real (nova RPC)
- Cria `tarefas_rpc_calcular_score_operacional` consumindo:
  respostas executor + evidências + atraso + respostas do **aprovador** (com pesos de `tarefas_pontuacao_config`) + respostas do **auditor** + contingências + cancelamento/reagendamento/atestado/exclusão da média.
- Cria/ajusta trigger para usar a nova função; trigger antiga `calculate_operational_score_on_complete` vira wrapper que delega.
- `operational_score_logs.tipo_score` passa a aceitar `'auditor'`; `'avaliador'` mantido só para histórico.
- Remove trigger `fn_gerar_ada_assignment` (não gera mais filhos AdA).

### Fase 3 — RPCs de BI/Dashboard do módulo Tarefas
Cria novas, sem tocar nas legadas de OS:
- `tarefas_rpc_calcular_media_operacional`
- `tarefas_rpc_dashboard_metricas_operacionais`
- `tarefas_rpc_calcular_notas_por_setor_operacional`
- `tarefas_rpc_indicadores_por_colaborador`
- `tarefas_rpc_indicadores_por_setor`

### Fase 4 — Frontend: rename Avaliador→Auditor + remoção AdA/Validador
Arquivos **renomeados**:
- `StepChecklistValidador.tsx` → `StepChecklistAuditor.tsx`
- `tarefas_embeddedAvaliacaoPanel.tsx` → `tarefas_embeddedAuditoriaPanel.tsx`
- `tarefas_aguardandoAvaliacaoPanel.tsx` → `tarefas_aguardandoAuditoriaPanel.tsx`
- `tarefas_avaliacaoAvaliadorPage.tsx` → `tarefas_auditoriaPage.tsx` (rota antiga vira redirect)

Arquivos **removidos**:
- `TarefasConfigAdA.tsx` (substituído por `TarefasConfigAuditor.tsx`)
- `tarefas_ada_config_service.ts`

Arquivos **alterados** (rename de termos, remoção de filtros/labels/chips de Avaliador/Validador/AdA):
builder/types.ts, TarefasBuilderWizard.tsx, StepResumo.tsx, checklistNormalizers.ts, TarefasConfigPontuacao.tsx, painels (router/registry/types/aprovacao/validacaoSolicitante), responsaveis (V2/Blocks), reviewFieldCard, quickCreateDialog, quickViewDialog, tarefaCard, hooks (Review/ApprovalFlow/Execution/Transition/Dashboard/Scoring), pages (minhasTarefas/rotinas/desempenho/relatorios), services (canTransition/messages/pontuacao/statusConstants), types/tarefas_types.ts.

Steps do Wizard finais: Tipo → Geral → Perguntas Executor → Avaliado → Perguntas Aprovador → Perguntas Auditor → Fluxo → Resumo.

### Fase 5 — Validação
`checklist_validacao_limpeza_fluxo_tarefas.md` cobrindo os 17 cenários que você listou.

### Fase 6 — Entregáveis finais
- `diff_limpeza_fluxo_tarefas.md`
- `migration_limpeza_fluxo_tarefas.sql` (consolidado das fases 1–3)
- `rollback_limpeza_fluxo_tarefas.sql`
- `manifest_limpeza_fluxo_tarefas.json` (final)
- `backup_tarefas_pos_limpeza.zip`
- Relatório final com listas pedidas (removidos / renomeados / alterados / colunas / RPCs / compat temporária / testes).

---

## Riscos que precisam de "ok" antes de eu começar

1. **Trigger de score atual** (`calculate_operational_score_on_complete`) será substituída por nova função. Tarefas em andamento durante deploy podem calcular score pelo modelo antigo até a migration rodar. **Aceitável quebrar temporariamente?** Você disse que sim — confirma?
2. **Coluna `avaliador_id` permanece** como legado read-only (não dá pra dropar agora sem reescrever 40+ refs em uma única passada e quebrar histórico). Confirma manter como legado?
3. **Trigger `fn_gerar_ada_assignment` será removida**. Assignments-filho AdA já existentes ficam órfãos (status preservado, mas não geram novos). Confirma?
4. **Rota `/tarefas/avaliacao-avaliador`** vira redirect 30 dias e depois removida. Ou remoção imediata?
5. **`validador_pacote_padrao` em `tarefas_pontuacao_config`**: copio para `auditor_pacote_padrao` e mantenho ambos por 1 release, ou rename direto?

---

## Próximo passo

Se aprovar este plano, eu começo pela **Fase 0** (apenas backup + mapas, zero alteração) e te entrego os artefatos para revisar antes da Fase 1 (migration aditiva). Cada fase seguinte só roda com seu "ok" explícito.

Posso seguir?
