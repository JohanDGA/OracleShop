import { z } from "zod";
import { positiveAmount, isoDate } from "./expense";

/** Cantidad NUMERIC(10,4): hasta 6 enteros + 4 decimales, > 0 (peso variable). */
const positiveQuantity = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");

/** Precio NUMERIC(15,4) no negativo (puede ser 0 en líneas promocionales). */
const nonNegativeAmount = z
  .string()
  .regex(/^\d{1,11}(\.\d{1,4})?$/, "Precio inválido");

export const receiptItemSchema = z
  .object({
    rawName: z.string().trim().min(1, "El nombre del ítem es obligatorio").max(200),
    quantity: positiveQuantity,
    unitPrice: nonNegativeAmount,
    totalPrice: positiveAmount,
    categoryId: z.string().uuid().nullable(),
    canonicalProductId: z.string().uuid().nullable().optional(),
    aliasNormalized: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine(
    (item) => {
      const hasCanonical = item.canonicalProductId != null;
      const hasAlias = item.aliasNormalized != null && item.aliasNormalized !== "";
      // O ambos presentes o ambos ausentes
      return hasCanonical === hasAlias;
    },
    { message: "canonicalProductId requiere aliasNormalized (y viceversa)" },
  );

export const manualReceiptSchema = z.object({
  storeId: z.string().uuid().nullable(),
  purchasedAt: isoDate,
  currency: z.string().regex(/^[A-Z]{3}$/, "Moneda inválida (ISO 4217, p.ej. COP)"),
  items: z.array(receiptItemSchema).min(1, "La factura necesita al menos un ítem"),
});

export type ReceiptItemInput = z.infer<typeof receiptItemSchema>;
export type ManualReceiptInput = z.infer<typeof manualReceiptSchema>;
