/** Produto que vendeu nos meses anteriores e ainda não vendeu no mês atual. */
export interface ProdutoVenda { codigo: string; descricao: string; barras: string; departamento: string; venda: number; volume: number }
export interface ProdutoParado extends ProdutoVenda { mesesComVenda: number }

/** Compara a venda dos meses de referência com o mês atual e agrupa por departamento. */
export function produtosSemVenda(referencia: ProdutoVenda[][], atual: ProdutoVenda[]): Map<string, ProdutoParado[]> {
  const vendeuAgora = new Set(atual.filter((p) => p.venda > 0 || p.volume > 0).map((p) => p.codigo));
  const base = new Map<string, ProdutoParado>();
  for (const mes of referencia) {
    const noMes = new Set<string>();
    for (const p of mes) {
      if (!(p.venda > 0 || p.volume > 0) || vendeuAgora.has(p.codigo)) continue;
      const cur = base.get(p.codigo) ?? { ...p, venda: 0, volume: 0, mesesComVenda: 0 };
      cur.venda += p.venda; cur.volume += p.volume;
      if (!noMes.has(p.codigo)) { cur.mesesComVenda += 1; noMes.add(p.codigo); }
      if (!cur.departamento && p.departamento) cur.departamento = p.departamento;
      base.set(p.codigo, cur);
    }
  }
  const grupos = new Map<string, ProdutoParado[]>();
  for (const p of base.values()) {
    const d = p.departamento || "SEM DEPARTAMENTO";
    grupos.set(d, [...(grupos.get(d) ?? []), p]);
  }
  for (const l of grupos.values()) l.sort((a, b) => b.venda - a.venda);
  return new Map([...grupos.entries()].sort((a, b) => b[1].length - a[1].length));
}
