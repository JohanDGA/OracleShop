import { supabase } from "../lib/supabase";

export interface Household {
  id: string;
  name: string;
}

/**
 * Crea el hogar inicial del usuario recién registrado y lo deja como owner.
 * Debe llamarse con una sesión activa (el usuario autenticado es el creador).
 *
 * NOTA (no atómico): el cliente Supabase no envuelve los tres INSERT en una
 * transacción. Si falla un paso intermedio, puede quedar estado parcial (p.ej.
 * un hogar sin membresía). La RLS lo deja visible solo para el creador
 * (is_household_creator), así que getActiveHousehold lo recupera; aun así, la
 * versión transaccional definitiva vivirá en el Core API (hito posterior).
 */
export async function bootstrapHousehold(userId: string, householdName: string): Promise<Household> {
  // INSERT sin RETURNING: usar `.select()` aquí dispara un RETURNING cuya policy
  // de SELECT (is_household_creator) NO ve la fila a mitad del statement
  // (visibilidad a nivel de comando en Postgres) → 403. Insertamos y luego
  // leemos por separado (post-commit), donde la policy del creador ya la ve.
  const { error: hErr } = await supabase
    .from("households")
    .insert({ name: householdName, created_by: userId });
  if (hErr) {
    throw new Error(`No se pudo crear el hogar: ${hErr.message}`);
  }

  const { data: household, error: readErr } = await supabase
    .from("households")
    .select("id, name")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (readErr || !household) {
    throw new Error(`No se pudo leer el hogar creado: ${readErr?.message ?? "no encontrado"}`);
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
