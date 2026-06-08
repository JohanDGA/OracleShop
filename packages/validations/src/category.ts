import { z } from "zod";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#RRGGBB)");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(50),
  color: hexColor,
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
