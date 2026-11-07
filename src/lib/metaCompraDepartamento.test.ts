import { expect, it } from "vitest";
import { somarMetasDepartamento } from "./metaCompraDepartamento";
it("não duplica a meta do comprador no limite de compras", () => {
  expect(somarMetasDepartamento([
    { departamento: "AÇOUGUE", meta_compra: 300 },
    { departamento: "MERCEARIA", meta_compra: 700 },
    { departamento: "LOJA", meta_compra: 1000 },
    { departamento: "GERAL", meta_compra: 1000 },
  ])).toBe(1000);
});