import { describe, expect, it } from "vitest";
import { dimensoesTotais, validarDimensoes, TvDimensoes } from "./tvDimensoes";

const uniao: TvDimensoes = { largura_m: 1, altura_m: 1, colunas: 4, linhas: 1, resolucao_largura: null, resolucao_altura: null };
describe("dimensões de TV", () => {
  it("União: quatro telas de 1 × 1 lado a lado, sem inventar resolução", () => {
    expect(dimensoesTotais(uniao)).toEqual({ larguraM: 4, alturaM: 1, larguraPx: null, alturaPx: null, proporcao: 4 });
    expect(validarDimensoes(uniao)).toBeNull();
  });
  it("calcula resolução conjunta quando informada", () => {
    expect(dimensoesTotais({ ...uniao, resolucao_largura: 1920, resolucao_altura: 1080 })).toMatchObject({ larguraPx: 7680, alturaPx: 1080, proporcao: 7680 / 1080 });
  });
  it("preserva preenchimento automático sem dimensões", () => {
    expect(dimensoesTotais({ ...uniao, largura_m: null, altura_m: null }).proporcao).toBeNull();
  });
  it("não aceita resolução parcial", () => {
    expect(validarDimensoes({ ...uniao, resolucao_largura: 1920 })).not.toBeNull();
  });
});