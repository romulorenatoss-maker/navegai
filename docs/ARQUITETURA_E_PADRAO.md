# Arquitetura e Padrão de Desenvolvimento de Software
**Autor:** Romulo Renato  
**Versão:** 1.0 — 2026-05-17  
**Aplicável a:** Todos os projetos (Navegaí, Mixupa, SaaS, etc.)

---

## 1. REGRAS GERAIS

- Nenhum módulo pode nascer genérico.
- Nenhuma arquitetura pode ser decidida por Claude ou Lovable sozinhos.
- Primeiro mapear, explicar e aguardar aprovação. Depois implementar.
- Código e banco andam sempre juntos. Migration antes do código.

---

## 2. ESTRUTURA OBRIGATÓRIA DE MÓDULO

Todo módulo deve ter domínio próprio, nome próprio e responsabilidade clara.

```
modulo/
  pages/        → telas e rotas
  hooks/        → lógica de estado, queries e mutations
  components/   → componentes visuais do módulo
  services/     → acesso ao banco (única fonte de verdade)
  utils/        → funções puras sem efeito colateral
  types/        → interfaces e tipos TypeScript
```

### Prefixo obrigatório em todos os arquivos

| Arquivo | Exemplo |
|---|---|
| Page | `estoque_produtosPage.tsx` |
| Hook | `estoque_useProdutos.ts` |
| Component | `estoque_produtoCard.tsx` |
| Service | `estoque_service.ts` |
| Util | `estoque_formatarMovimentacao.ts` |
| Types | `estoque_types.ts` |

---

## 3. PADRÃO DE BANCO DE DADOS

### Nomenclatura
- Tabelas: `modulo_entidade` → ex: `estoque_produtos`
- RPCs: `modulo_rpc_acao` → ex: `estoque_rpc_mover_produto`
- Triggers: `modulo_trigger_descricao` → ex: `estoque_trigger_registrar_movimentacao`

### Regras
- RPCs específicas por ação. Nunca uma RPC genérica fazendo várias coisas.
- Triggers com responsabilidade única e nome explícito.
- Nunca recriar tabelas existentes. Sempre ALTER TABLE ADD COLUMN IF NOT EXISTS.
- Nunca deletar dados em migration. Usar soft delete (deleted_at).
- Nunca manipular sequences manualmente fora de migrations.

### Foreign Keys padrão
- Tabelas filhas → ON DELETE CASCADE
- Referências históricas → ON DELETE SET NULL

---

## 4. SE FOR SaaS

Toda tabela do módulo deve nascer com:

- tenant_id ou cliente_id
- RLS habilitado
- Políticas de acesso por perfil
- Isolamento por cliente garantido desde a migration

---

## 5. PERMISSÕES E SEGURANÇA

- RLS definido antes do código, nunca depois.
- Quem vê, quem edita, quem deleta — definido por módulo.
- Admin vê tudo. User vê o que lhe pertence ou foi atribuído.
- Soft delete padrão. Hard delete apenas com instrução explícita.

---

## 6. OFFLINE — REGRA OBRIGATÓRIA

Antes de criar qualquer módulo, perguntar:
"Este módulo precisa funcionar offline?"

Se sim, definir ANTES de implementar:

| Item | O que definir |
|---|---|
| Dados offline | Quais tabelas/registros ficam disponíveis sem internet |
| Ações offline | O que o usuário pode fazer sem internet |
| Fila de sync | Formato da fila local e ordem de envio ao reconectar |
| Idempotência | ID único gerado no cliente para evitar duplicação |
| Status local | pendente / sincronizado / erro / conflito |
| Regra de conflito | Servidor vence por padrão; cliente recebe notificação |
| Auditoria de sync | Log do que foi sincronizado, quando e por quem |
| Bloqueios | O que é proibido fazer offline |
| Nunca offline | Lista explícita do que jamais pode ser feito offline |

Módulos críticos — offline-first desde a arquitetura inicial:
tarefas | OS | checklist | força de vendas | rota | estoque | campo/mobile

Nunca implementar offline de forma genérica. Offline é definido por módulo e por ação.

---

## 7. CADA MÓDULO DEVE TER

- Regras de negócio documentadas
- Permissões por perfil definidas
- Auditoria (created_by, updated_at, deleted_at)
- Rollback definido (o que acontece se falhar)
- Checklist de teste
- Diff rastreável (commit descritivo por alteração)

---

## 8. ROTAS E MENUS

- Menus e rotas apontam para o módulo oficial.
- Proibido criar rota paralela só para corrigir problema.
- Antes de criar tela nova, verificar se já existe equivalente.
- Se existir: alterar/refatorar o existente. Nunca criar duplicado.

---

## 9. MÓDULOS PREMIUM / OPCIONAIS

- Código pode existir no repositório.
- Acesso bloqueado por feature flag até liberação explícita.
- Feature flag definida antes da implementação.

---

## 10. UPLOADS E STORAGE

- Todo upload passa pelo service centralizado do módulo.
- Nunca acessar supabase.storage diretamente nos componentes.
- Padrão de path para tarefas:
  tarefas/{MM-YYYY}/{DD}/{rotina|ad_hoc}/#{XXXX}-{slug}.ext

---

## 11. ORDEM DE ENTREGA

1. Mapeamento e aprovação da arquitetura
2. Migration (banco)
3. Types (interfaces)
4. Service (acesso ao banco)
5. Hooks (lógica)
6. Components (visual)
7. Page (tela)
8. Testes e checklist

Nunca pular etapas. Nunca entregar tudo de uma vez sem checkpoint.

---

## 12. O QUE CLAUDE E LOVABLE NUNCA PODEM FAZER SOZINHOS

- Decidir arquitetura de módulo novo
- Criar triggers sem instrução explícita
- Criar RPCs genéricas
- Alterar RLS sem definição clara de permissões
- Criar rotas paralelas
- Duplicar componentes/serviços existentes
- Subir código sem migration correspondente
- Deletar dados em produção
- Alterar edge functions críticas sem instrução
