import { z } from "zod";

// Las variables EXPO_PUBLIC_* se inyectan en tiempo de build por Expo.
const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  throw new Error(
    "Variables de entorno EXPO_PUBLIC_SUPABASE_* faltantes o inválidas. " +
      "Copia apps/mobile/.env.example a apps/mobile/.env.local y rellénalas.",
  );
}

export const env = parsed.data;
