import { describe, expect, it } from "vitest";
import { receiptItemSchema } from "../src/receipt";

describe("receiptItemSchema con canonical opcional", () => {
  const baseItem = {
    rawName: "Leche Alpina",
    quantity: "1",
    unitPrice: "5000",
    totalPrice: "5000",
    categoryId: null,
  };

  it("acepta ítem sin canonical (ambos campos ausentes o null)", () => {
    expect(receiptItemSchema.safeParse(baseItem).success).toBe(true);
    expect(
      receiptItemSchema.safeParse({ ...baseItem, canonicalProductId: null, aliasNormalized: null }).success,
    ).toBe(true);
  });

  it("acepta ítem con canonical + alias_normalized juntos", () => {
    expect(
      receiptItemSchema.safeParse({
        ...baseItem,
        canonicalProductId: "00000000-0000-0000-0000-000000000001",
        aliasNormalized: "LECHE ALPINA",
      }).success,
    ).toBe(true);
  });

  it("rechaza ítem con canonical pero sin alias_normalized", () => {
    expect(
      receiptItemSchema.safeParse({
        ...baseItem,
        canonicalProductId: "00000000-0000-0000-0000-000000000001",
        aliasNormalized: null,
      }).success,
    ).toBe(false);
  });
});
