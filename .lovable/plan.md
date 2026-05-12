
## Causa / contexto

Você pediu uma limpeza ampla do módulo Tarefas alinhando ao novo conceito (conformidade por item, plano de ação por pergunta, builder único). Antes de aplicar você pediu explicitamente para eu confirmar **o que será removido**, **quais arquivos serão alterados**, **o que fica só por compatibilidade** e **como o plano de ação por item será representado**. Esta é a leitura prévia.

## Arquivos impactados (somente UI/presentation; sem banco/RPC/trigger)

**Alterar (UI/regra do builder):**
- `src/modules/tarefas/components/tarefas_quickCreateDialog.tsx` — bloco principal a limpar.
- `src/modules/tarefas/components/tarefas_tabFormBuilder.tsx` — habilitar config por pergunta: `gera_contingencia`, `exige_evidencia`, `gera_plano_acao` (campo no form da pergunta), `bloqueia_conclusao`, `responsavel_plano_acao_id` (herda da designação).
- `src/modules/tarefas/components/tarefas_quickFieldDialog.tsx` — adicionar/expor toggles por pergunta acima.
- `src/modules/tarefas/components/builder/StepResumo.tsx` — refletir avaliador/aprovador/itens com NC/PA.

**Não alterar agora (apenas leitura/compatibilidade):**
- `tarefas_solicitacaoConfig.ts` — schema mantido; deixamos os defaults antigos para não quebrar tarefas avulsas já criadas (`exige_aceite_executor`, `exige_validacao_solicitante`, `permite_devolver`, `permite_plano_acao`, `renegociacao`). **Apenas escondemos da UI** no QuickCreateDialog; ainda gravados com defaults para legado de leitura/execução.
- `tarefas_useContingencyManagement.ts`, `tarefas_embeddedContingencyPanel.tsx`, `tarefas_contingencyDetailDialog.tsx`, `painels/*` — execução/avaliação/aprovação **não muda**. Seguem operando NC e PA por item via `field_id` (já é o modelo atual).
- `tarefas_bucketize.ts`, `tarefas_rbac.ts`, `tarefas_service.ts`, hooks `useAssignmentExecution/Review/ApprovalFlow` — não tocados.
- `TarefasBuilderWizard.tsx` (rotinas) — apenas confirmação de que continua usando os mesmos componentes; sem refactor agora.

## Regras antigas a remover **da UI** do QuickCreateDialog

1. Toggle global "Plano de ação" no nível da tarefa (linhas ~610–650 — `requerPlanoAcao`/`planoAcaoMode`/`planoAcaoId/Setor`). Move-se para **por pergunta** no FormBuilder. O state continua existindo apenas como **fallback de responsável padrão** (herdado pela pergunta quando a pergunta não definir o seu próprio).
2. Bloco "Fluxo Operacional" da avulsa que expõe `exige_aceite_executor`, `exige_validacao_solicitante`, `permite_devolver`, `permite_renegociacao` e similares (linhas ~840–900). Some da UI; gravamos `solicitacao_config` com defaults atuais para não quebrar leitura.
3. Perguntas automáticas de pontuação quando **não há aprovador nem nota ativa** (já estava parcialmente condicional via `mostrarPontuacao` — reforçar e remover qualquer ramo que ainda renderize esmaecido).
4. Labels/textos que sugerem "plano de ação da tarefa". Substituir por "plano de ação por item".
5. `permite_devolucao_parcial` e `bloquear_fechamento_com_contingencia` continuam sendo gravados como `false` no payload (já hoje), mas removemos qualquer label residual.

## Por pergunta (FormBuilder)

Expor por pergunta no editor (`tarefas_quickFieldDialog`):
- `exige_evidencia` + `tipo_evidencia` (já existem).
- `gera_contingencia` (já existe; exibir explicitamente).
- `gera_plano_acao` (novo flag local, gravado em `field.config_extra.gera_plano_acao` do snapshot — sem migration).
- `bloqueia_conclusao` (novo flag em `field.config_extra.bloqueia_conclusao`).
- `responsavel_plano_acao_id` por pergunta (opcional; default = herdar da designação).

Snapshot da pergunta passa a carregar esses campos em `template_snapshot.sections[].fields[].config_extra` — estrutura JSON já tolerada pelo backend.

## Designação primeiro

Já foi aplicado (etapa 1 = Designação, etapa 2 = Estrutura, etapa 3 = Prazo & Notas). Mantido.

## Prazo / SLA por agrupador

Já existe via `template_snapshot.agrupadores_config[]` (Etapa anterior). Sem mudanças.

## Compatibilidade

- Tarefas antigas com `solicitacao_config` continuam sendo lidas pelos painéis existentes (parser tolerante).
- Tarefas antigas com `requer_planoAcao` global continuam funcionando porque `tarefas_useContingencyManagement` lê `responsavel_contingencia_id` do assignment.
- Novas tarefas: plano de ação nasce no item; o `responsavel_contingencia_id` da assignment passa a ser o "responsável padrão" (herdado da designação) e cada item pode sobrescrever via `config_extra.responsavel_plano_acao_id`.

## O que NÃO será feito

- Nenhuma migration, RPC, trigger, RLS.
- Nenhuma alteração em execução/avaliação/aprovação/bucketize/RBAC/drawer.
- Nenhum builder paralelo.
- Não unifico agora `TarefasBuilderWizard` (rotinas) com o QuickCreate — eles já usam o mesmo `TabFormBuilder`. A unificação completa exigiria refactor maior; fora do escopo desta limpeza.

## Riscos

- Esconder toggles do "Fluxo Operacional" da avulsa pode confundir quem usava `exige_aceite_executor=false`. Mitigação: defaults atuais preservados no JSON.
- Adicionar `config_extra` por pergunta exige que `tabFormBuilder`/`quickFieldDialog` passem o objeto adiante no save do snapshot. Vou verificar o caminho do save antes de tocar.

## Confirme antes de eu aplicar

1. **OK remover da UI** o bloco global "Plano de ação" da tarefa, mantendo o state apenas como fallback de responsável padrão herdado pela pergunta?
2. **OK esconder da UI** o bloco "Fluxo Operacional" (aceite/validação/devolução/renegociação) da avulsa, **mantendo** os defaults gravados em `solicitacao_config` para compatibilidade?
3. **OK adicionar por pergunta** os campos `gera_plano_acao`, `bloqueia_conclusao`, `responsavel_plano_acao_id` em `config_extra` do snapshot (sem migration)?
4. **OK não unificar agora** `TarefasBuilderWizard` (rotinas) com o QuickCreate — apenas garantir que ambos usam o mesmo `TabFormBuilder` (já usam)?

Responda 1–4 (ou ajustes) que aplico em uma única passagem com o ZIP solicitado.
