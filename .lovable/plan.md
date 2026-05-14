
# Pacote padrão do Validador/Auditor — análise + plano

## 1. Estrutura atual mapeada

### Camada de configuração (já existente — reaproveitar 100%)
- `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts`
  - `AprovadorPerguntaPadrao` (shape único compartilhado Aprovador/Validador)
  - `AprovadorMetricaCalculo` (union de metric_keys)
  - `APROVADOR_PACOTE_PADRAO_DEFAULT` (5 perguntas)
  - `VALIDADOR_PACOTE_PADRAO_DEFAULT` (7 perguntas atuais — todas `metrica_calculo: "manual"`)
- `src/modules/tarefas/components/configuracoes/TarefasConfigPontuacao.tsx`
  - Componente reutilizável `PacotePadraoCard` (mesmo modal + lista p/ Aprovador e Validador)
  - Modal `FieldConfigSheet` para configurar cada pergunta
- Tabela `public.tarefas_pontuacao_config` — coluna `validador_pacote_padrao jsonb` já criada

### Camada da rotina (snapshot)
- `src/modules/tarefas/components/builder/types.ts` — `AprovadorCheckItemForm` (shape único)
- `src/modules/tarefas/components/builder/StepChecklistValidador.tsx` — hidrata pacote do config global
- `src/modules/tarefas/pages/tarefas_rotinasPage.tsx:411` — carrega `validador_pacote_padrao` em novas rotinas via `buildAprovadorAutomatico`
- Snapshot persistido em `operational_templates.ada_config_snapshot.checklists.validador`

### Fontes de dados disponíveis (verificadas no banco)
| metric_key proposto | Fonte real | Confiabilidade |
|---|---|---|
| `aprovador_fora_sla` | `operational_assignments.avaliador_fim_em` vs `prazo_sla_correcao_horas` (já calculado em `calculate_operational_score_on_complete`) | ALTA |
| `aprovou_com_alerta_pendente` | Cruzar `operational_field_reviews.conforme=true` com contingências abertas / evidência ausente / SLA vencido na mesma execução | MÉDIA — exige consulta cruzada |
| `nao_conformidade_sem_regra_obrigatoria` | `operational_field_reviews.conforme=false` + checagem de `exige_observacao/exige_evidencia/gera_plano_acao` no snapshot | MÉDIA |
| `ponderacao_manual_realizada` | Comparar `score_logs.detalhe_calculo->>nota_automatica` vs `score_final` (campo de ponderação ainda não persistido como log dedicado) | BAIXA — sinal pendente |
| `prorrogacao_plano_acao` | `operational_assignment_history.tipo_evento = 'contingencia_prazo_definido'` (constante já existe em `AUDIT_EVENT_LABELS`) | MÉDIA — requer registro consistente do evento |
| `prorrogacao_plano_acao_recorrente` | mesma fonte, `count > 1` | MÉDIA |
| `plano_acao_vencido` | `operational_contingencies.dentro_prazo = false` OU `prazo_sla < now() AND status NOT IN (validada, descartada)` | ALTA |
| `aprovador_reabriu_ou_devolveu` | `operational_assignment_history.tipo_evento IN ('reabertura','avaliacao_devolvida','aprovacao_devolucao')` | ALTA |

## 2. Mudanças propostas (mínimas e localizadas)

### A. `tarefas_pontuacao_config_service.ts` (única alteração de código de config)
1. Estender união `AprovadorMetricaCalculo` adicionando os 8 metric_keys novos:
   - `aprovador_fora_sla`, `aprovou_com_alerta_pendente`, `nao_conformidade_sem_regra_obrigatoria`, `ponderacao_manual_realizada`, `prorrogacao_plano_acao`, `prorrogacao_plano_acao_recorrente`, `plano_acao_vencido`, `aprovador_reabriu_ou_devolveu`
   - manter os antigos para compat
2. Adicionar 3 campos opcionais em `AprovadorPerguntaPadrao` (sem migration — vão direto no JSON):
   - `origem_pergunta?: "automatica_sistema" | "manual_padrao_configuracao"`
   - `camada_alvo?: "aprovador"` (literal por ora)
   - `fonte_dados?: string` (descrição curta da query/fonte)
   - `regra_calculo?: string` (descrição humana)
   - `metrica_pendente?: boolean` (true → renderiza chip "métrica pendente de implementação", default `ativo=false`)
3. Substituir `VALIDADOR_PACOTE_PADRAO_DEFAULT` pelos 12 itens novos:

**Bloco AUTO (8 itens — soma 100):**
| ord | metric_key | pergunta | tipo | peso | ativo padrão |
|---|---|---|---|---|---|
| 1 | aprovador_fora_sla | Aprovador avaliou fora do SLA? | sim_nao | 20 | true |
| 2 | aprovou_com_alerta_pendente | Aprovador aprovou item com alerta automático pendente? | sim_nao | 15 | true (pendente=true → marcar como pendente) |
| 3 | nao_conformidade_sem_regra_obrigatoria | Aprovador marcou NC sem cumprir regra exigida? | sim_nao | 15 | true |
| 4 | ponderacao_manual_realizada | Aprovador alterou/ponderou nota manualmente? | sim_nao | 10 | inativo + pendente=true |
| 5 | prorrogacao_plano_acao | Aprovador prorrogou prazo do plano de ação? | sim_nao | 10 | true |
| 6 | prorrogacao_plano_acao_recorrente | Aprovador prorrogou mais de uma vez? | sim_nao | 10 | true |
| 7 | plano_acao_vencido | Plano de ação aberto pelo aprovador venceu o SLA? | sim_nao | 10 | true |
| 8 | aprovador_reabriu_ou_devolveu | Aprovador reabriu/devolveu tarefa? | sim_nao | 10 | true |

**Bloco MANUAL (4 itens — soma 100):**
| ord | id | pergunta | tipo | peso |
|---|---|---|---|---|
| 9 | val-man-justificativa | Justificativa do aprovador é plausível? | conforme_nao_conforme | 25 |
| 10 | val-man-evidencia | Evidência comprova a decisão? | conforme_nao_conforme | 25 |
| 11 | val-man-ponderacao | Ponderação aplicada foi correta? | conforme_nao_conforme | 25 |
| 12 | val-man-nota-final | Nota final do aprovador deve ser mantida? | conforme_nao_conforme | 25 |

Todos com `permite_ponderacao_auditor: true`, `exige_justificativa_ponderacao: true`, `exige_observacao: true` para os manuais.

### B. UI mínima: chip "pendente"
- `TarefasConfigPontuacao.tsx` (`PacotePadraoCard`): se `item.metrica_pendente`, exibir badge cinza "métrica pendente" ao lado do badge AUTO.
- `StepChecklistValidador.tsx`: idem (reaproveita o card já existente do Aprovador via `AprovadorCheckItemForm`).

### C. Hidratação em rotinas novas
- `tarefas_rotinasPage.tsx` linha 411: já usa `pontuacaoConfig.validador_pacote_padrao` + `buildAprovadorAutomatico` → funciona automático. Apenas garantir que `buildAprovadorAutomatico` propague `origem_pergunta` quando vier explícito no item de config (default mantém `"automatica_configuracao"` para compat).

### D. Compat / legacy
- Não tocar em `ValidadorCheckItemForm`, `VALIDADOR_DEFAULT_ITEMS`, `buildDefaultValidadorItems` — permanecem para snapshots antigos via `normalizeValidadorLegacy` em `checklistNormalizers.ts`.
- Rotinas antigas com `ada_config_snapshot.checklists.validador` continuam abrindo (normalizer já trata).

## 3. O que NÃO muda nesta entrega
- Nenhuma migration estrutural
- Nenhuma alteração no trigger `calculate_operational_score_on_complete`
- Nenhum drop de tabela / coluna
- Nenhuma exclusão de histórico
- Cálculo automático efetivo das metric_keys → fica para entrega seguinte (perguntas aparecem com `metrica_pendente=true` quando ainda não há fonte real cabeada)

## 4. Arquivos a alterar
1. `src/modules/tarefas/services/tarefas_pontuacao_config_service.ts` — union, interface, default
2. `src/modules/tarefas/components/configuracoes/TarefasConfigPontuacao.tsx` — badge "pendente"
3. `src/modules/tarefas/components/builder/types.ts` — propagar `origem_pergunta`/`metric_key`/`metrica_pendente` em `buildAprovadorAutomatico`
4. `src/modules/tarefas/components/builder/StepChecklistValidador.tsx` — badge "pendente" no card

Total: 4 arquivos. Zero migration. Zero edge function. Zero alteração em RPC/trigger.

## 5. Dado existente no banco
Há registros antigos em `tarefas_pontuacao_config.validador_pacote_padrao` (7 perguntas atuais). Pergunta de decisão abaixo.

## 6. Confirmações pedidas antes de executar
1. **Sobrescrever** o `validador_pacote_padrao` atual no banco (singleton row) com o novo pacote padrão de 12 perguntas? Se sim, faço via `supabase--insert` UPDATE. Se não, mantenho o antigo no banco e novas instalações pegam o default.
2. As 4 perguntas com confiabilidade ALTA/MÉDIA podem entrar **ativas** mesmo sem o cálculo automático cabeado (auditor responde manualmente até o engine subir)? Ou todas as AUTO entram **inativas + pendente=true** até implementarmos o cálculo?
3. Confirma `id`s estáveis sugeridos (`val-aprovador-fora-sla`, `val-aprovou-alerta-pendente`, …, `val-man-justificativa`, …) — usados como `config_global_origem_id` nos snapshots?
