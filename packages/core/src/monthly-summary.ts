import { sumAmounts } from "./money";

export interface SpendingLine {
  categoryId: string | null;
  amount: string;
}

export interface CategorySummary {
  categoryId: string | null;
  total: string;
  percent: number;
}

export interface MonthlySummary {
  total: string;
  byCategory: CategorySummary[];
}

const UNCATEGORIZED_KEY = " uncategorized";

/** Agrega líneas de gasto en total + desglose por categoría con porcentajes. */
export function computeMonthlySummary(lines: SpendingLine[]): MonthlySummary {
  const groups = new Map<string, { categoryId: string | null; amounts: string[] }>();
  for (const line of lines) {
    const key = line.categoryId ?? UNCATEGORIZED_KEY;
    const existing = groups.get(key);
    if (existing) {
      existing.amounts.push(line.amount);
    } else {
      groups.set(key, { categoryId: line.categoryId, amounts: [line.amount] });
    }
  }

  const total = sumAmounts(lines.map((l) => l.amount));
  const totalNum = Number(total);

  const byCategory: CategorySummary[] = [...groups.values()]
    .map((g) => {
      const catTotal = sumAmounts(g.amounts);
      const percent = totalNum === 0 ? 0 : Math.round((Number(catTotal) / totalNum) * 100);
      return { categoryId: g.categoryId, total: catTotal, percent };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));

  return { total, byCategory };
}
