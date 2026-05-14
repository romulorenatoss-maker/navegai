# Aprovador + Auditor: abas de etapa com perguntas automáticas e manuais

## Objetivo

Após a barra de progresso, mostrar **abas por etapa** (Executor → Aprovador → Auditor) listando apenas as perguntas correspondentes ao papel logado. Cada papel responde só o que é dele. Perguntas podem ser:

- **Manuais** — cadastradas no template para aquele papel
- **Automáticas (herdadas)** — copiadas das respostas do executor; vêm preenchidas mas com ícone de **lápis** para editar; ao editar, o aprovador/auditor obrigatoriamente registra **motivo** (texto) e, se o template exigir, **anexo**

## 1. Banco

**Migration nova:**

```sql
-- Auditor por campo (espelha aprovador_*)
ALTER TABLE operational_template_fields
  ADD COLUMN auditor_verificar boolean NOT NULL DEFAULT false,
  ADD COLUMN auditor_pergunta text DEFAULT '',
  ADD COLUMN auditor_tipo_resposta text DEFAULT 'conforme',
  ADD COLUMN auditor_peso numeric DEFAULT 1,
  ADD COLUMN auditor_obriga_observacao_nao boolean DEFAULT true,
  ADD COLUMN auditor_exige_evidencia boolean NOT NULL DEFAULT false,
  ADD COLUMN auditor_exige_evidencia_nao boolean DEFAULT false,
  ADD COLUMN auditor_tipos_evidencia jsonb DEFAULT '["foto"]'::jsonb,
  -- Herança da resposta do executor (default desligado)
  ADD COLUMN aprovador_herdar_resposta boolean NOT NULL DEFAULT false,
  ADD COLUMN auditor_herdar_resposta boolean NOT NULL DEFAULT false;

-- Tabela de respostas do auditor (espelha operational_approval_answers)
CREATE TABLE operational_audit_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES operational_assignments(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES operational_template_fields(id) ON DELETE CASCADE,
  resposta text,
  observacao text,
  evidencia_url text,
  motivo_alteracao text,        -- preenchido quando alterou herdada
  herdada boolean DEFAULT false,
  auditor_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(assignment_id, field_id)
);

-- mesma estratégia em operational_approval_answers (motivo + herdada)
ALTER TABLE operational_approval_answers
  ADD COLUMN motivo_alteracao text,
  ADD COLUMN herdada boolean DEFAULT false;

-- Status novo no fluxo
-- (TASK_STATUS já tem AGUARDANDO_AUDITORIA? confirmar; se não, adicionar)
```

RLS:
- `operational_audit_answers`: SELECT/INSERT/UPDATE para `auditor_id = profile.id` ou admin; SELECT também para criador/responsavel/aprovador (para histórico).

## 2. Fluxo (`tarefas_useTransition.ts`)

- Nova ação `enviar_auditoria` (aprovador → status `aguardando_auditoria`)
- `aprovar_final` agora roteia: se template tem `auditor_id` E há campos com `auditor_verificar=true`, vai para `aguardando_auditoria`; senão, direto para `aprovada/concluida` (comportamento atual)
- Nova ação `auditor_aprovar` (→ `aprovada`) e `auditor_devolver` (→ `devolvida`, com motivo)
- Atualizar `VALID_TRANSITIONS` em `services/tarefas_canTransition.ts`

## 3. Builder de template

`src/modules/tarefas/builders/...` (campo a campo): adicionar bloco "Auditor" idêntico ao bloco "Aprovador" já existente, mais checkbox **"Herdar resposta do executor"** em ambos.

## 4. UI — Abas por etapa no drawer

**`tarefas_minhasTarefasPage.tsx`** (drawer de execução):

Abaixo da barra de progresso, renderizar `<Tabs>` com:
- **Executor** (sempre, se houver campos `visivel_para` contendo executor)
- **Aprovador** (se há campos com `aprovador_verificar=true`)
- **Auditor** (se há campos com `auditor_verificar=true`)

Filtros de visibilidade:
- Papel logado **executor**: vê só a aba Executor
- Papel logado **aprovador**: vê Executor (read-only) + Aprovador (editável)
- Papel logado **auditor**: vê Executor + Aprovador (read-only) + Auditor (editável)
- Admin: vê tudo, edita tudo

**Novo `EmbeddedAuditPanel`** clonado de `EmbeddedApprovalPanel`:
- Lista campos `auditor_verificar=true`
- Para cada um, se `auditor_herdar_resposta=true`, pré-carrega a resposta do executor (read-only com ícone de lápis)
- Ao clicar no lápis: libera edição, abre campo `motivo_alteracao` (obrigatório) e, se `auditor_exige_evidencia(_nao)`, exige anexo
- Auto-save (mesmo padrão do approval panel)

**Atualizar `EmbeddedApprovalPanel`**:
- Aplicar mesma lógica de herança (`aprovador_herdar_resposta`) com lápis + motivo + anexo condicional

## 5. Bucketize / abas listagem

`tarefas_bucketize.ts`:
- `isAuditoriaPendente` já reage a `APROVADA/CONCLUIDA`; ajustar para também reagir a `AGUARDANDO_AUDITORIA`
- Auditor só vê em "Aguardando Você" quando status = `AGUARDANDO_AUDITORIA`

## 6. Hooks

- Novo `tarefas_useAuditFlow.ts` (clone do `tarefas_useApprovalFlow.ts`)
- Atualizar `useApprovalFlow`: ação final agora chama `enviar_auditoria` quando aplicável

## Arquivos impactados

```
NOVO   supabase/migrations/<ts>_auditor_flow.sql
NOVO   src/modules/tarefas/hooks/tarefas_useAuditFlow.ts
EDIT   src/modules/tarefas/hooks/tarefas_useApprovalFlow.ts
EDIT   src/modules/tarefas/hooks/tarefas_useTransition.ts
EDIT   src/modules/tarefas/services/tarefas_canTransition.ts
EDIT   src/modules/tarefas/services/tarefas_statusConstants.ts (se faltar AGUARDANDO_AUDITORIA)
EDIT   src/modules/tarefas/services/tarefas_bucketize.ts
EDIT   src/modules/tarefas/components/tarefas_embeddedActionPanels.tsx (refactor + EmbeddedAuditPanel + herança)
EDIT   src/modules/tarefas/pages/tarefas_minhasTarefasPage.tsx (Tabs por etapa, isAuditorMode)
EDIT   src/modules/tarefas/builders/<arquivo do campo> (UI auditor + checkbox herdar)
```

## Notas

- A barra de progresso **continua única no topo** (% por papel logado)
- Tarefas existentes continuam funcionando (todas as novas colunas têm default; sem auditor configurado = fluxo igual ao atual)
- Filtro de visibilidade do executor já remove campos de aprovador na visão dele — vou reforçar para esconder também aba inteira

Vou aplicar passo a passo: 1) migration, 2) hooks/transition, 3) panels/UI, 4) builder. Aprova?