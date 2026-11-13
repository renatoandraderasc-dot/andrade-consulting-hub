import { describe, it, expect } from "vitest";
import { agregar, mesesEntre, situacao, somarMeses, variacaoPct, type ProdutoMes } from "./comparativoProdutos";

const p = (mes: string, codigo: string, dep: string, venda: number, custo: number, volume = 1): ProdutoMes => ({
  mes, codigo, descricao: `P${codigo}`, barras: "", departamento: dep, grupo: "G", subgrupo: "S", venda, custo, volume,
});

describe("comparativo de produtos", () => {
  it("lista os meses do intervalo livre, mesmo atravessando o ano", () => {
    expect(mesesEntre("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("aceita o intervalo invertido", () => {
    expect(mesesEntre("2026-03", "2026-01")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("desloca meses para o mesmo período do ano anterior", () => {
    expect(somarMeses("2026-01", -12)).toBe("2025-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
  });

  it("variação sem base no período A não é calculada", () => {
    expect(variacaoPct(0, 100)).toBeNull();
    expect(variacaoPct(200, 250)).toBe(25);
  });

  it("soma faturamento, custo e volume de cada período no departamento", () => {
    const linhas = [
      p("2026-01", "1", "MERCEARIA", 100, 70, 2),
      p("2026-02", "1", "MERCEARIA", 50, 30, 1),
      p("2026-09", "1", "MERCEARIA", 300, 200, 4),
      p("2026-09", "2", "MERCEARIA", 10, 5, 1),
    ];
    const [l] = agregar(linhas, "departamento", new Set(["2026-01", "2026-02"]), new Set(["2026-09"]));
    expect(l.a).toEqual({ venda: 150, custo: 100, lucro: 50, volume: 3, mix: 1 });
    expect(l.b).toEqual({ venda: 310, custo: 205, lucro: 105, volume: 5, mix: 2 });
  });

  it("produto que só vendeu no período B é novo; só no A é perdido", () => {
    const linhas = [p("2026-01", "1", "D", 100, 50), p("2026-02", "2", "D", 80, 40)];
    const rows = agregar(linhas, "produto", new Set(["2026-01"]), new Set(["2026-02"]));
    expect(situacao(rows.find((r) => r.codigo === "1")!)).toBe("perdido");
    expect(situacao(rows.find((r) => r.codigo === "2")!)).toBe("novo");
  });

  it("mantém a precisão de custo do Hub antes de fechar o lucro do Cobal em R$ 237.045,31", () => {
    const [l] = agregar([p("2026-10", "198", "LOJA", 750582.34, 513537.0294415, 81088.881)], "departamento", new Set(), new Set(["2026-10"]));
    expect(l.b.custo).toBe(513537.0294415);
    expect(Number(l.b.lucro.toFixed(2))).toBe(237045.31);
  });
});
