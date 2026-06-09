import { describe, expect, it } from "vitest";
import { toMinorUnits } from "../src/money";
import { pricePerStandardUnit } from "../src/dictionary";

const minor = (s: string) => toMinorUnits(s);

describe("pricePerStandardUnit", () => {
  it("Leche 1L que cuesta $5000 → $5000/lt", () => {
    const result = pricePerStandardUnit({
      unit: "lt",
      unitQuantity: minor("1"),
      quantity: minor("1"),
      totalPrice: minor("5000"),
    });
    expect(result).toBe(minor("5000"));
  });

  it("Leche 900ml (=0.9L) que cuesta $4800 → $5333.3333/lt (precision BigInt)", () => {
    const result = pricePerStandardUnit({
      unit: "lt",
      unitQuantity: minor("0.9"),
      quantity: minor("1"),
      totalPrice: minor("4800"),
    });
    // 4800 / 0.9 = 5333.333...  → en escala 4: 53333333n
    expect(result).toBe(53333333n);
  });

  it("2 unidades de 500g (=1kg total) que cuestan $10000 → $10000/kg", () => {
    const result = pricePerStandardUnit({
      unit: "kg",
      unitQuantity: minor("0.5"),
      quantity: minor("2"),
      totalPrice: minor("10000"),
    });
    expect(result).toBe(minor("10000"));
  });

  it("3 unidades de jabón a $3000 total → $1000/un", () => {
    const result = pricePerStandardUnit({
      unit: "un",
      unitQuantity: minor("1"),
      quantity: minor("3"),
      totalPrice: minor("3000"),
    });
    expect(result).toBe(minor("1000"));
  });

  it("retorna null si quantity es 0", () => {
    expect(
      pricePerStandardUnit({
        unit: "lt",
        unitQuantity: minor("1"),
        quantity: 0n,
        totalPrice: minor("100"),
      }),
    ).toBeNull();
  });

  it("retorna null si unit_quantity es 0", () => {
    expect(
      pricePerStandardUnit({
        unit: "lt",
        unitQuantity: 0n,
        quantity: minor("1"),
        totalPrice: minor("100"),
      }),
    ).toBeNull();
  });

  it("preserva tipo bigint (no Number)", () => {
    const result = pricePerStandardUnit({
      unit: "un",
      unitQuantity: minor("1"),
      quantity: minor("1"),
      totalPrice: minor("123.4567"),
    });
    expect(typeof result).toBe("bigint");
  });
});
