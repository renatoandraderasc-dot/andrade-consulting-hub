import { describe, expect, it } from "vitest";
import { APP_MODULES } from "@/lib/modules";
import { createDemoState, DEPARTMENTS, demoTotals, filterProducts, isDemoState, margin, productSales } from "./model";
import { DEMO_EXTRA_ROUTES, demoDomain } from "./routes";
import { duracaoLiquidaTurno } from "@/lib/escala/escala-motor";

describe("fictional supermarket demonstration", () => {
  const state = createDemoState();
  const filters = { month: 10, year: 2026, department: "", search: "" };
  it("populates every module's domain with fictional records", () => {
    expect(state.products.length).toBeGreaterThan(0);
    expect(state.entries.length).toBeGreaterThan(0);
    expect(state.employees.length).toBeGreaterThan(0);
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.receipts.length).toBeGreaterThan(0);
    expect(state.campaigns.length).toBeGreaterThan(0);
    expect(state.equipment.length).toBeGreaterThan(0);
    expect(state.users.length).toBeGreaterThan(0);
    expect(state.flyer.length).toBeGreaterThan(0);
    for (const d of DEPARTMENTS) expect(state.products.some(p => p.department === d)).toBe(true);
  });
  it("all twelve months have sales, expenses, receipts and a prefilled schedule", () => {
    for (let month = 1; month <= 12; month++) {
      expect(demoTotals(state, { ...filters, month }).sales).toBeGreaterThan(0);
      const prefix = `2026-${String(month).padStart(2, "0")}`;
      expect(state.entries.some(e => e.date.startsWith(prefix))).toBe(true);
      expect(state.receipts.some(e => e.date.startsWith(prefix))).toBe(true);
      expect(state.allocations.filter(a => a.data.startsWith(prefix)).length).toBe(16 * new Date(2026, month, 0).getDate());
    }
  });
  it("returns coherent totals after an editable product price changes", () => {
    const before = demoTotals(state, filters);
    const first = state.products[0];
    const changed = { ...state, products: state.products.map(p => p.id === first.id ? { ...p, price: p.price + 1 } : p) };
    const after = demoTotals(changed, filters);
    expect(after.sales - before.sales).toBeCloseTo(productSales(first, 10, 2026).quantity, 2);
    expect(after.cost).toBe(before.cost);
  });
  it("filters product codes and department without including another department", () => {
    expect(filterProducts(state, { ...filters, department: "Mercearia", search: "10001" }).map(p => p.id)).toEqual(["10001"]);
    expect(filterProducts(state, { ...filters, department: "Açougue", search: "10001" })).toEqual([]);
  });
  it("calculates club margin from club price, not ordinary sale price", () => {
    expect(margin(20, 15)).toBe(25);
    expect(margin(25, 15)).toBe(40);
  });
  it("working hours deduct the interval", () => {
    expect(duracaoLiquidaTurno({ id: "demo", codigo: "", inicio: "06:00", fim: "14:00", intervalo_min: 60 })).toBe(420);
  });
  it("identifies a workspace payload and rejects incomplete persisted content", () => {
    expect(isDemoState(state)).toBe(true);
    expect(isDemoState({ version: 1, products: [] })).toBe(false);
    expect(isDemoState(null)).toBe(false);
  });
  it("maps all registered screen paths without production implementations", () => {
    for (const path of [...APP_MODULES.map(m => m.path), ...Object.keys(DEMO_EXTRA_ROUTES)]) expect(["dashboard", "finance", "commercial", "marketing", "workforce", "operations", "admin"]).toContain(demoDomain(path));
    expect(demoDomain("/recebimento/nf1")).toBe("operations");
    expect(demoDomain("/tv/aurora")).toBe("marketing");
    expect(demoDomain("/admin/users")).toBe("admin");
  });
});