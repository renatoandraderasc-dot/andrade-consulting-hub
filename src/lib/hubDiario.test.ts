import { describe, it, expect } from "vitest";
import { agregarDias, diasEntre } from "./hubDiario";

describe("hub diario", () => {
  it("soma vendas e lucro do mesmo produto entre dias e recalcula margem", () => {
    const r = agregarDias([
      [{ codigo: 382, produto: "PAO", vendas: 100, lucro: 40, margem_pct: 40 }],
      [{ codigo: 382, produto: "PAO", vendas: 300, lucro: 60, margem_pct: 20 }],
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].vendas).toBe(400);
    expect(r[0].lucro).toBe(100);
    expect(r[0].margem_pct).toBe(25);
  });
  it("mantem departamentos separados", () => {
    const r = agregarDias([[{ departamento: "A", total_compra: 10 }, { departamento: "B", total_compra: 5 }], [{ departamento: "A", total_compra: 1 }]]);
    expect(r.find((x) => x.departamento === "A").total_compra).toBe(11);
    expect(r.find((x) => x.departamento === "B").total_compra).toBe(5);
  });
  it("lista os dias do periodo", () => {
    expect(diasEntre("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});
