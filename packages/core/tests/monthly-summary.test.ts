import { describe, expect, it } from "vitest";
import { computeMonthlySummary, type SpendingLine } from "../src/monthly-summary";

describe("computeMonthlySummary", () => {
  it("lista vacía: total 0 y sin categorías, sin dividir por cero", () => {
    const r = computeMonthlySummary([]);
    expect(r.total).toBe("0.0000");
    expect(r.byCategory).toEqual([]);
  });

  it("una categoría", () => {
    const lines: SpendingLine[] = [{ categoryId: "a", amount: "100.00" }];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("100.0000");
    expect(r.byCategory).toEqual([{ categoryId: "a", total: "100.0000", percent: 100 }]);
  });

  it("varias categorías ordenadas por monto desc", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "30.00" },
      { categoryId: "b", amount: "70.00" },
    ];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("100.0000");
    expect(r.byCategory[0]).toEqual({ categoryId: "b", total: "70.0000", percent: 70 });
    expect(r.byCategory[1]).toEqual({ categoryId: "a", total: "30.0000", percent: 30 });
  });

  it("agrupa líneas de la misma categoría y las sin categoría (null)", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "10.00" },
      { categoryId: "a", amount: "5.00" },
      { categoryId: null, amount: "5.00" },
    ];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("20.0000");
    const a = r.byCategory.find((c) => c.categoryId === "a");
    const none = r.byCategory.find((c) => c.categoryId === null);
    expect(a?.total).toBe("15.0000");
    expect(none?.total).toBe("5.0000");
  });

  it("porcentajes redondeados suman aproximadamente 100", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "33.33" },
      { categoryId: "b", amount: "33.33" },
      { categoryId: "c", amount: "33.34" },
    ];
    const r = computeMonthlySummary(lines);
    const sum = r.byCategory.reduce((s, c) => s + c.percent, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});
