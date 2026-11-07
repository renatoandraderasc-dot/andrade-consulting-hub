import { num, pick, type RelatorioResultado } from "@/lib/vrReport";

export interface EstoqueVendaLinha {
  codigo: string; ultimaCompra: string; qtdCompra: number; valorCompra: number;
  qtdVenda: number; valorVenda: number; progresso: number; estoqueDinamico: number;
}
const codigo = (l: unknown) => String(pick(l, "codigo", "cod", "cod_produto", "id_produto") ?? "");
const dataValida = (v: unknown): string => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : "";
};

/** A análise de entradas é a fonte de compras em unidades e datas reais, nunca primeira_compra. */
export function aplicarComprasFiltradas<T extends EstoqueVendaLinha>(linhas: T[], compras: unknown[]): T[] {
  const mapa = new Map<string, { qtd: number; valor: number; data: string }>();
  for (const l of compras) {
    const cod = codigo(l);
    if (!cod) continue;
    const cur = mapa.get(cod) ?? { qtd: 0, valor: 0, data: "" };
    cur.qtd += num(pick(l, "qtd_compra", "quantidade"));
    cur.valor += num(pick(l, "valor_compra", "valor_total"));
    const data = dataValida(pick(l, "data_entrada", "ultima_compra", "data_ultima_compra"));
    if (data > cur.data) cur.data = data;
    mapa.set(cod, cur);
  }
  return linhas.flatMap(l => {
    const c = mapa.get(l.codigo);
    if (!c) return [];
    return [{ ...l, qtdCompra: c.qtd, valorCompra: c.valor, ultimaCompra: c.data || l.ultimaCompra }];
  });
}

type Consultar = (relatorio: string, params: Record<string, unknown>) => Promise<RelatorioResultado>;
const conferir = (r: RelatorioResultado) => {
  if (r.offline || r.indisponivel || r.erro || r.aviso) throw new Error(r.erro || "Vendas desde a última entrada indisponíveis. Mantivemos os dados anteriores.");
};

export async function complementarVendasEstoque<T extends EstoqueVendaLinha>(
  linhas: T[], inicioCompras: string, fimCompras: string, d1: string, consultar: Consultar,
): Promise<T[]> {
  if (!linhas.length) return linhas;
  // Inclui novas entradas após o fim do filtro, sem adicioná-las às compras exibidas.
  const entradas = await consultar("analise_compras", { inicio: inicioCompras, fim: d1 });
  conferir(entradas);
  const ultimas = new Map<string, string>();
  for (const l of entradas.dados) {
    const data = dataValida(pick(l, "data_entrada", "ultima_compra", "data_ultima_compra"));
    const cod = codigo(l);
    if (data && data <= d1 && data > (ultimas.get(cod) ?? "")) ultimas.set(cod, data);
  }
  const grupos = new Map<string, Set<string>>();
  for (const l of linhas) {
    const data = ultimas.get(l.codigo) || (fimCompras >= d1 ? dataValida(l.ultimaCompra) : "");
    if (!data || data > d1) throw new Error(`Última entrada não disponível para o produto ${l.codigo}. Mantivemos os dados anteriores.`);
    const codigos = grupos.get(data) ?? new Set<string>();
    codigos.add(l.codigo); grupos.set(data, codigos);
  }
  const vendas = new Map<string, { qtd: number; valor: number; data: string }>();
  for (const [inicio, codigos] of grupos) {
    const r = await consultar("ranking_produtos", { inicio, fim: d1, limite: 200000 });
    conferir(r);
    // Uma resposta possivelmente truncada não comprova ausência de vendas.
    if (r.dados.length >= 200000) throw new Error("Relatório de vendas incompleto. Mantivemos os dados anteriores.");
    for (const cod of codigos) vendas.set(cod, { qtd: 0, valor: 0, data: inicio });
    for (const l of r.dados) {
      const v = vendas.get(codigo(l));
      if (!v || !codigos.has(codigo(l))) continue;
      v.qtd += num(pick(l, "quantidade", "qtd", "volume", "qtde", "qtd_venda"));
      v.valor += num(pick(l, "total_vendido", "valor_venda", "venda", "vendas", "valor"));
    }
  }
  return linhas.map(l => {
    const v = vendas.get(l.codigo);
    if (!v) return l;
    return { ...l, ultimaCompra: v.data, qtdVenda: v.qtd, valorVenda: v.valor,
      progresso: l.qtdCompra > 0 ? v.qtd / l.qtdCompra * 100 : 0,
      estoqueDinamico: l.qtdCompra - v.qtd };
  });
}