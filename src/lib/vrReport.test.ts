import { beforeEach, expect, it, vi } from "vitest";
const { invoke, from, montarDoHub } = vi.hoisted(() => ({ invoke: vi.fn(), from: vi.fn(), montarDoHub: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke }, from } }));
vi.mock("@/lib/ultimaAtualizacao", () => ({ registrarAtualizacao: vi.fn() }));
vi.mock("@/lib/hubDiario", async importOriginal => ({ ...await importOriginal<typeof import("./hubDiario")>(), montarDoHub }));
import { chamarRelatorio } from "./vrReport";

beforeEach(() => {
  vi.clearAllMocks();
  montarDoHub.mockResolvedValue(null);
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { name: "Oliveira" } }) };
  from.mockReturnValue(query);
});
it("mês de compras envia uma consulta por dia e preserva cada nota", async () => {
  invoke.mockImplementation(async (_name, { body }) => ({ data: { dados: [{ codigo: 270410, data_entrada: body.params.inicio, qtd_compra: 75 }], origem: "ponte" }, error: null }));
  const r = await chamarRelatorio("oliveira", "analise_compras", { inicio: "2026-10-30", fim: "2026-11-02" });
  expect(invoke).toHaveBeenCalledTimes(4);
  expect(invoke.mock.calls.map(c => c[1].body.params)).toEqual([
    { inicio: "2026-10-30", fim: "2026-10-30" }, { inicio: "2026-10-31", fim: "2026-10-31" },
    { inicio: "2026-11-01", fim: "2026-11-01" }, { inicio: "2026-11-02", fim: "2026-11-02" },
  ]);
  expect(r.dados).toHaveLength(4);
  expect(r.dados[0].qtd_compra).toBe(75);
});
it("dias ausentes nunca são exibidos como um período completo", async () => {
  invoke.mockResolvedValueOnce({ data: { dados: [{ vendas: 100 }] }, error: null })
    .mockResolvedValueOnce({ data: { erro: "API DIRECTOR 504" }, error: null });
  const r = await chamarRelatorio("oliveira", "ranking_produtos", { inicio: "2026-11-01", fim: "2026-11-03" });
  expect(r.erro).toBe("API DIRECTOR 504");
  expect(r.dados).toEqual([]);
  expect(invoke).toHaveBeenCalledTimes(2);
});
it("dados salvos do Hub não consultam a loja novamente", async () => {
  montarDoHub.mockResolvedValue({ dados: [{ codigo: 270410, vendas: 540 }], atualizadoEm: "2026-11-13T01:00:00Z" });
  const r = await chamarRelatorio("oliveira", "ranking_produtos", { inicio: "2026-09-30", fim: "2026-10-27" });
  expect(invoke).not.toHaveBeenCalled();
  expect(r.dados[0].vendas).toBe(540);
  expect(r.doCache).toBe(true);
});

it("abrir a tela só com dados salvos nunca inicia uma consulta automática à loja", async () => {
  const r = await chamarRelatorio("cobal", "ranking_produtos", { inicio: "2026-10-01", fim: "2026-10-31" }, { apenasSalvos: true });
  expect(invoke).not.toHaveBeenCalled();
  expect(r.dados).toEqual([]);
  expect(r.erro).not.toBeNull();
});