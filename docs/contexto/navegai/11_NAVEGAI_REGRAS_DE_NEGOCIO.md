# Navegai - Regras de Negocio

## 1. Tarefas

- Executor responde tarefas em `/tarefas/execucao`.
- Evidencia obrigatoria deve ter anexo/URL salvo para concluir pergunta.
- Valor de resposta nao deve ser inferido apenas por evidencia.
- Aprovador e auditor possuem fluxos proprios; nao alterar junto com executor sem pedido.
- Envio ao aprovador deve depender de completude das perguntas/etapas obrigatorias.
- Cronometro por etapa deve persistir em `operational_assignment_stage_runs`.
- Clique em Iniciar etapa grava imediatamente `started_at`; fechar/reabrir deve manter etapa em andamento e tempo decorrido.
- Finalizar etapa grava `finished_at`, `duration_seconds`, atraso de fim e libera a proxima etapa.
- Autosave de resposta/anexo nao envia ao aprovador; o envio final continua exclusivo do botao `Enviar respostas ao aprovador`.

## 2. Propostas

- Produtos devem vir do catalogo quando possivel.
- Render DOCX deve usar dados persistidos e validar permissao.
- Historico de proposta deve registrar eventos relevantes.
- Templates e produtos sao area sensivel; evitar deletar sem confirmar uso.

## 3. Avaliacoes/OS

- OS e avaliacoes dependem de perguntas e respostas.
- Inconsistencias podem ser detectadas por hooks.
- Perguntas/checklists/servicos afetam calculo e historico.

## 4. Leads

- Lead deve manter historico de interacoes.
- Fila e tarefas de contato atualizam status.
- Importacao deve evitar duplicidade por telefone/contato.

## 5. Permissoes

- Sidebar filtra por `isAdmin`, `canViewPath` ou `allowedScreens`.
- Backend/RPC/policy deve validar operacoes sensiveis; nao confiar apenas no menu escondido.
