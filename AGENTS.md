# Instrucoes para IA no projeto Navegai

Este repositorio usa uma memoria tecnica viva em:

`docs/contexto/navegai/`

Antes de qualquer alteracao, qualquer IA ou agente deve ler:

1. `docs/contexto/navegai/README_USO_RAPIDO_NAVEGAI.md`
2. `docs/contexto/navegai/00_NAVEGAI_SUMARIO_GERAL.md`
3. `docs/contexto/navegai/13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`
4. O mapa especifico do modulo/tela/fluxo que sera alterado.

## Regra padrao de trabalho

- Fazer diagnostico antes de alterar.
- Identificar modulo dono, rota/tela, action/botao, hook, service, RPC, tabela e permissao envolvidos.
- Alterar somente o ponto solicitado.
- Nao recriar tela, fluxo, rota, menu, banco, RPC, trigger ou policy sem pedido explicito.
- Preservar aprovador, auditor, permissoes e regras globais quando o pedido for localizado no executor.
- Atualizar os mapas afetados em `docs/contexto/navegai/`.
- Registrar toda alteracao tecnica em `docs/contexto/navegai/15_NAVEGAI_CHANGELOG_TECNICO.md`.

## Quando houver mudanca de codigo

Atualizar pelo menos:

- O mapa especifico do modulo/tela/fluxo.
- `15_NAVEGAI_CHANGELOG_TECNICO.md`.
- `13_NAVEGAI_INDICE_DE_BUSCA_RAPIDA.md`, se nascer novo ponto de busca.

## Quando houver proposta futura

Se uma ideia exigir banco, RPC, trigger, policy, storage ou edge function e o usuario nao autorizou implementar agora:

- Nao implementar.
- Criar proposta em `src/modules/<modulo>/docs/`.
- Apontar a proposta no mapa correspondente.

## Comando recomendado para o usuario

```text
Leia primeiro AGENTS.md e docs/contexto/navegai.
Use modo rapido incremental.
Faca somente alteracao minima e localizada.
Atualize os mapas e o changelog ao final.
```
