# Validacao - modal de notas visual

## Validacoes executadas

### Busca de termos proibidos/legados

Comando:

`rg -n "Pendente backend|pendente backend|previa manual|incompleta|avaliador_fim_em|finalizado_em|aprovador_inicio_em|aprovador_fim_em|avaliador_inicio_em" src/modules/tarefas/fluxo/components src/modules/tarefas/fluxo/hooks src/modules/tarefas/fluxo/services src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`

Resultado:

- zero ocorrencias funcionais nos componentes/hook/service do resumo.

### Whitespace

Comando:

`git diff --check`

Resultado:

- sem erro.

### Sintaxe TSX

Validacao via TypeScript API no Node REPL interno:

- `tarefas_resumoNotasModal.tsx`: sem diagnostics;
- `tarefas_resumoNotasPerguntaCard.tsx`: sem diagnostics.

## Build local

`npm run build` nao roda nesta maquina porque `npm` nao esta disponivel no PATH.

Tentativa de chamar `node` diretamente tambem falha com `Acesso negado` no executavel do WindowsApps.

## Validacao visual esperada no Lovable

### Aprovador

- abrir `Aprovar e ver resumo`;
- perguntas aparecem em blocos coloridos;
- N/A aparece no canto direito quando permitido;
- nota da pergunta aparece dentro de cada bloco;
- card `Nota final da Aprovacao` aparece no fim;
- botao final `Enviar para auditoria` fica abaixo do conteudo.

### Auditor

- abrir `Concluir e ver resumo`;
- perguntas aparecem no mesmo layout do aprovador;
- card `Nota final da Auditoria` aparece no fim;
- botao final `Confirmar Auditoria` fica abaixo do conteudo.

## Restricoes confirmadas

- Sem SQL.
- Sem migration.
- Sem RPC.
- Sem trigger.
- Sem RLS.
- Sem mudanca fora do modulo Tarefas.

