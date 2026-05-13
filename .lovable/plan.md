
# Plano — Avaliação do Avaliador (AdA)

Objetivo: avaliar quem avaliou a tarefa principal, em **tarefa avulsa** e **rotina**, **reaproveitando** a infraestrutura operacional existente (templates, assignments, field answers, scoring, plano de ação, SLA, RBAC, bucketize), sem criar fluxo paralelo.

## 1. Mapa do que já existe (não duplicar)

- `operational_templates` + `operational_template_sections` + `operational_template_fields` → motor de perguntas/score.
- `operational_assignments` → instância executável (já tem `responsavel_id`, `avaliador_id`, `aprovador_id`, status, SLA, `template_snapshot`, scoring).
- `operational_field_answers` / `operational_field_reviews` → respostas e revisões.
- `operational_contingencies` → plano de ação.
- `operational_audit_trail` + `operational_assignment_history` → histórico/reabertura.
- `tarefas_bucketize.ts` → grupos Hoje/Aguardando/Críticas/Concluídas.
- `tarefas_useTransition.ts` + `tarefas_canTransition.ts` + `tarefas_rbac.ts` → transições, permissão (admin já tem total).
- Configurações → Tarefas tem subabas Colaboradores/Setores/Pontuação/Armazenamento (`ConfiguracoesPage.tsx`).
- Setor "Administrador" + sync admins (já criado na passada anterior).

Decisão chave: AdA é uma **subtarefa operacional** (mesmo motor), não uma tabela nova de avaliação. Reaproveita tudo, só ganha:
- flag de tipo (`tipo_assignment = 'avaliacao_avaliador'`),
- vínculo à tarefa mãe (`parent_assignment_id`),
- snapshot config próprio,
- pré-preenchimento automático.

## 2. Mudanças de banco (migration aditiva)

Nada de remoção. Tudo nullable/default seguro.

```text
+ public.tarefas_ada_config           (singleton; perguntas padrão, anexos, SLA, prioridade, penalidades)
+ operational_templates.ada_enabled                boolean default false
+ operational_templates.ada_config_snapshot        jsonb           -- snapshot editável por template/rotina
+ operational_templates.ada_quem_avalia_tipo       text  -- 'pessoa'|'setor'|'administrador'|'responsavel_padrao'
+ operational_templates.ada_quem_avalia_profile_id uuid
+ operational_templates.ada_quem_avalia_setor_id   uuid
+ operational_templates.ada_gerar_em               text  -- 'pos_avaliacao'|'pos_aprovacao'|'pos_plano_acao'

+ operational_assignments.tipo_assignment          text default 'principal'  -- 'principal'|'avaliacao_avaliador'
+ operational_assignments.parent_assignment_id     uuid references operational_assignments(id)
+ operational_assignments.ada_avaliador_avaliado_id uuid  -- profile do avaliador que está sendo avaliado

+ trigger fn_gerar_ada_assignment()  -- AFTER UPDATE em operational_assignments
   dispara quando status atinge o ponto configurado (ada_gerar_em) e ada_enabled=true e ainda não existe filho AdA.
   Cria assignment filho com template virtual a partir de ada_config_snapshot.
```

Migration vem com `rollback.sql` (DROP colunas/tabela/trigger/função).

## 3. Configurações → Tarefas → Avaliação do Avaliador

Nova subaba em `ConfiguracoesPage.tsx`:
- Componente novo: `TarefasConfigAdA.tsx` (CRUD do singleton `tarefas_ada_config`).
- Service novo: `tarefas_ada_config_service.ts` (mesmo padrão de `tarefas_pontuacao_config_service.ts`).
- Campos: perguntas padrão (lista editável), regras de anexo, SLA, prioridade, penalidades.

## 4. Criação/edição de tarefa e rotina

Em `tarefas_tabWorkflow.tsx` (e `tarefas_quickCreateDialog.tsx` opcional):
- Checkbox **"Avaliar também o avaliador"** → grava `ada_enabled` no template.
- Quando marcado: carrega snapshot da config global em `ada_config_snapshot` (editável local).
- Selects: quem avalia (pessoa/setor/Administrador/responsável padrão) + quando gerar.
- "Administrador" reaproveita o setor virtual já existente.

## 5. Geração automática

Trigger `fn_gerar_ada_assignment` na transição de status, idempotente (não cria duplicado).
- Cria child assignment com `tipo_assignment='avaliacao_avaliador'`, `parent_assignment_id`, `responsavel_id` resolvido conforme `ada_quem_avalia_*`, SLA do snapshot, prioridade, status inicial `aguardando_avaliacao` (reaproveitado).

## 6. Tela "Avaliação do Avaliador"

Nova rota: `/tarefas/avaliacao-avaliador/:assignmentId` (ou drawer dedicado).
- Componente: `tarefas_avaliacaoAvaliadorPage.tsx` + painel `tarefas_adaPanel.tsx`.
- Layout split:
  - **Esquerda**: resumo agregado da tarefa-mãe (lê `parent_assignment_id` + answers + reviews + contingencies + history).
  - **Direita**: form das perguntas do snapshot AdA, com pré-preenchimento automático (atraso, SLA, plano de ação tratado, devoluções, nota, evidência) via função pura `tarefas_adaAutoFill.ts`. Editável antes de concluir.
- Plano de ação: reaproveita `operational_contingencies` apontando para o assignment AdA.
- Reabertura: reaproveita transições existentes (`reabrir_*`).

## 7. Minhas Tarefas

Em `tarefas_bucketize.ts`:
- Tratar AdA como assignment normal (já entra em Hoje/Aguardando Você/Críticas/Concluídas pelo status).
- Em `tarefas_tarefaCard.tsx`: quando `tipo_assignment='avaliacao_avaliador'` → badge **"Avaliar Avaliador"** + ação "Abrir avaliação do avaliador" que vai para a tela nova em vez do painel padrão.

## 8. Rotinas

Recorrência atual (`generate-daily-assignments`) cria assignments principais. Como AdA é gerada por trigger no status da principal, **cada ocorrência da rotina** que tiver `ada_enabled` herda automaticamente. Sem mudança na função de geração.

## 9. NÃO mexer

Execução principal, avaliação principal, aprovação principal, recorrência, scoring (apenas estende para o assignment AdA via `impacta_score`/`tipo_score` já existentes), storage (reusa bucket `evidencias`), histórico.

## 10. Arquivos impactados

**Criar:**
- `supabase/migrations/<ts>_ada.sql` (+ rollback inline)
- `src/modules/tarefas/services/tarefas_ada_config_service.ts`
- `src/modules/tarefas/services/tarefas_adaAutoFill.ts`
- `src/modules/tarefas/components/configuracoes/TarefasConfigAdA.tsx`
- `src/modules/tarefas/components/painels/tarefas_adaPanel.tsx`
- `src/modules/tarefas/pages/tarefas_avaliacaoAvaliadorPage.tsx`

**Editar (mínimo):**
- `src/pages/ConfiguracoesPage.tsx` (+1 TabsTrigger)
- `src/modules/tarefas/components/tarefas_tabWorkflow.tsx` (checkbox + selects AdA)
- `src/modules/tarefas/components/tarefas_tarefaCard.tsx` (badge "Avaliar Avaliador" + roteamento)
- `src/App.tsx` (rota nova)
- `src/modules/tarefas/services/tarefas_bucketize.ts` (apenas se precisar reconhecer tipo — provavelmente nada)

## 11. Pacote final (zip)
diff_avaliacao_do_avaliador.md, manifest_avaliacao_do_avaliador.json, migration.sql, rollback.sql, mapa_fluxo_avaliacao_do_avaliador.md, mapa_telas_criadas.md, mapa_configuracoes.md, mapa_minhas_tarefas.md, arquivos_reais_alterados/, checklist_validacao.md.

---

## Pontos que preciso confirmar antes de executar

1. **Aprova reaproveitar `operational_assignments` com `tipo_assignment='avaliacao_avaliador'`** em vez de criar tabela paralela `ada_assignments`? (recomendo sim — herda scoring, SLA, RBAC, bucketize, plano de ação, reabertura, audit).
2. **Ordem de entrega**: posso entregar em 3 PRs separados — (A) migration + config global + subaba Configurações; (B) checkbox no criador + trigger de geração; (C) tela AdA + badge no card. Ou prefere tudo numa passada só?
3. **"Responsável padrão" como quem avalia o avaliador** = quem? O criador da tarefa? O solicitante? Confirme.
4. **Rota** `/tarefas/avaliacao-avaliador/:id` ou abrir como **drawer/modal** dentro de `/tarefas/minhas`?

Ao confirmar 1–4, executo a Parte A (migration + Configurações) primeiro, com diff + rollback, e só depois sigo para B e C.
