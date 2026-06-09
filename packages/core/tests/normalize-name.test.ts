import { describe, expect, it } from "vitest";
import { normalizeName } from "../src/dictionary";

describe("normalizeName", () => {
  it("uppercaseа y trimea", () => {
    expect(normalizeName("  leche  ")).toBe("LECHE");
  });
  it("quita tildes pero preserva Ñ", () => {
    expect(normalizeName("café piña")).toBe("CAFE PIÑA");
    expect(normalizeName("AÑEJO")).toBe("AÑEJO");
  });
  it("reemplaza puntuación y símbolos por espacio", () => {
    expect(normalizeName("Leche,Alpina/1.1L")).toBe("LECHE ALPINA 1 1L");
  });
  it("colapsa espacios múltiples", () => {
    expect(normalizeName("LECHE     ALPINA")).toBe("LECHE ALPINA");
  });
  it("expande abreviaturas por token, no substring", () => {
    expect(normalizeName("LCH ALPINA")).toBe("LECHE ALPINA");
    expect(normalizeName("LCH DESLAC")).toBe("LECHE DESLACTOSADA");
    // GAS está en el seed → GASEOSA. Pero no debe tocar "GASOLINA".
    expect(normalizeName("GAS NATURAL")).toBe("GASEOSA NATURAL");
    expect(normalizeName("GASOLINA")).toBe("GASOLINA");
  });
  it("es idempotente", () => {
    const once = normalizeName("LCH Deslac Alpina 1L");
    expect(normalizeName(once)).toBe(once);
  });
  it("devuelve string vacío para entrada vacía o solo símbolos", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(",.;:")).toBe("");
  });
});
