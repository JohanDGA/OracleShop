import { describe, expect, it } from "vitest";
import { toMinorUnits, fromMinorUnits, sumAmounts, formatCOP } from "../src/money";

describe("toMinorUnits / fromMinorUnits", () => {
  it("convierte enteros", () => {
    expect(toMinorUnits("1234")).toBe(12340000n);
    expect(fromMinorUnits(12340000n)).toBe("1234.0000");
  });
  it("convierte con decimales (rellena a escala 4)", () => {
    expect(toMinorUnits("1234.56")).toBe(12345600n);
    expect(toMinorUnits("0.1")).toBe(1000n);
  });
  it("trunca fracciones de más de 4 decimales", () => {
    expect(toMinorUnits("1.23456")).toBe(12345n);
  });
  it("maneja negativos", () => {
    expect(toMinorUnits("-5.00")).toBe(-50000n);
    expect(fromMinorUnits(-50000n)).toBe("-5.0000");
  });
  it("round-trip", () => {
    expect(fromMinorUnits(toMinorUnits("999.9999"))).toBe("999.9999");
  });
});

describe("sumAmounts", () => {
  it("suma exacta sin error de float", () => {
    expect(sumAmounts(["0.1", "0.2"])).toBe("0.3000");
  });
  it("lista vacía es 0", () => {
    expect(sumAmounts([])).toBe("0.0000");
  });
  it("suma varios", () => {
    expect(sumAmounts(["1000.00", "250.50", "0.50"])).toBe("1251.0000");
  });
});

describe("formatCOP", () => {
  it("formatea como peso colombiano sin decimales", () => {
    const out = formatCOP("1234567.00");
    expect(out).toContain("1.234.567");
  });
});
