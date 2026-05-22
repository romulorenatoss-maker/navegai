# Diff real - modal de notas visual

## Escopo

Correcao cirurgica apenas na apresentacao frontend do Resumo de Notas do modulo Tarefas.

## Arquivos alterados

- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasPerguntaCard.tsx`

## Resultado visual

O mesmo componente atende os modos:

- aprovador;
- auditor.

Cada pergunta agora segue o padrao visual solicitado:

- pergunta em bloco unico;
- fundo verde quando ganhou ponto;
- fundo vermelho quando perdeu ponto;
- fundo amarelo quando N/A devolve ponto;
- fundo cinza quando nao existe dado suficiente;
- N/A no canto direito quando a pergunta permite;
- nota da pergunta no proprio bloco;
- resultado em pontos dentro da pergunta.

## Rodape/nota final

A nota final saiu do resumo em grade e passou para um card azul no fim do scroll do modal:

- titulo `Nota final da Aprovacao` ou `Nota final da Auditoria`;
- valor grande em `pts`;
- total possivel;
- pontos ganhos;
- pontos perdidos;
- pontos devolvidos por N/A;
- destino da nota.

Os botoes ficam abaixo do conteudo:

- `Voltar`;
- `Enviar para auditoria` no aprovador;
- `Confirmar Auditoria` no auditor.

## Nao alterado

- SQL.
- RPC.
- Migration.
- Trigger.
- RLS.
- Banco de dados.
- Rotas.
- Permissoes.
- Fluxo R1/R2.

