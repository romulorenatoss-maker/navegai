/**
 * propostasInputSimplificado — converte texto livre estilo
 *   [item] câmera
 *   [descricao] dome
 *   [valor] 300
 *   [qtd] 4
 * em linhas de tabela. Suporta múltiplos blocos separados por linha em branco.
 */

export type LinhaTabelaSimples = Record<string, string | number>;

const TAG_RX = /^\s*\[([a-zA-Z0-9_]+)\]\s*(.*)$/;

export function parseInputSimplificado(texto: string): LinhaTabelaSimples[] {
  const linhas: LinhaTabelaSimples[] = [];
  const blocos = texto.split(/\n\s*\n/);

  for (const bloco of blocos) {
    const obj: LinhaTabelaSimples = {};
    let temAlgo = false;
    for (const ln of bloco.split("\n")) {
      const m = ln.match(TAG_RX);
      if (!m) continue;
      const chave = m[1].toLowerCase();
      const valor = m[2].trim();
      if (!valor) continue;
      // Tenta numérico para qtd/valor
      if (chave === "qtd" || chave === "quantidade" || chave === "valor" || chave === "preco") {
        const n = Number(valor.replace(",", "."));
        obj[chave === "preco" ? "valor" : chave === "quantidade" ? "qtd" : chave] = isNaN(n) ? valor : n;
      } else {
        obj[chave] = valor;
      }
      temAlgo = true;
    }
    if (temAlgo) linhas.push(obj);
  }
  return linhas;
}
