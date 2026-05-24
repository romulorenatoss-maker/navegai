# Navegai - Regras de Negocio

## 1. Tarefas

- Executor responde tarefas em `/tarefas/execucao`.
- Evidencia obrigatoria deve ter anexo/URL salvo para concluir pergunta.
- Valor de resposta nao deve ser inferido apenas por evidencia.
- Aprovador e auditor possuem fluxos proprios; nao alterar junto com executor sem pedido.
- Envio ao aprovador deve depender de completude das perguntas/etapas obrigatorias.
- Cronometro por etapa atualmente e local/visual; persistencia exige banco/RPC aprovados.

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
