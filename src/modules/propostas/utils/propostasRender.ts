/**
 * propostasRender — renderização DETERMINÍSTICA do template.
 *
 * Regras (CRÍTICO):
 *  - A IA NUNCA gera HTML completo.
 *  - O template é a fonte da verdade do layout.
 *  - Esta função apenas SUBSTITUI:
 *      • <span data-token="x">…</span>      → valor do token "x"
 *      • {x}                                 → valor do token "x" (compat)
 *      • <span data-propostas-placeholder>   → valor (compat com parser antigo)
 *  - Tokens de tabela (ex: itens_tabela) recebem HTML <table> renderizado.
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
  return escapeHtml(String(v));
}

/**
 * Substitui spans <span data-token="x">…</span> pelo valor de dados[x].
 * Se o token não existe nos dados, mantém o conteúdo atual do span (preservação).
 */
function substituirSpans(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /<span\b[^>]*\bdata-token=["']([a-zA-Z0-9_.]+)["'][^>]*>[\s\S]*?<\/span>/g,
    (full, chave: string) => {
      if (!(chave in dados)) return full;
      const v = renderValor(dados[chave]);
      return `<span data-token="${escapeHtml(chave)}">${v}</span>`;
    }
  );
}

/** Compat: <span data-propostas-placeholder data-chave="x">{x}</span>. */
function substituirSpansLegacy(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /<span\b[^>]*\bdata-propostas-placeholder[^>]*\bdata-chave=["']([a-zA-Z0-9_.]+)["'][^>]*>[\s\S]*?<\/span>/g,
    (full, chave: string) => {
      if (!(chave in dados)) return full;
      const v = renderValor(dados[chave]);
      return `<span data-propostas-placeholder="true" data-chave="${escapeHtml(chave)}">${v}</span>`;
    }
  );
}

/** Substitui {token} fora de spans (compat). */
function substituirTokensTexto(html: string, dados: Record<string, unknown>): string {
  return html.replace(TOKEN_RX, (full, chave: string) => {
    if (!(chave in dados)) return full; // mantém visível
    return renderValor(dados[chave]);
  });
}

/**
 * Suporte a loops: {#chave} ... {/chave}
 * O bloco interno é repetido para cada item do array dados[chave],
 * substituindo {campo} pelos campos do item.
 * Os marcadores podem estar dentro de qualquer estrutura HTML (ex: <tr>),
 * o regex captura tudo entre eles preservando o markup.
 */
function expandirLoops(html: string, dados: Record<string, unknown>): string {
  return html.replace(
    /\{#([a-zA-Z0-9_]+)\}([\s\S]*?)\{\/\1\}/g,
    (_full, chave: string, bloco: string) => {
      const lista = dados[chave];
      if (!Array.isArray(lista) || lista.length === 0) return "";
      return lista
        .map((item) => {
          const itemDados = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
          // Substitui apenas tokens locais do item dentro do bloco
          return bloco.replace(TOKEN_RX, (full, k: string) => {
            if (!(k in itemDados)) return full;
            return renderValor(itemDados[k]);
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
  let out = templateHtml;
  // Loops primeiro: produzem markup que ainda pode conter tokens globais
  out = expandirLoops(out, dados);
  out = substituirSpans(out, dados);
  out = substituirSpansLegacy(out, dados);
  out = substituirTokensTexto(out, dados);
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
