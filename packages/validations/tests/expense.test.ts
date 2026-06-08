import { describe, expect, it } from "vitest";
import { manualExpenseSchema } from "../src/expense";
import { categoryCreateSchema } from "../src/category";
import { manualReceiptSchema, receiptItemSchema } from "../src/receipt";

describe("manualExpenseSchema", () => {
  it("acepta un gasto válido", () => {
    const r = manualExpenseSchema.safeParse({
      amount: "12500.00",
      categoryId: "11111111-1111-1111-1111-111111111111",
      description: "Almuerzo",
      occurredAt: "2026-06-07",
    });
    expect(r.success).toBe(true);
  });
  it("acepta categoryId null y descripción vacía/omitida", () => {
    const r = manualExpenseSchema.safeParse({ amount: "1000", categoryId: null, occurredAt: "2026-06-07" });
    expect(r.success).toBe(true);
  });
  it("rechaza monto <= 0 o no numérico", () => {
    expect(manualExpenseSchema.safeParse({ amount: "0", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
    expect(manualExpenseSchema.safeParse({ amount: "-5", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
    expect(manualExpenseSchema.safeParse({ amount: "abc", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
  });
  it("rechaza fecha inválida", () => {
    expect(manualExpenseSchema.safeParse({ amount: "10", categoryId: null, occurredAt: "07/06/2026" }).success).toBe(false);
  });
});

describe("categoryCreateSchema", () => {
  it("acepta nombre y color hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "Mascotas", color: "#22c55e" }).success).toBe(true);
  });
  it("rechaza nombre vacío y color no-hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "", color: "#22c55e" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "X", color: "verde" }).success).toBe(false);
  });
});

describe("receiptItemSchema / manualReceiptSchema", () => {
  const item = { rawName: "Leche", quantity: "1", unitPrice: "5000", totalPrice: "5000", categoryId: null };
  it("acepta un ítem válido", () => {
    expect(receiptItemSchema.safeParse(item).success).toBe(true);
  });
  it("acepta una factura con al menos un ítem", () => {
    const r = manualReceiptSchema.safeParse({
      storeId: null,
      purchasedAt: "2026-06-07",
      currency: "COP",
      items: [item],
    });
    expect(r.success).toBe(true);
  });
  it("rechaza factura sin ítems", () => {
    expect(manualReceiptSchema.safeParse({ storeId: null, purchasedAt: "2026-06-07", currency: "COP", items: [] }).success).toBe(false);
  });
});
