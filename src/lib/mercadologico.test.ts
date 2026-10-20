import { describe, it, expect } from "vitest";
import { abrirDepartamentoOutros } from "./mercadologico";

describe("abrirDepartamentoOutros", () => {
  it("abre OUTROS pelos departamentos reais mantendo o total", () => {
    const linhas = [
      { departamento: "ACOUGUE", venda: 100, custo: 70 },
      { departamento: "OUTROS", venda: 1000, custo: 600 },
    ];
    const ranking = [
      { secao: "ACOUGUE", valor: 50 },
      { secao: "BEBIDAS", valor: 300 },
      { secao: "LIMPEZA", valor: 100 },
    ];
    const r = abrirDepartamentoOutros(linhas, ranking);
    expect(r.map((l) => l.departamento)).toEqual(["ACOUGUE", "BEBIDAS", "LIMPEZA"]);
    expect(r.find((l) => l.departamento === "BEBIDAS")!.venda).toBeCloseTo(750);
    expect(r.reduce((s, l) => s + l.venda, 0)).toBeCloseTo(1100);
  });
});
