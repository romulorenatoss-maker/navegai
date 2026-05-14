# Correção do Fluxo Tarefas — Execução Faseada

Base: `diagnostico_fluxo_real_tarefas.zip`. Cada fase é entregue, testada e aprovada antes da próxima. Nada de banco/score é alterado sem você confirmar.

## Fase 1 — Abas e buckets (somente frontend, sem risco)
Arquivos: `tarefas_bucketize.ts`, `tarefas_minhasTarefasPage.tsx`, `tarefas_minhasTarefasTab.tsx`.

- Reorganizar em: **Hoje | Crítico | Aguardando Aprovação | Aguardando Auditoria | Concluídas | Todas**.
- `Hoje` = executáveis hoje + DEVOLVIDA + REABERTA + EM_PLANO_ACAO sem `inicio_em`.
- `Crítico` = atrasadas / SLA vencido (pode duplicar com Hoje).
- `Aguardando Aprovação` = visão do executor após concluir + visão do aprovador (pendentes dele).
- `Aguardando Auditoria` = idem para auditor.
- Sem mudar status, sem mudar banco.

## Fase 2 — Filtro por setor unificado (frontend + service)
Arquivos: `tarefas_service.ts`, hooks de listagem.

- Função única `tarefaVisivelParaUsuario(t, user, setoresAtivos)` aplicando regra OR dos 4 papéis (executor/avaliado/aprovador/auditor) com fallback `*_id NULL AND setor_*_id ∈ setores`.
- Aplicar em listagem, cards, contadores, realtime.

## Fase 3 — Botão Iniciar + travas de edição
Arquivos: `tarefas_tarefaCard.tsx`, `tarefas_useTransition.ts`, `tarefas_useAssignmentExecution.ts`.

- Botão **Iniciar** em ABERTA/PENDENTE/DEVOLVIDA/REABERTA/EM_PLANO_ACAO(pausado) → EM_EXECUCAO + `inicio_em`.
- Bloquear edição após `fim_em` exceto em DEVOLVIDA/REABERTA/EM_PLANO_ACAO.
- Autosave permanece como está (já funciona conforme diagnóstico).

## Fase 4 — Painel Aprovador completo
Arquivo: `tarefas_embeddedAprovacaoPanel.tsx`.

- Mostrar: respostas executor, evidências, histórico, SLA executor, SLA aprovador, perguntas aprovador com peso/nota, botões aprovar/reprovar/devolver/plano de ação/solicitar evidência/rascunho.

## Fase 5 — Painel Auditor completo
Novo: `tarefas_embeddedAuditoriaPanel.tsx`.

- Visão consolidada: execução + aprovação + plano de ação + devoluções + notas + SLAs + perguntas auditor + finalizar auditoria.

## Fase 6 — Timeline consolidada
Novo: `tarefas_timelineView.tsx` + RPC `tarefas_rpc_timeline_assignment`.

- Eventos: criação, início, autosaves marcantes, conclusão executor, evidências, devoluções, plano de ação, correções, aprovação, auditoria, notas, SLAs, atrasos.

## Fase 7 — Status canônicos (MIGRATION SENSÍVEL)
Migration + `tarefas_statusConstants.ts` + `tarefas_canTransition.ts`.

- Consolidar para o set oficial.
- Remapear legados (AGUARDANDO_AVALIACAO/EM_AVALIACAO/VALIDADOR/AdA) → equivalente correto.
- **Migration com backup + rollback.sql obrigatórios.** Vou pedir confirmação explícita antes de rodar.

## Fase 8 — Trigger de score (MIGRATION MUITO SENSÍVEL)
Recriar `calculate_operational_score_on_complete` para disparar apenas em:
- aprovação final sem auditoria, OU
- auditoria finalizada quando obrigatória, OU
- encerramento de plano de ação/correção.

Adicionar score do aprovador (SLA + decisão + plano de ação) e SLA do auditor. Fanout por setor já existe — só consolidar.

**Não toco nessa trigger sem você confirmar.** Score em produção.

## Fase 9 — RPCs novas
- `tarefas_rpc_listar_minhas_tarefas`
- `tarefas_rpc_salvar_rascunho_executor/aprovador/auditor`
- `tarefas_rpc_distribuir_score_por_setor`
- `tarefas_rpc_dashboard_metricas_operacionais`

## Fase 10 — Pacote de entrega
ZIP `patch_fluxo_tarefas_corrigido.zip` com diff, migrations, rollback, mapas e checklist.

---

## Por que faseado e não tudo de uma vez

1. **Score em produção**: mexer na trigger sem rollback testado pode zerar notas de tarefas concluídas.
2. **Remapeamento de status**: assignments ativos em AGUARDANDO_AVALIACAO/EM_AVALIACAO precisam de UPDATE em massa — risco de travar tarefas em execução.
3. **RLS**: filtro por setor unificado mexe em policies que hoje passam — preciso validar antes de generalizar.
4. **20+ arquivos**: PR único de 3000+ linhas é impossível de revisar e de reverter cirurgicamente se algo quebrar.

## Pergunta

Confirma começar pela **Fase 1** (só frontend, reversível em 1 commit)? Ou prefere outra ordem (ex: Fase 3 botão Iniciar primeiro, que é o que você pediu antes)?
