import type { MonthRange, SpendingLine } from "@oraculo/core";
import { supabase } from "../lib/supabase";

/** Aplana gastos manuales + ítems de factura del mes en líneas para core. */
export async function getMonthlySpending(
  householdId: string,
  range: MonthRange,
): Promise<SpendingLine[]> {
  const { data: manual, error: mErr } = await supabase
    .from("manual_expenses")
    .select("amount, category_id")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("occurred_at", range.start)
    .lt("occurred_at", range.endExclusive);
  if (mErr) throw new Error(mErr.message);

  const { data: receipts, error: rErr } = await supabase
    .from("receipts")
    .select("id, receipt_items(total_price, category_id, deleted_at)")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("purchased_at", range.start)
    .lt("purchased_at", range.endExclusive);
  if (rErr) throw new Error(rErr.message);

  const lines: SpendingLine[] = [];
  for (const m of manual ?? []) {
    lines.push({ categoryId: m.category_id as string | null, amount: m.amount as string });
  }
  for (const r of receipts ?? []) {
    const items = (r.receipt_items as { total_price: string; category_id: string | null; deleted_at: string | null }[]) ?? [];
    for (const it of items) {
      if (it.deleted_at) continue;
      lines.push({ categoryId: it.category_id, amount: it.total_price });
    }
  }
  return lines;
}
