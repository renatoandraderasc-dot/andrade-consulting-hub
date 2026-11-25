import { describe, expect, it } from "vitest";
import type { LinhaHierarquia } from "@/hooks/useHierarquiaVendas";
import { analisarProdutosGestao, pendenciasGestao, periodosGestao } from "./gestaoProdutos";

const produto = (codigo: string, volume: number): LinhaHierarquia => ({ codigo, volume, n1: "MERCEARIA", n2: "", n3: "", produto: `Produto ${codigo}`, ean: "7891234567890", vendas: 0, lucro: 0 });
const ciente = { store_id: "loja-a", mes: "2026-11-01", produto_chave: "1" };

describe("Checklist mensal de produtos", () => {
  it("Ciente remove o produto da lista de pendências do mês e não altera o relatório original", () => {
    const itens = [{ chave: "1" }, { chave: "2" }];
    expect(pendenciasGestao(itens, [ciente], "loja-a", "2026-11-01")).toEqual([{ chave: "2" }]);
    expect(itens).toEqual([{ chave: "1" }, { chave: "2" }]);
  });
  it("a marcação de novembro não oculta produtos em dezembro", () => {
    expect(pendenciasGestao([{ chave: "1" }], [ciente], "loja-a", "2026-12-01")).toEqual([{ chave: "1" }]);
  });
  it("a marcação de uma loja não oculta produtos de outra", () => {
    expect(pendenciasGestao([{ chave: "1" }], [ciente], "loja-b", "2026-11-01")).toEqual([{ chave: "1" }]);
  });
  it("desfazer a ciência devolve o produto à lista", () => {
    expect(pendenciasGestao([{ chave: "1" }], [], "loja-a", "2026-11-01")).toHaveLength(1);
  });
  it("mantém os critérios atuais: sem venda e queda de pelo menos 10%", () => {
    const bases = Array.from({ length: 3 }, () => [produto("1", 100), produto("2", 100), produto("3", 100)]);
    const itens = analisarProdutosGestao([produto("2", 90), produto("3", 91)], bases);
    expect(itens.map((p) => [p.codigo, p.tipo, p.mediaVol, p.atualVol])).toEqual([["1", "sem_giro", 100, 0], ["2", "em_queda", 100, 90]]);
  });
  it("compara os mesmos dias nos três meses anteriores, como o PIC", () => {
    expect(periodosGestao(2026, 11, new Date(2026, 10, 25))).toEqual([
      { inicio: "2026-11-01", fim: "2026-11-24" }, { inicio: "2026-10-01", fim: "2026-10-24" },
      { inicio: "2026-09-01", fim: "2026-09-24" }, { inicio: "2026-08-01", fim: "2026-08-24" },
    ]);
  });
});