# diff_alteracao.md

## Arquivos alterados

- `src/modules/tarefas/pages/tarefas_rotinasPage.tsx`

## Causa raiz

Ao editar uma rotina, campos removidos no Avaliado que já tinham vínculo histórico não podiam ser apagados fisicamente de `operational_template_fields`. Como o `openEdit` recarregava todos os campos da tabela, esses campos antigos voltavam para o estado do builder e o checklist do Aprovador era reidratado com réplicas antigas/orfãs do `ada_config_snapshot.checklists.aprovador`.

## Ajuste no save/openEdit/sanitize

### `sanitizeAprovadorChecks`

- Passou a reconstruir as perguntas `replicada_avaliado` sempre a partir dos `fields` atuais do Avaliado.
- Remove qualquer réplica cujo `field_id` não corresponda ao Avaliado ativo no estado atual.
- Atualiza `field_label`, `pergunta_padrao`, `origem_pergunta` e `pergunta_origem_id` com base no field atual.
- Mantém perguntas automáticas e manuais válidas sem alterar regras de SLA, devolução, evidência ou plano de ação.

### `save/upsert`

- Antes de salvar `ada_config_snapshot.checklists.aprovador`, o snapshot é saneado contra os `fields` atuais.
- O snapshot passa a gravar também a lista dos campos ativos do Avaliado em:
  - `ada_config_snapshot.checklists.avaliado_fields`
  - `ada_config_snapshot.checklists.avaliado_field_ids`
- Isso impede que campos antigos mantidos apenas por histórico sejam considerados ativos ao reabrir a rotina.

### `openEdit`

- Ao abrir rotina existente, se existir lista de campos ativos no snapshot, o builder carrega somente esses campos para a aba Avaliado.
- O Aprovador é reidratado chamando o mesmo `sanitizeAprovadorChecks`, garantindo:
  - sem órfãos;
  - sem snapshot antigo divergente;
  - label/pergunta atualizados conforme Avaliado;
  - se não houver pergunta no Avaliado, nenhuma réplica antiga aparece no Aprovador.

## Diff funcional aplicado

```diff
- sanitizeAprovadorChecks filtrava apenas réplicas inválidas por field_id existente no array atual.
+ sanitizeAprovadorChecks agora reconstrói a seção replicada do Aprovador a partir dos fields atuais do Avaliado.

- openEdit carregava todos os registros de operational_template_fields do template.
+ openEdit usa ada_config_snapshot.checklists.avaliado_fields/avaliado_field_ids para diferenciar campos ativos de campos históricos.

- save gravava somente checklists.aprovador e checklists.validador.
+ save grava também o índice dos campos ativos do Avaliado junto do snapshot de checklists.
```

## Pendências fora desta etapa

- Limpeza retroativa de JSONB já salvo em rotinas antigas antes desta correção, se necessário em massa.
- Migração/cleanup de campos históricos no banco, caso futuramente seja desejado remover fisicamente dados sem vínculo.
- Runtime de execução de tarefas já geradas não foi alterado nesta etapa.

## Confirmação de escopo

- Não alterou banco schema.
- Não criou migration.
- Não alterou RPC.
- Não alterou cron.
- Não alterou runtime de execução amplo.
- Não alterou outras telas.
- Não alterou auditor/fluxo/SLA.