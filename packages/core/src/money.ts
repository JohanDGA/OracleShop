const SCALE = 4n;
const SCALE_FACTOR = 10n ** SCALE; // 10000n

/**
 * Monto decimal → unidades menores escala 4, sin floats.
 * Acepta string ("1234.56") o number: PostgREST devuelve columnas NUMERIC como
 * JSON number, así que coercemos a string antes de parsear.
 */
export function toMinorUnits(amount: string | number): bigint {
  const trimmed = String(amount).trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart = "", fracPart = ""] = unsigned.split(".");
  const frac4 = (fracPart + "0000").slice(0, 4);
  const minor = BigInt(intPart === "" ? "0" : intPart) * SCALE_FACTOR + BigInt(frac4);
  return negative ? -minor : minor;
}

/** Unidades menores escala 4 → string decimal con 4 decimales. */
export function fromMinorUnits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const intPart = abs / SCALE_FACTOR;
  const fracStr = (abs % SCALE_FACTOR).toString().padStart(4, "0");
  return `${negative ? "-" : ""}${intPart.toString()}.${fracStr}`;
}

/** Suma exacta de montos (string o number). */
export function sumAmounts(amounts: (string | number)[]): string {
  let total = 0n;
  for (const a of amounts) total += toMinorUnits(a);
  return fromMinorUnits(total);
}

/** Formato display COP (es-CO, sin decimales). Number() solo para display. */
export function formatCOP(amount: string | number): string {
  const pesos = Number(fromMinorUnits(toMinorUnits(amount)));
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(pesos);
}
