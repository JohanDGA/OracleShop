import type { CanonicalHint } from "./types";

export function buildSystemPrompt(): string {
  return [
    "Eres un asistente que extrae datos estructurados de fotos de facturas de supermercado en Colombia.",
    "Responde SOLO con un objeto JSON válido, sin markdown ni texto adicional.",
    "Si un campo no es legible, usa null (no inventes).",
    "Detecta descuentos: si la factura muestra precio regular y precio pagado, llena regular_price y marca is_promo=true.",
    "Para cada ítem, intenta matchear con uno de los productos del hogar provistos. Si hay match razonable (>=0.6 confianza), devuelve su id en suggested_canonical_id; si no, deja null.",
    "Si no puedes leer la factura, devuelve la estructura con items=[] y total=\"0\".",
  ].join("\n");
}

function exampleJson(): string {
  return JSON.stringify(
    {
      store_name: "Éxito Calle 80",
      purchased_at: "2026-06-09",
      total: "23500",
      currency: "COP",
      items: [
        {
          raw_name: "LCH DESLAC ALPINA 1100ML",
          quantity: "1",
          unit: "lt",
          unit_price: "5800",
          regular_price: "6500",
          is_promo: true,
          total_price: "5800",
          suggested_canonical_id: null,
          match_confidence: null,
        },
      ],
    },
    null,
    2,
  );
}

export function buildUserPrompt(hints: CanonicalHint[]): string {
  const hintsBlock =
    hints.length === 0
      ? "(El hogar todavía no tiene productos en su diccionario.)"
      : hints
          .map((h) => `- id=${h.id} name="${h.name}" aliases=${JSON.stringify(h.aliases)}`)
          .join("\n");
  return [
    "Productos conocidos del hogar:",
    hintsBlock,
    "",
    "Estructura JSON esperada (ejemplo):",
    exampleJson(),
    "",
    "Extrae los datos de la factura en la imagen adjunta. SOLO devuelve el JSON.",
  ].join("\n");
}
