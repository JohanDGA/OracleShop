import { supabase } from "../lib/supabase";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  householdId: string | null;
}

/** Categorías visibles: del sistema (household_id null) + del hogar. */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, color, icon, household_id")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    color: c.color as string,
    icon: c.icon as string | null,
    householdId: c.household_id as string | null,
  }));
}

/** Crea una categoría personalizada del hogar y la devuelve. */
export async function createCategory(
  householdId: string,
  name: string,
  color: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ household_id: householdId, name, color })
    .select("id, name, color, icon, household_id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la categoría");
  }
  return {
    id: data.id as string,
    name: data.name as string,
    color: data.color as string,
    icon: data.icon as string | null,
    householdId: data.household_id as string | null,
  };
}
