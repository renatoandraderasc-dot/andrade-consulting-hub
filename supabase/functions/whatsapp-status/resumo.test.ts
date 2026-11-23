import { assertEquals } from "jsr:@std/assert@1";
import { custoMaior, margemNegativa, naoVendidos } from "./resumo.ts";
Deno.test("margem baixa só inclui margem abaixo de 0%", () => {
  const r = margemNegativa([{ codigo: 1, vendas: 10, lucro: -1, margem: -0.1 }, { codigo: 2, vendas: 10, lucro: 0, margem: 0 }, { codigo: 3, vendas: 10, lucro: 0.5, margem: 0.05 }]);
  assertEquals(r.map((x) => x.codigo), [1]);
});
Deno.test("produto de venda diária sem venda no dia é listado", () => {
  assertEquals(naoVendidos([{ codigo: 1, descricao: "A" }, { codigo: 2, descricao: "B" }], [{ codigo: 1, vendas: 5 }]).map((x) => x.codigo), [2]);
});
Deno.test("item mais caro que a última compra é listado", () => {
  const r = custoMaior([{ codproduto: 1, descricao: "A", custo: 11 }, { codproduto: 2, descricao: "B", custo: 10 }], new Map([[1, 10], [2, 10]]));
  assertEquals(r.map((x) => x.codproduto), [1]);
});

import { produtosFrequentes as pf } from "./resumo.ts";
Deno.test("produtosFrequentes: só quem vendeu em pelo menos 85% dos dias", () => {
  const v = (c: number) => ({ codigo: c, produto: `P${c}`, vendas: 1 });
  const dias = Array.from({ length: 20 }, (_, i) => [v(1), ...(i < 17 ? [v(2)] : []), ...(i < 16 ? [v(3)] : [])]);
  const r = pf(dias, 0.85).map((x) => x.codigo);
  if (JSON.stringify(r) !== "[1,2]") throw new Error(JSON.stringify(r));
});
