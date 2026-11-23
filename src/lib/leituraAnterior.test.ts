import { describe, expect, it } from "vitest";
import { escolherLeituraAnterior } from "../../supabase/functions/_shared/hubDados";
import { SEM_CADASTRO } from "@/hooks/useVrRealizado";

const reg = (inicio: string, fim: string, atualizado_em: string, extra: Record<string, unknown> = {}, linhas = 10) =>
  ({ params: { inicio, fim, ...extra }, atualizado_em, linhas });

describe("escolherLeituraAnterior", () => {
  const ontem = "2026-11-22";
  const mes = { inicio: "2026-11-01", fim: "2026-11-30" };

  it("usa a leitura mais recente do mês em aberto quando a loja não responde", () => {
    const r = escolherLeituraAnterior([
      reg("2026-11-01", "2026-11-17", "2026-11-18T11:00:00Z"),
      reg("2026-11-01", "2026-11-18", "2026-11-19T11:00:00Z"),
      reg("2026-11-01", "2026-11-10", "2026-11-11T11:00:00Z"),
    ], mes, ontem);
    expect((r?.params as { fim: string }).fim).toBe("2026-11-18");
  });

  it("ignora leituras vazias, de outro início ou com outros filtros", () => {
    expect(escolherLeituraAnterior([
      reg("2026-11-01", "2026-11-18", "2026-11-19T11:00:00Z", {}, 0),
      reg("2026-10-01", "2026-10-31", "2026-11-01T11:00:00Z"),
      reg("2026-11-01", "2026-11-18", "2026-11-19T11:00:00Z", { loja: "2" }),
    ], mes, ontem)).toBeNull();
  });

  it("não entrega leitura parcial para um período já fechado", () => {
    expect(escolherLeituraAnterior(
      [reg("2026-10-01", "2026-10-15", "2026-10-16T11:00:00Z")],
      { inicio: "2026-10-01", fim: "2026-10-31" }, ontem,
    )).toBeNull();
  });

  it("não usa leitura com fim depois do período pedido", () => {
    expect(escolherLeituraAnterior(
      [reg("2026-11-01", "2026-11-22", "2026-11-23T11:00:00Z")],
      { inicio: "2026-11-01", fim: "2026-11-22" }, "2026-11-21",
    )).toBeNull();
  });
});

describe("SEM_CADASTRO", () => {
  it("só reconhece loja sem conexão cadastrada", () => {
    expect(SEM_CADASTRO.test("loja sem conexao VR cadastrada")).toBe(true);
    expect(SEM_CADASTRO.test("loja sem conexao cadastrada")).toBe(true);
    expect(SEM_CADASTRO.test("sem conexao VR (servidor respondeu 404)")).toBe(false);
    expect(SEM_CADASTRO.test("tunnel instavel: sem conexao VR (tls handshake eof)")).toBe(false);
  });
});
