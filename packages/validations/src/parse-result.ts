import { z } from "zod";

const moneyString = z.string().regex(/^\d{1,11}(\.\d{1,4})?$/, "Monto inválido");
const quantityString = z.string().regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha ISO inválida (YYYY-MM-DD)");

export const parseResultItemSchema = z.object({
  raw_name: z.string().trim().min(1).max(200),
  quantity: quantityString,
  unit: z.enum(["lt", "kg", "un"]).nullable(),
  unit_price: moneyString,
  regular_price: moneyString.nullable(),
  is_promo: z.boolean(),
  total_price: moneyString,
  suggested_canonical_id: z.string().uuid().nullable(),
  match_confidence: z.number().min(0).max(1).nullable(),
});

export const parseResultSchema = z.object({
  store_name: z.string().trim().min(1).max(200).nullable(),
  purchased_at: isoDate,
  total: moneyString,
  currency: z.literal("COP"),
  items: z.array(parseResultItemSchema),
});

export type ParseResultItemValidated = z.infer<typeof parseResultItemSchema>;
export type ParseResultValidated = z.infer<typeof parseResultSchema>;
