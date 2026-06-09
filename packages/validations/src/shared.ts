import { z } from "zod";

/** Cantidad NUMERIC(10,4): hasta 6 enteros + 4 decimales, > 0. */
export const positiveQuantity = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");
