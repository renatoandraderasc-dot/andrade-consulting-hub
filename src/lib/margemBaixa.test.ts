import { describe, it, expect } from "vitest";
import { margemPct, lucroQueFalta, precoParaMargem, abaixoDoAlvo } from "./margemBaixa";

describe("margem baixa", () => {
  it("margem é lucro sobre a venda", () => {
    expect(margemPct(100, 90)).toBeCloseTo(10);
    expect(margemPct(100, 110)).toBeCloseTo(-10);
  });
  it("produto com 10% fica abaixo do alvo de 15%", () => {
    expect(abaixoDoAlvo(100, 90, 15)).toBe(true);
    expect(abaixoDoAlvo(100, 80, 15)).toBe(false);
  });
  it("produto sem venda não entra", () => {
    expect(abaixoDoAlvo(0, 0, 15)).toBe(false);
  });
  it("lucro que falta para chegar em 15%", () => {
    expect(lucroQueFalta(1000, 900, 15)).toBeCloseTo(50);
    expect(lucroQueFalta(1000, 800, 15)).toBe(0);
  });
  it("preço sugerido entrega a margem alvo", () => {
    // custo unitário 8,50 -> preço 10,00 dá 15%
    expect(precoParaMargem(85, 10, 15)).toBeCloseTo(10);
  });
});
