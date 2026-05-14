# Plano — Cadeia de Avaliação por Camadas em /tarefas/rotinas

Objetivo: evoluir a rotina atual para uma cadeia em 4 camadas (Avaliado, Aprovador, Plano de Ação, Validador), reaproveitando a engine de **Campos Dinâmicos** já existente. **Nenhuma tabela será dropada**, **nenhum snapshot antigo será migrado**, e rotinas legadas continuam funcionando via fallback.

---

## 1. Análise da estrutura atual (já mapeada)

**Builder (`src/modules/tarefas/components/builder/`)**
- `TarefasBuilderWizard.tsx` (197) — orquestra wizard com 7 etapas: tipo, geral, campos, checklist_aprovador, checklist_validador, fluxo, resumo
- `BuilderStepper.tsx` — UI do passo a passo (condicional por aprovador/validador)
- `StepChecklistAprovador.tsx` (175) — replica perguntas de Campos com 3 tipos de resposta (conforme/sim/nota) + flags simples
- `StepChecklistValidador.tsx` (155) — itens automáticos de auditoria (SLA, atraso, evidência…) + manuais
- `FieldVisibilityEditor.tsx` — usado em Campos para regras por opção
- `useBuilderDraft.ts` — autosave do rascunho
- `types.ts` — `AprovadorCheckItemForm`, `ValidadorCheckItemForm`, defaults

**Persistência atual** (sem migration): tudo dentro de `operational_templates.ada_config_snapshot.checklists.{aprovador,validador}`.

**Configurações globais**: `tarefas_pontuacao_config` (singleton) → `TarefasConfigPontuacao.tsx` + service `tarefas_pontuacao_config_service.ts`. Hoje só campos planos: penalidades fora-prazo, contingência, SLA contingência, nota min/max, reprovação.

**Cálculo automático**: trigger `calculate_operational_score_on_complete` já calcula score_executor / score_avaliado / score_avaliador com base em fields, reviews, SLA, contingências, devoluções e penalidades do template. **Não será alterado nesta fase.**

**Engine de perguntas (Campos)**: `operational_template_fields` + `operational_template_sections` + `operational_field_answers` + `operational_field_reviews` — cobrem todos os tipos pedidos (conforme, sim_nao, nota, texto, número, data, hora, seleção, múltipla, foto, arquivo, anexos, regras por opção, evidência, plano de ação, etc.).

---

## 2. Princípio diretor

Em vez de manter `Aprovador`/`Validador` como “checklists simplificados” paralelos, eles vão **reusar exatamente a mesma estrutura de Campos** (subset herdado + perguntas próprias). A persistência continua em `ada_config_snapshot.checklists.{aprovador,validador}` mas o **schema do item passa a ser um superset compatível** com `CheckItemForm` (ou seja: tipo, peso, regras por opção, exige_evidencia, gera_plano_acao, permite_devolucao, permite_conclusao, permite_aumento_prazo, SLA próprio, penalidade própria, ponderável_por_auditor).

Para rotinas antigas: loader detecta itens no formato antigo e converte em memória para o superset (`tipo_resposta` mapeado → `tipo`, defaults para campos novos). Sem migration.

---

## 3. Mudanças no Builder (frontend, escopo localizado)

### 3.1 `types.ts`
- Estender `AprovadorCheckItemForm` e `ValidadorCheckItemForm` com:
  - `tipo` completo (conforme, sim_nao, nota, texto, numero, data, hora, selecao, selecao_multipla, foto, arquivo)
  - `opcoes` + `regras_por_opcao` (mesma forma do Field)
  - `sla_horas`, `penalidade_atraso`, `penalidade_nao_resposta`, `penalidade_nao_conformidade`
  - `permite_ponderacao_auditor`, `exige_justificativa_ponderacao`
  - `permite_aumento_prazo_plano`
- Manter campos antigos como opcionais (compat).
- Loader util `normalizeAprovadorItem(raw)` / `normalizeValidadorItem(raw)` para rotinas antigas.

### 3.2 `StepChecklistAprovador.tsx` — reescrita visual em **7 blocos colapsáveis**
1. Configuração geral (modo de pontuação, ponderação permitida)
2. SLA do aprovador (horas + penalidade atraso)
3. Nota total (peso da camada na composição final)
4. Perguntas herdadas da execução (auto-replicadas com link visual à pergunta original)
5. Regras por resposta (reaproveitar `FieldVisibilityEditor` adaptado)
6. Plano de ação (toggles por item)
7. Ponderação (permite/exige justificativa)

Cada item de pergunta mostra: pergunta original (read-only) → pergunta do aprovador (editável) → seletor de tipo completo → peso → SLA → penalidade atraso → toggles (justificativa, evidência, plano_acao, aumento_prazo, ponderavel).

### 3.3 `StepChecklistValidador.tsx` — reorganização em auditoria final
- Mantém defaults automáticos.
- Adiciona controle por item: `pode_ponderar_aprovador`, `pode_ponderar_avaliado`, `nota_automatica_sugerida` (read-only no builder), `exige_justificativa_para_alterar`.
- Visual em 3 grupos: SLA/Atraso, Conformidade, Manual.

### 3.4 `StepResumo.tsx`
- Mostrar pesos por camada (Avaliado / Aprovador / Plano / Validador) com soma e validação.

### 3.5 `tarefas_rotinasPage.tsx`
- `loadFromTemplate`: aplicar normalizers (compat antigos).
- `save`: serializar superset em `ada_config_snapshot.checklists`.
- Carregar `tarefas_pontuacao_sla_config` (novo, ver §4) como defaults para snapshot.

---

## 4. Configurações globais — `Pontuação / Notas` → `Pontuação / SLA`

### 4.1 Migration aditiva (não-destrutiva)
- **Não dropar** `tarefas_pontuacao_config`. 
- Adicionar colunas JSONB opcionais: `sla_executor jsonb`, `sla_aprovador jsonb`, `sla_plano_acao jsonb`, `sla_validador jsonb`. Cada uma com `{nota_max, nota_min, sla_horas, penalidade_atraso, penalidade_nao_resposta, penalidade_nao_conformidade, permite_ponderacao, exige_justificativa_ponderacao, gera_plano_acao_auto, permite_reabertura}`.
- Defaults populados via UPDATE singleton (idempotente).

### 4.2 `TarefasConfigPontuacao.tsx` — renomear título para "Pontuação / SLA" (arquivo mantém nome para evitar quebras de import)
- 4 abas/blocos colapsáveis: Avaliado, Aprovador, Plano de Ação, Validador.
- Bloco "Globais (legado)" no topo preservando os campos atuais (ainda lidos por `calculate_operational_score_on_complete`).

### 4.3 `tarefas_pontuacao_config_service.ts`
- Estender interface com os 4 blocos novos. `getPontuacaoConfig` retorna defaults se colunas ausentes.

### 4.4 Snapshot na rotina
- `tarefas_rotinasPage.tsx` ao **criar** nova rotina copia `sla_*` para `ada_config_snapshot.sla_camadas`. Edição da config global **não** afeta rotinas existentes.

---

## 5. Validador — modal de auditoria com 3 abas (execução)

Componente novo: `src/modules/tarefas/components/auditoria/ValidadorAuditoriaDialog.tsx` (usado na execução, não no builder).
- **Aba 1 — Avaliado**: monta a partir de `operational_field_answers` + reviews + contingencies + score_logs (tipo='avaliado'). Read-only com badges de alerta (atraso, evidência faltante, regra quebrada).
- **Aba 2 — Aprovador**: respostas do aprovador (do checklist_aprovador resolvido), prazo, atraso, ponderações, planos, alertas.
- **Aba 3 — Auditoria Final**: resumo das notas por camada + ações (manter, alterar, penalidade parcial, remover penalidade c/ justificativa, zerar nota do aprovador, abrir plano para qualquer camada, cancelar, concluir).

Persistência das ponderações: nova tabela `operational_audit_overrides` (camada, nota_automatica, nota_final, motivo, profile_id, created_at, assignment_id). **Aditiva, sem alterar tabelas existentes.**

Hook novo `useAuditoriaFinal.ts`. Serviço novo `tarefas_audit_service.ts`.

---

## 6. Cálculo automático (sem mexer no trigger nesta fase)

- Manter `calculate_operational_score_on_complete` como está (calcula camadas executor/avaliado/avaliador via score_logs).
- A **camada Plano de Ação** já é capturada pelas penalidades de contingência existentes.
- A **camada Validador** vira camada de **override** sobre os scores existentes (consumida pela UI de auditoria; trigger não muda agora).
- Em fase futura: nova função `recalc_with_overrides(assignment_id)` aplicaria `operational_audit_overrides`. Fora deste escopo.

---

## 7. Compatibilidade com rotinas antigas

- Loader detecta `ada_config_snapshot.checklists.aprovador[].tipo_resposta` (formato antigo) e converte para `tipo` superset.
- Itens sem `sla_horas`/`penalidade_*` recebem defaults da config global no momento do load.
- Execuções antigas: nenhuma mudança na leitura de `operational_field_answers/reviews`.
- Trigger DB inalterado.

---

## 8. Arquivos a alterar / criar

### Alterar (frontend)
- `src/modules/tarefas/components/builder/types.ts`
- `src/modules/tarefas/components/builder/StepChecklistAprovador.tsx`
- `src/modules/tarefas/components/builder/StepChecklistValidador.tsx`
- `src/modules/tarefas/components/builder/StepResumo.tsx`
- `src/modules/tarefas/pages/tarefas_rotinasPage.tsx` (carga/save com normalizers + snapshot SLA)
- `src/modules/tarefas/components/configuracoes/TarefasConfigPontuacao.tsx` (4 blocos novos)
- `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts` (interface estendida)

### Criar
- `src/modules/tarefas/components/builder/checklistNormalizers.ts`
- `src/modules/tarefas/components/auditoria/ValidadorAuditoriaDialog.tsx`
- `src/modules/tarefas/components/auditoria/AbaAvaliado.tsx`
- `src/modules/tarefas/components/auditoria/AbaAprovador.tsx`
- `src/modules/tarefas/components/auditoria/AbaAuditoriaFinal.tsx`
- `src/modules/tarefas/hooks/tarefas_useAuditoriaFinal.ts`
- `src/modules/tarefas/services/tarefas_audit_service.ts`

### DB (migration aditiva, sem drops)
- `tarefas_pontuacao_config`: ADD COLUMN `sla_executor jsonb`, `sla_aprovador jsonb`, `sla_plano_acao jsonb`, `sla_validador jsonb` (todas DEFAULT '{}'::jsonb)
- Nova tabela `operational_audit_overrides` + RLS (admin/aprovador/validador via profile)

---

## 9. Rollback

- Frontend: reverter os 7 arquivos alterados e remover os 7 novos.
- DB: `DROP TABLE operational_audit_overrides;` + `ALTER TABLE tarefas_pontuacao_config DROP COLUMN sla_executor, sla_aprovador, sla_plano_acao, sla_validador;` (colunas vazias, sem perda).
- Snapshots de rotinas antigas continuam intactos.

---

## 10. Checklist de validação (após implementação)

Visual:
- [ ] Builder Aprovador mostra 7 blocos com todos os tipos de resposta
- [ ] Builder Validador organizado em SLA/Conformidade/Manual
- [ ] Resumo mostra pesos por camada
- [ ] Configurações > Pontuação/SLA mostra 4 blocos + legado
- [ ] Modal Validador (execução) com 3 abas

Funcional:
- [ ] Rotina antiga abre sem erro (normalizer)
- [ ] Nova rotina salva snapshot com SLA por camada
- [ ] Override de auditor persiste em `operational_audit_overrides`
- [ ] Trigger de score continua funcionando

---

## 11. Fora deste escopo (propor depois)

- Reescrita do trigger de cálculo para consumir overrides
- Migração de snapshots antigos para novo schema
- Drop das tabelas `operational_template_check_items` (mantidas vivas)

---

**Aguardando confirmação para iniciar a implementação. Posso também executar em fases (sugerido: Fase A = types+normalizers+migration aditiva; Fase B = Builder Aprovador/Validador/Resumo; Fase C = Config global; Fase D = Modal de auditoria na execução).**
