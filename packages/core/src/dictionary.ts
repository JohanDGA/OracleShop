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
