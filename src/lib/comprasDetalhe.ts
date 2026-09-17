// ============================================================
// Abertura de compras x vendas por TODOS os departamentos.
//
// Algumas pontes (padrao DIRECTOR) publicam compras_vendas_periodo
// ja agrupado em poucos departamentos (ACOUGUE / PADARIA /
// HORTIFRUTI / OUTROS). Quando detectamos esse agrupamento,
// remontamos a abertura completa no front:
//   - compras por departamento -> estoque_dinamico (valor_comprado)
//   - vendas/custo por departamento -> ranking_produtos (secao)
// Nada e gravado; tudo roda sob acao do usuario.
// ============================================================
import { chamarRelatorio, pick as col, num } from "@/lib/vrReport";

export interface LinhaComprasVendas {
  departamento: string;
  venda: number;
  cmv: number;
  compra: number;
  qtde_compra: number;
  volume: number;
}

const dep = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** true quando a ponte devolveu tudo colapsado num balde "OUTROS" */
export function comprasAgrupadas(linhas: any[]): boolean {
  const nomes = new Set(
    linhas.map((l) => dep(col(l, "departamento", "nivel1", "secao"))),
  );
  return nomes.has("OUTROS");
}

/** Remonta a abertura por departamento. Devolve null se nao for possivel. */
export async function detalharComprasVendas(
  storeId: string,
  inicio: string,
  fim: string,
): Promise<LinhaComprasVendas[] | null> {
  const [compras, vendas] = await Promise.all([
    chamarRelatorio(storeId, "estoque_dinamico", { inicio, fim }).catch(() => ({ dados: [] as any[], erro: "x" })),
    chamarRelatorio(storeId, "ranking_produtos", { inicio, fim, limite: 200000 }).catch(() => ({ dados: [] as any[], erro: "x" })),
  ]);

  const acc = new Map<string, LinhaComprasVendas>();
  const get = (nome: string) => {
    const k = nome || "SEM DEPARTAMENTO";
    let cur = acc.get(k);
    if (!cur) {
      cur = { departamento: k, venda: 0, cmv: 0, compra: 0, qtde_compra: 0, volume: 0 };
      acc.set(k, cur);
    }
    return cur;
  };

  for (const l of compras.dados ?? []) {
    const cur = get(dep(col(l, "departamento", "secao", "nivel1")));
    cur.compra += num(col(l, "valor_comprado", "total_compra", "compra", "compras"));
    cur.qtde_compra += num(col(l, "qtd_comprada", "qtde_compra"));
  }

  for (const l of vendas.dados ?? []) {
    const cur = get(dep(col(l, "secao", "departamento", "nivel1")));
    cur.venda += num(col(l, "valor", "venda", "vendas", "total_vendido", "total_venda"));
    cur.cmv += num(col(l, "custo", "cmv"));
    cur.volume += num(col(l, "qtd", "quantidade", "volume"));
  }

  const linhas = [...acc.values()].filter((l) => l.compra > 0 || l.venda > 0);
  if (linhas.length < 2) return null;
  return linhas.sort((a, b) => b.compra - a.compra);
}
