import { describe, expect, it } from "vitest";
import { restoreSelectedStore, saveSelectedStore } from "./selectedStore";

function storage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => { data.delete(key); },
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe("client selection across tabs", () => {
  it("opens a new tab on the selected client, not Bom de Preço", () => {
    const first = storage(), second = storage(), local = storage();
    restoreSelectedStore("renato", first, local);
    saveSelectedStore("f-silva", first, local);
    expect(restoreSelectedStore("renato", second, local)).toBe("f-silva");
    expect(second.getItem("selectedStoreId")).toBe("f-silva");
  });
  it("does not switch another open tab or erase its current context", () => {
    const first = storage(), second = storage(), local = storage();
    restoreSelectedStore("renato", first, local);
    saveSelectedStore("f-silva", first, local);
    restoreSelectedStore("renato", second, local);
    saveSelectedStore("medeiros", second, local);
    expect(first.getItem("selectedStoreId")).toBe("f-silva");
    expect(restoreSelectedStore("renato", storage(), local)).toBe("medeiros");
  });
  it("does not reuse another user's selected store", () => {
    const session = storage(), local = storage();
    restoreSelectedStore("renato", session, local);
    saveSelectedStore("f-silva", session, local);
    expect(restoreSelectedStore("gabriel", session, local)).toBeNull();
    expect(session.getItem("selectedStoreId")).toBeNull();
    expect(restoreSelectedStore("renato", session, local)).toBe("f-silva");
  });
  it("preserves the store selected before this correction", () => {
    const session = storage(), local = storage();
    session.setItem("selectedStoreId", "f-silva");
    expect(restoreSelectedStore("renato", session, local)).toBe("f-silva");
    expect(restoreSelectedStore("renato", storage(), local)).toBe("f-silva");
  });
});