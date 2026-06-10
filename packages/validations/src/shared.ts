import { z } from "zod";

/** Cantidad NUMERIC(10,4): hasta 6 enteros + 4 decimales, > 0. */
export const positiveQuantity = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");

/** Monto NUMERIC(15,4): hasta 11 enteros + 4 decimales. NO valida > 0. */
export const moneyString = z.string().regex(/^\d{1,11}(\.\d{1,4})?$/, "Monto inválido");

/** Cantidad NUMERIC(10,4): hasta 6 enteros + 4 decimales. NO valida > 0. */
export const quantityString = z.string().regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida");

/** Fecha ISO YYYY-MM-DD con validación de calendario (rechaza 2026-02-30). */
export const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha ISO inválida (YYYY-MM-DD)")
  .refine((s) => {
    const [year, month, day] = s.split("-").map(Number) as [number, number, number];
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
  }, "Fecha calendario inválida");
