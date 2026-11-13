import { describe, expect, it } from "vitest";
import { completarDepartamentos } from "./comprasDepartamentos";

describe("todos os departamentos em Compras × Vendas", () => {
  it("preserva movimentos fora da configuração e inclui departamentos sem movimento", () => {
    const linhas = [{ secao: "MATERIAIS PARA USO", compra: 12975.31, venda: 22.30 },
      { secao: "ATIVO IMOBILIZADO", compra: 338.02, venda: 19.96 }];
    const resultado = completarDepartamentos(linhas, ["ACOUGUE", "ATIVO IMOBILIZADO"], () => true);
    expect(resultado).toEqual([...linhas, { departamento: "ACOUGUE" }]);
  });
  it("não duplica departamentos por caixa ou acento", () => {
    expect(completarDepartamentos([{ secao: "AÇOUGUE", compra: 114481.61 }], ["acougue"], () => true)).toHaveLength(1);
  });
  it("mantém a restrição de acesso aos departamentos", () => {
    expect(completarDepartamentos([{ secao: "LIMPEZA", compra: 10 }], ["PADARIA", "LIMPEZA"], (nome) => nome === "PADARIA"))
      .toEqual([{ departamento: "PADARIA" }]);
  });
});