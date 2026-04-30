# Refator de Placeholders — Estrutura por Origem de Dados

> Refator do sistema de placeholders das propostas para um modelo estruturado por
> origem de dados (cliente / responsável / perguntas / sistema), com loop aninhado
> de categorias→itens e snapshot do payload renderizado.
>
> **Bloco de proteção respeitado:** funcionalidades existentes preservadas, templates
> antigos continuam renderizando (compat dupla), nenhuma duplicidade de fontes
> de dados criada, lógica de produtos intocada.

---

## ✅ Decisões aplicadas (confirmadas pelo usuário)

| Tema | Decisão |
|---|---|
| Responsáveis vs Contatos | `cliente_responsaveis` **sem** email/telefone, com FK para `cliente_contatos` |
| Loops aninhados | Apenas 2 níveis fixos: `{#categorias}{#itens}{/itens}{/categorias}` |
| Tokens legados | **Compat dupla** no payload (categorias[] + itens_infra/dados/seguranca/telefonia) |
| UI antiga | **Não removida** — nova tela criada em paralelo |

---

## 🧱 Banco de dados — migração aprovada

### Tabela criada
- **`cliente_responsaveis`**
  - `id uuid PK default gen_random_uuid()`
  - `cliente_id uuid NOT NULL → clientes.id (ON DELETE CASCADE)`
  - `contato_id uuid → cliente_contatos.id (ON DELETE SET NULL)`  ← single source of truth
  - `nome text NOT NULL`
  - `cargo text`
  - `principal boolean NOT NULL DEFAULT false`
  - `created_at`, `updated_at` (com trigger `update_updated_at_column`)
  - Index único parcial: 1 principal por cliente
  - Index `idx_cliente_responsaveis_cliente`
  - RLS: `authenticated` pode SELECT/INSERT/UPDATE/DELETE

### Coluna adicionada
- **`propostas_propostas.responsavel_id`** uuid → `cliente_responsaveis.id` (ON DELETE SET NULL)
- Index `idx_propostas_propostas_responsavel`

### O que **NÃO** foi alterado
- `cliente_contatos` (mantida intocada — continua sendo a fonte de email/telefone)
- `propostas_itens` / `propostas_produtos` (intocadas)
- Estrutura existente de `propostas_templates`

---

## 🧠 Estrutura do payload de render (novo padrão)

```ts
{
  cliente: {
    nome, cpf, cnpj, email, telefone, endereco, cidade
  },
  responsavel: {
    nome, cargo, email, telefone     // hidratados via cliente_contatos
  },
  perguntas: { /* spread de respostas */ },
  categorias: [
    {
      codigo: "infraestrutura",
      nome: "Infraestrutura",
      itens: [{ nome, quantidade, valor_unitario, valor_total, total_item, cobranca }],
      subtotal: "R$ ...",
      subtotal_numero: 12345
    }
    /* ... uma entrada por categoria PRESENTE nos itens */
  ],
  totais: {
    total_geral, total_geral_numero,
    implantacao, mensal, informativo
  }
}
```

### Compat dupla (mantida no payload)
- `cliente_nome`, `cliente_cnpj`, `cliente_email`, `cliente_telefone`, …
- `responsavel_nome`, `responsavel_cargo`, `responsavel_email`, `responsavel_telefone`
- `valor_total`, `total_geral`, `valor_implantacao`, `valor_mensal`
- `itens_infra`, `itens_dados`, `itens_seguranca`, `itens_telefonia`, `itens_cloud`

---

## 🔁 Engine de template (`propostasRenderizarTemplate`)

### Suporte adicionado
1. **Acesso aninhado** em tokens: `{cliente.nome}`, `{responsavel.cargo}`, `{totais.total_geral}`
2. **Loop fixo 2 níveis**:
   ```
   {#categorias}
     {nome}
     {#itens}
       {nome} - {quantidade} - {valor_total}
     {/itens}
     Subtotal: {subtotal}
   {/categorias}
   ```
3. **Fallback automático legado** — se template usa `{cliente_nome}` mas o payload tem `cliente.nome`, o engine resolve sozinho via `aplicarFallbacksLegados()`.
4. **Loops simples** (`{#chave}…{/chave}`) preservados para `itens_infra`, `itens_dados`, etc.

### O que **NÃO** mudou
- Substituição de `<span data-token="x">` continua igual
- Substituição de `<span data-propostas-placeholder>` continua igual
- Tokens não preenchidos continuam visíveis (`{x}` permanece) para o usuário identificar lacunas
- Função `detectarTokens` inalterada

---

## 💾 Snapshot

Ao gerar a proposta, o **payload estruturado completo** é persistido em
`propostas_propostas.snapshot_render` (jsonb), junto com `data_render` e
`template_versao`. Não persiste mais `responsavel_id` automaticamente — só
quando a UI permitir escolha explícita (a UI nova já carrega o principal,
mas a persistência ainda é manual).

---

## 📺 Front — nova tela em paralelo

### Adicionada
- **`PropostaDadosRenderPage`** em `/propostas/dados-render`
  - 4 abas: **Cliente** · **Responsável** · **Perguntas** · **Sistema**
  - Cliente: somente leitura, mostra nome/CPF/cidade + email/telefone vindos de `cliente_contatos`
  - Responsável: lista com radio para selecionar, marcar principal, criar/excluir
    - Form de novo responsável com select de `cliente_contatos` para o vínculo (zero duplicidade)
  - Perguntas: visualiza estrutura das perguntas configuradas e seus tokens
  - Sistema: mostra `totais.total_geral` e exemplo de uso de `{#categorias}{#itens}`

### Mantidas (não removidas)
- `PropostaSetupPage` (`/propostas/setup`)
- `PropostasPerguntasPage` (`/propostas/perguntas`)
- `PropostaPlaceholderModal`, `PropostasPlaceholderExtension`, `usePlaceholderData`
- `PropostaConversacionalPage` (`/propostas/conversa`) — continua sendo a tela principal

---

## 📁 Arquivos alterados

| Arquivo | Tipo | Resumo |
|---|---|---|
| `src/modules/propostas/utils/propostasRender.ts` | **modificado** | Adicionado: `resolverPath`, `aplicarFallbacksLegados`, `expandirLoopCategoriasItens`. Mantido: spans, tokens texto, loop simples |
| `src/modules/propostas/services/propostasResponsaveisService.ts` | **novo** | CRUD de responsáveis + hidratação de contato |
| `src/modules/propostas/pages/PropostaConversacionalPage.tsx` | **modificado** | `gerarProposta()`: payload estruturado + snapshot + responsável principal |
| `src/modules/propostas/pages/PropostaDadosRenderPage.tsx` | **novo** | Nova UI com abas |
| `src/App.tsx` | **modificado** | Rota `/propostas/dados-render` registrada |

### Banco
- Migração: tabela `cliente_responsaveis` + coluna `propostas_propostas.responsavel_id`

---

## 🚫 Lógica REMOVIDA

> **Nenhuma.** Por decisão explícita do usuário, a UI antiga continua acessível e
> os tokens planos continuam funcionando. Esta é uma adição não-destrutiva.

---

## 🧾 Template padrão recomendado (referência)

```html
<h1>Proposta para {cliente.nome}</h1>
<p>Cidade: {cliente.cidade}</p>
<p>A/C {responsavel.nome} — {responsavel.cargo}</p>
<p>Contato: {responsavel.email} · {responsavel.telefone}</p>

{#categorias}
  <h2>{nome}</h2>
  <table>
    <thead><tr><th>Item</th><th>Qtd</th><th>Total</th></tr></thead>
    <tbody>
      {#itens}
        <tr><td>{nome}</td><td>{quantidade}</td><td>{valor_total}</td></tr>
      {/itens}
    </tbody>
  </table>
  <p><strong>Subtotal:</strong> {subtotal}</p>
{/categorias}

<h2>Total Geral: {totais.total_geral}</h2>
```

Templates antigos com `{cliente_nome}` e `{#itens_infra}` continuam funcionando
sem alteração.
