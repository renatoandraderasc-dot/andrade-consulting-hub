// Regras puras do resumo diário de WhatsApp (testáveis sem banco).
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

/** Produtos vendidos com prejuízo (margem abaixo de 0%), maiores perdas primeiro. */
export function margemNegativa(ranking: Record<string, unknown>[]) {
  return ranking
    .map((r) => ({ codigo: num(r.codigo ?? r.id_produto), produto: String(r.produto ?? r.descricao ?? ""), vendas: num(r.vendas), lucro: num(r.lucro), margem: num(r.margem) }))
    .filter((r) => r.vendas > 0 && r.margem < 0)
    .sort((a, b) => a.lucro - b.lucro);
}

/** Produtos de venda diária que não aparecem nas vendas do dia. */
export function naoVendidos(lista: { codigo: number; descricao: string | null }[], ranking: Record<string, unknown>[]) {
  const vendidos = new Set(ranking.filter((r) => num(r.vendas) > 0).map((r) => num(r.codigo ?? r.id_produto)));
  return lista.filter((p) => !vendidos.has(p.codigo));
}

/** Itens da nota com custo unitário acima da última compra (tolerância de 0,5%). */
export function custoMaior(itens: { codproduto: number | null; descricao: string; custo: number }[], ultimo: Map<number, number>) {
  return itens
    .filter((i) => i.codproduto && ultimo.get(i.codproduto)! > 0 && i.custo > ultimo.get(i.codproduto)! * 1.005)
    .map((i) => ({ ...i, anterior: ultimo.get(i.codproduto!)!, alta: i.custo / ultimo.get(i.codproduto!)! - 1 }));
}

/** Produtos com venda em pelo menos `minimo` (ex.: 85%) dos dias analisados. */
export function produtosFrequentes(dias: Record<string, unknown>[][], minimo = 0.85) {
  const cont = new Map<number, { codigo: number; descricao: string; dias: number }>();
  for (const d of dias) {
    const vistos = new Set<number>();
    for (const r of d) {
      const c = num(r.codigo ?? r.id_produto);
      if (!c || num(r.vendas) <= 0 || vistos.has(c)) continue;
      vistos.add(c);
      const x = cont.get(c) ?? { codigo: c, descricao: String(r.produto ?? r.descricao ?? ""), dias: 0 };
      x.dias++; cont.set(c, x);
    }
  }
  const total = dias.length;
  if (!total) return [];
  return [...cont.values()].filter((x) => x.dias / total >= minimo).map((x) => ({ ...x, pct: x.dias / total })).sort((a, b) => b.dias - a.dias || a.codigo - b.codigo);
}
