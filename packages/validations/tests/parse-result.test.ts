import { describe, expect, it } from "vitest";
import { parseResultSchema } from "../src/parse-result";

const validItem = {
  raw_name: "Leche Alpina 1L",
  quantity: "1",
  unit: "lt",
  unit_price: "5000",
  regular_price: null,
  is_promo: false,
  total_price: "5000",
  suggested_canonical_id: null,
  match_confidence: null,
};
const validReceipt = {
  store_name: "Éxito Calle 80",
  purchased_at: "2026-06-09",
  total: "5000",
  currency: "COP",
  items: [validItem],
};

describe("parseResultSchema", () => {
  it("acepta un parse result válido completo", () => {
    expect(parseResultSchema.safeParse(validReceipt).success).toBe(true);
  });

  it("acepta items con unit null y suggested_canonical_id null", () => {
    const r = { ...validReceipt, items: [{ ...validItem, unit: null, suggested_canonical_id: null }] };
    expect(parseResultSchema.safeParse(r).success).toBe(true);
  });

  it("acepta item con descuento (regular_price + is_promo)", () => {
    const r = {
      ...validReceipt,
      items: [{ ...validItem, regular_price: "6000", is_promo: true }],
    };
    expect(parseResultSchema.safeParse(r).success).toBe(true);
  });

  it("rechaza currency distinto de COP en v1", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, currency: "USD" }).success).toBe(false);
  });

  it("rechaza unit fuera del set lt/kg/un", () => {
    const r = { ...validReceipt, items: [{ ...validItem, unit: "ml" }] };
    expect(parseResultSchema.safeParse(r).success).toBe(false);
  });

  it("rechaza purchased_at no-ISO date", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, purchased_at: "09/06/2026" }).success).toBe(false);
  });

  it("rechaza match_confidence > 1 o < 0", () => {
    const r1 = { ...validReceipt, items: [{ ...validItem, match_confidence: 1.5 }] };
    expect(parseResultSchema.safeParse(r1).success).toBe(false);
    const r2 = { ...validReceipt, items: [{ ...validItem, match_confidence: -0.1 }] };
    expect(parseResultSchema.safeParse(r2).success).toBe(false);
  });

  it("acepta items vacío (factura ilegible que igual responde estructura)", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, items: [] }).success).toBe(true);
  });
});
