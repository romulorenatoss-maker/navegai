# Navegai - Matriz de Dados Sensiveis

| Dado | Onde aparece | Tabela/campo | Sensibilidade | Deve mascarar? | Pode exportar? | Quem pode ver | Retencao | Observacao |
|---|---|---|---|---|---|---|---|---|
| dados de usuario | login/perfis | `profiles`, auth | sensivel | sim quando publico | nao sem permissao | admin/proprio | NAO ENCONTRADO NO CODIGO | inclui email/cargo. |
| clientes e CPF | clientes/leads/OS/propostas | `clientes.cpf`, contatos | sensivel | sim | somente permissao | equipes autorizadas | NAO ENCONTRADO NO CODIGO | validar LGPD. |
| leads | leads dashboards/fila | `leads`, `lead_interacoes` | interno/sensivel | parcial | somente permissao | comercial/admin | NAO ENCONTRADO NO CODIGO | dados comerciais. |
| respostas de avaliacao | avaliacoes | `respostas_avaliacao` | interno | nao | relatorio controlado | avaliador/admin/avaliado conforme policy | NAO ENCONTRADO NO CODIGO | pode afetar desempenho. |
| notas/desempenho | dashboards/tarefas | `operational_score_logs`, avaliacoes | interno/sensivel | talvez | controlado | gestores/admin | NAO ENCONTRADO NO CODIGO | evitar exposicao ampla. |
| anexos/evidencias | tarefas/avaliacoes | storage, `tarefas_anexos` | sensivel | NAO APLICAVEL | download controlado | autorizados | NAO ENCONTRADO NO CODIGO | signed URL recomendado. |
| propostas/documentos | propostas | `propostas_*`, storage | sensivel | NAO APLICAVEL | controlado | comercial/admin | NAO ENCONTRADO NO CODIGO | PDF/DOCX pode ter dados cliente. |
| secrets | ambiente/functions | `.env`, env Supabase | altamente sensivel | nunca exibir | nunca | servidor | rotacao | nao commitar. |
