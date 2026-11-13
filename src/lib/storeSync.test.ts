import { describe, expect, it } from "vitest";
import { agregarDias, juntarDias, planejarSincronizacao } from "../../supabase/functions/_shared/hubDados";
import { permiteSincronizar } from "../../supabase/functions/_shared/syncAutorizacao";

describe("sincronização por loja", () => {
  it("usuário sem acesso aprovado não sincroniza loja", () => {
    expect(permiteSincronizar(false, false, "loja-a")).toBe(false);
    expect(permiteSincronizar(false, true, "loja-a")).toBe(true);
  });
  it("atualização de toda a rede exige administrador", () => {
    expect(permiteSincronizar(false, true, undefined)).toBe(false);
    expect(permiteSincronizar(true, false, undefined)).toBe(true);
  });
  it("relatórios pesados são pedidos dia a dia até D-1", () => {
    const tasks = planejarSincronizacao("2026-11-12", []);
    const compras = tasks.filter(t => t.relatorio === "analise_compras");
    expect(compras).toHaveLength(12);
    expect(compras.every(t => t.params.inicio === t.params.fim)).toBe(true);
    expect(compras.some(t => t.params.fim === "2026-11-13")).toBe(false);
  });
  it("reusa dias já salvos em vez de repetir histórico", () => {
    const tasks = planejarSincronizacao("2026-11-12", [{ relatorio: "ranking_produtos", params: { inicio: "2026-11-01", fim: "2026-11-01" } }]);
    expect(tasks.some(t => t.relatorio === "ranking_produtos" && t.params.inicio === "2026-11-01")).toBe(false);
    expect(tasks.some(t => t.relatorio === "ranking_produtos" && t.params.inicio === "2026-11-12")).toBe(true);
  });
  it("compra preserva notas separadas sem somar custos unitários", () => {
    expect(juntarDias("analise_compras", [[{ codigo: 1, custo: 2, quantidade: 10 }], [{ codigo: 1, custo: 3, quantidade: 5 }]])).toEqual([
      { codigo: 1, custo: 2, quantidade: 10 }, { codigo: 1, custo: 3, quantidade: 5 },
    ]);
  });
  it("vendas somam números retornados como texto sem somar datas ou códigos", () => {
    const rows = agregarDias([[{ CODIGO: "270410", DATA: "2026-09-30", QUANTIDADE: "30", TOTAL_VENDIDO: "540" }], [{ CODIGO: "270410", DATA: "2026-10-27", QUANTIDADE: "5", TOTAL_VENDIDO: "90" }]]);
    expect(rows).toHaveLength(1);
    expect(rows[0].CODIGO).toBe("270410");
    expect(rows[0].QUANTIDADE).toBe(35);
    expect(rows[0].TOTAL_VENDIDO).toBe(630);
  });
});