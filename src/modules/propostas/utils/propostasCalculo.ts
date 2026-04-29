import type { PropostasTipoCalculo } from "../services/propostasService";

export interface ItemCalculado {
  produto_id?: string;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  valor_total: number;
  tipo_calculo: PropostasTipoCalculo;
  gb?: number;
}

/**
 * Calcula valor de um item conforme tipo_calculo.
 * - quantidade: qtd * unitário
 * - gb_total: gb * unitário (gb representa GB total contratado)
 * - gb_por_unidade: qtd * gb * unitário
 */
export function calcularItem(input: Omit<ItemCalculado, "valor_total">): ItemCalculado {
  let total = 0;
  switch (input.tipo_calculo) {
    case "quantidade":
      total = input.quantidade * input.valor_unitario;
      break;
    case "gb_total":
      total = (input.gb ?? 0) * input.valor_unitario;
      break;
    case "gb_por_unidade":
      total = input.quantidade * (input.gb ?? 0) * input.valor_unitario;
      break;
  }
  return { ...input, valor_total: Number(total.toFixed(2)) };
}

export function calcularTotal(itens: ItemCalculado[]): number {
  return Number(itens.reduce((acc, i) => acc + i.valor_total, 0).toFixed(2));
}

export function formatarBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/**
 * Decide a forma da tabela com base nos itens.
 * - Se algum item tem GB (gb_total / gb_por_unidade), inclui coluna GB.
 */
export function colunasTabela(itens: ItemCalculado[]): string[] {
  const temGb = itens.some(i => i.tipo_calculo !== "quantidade");
  return temGb
    ? ["Produto", "Qtd", "GB", "Valor Unit.", "Valor Total"]
    : ["Produto", "Qtd", "Valor Unit.", "Valor Total"];
}

/** Renderiza tabela HTML dinâmica (usada no preview e no documento gerado). */
export function renderTabelaHtml(itens: ItemCalculado[]): string {
  const cols = colunasTabela(itens);
  const temGb = cols.includes("GB");
  const head = `<tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr>`;
  const body = itens.map(i => {
    const cells = [
      `<td>${escapeHtml(i.descricao)}</td>`,
      `<td style="text-align:center">${i.quantidade} ${escapeHtml(i.unidade)}</td>`,
      ...(temGb ? [`<td style="text-align:center">${i.gb ?? "—"}</td>`] : []),
      `<td style="text-align:right">${formatarBRL(i.valor_unitario)}</td>`,
      `<td style="text-align:right"><strong>${formatarBRL(i.valor_total)}</strong></td>`,
    ];
    return `<tr>${cells.join("")}</tr>`;
  }).join("");
  const total = calcularTotal(itens);
  const colspan = cols.length - 1;
  const totalRow = `<tr><td colspan="${colspan}" style="text-align:right"><strong>Total</strong></td><td style="text-align:right"><strong>${formatarBRL(total)}</strong></td></tr>`;
  return `<table class="propostas-table"><thead>${head}</thead><tbody>${body}${totalRow}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
