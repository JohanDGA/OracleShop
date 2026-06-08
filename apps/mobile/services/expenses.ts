import type { MonthRange } from "@oraculo/core";
import { supabase } from "../lib/supabase";

export type EntryKind = "manual" | "receipt";

/** Fila unificada para la lista de gastos del mes. */
export interface ExpenseEntry {
  kind: EntryKind;
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // descripción o nombre de tienda
  amount: string; // NUMERIC string
  categoryId: string | null; // null para facturas multi-categoría
}

/** Inserta un gasto manual. created_by = usuario actual. */
export async function addManualExpense(input: {
  householdId: string;
  amount: string;
  categoryId: string | null;
  description?: string;
  occurredAt: string;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sesión no disponible");
  const { error } = await supabase.from("manual_expenses").insert({
    household_id: input.householdId,
    created_by: userId,
    category_id: input.categoryId,
    description: input.description ?? null,
    amount: input.amount,
    currency: "COP",
    occurred_at: input.occurredAt,
  });
  if (error) throw new Error(error.message);
}

/** Lista combinada (gastos manuales + facturas) del mes, orden por fecha desc. */
export async function listMonthEntries(
  householdId: string,
  range: MonthRange,
): Promise<ExpenseEntry[]> {
  const { data: manual, error: mErr } = await supabase
    .from("manual_expenses")
    .select("id, occurred_at, description, amount, category_id")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("occurred_at", range.start)
    .lt("occurred_at", range.endExclusive);
  if (mErr) throw new Error(mErr.message);

  const { data: receipts, error: rErr } = await supabase
    .from("receipts")
    .select("id, purchased_at, total, stores(name)")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("purchased_at", range.start)
    .lt("purchased_at", range.endExclusive);
  if (rErr) throw new Error(rErr.message);

  const entries: ExpenseEntry[] = [];
  for (const m of manual ?? []) {
    entries.push({
      kind: "manual",
      id: m.id as string,
      date: m.occurred_at as string,
      title: (m.description as string | null) ?? "Gasto",
      amount: m.amount as string,
      categoryId: m.category_id as string | null,
    });
  }
  for (const r of receipts ?? []) {
    // El embed `stores(name)` se tipa como array en el cliente, pero un FK a-uno
    // devuelve un objeto (o null) en runtime: normalizamos ambas formas.
    const rawStore = r.stores as unknown as
      | { name: string }
      | { name: string }[]
      | null;
    const store = Array.isArray(rawStore) ? (rawStore[0] ?? null) : rawStore;
    entries.push({
      kind: "receipt",
      id: r.id as string,
      date: r.purchased_at as string,
      title: store ? store.name : "Factura",
      amount: (r.total as string) ?? "0",
      categoryId: null,
    });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

export async function softDeleteManualExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from("manual_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function softDeleteReceipt(id: string): Promise<void> {
  const { error } = await supabase
    .from("receipts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
