import type { ManualReceiptInput } from "@oraculo/validations";
import type { ParseResult } from "@oraculo/core";
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

export interface ScannedReceiptItem {
  rawName: string;
  quantity: string;
  unit: "lt" | "kg" | "un" | null;
  unitPrice: string;
  regularPrice: string | null;
  isPromo: boolean;
  totalPrice: string;
  categoryId: string | null;
  canonicalProductId: string | null;
  aliasNormalized: string | null;
}

export interface ScannedReceiptInput {
  storeId: string | null;
  purchasedAt: string;
  currency: string;
  items: ScannedReceiptItem[];
}

/**
 * Persiste un ParseResult como factura source='photo_ai'. Los items pueden traer
 * canonical_product_id + alias_normalized si el caller los confirmó vía ProductPicker.
 */
export async function createScannedReceipt(
  householdId: string,
  input: ScannedReceiptInput,
): Promise<string> {
  const items = input.items.map((i) => ({
    raw_name: i.rawName,
    quantity: i.quantity,
    unit: i.unit,
    unit_price: i.unitPrice,
    regular_price: i.regularPrice,
    is_promo: i.isPromo,
    total_price: i.totalPrice,
    category_id: i.categoryId,
    canonical_product_id: i.canonicalProductId,
    alias_normalized: i.aliasNormalized,
  }));
  const { data, error } = await supabase.rpc("create_receipt_with_items", {
    p_household_id: householdId,
    p_store_id: input.storeId,
    p_purchased_at: input.purchasedAt,
    p_currency: input.currency,
    p_items: items,
    p_source: "photo_ai",
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Re-export del tipo ParseResult para que callers no tengan que importar dos veces. */
export type { ParseResult };
