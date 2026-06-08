/** Año y mes (1–12) actuales del dispositivo. Solo runtime (no en lógica pura). */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Etiqueta legible "junio 2026". `month` 1–12. */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_ES[month - 1]} ${year}`;
}
