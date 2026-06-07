import { supabase } from "../lib/supabase";

export interface Household {
  id: string;
  name: string;
}

/**
 * Crea el hogar inicial del usuario recién registrado y lo deja como owner.
 * Debe llamarse con una sesión activa (el usuario autenticado es el creador).
 */
export async function bootstrapHousehold(userId: string, householdName: string): Promise<Household> {
  const { data: household, error: hErr } = await supabase
    .from("households")
    .insert({ name: householdName, created_by: userId })
    .select("id, name")
    .single();
  if (hErr || !household) {
    throw new Error(`No se pudo crear el hogar: ${hErr?.message ?? "desconocido"}`);
  }

  const { error: mErr } = await supabase.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "owner",
  });
  if (mErr) {
    throw new Error(`No se pudo registrar la membresía: ${mErr.message}`);
  }

  const { error: sErr } = await supabase.from("user_settings").insert({
    user_id: userId,
    active_household_id: household.id,
  });
  if (sErr) {
    throw new Error(`No se pudo crear la configuración: ${sErr.message}`);
  }

  return household;
}

/**
 * Devuelve el primer hogar visible para el usuario (RLS solo muestra los suyos).
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
