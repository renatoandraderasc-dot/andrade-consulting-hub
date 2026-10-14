import { describe, it, expect } from "vitest";
import { buscarLimite, statusVariacao, impactoVariacao, statusAlcada, compraApos30, LimiteAlcada } from "./analiseCompras";

const lista: LimiteAlcada[] = [
  { store_id: null, departamento: "HORTIFRUTI", limite_dentro_dias: 3, limite_fora_dias: 7, limite_variacao_pct: 5 },
  { store_id: null, departamento: "", limite_dentro_dias: 15, limite_fora_dias: 30, limite_variacao_pct: 5 },
  { store_id: "L1", departamento: "HORTIFRUTI", limite_dentro_dias: 2, limite_fora_dias: 5, limite_variacao_pct: 5 },
];

describe("analise de compras", () => {
  it("limite: loja+depto antes do padrão", () => expect(buscarLimite(lista, "L1", "Hortifruti").limite_dentro_dias).toBe(2));
  it("limite: padrão do depto", () => expect(buscarLimite(lista, "L2", "HORTIFRUTI").limite_fora_dias).toBe(7));
  it("limite: padrão geral 15/30", () => expect(buscarLimite(lista, "L2", "BEBIDAS").limite_fora_dias).toBe(30));
  it("variação acima de 5% é alta", () => expect(statusVariacao(10.6, 10, 6, 5)).toBe("alta"));
  it("variação abaixo de -5% é queda", () => expect(statusVariacao(9.4, 10, -6, 5)).toBe("queda"));
  it("variação de 5% é estável", () => expect(statusVariacao(10.5, 10, 5, 5)).toBe("estavel"));
  it("sem anterior é 1ª compra", () => expect(statusVariacao(10, null, null, 5)).toBe("primeira"));
  it("custo 0 fora da variação", () => expect(statusVariacao(0, 10, -100, 5)).toBe("bonificacao"));
  it("impacto = diferença x qtd", () => expect(impactoVariacao(12, 10, 5)).toBe(10));
  it("bonificação sem impacto", () => expect(impactoVariacao(0, 10, 5)).toBe(0));
  it("alçada: dentro", () => expect(statusAlcada(15, 1, 15, 30)).toBe("na"));
  it("alçada: fora", () => expect(statusAlcada(20, 1, 15, 30)).toBe("fora"));
  it("alçada: crítico acima de 30", () => expect(statusAlcada(31, 1, 15, 30)).toBe("critico"));
  it("alçada: sem venda", () => expect(statusAlcada(null, 0, 15, 30)).toBe("sem"));
  it("compra após +30 dias", () => { expect(compraApos30(31)).toBe(true); expect(compraApos30(30)).toBe(false); });
});
