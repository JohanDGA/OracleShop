import { ABBREVIATIONS } from "./abbreviations";

/**
 * Normaliza un nombre de producto para matching: mayúsculas, sin tildes (preserva Ñ),
 * sin puntuación, espacios colapsados, y expansión de abreviaturas por TOKEN
 * (no substring → "GAS" no toca "GASOLINA").
 */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  // Sentinel para preservar Ñ a través de NFD (Ñ decompone a N + combining tilde).
  // U+0001 (Start of Heading) es seguro: no aparece en input de usuario.
  const SENTINEL = "\x01";
  let s = raw.trim().toLocaleUpperCase("es-CO");
  s = s.replace(/Ñ/g, SENTINEL);
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  s = s.replace(new RegExp(SENTINEL, "g"), "Ñ");
  // Cualquier char no [A-Z0-9Ñ] o espacio se convierte en espacio.
  s = s.replace(/[^A-Z0-9Ñ ]+/g, " ");
  const tokens = s.split(/\s+/).filter(Boolean);
  const expanded = tokens.map((t) => ABBREVIATIONS[t] ?? t);
  return expanded.join(" ").trim();
}

export type StandardUnit = "lt" | "kg" | "un";

/**
 * Precio por unidad estándar (lt, kg, un) en BigInt escala 4.
 * Todos los inputs y el output usan la misma escala que money.ts.
 * Retorna null si alguna cantidad es 0.
 */
export function pricePerStandardUnit(input: {
  unit: StandardUnit;
  unitQuantity: bigint;
  quantity: bigint;
  totalPrice: bigint;
}): bigint | null {
  const { unitQuantity, quantity, totalPrice } = input;
  if (unitQuantity === 0n || quantity === 0n) return null;
  // total estándar = (quantity * unitQuantity) / 10000  (re-escala porque ambos están en escala 4)
  const totalStandard = (quantity * unitQuantity) / 10_000n;
  if (totalStandard === 0n) return null;
  // precio por unidad = totalPrice * 10000 / totalStandard  (mantiene escala 4)
  return (totalPrice * 10_000n) / totalStandard;
}
