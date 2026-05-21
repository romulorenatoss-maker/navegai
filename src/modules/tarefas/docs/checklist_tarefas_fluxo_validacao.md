# Checklist de validação — Rebuild do Fluxo de Tarefas

> Antes de declarar o rebuild como **validado em produção**, executar todos os
> cenários abaixo. Marcar com `[x]` quando o passo passar.

---

## Pré-requisitos

- [ ] Migration `20260521000000_rebuild_tarefas_fluxo_executor_aprovador_auditor.sql` aplicada no Supabase
- [ ] Schema cache recarregado (`NOTIFY pgrst, 'reload schema'`)
- [ ] 7 RPCs presentes em `public.*` (confirmar com `\df public.tarefas_rpc_*`)
- [ ] 4 triggers de status redundantes dropados (confirmar com `\dft+ public.*`)
- [ ] Lovable buildou sem erros TypeScript críticos no `fluxo/`
- [ ] Preview do Lovable carrega sem tela branca

---

## Cenário 1 — Fluxo feliz (sem devoluções)

- [ ] Executor abre tarefa pendente
- [ ] Preenche todas as perguntas
- [ ] Clica "Enviar respostas ao aprovador" → toast verde
- [ ] Status muda para `aguardando_aprovacao` (verificar no banco)
- [ ] Aprovador abre tarefa pela aba "Aprovação"
- [ ] Vê `FluxoAprovadorPanel` carregado com R0 do executor visível
- [ ] Clica "Aprovar e enviar para auditoria" → toast verde
- [ ] Status muda para `aguardando_auditoria`
- [ ] Auditor abre tarefa pela aba "Auditor"
- [ ] Vê `FluxoAuditorPanel` com histórico completo
- [ ] Clica "Aprovar auditoria e concluir tarefa" → toast verde
- [ ] Status muda para `concluida`

---

## Cenário 2 — Plano do aprovador R1

- [ ] Executor responde tarefa
- [ ] Aprovador marca uma pergunta como "Não Conforme"
- [ ] Form de criar plano abre com `ItensPlanoBuilder`
- [ ] Adiciona itens (foto + texto, ou múltiplas fotos)
- [ ] Clica "Criar plano e devolver"
- [ ] Status muda para `devolvida`
- [ ] Executor abre a tarefa
- [ ] Vê apenas o card de plano de ação pendente (não o R0 destravado)
- [ ] R0 da pergunta original aparece como histórico read-only
- [ ] Executor preenche resposta + evidências
- [ ] Clica "Enviar resposta ao aprovador" → toast verde
- [ ] Status muda para `aguardando_aprovacao`
- [ ] Aprovador volta: vê R0 + plano R1 + resposta do executor em R1

---

## Cenário 3 — Plano R2 do aprovador

- [ ] Depois do R1, aprovador ainda marca pergunta como "Não Conforme"
- [ ] Cria plano R2 (rodada calculada automaticamente)
- [ ] Executor responde R2
- [ ] R1 permanece travado como histórico (não permite editar)
- [ ] R2 com sua resposta aparece abaixo do R1 na mesma pergunta

---

## Cenário 4 — Plano do auditor para aprovador

- [ ] Aprovador aprova e envia para auditoria
- [ ] Auditor abre a tarefa
- [ ] Marca uma pergunta como "Não Conforme"
- [ ] Cria plano R1 para aprovador
- [ ] Status volta para `aguardando_aprovacao`
- [ ] Aprovador volta: vê `FluxoBannerPendenciaAuditor` no topo
- [ ] Aprovador NÃO consegue clicar em "Aprovar e enviar para auditoria"
  (botão escondido ou bloqueado pela RPC)
- [ ] Aprovador responde plano do auditor
- [ ] Status volta para `aguardando_auditoria`
- [ ] Auditor vê resposta do aprovador

---

## Cenário 5 — Auditor manda aprovador criar plano para executor

- [ ] Auditor cria plano específico para pergunta X
- [ ] Aprovador só consegue criar plano de executor na **pergunta X**
  (nas outras perguntas, o botão NC fica disabled)
- [ ] Aprovador cria plano para executor na pergunta X
- [ ] Executor responde
- [ ] Aprovador responde o plano do auditor
- [ ] Status volta para auditoria
- [ ] Auditor vê todo o histórico encadeado

---

## Cenário 6 — Bloqueios (regras imutáveis)

- [ ] Executor NÃO consegue editar resposta original depois de enviar
      (lockOriginal=true por planos pendentes)
- [ ] Executor NÃO vê aba do aprovador/auditor
- [ ] Aprovador NÃO consegue aprovar com plano do aprovador pendente
      (RPC retorna erro "Existem N plano(s) do aprovador pendentes")
- [ ] Aprovador NÃO consegue aprovar com plano do auditor pendente
      (RPC retorna erro "Existem N plano(s) do auditor pendentes")
- [ ] Auditor NÃO consegue finalizar com plano do auditor pendente
- [ ] Plano já respondido NÃO aceita nova resposta
      (RPC retorna erro "Plano X já foi respondido em ...")
- [ ] Resposta original já enviada NÃO é editável

---

## Cenário 7 — Verdade única (sem coexistência)

- [ ] Painéis novos consomem APENAS `tarefas_planos_acao_aprovador` e
      `tarefas_planos_acao_auditor` para planos de ação
- [ ] `operational_field_reviews` NÃO recebe INSERT/UPDATE no fluxo novo
- [ ] Apenas 1 botão de envio por tela (executor / aprovador / auditor)
- [ ] Status muda apenas via RPC (sem triggers redundantes nem update direto
      no frontend para os fluxos do rebuild)

---

## Verificações operacionais

- [ ] Upload de evidência (foto / vídeo / áudio) funciona em planos
- [ ] Path no Drive segue: `tarefas/{MM-YYYY}/{DD}/{rotina|ad_hoc}/#{codigo}-{slug}/plano_acao/{arquivo}`
- [ ] Contingências (`operational_contingencies`) são auto-resolvidas pelas
      RPCs `tarefas_rpc_executor_responder_plano_aprovador` e
      `tarefas_rpc_aprovador_responder_plano_auditor` (não bloqueia mais
      transição)
- [ ] Histórico de respostas anteriores (R1, R2...) permanece visível e
      imutável após nova rodada

---

*Checklist gerado em 2026-05-21. Atualizar marcando os checkboxes durante a
validação.*
