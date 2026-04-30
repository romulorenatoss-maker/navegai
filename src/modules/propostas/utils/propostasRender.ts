/**
 * propostasRender — renderização DETERMINÍSTICA do template.
 *
 * Regras (CRÍTICO):
 *  - A IA NUNCA gera HTML completo.
 *  - O template é a fonte da verdade do layout.
 *  - Esta função apenas SUBSTITUI:
 *      • <span data-token="x">…</span>      → valor do token "x"
 *      • {x}                                 → valor do token "x" (compat plano)
 *      • {x.y}                               → valor de dados.x.y (acesso aninhado, ex.: cliente.nome)
 *      • <span data-propostas-placeholder>   → valor (compat parser antigo)
 *      • {#chave}…{/chave}                   → loop simples (1 nível)
 *      • {#categorias}…{#itens}…{/itens}…{/categorias} → loop aninhado 2 níveis FIXO
 *  - Fallback de tokens legados:
 *      {cliente_nome}, {cliente_cnpj}, {cliente_email}, ... → mapeados para cliente.*
 *      {responsavel_nome}, {responsavel_email}, ...        → mapeados para responsavel.*
 *  - Tokens não preenchidos: span vira "" e {x} permanece visível para o usuário identificar lacuna.
 */

const TOKEN_RX = /\{([a-zA-Z0-9_.]+)\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renderiza valor: string/number → escapado; HTML pré-formatado (começa com '<') passa direto. */
function renderValor(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.startsWith("<")) return v; // HTML já renderizado (ex: tabela)
    return escapeHtml(v).replace(/\n/g, "<br/>");
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  return escapeHtml(String(v));
}

/** Resolve "a.b.c" em um objeto aninhado. Retorna undefined se qualquer trecho faltar. */
function resolverPath(dados: Record<string, unknown>, path: string): unknown {
  const partes = path.split(".");
  let atual: unknown = dados;
  for (const p of partes) {
    if (atual === null || atual === undefined) return undefined;
    if (typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[p];
  }
  return atual;
}

/**
 * Mapeia tokens legados (planos) para suas contrapartidas estruturadas.
 * Garante compatibilidade reversa com templates como {cliente_nome}.
 */
function aplicarFallbacksLegados(
  dados: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...dados };

  const cliente = (dados.cliente && typeof dados.cliente === "object")
    ? dados.cliente as Record<string, unknown>
    : null;
  const responsavel = (dados.responsavel && typeof dados.responsavel === "object")
    ? dados.responsavel as Record<string, unknown>
    : null;
  const totais = (dados.totais && typeof dados.totais === "object")
    ? dados.totais as Record<string, unknown>
    : null;

  // cliente_*
  if (cliente) {
    if (out.cliente_nome === undefined && cliente.nome !== undefined) out.cliente_nome = cliente.nome;
    if (out.cliente_cnpj === undefined && cliente.cnpj !== undefined) out.cliente_cnpj = cliente.cnpj;
    if (out.cliente_cpf === undefined && cliente.cpf !== undefined) out.cliente_cpf = cliente.cpf;
    if (out.cliente_email === undefined && cliente.email !== undefined) out.cliente_email = cliente.email;
    if (out.cliente_telefone === undefined && cliente.telefone !== undefined) out.cliente_telefone = cliente.telefone;
    if (out.cliente_endereco === undefined && cliente.endereco !== undefined) out.cliente_endereco = cliente.endereco;
    if (out.cliente_cidade === undefined && cliente.cidade !== undefined) out.cliente_cidade = cliente.cidade;
  }

  // responsavel_*
  if (responsavel) {
    if (out.responsavel_nome === undefined && responsavel.nome !== undefined) out.responsavel_nome = responsavel.nome;
    if (out.responsavel_email === undefined && responsavel.email !== undefined) out.responsavel_email = responsavel.email;
    if (out.responsavel_telefone === undefined && responsavel.telefone !== undefined) out.responsavel_telefone = responsavel.telefone;
    if (out.responsavel_cargo === undefined && responsavel.cargo !== undefined) out.responsavel_cargo = responsavel.cargo;
  }

  // totais.*
  if (totais) {
    if (out.total_geral === undefined && totais.total_geral !== undefined) out.total_geral = totais.total_geral;
    if (out.valor_total === undefined && totais.total_geral !== undefined) out.valor_total = totais.total_geral;
    if (out.valor_implantacao === undefined && totais.implantacao !== undefined) out.valor_implantacao = totais.implantacao;
    if (out.valor_mensal === undefined && totais.mensal !== undefined) out.valor_mensal = totais.mensal;
  }

  return out;
}

/**
 * Substitui spans <span data-token="x">…</span> pelo valor de dados[x] (suporta x.y.z).
 */
function substituirSpans(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /<span\b[^>]*\bdata-token=["']([a-zA-Z0-9_.]+)["'][^>]*>[\s\S]*?<\/span>/g,
    (full, chave: string) => {
      const v = resolverPath(dados, chave);
      if (v === undefined) return full;
      return `<span data-token="${escapeHtml(chave)}">${renderValor(v)}</span>`;
    }
  );
}

/** Compat: <span data-propostas-placeholder data-chave="x">{x}</span>. */
function substituirSpansLegacy(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /<span\b[^>]*\bdata-propostas-placeholder[^>]*\bdata-chave=["']([a-zA-Z0-9_.]+)["'][^>]*>[\s\S]*?<\/span>/g,
    (full, chave: string) => {
      const v = resolverPath(dados, chave);
      if (v === undefined) return full;
      return `<span data-propostas-placeholder="true" data-chave="${escapeHtml(chave)}">${renderValor(v)}</span>`;
    }
  );
}

/** Substitui {token} fora de spans (compat). Suporta paths aninhados (cliente.nome). */
function substituirTokensTexto(html: string, dados: Record<string, unknown>): string {
  return html.replace(TOKEN_RX, (full, chave: string) => {
    const v = resolverPath(dados, chave);
    if (v === undefined) return full; // mantém visível
    return renderValor(v);
  });
}

/**
 * Loop ANINHADO FIXO 2 níveis: {#categorias}…{#itens}…{/itens}…{/categorias}
 * - dados.categorias deve ser Array<{ nome, subtotal, itens: [...] }>
 * - O bloco interno {#itens}…{/itens} é repetido para cada item da categoria atual,
 *   com tokens locais do item ({nome}, {quantidade}, {valor_total}, etc).
 * - Tokens da categoria ({nome}, {subtotal}) também são substituídos no escopo da categoria.
 * - Pais externos ainda são processados pelo loop simples padrão.
 */
function expandirLoopCategoriasItens(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /\{#categorias\}([\s\S]*?)\{\/categorias\}/g,
    (_full, blocoCategoria: string) => {
      const lista = dados.categorias;
      if (!Array.isArray(lista) || lista.length === 0) return "";
      return lista
        .map((cat) => {
          const catObj = (cat && typeof cat === "object" ? cat : {}) as Record<string, unknown>;
          // 1) Expande {#itens}…{/itens} dentro do bloco da categoria
          let saida = blocoCategoria.replace(
            /\{#itens\}([\s\S]*?)\{\/itens\}/g,
            (_f2, blocoItem: string) => {
              const itens = catObj.itens;
              if (!Array.isArray(itens) || itens.length === 0) return "";
              return itens
                .map((it) => {
                  const itemObj = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
                  return blocoItem.replace(TOKEN_RX, (full, k: string) => {
                    const v = resolverPath(itemObj, k);
                    if (v === undefined) return full;
                    return renderValor(v);
                  });
                })
                .join("");
            },
          );
          // 2) Substitui tokens da categoria no restante do bloco (fora dos itens)
          saida = saida.replace(TOKEN_RX, (full, k: string) => {
            const v = resolverPath(catObj, k);
            if (v === undefined) return full;
            return renderValor(v);
          });
          return saida;
        })
        .join("");
    },
  );
}

/**
 * Loop simples 1 nível: {#chave} ... {/chave}
 * (mantido para compat: itens_infra, itens_dados, etc.)
 * NÃO se aplica a {#categorias} (já consumido por expandirLoopCategoriasItens).
 */
function expandirLoopsSimples(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /\{#([a-zA-Z0-9_]+)\}([\s\S]*?)\{\/\1\}/g,
    (_full, chave: string, bloco: string) => {
      if (chave === "categorias" || chave === "itens") return _full; // já tratados
      const lista = resolverPath(dados, chave);
      if (!Array.isArray(lista) || lista.length === 0) return "";
      return lista
        .map((item) => {
          const itemDados = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          return bloco.replace(TOKEN_RX, (full, k: string) => {
            const v = resolverPath(itemDados, k);
            if (v === undefined) return full;
            return renderValor(v);
          });
        })
        .join("");
    },
  );
}

/**
 * propostas_renderizar_template — função pública canônica.
 * Mantém 100% do layout original (estilos, alinhamento, cores, tabelas).
 */
export function propostasRenderizarTemplate(
  templateHtml: string,
  dados: Record<string, unknown>,
): string {
  if (!templateHtml) return "";
  // Aplica fallbacks legados (cliente_nome → cliente.nome, etc.) ANTES de substituir
  const dadosFinais = aplicarFallbacksLegados(dados);
  let out = templateHtml;
  // 1) Loop aninhado fixo categorias→itens (tem prioridade)
  out = expandirLoopCategoriasItens(out, dadosFinais);
  // 2) Loops simples (compat: itens_infra, itens_dados, ...)
  out = expandirLoopsSimples(out, dadosFinais);
  // 3) Spans com data-token
  out = substituirSpans(out, dadosFinais);
  // 4) Spans legados
  out = substituirSpansLegacy(out, dadosFinais);
  // 5) Tokens texto {x} e {x.y}
  out = substituirTokensTexto(out, dadosFinais);
  return out;
}

/** Detecta todos os tokens (span + {x}) presentes no template. */
export function detectarTokens(templateHtml: string): string[] {
  const set = new Set<string>();
  const rxSpan = /<span\b[^>]*\bdata-token=["']([a-zA-Z0-9_.]+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = rxSpan.exec(templateHtml)) !== null) set.add(m[1]);
  while ((m = TOKEN_RX.exec(templateHtml)) !== null) set.add(m[1]);
  return Array.from(set);
}
