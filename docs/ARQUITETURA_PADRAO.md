# Arquitetura Padrão de Desenvolvimento de Software
**Autor:** Romulo Renato
**Versão:** 2.0 — 2026-05-17
**Aplicável a:** Todos os projetos (Navegaí, Mixupa, SaaS, etc.)

---

## PERGUNTAS OBRIGATÓRIAS ANTES DE QUALQUER IMPLEMENTAÇÃO

Claude e Lovable NUNCA começam sem responder:

1. Qual o nome do módulo e sua responsabilidade única?
2. Faz parte de qual projeto/sistema?
3. **O sistema é SaaS?** (se sim, toda tabela nasce com tenant_id + RLS + isolamento total)
4. Este módulo precisa funcionar offline?
5. É módulo premium? (feature flag)
6. Quais perfis acessam e com quais permissões?

Se receber pedido de página, componente, tabela ou qualquer coisa
sem saber de qual módulo faz parte → **PARA E PERGUNTA.**
Nunca assume. Nunca inventa. Nunca duplica.

---

## ORDEM OBRIGATÓRIA DE ENTREGA

```
1. Mapeamento → explicar → aguardar aprovação
2. Migration (banco)
3. Types (interfaces)
4. Service (acesso ao banco)
5. Hooks (lógica de estado)
6. Components (visual)
7. Page (tela)
8. Rota registrada no router oficial
9. Checklist de teste
```

Nunca pular etapas. Nunca entregar tudo de uma vez sem checkpoint.
Código e banco andam sempre juntos. Migration antes do código.

---

## 1. REGRAS GERAIS

- Nenhum módulo pode nascer genérico.
- Nenhuma arquitetura pode ser decidida por Claude ou Lovable sozinhos.
- Antes de criar qualquer tela nova, verificar se já existe equivalente.
- Se existir: alterar/refatorar. Nunca criar duplicado.
- Menus e rotas apontam para o módulo oficial. Proibido criar rota paralela.

---

## 2. ESTRUTURA OBRIGATÓRIA DE MÓDULO

```
src/modules/modulo/
  pages/          → telas e rotas
  hooks/          → lógica de estado, queries e mutations
  components/     → componentes visuais do módulo
  services/       → acesso ao banco (única fonte de verdade)
  utils/          → funções puras sem efeito colateral
  types/          → interfaces e tipos TypeScript
```

### Prefixo obrigatório em todos os arquivos

| Tipo | Exemplo |
|---|---|
| Page | `estoque_produtosPage.tsx` |
| Hook | `estoque_useProdutos.ts` |
| Component | `estoque_produtoCard.tsx` |
| Service | `estoque_service.ts` |
| Util | `estoque_formatarMovimentacao.ts` |
| Types | `estoque_types.ts` |

### Regras de arquivos
- Prefixo do módulo em **todos** os arquivos sem exceção
- Nenhum componente acessa supabase diretamente
- Todo acesso ao banco passa pelo `modulo_service.ts`
- Uploads sempre pelo storage service centralizado do módulo

---

## 3. MIGRATION — PADRÃO OBRIGATÓRIO

### Nomenclatura
```
modulo_entidade                    → tabela
modulo_rpc_acao                    → RPC
modulo_trigger_descricao           → trigger
```

### Colunas obrigatórias em toda tabela
```sql
id         UUID PRIMARY KEY DEFAULT gen_random_uuid()
created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ DEFAULT NULL  -- soft delete padrão

-- Se SaaS (obrigatório quando o sistema atende múltiplos clientes)
tenant_id  UUID NOT NULL REFERENCES clientes(id)
```

### Trigger de updated_at (toda tabela)
```sql
CREATE TRIGGER modulo_trigger_updated_at
  BEFORE UPDATE ON modulo_entidade
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### RLS (toda tabela)
```sql
ALTER TABLE modulo_entidade ENABLE ROW LEVEL SECURITY;
```

### Regras de FK
- Tabelas filhas de registro principal → `ON DELETE CASCADE`
- Referências históricas → `ON DELETE SET NULL`

### Regras de RPC
- Uma RPC = uma ação. Nunca RPC genérica fazendo várias coisas.
- Sempre com tratamento de erro e rollback.
- `SECURITY DEFINER` apenas quando precisar bypassar RLS com justificativa.

### Regras de Trigger
- Um trigger = uma responsabilidade única.
- Nome explícito dizendo exatamente o que faz.
- Nunca trigger silencioso alterando dados sem log de auditoria.

### Regras gerais de banco
- Nunca recriar tabelas. Sempre `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- Nunca deletar dados em migration. Usar soft delete (`deleted_at`).
- Nunca manipular sequences manualmente fora de migrations.

---

## 4. SaaS — ISOLAMENTO TOTAL ENTRE CLIENTES

**Pergunta obrigatória:** "O sistema é SaaS?"

Se sim, toda tabela do módulo nasce com:

```sql
-- Coluna de isolamento
tenant_id UUID NOT NULL REFERENCES clientes(id)

-- RLS de isolamento por tenant (nenhum cliente vê dado de outro)
CREATE POLICY "modulo_tenant_isolation" ON modulo_entidade
  FOR ALL USING (tenant_id = get_tenant_id());

-- Admin do tenant vê tudo do seu tenant
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

**Impacto de não fazer isso desde o início:**
- CRÍTICO: dados de um cliente vazam para outro
- Reescrever RLS depois é arriscado e trabalhoso
- Migrations corretivas em produção com dados reais são perigosas

---

## 5. PERMISSÕES E SEGURANÇA

- RLS definido antes do código, nunca depois.
- Quem vê, quem edita, quem deleta — definido por módulo antes de implementar.
- Admin vê tudo (do seu tenant se SaaS).
- User vê o que lhe pertence ou foi atribuído.
- Soft delete padrão. Hard delete apenas com instrução explícita.

---

## 6. SERVICE PADRÃO

```typescript
// modulo_service.ts
// Único ponto de acesso ao banco do módulo.
// Componentes e hooks NUNCA acessam supabase diretamente.

import { supabase } from '@/integrations/supabase/client';
import type { ModuloEntidade } from './modulo_types';

export const modulo_service = {
  async listar(filtros?: any): Promise<ModuloEntidade[]> { },
  async buscarPorId(id: string): Promise<ModuloEntidade> { },
  async criar(dados: Partial<ModuloEntidade>): Promise<ModuloEntidade> { },
  async atualizar(id: string, dados: Partial<ModuloEntidade>): Promise<void> { },
  async deletar(id: string): Promise<void> { }, // soft delete: atualiza deleted_at
};
```

---

## 7. HOOK PADRÃO

```typescript
// modulo_useEntidade.ts
// Gerencia estado, queries e mutations. Nunca acessa banco diretamente.

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

## 8. OFFLINE — REGRA OBRIGATÓRIA

**Pergunta obrigatória:** "Este módulo precisa funcionar offline?"

Se sim, definir **antes** de implementar:

| Item | O que definir |
|---|---|
| Dados offline | Quais tabelas/registros ficam disponíveis sem internet |
| Ações offline | O que o usuário pode fazer sem internet |
| Fila de sync | Formato da fila local e ordem de envio ao reconectar |
| Idempotência | UUID v4 + timestamp gerado no cliente para evitar duplicação |
| Status local | `pendente` / `sincronizado` / `erro` / `conflito` |
| Regra de conflito | Servidor vence por padrão; cliente recebe notificação |
| Auditoria de sync | Log: o que, quando, quem, conflito e regra aplicada |
| Bloqueios | O que é proibido fazer offline |
| Nunca offline | Lista explícita do que jamais pode ser feito offline |

**Módulos críticos — offline-first desde a arquitetura inicial:**
`tarefas` | `OS` | `checklist` | `força de vendas` | `rota` | `estoque` | `campo/mobile`

Nunca implementar offline de forma genérica. Offline é definido por módulo e por ação.

---

## 9. MÓDULOS PREMIUM / OPCIONAIS

- Feature flag definida antes da implementação.
- Código pode existir no repositório.
- Acesso bloqueado até liberação explícita.

```typescript
if (!hasFeature('modulo_premium')) {
  return <FeatureBloqueada />;
}
```

---

## 10. CADA MÓDULO DEVE TER

- [ ] Regras de negócio documentadas antes do código
- [ ] Permissões por perfil definidas (quem vê, edita, deleta)
- [ ] Auditoria: `created_by`, `updated_at`, `deleted_at`
- [ ] Rollback definido (o que acontece se falhar)
- [ ] Checklist de teste
- [ ] Diff rastreável (commit descritivo por alteração)

---

## 11. UPLOADS E STORAGE

- Todo upload passa pelo service centralizado do módulo.
- Nunca usar `supabase.storage` diretamente nos componentes.
- Path lógico definido por módulo antes de implementar.
- Exemplo padrão (tarefas):
  ```
  tarefas/{MM-YYYY}/{DD}/{rotina|ad_hoc}/#{XXXX}-{slug}.ext
  ```

---

## 12. CHECKLIST DE ENTREGA

- [ ] Perguntas obrigatórias respondidas e aprovadas
- [ ] Migration aplicada e testada
- [ ] RLS validado por perfil (admin, user, tenant se SaaS)
- [ ] Triggers testados isoladamente
- [ ] RPCs com rollback em caso de erro
- [ ] Service é único ponto de acesso ao banco
- [ ] Nenhum componente usa supabase diretamente
- [ ] Nenhuma rota paralela criada
- [ ] Nenhum arquivo/componente duplicado
- [ ] Offline definido e implementado (se aplicável)
- [ ] Feature flag aplicada (se premium)
- [ ] Commit descritivo por etapa
- [ ] Diff rastreável no repositório

---

## 13. SE O PROJETO JÁ EXISTE E NÃO SEGUE ESSE PADRÃO

Claude mapeia e reporta antes de tocar em qualquer coisa:

```
⚠️ DIVERGÊNCIAS ENCONTRADAS

1. [arquivo] não tem prefixo do módulo
   → Impacto: dificulta manutenção e localização
   → Sugestão: renomear para modulo_arquivo.tsx

2. [componente] acessa supabase diretamente
   → Impacto: lógica espalhada, impossível de testar isolado
   → Sugestão: mover para modulo_service.ts

3. [tabela] sem RLS
   → Impacto: CRÍTICO — dados expostos entre usuários/tenants
   → Sugestão: migration urgente com RLS + políticas

4. [tabela SaaS] sem tenant_id
   → Impacto: CRÍTICO — dados de clientes misturados
   → Sugestão: migration com tenant_id + RLS de isolamento

5. [trigger] com múltiplas responsabilidades
   → Impacto: difícil debugar, efeitos colaterais ocultos
   → Sugestão: separar em triggers específicos

Deseja corrigir? Faço migration + código juntos
para não quebrar o que está funcionando.
```

---

## 14. O QUE CLAUDE E LOVABLE NUNCA FAZEM SOZINHOS

- Decidir arquitetura de módulo novo
- Criar triggers sem instrução explícita
- Criar RPCs genéricas
- Alterar RLS sem definição clara de permissões
- Criar rotas ou componentes paralelos
- Duplicar arquivos/serviços existentes
- Subir código sem migration correspondente
- Deletar dados reais em produção
- Alterar edge functions críticas sem instrução
- Começar qualquer coisa sem mapear e aguardar aprovação
