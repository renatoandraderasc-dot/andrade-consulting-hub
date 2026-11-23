import { describe, it, expect } from "vitest";
import { produtosSemVenda, type ProdutoVenda } from "./produtosSemVenda";

const p = (codigo: string, departamento: string, venda: number): ProdutoVenda => ({ codigo, descricao: codigo, barras: "", departamento, venda, volume: venda ? 1 : 0 });

describe("produtosSemVenda", () => {
  it("lista só quem vendeu nos 3 meses anteriores e não vendeu no mês atual, por departamento", () => {
    const ref = [[p("1", "MERCEARIA", 10), p("2", "BEBIDAS", 5)], [p("1", "MERCEARIA", 20)], [p("3", "BEBIDAS", 7)]];
    const atual = [p("2", "BEBIDAS", 3)];
    const r = produtosSemVenda(ref, atual);
    expect([...r.keys()]).toEqual(["MERCEARIA", "BEBIDAS"]);
    expect(r.get("MERCEARIA")![0]).toMatchObject({ codigo: "1", venda: 30, mesesComVenda: 2 });
    expect(r.get("BEBIDAS")!.map((x) => x.codigo)).toEqual(["3"]);
  });
  it("produto sem venda também nos meses anteriores não aparece", () => {
    expect(produtosSemVenda([[p("9", "X", 0)]], []).size).toBe(0);
  });
});
