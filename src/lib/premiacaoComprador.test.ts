import { describe, it, expect } from "vitest";
import { calcularComprador, COMPRADOR_PADRAO } from "./premiacaoComprador";

const v = { ...COMPRADOR_PADRAO, valor_premiacao: 1000 };
const base = { metaVendas: 100, vendas: 100, metaLucro: 20, lucro: 20, metaCompra: 80, compra: 80, cmv: 80, pagamentos: 80 };

describe("premiação de compradores", () => {
  it("paga 100% quando tudo é atingido", () => {
    expect(calcularComprador(v, base).valorPago).toBe(1000);
  });
  it("compra acima da meta de compra não paga o KPI de compras", () => {
    const r = calcularComprador(v, { ...base, compra: 90 });
    expect(r.kpis.find((k) => k.key === "compras")!.pago).toBe(false);
    expect(r.valorPago).toBe(750);
  });
  it("compra abaixo da meta de compra paga", () => {
    expect(calcularComprador(v, { ...base, compra: 60 }).kpis.find((k) => k.key === "compras")!.pago).toBe(true);
  });
  it("pagamento a fornecedores acima do CMV não paga", () => {
    expect(calcularComprador(v, { ...base, pagamentos: 81 }).kpis.find((k) => k.key === "pagamentos")!.pago).toBe(false);
  });
  it("faturamento abaixo do mínimo de 99% não paga", () => {
    expect(calcularComprador(v, { ...base, vendas: 98 }).kpis.find((k) => k.key === "faturamento")!.pago).toBe(false);
  });
});
