import { z } from "zod";

/**
 * Email normalizado (minúsculas + trim) y validado.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido");

/**
 * Password de registro: mínimo 8 caracteres, al menos una letra y un número.
 */
const strongPassword = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número");

export const signUpSchema = z.object({
  email,
  password: strongPassword,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
