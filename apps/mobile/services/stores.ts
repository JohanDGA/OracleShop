import { supabase } from "../lib/supabase";

export interface Store {
  id: string;
  name: string;
}

export async function listStores(householdId: string): Promise<Store[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string }));
}

export async function createStore(householdId: string, name: string): Promise<Store> {
  const { data, error } = await supabase
    .from("stores")
    .insert({ household_id: householdId, name })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la tienda");
  return { id: data.id as string, name: data.name as string };
}
