# Navegai - Fluxos Principais

## 1. Indice de fluxos

| Fluxo | Modulo dono | Tela inicial | Action principal | Tabelas | Status |
|---|---|---|---|---|---|
| Login e acesso protegido | auth | `/login` | login/logout | `profiles`, `user_roles`, sessoes | ativo |
| Criar OS e avaliacao | avaliacoes | `/avaliacoes/pesquisa` | criar OS/avaliacao | `ordens_servico`, `avaliacoes`, `respostas_avaliacao` | ativo/critico |
| Gerenciar leads | leads | `/leads`, `/leads/fila` | criar/editar/arquivar lead | `leads`, `lead_interacoes`, clientes/endereco | ativo/critico |
| Proposta por template/conversa | propostas | `/propostas/nova`, `/propostas/conversa` | gerar proposta | `propostas_*`, `clientes`, storage | ativo |
| Tarefa operacional executor/aprovador/auditor | tarefas | `/tarefas/execucao` | enviar/responder/aprovar/auditar | `operational_*`, `tarefas_planos_*` | critico |
| Anexos de tarefas | tarefas | painels de tarefa | upload/download/delete | `tarefas_anexos`, storage/provider | critico |
| Permissoes e grupos | configuracoes | `/configuracoes/permissoes` | alterar grupo/override | tabelas de permissao | critico |
| Relatorios/exportacao | relatorios | `/relatorios`, `/leads/relatorios`, `/tarefas/relatorios`, `/assistente` | exportar/consultar | varias | ativo/risco |

## 2. Contrato por fluxo: Tarefas executor/aprovador/auditor

- Objetivo: controlar execucao de rotina/tarefa, planos de acao, aprovacao e auditoria.
- Usuario/role: executor, aprovador, auditor, admin.
- Tela inicial: `/tarefas/execucao` ou `/tarefas/detalhes/:id`.
- Hooks: `tarefas_useFluxoTarefa`, `tarefas_useExecutorActions`, `tarefas_useAprovadorActions`, `tarefas_useAuditorActions`.
- Service: `tarefas_fluxoRpcService`.
- API/RPC: RPCs `tarefas_rpc_*`.
- Tabelas: `operational_assignments`, `operational_field_answers`, `tarefas_planos_acao_aprovador`, `tarefas_planos_acao_auditor`, logs.
- Triggers: `tarefas_trigger_status_*`.
- Fluxo direto: executor responde -> aprovador valida/cria plano/aprova -> auditor valida/cria plano/aprova.
- Etapas do executor: frontend agrupa perguntas por `section_id`/horario do snapshot, bloqueia resposta da proxima etapa ate completar obrigatorios/evidencias da anterior e libera o envio geral somente quando todas as etapas obrigatorias estiverem completas.
- Fluxo reverso: NAO ENCONTRADO NO CODIGO de forma completa; deve ser exigido antes de novas actions criticas.

## 3. Contrato por fluxo: Propostas

- Objetivo: montar proposta com IA/template/produtos e gerar preview/documento.
- Tela inicial: `/propostas/nova` ou `/propostas/conversa`.
- Services: `propostasService`, `propostasIAService`, `propostasContextoService`.
- API/Functions: `propostas-*`, `preview-proposta`, `propostas-render-docx`.
- Tabelas/storage: `propostas_*`, `propostas-templates`.
- Risco: secrets, IA externa, PDF/DOCX e arquivos de cliente.
