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
import { chamarRelatorio } from "@/lib/vrReport";
import { abrirDepartamentoOutros, mercadologicoNivel1 } from "@/lib/mercadologico";

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
    linhas.map((l) => mercadologicoNivel1(l)),
  );
  return nomes.has("OUTROS");
}

/**
 * Abre o balde "OUTROS" pelos departamentos reais do ranking de produtos,
 * rateando os valores OFICIAIS de compra/venda/CMV da propria linha OUTROS
 * pelo peso de venda de cada departamento. O total fica identico ao do ERP.
 * Nunca zera compras: se o ranking falhar, devolve null (mantem as linhas base).
 */
export async function detalharComprasVendas(
  storeId: string,
  inicio: string,
  fim: string,
  base: any[] = [],
): Promise<any[] | null> {
  if (!base.length) return null;
  const vendas = await chamarRelatorio(storeId, "ranking_produtos", { inicio, fim, limite: 200000 })
    .catch(() => ({ dados: [] as any[] }));
  const abertas = abrirDepartamentoOutros(base, vendas.dados ?? []);
  return abertas === base ? null : abertas;
}
