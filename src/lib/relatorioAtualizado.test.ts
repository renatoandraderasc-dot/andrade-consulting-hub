import { beforeEach, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { leituraCompleta, montarDoHub, selecionarLeituraHub } from "./hubDiario";
import { lerPeriodoCache } from "./relatorioCache";

const params = { inicio: "2026-10-01", fim: "2026-10-31", limite: 200000 };
const antigo = { params, atualizado_em: "2026-11-02T01:00:10Z", dados: [{ vendas: 704297.25 }] };
const completo = { params: { inicio: params.inicio, fim: params.fim }, atualizado_em: "2026-11-08T11:01:43Z", dados: [{ vendas: 750582.34, volume: 81088.881 }] };

beforeEach(() => vi.clearAllMocks());

it("outubro Cobal usa R$ 750.582,34 completos, não R$ 704.297,25 de uma variante antiga", () => {
  const r = selecionarLeituraHub([antigo, completo], params);
  expect(r?.dados[0].vendas).toBe(750582.34);
  expect(r?.dados[0].volume).toBe(81088.881);
});

it("relatórios nunca confundem outro mês ou filtro com o período solicitado", () => {
  expect(selecionarLeituraHub([completo], { ...params, departamento: "PADARIA" })).toBeNull();
  expect(selecionarLeituraHub([completo], { inicio: "2026-09-01", fim: "2026-09-30" })).toBeNull();
});

it("um limite atingido não certifica um relatório completo", () => {
  expect(selecionarLeituraHub([{ ...completo, params: { ...params, limite: 1 } }], params)).toBeNull();
});

it("o mês fechado rejeita informações salvas antes do encerramento", () => {
  expect(leituraCompleta(params, "2026-10-31T23:59:00Z")).toBe(false);
  expect(leituraCompleta(params, "2026-11-01T03:01:00Z")).toBe(true);
});

it("todas as telas preferem a leitura mais recente quando o Hub foi atualizado", () => {
  const atualizado = { ...completo, atualizado_em: "2026-11-13T01:00:00Z", dados: [{ vendas: 800000 }] };
  expect(selecionarLeituraHub([completo, atualizado], params)?.dados[0].vendas).toBe(800000);
});

it("um relatório salvo vazio é zero real, não ressuscita uma cópia antiga", () => {
  expect(selecionarLeituraHub([{ ...completo, dados: [] }], params)?.dados).toEqual([]);
});

it("meses fechados leem o Hub antes da cópia secundária", async () => {
  const q = { select: () => q, eq: () => q, order: async () => ({ data: [completo], error: null }) };
  from.mockReturnValue(q);
  const r = await lerPeriodoCache("cobal", "cupons_e_ticket", "", params.inicio, params.fim);
  expect(r?.[0].vendas).toBe(750582.34);
  expect(from.mock.calls.every(([table]) => table === "relatorio_cache")).toBe(true);
});

it("a leitura mais recente exige todos os dias antes de substituir o mês inteiro", async () => {
  const q = { select: () => q, eq: () => q, order: async () => ({ data: [completo], error: null }), in: async () => ({ data: [], error: null }) };
  from.mockReturnValue(q);
  expect((await montarDoHub("cobal", "ranking_produtos", params))?.dados[0].vendas).toBe(750582.34);
});