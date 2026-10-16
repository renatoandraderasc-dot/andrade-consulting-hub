// Premiação de compradores (loja toda). Mesma lógica da premiação de metas:
// valor fixo em R$ × soma dos pesos dos KPIs atingidos.
export interface ValoresComprador {
  valor_premiacao: number;
  peso_faturamento: number;
  peso_arrecadacao: number;
  peso_compras: number;
  peso_pagamentos: number;
  atingimento_minimo: number;
}

export const COMPRADOR_PADRAO: ValoresComprador = {
  valor_premiacao: 0,
  peso_faturamento: 25,
  peso_arrecadacao: 25,
  peso_compras: 25,
  peso_pagamentos: 25,
  atingimento_minimo: 99,
};

export const lerComprador = (raw: unknown): ValoresComprador => {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...COMPRADOR_PADRAO };
  for (const k of Object.keys(out) as (keyof ValoresComprador)[]) {
    const n = Number(o[k]);
    if (o[k] !== undefined && o[k] !== null && Number.isFinite(n)) out[k] = n;
  }
  return out;
};

export interface DadosComprador {
  metaVendas: number; vendas: number;
  metaLucro: number; lucro: number;
  metaCompra: number; compra: number;
  cmv: number; pagamentos: number;
}

export type KpiComprador = "faturamento" | "arrecadacao" | "compras" | "pagamentos";

export interface ResultadoKpi {
  key: KpiComprador;
  label: string;
  peso: number;
  /** % de atingimento (100% = meta exata; maior é melhor) */
  atingimento: number;
  valido: boolean;
  pago: boolean;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
/** Indicador "quanto menor, melhor": teto / realizado. Gastar zero = 100%+ */
const teto = (limite: number, real: number) =>
  limite <= 0 ? 0 : real <= 0 ? 100 : (limite / real) * 100;

export function calcularComprador(v: ValoresComprador, d: DadosComprador) {
  const min = v.atingimento_minimo || 99;
  const base: Omit<ResultadoKpi, "pago">[] = [
    { key: "faturamento", label: "Faturamento", peso: v.peso_faturamento, atingimento: pct(d.vendas, d.metaVendas), valido: d.metaVendas > 0 },
    { key: "arrecadacao", label: "Arrecadação", peso: v.peso_arrecadacao, atingimento: pct(d.lucro, d.metaLucro), valido: d.metaLucro > 0 },
    // Compras x Vendas: comprar até a meta de compra
    { key: "compras", label: "Compras x Vendas", peso: v.peso_compras, atingimento: teto(d.metaCompra, d.compra), valido: d.metaCompra > 0 },
    // Pagamentos a fornecedores não podem passar do CMV
    { key: "pagamentos", label: "Pagamentos a Fornecedores", peso: v.peso_pagamentos, atingimento: teto(d.cmv, d.pagamentos), valido: d.cmv > 0 },
  ];
  const kpis: ResultadoKpi[] = base.map((k) => ({ ...k, pago: k.valido && k.atingimento >= min }));
  const pctPago = kpis.reduce((s, k) => s + (k.pago ? k.peso || 0 : 0), 0);
  return { kpis, pctPago, valorPago: (v.valor_premiacao * pctPago) / 100 };
}
