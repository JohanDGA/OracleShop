import { z } from "zod";
import { positiveAmount, isoDate } from "./expense";

/** Cantidad: string numérico > 0 (hasta 4 decimales para peso variable). */
const positiveQuantity = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");

/** Precio no negativo (puede ser 0 en líneas promocionales). */
const nonNegativeAmount = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Precio inválido");

export const receiptItemSchema = z.object({
  rawName: z.string().trim().min(1, "El nombre del ítem es obligatorio").max(200),
  quantity: positiveQuantity,
  unitPrice: nonNegativeAmount,
  totalPrice: positiveAmount,
  categoryId: z.string().uuid().nullable(),
});

export const manualReceiptSchema = z.object({
  storeId: z.string().uuid().nullable(),
  purchasedAt: isoDate,
  currency: z.string().length(3),
  items: z.array(receiptItemSchema).min(1, "La factura necesita al menos un ítem"),
});

export type ReceiptItemInput = z.infer<typeof receiptItemSchema>;
export type ManualReceiptInput = z.infer<typeof manualReceiptSchema>;
