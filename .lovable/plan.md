## Análise da estrutura atual

**Configurações > Pontuação/SLA** (`TarefasConfigPontuacao.tsx` + `tarefas_pontuacao_config_service.ts`):
- Singleton em `tarefas_pontuacao_config` com blocos por camada (`sla_executor`, `sla_aprovador`, `sla_plano_acao`, `sla_validador`).
- Hoje só guarda penalidades/SLA da camada (atraso, não-resposta, não-conformidade) e flags globais.
- **Não existe** pacote padrão de perguntas do Aprovador.

**Modal de criar/editar rotina** (`TarefasBuilderWizard.tsx`, `tarefas_rotinasPage.tsx`):
- Wizard com steps: tipo → geral → campos (Avaliado) → checklist_aprovador → checklist_validador → fluxo → resumo.
- Estado `aprovadorChecks: AprovadorCheckItemForm[]` salvo em `ada_config_snapshot.checklists.aprovador` (sem migration — JSONB existente).
- `checklist_validador` análogo em `.checklists.validador`.

**Aba Aprovador atual** (`StepChecklistAprovador.tsx`):
- `useEffect` sincroniza 1:1 itens com `fields` da aba Avaliado (replicação automática), órfãos removidos, label cacheado.
- Render mostra apenas perguntas replicadas. Acima existe `PenalidadesAutomaticasBlock` (bloco separado de penalidades automáticas).
- Edição inline simples: `Input` para pergunta, Select tipo, peso, e 6 toggles (`exige_observacao`, `exige_evidencia`, `permite_devolucao`, `gera_plano_acao`, `permite_conclusao`, `permite_aumento_prazo`). **Não usa o mesmo modal das perguntas do Avaliado** (`tarefas_tabFormBuilder.tsx`).

**Componente de pergunta do Avaliado** (`tarefas_tabFormBuilder.tsx`, 1083 linhas):
- Engine completa: tipo, opções, `opcoes_regras` (`OpcaoRegra` por opção), peso, evidência, instrução (anexo), criticidade, condição visibilidade, fórmula, `aprovador_verificar/_pergunta/_tipo_resposta/_peso/...`. Hoje **a configuração da pergunta do aprovador já existe inline na pergunta do Avaliado** (`aprovador_verificar`, etc.).
- O modal/expand inline é grande e está acoplado a `SectionForm`/`FieldForm`.

**Snapshots**:
- `operational_assignments.template_snapshot` (jsonb) — usado no scoring.
- `ada_config_snapshot` no template — guarda checklists.

**Hooks/services**:
- `tarefas_service.ts` (CRUD rotinas, leitura snapshot), `tarefas_pontuacao_config_service.ts` (config global), `tarefas_useScoring.ts` (cálculo nota — tabela `operational_score_logs`).
- `calculate_operational_score_on_complete` (trigger) calcula score baseado em `operational_template_fields` + answers + reviews. **Não consome** o checklist do aprovador atual.

---

## Decisões de design (alteração mínima)

1. **Persistência sem migration**: pacote padrão do Aprovador vai em `tarefas_pontuacao_config.aprovador_pacote_padrao` (jsonb dentro do singleton). Snapshot por rotina continua em `ada_config_snapshot.checklists.aprovador`. Cada item ganha metadados `origem_pergunta`, `pergunta_origem_id`, `config_global_origem_id`, `editado_manual`, `editado_por`, `editado_em`, `config_original_snapshot`, `config_atual_snapshot` — **adicionados em `AprovadorCheckItemForm`**, normalizados como opcionais (legacy = `manual`).

2. **Lista única na aba Aprovador**: remover `PenalidadesAutomaticasBlock` da step do aprovador. Manter `StepChecklistAprovador` mas re-arquitetar para renderizar lista única ordenada: `replicada_avaliado` → `automatica_configuracao`. Cada card mostra badge discreto (REPLICADA/AUTO/MANUAL) e abre o **mesmo componente de configuração** das perguntas do Avaliado.

3. **Reutilizar componente de configuração**: extrair o bloco de configuração de pergunta do `tarefas_tabFormBuilder.tsx` para um `FieldConfigSheet` reutilizável (Sheet/Dialog) que recebe um shape comum (`pergunta`, `tipo`, `opcoes`, `opcoes_regras`, `peso`, `exige_evidencia`, `instrucao_url/_tipo`, `gera_plano_acao`, `permite_devolucao`, `permite_conclusao`, `permite_aumento_prazo`, `permite_ponderacao_auditor`, `exige_justificativa_ponderacao`, `penalidade_*`, `sla_horas`). Usado tanto no Avaliado quanto no Aprovador. Na pergunta do Avaliado, o componente continua inline (sem mudança visual). No Aprovador, abre via botão "Configurar".

4. **Hidratação ao criar rotina nova**: em `tarefas_rotinasPage.tsx` (load), quando `templateId` é novo (criar) e `aprovadorChecks` vier vazio, popular com `pacote_padrao_aprovador` da config global (já carregada). Cada item recebe `origem_pergunta: 'automatica_configuracao'`, `config_global_origem_id` e `config_original_snapshot`. Não roda em rotinas existentes.

5. **Soma total**: ajustar lógica de total da aba Aprovador para somar todos os pesos da lista única (replicadas + automáticas + manuais). Já existe `totalPeso` por reduce — fica.

6. **Cálculo automático na execução**: fora de escopo desta entrega visual. Item 9 do pedido envolve trigger novo + leitura de eventos (devoluções, planos de ação, prorrogações). **Proponho fazer em segunda etapa**, depois da aprovação do snapshot/UI. Por ora: marcar perguntas com `origem='automatica_configuracao'` e `metrica_calculo` (chave: `prazo_global`, `atraso_etapa`, `obrigatorias_respondidas`, `evidencias_anexadas`, `respostas_nao_conformes`, `devolucao`, `plano_acao_aberto`, `plano_acao_sla`, `plano_acao_prorrogacao`, `plano_acao_prorrogacao_multipla`) — guardado no snapshot. UI já mostra o valor sugerido + permitir override; engine de cálculo entra em segunda PR.

7. **Auditoria de edição manual**: registrar em `editado_manual=true`, `editado_por`, `editado_em`, `config_atual_snapshot` no próprio item. Sem nova tabela.

8. **Compatibilidade**: snapshots antigos continuam válidos via `normalizeAprovadorItem` (já existe). Adicionar defaults para os novos campos de metadados (origem padrão = `manual` se ausente, exceto se `field_id` preenchido → `replicada_avaliado`).

---

## Arquivos impactados

```text
ALTERADOS
  src/modules/tarefas/services/tarefas_pontuacao_config_service.ts
    + interface AprovadorPerguntaPadrao
    + campo aprovador_pacote_padrao: AprovadorPerguntaPadrao[] na config
    + DEFAULT com as 10 perguntas listadas (peso total = 100)
    + merge no getPontuacaoConfig

  src/modules/tarefas/components/configuracoes/TarefasConfigPontuacao.tsx
    + nova seção "Pacote padrão do Aprovador"
    + lista ordenada com ordem/pergunta/tipo/peso/ativo
    + botão "editar regra" abre FieldConfigSheet
    + botão "Restaurar padrões"

  src/modules/tarefas/components/builder/types.ts
    + metadados em AprovadorCheckItemForm: origem_pergunta, pergunta_origem_id,
      config_global_origem_id, editado_manual, editado_por, editado_em,
      config_original_snapshot, config_atual_snapshot, metrica_calculo,
      ativo, instrucao_url, instrucao_tipo, opcoes_regras, penalidade_reprovacao
    + helper buildAprovadorAutomatico(perguntaPadrao, configGlobalOrigemId)

  src/modules/tarefas/components/builder/checklistNormalizers.ts
    + preserva novos metadados; deduz origem_pergunta quando ausente

  src/modules/tarefas/components/builder/StepChecklistAprovador.tsx
    REESCRITO (menor):
    + lista única ordenada (replicadas → automáticas → manuais)
    + badge discreto AUTO / REPLICADA / MANUAL
    + card padrão usa FieldConfigSheet
    + botão "+ Pergunta manual"
    + total considera todos
    - remove inline edit antigo

  src/modules/tarefas/components/builder/TarefasBuilderWizard.tsx
    - remove PenalidadesAutomaticasBlock da step checklist_aprovador
      (penalidades agora vivem dentro de cada pergunta)
    - mantém na step checklist_validador (auditoria — sem mudança)

  src/modules/tarefas/pages/tarefas_rotinasPage.tsx
    + ao criar rotina nova: hidrata aprovadorChecks com pacote padrão
      da config global (uma vez, se vazio e !isEditing)
    + persiste novos metadados sem mudança de schema

NOVOS
  src/modules/tarefas/components/builder/FieldConfigSheet.tsx
    Sheet reutilizável de configuração de pergunta.
    Props: value (shape comum), onChange, contexto ('avaliado' | 'aprovador').
    Usa os mesmos controles do tarefas_tabFormBuilder (extraídos).

  src/modules/tarefas/components/builder/AprovadorPerguntaCard.tsx
    Card item da lista única (badge + título + tipo + peso + botão configurar).
```

**Sem mudanças em**: trigger `calculate_operational_score_on_complete`, tabelas, RPCs, RLS, hooks de execução, aba Avaliado (`tarefas_tabFormBuilder.tsx` só sofre extração interna do bloco de config — visualmente idêntico).

---

## Compatibilidade com rotinas antigas

- `ada_config_snapshot.checklists.aprovador` antigo: `normalizeAprovadorItem` preenche metadados ausentes. Se item tem `field_id` válido → `origem_pergunta='replicada_avaliado'`. Caso contrário → `'manual'`.
- Pesos antigos preservados.
- Itens sem `metrica_calculo` continuam editáveis manualmente; nada quebra.
- Config global sem `aprovador_pacote_padrao` → usa default em memória; rotinas antigas não recebem retroativamente.

---

## Checklist de validação (pós-implementação)

- [ ] Configurações > Pontuação/SLA mostra "Pacote padrão do Aprovador" com 10 perguntas.
- [ ] Cada pergunta padrão abre o mesmo `FieldConfigSheet` das perguntas do Avaliado.
- [ ] Criar nova rotina → aba Aprovador já vem com replicadas + 10 automáticas (lista única).
- [ ] Editar rotina antiga → carrega itens antigos sem erro, todos com badge `MANUAL` ou `REPLICADA`.
- [ ] Badges AUTO/REPLICADA/MANUAL discretos no card.
- [ ] Total de pontos soma replicadas + automáticas + manuais.
- [ ] Editar pergunta automática marca `editado_manual=true`, `editado_por`, `editado_em`.
- [ ] Penalidades automáticas (bloco separado) removidas da aba Aprovador.

---

## Fora de escopo (segunda etapa, após sua aprovação)

- Engine de cálculo automático das 10 perguntas (trigger lendo eventos de execução, plano de ação, prorrogação). Hoje a UI permite override manual; a sugestão automática vem como `null` até o engine ser implementado. Posso planejar isso separadamente, pois envolve trigger e leitura de várias tabelas.
- Visualização do auditor/validador das edições — depende do engine acima.

---

## Confirmação

Antes de codar, confirma:

1. OK em **persistir o pacote padrão dentro do `tarefas_pontuacao_config` (jsonb)** sem criar nova tabela?
2. OK em **deixar o engine de cálculo automático para uma 2ª etapa**, entregando agora UI + snapshot + override manual?
3. OK em **extrair o bloco de configuração de pergunta** do `tarefas_tabFormBuilder.tsx` para um `FieldConfigSheet` (sem mudar visualmente a aba Avaliado)?
