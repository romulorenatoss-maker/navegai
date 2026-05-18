# Template Oficial de Criação de Módulo
**Autor:** Romulo Renato  
**Versão:** 1.0 — 2026-05-17  
**Aplicável a:** Todos os projetos

---

## ANTES DE QUALQUER COISA

Claude e Lovable NUNCA começam sem responder:

1. Qual o nome do módulo?
2. Qual a responsabilidade única dele?
3. Faz parte de qual projeto/sistema?
4. Precisa funcionar offline?
5. É premium? (feature flag)
6. É SaaS? (tenant_id + RLS)
7. Quais perfis acessam e com quais permissões?

Se receber um pedido de página, componente ou qualquer
coisa sem saber de qual módulo faz parte → PERGUNTAR ANTES.

---

## ORDEM OBRIGATÓRIA DE ENTREGA

```
1. Mapeamento → aprovação
2. Migration (banco)
3. Types
4. Service
5. Hooks
6. Components
7. Page
8. Rota registrada
9. Checklist de teste
```

Nunca pular etapas. Nunca entregar tudo sem checkpoint.

---

## 1. MIGRATION

```sql
-- Nomenclatura
modulo_entidade                        -- tabela
modulo_rpc_acao                        -- RPC
modulo_trigger_descricao               -- trigger

-- Colunas obrigatórias em toda tabela
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at  TIMESTAMPTZ DEFAULT NULL  -- soft delete padrão

-- Se SaaS
tenant_id   UUID NOT NULL REFERENCES clientes(id)

-- Trigger de updated_at (sempre)
CREATE TRIGGER modulo_trigger_updated_at
  BEFORE UPDATE ON modulo_entidade
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS (sempre)
ALTER TABLE modulo_entidade ENABLE ROW LEVEL SECURITY;
```

### Regras de FK
- Filhas de registro principal → ON DELETE CASCADE
- Referências históricas → ON DELETE SET NULL

### Regras de RPC
- Uma RPC = uma ação
- Nunca RPC genérica fazendo várias coisas
- Sempre com SECURITY DEFINER quando precisar bypassar RLS
- Sempre com tratamento de erro e rollback

### Regras de Trigger
- Um trigger = uma responsabilidade
- Nome explícito dizendo o que faz
- Nunca trigger silencioso alterando dados sem log

---

## 2. RLS — POLÍTICAS POR PERFIL

```sql
-- Admin vê e faz tudo
CREATE POLICY "modulo_admin_all" ON modulo_entidade
  FOR ALL USING (is_admin(auth.uid()));

-- User vê o que é seu ou foi atribuído
CREATE POLICY "modulo_user_select" ON modulo_entidade
  FOR SELECT USING (created_by = auth.uid());

-- Se SaaS — isolamento por tenant SEMPRE
CREATE POLICY "modulo_tenant_isolation" ON modulo_entidade
  FOR ALL USING (tenant_id = get_tenant_id());
```

---

## 3. ESTRUTURA DE ARQUIVOS

```
src/modules/modulo/
  pages/
    modulo_entidadePage.tsx
  hooks/
    modulo_useEntidade.ts
  components/
    modulo_entidadeCard.tsx
    modulo_entidadeForm.tsx
  services/
    modulo_service.ts          ← único ponto de acesso ao banco
  utils/
    modulo_formatarDado.ts
    modulo_validarRegra.ts
  types/
    modulo_types.ts
```

### Regras de arquivos
- Prefixo do módulo em TODOS os arquivos
- Nenhum componente acessa supabase diretamente
- Todo acesso ao banco passa pelo service
- Uploads sempre pelo storage service centralizado

---

## 4. SERVICE PADRÃO

```typescript
// modulo_service.ts
// Único arquivo de acesso ao banco do módulo.
// Componentes e hooks NUNCA acessam supabase diretamente.

import { supabase } from '@/integrations/supabase/client';
import type { ModuloEntidade } from './modulo_types';

export const modulo_service = {
  async listar(filtros?: any): Promise<ModuloEntidade[]> { },
  async buscarPorId(id: string): Promise<ModuloEntidade> { },
  async criar(dados: Partial<ModuloEntidade>): Promise<ModuloEntidade> { },
  async atualizar(id: string, dados: Partial<ModuloEntidade>): Promise<void> { },
  async deletar(id: string): Promise<void> { }, // soft delete: updated deleted_at
};
```

---

## 5. HOOK PADRÃO

```typescript
// modulo_useEntidade.ts
// Gerencia estado, queries e mutations do módulo.

export function useModuloEntidade(filtros?: any) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['modulo_entidade', filtros],
    queryFn: () => modulo_service.listar(filtros),
  });

  const criar = useMutation({
    mutationFn: modulo_service.criar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modulo_entidade'] }),
    onError: (e: any) => toast.error(e.message),
  });

  return { data, isLoading, criar };
}
```

---

## 6. OFFLINE (se aplicável)

Definir antes de implementar:

| Item | Definição |
|---|---|
| Dados disponíveis offline | Ex: tarefas do dia, snapshot do template |
| Ações permitidas offline | Ex: responder campos, anexar foto |
| Fila de sync | IndexedDB estruturado com ordem de envio |
| Chave de idempotência | UUID v4 + timestamp gerado no cliente |
| Status local | `pendente` / `sincronizado` / `erro` / `conflito` |
| Regra de conflito | Servidor vence; cliente notificado |
| Auditoria de sync | Log: o que, quando, quem, conflito? |
| Bloqueios | O que é proibido sem internet |
| Nunca offline | Lista explícita |

---

## 7. FEATURE FLAG (se premium)

```typescript
// Código existe mas acesso bloqueado até liberação
if (!hasFeature('modulo_premium')) {
  return <FeatureBloqueada />;
}
```

---

## 8. CHECKLIST DE ENTREGA

- [ ] Migration aplicada e testada
- [ ] RLS validado por perfil (admin, user, tenant)
- [ ] Triggers testados isoladamente
- [ ] RPCs com rollback em caso de erro
- [ ] Service é único ponto de acesso ao banco
- [ ] Nenhum componente usa supabase diretamente
- [ ] Nenhuma rota paralela criada
- [ ] Nenhum arquivo/componente duplicado
- [ ] Offline definido (se aplicável)
- [ ] Feature flag aplicada (se premium)
- [ ] Commit descritivo por etapa
- [ ] Diff rastreável no repositório

---

## 9. SE O PROJETO JÁ EXISTE E NÃO SEGUE ESSE PADRÃO

Claude identifica e sugere antes de tocar em qualquer coisa:

```
⚠️ DIVERGÊNCIAS ENCONTRADAS

1. [arquivo] não segue prefixo do módulo
   → Impacto: dificulta manutenção e busca
   → Sugestão: renomear para modulo_arquivo.tsx

2. [componente] acessa supabase diretamente
   → Impacto: lógica de banco espalhada, difícil de testar
   → Sugestão: mover para modulo_service.ts

3. [tabela] sem RLS habilitado
   → Impacto: CRÍTICO — dados expostos entre usuários
   → Sugestão: migration urgente com RLS + políticas

4. [trigger] com múltiplas responsabilidades
   → Impacto: difícil debugar, efeitos colaterais ocultos
   → Sugestão: separar em triggers específicos

Deseja que eu corrija? Se sim, faço migration + código
juntos para não quebrar o que está funcionando.
```

---

## 10. REGRA FINAL

> Se Claude receber um pedido de página, componente,
> hook, tabela ou qualquer coisa e não souber de qual
> módulo faz parte — PARA e PERGUNTA.
> Nunca assume. Nunca inventa. Nunca duplica.
