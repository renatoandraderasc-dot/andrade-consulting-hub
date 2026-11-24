import { describe, expect, it } from "vitest";
import {
  agruparSugestoes,
  contarPorCategoria,
  dataBaseMaisRecente,
  filtrarSugestoes,
  nomeAbaCategoria,
  normalizarSugestao,
  ordenarSugestoes,
  resumoSugestoes,
  type MixSugestao,
} from "./sugestaoMix";

const item = (parcial: Partial<MixSugestao>): MixSugestao => ({
  categoria: "MERCEARIA",
  prioridade: 1,
  grupo: "GRÃO",
  ean: "7891000000017",
  descricao: "Arroz Agulhinha 5kg",
  situacao: "Não cadastrado",
  lojas_vendem: 5,
  lojas_base: 10,
  presenca_pct: 50,
  lojas_curva_a: 3,
  lojas_curva_ab: 5,
  venda_mes_loja: 1234.56,
  unid_mes_loja: 12.3,
  preco_medio: 24.9,
  margem_pct: 18.2,
  part_secao_pct: 2.35,
  ...parcial,
});

describe("Sugestão de Mix", () => {
  it("filtra categoria, situação e curva A em pelo menos 3 lojas sem alterar a base", () => {
    const linhas = [
      item({ ean: "1" }),
      item({ ean: "2", categoria: "HORTIFRÚTI", lojas_curva_a: 2 }),
      item({ ean: "3", situacao: "Cadastrado, sem venda" }),
    ];
    const filtrados = filtrarSugestoes(linhas, {
      categorias: ["MERCEARIA"], situacao: "Não cadastrado", busca: "", soCurvaA3: true,
    });
    expect(filtrados.map((l) => l.ean)).toEqual(["1"]);
    expect(linhas).toHaveLength(3);
  });

  it("busca descrição sem acento e EAN por dígitos", () => {
    const linhas = [item({ descricao: "Feijão Carioca", ean: "789.1234.5678" })];
    const base = { categorias: [], situacao: "todas", soCurvaA3: false };
    expect(filtrarSugestoes(linhas, { ...base, busca: "feijao carioca" })).toHaveLength(1);
    expect(filtrarSugestoes(linhas, { ...base, busca: "12345678" })).toHaveLength(1);
    expect(filtrarSugestoes(linhas, { ...base, busca: "milho" })).toHaveLength(0);
  });

  it("ordena por prioridade dentro de cada categoria e mantém margem nula por último", () => {
    const grupos = agruparSugestoes([
      item({ ean: "b", categoria: "BOVINOS", prioridade: 2 }),
      item({ ean: "a", categoria: "AVES", prioridade: 3 }),
      item({ ean: "c", categoria: "BOVINOS", prioridade: 1 }),
    ]);
    expect(grupos.map(([categoria]) => categoria)).toEqual(["AVES", "BOVINOS"]);
    expect(grupos[1][1].map((l) => l.ean)).toEqual(["c", "b"]);

    const ordenados = ordenarSugestoes([
      item({ ean: "nula", margem_pct: null }),
      item({ ean: "alta", margem_pct: 30 }),
      item({ ean: "baixa", margem_pct: 10 }),
    ], "margem_pct", "desc");
    expect(ordenados.map((l) => l.ean)).toEqual(["alta", "baixa", "nula"]);
  });

  it("totaliza situações e venda potencial com os valores filtrados", () => {
    const resumo = resumoSugestoes([
      item({ venda_mes_loja: 100.25 }),
      item({ venda_mes_loja: 200.5, situacao: "Cadastrado, sem venda" }),
    ]);
    expect(resumo).toEqual({ total: 2, naoCadastrados: 1, cadastradosSemVenda: 1, vendaPotencial: 300.75 });
    expect(contarPorCategoria([
      item({ categoria: "AVES" }), item({ categoria: "AVES" }), item({ categoria: "BOVINOS" }),
    ])).toEqual([{ categoria: "AVES", quantidade: 2 }, { categoria: "BOVINOS", quantidade: 1 }]);
  });

  it("normaliza números da RPC sem transformar margem nula em zero", () => {
    const normalizado = normalizarSugestao({ ...item({}), venda_mes_loja: "123.45", margem_pct: null });
    expect(normalizado.venda_mes_loja).toBe(123.45);
    expect(normalizado.margem_pct).toBeNull();
  });

  it("usa a carga mais recente e cria nomes únicos válidos para abas", () => {
    expect(dataBaseMaisRecente([
      { store_id: "1", loja: "A", dias: 30, eans: 1, vendas: 1, atualizado_em: "2026-10-01T10:00:00Z" },
      { store_id: "2", loja: "B", dias: 30, eans: 1, vendas: 1, atualizado_em: "2026-11-01T10:00:00Z" },
    ])).toBe("2026-11-01T10:00:00Z");
    const usados = new Set<string>();
    expect(nomeAbaCategoria("A/B: Categoria muito longa para caber na planilha", usados).length).toBeLessThanOrEqual(31);
    const primeiro = nomeAbaCategoria("AVES", usados);
    const segundo = nomeAbaCategoria("AVES", usados);
    expect(primeiro).not.toBe(segundo);
  });
});
