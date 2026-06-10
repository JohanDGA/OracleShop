# Hito 3 — AIProvider + escaneo de facturas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario toque "Escanear" en el tab Gastos, elija una foto de factura (cámara o galería), una IA (Gemini default, o Claude/OpenAI) la parsee a JSON estructurado con matching semántico de productos del hogar, y aterrice en una pantalla de revisión que reusa el `ProductPicker` del Hito 2 para confirmar y guardar.

**Architecture:** Interfaz `AIProvider` en `@oraculo/core/ai` con 3 implementaciones REST (Gemini/Claude/OpenAI), prompt único compartido, Zod-validation del response (`parseResultSchema` en `@oraculo/validations`). Mobile services en `apps/mobile/services/ai/` para keystore (expo-secure-store), captura (expo-camera + expo-image-picker + expo-image-manipulator) y resolución del provider activo. Pantalla `app/(app)/scan/review.tsx` reusa `ProductPicker`. Migración `0013` extiende `create_receipt_with_items` con `p_source DEFAULT 'manual'` y persiste `regular_price` + `is_promo` por ítem.

**Tech Stack:** TypeScript strict, Vitest, Zod, fetch (global), Expo SDK 51 + `expo-secure-store` + `expo-camera` + `expo-image-picker` + `expo-image-manipulator`, Supabase JS.

**Prerequisitos:** Master con Hito 2 mergeado (commit `f216908` o posterior — ya incluye `ProductPicker`, `match_product` RPC, `create_receipt_with_items` v2). Branch `hito-3-aiprovider-y-escaneo` ya creada con el spec commiteado. Supabase local arriba.

**Out of scope:** PaddleOCR on-device (Hito 4), DIAN XML (Hito 7), múltiples keys por provider, streaming de respuesta, edición rica de tiendas en ReviewParsed (solo "crear con nombre sugerido").

---

## File Structure

```
packages/core/src/ai/
├── types.ts                              # NUEVO: AIProvider, ParseResult, AIError, etc.
├── prompt.ts                             # NUEVO: buildSystemPrompt, buildUserPrompt
├── error.ts                              # NUEVO: toAIError(e, provider)
├── gemini.ts                             # NUEVO: GeminiProvider
├── claude.ts                             # NUEVO: ClaudeProvider
├── openai.ts                             # NUEVO: OpenAIProvider
├── factory.ts                            # NUEVO: createProvider(name, key) → AIProvider
└── index.ts                              # NUEVO: barrel
packages/core/src/index.ts                # MOD: export ./ai
packages/core/tests/ai/
├── prompt.test.ts                        # NUEVO (TDD)
├── error.test.ts                         # NUEVO (TDD)
├── gemini.test.ts                        # NUEVO (TDD, fetch mock)
├── claude.test.ts                        # NUEVO (TDD, fetch mock)
└── openai.test.ts                        # NUEVO (TDD, fetch mock)

packages/validations/src/
├── parse-result.ts                       # NUEVO: parseResultSchema (Zod)
└── index.ts                              # MOD: export
packages/validations/tests/
└── parse-result.test.ts                  # NUEVO

packages/db/supabase/migrations/
└── 0013_create_receipt_with_items_v3.sql # NUEVO
packages/db/tests/
└── hito3.test.ts                         # NUEVO: RPC v3 tests

apps/mobile/services/ai/
├── keystore.ts                           # NUEVO: expo-secure-store wrapper
├── capture.ts                            # NUEVO: image picker + resize
└── provider.ts                           # NUEVO: resolveActiveProvider, getCanonicalHints
apps/mobile/services/
└── receipts.ts                           # MOD: createScannedReceipt() helper
apps/mobile/components/
├── AIKeyModal.tsx                        # NUEVO: onboarding lazy de key
└── ScanButton.tsx                        # NUEVO: trigger captura
apps/mobile/app/(app)/
├── (tabs)/index.tsx                      # MOD: agregar ScanButton en barra inferior
└── scan/review.tsx                       # NUEVO: ReviewParsed screen
apps/mobile/assets/
└── demo-receipt.jpg                      # NUEVO: fixture (~50-100KB)
```

---

## Task Group A — `@oraculo/core/ai`: types, prompt, error (TDD)

### Task A1: Tipos base

**Files:**
- Create: `packages/core/src/ai/types.ts`

- [ ] **Step 1: Implementar** — los tipos no requieren tests propios; los validan los consumers (Zod, providers). Crear `packages/core/src/ai/types.ts`:

```typescript
export type ProviderName = "gemini" | "claude" | "openai";
export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface CanonicalHint {
  id: string;
  name: string;
  aliases: string[];
}

export interface AIProviderInput {
  /** base64 sin prefijo data:image/... */
  imageBase64: string;
  imageMimeType: ImageMimeType;
  /** Top-N canonicals del hogar; vacío si recién creado. */
  canonicalHints: CanonicalHint[];
  apiKey: string;
  /** Timeout total en ms. Default 60_000. */
  timeoutMs?: number;
}

export interface ParseResultItem {
  raw_name: string;
  quantity: string;
  unit: "lt" | "kg" | "un" | null;
  unit_price: string;
  regular_price: string | null;
  is_promo: boolean;
  total_price: string;
  suggested_canonical_id: string | null;
  match_confidence: number | null;
}

export interface ParseResult {
  store_name: string | null;
  purchased_at: string; // YYYY-MM-DD
  total: string;
  currency: "COP";
  items: ParseResultItem[];
}

export type AIErrorKind =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "parse"
  | "unreadable"
  | "unknown";

export interface AIError extends Error {
  kind: AIErrorKind;
  provider?: ProviderName;
  rawResponse?: string;
}

export interface AIProvider {
  readonly name: ProviderName;
  parseReceipt(input: AIProviderInput): Promise<ParseResult>;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/ai/types.ts
git commit -m "feat(core): tipos base del modulo ai (AIProvider, ParseResult, AIError)"
```

---

### Task A2: `parseResultSchema` (Zod) — TDD

**Files:**
- Create: `packages/validations/src/parse-result.ts`
- Create: `packages/validations/tests/parse-result.test.ts`
- Modify: `packages/validations/src/index.ts`

- [ ] **Step 1: Failing tests** — `packages/validations/tests/parse-result.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseResultSchema } from "../src/parse-result";

const validItem = {
  raw_name: "Leche Alpina 1L",
  quantity: "1",
  unit: "lt",
  unit_price: "5000",
  regular_price: null,
  is_promo: false,
  total_price: "5000",
  suggested_canonical_id: null,
  match_confidence: null,
};
const validReceipt = {
  store_name: "Éxito Calle 80",
  purchased_at: "2026-06-09",
  total: "5000",
  currency: "COP",
  items: [validItem],
};

describe("parseResultSchema", () => {
  it("acepta un parse result válido completo", () => {
    expect(parseResultSchema.safeParse(validReceipt).success).toBe(true);
  });

  it("acepta items con unit null y suggested_canonical_id null", () => {
    const r = { ...validReceipt, items: [{ ...validItem, unit: null, suggested_canonical_id: null }] };
    expect(parseResultSchema.safeParse(r).success).toBe(true);
  });

  it("acepta item con descuento (regular_price + is_promo)", () => {
    const r = {
      ...validReceipt,
      items: [{ ...validItem, regular_price: "6000", is_promo: true }],
    };
    expect(parseResultSchema.safeParse(r).success).toBe(true);
  });

  it("rechaza currency distinto de COP en v1", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, currency: "USD" }).success).toBe(false);
  });

  it("rechaza unit fuera del set lt/kg/un", () => {
    const r = { ...validReceipt, items: [{ ...validItem, unit: "ml" }] };
    expect(parseResultSchema.safeParse(r).success).toBe(false);
  });

  it("rechaza purchased_at no-ISO date", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, purchased_at: "09/06/2026" }).success).toBe(false);
  });

  it("rechaza match_confidence > 1 o < 0", () => {
    const r1 = { ...validReceipt, items: [{ ...validItem, match_confidence: 1.5 }] };
    expect(parseResultSchema.safeParse(r1).success).toBe(false);
    const r2 = { ...validReceipt, items: [{ ...validItem, match_confidence: -0.1 }] };
    expect(parseResultSchema.safeParse(r2).success).toBe(false);
  });

  it("acepta items vacío (factura ilegible que igual responde estructura)", () => {
    expect(parseResultSchema.safeParse({ ...validReceipt, items: [] }).success).toBe(true);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @oraculo/validations test parse-result` — FAIL.

- [ ] **Step 3: Implementar** — `packages/validations/src/parse-result.ts`:

```typescript
import { z } from "zod";

const moneyString = z.string().regex(/^\d{1,11}(\.\d{1,4})?$/, "Monto inválido");
const quantityString = z.string().regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha ISO inválida (YYYY-MM-DD)");

export const parseResultItemSchema = z.object({
  raw_name: z.string().trim().min(1).max(200),
  quantity: quantityString,
  unit: z.enum(["lt", "kg", "un"]).nullable(),
  unit_price: moneyString,
  regular_price: moneyString.nullable(),
  is_promo: z.boolean(),
  total_price: moneyString,
  suggested_canonical_id: z.string().uuid().nullable(),
  match_confidence: z.number().min(0).max(1).nullable(),
});

export const parseResultSchema = z.object({
  store_name: z.string().trim().min(1).max(200).nullable(),
  purchased_at: isoDate,
  total: moneyString,
  currency: z.literal("COP"),
  items: z.array(parseResultItemSchema),
});

export type ParseResultItemValidated = z.infer<typeof parseResultItemSchema>;
export type ParseResultValidated = z.infer<typeof parseResultSchema>;
```

- [ ] **Step 4: Export** — append a `packages/validations/src/index.ts`:

```typescript
export * from "./parse-result";
```

- [ ] **Step 5:** Run `pnpm --filter @oraculo/validations test parse-result` — PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/validations/src/parse-result.ts packages/validations/src/index.ts packages/validations/tests/parse-result.test.ts
git commit -m "feat(validations): parseResultSchema con money/quantity/ISO date regex"
```

---

### Task A3: `prompt.ts` (TDD)

**Files:**
- Create: `packages/core/tests/ai/prompt.test.ts`
- Create: `packages/core/src/ai/prompt.ts`

- [ ] **Step 1: Failing tests** — `packages/core/tests/ai/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../../src/ai/prompt";
import type { CanonicalHint } from "../../src/ai/types";

describe("buildSystemPrompt", () => {
  it("incluye instrucciones clave (JSON only, null si ilegible, descuentos)", () => {
    const s = buildSystemPrompt();
    expect(s).toMatch(/JSON/i);
    expect(s).toMatch(/null/);
    expect(s).toMatch(/descuento/i);
    expect(s).toMatch(/suggested_canonical_id/);
  });
});

describe("buildUserPrompt", () => {
  it("con hints vacíos pone un placeholder explícito", () => {
    const u = buildUserPrompt([]);
    expect(u).toMatch(/no tiene productos/i);
  });

  it("con hints los lista por id, name y aliases", () => {
    const hints: CanonicalHint[] = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Leche Alpina 1L", aliases: ["LECHE ALPINA", "LCH ALPINA"] },
      { id: "22222222-2222-2222-2222-222222222222", name: "Pan Bimbo", aliases: ["PAN BIMBO"] },
    ];
    const u = buildUserPrompt(hints);
    expect(u).toContain("11111111-1111-1111-1111-111111111111");
    expect(u).toContain("Leche Alpina 1L");
    expect(u).toContain("LECHE ALPINA");
    expect(u).toContain("PAN BIMBO");
  });

  it("incluye un ejemplo de estructura JSON esperada", () => {
    const u = buildUserPrompt([]);
    expect(u).toMatch(/store_name/);
    expect(u).toMatch(/items/);
    expect(u).toMatch(/total_price/);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @oraculo/core test prompt` — FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/ai/prompt.ts`:

```typescript
import type { CanonicalHint } from "./types";

export function buildSystemPrompt(): string {
  return [
    "Eres un asistente que extrae datos estructurados de fotos de facturas de supermercado en Colombia.",
    "Responde SOLO con un objeto JSON válido, sin markdown ni texto adicional.",
    "Si un campo no es legible, usa null (no inventes).",
    "Detecta descuentos: si la factura muestra precio regular y precio pagado, llena regular_price y marca is_promo=true.",
    "Para cada ítem, intenta matchear con uno de los productos del hogar provistos. Si hay match razonable (>=0.6 confianza), devuelve su id en suggested_canonical_id; si no, deja null.",
    "Si no puedes leer la factura, devuelve la estructura con items=[] y total=null.",
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
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test prompt` — PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/prompt.ts packages/core/tests/ai/prompt.test.ts
git commit -m "feat(core): buildSystemPrompt/buildUserPrompt con hints (TDD)"
```

---

### Task A4: `toAIError` helper (TDD)

**Files:**
- Create: `packages/core/tests/ai/error.test.ts`
- Create: `packages/core/src/ai/error.ts`

- [ ] **Step 1: Failing tests** — `packages/core/tests/ai/error.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { toAIError, isAIError } from "../../src/ai/error";

describe("toAIError", () => {
  it("maps 401 to auth", () => {
    const r = new Response("", { status: 401 });
    const e = toAIError(r, "gemini");
    expect(e.kind).toBe("auth");
    expect(e.provider).toBe("gemini");
  });

  it("maps 403 to auth", () => {
    const r = new Response("", { status: 403 });
    expect(toAIError(r, "claude").kind).toBe("auth");
  });

  it("maps 429 to rate_limit", () => {
    const r = new Response("", { status: 429 });
    expect(toAIError(r, "openai").kind).toBe("rate_limit");
  });

  it("DOMException AbortError → timeout", () => {
    const e = new DOMException("aborted", "AbortError");
    expect(toAIError(e, "gemini").kind).toBe("timeout");
  });

  it("TypeError de fetch → network", () => {
    const e = new TypeError("Failed to fetch");
    expect(toAIError(e, "gemini").kind).toBe("network");
  });

  it("Response 500 → unknown con rawResponse", async () => {
    const r = new Response("server boom", { status: 500 });
    const e = toAIError(r, "gemini");
    expect(e.kind).toBe("unknown");
    expect(e.rawResponse).toBe("server boom");
  });

  it("preserva el provider en todos los casos", () => {
    expect(toAIError(new Response("", { status: 429 }), "claude").provider).toBe("claude");
  });
});

describe("isAIError", () => {
  it("true para errores creados por toAIError", () => {
    expect(isAIError(toAIError(new TypeError("x"), "gemini"))).toBe(true);
  });

  it("false para errores normales", () => {
    expect(isAIError(new Error("plain"))).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @oraculo/core test error` — FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/ai/error.ts`:

```typescript
import type { AIError, AIErrorKind, ProviderName } from "./types";

const AI_ERROR_MARK = Symbol.for("@oraculo/core/ai-error");

function make(kind: AIErrorKind, message: string, provider?: ProviderName, rawResponse?: string): AIError {
  const e = new Error(message) as AIError;
  e.kind = kind;
  if (provider) e.provider = provider;
  if (rawResponse) e.rawResponse = rawResponse;
  (e as unknown as { [k: symbol]: true })[AI_ERROR_MARK] = true;
  return e;
}

export function isAIError(e: unknown): e is AIError {
  return typeof e === "object" && e !== null && (e as { [k: symbol]: unknown })[AI_ERROR_MARK] === true;
}

/**
 * Convierte un fetch Response (4xx/5xx) o un throwable (TypeError/DOMException) en AIError.
 * Para Response, intenta leer el body como texto y guardarlo en rawResponse.
 */
export function toAIError(source: unknown, provider: ProviderName): AIError {
  if (source instanceof Response) {
    const status = source.status;
    let kind: AIErrorKind = "unknown";
    if (status === 401 || status === 403) kind = "auth";
    else if (status === 429) kind = "rate_limit";
    // No-await read; en tests Response.text() es sincrónico-equivalente. En runtime
    // se usa la versión async (ver wrapWithText) cuando interesa el body.
    let raw: string | undefined;
    try {
      // Best-effort: clonar y leer si es posible; si no, dejar undefined.
      const cloned = source.clone();
      raw = (cloned as unknown as { _bodyInit?: string })._bodyInit;
    } catch {
      raw = undefined;
    }
    return make(kind, `HTTP ${status}`, provider, raw);
  }
  if (source instanceof DOMException && source.name === "AbortError") {
    return make("timeout", "AI request timed out", provider);
  }
  if (source instanceof TypeError) {
    return make("network", source.message, provider);
  }
  if (source instanceof Error) {
    return make("unknown", source.message, provider);
  }
  return make("unknown", "Error desconocido", provider);
}

/** Helper async para enriquecer un AIError con el body del Response. */
export async function wrapWithText(err: AIError, response: Response): Promise<AIError> {
  try {
    err.rawResponse = await response.text();
  } catch {
    /* ignore */
  }
  return err;
}
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test error` — PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/error.ts packages/core/tests/ai/error.test.ts
git commit -m "feat(core): toAIError + isAIError (mapeo de fetch errors)"
```

---

## Task Group B — Provider implementations (TDD con fetch mock)

### Task B1: `GeminiProvider`

**Files:**
- Create: `packages/core/tests/ai/gemini.test.ts`
- Create: `packages/core/src/ai/gemini.ts`

- [ ] **Step 1: Failing tests** — `packages/core/tests/ai/gemini.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../../src/ai/gemini";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "test-key",
};

const validResponseBody = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              store_name: "Éxito",
              purchased_at: "2026-06-09",
              total: "5000",
              currency: "COP",
              items: [
                {
                  raw_name: "Leche",
                  quantity: "1",
                  unit: "lt",
                  unit_price: "5000",
                  regular_price: null,
                  is_promo: false,
                  total_price: "5000",
                  suggested_canonical_id: null,
                  match_confidence: null,
                },
              ],
            }),
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiProvider.parseReceipt", () => {
  it("happy path: 200 con JSON válido → ParseResult", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponseBody), { status: 200 }),
    );
    const provider = new GeminiProvider();
    const result = await provider.parseReceipt(baseInput);
    expect(result.store_name).toBe("Éxito");
    expect(result.items.length).toBe(1);
    expect(result.items[0]?.raw_name).toBe("Leche");
  });

  it("envía la imagen como inlineData base64 con mimeType correcto", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponseBody), { status: 200 }));
    const provider = new GeminiProvider();
    await provider.parseReceipt({ ...baseInput, imageMimeType: "image/png", imageBase64: "ZZZ" });
    const call = mock.mock.calls[0];
    expect(call).toBeDefined();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    const inline = body.contents[0].parts.find((p: { inlineData?: unknown }) => p.inlineData);
    expect(inline.inlineData.mimeType).toBe("image/png");
    expect(inline.inlineData.data).toBe("ZZZ");
  });

  it("pasa la API key como query param ?key=", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponseBody), { status: 200 }));
    const provider = new GeminiProvider();
    await provider.parseReceipt({ ...baseInput, apiKey: "my-secret" });
    const call = mock.mock.calls[0];
    expect((call![0] as string)).toContain("key=my-secret");
  });

  it("401 → AIError kind='auth'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("nope", { status: 401 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail("debió lanzar");
    } catch (e) {
      expect(isAIError(e)).toBe(true);
      if (isAIError(e)) expect(e.kind).toBe("auth");
    }
  });

  it("429 → AIError kind='rate_limit'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → reintenta 1× con prompt estricto y luego AIError kind='parse'", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const badResponse = {
      candidates: [{ content: { parts: [{ text: "no soy json" }] } }],
    };
    mock.mockResolvedValue(new Response(JSON.stringify(badResponse), { status: 200 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("items=[] y total=null → AIError kind='unreadable'", async () => {
    const empty = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  store_name: null,
                  purchased_at: "2026-06-09",
                  total: "0",
                  currency: "COP",
                  items: [],
                }),
              },
            ],
          },
        },
      ],
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response(JSON.stringify(empty), { status: 200 }));
    try {
      await new GeminiProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("unreadable");
    }
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @oraculo/core test gemini` — FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/ai/gemini.ts`:

```typescript
import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface GeminiResponseBody {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "gemini");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const url = `${ENDPOINT}?key=${encodeURIComponent(input.apiKey)}`;
    const systemPrompt = buildSystemPrompt() + (strict ? "\nIMPORTANTE: SOLO JSON. Nada de markdown, ni texto fuera del JSON." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          role: "user",
          parts: [
            { text: userPrompt },
            { inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "gemini");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "gemini"), response);
    }
    const json = (await response.json()) as GeminiResponseBody;
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const e = toAIError(new Error("missing text in response"), "gemini");
      e.kind = "parse";
      throw e;
    }
    return this.parseOrRetry(text, input, strict);
  }

  private async parseOrRetry(text: string, input: AIProviderInput, alreadyStrict: boolean): Promise<ParseResult> {
    try {
      const obj = JSON.parse(text);
      const validated = parseResultSchema.parse(obj);
      return validated;
    } catch (parseErr) {
      if (alreadyStrict) {
        const e = toAIError(parseErr instanceof Error ? parseErr : new Error("parse failed"), "gemini");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      // Reintentar 1× con strict
      return this.call(input, true);
    }
  }
}
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test gemini` — PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/gemini.ts packages/core/tests/ai/gemini.test.ts
git commit -m "feat(core): GeminiProvider con retry estricto y mapeo de errores"
```

---

### Task B2: `ClaudeProvider`

**Files:**
- Create: `packages/core/tests/ai/claude.test.ts`
- Create: `packages/core/src/ai/claude.ts`

- [ ] **Step 1: Failing tests** — `packages/core/tests/ai/claude.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClaudeProvider } from "../../src/ai/claude";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "sk-ant-test",
};

const validResponse = {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        store_name: "Carulla",
        purchased_at: "2026-06-09",
        total: "8000",
        currency: "COP",
        items: [
          {
            raw_name: "Pan",
            quantity: "1",
            unit: "un",
            unit_price: "8000",
            regular_price: null,
            is_promo: false,
            total_price: "8000",
            suggested_canonical_id: null,
            match_confidence: null,
          },
        ],
      }),
    },
  ],
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("ClaudeProvider.parseReceipt", () => {
  it("happy path", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    const result = await new ClaudeProvider().parseReceipt(baseInput);
    expect(result.store_name).toBe("Carulla");
    expect(result.items[0]?.raw_name).toBe("Pan");
  });

  it("envía x-api-key header y anthropic-version", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new ClaudeProvider().parseReceipt(baseInput);
    const init = mock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("envía la imagen como bloque type:image con base64 source", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new ClaudeProvider().parseReceipt({ ...baseInput, imageMimeType: "image/png", imageBase64: "QWE" });
    const body = JSON.parse(mock.mock.calls[0]?.[1] && (mock.mock.calls[0]![1] as RequestInit).body as string);
    const imageBlock = body.messages[0].content.find((c: { type: string }) => c.type === "image");
    expect(imageBlock.source.media_type).toBe("image/png");
    expect(imageBlock.source.data).toBe("QWE");
  });

  it("401 → auth", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 401 }));
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("auth");
    }
  });

  it("429 → rate_limit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → retry estricto y luego parse", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const bad = { content: [{ type: "text", text: "not json" }] };
    mock.mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    try {
      await new ClaudeProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2:** Run — FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/ai/claude.ts`:

```typescript
import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-20250514";

interface ClaudeResponseBody {
  content?: Array<{ type: string; text?: string }>;
}

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "claude");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const systemPrompt = buildSystemPrompt() + (strict ? "\nIMPORTANTE: SOLO JSON. Nada de markdown ni texto fuera del JSON." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: input.imageMimeType, data: input.imageBase64 },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": input.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "claude");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "claude"), response);
    }
    const json = (await response.json()) as ClaudeResponseBody;
    const text = json.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      const e = toAIError(new Error("missing text"), "claude");
      e.kind = "parse";
      throw e;
    }
    try {
      return parseResultSchema.parse(JSON.parse(text));
    } catch (err) {
      if (strict) {
        const e = toAIError(err instanceof Error ? err : new Error("parse"), "claude");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      return this.call(input, true);
    }
  }
}
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test claude` — PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/claude.ts packages/core/tests/ai/claude.test.ts
git commit -m "feat(core): ClaudeProvider (Anthropic Messages API + vision)"
```

---

### Task B3: `OpenAIProvider`

**Files:**
- Create: `packages/core/tests/ai/openai.test.ts`
- Create: `packages/core/src/ai/openai.ts`

- [ ] **Step 1: Failing tests** — `packages/core/tests/ai/openai.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../../src/ai/openai";
import type { AIProviderInput } from "../../src/ai/types";
import { isAIError } from "../../src/ai/error";

const baseInput: AIProviderInput = {
  imageBase64: "AAAA",
  imageMimeType: "image/jpeg",
  canonicalHints: [],
  apiKey: "sk-openai-test",
};

const validResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          store_name: "D1",
          purchased_at: "2026-06-09",
          total: "3500",
          currency: "COP",
          items: [
            {
              raw_name: "Agua",
              quantity: "1",
              unit: "lt",
              unit_price: "3500",
              regular_price: null,
              is_promo: false,
              total_price: "3500",
              suggested_canonical_id: null,
              match_confidence: null,
            },
          ],
        }),
      },
    },
  ],
};

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe("OpenAIProvider.parseReceipt", () => {
  it("happy path", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(validResponse), { status: 200 }),
    );
    const r = await new OpenAIProvider().parseReceipt(baseInput);
    expect(r.store_name).toBe("D1");
    expect(r.items[0]?.raw_name).toBe("Agua");
  });

  it("Authorization Bearer header", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new OpenAIProvider().parseReceipt(baseInput);
    const headers = (mock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-openai-test");
  });

  it("envía la imagen como image_url con data URL base64", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(new Response(JSON.stringify(validResponse), { status: 200 }));
    await new OpenAIProvider().parseReceipt({ ...baseInput, imageBase64: "XYZ", imageMimeType: "image/webp" });
    const body = JSON.parse((mock.mock.calls[0]?.[1] as RequestInit).body as string);
    const userMsg = body.messages.find((m: { role: string }) => m.role === "user");
    const imgPart = userMsg.content.find((c: { type: string }) => c.type === "image_url");
    expect(imgPart.image_url.url).toBe("data:image/webp;base64,XYZ");
  });

  it("401 → auth", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 401 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("auth");
    }
  });

  it("429 → rate_limit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("", { status: 429 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("rate_limit");
    }
  });

  it("JSON malformado → retry estricto y luego parse", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    const bad = { choices: [{ message: { content: "no json" } }] };
    mock.mockResolvedValue(new Response(JSON.stringify(bad), { status: 200 }));
    try {
      await new OpenAIProvider().parseReceipt(baseInput);
      expect.fail();
    } catch (e) {
      expect(isAIError(e) && e.kind).toBe("parse");
    }
    expect(mock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2:** Run — FAIL.

- [ ] **Step 3: Implementar** — `packages/core/src/ai/openai.ts`:

```typescript
import { parseResultSchema } from "@oraculo/validations";
import { toAIError, wrapWithText } from "./error";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";
import type { AIProvider, AIProviderInput, ParseResult } from "./types";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";

interface OpenAIResponseBody {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async parseReceipt(input: AIProviderInput): Promise<ParseResult> {
    const result = await this.call(input, false);
    if (result.items.length === 0) {
      const e = toAIError(new Error("Unreadable receipt"), "openai");
      e.kind = "unreadable";
      throw e;
    }
    return result;
  }

  private async call(input: AIProviderInput, strict: boolean): Promise<ParseResult> {
    const systemPrompt = buildSystemPrompt() + (strict ? "\nIMPORTANTE: SOLO JSON, sin markdown." : "");
    const userPrompt = buildUserPrompt(input.canonicalHints);
    const body = {
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: `data:${input.imageMimeType};base64,${input.imageBase64}` },
            },
          ],
        },
      ],
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw toAIError(e, "openai");
    }
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw await wrapWithText(toAIError(response, "openai"), response);
    }
    const json = (await response.json()) as OpenAIResponseBody;
    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      const e = toAIError(new Error("missing content"), "openai");
      e.kind = "parse";
      throw e;
    }
    try {
      return parseResultSchema.parse(JSON.parse(text));
    } catch (err) {
      if (strict) {
        const e = toAIError(err instanceof Error ? err : new Error("parse"), "openai");
        e.kind = "parse";
        e.rawResponse = text;
        throw e;
      }
      return this.call(input, true);
    }
  }
}
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test openai` — PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/openai.ts packages/core/tests/ai/openai.test.ts
git commit -m "feat(core): OpenAIProvider (Chat Completions + vision data URL)"
```

---

### Task B4: `createProvider` factory + barrel

**Files:**
- Create: `packages/core/src/ai/factory.ts`
- Create: `packages/core/src/ai/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Implementar** — `packages/core/src/ai/factory.ts`:

```typescript
import { GeminiProvider } from "./gemini";
import { ClaudeProvider } from "./claude";
import { OpenAIProvider } from "./openai";
import type { AIProvider, ProviderName } from "./types";

export function createProvider(name: ProviderName): AIProvider {
  switch (name) {
    case "gemini":
      return new GeminiProvider();
    case "claude":
      return new ClaudeProvider();
    case "openai":
      return new OpenAIProvider();
  }
}
```

- [ ] **Step 2: Barrel** — `packages/core/src/ai/index.ts`:

```typescript
export * from "./types";
export * from "./error";
export * from "./prompt";
export * from "./gemini";
export * from "./claude";
export * from "./openai";
export * from "./factory";
```

- [ ] **Step 3: Re-export desde core** — append a `packages/core/src/index.ts`:

```typescript
export * from "./ai";
```

- [ ] **Step 4:** Run `pnpm --filter @oraculo/core test && pnpm typecheck` — todo verde.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/ai/factory.ts packages/core/src/ai/index.ts packages/core/src/index.ts
git commit -m "feat(core): createProvider factory + barrel @oraculo/core/ai"
```

---

## Task Group C — DB migration 0013

### Task C1: Migración v3 del RPC

**Files:**
- Create: `packages/db/supabase/migrations/0013_create_receipt_with_items_v3.sql`

- [ ] **Step 1: Crear** — `packages/db/supabase/migrations/0013_create_receipt_with_items_v3.sql`:

```sql
-- v3: extiende la RPC para aceptar p_source (default 'manual') y persistir
-- regular_price + is_promo por item. Mantiene la cascada atómica del v2.

create or replace function public.create_receipt_with_items(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at date,
  p_currency text,
  p_items jsonb,
  p_source text default 'manual'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_total numeric(15,4);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura necesita al menos un ítem';
  end if;

  if p_source not in ('manual','photo_ai','photo_paddleocr','dian_xml') then
    raise exception 'source invalido: %', p_source;
  end if;

  -- Guard cross-household (heredado del v2)
  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
      where nullif(item->>'canonical_product_id', '') is not null
        and not exists (
          select 1 from public.canonical_products cp
          where cp.id = (item->>'canonical_product_id')::uuid
            and cp.household_id = p_household_id
            and cp.deleted_at is null
        )
  ) then
    raise exception 'canonical_product_id no pertenece al hogar';
  end if;

  select coalesce(sum((item->>'total_price')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_items) as item;

  insert into public.receipts
    (household_id, created_by, store_id, purchased_at, total, currency, source)
    values (p_household_id, auth.uid(), p_store_id, p_purchased_at, v_total, p_currency, p_source)
    returning id into v_receipt_id;

  insert into public.receipt_items
    (receipt_id, raw_name, quantity, unit, unit_price, regular_price, is_promo,
     total_price, category_id, canonical_product_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      nullif(item->>'regular_price','')::numeric,
      coalesce((item->>'is_promo')::boolean, false),
      (item->>'total_price')::numeric,
      nullif(item->>'category_id', '')::uuid,
      nullif(item->>'canonical_product_id', '')::uuid,
      (row_number() over ())::int
    from jsonb_array_elements(p_items) as item;

  insert into public.product_aliases
    (canonical_product_id, alias, alias_normalized, source, confidence)
  select
    (item->>'canonical_product_id')::uuid,
    item->>'raw_name',
    item->>'alias_normalized',
    'user_confirmed',
    1.0
  from jsonb_array_elements(p_items) as item
  where nullif(item->>'canonical_product_id', '') is not null
    and nullif(item->>'alias_normalized', '') is not null
  on conflict (canonical_product_id, alias_normalized) do nothing;

  return v_receipt_id;
end;
$$;
```

- [ ] **Step 2: Aplicar** — `docker exec -i supabase_db_db psql -U postgres -d postgres < packages/db/supabase/migrations/0013_create_receipt_with_items_v3.sql`. Expect `CREATE FUNCTION`.

- [ ] **Step 3: Sanity firma** — `docker exec supabase_db_db psql -U postgres -d postgres -c "select pg_get_function_arguments('public.create_receipt_with_items'::regproc);"`. Espera que termine en `..., p_items jsonb, p_source text DEFAULT 'manual'::text`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/supabase/migrations/0013_create_receipt_with_items_v3.sql
git commit -m "feat(db): create_receipt_with_items v3 con p_source y regular_price/is_promo"
```

---

### Task C2: Tests del RPC v3

**Files:**
- Create: `packages/db/tests/hito3.test.ts`

- [ ] **Step 1: Tests** — `packages/db/tests/hito3.test.ts`:

```typescript
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalKeys, makeServiceClient, makeUserClient, cleanupUser } from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let householdA: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `h3a_${stamp}@test.local`, "password123");
  const { data: hA } = await service.from("households").insert({ name: "H3 A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });
});

afterAll(async () => {
  await cleanupUser(service, userA.userId);
});

const baseItem = {
  raw_name: "Item",
  quantity: "1",
  unit: null,
  unit_price: "1000",
  total_price: "1000",
  category_id: null,
};

describe("create_receipt_with_items v3", () => {
  it("default p_source es 'manual'", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
    });
    const { data: r } = await userA.client.from("receipts").select("source").eq("id", id as string).single();
    expect(r?.source).toBe("manual");
  });

  it("acepta p_source='photo_ai' y lo persiste", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
      p_source: "photo_ai",
    });
    const { data: r } = await userA.client.from("receipts").select("source").eq("id", id as string).single();
    expect(r?.source).toBe("photo_ai");
  });

  it("rechaza p_source inválido", async () => {
    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
      p_source: "spam",
    });
    expect(error).not.toBeNull();
  });

  it("persiste regular_price y is_promo en receipt_items", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [
        {
          ...baseItem,
          unit_price: "5800",
          total_price: "5800",
          regular_price: "6500",
          is_promo: true,
        },
      ],
      p_source: "photo_ai",
    });
    const { data: items } = await userA.client.from("receipt_items").select("regular_price, is_promo").eq("receipt_id", id as string);
    expect(items?.[0]?.regular_price).toBe("6500.0000");
    expect(items?.[0]?.is_promo).toBe(true);
  });

  it("ítem sin regular_price → null; sin is_promo → false", async () => {
    const { data: id } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-09",
      p_currency: "COP",
      p_items: [baseItem],
    });
    const { data: items } = await userA.client.from("receipt_items").select("regular_price, is_promo").eq("receipt_id", id as string);
    expect(items?.[0]?.regular_price).toBeNull();
    expect(items?.[0]?.is_promo).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @oraculo/db test hito3` — PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/db/tests/hito3.test.ts
git commit -m "test(db): create_receipt_with_items v3 (p_source + regular_price/is_promo)"
```

---

## Task Group D — Mobile services AI

### Task D1: `services/ai/keystore.ts`

**Files:**
- Create: `apps/mobile/services/ai/keystore.ts`

- [ ] **Step 1: Implementar** — `apps/mobile/services/ai/keystore.ts`:

```typescript
import * as SecureStore from "expo-secure-store";
import type { ProviderName } from "@oraculo/core";

const KEY_PREFIX = "oraculo.ai.";

function keyFor(p: ProviderName): string {
  return `${KEY_PREFIX}${p}`;
}

export async function getKey(p: ProviderName): Promise<string | null> {
  return SecureStore.getItemAsync(keyFor(p));
}

export async function setKey(p: ProviderName, key: string): Promise<void> {
  await SecureStore.setItemAsync(keyFor(p), key);
}

export async function deleteKey(p: ProviderName): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(p));
}
```

- [ ] **Step 2:** Verificar que `expo-secure-store` está instalado:

```bash
cd "C:\Users\arias\Downloads\oraculo de compras\apps\mobile" && cat package.json | grep expo-secure-store
```

Si no aparece: `cd apps/mobile && pnpm add expo-secure-store`.

- [ ] **Step 3:** Run `pnpm --filter @oraculo/mobile typecheck` — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/ai/keystore.ts apps/mobile/package.json
git commit -m "feat(mobile): services/ai/keystore wrapper de expo-secure-store"
```

---

### Task D2: `services/ai/capture.ts`

**Files:**
- Create: `apps/mobile/services/ai/capture.ts`

- [ ] **Step 1: Verificar packages instalados:**
```bash
cd "C:\Users\arias\Downloads\oraculo de compras\apps\mobile" && cat package.json | grep -E "expo-camera|expo-image-picker|expo-image-manipulator"
```

Si faltan: `cd apps/mobile && pnpm add expo-camera expo-image-picker expo-image-manipulator`.

- [ ] **Step 2: Implementar** — `apps/mobile/services/ai/capture.ts`:

```typescript
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import type { ImageMimeType } from "@oraculo/core";

export interface CapturedImage {
  base64: string;
  mimeType: ImageMimeType;
}

/** Max 1280px en el lado mayor — reduce tokens vision + payload. */
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.85;

async function compressAndEncode(uri: string): Promise<CapturedImage> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, base64: true, format: ImageManipulator.SaveFormat.JPEG },
  );
  if (!manipulated.base64) {
    throw new Error("No se pudo codificar la imagen");
  }
  return { base64: manipulated.base64, mimeType: "image/jpeg" };
}

/** Toma una foto con la cámara. Pide permisos si hace falta. */
export async function captureFromCamera(): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Permiso de cámara denegado");
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return compressAndEncode(asset.uri);
}

/** Elige una imagen de galería. */
export async function captureFromGallery(): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permiso de galería denegado");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 1,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return compressAndEncode(asset.uri);
}
```

- [ ] **Step 3:** Run typecheck — PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/ai/capture.ts apps/mobile/package.json
git commit -m "feat(mobile): services/ai/capture (cam + galeria + resize 1280)"
```

---

### Task D3: `services/ai/provider.ts`

**Files:**
- Create: `apps/mobile/services/ai/provider.ts`

- [ ] **Step 1: Implementar** — `apps/mobile/services/ai/provider.ts`:

```typescript
import { createProvider, type AIProvider, type CanonicalHint, type ProviderName } from "@oraculo/core";
import { supabase } from "../../lib/supabase";
import { getKey } from "./keystore";

/** Resuelve el provider activo del usuario; lanza si no hay key configurada. */
export async function resolveActiveProvider(): Promise<{ provider: AIProvider; apiKey: string; name: ProviderName }> {
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("preferred_ai_provider")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const name = (settings?.preferred_ai_provider as ProviderName | null) ?? "gemini";
  if (name !== "gemini" && name !== "claude" && name !== "openai") {
    throw new Error(`Provider desconocido: ${name}`);
  }
  const apiKey = await getKey(name);
  if (!apiKey) {
    const e = new Error(`Falta API key para ${name}`) as Error & { code: "NO_KEY"; provider: ProviderName };
    e.code = "NO_KEY";
    e.provider = name;
    throw e;
  }
  return { provider: createProvider(name), apiKey, name };
}

/** Top-N canonicals del hogar con sus aliases (max 3 por canonical). */
export async function getCanonicalHints(householdId: string, limit = 50): Promise<CanonicalHint[]> {
  const { data: canonicals, error } = await supabase
    .from("canonical_products")
    .select("id, name")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!canonicals || canonicals.length === 0) return [];
  const ids = canonicals.map((c) => c.id as string);
  const { data: aliases } = await supabase
    .from("product_aliases")
    .select("canonical_product_id, alias_normalized")
    .in("canonical_product_id", ids);
  const byCanonical = new Map<string, string[]>();
  for (const a of aliases ?? []) {
    const arr = byCanonical.get(a.canonical_product_id as string) ?? [];
    if (arr.length < 3) arr.push(a.alias_normalized as string);
    byCanonical.set(a.canonical_product_id as string, arr);
  }
  return canonicals.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    aliases: byCanonical.get(c.id as string) ?? [],
  }));
}
```

- [ ] **Step 2:** Run typecheck — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/ai/provider.ts
git commit -m "feat(mobile): services/ai/provider (resolveActive + getCanonicalHints)"
```

---

### Task D4: Helper `createScannedReceipt` en `services/receipts.ts`

**Files:**
- Modify: `apps/mobile/services/receipts.ts`

- [ ] **Step 1: Modificar** — agregar al final de `apps/mobile/services/receipts.ts`:

```typescript
import type { ParseResult } from "@oraculo/core";

/**
 * Persiste un ParseResult como factura source='photo_ai'. Cada item del ParseResult
 * se mapea al jsonb de items del RPC, agregando canonical_product_id + alias_normalized
 * solo cuando el caller los confirmó vía ProductPicker.
 */
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

/** Stub usado por el linter: el import de ParseResult mantiene el tipo disponible al caller. */
export type { ParseResult };
```

- [ ] **Step 2:** Run typecheck — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/receipts.ts
git commit -m "feat(mobile): createScannedReceipt usa RPC v3 con source=photo_ai"
```

---

## Task Group E — Mobile UI

### Task E1: Componente `AIKeyModal`

**Files:**
- Create: `apps/mobile/components/AIKeyModal.tsx`

- [ ] **Step 1: Implementar** — `apps/mobile/components/AIKeyModal.tsx`:

```typescript
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from "react-native";
import { createProvider, type ProviderName } from "@oraculo/core";
import { setKey } from "../services/ai/keystore";

interface Props {
  visible: boolean;
  provider: ProviderName;
  onClose: () => void;
  onSaved: () => void;
}

const INSTRUCTIONS: Record<ProviderName, { label: string; url: string; help: string }> = {
  gemini: {
    label: "Gemini (Google AI Studio)",
    url: "https://aistudio.google.com/apikey",
    help: "Crea una API key gratis en Google AI Studio y pégala aquí.",
  },
  claude: {
    label: "Claude (Anthropic)",
    url: "https://console.anthropic.com/settings/keys",
    help: "Generala en console.anthropic.com → API Keys.",
  },
  openai: {
    label: "OpenAI (ChatGPT API)",
    url: "https://platform.openai.com/api-keys",
    help: "Generala en platform.openai.com → API keys.",
  },
};

export function AIKeyModal({ visible, provider, onClose, onSaved }: Props) {
  const [key, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = INSTRUCTIONS[provider];

  async function onSave() {
    setError(null);
    if (!key.trim()) {
      setError("La key no puede estar vacía");
      return;
    }
    setBusy(true);
    try {
      // Smoke test: instanciar el provider verifica la firma del SDK; la validación
      // real de la key ocurrirá al primer scan. Aquí solo confirmamos forma y persistimos.
      createProvider(provider);
      await setKey(provider, key.trim());
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: "600" }}>API key — {info.label}</Text>
          <Text style={{ color: "#444" }}>{info.help}</Text>
          <Text style={{ color: "#2563eb" }} selectable>{info.url}</Text>
          <TextInput
            placeholder="Pegá tu API key"
            value={key}
            onChangeText={setKeyValue}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
          />
          {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, padding: 12, alignItems: "center" }}>
              <Text>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={busy}
              style={{ flex: 1, padding: 12, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2:** Run typecheck — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/AIKeyModal.tsx
git commit -m "feat(mobile): AIKeyModal (onboarding lazy de API key)"
```

---

### Task E2: Componente `ScanButton`

**Files:**
- Create: `apps/mobile/components/ScanButton.tsx`

- [ ] **Step 1: Implementar** — `apps/mobile/components/ScanButton.tsx`:

```typescript
import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { resolveActiveProvider } from "../services/ai/provider";
import { captureFromCamera, captureFromGallery } from "../services/ai/capture";
import { AIKeyModal } from "./AIKeyModal";
import type { ProviderName } from "@oraculo/core";

export function ScanButton() {
  const router = useRouter();
  const [needsKeyFor, setNeedsKeyFor] = useState<ProviderName | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      await resolveActiveProvider();
    } catch (e) {
      const err = e as Error & { code?: string; provider?: ProviderName };
      if (err.code === "NO_KEY" && err.provider) {
        setNeedsKeyFor(err.provider);
        setBusy(false);
        return;
      }
      Alert.alert("No se pudo iniciar el escaneo", err.message);
      setBusy(false);
      return;
    }
    askSource();
  }

  function askSource() {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancelar", "Tomar foto", "Elegir de galería"], cancelButtonIndex: 0 },
        async (i) => {
          if (i === 1) await pickAndGo("camera");
          else if (i === 2) await pickAndGo("gallery");
          else setBusy(false);
        },
      );
    } else {
      Alert.alert("Origen", "¿Cómo querés agregar la foto?", [
        { text: "Tomar foto", onPress: () => void pickAndGo("camera") },
        { text: "Galería", onPress: () => void pickAndGo("gallery") },
        { text: "Cancelar", style: "cancel", onPress: () => setBusy(false) },
      ]);
    }
  }

  async function pickAndGo(src: "camera" | "gallery") {
    try {
      const img = src === "camera" ? await captureFromCamera() : await captureFromGallery();
      if (!img) {
        setBusy(false);
        return;
      }
      router.push({
        pathname: "/(app)/scan/review",
        params: { imageBase64: img.base64, mimeType: img.mimeType },
      });
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Error al capturar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Pressable
        onPress={start}
        disabled={busy}
        style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#fff" }}>{busy ? "..." : "📷 Escanear"}</Text>
      </Pressable>
      {needsKeyFor ? (
        <AIKeyModal
          visible
          provider={needsKeyFor}
          onClose={() => setNeedsKeyFor(null)}
          onSaved={() => {
            setNeedsKeyFor(null);
            askSource();
          }}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2:** Run typecheck — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ScanButton.tsx
git commit -m "feat(mobile): ScanButton (action sheet camera/galeria + AIKeyModal lazy)"
```

---

### Task E3: Integrar `ScanButton` en el tab Gastos

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/index.tsx`

- [ ] **Step 1: Modificar** — En `apps/mobile/app/(app)/(tabs)/index.tsx`, importar `ScanButton`:

```typescript
import { ScanButton } from "../../../components/ScanButton";
```

Y en el bloque de botones inferior (donde están `+ Gasto` y `+ Factura`), agregar el tercero. Reemplazar el `<View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>` por:

```typescript
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Pressable
          onPress={() => router.push("/(app)/expense/new")}
          style={{ flex: 1, backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#fff" }}>+ Gasto</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push("/(app)/receipt/new")}
          style={{ flex: 1, backgroundColor: "#2563eb", borderRadius: 8, padding: 14, alignItems: "center" }}
        >
          <Text style={{ color: "#fff" }}>+ Factura</Text>
        </Pressable>
        <ScanButton />
      </View>
```

- [ ] **Step 2:** Run typecheck — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(app\)/\(tabs\)/index.tsx
git commit -m "feat(mobile): tab Gastos incorpora boton Escanear"
```

---

### Task E4: Pantalla `ReviewParsed`

**Files:**
- Create: `apps/mobile/app/(app)/scan/review.tsx`

- [ ] **Step 1: Implementar** — `apps/mobile/app/(app)/scan/review.tsx`:

```typescript
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { isAIError, type AIError, type ImageMimeType, type ParseResult, type ParseResultItem } from "@oraculo/core";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { ProductPicker, type ProductPickerValue } from "../../../components/ProductPicker";
import { getActiveHousehold } from "../../../services/household";
import { getCanonicalHints, resolveActiveProvider } from "../../../services/ai/provider";
import { createScannedReceipt, type ScannedReceiptItem } from "../../../services/receipts";

interface ItemDraft {
  rawName: string;
  quantity: string;
  totalPrice: string;
  unitPrice: string;
  regularPrice: string | null;
  isPromo: boolean;
  unit: "lt" | "kg" | "un" | null;
  categoryId: string | null;
  canonical: ProductPickerValue | null;
}

function toDraft(item: ParseResultItem, hints: Map<string, string>): ItemDraft {
  const canonical: ProductPickerValue | null = item.suggested_canonical_id
    ? {
        canonicalId: item.suggested_canonical_id,
        name: hints.get(item.suggested_canonical_id) ?? "Sugerido",
        aliasNormalized: item.raw_name.toUpperCase(),
        layer: "fuzzy_confirmed",
      }
    : null;
  return {
    rawName: item.raw_name,
    quantity: item.quantity,
    totalPrice: item.total_price,
    unitPrice: item.unit_price,
    regularPrice: item.regular_price,
    isPromo: item.is_promo,
    unit: item.unit,
    categoryId: null,
    canonical,
  };
}

export default function ReviewParsed() {
  const router = useRouter();
  const params = useLocalSearchParams<{ imageBase64: string; mimeType: string }>();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<AIError | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dataUrl = useMemo(
    () => `data:${params.mimeType ?? "image/jpeg"};base64,${params.imageBase64 ?? ""}`,
    [params.imageBase64, params.mimeType],
  );

  useEffect(() => {
    (async () => {
      try {
        const h = await getActiveHousehold();
        if (!h) {
          setError(makeError("unknown", "No hay hogar activo"));
          setState("error");
          return;
        }
        setHouseholdId(h.id);
        const { provider, apiKey } = await resolveActiveProvider();
        const hints = await getCanonicalHints(h.id);
        const hintMap = new Map(hints.map((h) => [h.id, h.name]));
        const result = await provider.parseReceipt({
          imageBase64: params.imageBase64 ?? "",
          imageMimeType: (params.mimeType ?? "image/jpeg") as ImageMimeType,
          canonicalHints: hints,
          apiKey,
        });
        console.info("[ai_scan.success]", {
          provider: provider.name,
          items_count: result.items.length,
          suggested_matches: result.items.filter((i) => i.suggested_canonical_id).length,
        });
        setParsed(result);
        setItems(result.items.map((it) => toDraft(it, hintMap)));
        setState("ready");
      } catch (e) {
        if (isAIError(e)) {
          console.info("[ai_scan.error]", { provider: e.provider, kind: e.kind });
          setError(e);
        } else {
          setError(makeError("unknown", e instanceof Error ? e.message : "Error"));
        }
        setState("error");
      }
    })();
  }, [params.imageBase64, params.mimeType]);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        if (patch.rawName !== undefined && patch.rawName !== it.rawName) {
          return { ...it, ...patch, canonical: null };
        }
        return { ...it, ...patch };
      }),
    );
  }

  async function onSave() {
    setSaveError(null);
    if (!householdId || !parsed) return;
    setBusy(true);
    try {
      const scanned: ScannedReceiptItem[] = items.map((i) => ({
        rawName: i.rawName,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        regularPrice: i.regularPrice,
        isPromo: i.isPromo,
        totalPrice: i.totalPrice,
        categoryId: i.categoryId,
        canonicalProductId: i.canonical?.canonicalId ?? null,
        aliasNormalized: i.canonical?.aliasNormalized ?? null,
      }));
      await createScannedReceipt(householdId, {
        storeId: null,
        purchasedAt: parsed.purchased_at,
        currency: parsed.currency,
        items: scanned,
      });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator size="large" />
        <Text>Leyendo factura con IA…</Text>
      </View>
    );
  }

  if (state === "error" && error) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>No pudimos procesar la foto</Text>
        <Text style={{ color: "#666" }}>{messageFor(error)}</Text>
        <Pressable onPress={() => router.back()} style={{ padding: 12, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}>
          <Text style={{ color: "#fff" }}>Volver</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!parsed || !householdId) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Revisar factura</Text>
      <Image source={{ uri: dataUrl }} style={{ width: 120, height: 120, borderRadius: 8 }} resizeMode="cover" />
      <View>
        <Text style={{ color: "#666" }}>Tienda: {parsed.store_name ?? "(sin detectar)"}</Text>
        <Text style={{ color: "#666" }}>Fecha: {parsed.purchased_at}</Text>
        <Text style={{ color: "#666" }}>Total IA: {parsed.total}</Text>
      </View>
      {items.map((item, index) => (
        <View key={index} style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, gap: 8 }}>
          <TextInput
            placeholder="Nombre"
            value={item.rawName}
            onChangeText={(t) => updateItem(index, { rawName: t })}
            style={inputStyle}
          />
          <ProductPicker
            householdId={householdId}
            rawName={item.rawName}
            defaultCategoryId={item.categoryId}
            value={item.canonical}
            onChange={(c) => updateItem(index, { canonical: c })}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Cantidad"
              keyboardType="numeric"
              value={item.quantity}
              onChangeText={(t) => updateItem(index, { quantity: t })}
              style={{ flex: 1, ...inputStyle }}
            />
            <TextInput
              placeholder="Total"
              keyboardType="numeric"
              value={item.totalPrice}
              onChangeText={(t) => updateItem(index, { totalPrice: t })}
              style={{ flex: 1, ...inputStyle }}
            />
          </View>
          {item.isPromo ? (
            <Text style={{ color: "#16a34a" }}>🏷️ Promo (regular: {item.regularPrice ?? "?"})</Text>
          ) : null}
          <CategoryPicker
            householdId={householdId}
            value={item.categoryId}
            onChange={(c) => updateItem(index, { categoryId: c })}
          />
        </View>
      ))}
      {saveError ? <Text style={{ color: "red" }}>{saveError}</Text> : null}
      <Pressable
        onPress={onSave}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar factura</Text>}
      </Pressable>
    </ScrollView>
  );
}

function makeError(kind: AIError["kind"], message: string): AIError {
  const e = new Error(message) as AIError;
  e.kind = kind;
  return e;
}

function messageFor(e: AIError): string {
  switch (e.kind) {
    case "auth": return "Tu API key parece inválida. Probá cambiarla desde Perfil.";
    case "rate_limit": return "El proveedor IA alcanzó su límite. Cambiá de proveedor en Perfil o reintentá luego.";
    case "timeout": return "La IA tardó demasiado. Intentá de nuevo con mejor red.";
    case "network": return "Sin conexión a la IA. Verificá tu red.";
    case "parse": return "La IA devolvió un formato inesperado. Probá una foto más clara o capturá manual.";
    case "unreadable": return "No pude leer la factura. Probá una foto más nítida.";
    default: return e.message;
  }
}

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;
```

- [ ] **Step 2:** Run typecheck + lint — PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(app\)/scan/review.tsx
git commit -m "feat(mobile): pantalla ReviewParsed reusa ProductPicker por item"
```

---

## Task Group F — Verificación final

### Task F1: Suite completa

- [ ] **Step 1: Restaurar `expo-env.d.ts` si Expo lo borró:**
```bash
git status
git checkout -- apps/mobile/expo-env.d.ts 2>/dev/null || true
```

- [ ] **Step 2: Full suite:**
```bash
pnpm typecheck
pnpm lint
pnpm --filter @oraculo/core test
pnpm --filter @oraculo/validations test
pnpm --filter @oraculo/db test
```
Conteos esperados:
- core: 38 anteriores + prompt(4) + error(9) + gemini(7) + claude(6) + openai(6) ≈ 70 tests.
- validations: 25 anteriores + parse-result(8) ≈ 33 tests.
- db: 23 anteriores + hito3(5) = 28 tests.

- [ ] **Step 3: Bundle web compila:**
```bash
cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec expo export --platform web
rm -rf apps/mobile/dist apps/mobile/.expo
```

- [ ] **Step 4: Push:**
```bash
git push -u origin hito-3-aiprovider-y-escaneo
```

- [ ] **Step 5: Abrir PR:**
```powershell
Start-Process "https://github.com/JohanDGA/OracleShop/compare/master...hito-3-aiprovider-y-escaneo?expand=1"
```

Título: `Hito 3: AIProvider + escaneo de facturas`

Body sugerido:

```markdown
## Resumen
Escaneo de facturas con IA: el usuario toma o sube una foto, el provider activo (Gemini default, Claude o OpenAI) parsea a JSON estructurado con matching semántico de los productos del hogar (Capa 3), y aterriza en una pantalla de revisión que reusa el ProductPicker del Hito 2 para confirmar y guardar.

### Implementación
- **`@oraculo/core/ai`**: interfaz `AIProvider`, prompt único, 3 implementaciones REST (fetch + Zod-validate). Mapeo de errores (auth/rate_limit/timeout/network/parse/unreadable/unknown).
- **`@oraculo/validations`**: `parseResultSchema` con regex de money/quantity/ISO-date.
- **Migración `0013`**: `create_receipt_with_items` v3 con `p_source DEFAULT 'manual'` y persistencia de `regular_price` + `is_promo` por ítem.
- **Mobile**: `services/ai/{keystore, capture, provider}` + `createScannedReceipt`. UI: `AIKeyModal` (onboarding lazy), `ScanButton` (action sheet camera/galería), pantalla `scan/review.tsx`.

### Tests
- `@oraculo/core`: 70 (incluye 32 nuevos del módulo ai).
- `@oraculo/validations`: 33 (8 nuevos de parse-result).
- `@oraculo/db`: 28 (5 nuevos de hito3 RPC v3).
- Typecheck (4 paquetes) y lint verdes, bundle web compila.

### E2E manual
En `localhost:8081` (o dispositivo): tap "📷 Escanear" en tab Gastos. Sin key configurada → modal pide pegar key Gemini → guardar. ActionSheet "Tomar foto" / "Galería". Elegir factura real → spinner → pantalla ReviewParsed con ítems pre-llenados + sugerencias en ProductPicker → editar → "Guardar factura" → aparece en lista del mes con source='photo_ai'.
```

- [ ] **Step 6: CI verde → merge → cleanup:**
```bash
git checkout master
git pull
git branch -d hito-3-aiprovider-y-escaneo
git push origin --delete hito-3-aiprovider-y-escaneo
```

---

## Notas operativas

- **Expo borra `expo-env.d.ts`** entre runs. Restaurar siempre antes de commitear.
- **Las API keys son del usuario** — nunca commitearlas, nunca loggearlas. Los tests mockean fetch; jamás hacen llamadas reales.
- **Fixture demo-receipt.jpg**: agregar una imagen real (~50-100KB) a `apps/mobile/assets/`. Si el implementador no tiene una a mano, dejar el asset out por ahora — el "Probar" del AIKeyModal queda como TODO menor (no bloquea el flujo principal porque el modal sólo persiste la key; la validación real ocurre en el primer scan).
- **Modelo de Claude (`claude-sonnet-4-20250514`)** — si en la fecha de implementación hay uno más nuevo / gratuito, sustituir.
- **`expo-secure-store` en web**: usa localStorage → inseguro para producción web, pero v1 es mobile-first. Web sólo se usa para E2E manual.
- **PR base**: este Hito asume que el repo está en `master` post-Hito-2 (commit `f216908` o posterior).
