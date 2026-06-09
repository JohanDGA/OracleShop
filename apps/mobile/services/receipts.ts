import type { ManualReceiptInput } from "@oraculo/validations";
import { supabase } from "../lib/supabase";

/** Crea una factura manual vía la RPC atómica v2. Persiste alias si el ítem trae canonical. */
export async function createManualReceipt(
  householdId: string,
  input: ManualReceiptInput,
): Promise<string> {
  const items = input.items.map((i) => ({
    raw_name: i.rawName,
    quantity: i.quantity,
    unit: null,
    unit_price: i.unitPrice,
    total_price: i.totalPrice,
    category_id: i.categoryId,
    canonical_product_id: i.canonicalProductId ?? null,
    alias_normalized: i.aliasNormalized ?? null,
  }));
  const { data, error } = await supabase.rpc("create_receipt_with_items", {
    p_household_id: householdId,
    p_store_id: input.storeId,
    p_purchased_at: input.purchasedAt,
    p_currency: input.currency,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
