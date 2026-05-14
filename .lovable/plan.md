
# Fluxo correto Aprovador → Executor (plano de ação) → Aprovador → Auditor

## Comportamento

**Aba Aprovador** (abaixo da barra de progresso):
- Lista TODAS as perguntas do aprovador (manuais do template + herdadas do executor)
- Cada pergunta tem toggle **Conforme / Não Conforme**
- Ao marcar **Não Conforme**: abre campos de plano de ação conforme configuração do template (descrição obrigatória, anexo opcional/obrigatório, prazo)
  - **Prazo:** vem pré-preenchido do padrão configurado no template (`prazo_plano_acao_padrao_horas`). Aprovador pode aumentar.
  - Se aprovador alterar prazo do padrão → grava `flag_prazo_alterado=true` + campo `justificativa_alteracao_prazo` obrigatório
- Botão **"Aprovar Final"** só habilita se TODAS as perguntas estão Conforme e sem pendências
- Botão **"Devolver com Plano de Ação"** ativo se houver qualquer NC → status vai para `EM_PLANO_ACAO`, executor recebe a tarefa de volta

**Quando executor recebe de volta (EM_PLANO_ACAO)**:
- Vê só os itens NC com plano + prazo individual
- Resolve cada um e devolve ao aprovador
- Se executor concluir após `plano_acao_prazo` → grava `flag_atraso_plano_acao=true`
- Se for 2ª vez atrasado (já existia flag de atraso anterior) → `flag_reincidencia_atraso=true`
- Em qualquer entrega atrasada → campo **justificativa do atraso** (descrição + anexo se configurado) é OBRIGATÓRIO

**SLA estourado (etapa ou pergunta)**:
- Se SLA da pergunta estoura → flag automática + perda de pontos calculada no scoring
- Se SLA da etapa estoura → flag automática
- Se houver justificativa do executor/aprovador para o atraso → grava no log, auditor vê marcado
- Sempre que houver atraso, campo justificativa (descrição + anexo opcional) é solicitado

**Aba Auditor** (já implementada estruturalmente):
- Mostra suas próprias perguntas configuradas no template
- **Acima/abaixo de cada pergunta** mostra alertas automáticos do que precisa investigar:
  - Aprovador alterou prazo padrão? → mostra justificativa para auditor avaliar
  - SLA estourou (etapa ou pergunta)? → mostra qual e justificativa do responsável
  - Atraso no plano de ação? → mostra qual NC, prazo original vs realizado, justificativa
  - Reincidência de atraso? → destaca

**Visibilidade das flags**: aparecem para Aprovador (durante revisão) E Auditor (durante auditoria).

## Banco

```sql
-- 1) Configuração no template: prazo padrão de plano de ação (horas)
ALTER TABLE operational_templates
  ADD COLUMN IF NOT EXISTS prazo_plano_acao_padrao_horas integer DEFAULT 24;

-- 2) Por pergunta do aprovador: estrutura da resposta + plano de ação
ALTER TABLE operational_approval_answers
  ADD COLUMN IF NOT EXISTS conforme boolean,
  ADD COLUMN IF NOT EXISTS plano_acao_descricao text,
  ADD COLUMN IF NOT EXISTS plano_acao_prazo timestamptz,
  ADD COLUMN IF NOT EXISTS plano_acao_anexo_url text,
  ADD COLUMN IF NOT EXISTS prazo_padrao_aplicado timestamptz, -- snapshot do prazo padrão
  ADD COLUMN IF NOT EXISTS flag_prazo_alterado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_alteracao_prazo text,
  ADD COLUMN IF NOT EXISTS resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS resolucao_atrasada boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_atraso text,
  ADD COLUMN IF NOT EXISTS justificativa_atraso_anexo_url text;

-- 3) Por assignment: flags consolidadas
ALTER TABLE operational_assignments
  ADD COLUMN IF NOT EXISTS flag_atraso_plano_acao boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reincidencia_atraso boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_sla_etapa_estourado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS justificativa_sla_etapa text,
  ADD COLUMN IF NOT EXISTS justificativa_sla_etapa_anexo_url text;

-- 4) RLS: aprovador e auditor já têm acesso. Garantir UPDATE para aprovador nos novos campos.
```

## Frontend

**`tarefas_embeddedActionPanels.tsx` — `EmbeddedApprovalPanel` (refactor)**:
- Renderizar lista de perguntas (manuais + herdadas executor)
- Por pergunta: toggle Conforme/NC
- Se NC: bloco de plano de ação com:
  - Descrição (textarea, obrigatório)
  - Prazo (datetime-local pré-preenchido com `now() + prazo_plano_acao_padrao_horas`)
  - Anexo (se template exigir)
  - Se prazo alterado do padrão → campo justificativa aparece (obrigatório)
- Botões finais condicionais:
  - "Aprovar Final" — só se todas Conforme
  - "Devolver com Plano de Ação" — se houver NC com plano completo
- Auto-save por pergunta (já existe padrão)

**`tarefas_embeddedActionPanels.tsx` — `EmbeddedAuditPanel` (extensão)**:
- Acima de cada pergunta do auditor, renderizar `<AlertasAprovacao>` com:
  - Lista de planos de ação com prazo alterado + justificativa do aprovador
  - Atrasos do executor + justificativa
  - SLA estourado de etapa/pergunta + justificativa
  - Reincidências em destaque

**`tarefas_useApprovalFlow.ts`**:
- Novo `salvarRespostaAprovador({ fieldId, conforme, plano? })` (auto-save com flag de prazo alterado)
- `devolverComPlanoAcao(motivo)` — substitui criarPlanosAcaoEDevolver: agora cria contingências a partir das respostas NC + dispara `reprovar_devolver_final` com status EM_PLANO_ACAO
- `aprovarFinal()` validação local: bloqueia se houver NC pendente

**`tarefas_useTransition.ts`**:
- Quando executor reabre tarefa em EM_PLANO_ACAO e devolve para aprovação:
  - Para cada `operational_approval_answers` com `plano_acao_prazo`, marca `resolvido_em=now()`, `resolucao_atrasada = now() > plano_acao_prazo`
  - Se já existir flag anterior em `operational_assignments.flag_atraso_plano_acao=true` E nova resolução também atrasada → `flag_reincidencia_atraso=true`
  - Se nova resolução atrasada → `flag_atraso_plano_acao=true`
  - Exigir `justificativa_atraso` + anexo (configurável) quando `resolucao_atrasada=true`

## Arquivos

```
NOVO   supabase/migrations/<ts>_aprovador_plano_acao_flags.sql
EDIT   src/modules/tarefas/components/tarefas_embeddedActionPanels.tsx
EDIT   src/modules/tarefas/hooks/tarefas_useApprovalFlow.ts
EDIT   src/modules/tarefas/hooks/tarefas_useTransition.ts
```

## Confirmações

Aplicando: (1) migration → (2) hook approval flow + transition → (3) panels UI. Aprova?
