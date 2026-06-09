import { describe, expect, it } from "vitest";
import { createCanonicalSchema } from "../src/canonical";

const base = {
  name: "Leche Alpina 1L",
  brand: "Alpina",
  presentation: "Caja 1L",
  unit: "lt" as const,
  unitQuantity: "1",
  categoryId: null,
};

describe("createCanonicalSchema", () => {
  it("acepta input válido con unit lt/kg/un", () => {
    expect(createCanonicalSchema.safeParse(base).success).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, unit: "kg", unitQuantity: "0.5" }).success).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, unit: "un", unitQuantity: "12" }).success).toBe(true);
  });

  it("rechaza unidad fuera del set", () => {
    expect(createCanonicalSchema.safeParse({ ...base, unit: "ml" }).success).toBe(false);
  });

  it("rechaza unitQuantity <= 0", () => {
    expect(createCanonicalSchema.safeParse({ ...base, unitQuantity: "0" }).success).toBe(false);
    expect(createCanonicalSchema.safeParse({ ...base, unitQuantity: "-1" }).success).toBe(false);
  });

  it("rechaza name vacío o solo espacios", () => {
    expect(createCanonicalSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(createCanonicalSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("brand y presentation son opcionales (pueden ser null o ausentes)", () => {
    expect(
      createCanonicalSchema.safeParse({
        name: base.name,
        unit: base.unit,
        unitQuantity: base.unitQuantity,
        categoryId: null,
      }).success,
    ).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, brand: null, presentation: null }).success).toBe(true);
  });
});
