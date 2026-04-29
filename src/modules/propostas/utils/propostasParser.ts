/**
 * propostasParser — extrai {placeholders} de um HTML e converte texto puro em nós TipTap.
 */

const PLACEHOLDER_RX = /\{([a-zA-Z0-9_.]+)\}/g;

export interface CampoDetectado {
  chave: string;
  ocorrencias: number;
}

export function detectarPlaceholders(html: string): CampoDetectado[] {
  const map = new Map<string, number>();
  let m: RegExpExecArray | null;
  while ((m = PLACEHOLDER_RX.exec(html)) !== null) {
    map.set(m[1], (map.get(m[1]) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([chave, ocorrencias]) => ({ chave, ocorrencias }));
}

/**
 * Substitui {chave} por valores fornecidos, preservando HTML.
 * Placeholders sem valor permanecem (para limpeza posterior).
 */
export function substituirPlaceholders(html: string, valores: Record<string, string | number>): string {
  return html.replace(PLACEHOLDER_RX, (full, chave: string) => {
    if (chave in valores) {
      const v = valores[chave];
      return v === null || v === undefined ? "" : String(v);
    }
    return full;
  });
}

/**
 * Converte HTML bruto importado (mammoth) em HTML compatível com nosso editor:
 * - Marca {chave} como spans de placeholder (data-propostas-placeholder).
 */
export function prepararHtmlParaEditor(html: string): string {
  return html.replace(PLACEHOLDER_RX, (_full, chave: string) => {
    return `<span data-propostas-placeholder="true" data-chave="${chave}">{${chave}}</span>`;
  });
}
