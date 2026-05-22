# Mapa do calculo automatico reutilizado

Base encontrada:

- Commit `f8dc6e7d`: `calcRespostaExecutor` em `tarefas_embeddedActionPanels.tsx`.
- Commit `89ccae74`: `calcRespostaAuditor` em `tarefas_embeddedActionPanels.tsx`.
- Documento atual: `src/modules/tarefas/docs/FLUXO_PERMISSOES.md`.

## Helper atual

Arquivo:

- `src/modules/tarefas/fluxo/services/tarefas_resumoNotasCalculoService.ts`

Funcao:

- `calcularRespostaAutomatica(data, modo, metricaOriginal)`

## Metricas do aprovador sobre o executor

| Metrica | Fonte atual | Resultado |
|---|---|---|
| `executor_entregou_no_prazo` / `executor_atrasou` / `prazo_global` | `fim_em`, `concluida_em`, `prazo_execucao`, `flag_sla_estourado` | Sim/Nao + desconto |
| `executor_teve_atraso_etapa` / `atraso_etapa` | planos, contingencias, flags SLA | Sim/Nao + desconto |
| `executor_obrigatorias_respondidas` / `obrigatorias_respondidas` | fields obrigatorios + `operational_field_answers` | Sim/Nao + desconto |
| `executor_evidencias_anexadas` / `evidencias_anexadas` | fields com evidencia obrigatoria + respostas | Sim/Nao + desconto |
| `executor_teve_devolucao` / `devolucao` | `tarefas_planos_acao_aprovador` | Sim/Nao + desconto |
| `executor_teve_nao_conforme` / `respostas_nao_conformes` | `tarefas_planos_acao_aprovador` | Sim/Nao + desconto |
| `plano_acao_sla_estourado` / `plano_acao_sla` | planos, contingencias, `flag_atraso_plano_acao` | Sim/Nao + desconto |
| `executor_prazo_prorrogado` / `plano_acao_prazo_prorrogado` | flags `prazo_alterado`/`prazo_prorrogado` quando existirem | Sim/Nao + desconto |
| `plano_acao_prazo_prorrogado_2x` | contagem de prorrogacoes | Sim/Nao + desconto |
| `executor_reincidencia` | `flag_reincidencia_atraso` ou 2+ atrasos | Sim/Nao + desconto |

## Metricas do auditor sobre o aprovador

| Metrica | Fonte atual | Resultado |
|---|---|---|
| `aprovador_respondeu_no_sla` / `aprovador_fora_sla` | `flag_sla_etapa_estourado` | Sim/Nao + desconto |
| `aprovador_reabriu_tarefa` / `aprovador_reabriu_ou_devolveu` | `rodada_atual` + planos do aprovador | Sim/Nao + desconto |
| `aprovador_aprovou_com_pendencia` | resposta dos planos do aprovador | Sim/Nao + desconto |
| `plano_acao_sla_estourado` / `plano_acao_vencido` | planos, contingencias e flags de atraso | Sim/Nao + desconto |
| `plano_acao_prazo_prorrogado` | flags de prorrogacao quando existirem | Sim/Nao + desconto |
| `plano_acao_prazo_prorrogado_2x` | contagem de prorrogacoes | Sim/Nao + desconto |

## Colunas legacy evitadas

Nao foram usadas:

- `avaliador_inicio_em`
- `avaliador_fim_em`
- `finalizado_em`
- `aprovador_inicio_em`
- `aprovador_fim_em`

Para prazo de conclusao foi usada a coluna real `fim_em`.
