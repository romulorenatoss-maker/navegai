# Navegai - Diretriz do Sistema

## 1. Objetivo do sistema

Sistema operacional/comercial para gerenciar OS/avaliacoes, leads, propostas, tarefas operacionais, cadastros, dashboards, relatorios e configuracoes de acesso.

## 2. Stack oficial

| Camada | Tecnologia identificada | Observacao |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | `src/App.tsx` usa React Router. |
| UI | Tailwind CSS + shadcn-ui/Radix + lucide-react | Componentes em `src/components/ui`. |
| Estado/dados | TanStack Query + hooks locais | `QueryClientProvider` em `src/App.tsx`. |
| Backend | Supabase Edge Functions | Funcoes em `supabase/functions`. |
| Banco | Supabase/Postgres | 239 migrations SQL encontradas. |
| Auth | Supabase Auth | `AuthProvider`, `ProtectedRoute`, `profiles`, `user_roles`. |
| Storage | Supabase Storage e provedores externos | Buckets `evidencias`, `instrucoes-campos`, `contingency-attachments`, `propostas-templates`; provider Google Drive em `_shared`. |
| Deploy | Lovable/Supabase | README aponta Lovable; config Supabase existe. |
| Testes | Vitest + Playwright | Scripts em `package.json`. |

## 3. Regras inegociaveis

- Nao criar V2, tela paralela ou rota duplicada.
- Nao alterar stack sem aprovacao.
- Nao fazer regra critica somente no frontend.
- Em Tarefas, respeitar fluxo RPC oficial executor/aprovador/auditor.
- Em Propostas, manter modulo isolado em `src/modules/propostas`.
- Em permissoes, validar UI e backend/RLS, nao apenas esconder botao.
- Nunca expor `.env`, service role, token GitHub ou secrets no repositorio.

## 4. Quando parar e perguntar

Parar se precisar abrir mais de 3 arquivos no modo rapido, criar tabela/RPC/trigger/policy, alterar permissao global, mexer em fluxo de Tarefas, alterar Propostas render/DOCX/PDF, remover arquivo legado, ou tocar secrets/ambiente.

## 5. Padrao rapido antes de implementar

MODO DE TRABALHO: rapido / completo / seguranca / critico
Pedido entendido:
Mapa consultado:
Modulo dono:
Tela:
Rota:
Botao/action:
Hook:
Service:
API/RPC:
Tabela:
Permissao/RLS:
Arquivos que preciso abrir:
Limite de arquivos:
Preciso sair do escopo?
