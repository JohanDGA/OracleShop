export interface MonthRange {
  /** Primer día del mes, inclusivo (YYYY-MM-DD). */
  start: string;
  /** Primer día del mes siguiente, exclusivo (YYYY-MM-DD). */
  endExclusive: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rango [start, endExclusive) del mes. `month` es 1–12. */
export function monthRange(year: number, month: number): MonthRange {
  const start = `${year}-${pad2(month)}-01`;
  const next = shiftMonth(year, month, 1);
  const endExclusive = `${next.year}-${pad2(next.month)}-01`;
  return { start, endExclusive };
}

/** Desplaza (year, month 1–12) por `delta` meses, normalizando el año. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = month - 1 + delta;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = (((zeroBased % 12) + 12) % 12) + 1;
  return { year: newYear, month: newMonth };
}
