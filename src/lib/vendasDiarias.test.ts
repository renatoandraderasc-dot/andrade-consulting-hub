import { describe, expect, it, vi } from "vitest";
import { consultarVendasDiarias } from "./vendasDiarias";

describe("vendas diárias DIRECTOR", () => {
  it("mantém as vendas do Medeiros nos sete dias, sem concentrar no primeiro", async () => {
    const valores = [23719.26, 35108.76, 27789.15, 29300.55, 26142.68, 36478.33, 64471.78];
    const dados = valores.map((vendas, i) => ({ data: `2026-11-0${i + 1}`, vendas }));
    const consultar = vi.fn().mockResolvedValue({ data: { dados }, error: null });
    const r = await consultarVendasDiarias("DIRECTOR", "2026-11-01", "2026-11-07", consultar);
    expect(consultar).toHaveBeenCalledWith("vendas_secao_dia", { inicio: "2026-11-01", fim: "2026-11-07" });
    expect(r.data.dados.map((l: any) => l.data)).toEqual(dados.map(l => l.data));
    expect(r.data.dados[6].vendas).toBe(64471.78);
    expect(r.data.dados.reduce((s: number, l: any) => s + l.vendas, 0)).toBeCloseTo(243010.51, 2);
  });

  it("busca dias individualmente quando a ponte retorna totais sem data", async () => {
    const consultar = vi.fn()
      .mockResolvedValueOnce({ data: { dados: [{ vendas: 300 }] }, error: null })
      .mockResolvedValueOnce({ data: { dados: [{ vendas: 100 }] }, error: null })
      .mockResolvedValueOnce({ data: { dados: [{ vendas: 200 }] }, error: null });
    const r = await consultarVendasDiarias("DIRECTOR", "2026-11-01", "2026-11-02", consultar);
    expect(consultar.mock.calls.slice(1)).toEqual([
      ["vendas_secao_dia", { data: "2026-11-01" }],
      ["vendas_secao_dia", { data: "2026-11-02" }],
    ]);
    expect(r.data.dados).toEqual([{ data: "2026-11-01", vendas: 100 }, { data: "2026-11-02", vendas: 200 }]);
  });

  it.each(["VR", "ORACLE", "WEBSAC", "SISCOMP", null])("preserva o relatório existente para %s", async sistema => {
    const consultar = vi.fn().mockResolvedValue({ data: { dados: [] }, error: null });
    await consultarVendasDiarias(sistema, "2026-11-01", "2026-11-07", consultar);
    expect(consultar).toHaveBeenCalledExactlyOnceWith("vendas_secao_periodo", { inicio: "2026-11-01", fim: "2026-11-07" });
  });

  it("não entrega um mês parcial quando um dia falha", async () => {
    const consultar = vi.fn()
      .mockResolvedValueOnce({ data: { dados: [{ vendas: 300 }] }, error: null })
      .mockResolvedValueOnce({ data: { dados: [{ vendas: 100 }] }, error: null })
      .mockResolvedValueOnce({ data: { erro: "ponte indisponível" }, error: null });
    const r = await consultarVendasDiarias("DIRECTOR", "2026-11-01", "2026-11-02", consultar);
    expect(r.data.erro).toBe("ponte indisponível");
    expect(r.data.dados).toBeUndefined();
  });
});