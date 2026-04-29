# Propostas — Render DOCX HARDENING

> Pipeline de renderização blindado: backend é a única fonte da verdade, com snapshot completo e versionamento de template.
> Escopo isolado ao módulo `propostas`. Nenhuma UI alterada.

---

## 1. Fonte dos itens — banco, não frontend

A função `propostas-render-docx` opera em **dois modos**:

| Modo | Quando | Fonte dos itens |
|------|--------|-----------------|
| **Salvo** | `proposta_id` enviado | `SELECT … FROM propostas_itens WHERE proposta_id = ?` |
| **Preview** | só `template_id` enviado (sem `proposta_id`) | `itens_preview` do payload (validados igualmente) |

Em modo salvo, **qualquer payload de itens é ignorado** — o banco manda.

---

## 2. Validação de produtos

Para cada item carregado:
- `produto_id` é obrigatório → resolvido contra `propostas_produtos`.
- Item é **rejeitado** (e listado em `itens_rejeitados`) se:
  - `produto_id` for nulo (item legado);
  - produto não existe;
  - produto está inativo.
- O `nome` usado no DOCX é o **canônico do catálogo**, nunca o que veio gravado em `propostas_itens.descricao` se diferir.
- `campo_template`, `tipo_input`, `categoria` e `cobranca_padrao` herdados do produto.

---

## 3. Cálculos no backend

Totais são **sempre recalculados** a partir dos itens validados:

```ts
for (const it of itensResolvidos) {
  const v = it.quantidade * it.valor_unitario;
  if (it.cobranca === "implantacao") totais.implantacao += v;
  else if (it.cobranca === "informativo") totais.informativo += v;
  else totais.mensal += v;
}
```

Frontend **não** consegue injetar totais. `valor_total` por item também é recalculado.

---

## 4. Contexto automático

- Se `contexto` veio preenchido no payload → usado.
- Se vazio → gerado:
  ```
  Proposta para <cliente> contemplando 3 item(ns) de infraestrutura, 2 item(ns) de dados.
  ```
- Nunca falha por contexto ausente — render sempre produz documento.

---

## 5. Cliente direto da tabela

```sql
SELECT nome FROM clientes WHERE id = <cliente_id>
```

`cliente_nome` é resolvido **server-side** a partir de `propostas_propostas.cliente_id` (modo salvo) ou do `cliente_id` do payload (modo preview). Frontend não pode mentir o nome.

---

## 6. Data da proposta

- Modo salvo: `data_hoje` e `data_proposta` ⇒ `propostas_propostas.created_at`, formatado com timezone `America/Sao_Paulo`.
- Modo preview: `new Date()` (sem proposta gravada).

Re-render de uma proposta antiga **mantém a data original** — não é regenerada.

---

## 7. `tipo_input = 'lista'` com quebra de linha

```ts
listaAcc[k] = listaAcc[k] ?? [];
listaAcc[k].push(qtd > 1 ? `${nome} (x${qtd})` : nome);
// depois:
tokensProduto[k] = arr.join("\n");
```

Combinado com `linebreaks: true` no `Docxtemplater`, cada `\n` vira `<w:br/>` no DOCX (quebra de linha real, não "Item1, Item2").

---

## 8. Ordenação determinística

Antes de agrupar, itens são ordenados por:

1. **Categoria** (ordem fixa: `infraestrutura → dados → seguranca → telefonia`).
2. **Nome** (alfabético, locale `pt-BR`, case-insensitive).

Garante DOCX idêntico em re-renders sucessivos.

---

## 9. Snapshot do render

Nova coluna **`propostas_propostas.snapshot_render`** (jsonb). Em cada render salvo, persiste:

```jsonc
{
  "rendered_at": "2026-04-29T03:42:00Z",
  "rendered_path": "rendered/<proposta_id>/<cliente>_<stamp>.docx",
  "template": { "id": "...", "nome": "...", "versao": "1@2026-04-28T22:00:00Z", "path": "..." },
  "cliente": { "id": "...", "nome": "..." },
  "contexto": "...",
  "itens": [ /* ItemResolvido[] — produto_id, nome, qtd, valor, total, categoria, cobranca, campo_template, tipo_input */ ],
  "itens_rejeitados": [ { "descricao": "...", "motivo": "..." } ],
  "totais": { "implantacao": 0, "mensal": 0, "informativo": 0 },
  "tokens_produto": { "qtd_switch": 3, "tem_firewall": "X", "lista_servicos": "A\nB" },
  "ordem": [ /* ordenação aplicada */ ]
}
```

---

## 10. Versionamento de template

- Nova coluna **`propostas_templates.versao`** (text, default `'1'`).
- Nova coluna **`propostas_propostas.template_versao`** (text) — gravada como `${versao}@${updated_at}` no momento do render.
- Nova coluna **`propostas_propostas.data_render`** (timestamptz) com o instante exato.

Mudou o template? Bumpe `versao` manualmente e re-render para auditoria.

---

## API

### Request

```jsonc
// modo salvo (recomendado)
{ "proposta_id": "<uuid>" }

// modo preview
{
  "template_id": "<uuid>",
  "cliente_id": "<uuid>",
  "contexto": "opcional",
  "itens_preview": [{ "produto_id": "...", "quantidade": 1, "valor": 1300 }]
}
```

### Response

```jsonc
{
  "ok": true,
  "path": "rendered/<id>/<cliente>_<stamp>.docx",
  "url": "https://.../signed?...",
  "bytes": 24576,
  "template_nome": "...",
  "template_versao": "1@2026-04-28T22:00:00Z",
  "itens_renderizados": 5,
  "itens_rejeitados": [],
  "totais": { "implantacao": 0, "mensal": 0, "informativo": 0 }
}
```

---

## ANALISE_TECNICA

### Garantias após hardening
- Frontend **não consegue** alterar valor, total, nome de produto, cliente, data ou contexto no DOCX final.
- Cada render gera um **snapshot auditável** persistido na proposta.
- Itens órfãos (sem `produto_id`, ou apontando para produto removido/inativo) são **rejeitados explicitamente** e listados na resposta.
- Re-render de uma proposta antiga produz um DOCX **idêntico** (data, ordem, itens, tokens).
- Versão do template fica registrada — é possível detectar quando uma proposta foi renderizada com template antigo.

### Limitações conhecidas
- Snapshot só sobrescreve o último render (não há histórico de versões em `propostas_propostas`). Para histórico, usar `propostas_historico` (já existe) com referência ao snapshot.
- `versao` do template é **manual**: depende de o admin incrementar quando faz alteração relevante. O `updated_at` no compound `versao@updated_at` cobre auto-bump em mudanças não rotuladas.
- Itens legados sem `produto_id` continuam aceitos no banco (compat), mas **não aparecem no DOCX** após hardening — aparecem em `itens_rejeitados` para que a UI possa pedir cadastro.
- PDF segue adiado conforme decisão anterior.
