import { expect, it, vi } from "vitest";
import { aplicarComprasFiltradas, complementarVendasEstoque } from "./estoqueVendas";
const linha = { codigo: "270410", ultimaCompra: "", qtdCompra: 75, valorCompra: 1150, qtdVenda: 0, valorVenda: 0, progresso: 0, estoqueDinamico: 75 };
const resposta = (dados: unknown[]) => ({ dados, offline: false, indisponivel: false, erro: null });

it("compra respeita filtro e usa 75 unidades, não 5 caixas", () => {
  const r = aplicarComprasFiltradas([linha, { ...linha, codigo: "outro" }], [{ codigo: 270410, qtd_compra: 75, valor_compra: 1150, data_entrada: "2026-09-30T03:00:00Z" }]);
  expect(r).toHaveLength(1); expect(r[0].qtdCompra).toBe(75); expect(r[0].ultimaCompra).toBe("2026-09-30");
});
it("vendas vão de 30/09 até 27/10, ignorando o fim do filtro de compras", async () => {
  const consultar = vi.fn().mockResolvedValueOnce(resposta([{ codigo: 270410, data_entrada: "2026-09-30" }]))
    .mockResolvedValueOnce(resposta([{ codigo: 270410, quantidade: 30, total_vendido: 540 }]));
  const r = await complementarVendasEstoque([linha], "2026-09-01", "2026-09-30", "2026-10-27", consultar);
  expect(consultar).toHaveBeenLastCalledWith("ranking_produtos", { inicio: "2026-09-30", fim: "2026-10-27", limite: 200000 });
  expect(r[0].qtdCompra).toBe(75); expect(r[0].qtdVenda).toBe(30); expect(r[0].estoqueDinamico).toBe(45); expect(r[0].progresso).toBe(40);
});
it("entrada posterior ao filtro altera só o início das vendas", async () => {
  const consultar = vi.fn().mockResolvedValueOnce(resposta([{ codigo: 270410, data_entrada: "2026-10-20" }])).mockResolvedValueOnce(resposta([]));
  const r = await complementarVendasEstoque([linha], "2026-09-01", "2026-09-30", "2026-10-27", consultar);
  expect(r[0].ultimaCompra).toBe("2026-10-20"); expect(r[0].qtdCompra).toBe(75);
});
it("falha nunca substitui vendas anteriores por zero", async () => {
  const anterior = { ...linha, qtdVenda: 20 };
  const consultar = vi.fn().mockResolvedValue({ ...resposta([]), offline: true });
  await expect(complementarVendasEstoque([anterior], "2026-09-01", "2026-09-30", "2026-10-27", consultar)).rejects.toThrow();
  expect(anterior.qtdVenda).toBe(20);
});
it("não inventa última entrada a partir de primeira compra", async () => {
  const consultar = vi.fn().mockResolvedValue(resposta([{ codigo: 270410, primeira_compra: "2026-08-14" }]));
  await expect(complementarVendasEstoque([linha], "2026-09-01", "2026-09-30", "2026-10-27", consultar)).rejects.toThrow("Última entrada");
});