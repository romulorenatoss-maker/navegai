# COMANDO PARA CODEX/CLAUDE — REIMPLEMENTAR PERGUNTAS AUTOMÁTICAS + CÁLCULO DE NOTA NO NOVO FLUXO DE TAREFAS

## CONTEXTO

O projeto **navegai** (Vite + React + TS + Supabase) acabou de passar por um rebuild completo do fluxo executor→aprovador→auditor (commits `e6b50c44` até `f43586ef`).

A nova arquitetura vive em `src/modules/tarefas/fluxo/`:

- **Painéis novos:** `FluxoExecutorPanel`, `FluxoAprovadorPanel`, `FluxoAuditorPanel`.
- **Hook único de leitura:** `useFluxoTarefa(assignmentId)` → retorna `TarefaFluxoData`.
- **Actions:** `useAprovadorActions`, `useAuditorActions`, `useExecutorActions`.
- **Service RPC:** `tarefasFluxoRpcService` (chama as 7 RPCs oficiais).
- **Tipos:** `fluxo/types/tarefas_fluxoTypes.ts`.

**O problema:** no painel ANTIGO (`tarefas_embeddedActionPanels.tsx`, marcado `@deprecated`) existiam dois blocos importantes que os painéis novos **NÃO TÊM**:

1. **Perguntas automáticas** vindas do template (`ada_config_snapshot.checklists.aprovador` e `.validador`) — perguntas binárias que o sistema responde sozinho (sem clique humano) baseado em dados reais (devoluções, contingências, prazos, prorrogações). Cada uma tem `peso` em pontos.
2. **Cálculo de nota final** somando os pesos das perguntas que mantiveram pontos (não foram marcadas `N/A` e não tiveram `tiraPonto: true`).

A **tela final** mostrava cada pergunta com cor (verde / vermelho / cinza N/A), a resposta automática derivada, e no rodapé o card "Nota final da Auditoria" / "Nota final do Aprovador" com o total.

A **gravação** salvava `score_auditor` / `score_aprovador` em `operational_assignments` e logs em `operational_score_logs` (com destino individual ou por setor).

---

## OBJETIVO

Reimplementar essa funcionalidade nos painéis novos (`FluxoAprovadorPanel` e `FluxoAuditorPanel`) seguindo a arquitetura limpa do rebuild — **verdade única** (Regra 0.7), sem coexistência com o painel antigo, sem mexer em arquivos `@deprecated`.

---

## ESCOPO

### Criar
- `fluxo/services/tarefas_fluxoMetricas.ts` — funções puras de cálculo das métricas automáticas (aprovador avaliando executor + auditor avaliando aprovador).
- `fluxo/components/tarefas_fluxoPerguntaAutoCard.tsx` — render de UMA pergunta automática (cor verde/vermelho/cinza + label + peso + N/A toggle).
- `fluxo/components/tarefas_fluxoNotaFinalCard.tsx` — render do bloco "Nota final" com soma.
- `fluxo/hooks/tarefas_usePerguntasAuto.ts` — hook que retorna `{ perguntasAprovador, perguntasAuditor, calcRespostaExecutor, calcRespostaAuditor, notaMaximaAprovador, notaEfetivaAprovador, notaMaximaAuditor, notaEfetivaAuditor }`.

### Alterar
- `fluxo/components/tarefas_fluxoAprovadorPanel.tsx` — antes do botão "Aprovar e enviar para auditoria", renderizar bloco de "Avaliação automática do executor" com perguntas + nota final.
- `fluxo/components/tarefas_fluxoAuditorPanel.tsx` — antes do botão "Aprovar auditoria e concluir tarefa", renderizar bloco de "Avaliação automática do aprovador" com perguntas + nota final.
- Quando o aprovador chama `aprovarParaAuditoria.mutate({assignmentId, notas: {nota_efetiva, nota_maxima, respostas: [...]}})`, passar o detalhe da pontuação no `p_notas`.
- Idem para `aprovarAuditoria.mutate({assignmentId, notas: ...})`.

### NÃO mexer
- `tarefas_embeddedActionPanels.tsx` (`@deprecated`).
- RPCs ou triggers de banco.
- Tabela `operational_field_reviews`.
- Hook único `useFluxoTarefa`.

---

## CONTRATO DE DADOS

### Estrutura no template (já existe)

`assignment.template_snapshot.ada_config_snapshot.checklists` contém duas listas:

```ts
{
  aprovador: PerguntaAuto[],   // perguntas que o aprovador "responde" (sobre o executor)
  validador: PerguntaAuto[],   // perguntas que o auditor "responde" (sobre o aprovador)
}

interface PerguntaAuto {
  id?: string;
  tempId?: string;
  pergunta: string;
  metrica_calculo: string;     // chave do switch (ex: "executor_atrasou")
  peso: number;                // pontos quando OK; perdidos quando "tiraPonto: true"
  permite_na?: boolean;        // se aceita o usuário marcar N/A para manter o ponto
  ativo?: boolean;
}
```

**Atenção:** em tarefas não-finais o snapshot vivo (`assignment.operational_templates.ada_config_snapshot`) tem precedência; em tarefas finais (concluída/aprovada/reprovada) usar o snapshot congelado (`assignment.template_snapshot.ada_config_snapshot`). Já temos essa lógica em `tarefas_fluxoHistoricoMapper.extrairPerguntasSnapshot`.

### Resultado de uma métrica

```ts
interface RespostaAuto {
  resposta: "sim" | "nao" | null;
  label: string;          // texto amigável (ex: "Sim — 1 devolução(ões)")
  tiraPonto: boolean;     // se true, a pergunta não soma pontos
}
```

### Decisão local do usuário

```ts
interface DecisaoUsuario {
  na: boolean;            // se true, mantém os pontos (anula tira_ponto)
  justificativa?: string; // obrigatória se na === true
}
```

---

## MÉTRICAS COMPLETAS (extraídas do código antigo)

Implementar **exatamente** essa lógica no service.

### Avaliação do EXECUTOR (chamado pelo aprovador)
Função: `calcRespostaExecutor(metrica: string, ctx: MetricaContext): RespostaAuto`

`MetricaContext` = `{ assignment, fieldReviews, fieldAnswers, contingencies, fields }` — todos pré-carregados pelo `useFluxoTarefa`.

```ts
switch (metrica) {
  // Atraso da execução
  case "executor_entregou_no_prazo":
  case "executor_atrasou": {
    const atrasou = a.flag_sla_estourado
      || (a.finalizado_em && a.prazo_execucao
          && new Date(a.finalizado_em) > new Date(a.prazo_execucao));
    return atrasou
      ? { resposta: "sim", label: "Sim — entregou fora do prazo", tiraPonto: true }
      : { resposta: "nao", label: "Não — entregou no prazo",     tiraPonto: false };
  }

  case "executor_teve_atraso_etapa": {
    const planosAtrasados = contingencies.filter(c => {
      if (!c.prazo_resolucao) return false;
      const prazoMs = new Date(c.prazo_resolucao).getTime();
      const refMs = c.resolvida_em ? new Date(c.resolvida_em).getTime() : Date.now();
      return refMs > prazoMs;
    });
    if (planosAtrasados.length > 0 || a.flag_sla_etapa_estourado || a.flag_atraso_plano_acao) {
      return { resposta: "sim", label: `Sim — ${planosAtrasados.length || 1} etapa(s) com atraso`, tiraPonto: true };
    }
    return { resposta: "nao", label: "Não — todas etapas no prazo", tiraPonto: false };
  }

  // Obrigatórias respondidas (Sim é bom)
  case "executor_obrigatorias_respondidas": {
    const obrigatoriasFaltando = fields.filter(f => {
      if (!f.obrigatorio) return false;
      const ans = fieldAnswers.find(x => x.field_id === f.id);
      if (!ans) return true;
      const temValor = ans.valor_booleano !== null
        || (ans.valor_texto && ans.valor_texto !== "")
        || ans.evidencia_url || ans.evidencia_anexo_id;
      return !temValor;
    });
    return obrigatoriasFaltando.length > 0
      ? { resposta: "nao", label: `Não — ${obrigatoriasFaltando.length} obrigatória(s) sem resposta`, tiraPonto: true }
      : { resposta: "sim", label: "Sim — todas respondidas", tiraPonto: false };
  }

  // Evidências obrigatórias anexadas
  case "executor_evidencias_anexadas": {
    const semEvidencia = fields.filter(f => {
      const exige = f.exige_evidencia || f.evidencia_obrigatoria || f.aprovador_exige_evidencia_nao;
      if (!exige) return false;
      const ans = fieldAnswers.find(x => x.field_id === f.id);
      return !ans?.evidencia_url && !ans?.evidencia_anexo_id;
    });
    return semEvidencia.length > 0
      ? { resposta: "nao", label: `Não — ${semEvidencia.length} sem evidência`, tiraPonto: true }
      : { resposta: "sim", label: "Sim — todas anexadas", tiraPonto: false };
  }

  // Devolução / reabertura
  case "executor_teve_devolucao": {
    const planosAprovador = fieldReviews.filter(r => r.devolvido === true && r.criado_por_papel !== "auditor");
    return planosAprovador.length > 0
      ? { resposta: "sim", label: `Sim — ${planosAprovador.length} devolução(ões)/plano(s)`, tiraPonto: true }
      : { resposta: "nao", label: "Não — sem devoluções", tiraPonto: false };
  }

  // Não conformidades
  case "executor_teve_nao_conforme": {
    const numNC = (approvalAnswers ?? []).filter(a => a.resposta === "nao_conforme").length;
    return numNC > 0
      ? { resposta: "sim", label: `Sim — ${numNC} não conforme(s)`, tiraPonto: true }
      : { resposta: "nao", label: "Não", tiraPonto: false };
  }

  // SLA do plano estourado
  case "plano_acao_sla_estourado":
  case "executor_plano_atrasado": {
    const atrasou = a.flag_atraso_plano_acao || planosAtrasados.length > 0;
    return atrasou
      ? { resposta: "sim", label: `Sim — plano estourou SLA`, tiraPonto: true }
      : { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
  }

  // Prazo prorrogado
  case "executor_prazo_prorrogado":
  case "plano_acao_prazo_prorrogado": {
    const prorrogacoes = fieldReviews.filter(r => r.prazo_alterado === true);
    return prorrogacoes.length > 0
      ? { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogação(ões)`, tiraPonto: true }
      : { resposta: "nao", label: "Não", tiraPonto: false };
  }

  // Prorrogação 2x+
  case "plano_acao_prazo_prorrogado_2x": {
    const prorrogacoes = fieldReviews.filter(r => r.prazo_alterado === true);
    if (a.flag_reincidencia_atraso || prorrogacoes.length >= 2) {
      return { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogações`, tiraPonto: true };
    }
    return { resposta: "nao", label: "Não", tiraPonto: false };
  }

  // Reincidência
  case "executor_reincidencia": {
    const planosAtrasadosCount = contingencies.filter(c => /* ... */).length;
    if (a.flag_reincidencia_atraso || planosAtrasadosCount >= 2) {
      return { resposta: "sim", label: `Sim — reincidente`, tiraPonto: true };
    }
    return { resposta: "nao", label: "Não", tiraPonto: false };
  }

  case "manual":
  default:
    return { resposta: null, label: "Avaliação manual", tiraPonto: false };
}
```

### Avaliação do APROVADOR (chamado pelo auditor)
Função: `calcRespostaAuditor(metrica: string, ctx: MetricaContext): RespostaAuto`

```ts
switch (metrica) {
  case "aprovador_respondeu_no_sla": {
    return a.flag_sla_etapa_estourado
      ? { resposta: "sim", label: "Sim — avaliou fora do SLA", tiraPonto: true }
      : { resposta: "nao", label: "Não — avaliou no prazo",     tiraPonto: false };
  }

  case "aprovador_reabriu_tarefa": {
    const planosAprovador = fieldReviews.filter(r => r.devolvido === true && r.criado_por_papel !== "auditor");
    const devolveu = planosAprovador.length > 0 || (a.rodada_atual ?? 1) > 1;
    return devolveu
      ? { resposta: "sim", label: `Sim — ${planosAprovador.length || 1} devolução(ões)`, tiraPonto: true }
      : { resposta: "nao", label: "Não", tiraPonto: false };
  }

  case "aprovador_aprovou_com_pendencia": {
    const planosAprovador = fieldReviews.filter(r => r.devolvido === true && r.criado_por_papel !== "auditor");
    const planosSemResposta = planosAprovador.filter(p => {
      const itens = Array.isArray(p.itens_plano) ? p.itens_plano : [];
      if (itens.length === 0) return false;
      const ans = fieldAnswers.find(x => x.field_id === p.field_id);
      const valorJson = ans?.valor_json ?? {};
      const algumRespondido = itens.some(item => {
        const chave = `__plano_acao__r${p.rodada}__${item.tipo}`;
        return valorJson[chave];
      });
      return !algumRespondido;
    });
    return planosSemResposta.length > 0
      ? { resposta: "sim", label: `Sim — ${planosSemResposta.length} pendência(s)`, tiraPonto: true }
      : { resposta: "nao", label: "Não — sem pendências", tiraPonto: false };
  }

  case "plano_acao_sla_estourado": {
    const contingenciasAtrasadas = contingencies.filter(c => {
      if (!c.prazo_resolucao) return false;
      const prazoMs = new Date(c.prazo_resolucao).getTime();
      const refMs = c.resolvida_em ? new Date(c.resolvida_em).getTime() : Date.now();
      return refMs > prazoMs;
    });
    if (a.flag_atraso_plano_acao || contingenciasAtrasadas.length > 0) {
      return { resposta: "sim", label: `Sim — ${contingenciasAtrasadas.length || 1} plano(s) atrasado(s)`, tiraPonto: true };
    }
    return { resposta: "nao", label: "Não — dentro do prazo", tiraPonto: false };
  }

  case "plano_acao_prazo_prorrogado": {
    const prorrogacoes = fieldReviews.filter(r => r.prazo_alterado === true && r.criado_por_papel !== "auditor");
    return prorrogacoes.length > 0
      ? { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogação(ões)`, tiraPonto: true }
      : { resposta: "nao", label: "Não", tiraPonto: false };
  }

  case "plano_acao_prazo_prorrogado_2x": {
    const prorrogacoes = fieldReviews.filter(r => r.prazo_alterado === true && r.criado_por_papel !== "auditor");
    if (a.flag_reincidencia_atraso || prorrogacoes.length >= 2) {
      return { resposta: "sim", label: `Sim — ${prorrogacoes.length} prorrogações`, tiraPonto: true };
    }
    return { resposta: "nao", label: "Não", tiraPonto: false };
  }

  default:
    return { resposta: null, label: "Avaliação manual", tiraPonto: false };
}
```

---

## REGRA DE SOMA DA NOTA

```ts
const notaMaxima = perguntasAuto.reduce((sum, p) => sum + (p.peso || 0), 0);

const notaEfetiva = perguntasAuto.reduce((sum, p) => {
  const key = p.tempId ?? p.id ?? p.pergunta;
  const decisaoUsuario = respostasAuto[key] ?? { na: false };
  const auto = calcResposta(p.metrica_calculo ?? "manual");

  if (decisaoUsuario.na) return sum + (p.peso || 0); // N/A mantém ponto
  if (auto.tiraPonto)    return sum;                  // perdeu ponto
  return sum + (p.peso || 0);                         // manteve ponto
}, 0);
```

### Justificativa obrigatória
Se `decisaoUsuario.na === true` e `justificativa.trim() === ""`, **bloquear o submit** com toast vermelho:
```
toast.error(`Justificativa obrigatória para N/A em: "${p.pergunta}"`);
```

---

## LAYOUT VISUAL (JSX — Tailwind/shadcn)

### Card de uma pergunta auto

```tsx
function FluxoPerguntaAutoCard({ pergunta, decisaoUsuario, autoResposta, onChangeNA, onChangeJustificativa }) {
  const corBorda =
    decisaoUsuario.na
      ? "opacity-70 bg-muted/20 border-border"
      : autoResposta.tiraPonto
        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
        : "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800";

  return (
    <div className={`border rounded-lg p-3 space-y-2 ${corBorda}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">{pergunta.pergunta}</p>

          {autoResposta.resposta && !decisaoUsuario.na && (
            <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
              autoResposta.tiraPonto
                ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            }`}>
              {autoResposta.tiraPonto ? "✗" : "✓"} {autoResposta.label}
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-1">
            Nota:{" "}
            <span className={`font-semibold ${
              autoResposta.tiraPonto && !decisaoUsuario.na
                ? "text-red-600 line-through"
                : "text-emerald-600"
            }`}>
              {pergunta.peso} pts
            </span>
            {autoResposta.tiraPonto && !decisaoUsuario.na && (
              <span className="text-red-600 ml-1">→ 0 pts</span>
            )}
            {decisaoUsuario.na && (
              <span className="text-amber-600 ml-1">→ N/A (nota mantida)</span>
            )}
          </p>
        </div>

        {pergunta.permite_na !== false && (
          <label className="flex items-center gap-1 shrink-0 cursor-pointer mt-0.5">
            <input
              type="checkbox"
              checked={decisaoUsuario.na}
              onChange={(e) => onChangeNA(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            <span className="text-[11px] text-muted-foreground">N/A</span>
          </label>
        )}
      </div>

      {decisaoUsuario.na && (
        <div className="space-y-1 ml-7">
          <Label className="text-[10px] text-amber-700">
            Justificativa obrigatória — por que N/A? (nota será mantida)
          </Label>
          <Textarea
            value={decisaoUsuario.justificativa ?? ""}
            onChange={(e) => onChangeJustificativa(e.target.value)}
            placeholder="Por que este item não se aplica..."
            className="text-xs min-h-[36px]"
          />
        </div>
      )}
    </div>
  );
}
```

### Card "Nota final"

```tsx
function FluxoNotaFinalCard({ titulo, notaEfetiva, notaMaxima, destinoTexto }) {
  return (
    <div className="border border-primary/30 rounded-lg px-4 py-3 bg-primary/5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{titulo}</span>
        <span className="text-primary text-lg font-bold">
          {notaEfetiva} pts
          <span className="text-xs text-muted-foreground ml-1">/ {notaMaxima}</span>
        </span>
      </div>
      {destinoTexto && (
        <p className="text-[11px] text-muted-foreground">{destinoTexto}</p>
      )}
    </div>
  );
}
```

### Bloco completo no painel (loop)

```tsx
{perguntasAuto.length > 0 && (
  <div className="space-y-2">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
      {papel === "aprovador" ? "Avaliação automática do executor" : "Avaliação automática do aprovador"}
    </p>

    {perguntasAuto.map((p) => {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const decisao = respostasAuto[key] ?? { na: false, justificativa: "" };
      const auto = papel === "aprovador"
        ? calcRespostaExecutor(p.metrica_calculo ?? "manual")
        : calcRespostaAuditor(p.metrica_calculo ?? "manual");

      return (
        <FluxoPerguntaAutoCard
          key={key}
          pergunta={p}
          decisaoUsuario={decisao}
          autoResposta={auto}
          onChangeNA={(na) =>
            setRespostasAuto((prev) => ({ ...prev, [key]: { ...decisao, na } }))
          }
          onChangeJustificativa={(j) =>
            setRespostasAuto((prev) => ({ ...prev, [key]: { ...decisao, justificativa: j } }))
          }
        />
      );
    })}

    <FluxoNotaFinalCard
      titulo={papel === "aprovador" ? "Nota final do Aprovador" : "Nota final da Auditoria"}
      notaEfetiva={notaEfetiva}
      notaMaxima={notaMaxima}
      destinoTexto={
        papel === "aprovador"
          ? `Ao aprovar, nota será gravada para o executor`
          : `Ao confirmar, nota do aprovador será gravada para: ${assignment?.aprovador?.nome ?? "—"}`
      }
    />
  </div>
)}
```

---

## INTEGRAÇÃO COM AS RPCs (passar notas no payload)

### Aprovador (no `FluxoAprovadorPanel.handleAprovar`)

```ts
// Validar justificativas N/A antes de enviar
for (const p of perguntasAprovador) {
  const key = p.tempId ?? p.id ?? p.pergunta;
  const r = respostasAuto[key];
  if (r?.na && !r?.justificativa?.trim()) {
    toast.error(`Justificativa obrigatória para N/A em: "${p.pergunta}"`);
    return;
  }
}

await actions.aprovarParaAuditoria.mutateAsync({
  assignmentId,
  notas: {
    nota_efetiva: notaEfetivaAprovador,
    nota_maxima: notaMaximaAprovador,
    respostas: perguntasAprovador.map((p) => {
      const key = p.tempId ?? p.id ?? p.pergunta;
      const r = respostasAuto[key] ?? { na: false };
      const auto = calcRespostaExecutor(p.metrica_calculo ?? "manual");
      return {
        pergunta_id: key,
        pergunta: p.pergunta,
        metrica: p.metrica_calculo,
        peso: p.peso,
        auto_resposta: auto.resposta,
        auto_tira_ponto: auto.tiraPonto,
        na: r.na,
        justificativa: r.justificativa ?? null,
      };
    }),
  },
});
```

### Auditor (mesmo padrão em `FluxoAuditorPanel.handleFinalizar`)

```ts
await actions.aprovarAuditoria.mutateAsync({
  assignmentId,
  notas: {
    nota_efetiva: notaEfetivaAuditor,
    nota_maxima: notaMaximaAuditor,
    respostas: /* mesma estrutura, com calcRespostaAuditor */,
  },
});
```

A RPC `tarefas_rpc_aprovador_aprovar_para_auditoria` já aceita `p_notas JSONB` e grava em `operational_audit_trail.dados_novos.notas`. Idem para `tarefas_rpc_auditor_aprovar_auditoria`.

**Bônus (se desejar):** após a RPC, opcionalmente persistir `score_aprovacao` / `score_auditor` em `operational_assignments` via UPDATE separado, mantendo compatibilidade com a feature de scoring que já existe.

---

## TESTES MANUAIS DE VALIDAÇÃO

1. **Template sem perguntas auto** → bloco "Avaliação automática" não aparece nos painéis.
2. **Template com 3 perguntas (peso 30/25/20)** + aprovador devolveu 1 vez → métrica `aprovador_reabriu_tarefa` tira 25 pts → nota final = 50 pts.
3. **Marcar N/A em uma pergunta tira_ponto sem justificativa** → submit bloqueado por toast.
4. **Marcar N/A com justificativa** → nota mantida.
5. **Confirmar aprovação** → registro em `operational_audit_trail` com `dados_novos.notas` contendo nota_efetiva, nota_maxima e array de respostas.
6. **Status muda para `aguardando_auditoria`** (RPC fez isso automaticamente).

---

## REGRAS DO PROJETO (NAVEGAI)

Seguir obrigatoriamente:

- **Regra 0.7 — Verdade única:** não criar arquivo paralelo. Funções de métrica vivem em UM único service.
- **Regra 0.2 — Confirmar antes de executar:** explicar o que entendeu e listar arquivos antes de codar.
- **Padrão de nomes:** `tarefas_<verboOuSubstantivo>.ts(x)`, snake_case com prefixo `tarefas_`.
- **Não tocar:** RPCs de banco (já estão certas), tabelas, painéis legados `@deprecated`.
- **Migration de banco:** ZERO. Só frontend.

---

## ENTREGA ESPERADA

1. 4 arquivos novos em `src/modules/tarefas/fluxo/` (1 service + 2 componentes + 1 hook).
2. 2 arquivos alterados (`tarefas_fluxoAprovadorPanel.tsx`, `tarefas_fluxoAuditorPanel.tsx`).
3. Sem migration, sem RPC nova, sem trigger novo.
4. Commit único: `feat(tarefas): perguntas automáticas + nota final no painel novo`.
5. Push em `origin/main`.

Critério de aceitação: abrir tarefa em status `aguardando_aprovacao` (modo aprovador) e em `aguardando_auditoria` (modo auditor) — em ambas deve aparecer o bloco "Avaliação automática" com cores corretas, N/A funcional, e card "Nota final" com soma certa.

---

*Comando gerado em 2026-05-21. Origem: rebuild commits e6b50c44..f43586ef. Base do código antigo: `src/modules/tarefas/components/tarefas_embeddedActionPanels.tsx` linhas 451–614 (aprovador) e 1729–1829 (auditor).*
