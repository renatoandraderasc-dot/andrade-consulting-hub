import { describe, expect, it } from "vitest";
import { intervalo12MesesFechados, ratearMetasLoja, ratearValor } from "./dashboardMetasRateio";

describe("Dashboard — rateio da meta total", () => {
  it("usa exatamente os últimos 12 meses fechados antes do mês exibido", () => {
    expect(intervalo12MesesFechados(2026, 11, { ano: 2026, mes: 10 })).toEqual({
      inicio: "2025-11-01",
      fim: "2026-10-31",
    });
  });

  it("nunca usa meses ainda abertos ou futuros", () => {
    expect(intervalo12MesesFechados(2027, 1, { ano: 2026, mes: 10 })).toEqual({
      inicio: "2025-11-01",
      fim: "2026-10-31",
    });
  });

  it("rateia R$ 1.000,01 pela participação de 60% e 40% sem perder o centavo", () => {
    const valores = ratearValor(1000.01, [0.6, 0.4], 2);
    expect(valores).toEqual([600.01, 400]);
    expect(valores.reduce((s, v) => s + v, 0)).toBe(1000.01);
  });

  it("cria metas visuais por departamento mantendo os totais de venda, lucro e volume", () => {
    const original = [{
      date: "2026-11-01",
      department: "LOJA",
      meta_vendas: 1000.01,
      meta_lucro: 200.01,
      meta_volume: 100.001,
      projecao_vendas: 1100,
      projecao_lucro: 220,
      projecao_volume: 110,
    }];
    const { linhas, rateada } = ratearMetasLoja(original, { MERCEARIA: 0.6, AÇOUGUE: 0.4 });
    const derivadas = linhas.filter((l) => l.department !== "LOJA");
    expect(rateada).toBe(true);
    expect(derivadas).toHaveLength(2);
    for (const campo of ["meta_vendas", "meta_lucro", "meta_volume", "projecao_vendas", "projecao_lucro", "projecao_volume"]) {
      expect(derivadas.reduce((s, l) => s + Number(l[campo]), 0)).toBeCloseTo(Number(original[0][campo as keyof typeof original[0]]), 3);
    }
    expect(linhas[0]).toEqual(original[0]);
  });

  it("não altera nem complementa metas por departamento já criadas", () => {
    const existentes = [
      { date: "2026-11-01", department: "LOJA", meta_vendas: 1000 },
      { date: "2026-11-01", department: "PADARIA", meta_vendas: 123.45 },
    ];
    const resultado = ratearMetasLoja(existentes, { MERCEARIA: 0.6, AÇOUGUE: 0.4 });
    expect(resultado.rateada).toBe(false);
    expect(resultado.linhas).toBe(existentes);
    expect(resultado.linhas).toEqual(existentes);
  });

  it("não inventa rateio quando não há participação histórica", () => {
    const existentes = [{ date: "2026-11-01", department: "LOJA", meta_vendas: 1000 }];
    expect(ratearMetasLoja(existentes, {})).toEqual({ linhas: existentes, rateada: false });
  });
});
