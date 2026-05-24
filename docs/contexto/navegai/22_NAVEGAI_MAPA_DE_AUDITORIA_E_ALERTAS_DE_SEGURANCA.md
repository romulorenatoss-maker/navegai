# Navegai - Mapa de Auditoria e Alertas de Seguranca

## 1. Fontes de auditoria

| Fonte | Modulo | Uso |
|---|---|---|
| `audit_logs` | Global | Logs administrativos |
| `operational_assignment_history` | Tarefas | Historico de assignment/status |
| `lead_historico` | Leads | Historico de funil/interacoes |
| `propostas_historico` | Propostas | Eventos de proposta |
| `logRespostaEvento.ts` / `insert_resposta_evento` | Avaliacoes | Eventos de resposta |

## 2. Acoes que exigem auditoria

- Alterar status de tarefa.
- Enviar respostas ao aprovador.
- Aprovar/reprovar/auditar tarefa.
- Criar/excluir proposta/template/produto.
- Alterar cliente/contato/responsavel.
- Exportar dados sensiveis.
- Alterar roles/permissoes/MFA.

## 3. Alertas

- Se uma action critica nao grava historico, registrar risco antes de implementar.
- Se uma Edge Function usar service role, validar que nao recebe payload livre sem permissao.
