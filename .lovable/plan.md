## Objetivo

Separar responsabilidades:
- **Avaliado/Executor**: apenas operacional (responder + anexar). Sem regras avaliativas.
- **Aprovador**: única origem das regras avaliativas; replica cada pergunta do Avaliado e nelas vivem todas as regras (conforme/NC, evidência, plano de ação, devolução, reabertura, prazo, perda de pontos, ponderação, anexos).
- **Pacote padrão**: continua separado, só para métricas gerais (prazo global, atraso por etapa, obrigatórias respondidas, evidências anexadas, devolução/reabertura). Sem duplicar penalidade de plano de ação.
- **Nota do Avaliado**: calculada exclusivamente pelas respostas do Aprovador às perguntas replicadas.

## Análise de impacto (antes de alterar)

### Arquivos que precisam ser ajustados
1. `src/modules/tarefas/types/tarefas_types.ts`
   - `FieldForm`: remover/depreciar campos avaliativos do Avaliado:
     - `penalidade_reprovacao`, `impacta_score`, `criticidade`, `gera_contingencia`,
       `exige_evidencia`, `tipo_evidencia`, `opcoes_regras`, `validacao`,
       `condicao_visibilidade`, `formula`, `aprovador_*` (já migrado p/ aba Aprovador).
   - Manter: `label`, `descricao`, `tipo`, `ordem`, `obrigatorio`, `peso`, `instrucao_url/tipo`.
   - `defaultField`: simplificar.

2. `src/modules/tarefas/components/builder/StepChecklistAvaliado.tsx` (ou equivalente que renderiza o config da pergunta do Avaliado)
   - Remover da UI: bloco "regras", criticidade, plano de ação, penalidades, condicionais, opções de regra, evidência obrigatória, formulários condicionais.
   - Manter: título, descrição, tipo base, peso, obrigatório, instrução visual.

3. `src/modules/tarefas/components/builder/StepChecklistAprovador.tsx`
   - Já existe a lista unificada com replicação. Garantir que a pergunta replicada herda só: `field_label`, `tipo` base mapeado, `peso`, `pergunta_origem_id`.
   - Garantir que TODAS as regras avaliativas estão disponíveis no `FieldConfigSheet` da pergunta replicada (já estão; só validar).

4. `src/modules/tarefas/components/builder/FieldConfigSheet.tsx`
   - Sem mudanças estruturais — é o lugar correto para as regras (Aprovador).

5. `src/modules/tarefas/components/builder/checklistNormalizers.ts`
   - Migrar peso/tipo do Avaliado para a pergunta replicada do Aprovador ao carregar rotinas antigas.
   - Limpar campos avaliativos legados do Avaliado ao normalizar (sem dropar dados — só ignorar na UI).

6. `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts` + `TarefasConfigPontuacao.tsx`
   - Pacote padrão: revisar a lista default para conter SOMENTE métricas gerais (prazo global, atraso por etapa, obrigatórias respondidas, evidências anexadas, devolução/reabertura). Remover qualquer item de "plano de ação" do pacote padrão para não duplicar.

7. Engine de scoring (`tarefas_useScoring.ts` e/ou serviço relacionado)
   - **Não alterar agora** o cálculo final (fora do escopo UI imediato), mas **documentar** que a nota do Avaliado deve vir das respostas do Aprovador às perguntas replicadas. Marcar TODO no código se necessário.
   - Se já houver cálculo somando peso direto do Avaliado: ajustar para somar a partir da lista do Aprovador (replicadas + manuais), aplicando NC → desconto proporcional ao peso.

### O que NÃO será mexido
- Banco de dados / migrations (campos legados ficam, só deixam de ser usados na UI).
- `tarefas_useTransition.ts`, fluxo de transições, hooks de execução.
- Snapshots de rotinas existentes — `checklistNormalizers` faz a ponte.
- `AprovadorCheckItemForm` em `types.ts` — já tem os campos necessários.

## Plano de execução

### Fase A — UI do Avaliado simplificada
1. Identificar o componente real que renderiza o editor de pergunta do Avaliado (provavelmente `StepChecklistAvaliado.tsx` ou `tarefas_tabFormBuilder.tsx`).
2. Remover da UI todos os controles avaliativos. Manter apenas: título, descrição, tipo base, peso, obrigatório, instrução/anexo de referência.
3. Remover o bloco "Pergunta do Aprovador" inline (já existe a aba dedicada).

### Fase B — Garantir replicação enxuta no Aprovador
1. Em `StepChecklistAprovador.tsx` / `defaultAprovadorCheckItem`: confirmar que só herdamos `field_label`, `tipo` mapeado, `peso`, `pergunta_origem_id`.
2. Manter `FieldConfigSheet` como única tela de regras.

### Fase C — Pacote padrão = só métricas gerais
1. Em `tarefas_pontuacao_config_service.ts`, substituir as 10 perguntas atuais por itens de métrica geral:
   - Prazo global cumprido
   - Atrasos por etapa
   - Obrigatórias respondidas
   - Evidências anexadas
   - Devoluções/reaberturas
2. Remover qualquer item de "plano de ação" do pacote padrão.

### Fase D — Score do Avaliado vem do Aprovador
1. Localizar onde a nota do Avaliado é calculada hoje.
2. Alterar para somar peso × resultado da pergunta replicada (Conforme = 100% do peso; NC = 0; com ponderação do auditor se aplicável).
3. Pacote padrão entra como métrica geral separada (não soma na nota da pergunta).

## Confirmação solicitada

Como a alteração toca contrato de dados (`FieldForm`), normalização de rotinas legadas e engine de score, peço confirmação antes de aplicar. Em especial:

- **OK remover da UI** os campos avaliativos do Avaliado mantendo as colunas no banco como legado?
- **OK substituir o pacote padrão atual** (10 perguntas) por 5 métricas gerais?
- **Fase D (engine de score)**: posso ajustar agora ou prefere deixar como TODO sinalizado e aplicar em passo separado?
