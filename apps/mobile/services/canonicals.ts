import type { CreateCanonicalInput } from "@oraculo/validations";
import { supabase } from "../lib/supabase";

export interface Canonical {
  id: string;
  name: string;
}

/** INSERT directo a canonical_products. La RLS valida pertenencia al hogar. */
export async function createCanonical(
  householdId: string,
  input: CreateCanonicalInput,
): Promise<Canonical> {
  const { data, error } = await supabase
    .from("canonical_products")
    .insert({
      household_id: householdId,
      name: input.name,
      brand: input.brand ?? null,
      presentation: input.presentation ?? null,
      unit: input.unit,
      unit_quantity: input.unitQuantity,
      category_id: input.categoryId,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo crear el producto");
  return { id: data.id as string, name: data.name as string };
}
