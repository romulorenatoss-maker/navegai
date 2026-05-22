# Diff real - resumo de notas com calculo existente

Data: 2026-05-21
Modulo: Tarefas
Escopo: frontend do fluxo oficial

## Objetivo

Conectar o modal `Resumo de Notas` ao calculo automatico que ja existia no fluxo legado, sem criar backend, sem criar migration e sem alterar RPC/trigger/RLS.

## Arquivos alterados

- `src/modules/tarefas/fluxo/hooks/tarefas_useFluxoTarefa.ts`
- `src/modules/tarefas/fluxo/hooks/tarefas_useResumoNotas.ts`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasModal.tsx`
- `src/modules/tarefas/fluxo/components/tarefas_resumoNotasPerguntaCard.tsx`
- `src/modules/tarefas/fluxo/services/tarefas_fluxoHistoricoMapper.ts`
- `src/modules/tarefas/fluxo/types/tarefas_fluxoTypes.ts`
- `src/modules/tarefas/fluxo/services/tarefas_resumoNotasCalculoService.ts`
- `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`

## O que mudou

- Extraido o calculo antigo de `calcRespostaExecutor` e `calcRespostaAuditor` para `tarefas_resumoNotasCalculoService.ts`.
- `useResumoNotas` passou a consumir checklists do snapshot da rotina antes do pacote global.
- Perguntas automaticas agora recebem resposta calculada, desconto e fonte real do calculo.
- O modal passou a somar automaticas calculadas + manuais respondidas.
- O texto legacy `operational_assignments.avaliador_fim_em` foi removido da configuracao ativa.
- O hook oficial do fluxo passou a carregar contingencias existentes da tarefa para reutilizar a regra antiga.

## O que nao mudou

- Nenhum SQL.
- Nenhuma migration.
- Nenhuma RPC.
- Nenhum trigger.
- Nenhuma RLS.
- Nenhuma rota.
- Nenhum menu.
- Nenhuma regra critica nova.
