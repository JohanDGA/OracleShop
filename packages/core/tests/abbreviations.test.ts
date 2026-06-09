import { describe, expect, it } from "vitest";
import { ABBREVIATIONS } from "../src/abbreviations";

describe("ABBREVIATIONS seed", () => {
  it("mapea las abreviaturas comunes del mercado colombiano", () => {
    expect(ABBREVIATIONS["LCH"]).toBe("LECHE");
    expect(ABBREVIATIONS["DESLAC"]).toBe("DESLACTOSADA");
    expect(ABBREVIATIONS["ACEIT"]).toBe("ACEITE");
  });
  it("no tiene claves duplicadas implícitas (todas mapean a strings no vacíos)", () => {
    for (const [k, v] of Object.entries(ABBREVIATIONS)) {
      expect(k).toMatch(/^[A-ZÑ0-9]+$/);
      expect(v.length).toBeGreaterThan(0);
      expect(v).toMatch(/^[A-ZÑ0-9 ]+$/);
    }
  });
  it("contiene al menos 20 entradas curadas", () => {
    expect(Object.keys(ABBREVIATIONS).length).toBeGreaterThanOrEqual(20);
  });
});
