import { describe, expect, it } from "vitest";
import { totalizarHistoricoCompras } from "./comprasHistorico";

describe("totais do histórico de compras para qualquer cliente", () => {
  const linhas = [
    { venda: 1000.25, cmv: 600, compra: 700 },
    { venda: 3000.75, cmv: 1800, compra: 1700 },
  ];

  it("soma as colunas monetárias e os excessos exibidos", () => {
    expect(totalizarHistoricoCompras(linhas)).toEqual({
      venda: 4001, cmv: 2400, compra: 2400, saldo: 0, excesso: 100,
      cmvv: 2400 / 4001 * 100, cv: 2400 / 4001 * 100,
    });
  });

  it("totaliza apenas as linhas do filtro selecionado", () => {
    expect(totalizarHistoricoCompras(linhas.slice(0, 1))).toMatchObject({
      venda: 1000.25, cmv: 600, compra: 700, saldo: -100, excesso: 100,
    });
  });

  it("evita percentuais inválidos quando não há vendas", () => {
    expect(totalizarHistoricoCompras([{ venda: 0, cmv: 10, compra: 20 }]))
      .toMatchObject({ cmvv: 0, cv: 0, saldo: -10, excesso: 10 });
  });
});