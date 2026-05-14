## Contexto e premissas

- A aba 1 (Responsáveis V2) já está aprovada — **não será tocada**.
- O modal de **Rotinas** (`TarefasBuilderWizard`) passa a ser o **builder oficial único** do sistema.
- O botão "+" (Tarefa Avulsa) em fase posterior reutilizará este mesmo modal — nada de duplicar agora.
- Retrocompatibilidade total: tarefas antigas continuam executando via fallback legacy. Sem migração de snapshots existentes.

## Arquivos impactados (lista prévia, antes de aplicar)

### Frontend — alterados
1. `src/modules/tarefas/components/builder/types.ts`
   - Adicionar steps `checklist_aprovador` e `checklist_validador` em `WIZARD_STEPS` (condicionais).
   - Novos tipos `AprovadorCheckItemForm` e `ValidadorCheckItemForm`.
2. `src/modules/tarefas/components/builder/BuilderStepper.tsx`
   - Suportar steps condicionais (filtrar visualização baseado em flags).
3. `src/modules/tarefas/components/builder/TarefasBuilderWizard.tsx`
   - Receber `aprovadorChecks`, `setAprovadorChecks`, `validadorChecks`, `setValidadorChecks`.
   - Renderizar novas abas condicionais.
   - Filtrar `WIZARD_STEPS` em runtime conforme presença de Aprovador Final / Validador Final.
4. `src/modules/tarefas/components/builder/StepChecklistAprovador.tsx` **(novo)**
   - Lista auto-replicada das perguntas operacionais (cada `field` da aba Campos vira um item).
   - Permite editar: peso, tipo de resposta (sim/não, conforme/nc, nota), observação, anexo, devolução, plano de ação, conclusão, exige evidência, permite aumento de prazo.
5. `src/modules/tarefas/components/builder/StepChecklistValidador.tsx` **(novo)**
   - Itens padrão pré-popados: SLA cumprido, atrasos, devoluções, evidência presente, plano de ação encerrado, conformidade do avaliador, conformidade do aprovador.
   - Permite adicionar itens manuais; pesos somáveis com total exibido.
6. `src/modules/tarefas/components/builder/StepResumo.tsx`
   - Exibir resumo das duas novas abas quando presentes.
   - Exibir as três notas separadas (Operacional / Governança / Auditoria).
7. `src/modules/tarefas/pages/tarefas_rotinasPage.tsx`
   - Estado novo: `aprovadorChecks`, `validadorChecks`.
   - Persistir em `template_snapshot.checklist_aprovador` e `template_snapshot.checklist_validador` (sem migration; usa colunas snapshot existentes).
   - Carregar/hidratar ao editar template.
8. `src/modules/tarefas/types/tarefas_types.ts`
   - Tipos `AprovadorCheckItem` e `ValidadorCheckItem` exportados.

### Frontend — apenas leitura (não alterar nesta etapa)
- `src/modules/tarefas/components/responsaveis/TarefasResponsaveisV2.tsx` (fonte de verdade de quem é Aprovador Final / Validador Final).
- `src/modules/tarefas/components/tarefas_tabFormBuilder.tsx` (aba Campos — já tem peso, anexo, N/A, conforme/NC etc.; é a origem da replicação).
- `src/modules/tarefas/components/tarefas_quickCreateDialog.tsx` (Tarefa Avulsa — **não tocar agora**, será migrado em etapa futura).

### Backend
- **Sem migration nesta etapa.** Tudo persistido em `operational_templates.template_snapshot` (jsonb) que já existe.
- Sem alterações em RLS, sem novas tabelas, sem novas Edge Functions.

## Fluxo da aba Campos → replicação automática

```text
Aba Campos (perguntas operacionais)
        │
        ├──► (se Aprovador Final marcado)
        │     Aba Checklist Aprovador
        │     1 item por pergunta, com:
        │     - pergunta_padrao = "Aprovador confirma: <label>?"
        │     - peso, tipo_resposta, exige_evidencia,
        │       permite_devolucao, gera_plano_acao,
        │       permite_aumento_prazo
        │
        └──► (se Validador Final marcado)
              Aba Checklist Validador
              Itens fixos de auditoria + manuais
              (SLA, atraso, devolução, evidência, plano,
               conformidade avaliador, conformidade aprovador)
```

Replicação é **idempotente**: ao editar um field na aba Campos, o item correspondente em Checklist Aprovador é atualizado (label/ordem) sem perder os ajustes locais (peso, tipo, evidência).

## Separação de notas (apenas estrutura/cálculo no payload — UI exibe no Resumo)

```text
Nota Operacional   →  Avaliado          (perguntas da aba Campos)
Nota Governança    →  Avaliador/Aprov.  (SLA + aprovação + devolução +
                                          plano de ação + encerramento +
                                          conformidade do fluxo)
Nota Auditoria     →  Validador         (Checklist Validador completo)
```

**Regra de consolidação:** se Avaliador e Aprovador forem o mesmo usuário (`profile_id` igual nos blocos da V2), a Nota de Governança é **consolidada** — não soma penalidade duplicada de SLA, mas mantém histórico de eventos separados.

## Plano de Ação — preparação (sem RBAC forte ainda)

Estrutura preparada no payload:
- `acoes[]`: { id, descricao, anexos[], observacoes[], historico[], mensagens[], sla_horas, prazo_atual, aumentos_prazo[], encerrado_em, encerrado_por }
- Devolução: `devolucoes[]` com motivo, anexo, autor, prazo de retorno.
- Encerramento formal: campo `encerramento` com timestamp, autor, justificativa.
- **RBAC forte (somente Aprovador Final pode encerrar/aprovar/devolver) será aplicado em etapa futura.** Por ora, todos os papéis podem editar (com auditoria registrada).

## Regras condicionais das abas (resumo)

| Aba                    | Visível quando                                       |
|------------------------|------------------------------------------------------|
| Geral                  | sempre                                               |
| Campos                 | sempre                                               |
| Checklist (legacy)     | sempre (mantido por retrocompat)                     |
| Checklist Aprovador    | `responsaveis_multi.aprovadorFinal` tem ≥1 pessoa    |
| Checklist Validador    | `responsaveis_multi.validadorFinal` tem ≥1 pessoa    |
| Fluxo                  | sempre                                               |
| Resumo                 | sempre                                               |

## Retrocompatibilidade garantida

- `template_snapshot.checklist_aprovador` ausente → execução cai no comportamento atual (sem checklist do aprovador).
- `template_snapshot.checklist_validador` ausente → idem.
- `responsaveis_multi` ausente → fallback legacy (`executor_*`, `avaliador_*`, `aprovador_*`, `ada_*`) já implementado nas etapas anteriores.
- Snapshots antigos não são reescritos.

## Detalhes técnicos

- **Tipos novos** (em `types/tarefas_types.ts`):
  ```ts
  export interface AprovadorCheckItem {
    tempId: string;
    field_id: string;          // referência ao field operacional original
    pergunta_padrao: string;   // "Aprovador confirma: <label>?"
    tipo_resposta: "conforme_nao_conforme" | "sim_nao" | "nota";
    peso: number;
    exige_observacao: boolean;
    exige_evidencia: boolean;
    permite_devolucao: boolean;
    gera_plano_acao: boolean;
    permite_conclusao: boolean;
    permite_aumento_prazo: boolean;
  }
  export interface ValidadorCheckItem {
    tempId: string;
    pergunta: string;
    categoria: "sla" | "atraso" | "devolucao" | "evidencia" |
               "plano_acao" | "conformidade_avaliador" |
               "conformidade_aprovador" | "manual";
    peso: number;
    tipo_resposta: "conforme_nao_conforme" | "sim_nao" | "nota";
    exige_observacao: boolean;
    exige_evidencia: boolean;
  }
  ```
- **Replicação**: `useEffect` no `StepChecklistAprovador` sincroniza `aprovadorChecks` com `fields` por `field_id` — adiciona novos, remove órfãos, mantém ajustes locais.
- **Ordem dos steps**: Geral → Campos → Checklist Aprovador (cond.) → Checklist Validador (cond.) → Checklist (legacy) → Fluxo → Resumo.

## Entregáveis ao final da execução

- Diff completo dos arquivos listados.
- Manifest dos arquivos alterados/criados.
- Rollback: reverter os 8 arquivos listados (restaura comportamento atual).
- Descrição visual do novo modal (desktop + mobile).
- Lista de novos campos no payload `template_snapshot`.
- Lista de regras novas vs. regras legacy mantidas.

## Confirmação solicitada antes de executar

Como há mudança no fluxo do builder (novas abas + payload novo no snapshot), confirmar:
1. Aprovação para executar com **escopo exatamente como descrito acima** (sem migration, sem RBAC forte ainda).
2. Posição da aba "Checklist (legacy)" — manter ou ocultar quando ambas as novas existirem? Sugestão: manter sempre por retrocompat, mas posso ocultar se preferir.
3. Os itens padrão do Validador propostos (SLA, atraso, devolução, evidência, plano, conformidade avaliador, conformidade aprovador) cobrem o que você quer ou faltou algum?