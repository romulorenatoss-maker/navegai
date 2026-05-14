## Objetivo

No modal de **editar rotina** (`/tarefas/rotinas`):

1. Renomear a aba **"Campos"** para **"Avaliado"** (mantendo todo o conteúdo atual — é o que o avaliado responde).
2. Nas abas **Aprovador** e **Validador**, carregar **automaticamente no topo** as "perguntas" derivadas das **penalidades automáticas** definidas em **Configurações → Pontuação/SLA** (atraso, não-resposta, não-conformidade) da camada correspondente.
3. Essas perguntas automáticas vêm com **pontos pré-preenchidos** vindos da config global, mas **editáveis por rotina** (override local, sem alterar a config global).
4. O **peso total** de cada aba (Avaliado/Aprovador/Validador) é somado dinamicamente conforme perguntas/agrupadores são criados.
5. O **Validador não é avaliado**: ele apenas audita o que Avaliado e Aprovador fizeram. As "perguntas automáticas" no Validador são checagens de conformidade sobre as camadas anteriores (não pesos próprios do validador como executor).

---

## Análise da estrutura atual

**Arquivos impactados (frontend apenas):**

| Arquivo | Mudança |
|---|---|
| `BuilderStepper.tsx` | Trocar label "Campos" → "Avaliado" |
| `WIZARD_STEPS` em `types.ts` | Trocar label do step `campos` |
| `StepChecklistAprovador.tsx` | Adicionar bloco superior "Penalidades automáticas (da config)" carregando 3 itens (atraso/não-resposta/não-conformidade) da camada `sla_aprovador`; somar no peso total |
| `StepChecklistValidador.tsx` | Adicionar bloco superior similar para camada `sla_validador`; deixar claro que valida camadas anteriores |
| `TabFormBuilder` (aba Avaliado) | Mostrar bloco superior com penalidades automáticas da camada `sla_executor` (read-only resumo + edição de override) e somatório do peso da aba |
| `types.ts` | Adicionar tipo `PenalidadesAutoForm` (overrides locais por camada) — opcional, persistido junto à rotina |
| `tarefas_rotinasPage.tsx` | Carregar `tarefas_pontuacao_config` ao abrir o modal; passar para os steps; salvar overrides como parte do snapshot da rotina |

**Hook novo (opcional, simples):**
- `usePenalidadesPorCamada(camadaKey)` — busca config global + aplica override local. Pode ficar inline no page por enquanto.

**Service usado (já existente):**
- `tarefas_pontuacao_config_service.getPontuacaoConfig()` — já retorna `sla_executor`, `sla_aprovador`, `sla_plano_acao`, `sla_validador`.

**Tabelas/RPCs/Triggers:**
- **Nenhuma alteração de DB nesta fase.** Apenas leitura da config existente. Override fica no snapshot da rotina (jsonb já existente).

---

## Layout proposto (cada aba)

```
[ Aba Aprovador ]
┌──────────────────────────────────────────────┐
│  Penalidades automáticas (da config global) │
│  ─────────────────────────────────────────  │
│  • Atraso na aprovação        [-10] pts     │
│  • Não respondeu              [-20] pts     │
│  • Não conformidade detectada [-15] pts     │
│  (editável por rotina — não altera global)  │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  Checklist do Aprovador (perguntas)          │
│  1. ... peso 5                               │
│  2. ... peso 3                               │
└──────────────────────────────────────────────┘

Peso total da camada: 53
```

Mesmo padrão para **Validador** (lendo `sla_validador`) e **Avaliado** (lendo `sla_executor`).

No **Validador**, o bloco de penalidades automáticas vem com nota explicativa: *"Estas penalidades são aplicadas pela auditoria sobre a execução do Avaliado/Aprovador."*

---

## Regra de cálculo

- **Peso total da aba** = soma dos pesos das perguntas + soma absoluta das penalidades automáticas ativas.
- Penalidades são valores negativos (já vêm como número da config). Mostradas com sinal `-`.
- Override por rotina é salvo em `template.snapshot.penalidades_override = { sla_executor: {...}, sla_aprovador: {...}, sla_validador: {...} }` (campo jsonb dentro do snapshot que já é persistido).

---

## Rollback

Reverter os 6 arquivos editados. Sem migração, sem perda de dados.

---

## Checklist de validação

- [ ] Aba "Campos" agora aparece como "Avaliado" no stepper
- [ ] Modal Aprovador mostra 3 penalidades automáticas no topo, com valores vindos da config
- [ ] Editar valor da penalidade na rotina não altera a config global
- [ ] Peso total exibido = soma perguntas + |penalidades|
- [ ] Validador mostra mesmo bloco + nota "auditoria"
- [ ] Aba Avaliado mostra o bloco + soma total ao adicionar/remover perguntas
- [ ] Salvar e reabrir rotina preserva os overrides

---

## Confirmação

Confirma que posso seguir com este plano (Fase única, só frontend, sem DB)?
