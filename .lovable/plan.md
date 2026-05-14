## Pacote único — refator do fluxo de aprovação + UX em Minhas Tarefas

### 1. Bug: respostas/anexos do executor não aparecem no painel do aprovador
**Causa provável:** o painel atual em `tarefas_embeddedActionPanels.tsx` consulta `flow.fieldAnswers` (vindo de `operational_field_answers`) por `field_id`, mas o assignment exibido na tela "Aguardando Aprovação" pode não ter respostas nessa tabela (executor está salvando em outra estrutura, ex.: `template_snapshot.respostas` ou `evidencia_url` único). Validar fonte real lendo um assignment exemplo, e:
- Padronizar leitura (fallback: `operational_field_answers` → `assignment.respostas_json` → `template_snapshot`).
- Renderizar valor + observação + anexo (imagem ou link) acima de cada pergunta do aprovador.
- Mostrar nome do executor + horário de preenchimento.

### 2. Auto-save persistente do aprovador
Hoje `useApprovalFlow.autoSaveApproverAnswer` faz upsert em `operational_approval_answers`. Ao reabrir, o painel monta a UI a partir de `approverAnswers` (estado local vazio). Corrigir:
- No mount, hidratar `approverAnswers` a partir de `existingApprovalAnswers` para que toggles "Conforme/Não Conforme", observação e (novo) anexo já apareçam preenchidos.
- Mostrar badge "Salvo automaticamente" por pergunta.

### 3. Remover "Reprovar e devolver" como botão direto
Substituir por **etapa final consolidada de Plano de Ação**:
- Aprovador responde tudo (Conforme/Não Conforme + opcional anexo + observação).
- Botão único: **"Revisar e finalizar"**. Se houver qualquer "Não Conforme":
  - Abre painel `EmbeddedPlanoAcaoFinalPanel` listando todas as NCs.
  - Para cada NC: campos `descricao_acao` (obrig.), `prazo` (data/hora), `responsavel` (profile **ou** setor), `criticidade`.
  - Salvar grava em `operational_contingencies` (uma por NC) e dispara transição `reprovar_devolver_final` para o(s) destinatário(s).
- Se zero NCs: botão executa `aprovar_final` direto.
- Manter `Encerrar (sem aprovar)` somente para admin como fallback.

### 4. Anexo do aprovador (opcional, controlado pelo template)
- **Builder** (`tarefas_tabFormBuilder.tsx` ou equivalente): nova flag por campo `aprovador_exige_evidencia` (boolean, default false).
- **Snapshot**: incluir flag no `template_snapshot.fields[].aprovador_exige_evidencia`.
- **Painel aprovador**: quando flag = true, renderizar `<input type=file>` + observação obrigatória, mesmo se resposta for "Conforme".
- Upload usa o mesmo provider de evidências do executor; URL salva em coluna nova `operational_approval_answers.evidencia_url`.

### 5. Barra de progresso no card "Minhas Tarefas"
No `tarefas_tarefaCard.tsx`:
- **Barra A — preenchimento**: % de campos obrigatórios da etapa atual do usuário (executor, aprovador ou auditor) já respondidos.
- **Barra B — tempo SLA**: % decorrido entre `inicio_etapa` (ou `created_at`/`fim_em` da etapa anterior) e `prazo_etapa`. Cores: verde <60%, âmbar 60-90%, vermelho >90% / vencido. Mostrar texto "faltam Xh" ou "vencida há Xh".
- Etapa atual derivada do papel do usuário no assignment + status atual (mesma lógica do bucketize).

### 6. Migração (DB)
- `ALTER TABLE operational_approval_answers ADD COLUMN evidencia_url text;`
- `ALTER TABLE operational_template_fields ADD COLUMN aprovador_exige_evidencia boolean NOT NULL DEFAULT false;`
- Sem mudança em RLS (mesmas regras das colunas existentes).

### Arquivos impactados
- `supabase/migrations/<nova>.sql` (nova)
- `src/modules/tarefas/components/tarefas_embeddedActionPanels.tsx` (refator do bloco aprovador, hidratação, anexos)
- `src/modules/tarefas/hooks/tarefas_useApprovalFlow.ts` (hidratar estado, suportar `evidencia_url`, novo método `criarPlanoAcao`)
- `src/modules/tarefas/components/painels/tarefas_embeddedAprovacaoPanel.tsx` (substituir botões por "Revisar e finalizar")
- **NOVO**: `src/modules/tarefas/components/painels/tarefas_embeddedPlanoAcaoFinalPanel.tsx`
- `src/modules/tarefas/components/builder/...` (flag `aprovador_exige_evidencia`)
- `src/modules/tarefas/components/tarefas_tarefaCard.tsx` (duas barras de progresso)
- `supabase/functions/generate-daily-assignments/index.ts` (incluir flag no snapshot)

### Fora de escopo (não tocar)
- Lógica de `score_aprovador` e RLS de tabelas existentes.
- Fluxo do executor e auditor (sem mudanças).
- Remoção do botão "Encerrar (sem aprovar)" (mantido como fallback admin).
