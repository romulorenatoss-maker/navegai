# Propostas — Render v2 FIX

> Ajustes finais para garantir consistência total entre **catálogo de produtos**, **itens da proposta**, **IA conversacional** e **render DOCX**.
> Escopo isolado ao módulo `propostas`. Nenhum outro módulo foi modificado. Nenhuma UI foi alterada.

---

## 1. Banco — `propostas_itens.produto_id`

A coluna **já existia** com FK para `propostas_produtos(id)` (`ON DELETE SET NULL`).
Foram acrescentadas as garantias de integridade que faltavam:

- **Trigger `trg_propostas_itens_enforce_produto`** (`BEFORE INSERT/UPDATE`):
  - Bloqueia `produto_id` inexistente → `RAISE EXCEPTION`.
  - Bloqueia uso de produto **inativo**.
  - **Herda** `categoria` do produto se o item não trouxer.
  - **Herda** `cobranca` do produto se o item veio com o default (`mensal`) e o produto define outro.
- **Índice** `idx_propostas_itens_produto_id` para acelerar agrupamento por produto no render.

> Itens manuais legados (`produto_id NULL`) continuam sendo aceitos para retrocompatibilidade.
> Novos itens vindos da IA passam pelo enforcement do edge function (item 5).

---

## 2. Padronização de `campo_template`

- **Índice único parcial** `uq_propostas_produtos_campo_template_ativo`:
  - `UNIQUE (lower(campo_template)) WHERE campo_template IS NOT NULL AND ativo = true`.
  - Garante 1 produto ativo por token, **case-insensitive**.
  - Permite múltiplos produtos sem `campo_template` (NULL).
- **Render** (`propostas-render-docx`):
  - `campo_template` é normalizado com `trim().toLowerCase()` antes de virar chave do contexto, alinhando com o índice.
  - Itens com mesmo `campo_template` são **somados** (quantidade) ou **agregados** (lista) — nunca duplicados.

---

## 3. Boolean (checkbox) com guarda real

No renderer `propostas-render-docx`:

```ts
if (tipo === "boolean") {
  // Só marca "X" se existir item real com quantidade > 0
  if (qtd > 0) tokensProduto[k] = "X";
  else if (!(k in tokensProduto)) tokensProduto[k] = "";
}
```

- Sem item ⇒ token vazio (`""`) — checkbox não marca.
- Item presente com `quantidade ≥ 1` ⇒ `"X"`.
- Múltiplos itens com mesmo `campo_template` ⇒ continua `"X"` (booleano não é cumulativo).

---

## 4. Bloco dinâmico por categoria

O contrato do template DOCX exige:

```
{#infraestrutura}
  | {nome} | {qtd} | {valor_fmt} | {valor_total_fmt} |
{/infraestrutura}
```

Regras enforçadas no render:
- Linhas de tabela com placeholders **devem** estar dentro de `{#categoria}…{/categoria}` — caso contrário o `docxtemplater` repete só o bloco que está envolvido pela tag.
- O renderer fornece **arrays já agrupados** para as 4 categorias canônicas: `infraestrutura`, `dados`, `seguranca`, `telefonia`. Itens fora dessas categorias são ignorados pelo bloco (mas continuam contando nos `totais`).
- Cada item no array recebe os tokens: `nome`, `quantidade`/`qtd`, `valor`, `valor_fmt`, `valor_total`, `valor_total_fmt`, `cobranca`.

> Recomendação para os templates: a linha inteira da tabela (`<w:tr>…</w:tr>`) deve estar entre `{#categoria}` e `{/categoria}` para que o Word repita a row completa.

---

## 5. IA conversacional — `propostas-conversacional`

Mudanças no contrato `add_item`:

```jsonc
{
  "type": "add_item",
  "item": {
    "produto_id": "<uuid do catálogo>",   // OBRIGATÓRIO
    "nome": "Switch 24P",
    "quantidade": 1,
    "valor": 1300,
    "categoria": "infraestrutura",
    "cobranca": "implantacao"
  }
}
```

Reforços server-side aplicados **após** a resposta da IA:

1. O catálogo enviado no prompt agora inclui `id`, `campo_template` e `tipo_input` de cada produto.
2. Toda action `add_item` é resolvida contra o catálogo:
   - **Por `produto_id`** (preferido).
   - **Por `nome` normalizado** (fallback).
   - Se nenhum produto bater ⇒ a action é **descartada** e logada (`add_item bloqueado (produto fora do catálogo)`).
3. Itens aprovados são **enriquecidos** com `categoria`, `cobranca`, `campo_template` e `tipo_input` canônicos do produto — a IA **não decide** essas chaves.
4. Anti-duplicata mantido: itens já presentes no `estado.itens` são filtrados.

Resultado: a IA nunca cria nome livre. Sempre opera sobre o catálogo.

---

## 6. `campo_token` (contexto da pergunta)

- **Banco**: `propostas_perguntas_setup.campo_token` foi promovido a `NOT NULL` (somente se não havia registros nulos — operação idempotente, segura).
- **Render**: o token `{contexto}` agora é **obrigatório** no payload do `propostas-render-docx`.
  Se vier vazio, a função responde `400` com `"contexto obrigatório"`.

---

## ANALISE_TECNICA

### Garantias após este FIX
- Produto referenciado em `propostas_itens` **sempre existe e está ativo**.
- Categoria e cobrança no item **nunca divergem** do produto-mãe.
- `campo_template` é **único** por produto ativo, garantindo agrupamento previsível.
- Boolean **nunca marca "X"** sem item real associado.
- IA **não inventa** produtos — só seleciona do catálogo.
- Render DOCX **falha cedo** (400) se faltar contexto, em vez de gerar proposta incompleta.

### Pontos abertos (não tratados nesta etapa)
- **Migração HTML→DOCX**: templates legados continuam funcionando via fluxo HTML; não há conversor automático.
- **PDF**: adiado conforme decisão anterior. O renderer expõe `signedUrl` do `.docx`.
- **Itens manuais com `produto_id NULL`**: ainda permitidos para retrocompatibilidade. Sugere-se UI futura para sinalizar e oferecer cadastro.
- **Validação de bloco dinâmico no template**: feita pelo `docxtemplater` em runtime (erros caem em `template_errors`); não há lint estático prévio.
