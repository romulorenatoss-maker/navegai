# Navegai - Matriz de Dados Sensiveis

| Dado | Onde aparece | Sensibilidade | Controle esperado |
|---|---|---|---|
| Nome, CPF/CNPJ, cidade, endereco | `clientes`, `ordens_servico`, propostas | Alta | RLS e permissao por funcao |
| Contatos telefone/email | `cliente_contatos`, `lead_contatos` | Alta | RLS e historico de acesso quando aplicavel |
| Leads e funil comercial | `leads`, `lead_interacoes` | Media/alta | Restricao por responsavel/permissao |
| Propostas e valores | `propostas_*` | Alta comercial | Permissao e historico |
| Evidencias/anexos de tarefas | `tarefas_anexos`, storage | Alta | Signed URL/policies |
| Usuarios, MFA, roles | `profiles`, `user_roles`, auth | Critica | Admin/service role somente backend |
| Secrets de IA/storage | `.env`, Supabase secrets | Critica | Nunca versionar |

## Observacao

`.env` deve permanecer ignorado pelo Git. Tokens exibidos em tela devem ser regenerados.
