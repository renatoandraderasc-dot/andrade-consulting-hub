import { describe, it, expect } from "vitest";
import { selectedModules, moduleAccessChanges } from "./userAccessEdit";
import { readAllPages } from "../../supabase/functions/admin-users/access";

describe("Preservação das telas autorizadas", () => {
  const catalog = ["dashboard", "escala", "pic"];
  const rows = [{ module: "escala", allowed: true }, { module: "pic", allowed: false }, { module: "legacy", allowed: true }];

  it("abrir e salvar sem mudar acessos não envia alterações", () => {
    expect(moduleAccessChanges(rows, selectedModules(rows, catalog), catalog)).toEqual([]);
  });
  it("não desmarca telas quando o usuário não tem restrições salvas", () => {
    expect(selectedModules([], catalog)).toEqual(catalog);
    expect(moduleAccessChanges([], catalog, catalog)).toEqual([]);
  });
  it("alterar uma tela preserva as outras autorizações", () => {
    expect(moduleAccessChanges(rows, ["escala", "pic", "legacy"], catalog)).toEqual([{ module: "pic", allowed: true }]);
  });
  it("restringir usuário sem restrições grava seleção explícita", () => {
    expect(moduleAccessChanges([], ["escala"], catalog)).toEqual([
      { module: "dashboard", allowed: false }, { module: "escala", allowed: true }, { module: "pic", allowed: false },
    ]);
  });
  it("carrega permissões além do limite de mil registros", async () => {
    const all = Array.from({ length: 1021 }, (_, i) => ({ module: `tela-${i}`, allowed: true }));
    const loaded = await readAllPages(async (from, to) => ({ data: all.slice(from, to + 1), error: null }));
    expect(loaded).toHaveLength(1021);
    expect(loaded[1020]).toEqual({ module: "tela-1020", allowed: true });
  });
  it("falha de leitura não é interpretada como lista vazia", async () => {
    await expect(readAllPages(async () => ({ data: null, error: { message: "indisponível" } }))).rejects.toThrow("indisponível");
  });
});