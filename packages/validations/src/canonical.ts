import { z } from "zod";
import { positiveQuantity } from "./shared";

export const createCanonicalSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  brand: z.string().trim().max(120).nullable().optional(),
  presentation: z.string().trim().max(120).nullable().optional(),
  unit: z.enum(["lt", "kg", "un"], { errorMap: () => ({ message: "Unidad inválida" }) }),
  unitQuantity: positiveQuantity,
  categoryId: z.string().uuid().nullable(),
});

export type CreateCanonicalInput = z.infer<typeof createCanonicalSchema>;
