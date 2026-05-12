## Causa raiz

Hoje, no `tarefas_quickCreateDialog.tsx`:
- A etapa **Designação** só expõe o toggle **Aprovador**. O state `requerValidacao` (que mapeia para `avaliador_profile_id`) existe mas **não tem UI** — sempre fica `false`. Resultado: a tarefa nunca tem "avaliador conferente", e o que se chama de "Aprovador" hoje mistura os dois papéis.
- A etapa **Prazo & Notas** sempre renderiza o bloco de pontuação (perguntas automáticas + tabela de penalidades), apenas esmaecido (`opacity-50`) quando não há perguntas de aprovador. O bloco aparece mesmo sem aprovador/nota configurados.
- Texto de ajuda do Aprovador diz "Valida a nota final" — confunde com "valida execução".

## Arquivos impactados

Apenas frontend, presentation/UX. Sem banco, sem migration, sem RPC, sem trigger.

- `src/modules/tarefas/components/tarefas_quickCreateDialog.tsx`
  - Adicionar bloco UI **Avaliador** (toggle + Individual/Setor) usando o state existente `requerValidacao / validadorMode / validadorId / validadorSetorId` (já cabeado no payload — linhas 333‑334, 488‑492).
  - Renomear/reescrever labels do bloco **Aprovador** para deixar claro que é "aprovação final + pontuação".
  - Tornar a etapa 3 condicional: bloco de pontuação só renderiza se `requerAprovacao || temPerguntasAprovador || habilitarPerguntasAutomaticas`. Caso contrário mostrar apenas o card de Prazo/SLA operacional já existente acima.
  - Aviso "Tarefa sem pontuação" só aparece quando o usuário **ativou** Aprovador mas não configurou perguntas (e não em todo caso sem aprovador).
  - Texto novo dos toggles, conforme regra oficial:
    - Avaliador: "Quem vai conferir se a tarefa foi feita corretamente?" / ações: confirmar, devolver com observação, liberar.
    - Aprovador: "Quem vai aprovar e pontuar esta tarefa?" / ações: aprovar, reprovar, aplicar nota e penalidades.
  - Resumo final (linha ~1123) passa a listar Avaliador e Aprovador separadamente.

Nada muda em:
- `tarefas_tabFormBuilder.tsx` (builder)
- `tarefas_service.ts`, `tarefas_bucketize.ts`, `tarefas_rbac.ts`, `drawerActionRouter`
- Hooks de execução/avaliação/aprovação (`tarefas_useAssignmentExecution`, `useAssignmentReview`, `useApprovalFlow`)
- Trigger `enforce_*_distinto_avaliado` (já garante que avaliador ≠ avaliado e aprovador ≠ avaliado, então o novo bloco "Avaliador" respeita as regras existentes do banco).

## Mudanças concretas

### 1. Etapa 2 — Designação (quebra em três blocos visuais)

```text
[ Responsáveis ]
  - Setor / Avaliado / Plano de Ação (já existe)

[ Avaliação técnica (opcional) ]   ← NOVO bloco UI usando requerValidacao
  Switch "Quem confere a execução?"
  Texto: "Confere se a tarefa foi feita corretamente.
          Pode confirmar, devolver com observação ou solicitar ajuste.
          NÃO aplica nota."
  Individual | Setor → validadorId / validadorSetorId
  (validadorOptions já filtra: nunca o próprio avaliado)

[ Aprovação final e pontuação (opcional) ]   ← rótulo reescrito
  Switch "Quem aprova e pontua?"
  Texto: "Faz a aprovação final, aplica nota e penalidades.
          Não pode ser o próprio avaliado."
  Individual | Setor → aprovadorId / aprovadorSetorId
```

### 2. Etapa 3 — Prazo & Notas (renderização condicional)

Critério de exibição do bloco de pontuação:

```ts
const mostrarPontuacao =
  requerAprovacao
  || temPerguntasAprovador
  || habilitarPerguntasAutomaticas;
```

- Se `mostrarPontuacao === false` → renderizar apenas:
  - Card de Prazo / SLA operacional (já existe nessa etapa);
  - Mensagem informativa: "Esta tarefa não terá nota nem aprovação. Para habilitar pontuação, ative *Aprovação final e pontuação* na etapa Designação."
- Se `mostrarPontuacao === true` → mantém o bloco atual (perguntas automáticas + tabela de pontuação) sem alterações funcionais.

### 3. Resumo / payload

- Nenhuma mudança de payload: campos `avaliador_*` e `aprovador_*` continuam separados como já estão; o builder UI agora apenas torna o `avaliador_*` controlável pelo usuário.
- `pontuacaoValida`, `aprovacaoAtiva`, `requer_aprovacao_gestor`, `modo_pontuacao`, `penalidade_*` → mantidos como hoje.
- Resumo da revisão final passa a mostrar duas linhas: **Avaliador:** … / **Aprovador:** …

## Validação após aplicar

- Sem aprovador e sem avaliador → cria tarefa simples sem nota; etapa 3 só mostra prazo.
- Só com avaliador → tarefa entra em fila do avaliador para conferência (status já existente), sem pontuação.
- Só com aprovador → comportamento atual de pontuação preservado.
- Avaliador + aprovador → fluxo completo (executor → conferência → aprovação/nota).
- Trigger do banco continua bloqueando avaliador = avaliado e aprovador = avaliado.
- `tsc --noEmit` limpo.

## Entregáveis

ZIP com:
- `tarefas_quickCreateDialog.tsx` alterado
- `diff_alteracao.md`
- `manifest_arquivos.md`
- `checklist_validacao.md`
- `rollback.md`
- `mapa_avaliador_vs_aprovador.md`

## Confirmação necessária

Aplico exatamente esse escopo? Em particular confirme:
1. **Avaliador** vira um bloco UI novo controlado pelo usuário (estado `requerValidacao` já existe e já é gravado em `avaliador_profile_id/setor_id`). OK?
2. Bloco de pontuação some completamente quando não houver aprovador nem perguntas automáticas (não mais "esmaecido"). OK?
3. Sem mexer em hooks de execução/avaliação/aprovação nem em painéis (`PainelRetornoCard`, `drawerActionRouter`) — só labels/condicional no QuickCreateDialog. OK?
