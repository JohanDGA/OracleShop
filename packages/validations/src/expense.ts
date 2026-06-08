import { z } from "zod";

/** Monto monetario positivo como string NUMERIC(15,4): dígitos con hasta 4 decimales. */
export const positiveAmount = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Monto inválido")
  .refine((s) => Number(s) > 0, "El monto debe ser mayor que 0");

/** Fecha en formato ISO YYYY-MM-DD. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Fecha inválida");

export const manualExpenseSchema = z.object({
  amount: positiveAmount,
  categoryId: z.string().uuid().nullable(),
  description: z.string().max(200).optional(),
  occurredAt: isoDate,
});

export type ManualExpenseInput = z.infer<typeof manualExpenseSchema>;
