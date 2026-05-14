## Causa raiz

Na tela "Configurar pergunta" (sheet do Aprovador), os toggles por opção (Gera plano de ação / Exige justificativa / Exige evidência / Permite devolução) parecem "voltar à configuração anterior" porque o estado nunca chega a ser persistido — e quando volta a ser carregado, vem incompleto.

Dois bugs em `src/modules/tarefas/pages/tarefas_rotinasPage.tsx`:

### Bug 1 — Save NÃO grava `aprovadorChecks`/`validadorChecks`
O mutation `upsert` (linhas ~172-330) monta o `payload` para `operational_templates` mas **não inclui** `ada_config_snapshot.checklists.aprovador|validador`. O `StepChecklistAprovador` altera o estado em memória; ao salvar a rotina, nada relacionado a `aprovadorChecks` vai para o banco.

### Bug 2 — `openEdit` hidrata o checklist com campos faltando (linhas 493-506)
Ao reabrir a rotina, o map cria itens com apenas `tipo_resposta`, `peso`, `exige_observacao`, `exige_evidencia`, `permite_devolucao`, `gera_plano_acao`, `permite_conclusao`, `permite_aumento_prazo`. Ficam de fora:
- `opcoes`
- `regras_por_opcao`  ← justamente o que o sheet edita por opção
- `tipo`
- `origem_pergunta`, `pergunta_origem_id`
- `instrucao_url`, `instrucao_tipo`
- `permite_ponderacao_auditor`, `exige_justificativa_ponderacao`
- `sla_horas`, `ativo`, `editado_*`, `config_global_origem_id`, `config_atual_snapshot`

Resultado: mesmo se o snapshot tivesse os dados, o sheet abriria sem `regras_por_opcao` e o `useEffect [fields]` do `StepChecklistAprovador` reconstruiria os itens com `defaultRegra(...)` (ou seja, "configuração padrão anterior").

## Correção (mínima e localizada — só na page de rotinas)

Arquivo único: `src/modules/tarefas/pages/tarefas_rotinasPage.tsx`

1) **Persistir os checklists no save** (`upsert.mutationFn`, na montagem do `payload`):
   - Adicionar `ada_config_snapshot: { ...(form as any).ada_config_snapshot, checklists: { aprovador: aprovadorChecks, validador: validadorChecks } }` ao `payload` enviado para `operational_templates`.
   - Sem alterar nenhuma outra coluna nem o schema do banco (`ada_config_snapshot` é `jsonb` já existente, conforme a leitura na linha 489).

2) **Hidratar todos os campos no openEdit** (linhas 493-506 e o map do validador logo abaixo):
   - Mapear todos os campos que `AprovadorCheckItemForm` define, preservando `opcoes`, `regras_por_opcao`, `tipo`, `origem_pergunta`, `pergunta_origem_id`, `instrucao_url`, `instrucao_tipo`, `permite_ponderacao_auditor`, `exige_justificativa_ponderacao`, `sla_horas`, `ativo`, `editado_manual`, `editado_por`, `editado_em`, `config_global_origem_id`, `config_atual_snapshot`.
   - Default seguro: `opcoes ?? []`, `regras_por_opcao ?? []`, `ativo ?? true`.

3) **Não mexer** em:
   - `StepChecklistAprovador` (fluxo de sync e `updateItem` já está correto)
   - `FieldConfigSheet` (lógica de toggle/save já está correta)
   - Regras globais, RLS, schema do banco, ou qualquer outro fluxo (executor/avaliado/aprovador runtime)

## Validação

- Abrir uma rotina existente → editar regras de uma opção (ex: marcar "Gera plano de ação" no Conforme) → Salvar rotina → Reabrir → as regras devem refletir o que foi marcado.
- Conferir no console que `ada_config_snapshot.checklists.aprovador` chega ao update do template.
- Confirmar que rotinas legadas (sem `checklists` no snapshot) continuam abrindo sem quebrar (defaults aplicados).

## Aguardando confirmação

Conforme sua preferência, aguardo seu OK antes de aplicar — a alteração toca o salvamento da rotina (jsonb `ada_config_snapshot`). Posso prosseguir?