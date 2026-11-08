import { describe, it, expect } from "vitest";
import { abrirDepartamentoOutros } from "@/lib/mercadologico";

describe("abertura do OUTROS (Medeiros)", () => {
  it("rateia a compra oficial de OUTROS pelos departamentos sem perder total", () => {
    const base = [
      { departamento: "OUTROS", compra: 116636, venda: 110634.94, cmv: 76393.8237 },
      { departamento: "ACOUGUE", compra: 46738.13, venda: 29836.4574, cmv: 21338.9814 },
    ];
    const ranking = [
      { secao: "BEBIDAS", valor: 300, custo: 200 },
      { secao: "LIMPEZA", valor: 100, custo: 70 },
      { secao: "ACOUGUE", valor: 999, custo: 1 },
    ];
    const r = abrirDepartamentoOutros(base, ranking);
    const total = r.reduce((s, l) => s + l.compra, 0);
    expect(total).toBeCloseTo(192803.52 - 29429.39, 2);
    expect(r.find((l) => l.departamento === "BEBIDAS")!.compra).toBeCloseTo(87477, 2);
    expect(r.find((l) => l.departamento === "ACOUGUE")!.compra).toBe(46738.13);
    expect(r.some((l) => l.departamento === "OUTROS")).toBe(false);
  });
});
