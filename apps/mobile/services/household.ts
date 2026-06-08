import { supabase } from "../lib/supabase";

export interface Household {
  id: string;
  name: string;
}

/**
 * Devuelve el primer hogar visible para el usuario (RLS solo muestra los suyos).
 * El hogar lo crea el trigger handle_new_user al registrarse (email u OAuth).
 */
export async function getActiveHousehold(): Promise<Household | null> {
  const { data, error } = await supabase
    .from("households")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer el hogar: ${error.message}`);
  }
  return data ?? null;
}
