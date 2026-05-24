# Navegai - Diretriz do Sistema

## 1. Objetivo do sistema

Sistema operacional web para acompanhamento de metricas, OS/avaliacoes, leads, tarefas operacionais, propostas comerciais e configuracoes administrativas.

## 2. Stack oficial

| Camada | Tecnologia identificada | Observacao |
|---|---|---|
| Frontend | React 18, TypeScript, Vite | `src/App.tsx` centraliza rotas |
| UI | Tailwind, shadcn/ui, Radix, lucide-react | Componentes em `src/components/ui` |
| Estado/dados | TanStack Query, hooks locais, Supabase JS | Acesso direto ao banco em muitos pontos |
| Backend | Supabase Edge Functions | `supabase/functions/*` |
| Banco | PostgreSQL/Supabase migrations | `supabase/migrations/*` |
| Auth | Supabase Auth + `AuthContext` + roles | `src/contexts/AuthContext.tsx` |
| Storage | Supabase Storage e providers externos | Buckets de evidencias, propostas/templates, tarefas storage |
| Testes | Vitest, Playwright | Scripts em `package.json` |

## 3. Regras inegociaveis

- Nao criar V2.
- Nao criar tela paralela.
- Nao alterar stack sem autorizacao.
- Nao mexer em aprovador/auditor/dashboard/historico quando o pedido for executor.
- Nao mudar valores salvos de respostas existentes sem confirmacao.
- Nao criar tabela/RPC/trigger/policy sem autorizacao.
- Nao expor `.env`, service role, tokens, secrets ou URLs com credencial.
- Sempre atualizar mapa afetado e changelog apos mudanca.

## 4. Quando parar e perguntar

Parar se precisar abrir mais de 3 arquivos no modo rapido, criar arquivo novo de codigo, alterar banco, mudar permissao, mexer em fluxo validado, remover arquivo, alterar modulo nao solicitado, refatorar em massa ou instalar biblioteca.

## 5. Padrao antes de implementar

Usar:

```text
MODO RAPIDO INCREMENTAL
Pedido:
Mapa consultado:
Modulo dono:
Tela/rota:
Action_id:
Arquivos que vou abrir:
Banco/RPC/Trigger serao mexidos? nao
Permissao/RLS sera mexida? nao
Mapas que serao atualizados:
Risco:
```
