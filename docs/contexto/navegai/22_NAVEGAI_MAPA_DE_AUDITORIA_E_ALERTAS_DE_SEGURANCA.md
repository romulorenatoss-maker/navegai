# Navegai - Auditoria e Alertas de Seguranca

## 1. Eventos auditados encontrados

| Evento | Action_id | Modulo | Quando grava | Campos minimos | Retencao | Alerta? |
|---|---|---|---|---|---|---|
| audit_logs insert manual | NAO ENCONTRADO NO CODIGO | geral | algumas operacoes | user/action/details | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO |
| tarefas audit/system logs | `tarefas.*` | tarefas | fluxo operacional | assignment/status/user | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO |
| respostas_eventos | avaliacoes | avaliacoes | eventos de respostas | OS/pergunta/usuario | NAO ENCONTRADO NO CODIGO | NAO ENCONTRADO NO CODIGO |

## 2. Eventos obrigatorios ainda a validar

- login_sucesso: NAO ENCONTRADO NO CODIGO
- login_falha: NAO ENCONTRADO NO CODIGO
- logout: NAO ENCONTRADO NO CODIGO
- acesso_negado: NAO ENCONTRADO NO CODIGO
- tentativa_acesso_outro_tenant: NAO ENCONTRADO NO CODIGO
- exportou_csv/pdf/xlsx: NAO ENCONTRADO NO CODIGO
- imprimiu_relatorio: NAO ENCONTRADO NO CODIGO
- baixou_arquivo: NAO ENCONTRADO NO CODIGO
- alterou_permissao: NAO ENCONTRADO NO CODIGO
- criou_usuario_admin: NAO ENCONTRADO NO CODIGO
- alterou_policy: NAO APLICAVEL via app
- executou_estorno: NAO ENCONTRADO NO CODIGO
- excluiu_registro: parcial, mas auditoria nao consolidada.

## 3. Alertas

| Alerta | Condicao | Severidade | Destinatario | Acao |
|---|---|---|---|---|
| download em massa | muitos downloads/anexos | alta | admin | NAO ENCONTRADO NO CODIGO |
| exportacao em massa | relatorio grande | alta | admin | NAO ENCONTRADO NO CODIGO |
| alteracao permissao | mudanca de grupo/override | alta | admin | NAO ENCONTRADO NO CODIGO |
