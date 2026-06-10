import { z } from "zod";
import { moneyString, quantityString, isoDateString } from "./shared";

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
  purchased_at: isoDateString,
  total: moneyString,
  currency: z.literal("COP"),
  items: z.array(parseResultItemSchema),
});

export type ParseResultItemValidated = z.infer<typeof parseResultItemSchema>;
export type ParseResultValidated = z.infer<typeof parseResultSchema>;
