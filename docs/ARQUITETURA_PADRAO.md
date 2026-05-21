# ARQUITETURA PADRÃO DE DESENVOLVIMENTO
**Autor:** Romulo Renato
**Versão:** 3.0 — 2026-05-17
**Aplicável a:** Todos os projetos e sistemas

---

## ⚠️ LEIA ANTES DE QUALQUER COISA

Você é o executor. O arquiteto já definiu tudo aqui.
Sua função é implementar exatamente o que está descrito.
Nunca decida arquitetura sozinho. Nunca assuma. Nunca invente.

---

## 1. PERGUNTAS OBRIGATÓRIAS ANTES DE QUALQUER IMPLEMENTAÇÃO

Antes de escrever uma linha de código, responda:

1. Qual o nome do módulo e sua responsabilidade única?
2. De qual projeto/sistema faz parte?
3. **O sistema é SaaS?** → toda tabela nasce com tenant_id + RLS + isolamento total
4. Este módulo precisa funcionar offline?
5. É módulo premium? → feature flag obrigatória
6. Quais perfis acessam e com quais permissões?
7. Já existe algo equivalente no sistema? → se sim, refatorar, nunca duplicar

Se receber pedido de página, componente, tabela ou qualquer coisa
sem saber de qual módulo faz parte → **PARA E PERGUNTA.**

---

## 2. ORDEM OBRIGATÓRIA DE ENTREGA

```
1. Mapeamento → explicar → aguardar aprovação
2. Migration (banco)
3. Types (interfaces TypeScript)
4. Service (acesso ao banco)
5. Hooks (lógica de estado)
6. Components (visual)
7. Page (tela montada)
8. Rota registrada no router oficial
9. Checklist de entrega preenchido
```

Nunca pular etapas.
Nunca entregar tudo de uma vez sem checkpoint.
Migration sempre antes do código.

---

## 3. REGRAS GERAIS

- Nenhum módulo nasce genérico
- Nenhuma arquitetura decidida sem aprovação
- Antes de criar tela nova: verificar se já existe equivalente
- Se existir: refatorar. Nunca criar duplicado
- Menus e rotas apontam para o módulo oficial
- Proibido criar rota paralela para corrigir problema
- Commit descritivo por alteração — nunca commit genérico

---

## 4. ESTRUTURA OBRIGATÓRIA DE MÓDULO

```
src/modules/modulo/
  pages/          → telas e rotas
  hooks/          → queries, mutations e estado
  components/     → componentes visuais
  services/       → único ponto de acesso ao banco
  utils/          → funções puras sem efeito colateral
  types/          → interfaces e tipos TypeScript
```

### Prefixo obrigatório em todos os arquivos

| Tipo       | Exemplo                            |
|------------|------------------------------------|
| Page       | `financeiro_lancamentosPage.tsx`   |
| Hook       | `financeiro_useLancamentos.ts`     |
| Component  | `financeiro_lancamentoCard.tsx`    |
| Service    | `financeiro_service.ts`            |
| Util       | `financeiro_formatarMoeda.ts`      |
| Types      | `financeiro_types.ts`              |

### Regras de arquivos
- Prefixo do módulo em **todos** os arquivos sem exceção
- Nenhum componente acessa supabase diretamente
- Todo acesso ao banco passa pelo `modulo_service.ts`
- Uploads sempre pelo storage service centralizado

---

## 5. PADRÃO DE BANCO DE DADOS

### Nomenclatura

```
modulo_entidade              → tabela
modulo_rpc_acao              → RPC (uma por ação)
modulo_trigger_descricao     → trigger (uma responsabilidade)
```

### Colunas obrigatórias em toda tabela

```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ DEFAULT NULL  -- soft delete padrão

-- Se SaaS (obrigatório)
tenant_id  UUID NOT NULL REFERENCES clientes(id)
```

### Regras de FK
- Tabelas filhas → `ON DELETE CASCADE`
- Referências históricas → `ON DELETE SET NULL`

### Regras de RPC
- Uma RPC = uma ação. Nunca genérica.
- Sempre com tratamento de erro e rollback
- `SECURITY DEFINER` só quando necessário e justificado

### Regras de Trigger
- Um trigger = uma responsabilidade
- Nome explícito dizendo o que faz
- Nunca trigger silencioso sem log de auditoria

### Regras gerais
- Nunca recriar tabela. Sempre `ADD COLUMN IF NOT EXISTS`
- Nunca deletar dados em migration. Usar `deleted_at`
- Nunca manipular sequences fora de migrations
- RLS habilitado em toda tabela sem exceção

---

## 6. SaaS — ISOLAMENTO TOTAL ENTRE CLIENTES

**Se o sistema for SaaS, toda tabela nasce com:**

```sql
-- Coluna de isolamento
tenant_id UUID NOT NULL REFERENCES clientes(id)

-- Nenhum cliente vê dado de outro
CREATE POLICY "modulo_tenant_isolation" ON modulo_entidade
  FOR ALL USING (tenant_id = get_tenant_id());

-- Admin vê tudo do seu tenant
CREATE POLICY "modulo_admin_all" ON modulo_entidade
  FOR ALL USING (
    tenant_id = get_tenant_id()
    AND is_admin(auth.uid())
  );

-- User vê o que é seu dentro do tenant
CREATE POLICY "modulo_user_select" ON modulo_entidade
  FOR SELECT USING (
    tenant_id = get_tenant_id()
    AND created_by = auth.uid()
  );
```

**Impacto de não fazer desde o início:**
- CRÍTICO: dados de um cliente vazam para outro
- Reescrever RLS depois com dados em produção é perigoso
- Impossível auditar o que foi exposto

---

## 7. PERMISSÕES E SEGURANÇA

- RLS definido antes do código, nunca depois
- Quem vê, edita e deleta — definido por módulo antes de implementar
- Admin vê tudo (do seu tenant se SaaS)
- User vê o que lhe pertence ou foi atribuído
- Soft delete padrão. Hard delete só com instrução explícita

---

## 8. OFFLINE — REGRA OBRIGATÓRIA

**Pergunta obrigatória antes de qualquer módulo:**
"Este módulo precisa funcionar offline?"

Se sim, definir **antes** de implementar:

| Item | O que definir |
|---|---|
| Dados offline | Quais registros ficam disponíveis sem internet |
| Ações offline | O que o usuário pode fazer sem internet |
| Fila de sync | Formato da fila local e ordem de envio ao reconectar |
| Idempotência | UUID v4 + timestamp gerado no cliente |
| Status local | `pendente` / `sincronizado` / `erro` / `conflito` |
| Regra de conflito | Servidor vence; cliente notificado |
| Auditoria de sync | Log: o que, quando, quem, conflito e regra aplicada |
| Bloqueios | O que é proibido fazer offline |
| Nunca offline | Lista explícita do que jamais pode ser feito offline |

**Módulos críticos — offline-first desde a arquitetura:**
`tarefas` | `OS` | `checklist` | `força de vendas` | `rota` | `estoque` | `campo/mobile`

Nunca implementar offline de forma genérica.
Offline é definido por módulo e por ação.

---

## 9. MÓDULOS PREMIUM / OPCIONAIS

```typescript
// Código existe, acesso bloqueado até liberação explícita
if (!hasFeature('modulo_premium')) {
  return <FeatureBloqueada />;
}
```

Feature flag definida antes da implementação.

---

## 10. CADA MÓDULO DEVE TER

- [ ] Regras de negócio documentadas antes do código
- [ ] Permissões por perfil definidas
- [ ] Auditoria: `created_by`, `updated_at`, `deleted_at`
- [ ] Rollback definido (o que acontece se falhar)
- [ ] Checklist de teste
- [ ] Diff rastreável no repositório

---

## 11. UPLOADS E STORAGE

- Todo upload passa pelo service centralizado do módulo
- Nunca `supabase.storage` direto nos componentes
- Path lógico definido por módulo antes de implementar

Exemplo padrão (tarefas):
```
tarefas/{MM-YYYY}/{DD}/{rotina|ad_hoc}/#{XXXX}-{slug}.ext
```

---

## 12. PROTOCOLO PARA PROJETO FORA DO PADRÃO

Ao receber um projeto que não segue este padrão,
mapear e reportar antes de tocar em qualquer coisa:

```
⚠️ DIVERGÊNCIAS ENCONTRADAS

1. [arquivo] sem prefixo do módulo
   → Impacto: dificulta manutenção e busca
   → Sugestão: renomear para modulo_arquivo.tsx

2. [componente] acessa supabase diretamente
   → Impacto: lógica espalhada, impossível testar isolado
   → Sugestão: mover para modulo_service.ts

3. [tabela] sem RLS
   → Impacto: CRÍTICO — dados expostos entre usuários
   → Sugestão: migration urgente com RLS + políticas

4. [tabela SaaS] sem tenant_id
   → Impacto: CRÍTICO — dados de clientes misturados
   → Sugestão: migration com tenant_id + RLS de isolamento

5. [trigger] com múltiplas responsabilidades
   → Impacto: difícil debugar, efeitos colaterais ocultos
   → Sugestão: separar em triggers específicos

Aguardando aprovação para corrigir.
Farei migration + código juntos para não quebrar
o que está funcionando.
```

---

## 13. O QUE NUNCA PODE SER FEITO SEM INSTRUÇÃO EXPLÍCITA

- Decidir arquitetura de módulo novo
- Criar triggers
- Criar RPCs
- Alterar RLS
- Criar rota ou componente paralelo
- Duplicar arquivo ou serviço existente
- Subir código sem migration correspondente
- Deletar dados reais em produção
- Alterar edge functions críticas
- Começar qualquer coisa sem mapear e aguardar aprovação

---

## 14. EXEMPLO COMPLETO — MÓDULO FINANCEIRO

Este é o modelo de como todo módulo deve ser criado.
Siga exatamente esta estrutura para qualquer módulo novo.

---

### 14.1 MIGRATION

```sql
-- ============================================================
-- MÓDULO: financeiro
-- Responsabilidade: controle de lançamentos, contas e parcelas
-- ============================================================

-- Tabela de contas bancárias/caixa
CREATE TABLE public.financeiro_contas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.clientes(id),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('caixa', 'banco', 'cartao')),
  saldo       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ DEFAULT NULL
);

-- Tabela de categorias
CREATE TABLE public.financeiro_categorias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.clientes(id),
  nome        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ DEFAULT NULL
);

-- Tabela principal de lançamentos
CREATE TABLE public.financeiro_lancamentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.clientes(id),
  conta_id        UUID NOT NULL REFERENCES public.financeiro_contas(id) ON DELETE RESTRICT,
  categoria_id    UUID REFERENCES public.financeiro_categorias(id) ON DELETE SET NULL,
  descricao       TEXT NOT NULL,
  valor           NUMERIC(15,2) NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'transferencia')),
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'conciliado', 'cancelado')),
  data_lancamento DATE NOT NULL DEFAULT CURRENT_DATE,
  parcelado       BOOLEAN NOT NULL DEFAULT false,
  total_parcelas  INTEGER DEFAULT 1,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ DEFAULT NULL
);

-- Tabela de parcelas
CREATE TABLE public.financeiro_parcelas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.clientes(id),
  lancamento_id   UUID NOT NULL REFERENCES public.financeiro_lancamentos(id) ON DELETE CASCADE,
  numero          INTEGER NOT NULL,
  valor           NUMERIC(15,2) NOT NULL,
  data_vencimento DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'pago', 'cancelado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela de auditoria
CREATE TABLE public.financeiro_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.clientes(id),
  tabela          TEXT NOT NULL,
  registro_id     UUID NOT NULL,
  acao            TEXT NOT NULL CHECK (acao IN ('insert', 'update', 'delete')),
  dados_antes     JSONB,
  dados_depois    JSONB,
  executado_por   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  executado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Triggers de updated_at ──────────────────────────────────

CREATE TRIGGER financeiro_trigger_updated_at_contas
  BEFORE UPDATE ON public.financeiro_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER financeiro_trigger_updated_at_lancamentos
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER financeiro_trigger_updated_at_parcelas
  BEFORE UPDATE ON public.financeiro_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Trigger: atualizar saldo da conta após lançamento ───────
-- Responsabilidade única: recalcular saldo

CREATE OR REPLACE FUNCTION financeiro_fn_atualizar_saldo_conta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.financeiro_contas
  SET saldo = (
    SELECT COALESCE(SUM(
      CASE WHEN tipo = 'receita' THEN valor
           WHEN tipo = 'despesa' THEN -valor
           ELSE 0 END
    ), 0)
    FROM public.financeiro_lancamentos
    WHERE conta_id = COALESCE(NEW.conta_id, OLD.conta_id)
      AND deleted_at IS NULL
      AND status != 'cancelado'
  )
  WHERE id = COALESCE(NEW.conta_id, OLD.conta_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER financeiro_trigger_atualizar_saldo_conta
  AFTER INSERT OR UPDATE OR DELETE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION financeiro_fn_atualizar_saldo_conta();

-- ── Trigger: gerar parcelas automaticamente ─────────────────
-- Responsabilidade única: criar parcelas quando parcelado=true

CREATE OR REPLACE FUNCTION financeiro_fn_gerar_parcelas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  i INTEGER;
  valor_parcela NUMERIC(15,2);
BEGIN
  IF NEW.parcelado = true AND NEW.total_parcelas > 1 THEN
    DELETE FROM public.financeiro_parcelas WHERE lancamento_id = NEW.id;
    valor_parcela := ROUND(NEW.valor / NEW.total_parcelas, 2);
    FOR i IN 1..NEW.total_parcelas LOOP
      INSERT INTO public.financeiro_parcelas
        (tenant_id, lancamento_id, numero, valor, data_vencimento)
      VALUES
        (NEW.tenant_id, NEW.id, i, valor_parcela,
         NEW.data_lancamento + ((i - 1) * INTERVAL '1 month'));
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financeiro_trigger_gerar_parcelas
  AFTER INSERT OR UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION financeiro_fn_gerar_parcelas();

-- ── Trigger: bloquear alteração em lançamento cancelado ─────
-- Responsabilidade única: integridade de status

CREATE OR REPLACE FUNCTION financeiro_fn_bloquear_cancelado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION 'Lançamento cancelado não pode ser alterado.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financeiro_trigger_bloquear_cancelado
  BEFORE UPDATE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION financeiro_fn_bloquear_cancelado();

-- ── Trigger: auditoria de lançamentos ───────────────────────
-- Responsabilidade única: gravar log de alterações

CREATE OR REPLACE FUNCTION financeiro_fn_auditoria_lancamento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.financeiro_audit_log
    (tenant_id, tabela, registro_id, acao, dados_antes, dados_depois, executado_por)
  VALUES (
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    'financeiro_lancamentos',
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP != 'INSERT' THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN row_to_json(NEW) ELSE NULL END,
    auth.uid()
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER financeiro_trigger_auditoria_lancamento
  AFTER INSERT OR UPDATE OR DELETE ON public.financeiro_lancamentos
  FOR EACH ROW EXECUTE FUNCTION financeiro_fn_auditoria_lancamento();

-- ── RPCs — uma por ação ──────────────────────────────────────

-- RPC: estornar lançamento (ação única)
CREATE OR REPLACE FUNCTION public.financeiro_rpc_estornar_lancamento(
  p_lancamento_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.financeiro_lancamentos
  SET status = 'cancelado', updated_at = now()
  WHERE id = p_lancamento_id
    AND status != 'cancelado'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado ou já cancelado.';
  END IF;
END;
$$;

-- RPC: conciliar lançamento (ação única)
CREATE OR REPLACE FUNCTION public.financeiro_rpc_conciliar_lancamento(
  p_lancamento_id UUID
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.financeiro_lancamentos
  SET status = 'conciliado', updated_at = now()
  WHERE id = p_lancamento_id
    AND status = 'pendente'
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lançamento não encontrado ou não está pendente.';
  END IF;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.financeiro_contas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_parcelas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_audit_log  ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant (nenhum cliente vê dado de outro)
CREATE POLICY "financeiro_tenant_isolation_contas"
  ON public.financeiro_contas FOR ALL
  USING (tenant_id = get_tenant_id());

CREATE POLICY "financeiro_tenant_isolation_lancamentos"
  ON public.financeiro_lancamentos FOR ALL
  USING (tenant_id = get_tenant_id());

CREATE POLICY "financeiro_tenant_isolation_parcelas"
  ON public.financeiro_parcelas FOR ALL
  USING (tenant_id = get_tenant_id());

-- Admin vê e faz tudo no tenant
CREATE POLICY "financeiro_admin_contas"
  ON public.financeiro_contas FOR ALL
  USING (is_admin(auth.uid()) AND tenant_id = get_tenant_id());

CREATE POLICY "financeiro_admin_lancamentos"
  ON public.financeiro_lancamentos FOR ALL
  USING (is_admin(auth.uid()) AND tenant_id = get_tenant_id());

-- User vê apenas seus próprios lançamentos
CREATE POLICY "financeiro_user_lancamentos"
  ON public.financeiro_lancamentos FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND created_by = auth.uid()
  );
```

---

### 14.2 TYPES

```typescript
// financeiro_types.ts

export type FinanceiroContaTipo = 'caixa' | 'banco' | 'cartao';
export type FinanceiroLancamentoTipo = 'receita' | 'despesa' | 'transferencia';
export type FinanceiroStatus = 'pendente' | 'conciliado' | 'cancelado';

export interface FinanceiroConta {
  id: string;
  tenant_id: string;
  nome: string;
  tipo: FinanceiroContaTipo;
  saldo: number;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceiroLancamento {
  id: string;
  tenant_id: string;
  conta_id: string;
  categoria_id: string | null;
  descricao: string;
  valor: number;
  tipo: FinanceiroLancamentoTipo;
  status: FinanceiroStatus;
  data_lancamento: string;
  parcelado: boolean;
  total_parcelas: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceiroParcela {
  id: string;
  tenant_id: string;
  lancamento_id: string;
  numero: number;
  valor: number;
  data_vencimento: string;
  status: 'pendente' | 'pago' | 'cancelado';
  created_at: string;
  updated_at: string;
}

export interface FinanceiroLancamentoForm {
  conta_id: string;
  categoria_id: string;
  descricao: string;
  valor: number;
  tipo: FinanceiroLancamentoTipo;
  data_lancamento: string;
  parcelado: boolean;
  total_parcelas: number;
}
```

---

### 14.3 SERVICE

```typescript
// financeiro_service.ts
// Único ponto de acesso ao banco do módulo financeiro.
// Componentes e hooks NUNCA acessam supabase diretamente.

import { supabase } from '@/integrations/supabase/client';
import type {
  FinanceiroConta,
  FinanceiroLancamento,
  FinanceiroLancamentoForm,
} from './financeiro_types';

export const financeiro_service = {

  // ── Contas ──────────────────────────────────────────────────

  async listarContas(): Promise<FinanceiroConta[]> {
    const { data, error } = await supabase
      .from('financeiro_contas')
      .select('*')
      .is('deleted_at', null)
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data;
  },

  // ── Lançamentos ─────────────────────────────────────────────

  async listarLancamentos(filtros?: {
    conta_id?: string;
    tipo?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<FinanceiroLancamento[]> {
    let q = supabase
      .from('financeiro_lancamentos')
      .select('*, financeiro_contas(nome), financeiro_categorias(nome)')
      .is('deleted_at', null)
      .order('data_lancamento', { ascending: false });

    if (filtros?.conta_id) q = q.eq('conta_id', filtros.conta_id);
    if (filtros?.tipo)     q = q.eq('tipo', filtros.tipo);
    if (filtros?.status)   q = q.eq('status', filtros.status);
    if (filtros?.data_inicio) q = q.gte('data_lancamento', filtros.data_inicio);
    if (filtros?.data_fim)    q = q.lte('data_lancamento', filtros.data_fim);

    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async criar(form: FinanceiroLancamentoForm): Promise<FinanceiroLancamento> {
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .insert(form)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async atualizar(id: string, form: Partial<FinanceiroLancamentoForm>): Promise<void> {
    const { error } = await supabase
      .from('financeiro_lancamentos')
      .update(form)
      .eq('id', id);
    if (error) throw error;
  },

  async deletar(id: string): Promise<void> {
    // Soft delete — nunca hard delete
    const { error } = await supabase
      .from('financeiro_lancamentos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async estornar(id: string): Promise<void> {
    const { error } = await supabase.rpc('financeiro_rpc_estornar_lancamento', {
      p_lancamento_id: id,
    });
    if (error) throw error;
  },

  async conciliar(id: string): Promise<void> {
    const { error } = await supabase.rpc('financeiro_rpc_conciliar_lancamento', {
      p_lancamento_id: id,
    });
    if (error) throw error;
  },
};
```

---

### 14.4 HOOK

```typescript
// financeiro_useLancamentos.ts
// Gerencia estado, queries e mutations. Nunca acessa banco diretamente.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { financeiro_service } from '../services/financeiro_service';
import type { FinanceiroLancamentoForm } from '../types/financeiro_types';

export function useFinanceiroLancamentos(filtros?: {
  conta_id?: string;
  tipo?: string;
  status?: string;
}) {
  const qc = useQueryClient();
  const KEY = ['financeiro_lancamentos', filtros];

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => financeiro_service.listarLancamentos(filtros),
  });

  const criar = useMutation({
    mutationFn: (form: FinanceiroLancamentoForm) =>
      financeiro_service.criar(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeiro_lancamentos'] });
      qc.invalidateQueries({ queryKey: ['financeiro_contas'] });
      toast.success('Lançamento criado.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const estornar = useMutation({
    mutationFn: (id: string) => financeiro_service.estornar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeiro_lancamentos'] });
      qc.invalidateQueries({ queryKey: ['financeiro_contas'] });
      toast.success('Lançamento estornado.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deletar = useMutation({
    mutationFn: (id: string) => financeiro_service.deletar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['financeiro_lancamentos'] });
      toast.success('Lançamento removido.');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { lancamentos, isLoading, criar, estornar, deletar };
}
```

---

### 14.5 COMPONENT

```typescript
// financeiro_lancamentoCard.tsx
// Componente de exibição de um lançamento.
// Nunca acessa banco. Recebe dados via props.

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { financeiro_formatarMoeda } from '../utils/financeiro_formatarMoeda';
import type { FinanceiroLancamento } from '../types/financeiro_types';

interface Props {
  lancamento: FinanceiroLancamento;
  onEstornar: (id: string) => void;
  onDeletar: (id: string) => void;
}

export function FinanceiroLancamentoCard({ lancamento, onEstornar, onDeletar }: Props) {
  return (
    <div className="flex items-center justify-between p-3 rounded border bg-card">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{lancamento.descricao}</p>
        <p className="text-xs text-muted-foreground">{lancamento.data_lancamento}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={lancamento.tipo === 'receita' ? 'text-green-600' : 'text-destructive'}>
          {financeiro_formatarMoeda(lancamento.valor)}
        </span>
        <Badge variant="outline">{lancamento.status}</Badge>
        {lancamento.status === 'pendente' && (
          <Button size="sm" variant="ghost"
            onClick={() => onEstornar(lancamento.id)}>
            Estornar
          </Button>
        )}
        <Button size="sm" variant="ghost"
          onClick={() => onDeletar(lancamento.id)}>
          Remover
        </Button>
      </div>
    </div>
  );
}
```

---

### 14.6 PAGE

```typescript
// financeiro_lancamentosPage.tsx
// Tela principal do módulo financeiro.
// Monta a UI usando hooks e components do módulo.

import { useState } from 'react';
import { useFinanceiroLancamentos } from '../hooks/financeiro_useLancamentos';
import { FinanceiroLancamentoCard } from '../components/financeiro_lancamentoCard';

export default function FinanceiroLancamentosPage() {
  const [filtros, setFiltros] = useState({});
  const { lancamentos, isLoading, estornar, deletar } = useFinanceiroLancamentos(filtros);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lançamentos</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : lancamentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
      ) : (
        <div className="space-y-2">
          {lancamentos.map((l) => (
            <FinanceiroLancamentoCard
              key={l.id}
              lancamento={l}
              onEstornar={(id) => estornar.mutate(id)}
              onDeletar={(id) => deletar.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### 14.7 CHECKLIST PREENCHIDO — MÓDULO FINANCEIRO

- [x] Perguntas obrigatórias respondidas e aprovadas
- [x] Migration com todas as tabelas, triggers e RPCs
- [x] RLS com isolamento por tenant em todas as tabelas
- [x] Triggers com responsabilidade única e nome explícito
- [x] RPCs específicas por ação (estornar, conciliar)
- [x] Types com todas as interfaces
- [x] Service como único ponto de acesso ao banco
- [x] Hook com queries e mutations
- [x] Componente sem acesso direto ao banco
- [x] Page montada com hook e componentes do módulo
- [x] Soft delete implementado (nunca hard delete)
- [x] Auditoria em tabela separada com trigger dedicado
- [x] Prefixo `financeiro_` em todos os arquivos e tabelas
- [x] Nenhuma rota paralela
- [x] Nenhum componente duplicado
- [x] Offline: não definido (módulo não crítico offline)
- [x] Feature flag: não aplicável (módulo padrão)
- [x] Commit descritivo por etapa

Quando precisar reescrever um fluxo, NÃO crie novo arquivo paralelo.
Faça uma destas opções obrigatórias:

1. Se o arquivo atual ainda é o ponto renderizado:
   - sobrescreva o arquivo atual inteiro;
   - mantenha o mesmo caminho;
   - remova imports antigos sem uso.

2. Se o nome atual está errado/confuso:
   - crie o novo arquivo com nome correto;
   - migre todos os imports/rotas para o novo arquivo;
   - delete o arquivo antigo no mesmo diff;
   - prove no final que nenhum import antigo ficou.

Proibido criar:
- V2
- Novo
- Refatorado
- Corrigido
- Backup
- Temp
- Legacy
- Old
- Copy

No final, entregar:
- arquivos criados
- arquivos sobrescritos
- arquivos deletados
- imports atualizados
- grep provando que o arquivo antigo não é mais usado
- diff completo
