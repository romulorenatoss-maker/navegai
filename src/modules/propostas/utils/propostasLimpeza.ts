/**
 * propostasLimpeza — pós-processamento do HTML de uma proposta gerada:
 * - remove placeholders vazios
 * - remove parágrafos/seções vazios
 * - normaliza espaçamento múltiplo
 */

const PLACEHOLDER_SPAN_RX = /<span[^>]*data-propostas-placeholder[^>]*>\{[^}]+\}<\/span>/g;
const PLACEHOLDER_TXT_RX = /\{[a-zA-Z0-9_.]+\}/g;

export function limparHtmlFinal(html: string): string {
  let out = html;
  // 1. remover placeholders ainda não substituídos
  out = out.replace(PLACEHOLDER_SPAN_RX, "");
  out = out.replace(PLACEHOLDER_TXT_RX, "");
  // 2. parágrafos vazios
  out = out.replace(/<p[^>]*>(\s|&nbsp;)*<\/p>/g, "");
  // 3. headings vazios
  out = out.replace(/<h[1-6][^>]*>(\s|&nbsp;)*<\/h[1-6]>/g, "");
  // 4. múltiplos <br>
  out = out.replace(/(<br\s*\/?>\s*){3,}/g, "<br><br>");
  // 5. espaços duplicados
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}
