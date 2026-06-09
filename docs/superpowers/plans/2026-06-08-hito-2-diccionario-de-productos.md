# Hito 2 — Diccionario de productos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la captura manual de facturas enlace cada ítem a un `canonical_product` del hogar, con auto-resolución por alias exacto (Capa 1) o trigram (Capa 2), y persistencia automática del alias para futuras facturas.

**Architecture:** Normalización + abreviaturas en TS puro (`@oraculo/core/dictionary`). Matching server-side vía RPC `match_product` con cascada Capa 1 (exact) → Capa 2 (`pg_trgm`). Crear canonical inline desde un `ProductPicker` que se incrusta por ítem en `receipt/new.tsx`. La extensión del RPC `create_receipt_with_items` persiste el alias atómicamente al guardar.

**Tech Stack:** TypeScript strict (`noUncheckedIndexedAccess`), Vitest, Zod, Postgres + pg_trgm, Supabase JS, Expo SDK 51 + Expo Router v3.

**Prerequisitos:** Master con Hito 1b mergeado (commit `3bee9ef` o posterior). Rama `hito-2-diccionario-de-productos` ya creada con el spec commiteado. Supabase local arriba (`pnpm db:start` + Docker Desktop).

**Out of scope (hitos posteriores):** Capa 3 semántica con IA (→ Hito 3); CRUD listado/edición/borrado de canónicos; cache local del diccionario (online sigue siendo el modo); reasignación masiva ítem→otro canonical; unidades extendidas (docena/libra/onza/galón).

---

## File Structure

```
packages/core/src/
├── abbreviations.ts                              # NUEVO: seed const
├── dictionary.ts                                 # NUEVO: normalizeName + pricePerStandardUnit
├── index.ts                                      # MOD: export
packages/core/tests/
├── abbreviations.test.ts                         # NUEVO
├── normalize-name.test.ts                        # NUEVO (TDD)
└── price-per-standard-unit.test.ts               # NUEVO (TDD)

packages/validations/src/
├── canonical.ts                                  # NUEVO: createCanonicalSchema
├── receipt.ts                                    # MOD: agregar canonicalProductId/aliasNormalized al item
├── index.ts                                      # MOD: export canonical
packages/validations/tests/
├── canonical.test.ts                             # NUEVO
└── receipt.test.ts                               # MOD: nuevos casos

packages/db/supabase/migrations/
├── 0009_pg_trgm_and_alias_normalized.sql         # NUEVO
├── 0010_match_product_rpc.sql                    # NUEVO
└── 0011_create_receipt_with_items_v2.sql         # NUEVO (CREATE OR REPLACE FUNCTION)
packages/db/tests/
├── helpers/supabase-clients.ts                   # MOD: extender cleanupUser
└── hito2.test.ts                                 # NUEVO

apps/mobile/services/
├── canonicals.ts                                 # NUEVO: createCanonical
├── match.ts                                      # NUEVO: matchProduct (wrapper RPC)
├── receipts.ts                                   # MOD: pasar canonical_product_id + alias_normalized
apps/mobile/components/
└── ProductPicker.tsx                             # NUEVO
apps/mobile/app/(app)/receipt/
└── new.tsx                                       # MOD: integrar ProductPicker por ítem
```

---

## Task Group A — `@oraculo/core/dictionary` (TDD)

### Task A1: Seed `ABBREVIATIONS`

**Files:**
- Create: `packages/core/src/abbreviations.ts`
- Create: `packages/core/tests/abbreviations.test.ts`

- [ ] **Step 1: Escribir el test que falla** — `packages/core/tests/abbreviations.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { ABBREVIATIONS } from "../src/abbreviations";

describe("ABBREVIATIONS seed", () => {
  it("mapea las abreviaturas comunes del mercado colombiano", () => {
    expect(ABBREVIATIONS["LCH"]).toBe("LECHE");
    expect(ABBREVIATIONS["DESLAC"]).toBe("DESLACTOSADA");
    expect(ABBREVIATIONS["ACEIT"]).toBe("ACEITE");
  });
  it("no tiene claves duplicadas implícitas (todas mapean a strings no vacíos)", () => {
    for (const [k, v] of Object.entries(ABBREVIATIONS)) {
      expect(k).toMatch(/^[A-ZÑ0-9]+$/);
      expect(v.length).toBeGreaterThan(0);
      expect(v).toMatch(/^[A-ZÑ0-9 ]+$/);
    }
  });
  it("contiene al menos 20 entradas curadas", () => {
    expect(Object.keys(ABBREVIATIONS).length).toBeGreaterThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Verificar el fallo**

Run: `pnpm --filter @oraculo/core test abbreviations`
Expected: FAIL — no se puede resolver `../src/abbreviations`.

- [ ] **Step 3: Implementar el seed** — `packages/core/src/abbreviations.ts`

```typescript
// Seed curado por el equipo (no crowdsourced). Mantener todo en MAYÚSCULAS sin tildes,
// porque normalizeName las aplica antes de buscar.
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
  LCH: "LECHE",
  DESLAC: "DESLACTOSADA",
  DESLACT: "DESLACTOSADA",
  ACEIT: "ACEITE",
  AZUC: "AZUCAR",
  ARRZ: "ARROZ",
  FRJL: "FRIJOL",
  HUEV: "HUEVOS",
  JABN: "JABON",
  JBN: "JABON",
  PAPL: "PAPEL",
  HIGN: "HIGIENICO",
  CHCL: "CHOCOLATE",
  GAS: "GASEOSA",
  AGU: "AGUA",
  QUES: "QUESO",
  MANT: "MANTEQUILLA",
  YOGT: "YOGURT",
  HARN: "HARINA",
  PIM: "PIMIENTA",
  DET: "DETERGENTE",
  SHAMP: "SHAMPOO",
  GALL: "GALLETAS",
  PASTA: "PASTA",
  TOM: "TOMATE",
};
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm --filter @oraculo/core test abbreviations`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/abbreviations.ts packages/core/tests/abbreviations.test.ts
git commit -m "feat(core): ABBREVIATIONS seed para mercado familiar CO"
```

---

### Task A2: `normalizeName` (TDD)

**Files:**
- Create: `packages/core/tests/normalize-name.test.ts`
- Create: `packages/core/src/dictionary.ts`

- [ ] **Step 1: Escribir tests que fallan** — `packages/core/tests/normalize-name.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { normalizeName } from "../src/dictionary";

describe("normalizeName", () => {
  it("uppercaseа y trimea", () => {
    expect(normalizeName("  leche  ")).toBe("LECHE");
  });
  it("quita tildes pero preserva Ñ", () => {
    expect(normalizeName("café piña")).toBe("CAFE PIÑA");
    expect(normalizeName("AÑEJO")).toBe("AÑEJO");
  });
  it("reemplaza puntuación y símbolos por espacio", () => {
    expect(normalizeName("Leche,Alpina/1.1L")).toBe("LECHE ALPINA 1 1L");
  });
  it("colapsa espacios múltiples", () => {
    expect(normalizeName("LECHE     ALPINA")).toBe("LECHE ALPINA");
  });
  it("expande abreviaturas por token, no substring", () => {
    expect(normalizeName("LCH ALPINA")).toBe("LECHE ALPINA");
    expect(normalizeName("LCH DESLAC")).toBe("LECHE DESLACTOSADA");
    // GAS está en el seed → GASEOSA. Pero no debe tocar "GASOLINA".
    expect(normalizeName("GAS NATURAL")).toBe("GASEOSA NATURAL");
    expect(normalizeName("GASOLINA")).toBe("GASOLINA");
  });
  it("es idempotente", () => {
    const once = normalizeName("LCH Deslac Alpina 1L");
    expect(normalizeName(once)).toBe(once);
  });
  it("devuelve string vacío para entrada vacía o solo símbolos", () => {
    expect(normalizeName("")).toBe("");
    expect(normalizeName("   ")).toBe("");
    expect(normalizeName(",.;:")).toBe("");
  });
});
```

- [ ] **Step 2: Verificar el fallo**

Run: `pnpm --filter @oraculo/core test normalize-name`
Expected: FAIL — no se puede resolver `../src/dictionary`.

- [ ] **Step 3: Implementar** — `packages/core/src/dictionary.ts`

```typescript
import { ABBREVIATIONS } from "./abbreviations";

/**
 * Normaliza un nombre de producto para matching: mayúsculas, sin tildes (preserva Ñ),
 * sin puntuación, espacios colapsados, y expansión de abreviaturas por TOKEN
 * (no substring → "GAS" no toca "GASOLINA").
 */
export function normalizeName(raw: string): string {
  if (!raw) return "";
  // Sentinel para preservar Ñ a través de NFD (Ñ decompone a N + ̃).
  // U+0001 (Start of Heading) es seguro: no aparece en input de usuario.
  const SENTINEL = "";
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm --filter @oraculo/core test normalize-name`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dictionary.ts packages/core/tests/normalize-name.test.ts
git commit -m "feat(core): normalizeName con expansion de abreviaturas (TDD)"
```

---

### Task A3: `pricePerStandardUnit` (TDD)

**Files:**
- Create: `packages/core/tests/price-per-standard-unit.test.ts`
- Modify: `packages/core/src/dictionary.ts`

- [ ] **Step 1: Escribir tests que fallan** — `packages/core/tests/price-per-standard-unit.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { toMinorUnits } from "../src/money";
import { pricePerStandardUnit } from "../src/dictionary";

const SCALE = 10000n;
const minor = (s: string) => toMinorUnits(s);

describe("pricePerStandardUnit", () => {
  it("Leche 1L que cuesta $5000 → $5000/lt", () => {
    const result = pricePerStandardUnit({
      unit: "lt",
      unitQuantity: minor("1"),
      quantity: minor("1"),
      totalPrice: minor("5000"),
    });
    expect(result).toBe(minor("5000"));
  });

  it("Leche 900ml (=0.9L) que cuesta $4800 → $5333.3333/lt (precision BigInt)", () => {
    const result = pricePerStandardUnit({
      unit: "lt",
      unitQuantity: minor("0.9"),
      quantity: minor("1"),
      totalPrice: minor("4800"),
    });
    // 4800 / 0.9 = 5333.333...  → en escala 4: 53333333n
    expect(result).toBe(53333333n);
  });

  it("2 unidades de 500g (=1kg total) que cuestan $10000 → $10000/kg", () => {
    const result = pricePerStandardUnit({
      unit: "kg",
      unitQuantity: minor("0.5"),
      quantity: minor("2"),
      totalPrice: minor("10000"),
    });
    expect(result).toBe(minor("10000"));
  });

  it("3 unidades de jabón a $3000 total → $1000/un", () => {
    const result = pricePerStandardUnit({
      unit: "un",
      unitQuantity: minor("1"),
      quantity: minor("3"),
      totalPrice: minor("3000"),
    });
    expect(result).toBe(minor("1000"));
  });

  it("retorna null si quantity es 0", () => {
    expect(
      pricePerStandardUnit({
        unit: "lt",
        unitQuantity: minor("1"),
        quantity: 0n,
        totalPrice: minor("100"),
      }),
    ).toBeNull();
  });

  it("retorna null si unit_quantity es 0", () => {
    expect(
      pricePerStandardUnit({
        unit: "lt",
        unitQuantity: 0n,
        quantity: minor("1"),
        totalPrice: minor("100"),
      }),
    ).toBeNull();
  });

  it("preserva tipo bigint (no Number)", () => {
    const result = pricePerStandardUnit({
      unit: "un",
      unitQuantity: minor("1"),
      quantity: minor("1"),
      totalPrice: minor("123.4567"),
    });
    expect(typeof result).toBe("bigint");
  });
});
```

- [ ] **Step 2: Verificar el fallo**

Run: `pnpm --filter @oraculo/core test price-per-standard-unit`
Expected: FAIL — `pricePerStandardUnit` no exportado.

- [ ] **Step 3: Implementar** — agregar al final de `packages/core/src/dictionary.ts`

```typescript
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm --filter @oraculo/core test price-per-standard-unit`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dictionary.ts packages/core/tests/price-per-standard-unit.test.ts
git commit -m "feat(core): pricePerStandardUnit en BigInt escala 4 (TDD)"
```

---

### Task A4: Exportar `dictionary` desde el índice de `@oraculo/core`

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Modificar** — `packages/core/src/index.ts`

```typescript
export * from "./money";
export * from "./monthly-summary";
export * from "./month-range";
export * from "./abbreviations";
export * from "./dictionary";
```

- [ ] **Step 2: Verificar build & tests**

Run: `pnpm --filter @oraculo/core test && pnpm typecheck`
Expected: PASS — todos los tests del core (anteriores + 3 nuevos archivos = 21 + ~17 = ~38 tests).

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): export dictionary + abbreviations"
```

---

## Task Group B — `@oraculo/validations`: schemas

### Task B1: Schema `createCanonical`

**Files:**
- Create: `packages/validations/src/canonical.ts`
- Create: `packages/validations/tests/canonical.test.ts`
- Modify: `packages/validations/src/index.ts`

- [ ] **Step 1: Escribir el test que falla** — `packages/validations/tests/canonical.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { createCanonicalSchema } from "../src/canonical";

const base = {
  name: "Leche Alpina 1L",
  brand: "Alpina",
  presentation: "Caja 1L",
  unit: "lt" as const,
  unitQuantity: "1",
  categoryId: null,
};

describe("createCanonicalSchema", () => {
  it("acepta input válido con unit lt/kg/un", () => {
    expect(createCanonicalSchema.safeParse(base).success).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, unit: "kg", unitQuantity: "0.5" }).success).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, unit: "un", unitQuantity: "12" }).success).toBe(true);
  });

  it("rechaza unidad fuera del set", () => {
    expect(createCanonicalSchema.safeParse({ ...base, unit: "ml" }).success).toBe(false);
  });

  it("rechaza unitQuantity <= 0", () => {
    expect(createCanonicalSchema.safeParse({ ...base, unitQuantity: "0" }).success).toBe(false);
    expect(createCanonicalSchema.safeParse({ ...base, unitQuantity: "-1" }).success).toBe(false);
  });

  it("rechaza name vacío o solo espacios", () => {
    expect(createCanonicalSchema.safeParse({ ...base, name: "" }).success).toBe(false);
    expect(createCanonicalSchema.safeParse({ ...base, name: "   " }).success).toBe(false);
  });

  it("brand y presentation son opcionales (pueden ser null o ausentes)", () => {
    expect(
      createCanonicalSchema.safeParse({
        name: base.name,
        unit: base.unit,
        unitQuantity: base.unitQuantity,
        categoryId: null,
      }).success,
    ).toBe(true);
    expect(createCanonicalSchema.safeParse({ ...base, brand: null, presentation: null }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar el fallo**

Run: `pnpm --filter @oraculo/validations test canonical`
Expected: FAIL — no se puede resolver `../src/canonical`.

- [ ] **Step 3: Implementar** — `packages/validations/src/canonical.ts`

```typescript
import { z } from "zod";

const positiveQuantity = z
  .string()
  .regex(/^\d{1,6}(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");

export const createCanonicalSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  brand: z.string().trim().max(120).nullable().optional(),
  presentation: z.string().trim().max(120).nullable().optional(),
  unit: z.enum(["lt", "kg", "un"], { errorMap: () => ({ message: "Unidad inválida" }) }),
  unitQuantity: positiveQuantity,
  categoryId: z.string().uuid().nullable(),
});

export type CreateCanonicalInput = z.infer<typeof createCanonicalSchema>;
```

- [ ] **Step 4: Exportar** — `packages/validations/src/index.ts`

Agregar al final:

```typescript
export * from "./canonical";
```

- [ ] **Step 5: Verificar**

Run: `pnpm --filter @oraculo/validations test canonical`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/validations/src/canonical.ts packages/validations/src/index.ts packages/validations/tests/canonical.test.ts
git commit -m "feat(validations): createCanonicalSchema con unit enum y unitQuantity > 0"
```

---

### Task B2: Extender `receiptItemSchema` con canonical opcional

**Files:**
- Modify: `packages/validations/src/receipt.ts`
- Modify: `packages/validations/tests/receipt.test.ts`

- [ ] **Step 1: Escribir tests adicionales** — agregar al final de `packages/validations/tests/receipt.test.ts`

```typescript
import { receiptItemSchema } from "../src/receipt";

describe("receiptItemSchema con canonical opcional", () => {
  const baseItem = {
    rawName: "Leche Alpina",
    quantity: "1",
    unitPrice: "5000",
    totalPrice: "5000",
    categoryId: null,
  };

  it("acepta ítem sin canonical (ambos campos ausentes o null)", () => {
    expect(receiptItemSchema.safeParse(baseItem).success).toBe(true);
    expect(
      receiptItemSchema.safeParse({ ...baseItem, canonicalProductId: null, aliasNormalized: null }).success,
    ).toBe(true);
  });

  it("acepta ítem con canonical + alias_normalized juntos", () => {
    expect(
      receiptItemSchema.safeParse({
        ...baseItem,
        canonicalProductId: "00000000-0000-0000-0000-000000000001",
        aliasNormalized: "LECHE ALPINA",
      }).success,
    ).toBe(true);
  });

  it("rechaza ítem con canonical pero sin alias_normalized", () => {
    expect(
      receiptItemSchema.safeParse({
        ...baseItem,
        canonicalProductId: "00000000-0000-0000-0000-000000000001",
        aliasNormalized: null,
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar fallo**

Run: `pnpm --filter @oraculo/validations test receipt`
Expected: 3 nuevos tests fallan.

- [ ] **Step 3: Modificar el schema** — `packages/validations/src/receipt.ts`

Reemplazar el bloque `receiptItemSchema`:

```typescript
export const receiptItemSchema = z
  .object({
    rawName: z.string().trim().min(1, "El nombre del ítem es obligatorio").max(200),
    quantity: positiveQuantity,
    unitPrice: nonNegativeAmount,
    totalPrice: positiveAmount,
    categoryId: z.string().uuid().nullable(),
    canonicalProductId: z.string().uuid().nullable().optional(),
    aliasNormalized: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine(
    (item) => {
      const hasCanonical = item.canonicalProductId != null;
      const hasAlias = item.aliasNormalized != null && item.aliasNormalized !== "";
      // O ambos presentes o ambos ausentes
      return hasCanonical === hasAlias;
    },
    { message: "canonicalProductId requiere aliasNormalized (y viceversa)" },
  );
```

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm --filter @oraculo/validations test receipt`
Expected: todos los tests (anteriores + 3 nuevos) PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validations/src/receipt.ts packages/validations/tests/receipt.test.ts
git commit -m "feat(validations): receipt items aceptan canonical + alias_normalized opcionales"
```

---

## Task Group C — Base de datos: migraciones

### Task C1: Migración `0009` — pg_trgm + alias_normalized + índices

**Files:**
- Create: `packages/db/supabase/migrations/0009_pg_trgm_and_alias_normalized.sql`

- [ ] **Step 1: Crear archivo** — `packages/db/supabase/migrations/0009_pg_trgm_and_alias_normalized.sql`

```sql
-- Habilita matching fuzzy (Capa 2) y prepara la columna normalizada que indexamos.

create extension if not exists pg_trgm;

alter table public.product_aliases
  add column if not exists alias_normalized text not null default '';

-- Índice trigram para similaridad (Capa 2).
create index if not exists idx_product_aliases_normalized_trgm
  on public.product_aliases using gin (alias_normalized gin_trgm_ops);

-- Unique compuesto: garantiza idempotencia del INSERT en la RPC v2
-- (ON CONFLICT por canonical + alias_normalized) y acelera lookups de Capa 1.
create unique index if not exists idx_product_aliases_unique_per_canonical
  on public.product_aliases (canonical_product_id, alias_normalized);
```

- [ ] **Step 2: Aplicar la migración**

Run: `docker exec -i supabase_db_db psql -U postgres -d postgres < packages/db/supabase/migrations/0009_pg_trgm_and_alias_normalized.sql`
Expected: `CREATE EXTENSION` (o `NOTICE: extension "pg_trgm" already exists, skipping`) + `ALTER TABLE` + 2 × `CREATE INDEX`.

- [ ] **Step 3: Verificar en DB**

Run:
```bash
docker exec supabase_db_db psql -U postgres -d postgres -c "select indexname from pg_indexes where tablename='product_aliases';"
```
Expected: lista incluye `idx_product_aliases_normalized_trgm` y `idx_product_aliases_unique_per_canonical`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/supabase/migrations/0009_pg_trgm_and_alias_normalized.sql
git commit -m "feat(db): pg_trgm + alias_normalized en product_aliases con indices"
```

---

### Task C2: Migración `0010` — RPC `match_product`

**Files:**
- Create: `packages/db/supabase/migrations/0010_match_product_rpc.sql`

- [ ] **Step 1: Crear archivo** — `packages/db/supabase/migrations/0010_match_product_rpc.sql`

```sql
-- Cascada de matching: Capa 1 (exacto sobre alias_normalized) → Capa 2 (pg_trgm).
-- SECURITY INVOKER: respeta la RLS de canonical_products (is_household_member).
-- Devuelve un único jsonb con la forma { exact, fuzzy }.

create or replace function public.match_product(
  p_household_id uuid,
  p_normalized text,
  p_min_similarity numeric default 0.6
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_exact jsonb;
  v_fuzzy jsonb;
begin
  if coalesce(trim(p_normalized), '') = '' then
    return jsonb_build_object('exact', null, 'fuzzy', '[]'::jsonb);
  end if;

  -- Capa 1: match exacto sobre alias_normalized
  select jsonb_build_object('canonical_id', cp.id, 'name', cp.name, 'confidence', 1.0)
    into v_exact
    from public.product_aliases pa
    join public.canonical_products cp on cp.id = pa.canonical_product_id
    where pa.alias_normalized = p_normalized
      and cp.household_id = p_household_id
      and cp.deleted_at is null
    limit 1;

  if v_exact is not null then
    return jsonb_build_object('exact', v_exact, 'fuzzy', '[]'::jsonb);
  end if;

  -- Capa 2: fuzzy con dedupe por canonical (mejor score gana)
  with hits as (
    select cp.id as canonical_id,
           cp.name,
           max(similarity(pa.alias_normalized, p_normalized)) as score
      from public.product_aliases pa
      join public.canonical_products cp on cp.id = pa.canonical_product_id
      where cp.household_id = p_household_id
        and cp.deleted_at is null
        and similarity(pa.alias_normalized, p_normalized) >= p_min_similarity
      group by cp.id, cp.name
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('canonical_id', canonical_id, 'name', name, 'score', score)
              order by score desc),
    '[]'::jsonb
  )
  into v_fuzzy
  from (select * from hits order by score desc limit 3) t;

  return jsonb_build_object('exact', null, 'fuzzy', v_fuzzy);
end;
$$;

revoke all on function public.match_product(uuid, text, numeric) from public;
grant execute on function public.match_product(uuid, text, numeric) to authenticated;
```

- [ ] **Step 2: Aplicar y verificar**

Run: `docker exec -i supabase_db_db psql -U postgres -d postgres < packages/db/supabase/migrations/0010_match_product_rpc.sql`
Expected: `CREATE FUNCTION`, `REVOKE`, `GRANT`.

Run sanity manual:
```bash
docker exec supabase_db_db psql -U postgres -d postgres -c "select public.match_product('00000000-0000-0000-0000-000000000000', 'NADA');"
```
Expected: `{"exact": null, "fuzzy": []}`.

- [ ] **Step 3: Commit**

```bash
git add packages/db/supabase/migrations/0010_match_product_rpc.sql
git commit -m "feat(db): RPC match_product (Capa 1 exacto + Capa 2 pg_trgm con dedupe)"
```

---

### Task C3: Migración `0011` — `create_receipt_with_items` v2 (persiste alias)

**Files:**
- Create: `packages/db/supabase/migrations/0011_create_receipt_with_items_v2.sql`

- [ ] **Step 1: Crear archivo**

```sql
-- v2: ahora acepta canonical_product_id + alias_normalized por ítem y persiste
-- el alias atómicamente. ON CONFLICT por (canonical, alias_normalized) evita duplicados.
-- Mantiene SECURITY INVOKER y la misma firma (jsonb p_items absorbe los nuevos campos).

create or replace function public.create_receipt_with_items(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at date,
  p_currency text,
  p_items jsonb
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

  select coalesce(sum((item->>'total_price')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_items) as item;

  insert into public.receipts
    (household_id, created_by, store_id, purchased_at, total, currency, source)
    values (p_household_id, auth.uid(), p_store_id, p_purchased_at, v_total, p_currency, 'manual')
    returning id into v_receipt_id;

  insert into public.receipt_items
    (receipt_id, raw_name, quantity, unit, unit_price, total_price, category_id,
     canonical_product_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric,
      nullif(item->>'category_id', '')::uuid,
      nullif(item->>'canonical_product_id', '')::uuid,
      (row_number() over ())::int
    from jsonb_array_elements(p_items) as item;

  -- Persistir el alias para que la próxima factura con el mismo raw_name
  -- resuelva en Capa 1 sin intervención del usuario.
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

- [ ] **Step 2: Aplicar**

Run: `docker exec -i supabase_db_db psql -U postgres -d postgres < packages/db/supabase/migrations/0011_create_receipt_with_items_v2.sql`
Expected: `CREATE FUNCTION`.

- [ ] **Step 3: Sanity check del RPC original sin canonical (no debe romperse)**

Run:
```bash
docker exec supabase_db_db psql -U postgres -d postgres -c "select pg_get_function_arguments('public.create_receipt_with_items'::regproc);"
```
Expected: misma firma `(p_household_id uuid, p_store_id uuid, p_purchased_at date, p_currency text, p_items jsonb)`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/supabase/migrations/0011_create_receipt_with_items_v2.sql
git commit -m "feat(db): create_receipt_with_items v2 persiste alias atomicamente"
```

---

### Task C4: Extender `cleanupUser` (tests)

**Files:**
- Modify: `packages/db/tests/helpers/supabase-clients.ts`

- [ ] **Step 1: Leer estado actual**

Antes de modificar revisar el archivo para entender el orden FK-seguro existente.

- [ ] **Step 2: Modificar** — dentro de `cleanupUser`, antes del `delete .from("receipts")`, agregar:

```typescript
    // Borrar product_aliases que pertenezcan a canonical_products del hogar antes de tocar receipts.
    const { data: canonicals } = await service
      .from("canonical_products")
      .select("id")
      .eq("household_id", hid);
    for (const cp of canonicals ?? []) {
      await service.from("product_aliases").delete().eq("canonical_product_id", cp.id as string);
    }
```

Y antes del `delete .from("household_members")`, agregar:

```typescript
    await service.from("canonical_products").delete().eq("household_id", hid);
```

(El orden es: items → receipts → manual_expenses → product_aliases → canonical_products → members.)

- [ ] **Step 3: Commit**

```bash
git add packages/db/tests/helpers/supabase-clients.ts
git commit -m "test(db): cleanupUser borra product_aliases y canonical_products"
```

---

### Task C5: Tests integrales del Hito 2

**Files:**
- Create: `packages/db/tests/hito2.test.ts`

- [ ] **Step 1: Escribir tests** — `packages/db/tests/hito2.test.ts`

```typescript
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalKeys, makeServiceClient, makeUserClient, cleanupUser } from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let userB: { userId: string; client: SupabaseClient };
let householdA: string;
let householdB: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `h2a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `h2b_${stamp}@test.local`, "password123");

  const { data: hA } = await service.from("households").insert({ name: "H2 A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });
  const { data: hB } = await service.from("households").insert({ name: "H2 B", created_by: userB.userId }).select("id").single();
  householdB = hB!.id;
  await service.from("household_members").insert({ household_id: householdB, user_id: userB.userId, role: "owner" });
});

afterAll(async () => {
  await cleanupUser(service, userA.userId);
  await cleanupUser(service, userB.userId);
});

async function seedCanonical(client: SupabaseClient, householdId: string, name: string, alias: string, normalized: string) {
  const { data: cp } = await client
    .from("canonical_products")
    .insert({ household_id: householdId, name, unit: "lt", unit_quantity: "1" })
    .select("id")
    .single();
  await client
    .from("product_aliases")
    .insert({ canonical_product_id: cp!.id, alias, alias_normalized: normalized, source: "user_confirmed", confidence: 1.0 });
  return cp!.id as string;
}

describe("match_product RPC", () => {
  it("Capa 1: exact match retorna confidence 1.0", async () => {
    const cpId = await seedCanonical(userA.client, householdA, "Leche Alpina 1L", "LECHE ALPINA 1L", "LECHE ALPINA 1L");
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "LECHE ALPINA 1L",
    });
    expect(data.exact?.canonical_id).toBe(cpId);
    expect(data.exact?.confidence).toBe(1);
    expect(data.fuzzy).toEqual([]);
  });

  it("Capa 2: fuzzy retorna top-3 por score, sin duplicar canonical", async () => {
    // alias adicional para el mismo canonical (debe dedupe)
    const { data: existing } = await userA.client.from("canonical_products").select("id").eq("household_id", householdA).limit(1).single();
    await userA.client.from("product_aliases").insert({
      canonical_product_id: existing!.id,
      alias: "LCHE ALPN",
      alias_normalized: "LECHE ALPINA",
      source: "user_confirmed",
      confidence: 1.0,
    });
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "LECHE ALPN",
    });
    // Sin exact (string distinto a cualquier alias_normalized)
    expect(data.exact).toBeNull();
    // fuzzy debe tener exactamente 1 entrada (el canonical único)
    expect(data.fuzzy.length).toBe(1);
    expect(data.fuzzy[0].score).toBeGreaterThanOrEqual(0.6);
  });

  it("threshold: similarity < min_similarity → vacío", async () => {
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdA,
      p_normalized: "PANALES TURBO",
      p_min_similarity: 0.9,
    });
    expect(data.exact).toBeNull();
    expect(data.fuzzy).toEqual([]);
  });

  it("RLS: A no ve canonicales de B (RPC contra household de B desde A → vacío)", async () => {
    await seedCanonical(service, householdB, "Yogurt B", "YOGURT B", "YOGURT B");
    const { data } = await userA.client.rpc("match_product", {
      p_household_id: householdB,
      p_normalized: "YOGURT B",
    });
    expect(data.exact).toBeNull();
    expect(data.fuzzy).toEqual([]);
  });
});

describe("create_receipt_with_items v2 persiste alias", () => {
  it("inserta alias cuando el item trae canonical_product_id + alias_normalized", async () => {
    const cpId = await seedCanonical(userA.client, householdA, "Pan Bimbo", "PAN BIMBO", "PAN BIMBO");
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Pan Bimbo grande",
          quantity: "1",
          unit: null,
          unit_price: "8000",
          total_price: "8000",
          category_id: null,
          canonical_product_id: cpId,
          alias_normalized: "PAN BIMBO GRANDE",
        },
      ],
    });
    const { data: aliases } = await userA.client
      .from("product_aliases")
      .select("alias_normalized")
      .eq("canonical_product_id", cpId);
    expect(aliases?.map((a) => a.alias_normalized)).toContain("PAN BIMBO GRANDE");
  });

  it("ON CONFLICT: segundo INSERT del mismo (canonical, alias_normalized) es no-op", async () => {
    const { data: cp } = await userA.client
      .from("canonical_products")
      .select("id")
      .eq("name", "Pan Bimbo")
      .limit(1)
      .single();
    const before = (
      await userA.client.from("product_aliases").select("id", { count: "exact", head: true }).eq("canonical_product_id", cp!.id)
    ).count;
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Pan Bimbo grande",
          quantity: "1",
          unit: null,
          unit_price: "8000",
          total_price: "8000",
          category_id: null,
          canonical_product_id: cp!.id,
          alias_normalized: "PAN BIMBO GRANDE",
        },
      ],
    });
    const after = (
      await userA.client.from("product_aliases").select("id", { count: "exact", head: true }).eq("canonical_product_id", cp!.id)
    ).count;
    expect(after).toBe(before);
  });

  it("ítem sin canonical_product_id: no inserta alias", async () => {
    const { count: before } = await userA.client
      .from("product_aliases")
      .select("id", { count: "exact", head: true });
    await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-08",
      p_currency: "COP",
      p_items: [
        {
          raw_name: "Cualquier cosa",
          quantity: "1",
          unit: null,
          unit_price: "100",
          total_price: "100",
          category_id: null,
        },
      ],
    });
    const { count: after } = await userA.client
      .from("product_aliases")
      .select("id", { count: "exact", head: true });
    expect(after).toBe(before);
  });
});
```

- [ ] **Step 2: Correr tests**

Run: `pnpm --filter @oraculo/db test hito2`
Expected: 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/tests/hito2.test.ts
git commit -m "test(db): match_product + create_receipt_with_items v2 (Hito 2)"
```

---

## Task Group D — Mobile services

### Task D1: `services/canonicals.ts` — crear canonical inline

**Files:**
- Create: `apps/mobile/services/canonicals.ts`

- [ ] **Step 1: Implementar** — `apps/mobile/services/canonicals.ts`

```typescript
import type { CreateCanonicalInput } from "@oraculo/validations";
import { supabase } from "../lib/supabase";

export interface Canonical {
  id: string;
  name: string;
}

/** INSERT directo a canonical_products. La RLS valida pertenencia al hogar. */
export async function createCanonical(
  householdId: string,
  input: CreateCanonicalInput,
): Promise<Canonical> {
  const { data, error } = await supabase
    .from("canonical_products")
    .insert({
      household_id: householdId,
      name: input.name,
      brand: input.brand ?? null,
      presentation: input.presentation ?? null,
      unit: input.unit,
      unit_quantity: input.unitQuantity,
      category_id: input.categoryId,
    })
    .select("id, name")
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No se pudo crear el producto");
  return { id: data.id as string, name: data.name as string };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @oraculo/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/canonicals.ts
git commit -m "feat(mobile): services/canonicals con createCanonical"
```

---

### Task D2: `services/match.ts` — wrapper de la RPC

**Files:**
- Create: `apps/mobile/services/match.ts`

- [ ] **Step 1: Implementar**

```typescript
import { normalizeName } from "@oraculo/core";
import { supabase } from "../lib/supabase";

export interface MatchCandidate {
  canonicalId: string;
  name: string;
  /** presente en exact */
  confidence?: number;
  /** presente en fuzzy */
  score?: number;
}

export interface MatchResult {
  exact: MatchCandidate | null;
  fuzzy: MatchCandidate[];
}

/**
 * Normaliza el raw_name en cliente y llama a match_product. Retorna también
 * la cadena normalizada (el caller la persiste como alias_normalized si confirma).
 */
export async function matchProduct(
  householdId: string,
  rawName: string,
): Promise<{ normalized: string; result: MatchResult }> {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return { normalized, result: { exact: null, fuzzy: [] } };
  }
  const { data, error } = await supabase.rpc("match_product", {
    p_household_id: householdId,
    p_normalized: normalized,
  });
  if (error) throw new Error(error.message);
  // supabase-js tipa data como `unknown`; el RPC garantiza la forma.
  const raw = data as { exact: RawCandidate | null; fuzzy: RawCandidate[] } | null;
  const result: MatchResult = {
    exact: raw?.exact ? toCandidate(raw.exact) : null,
    fuzzy: (raw?.fuzzy ?? []).map(toCandidate),
  };
  return { normalized, result };
}

interface RawCandidate {
  canonical_id: string;
  name: string;
  confidence?: number;
  score?: number;
}

function toCandidate(r: RawCandidate): MatchCandidate {
  return { canonicalId: r.canonical_id, name: r.name, confidence: r.confidence, score: r.score };
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @oraculo/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/match.ts
git commit -m "feat(mobile): services/match con matchProduct (normaliza + RPC)"
```

---

### Task D3: Actualizar `services/receipts.ts` para pasar canonical + alias

**Files:**
- Modify: `apps/mobile/services/receipts.ts`

- [ ] **Step 1: Reemplazar contenido** — `apps/mobile/services/receipts.ts`

```typescript
import type { ManualReceiptInput } from "@oraculo/validations";
import { supabase } from "../lib/supabase";

/** Crea una factura manual vía la RPC atómica v2. Persiste alias si el ítem trae canonical. */
export async function createManualReceipt(
  householdId: string,
  input: ManualReceiptInput,
): Promise<string> {
  const items = input.items.map((i) => ({
    raw_name: i.rawName,
    quantity: i.quantity,
    unit: null,
    unit_price: i.unitPrice,
    total_price: i.totalPrice,
    category_id: i.categoryId,
    canonical_product_id: i.canonicalProductId ?? null,
    alias_normalized: i.aliasNormalized ?? null,
  }));
  const { data, error } = await supabase.rpc("create_receipt_with_items", {
    p_household_id: householdId,
    p_store_id: input.storeId,
    p_purchased_at: input.purchasedAt,
    p_currency: input.currency,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
```

- [ ] **Step 2: Verificar**

Run: `pnpm --filter @oraculo/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/receipts.ts
git commit -m "feat(mobile): receipts service pasa canonical_product_id y alias_normalized"
```

---

## Task Group E — Mobile UI

### Task E1: `components/ProductPicker.tsx`

**Files:**
- Create: `apps/mobile/components/ProductPicker.tsx`

- [ ] **Step 1: Implementar**

```typescript
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { createCanonicalSchema, type CreateCanonicalInput } from "@oraculo/validations";
import { matchProduct, type MatchCandidate, type MatchResult } from "../services/match";
import { createCanonical } from "../services/canonicals";
import { CategoryPicker } from "./CategoryPicker";

export interface ProductPickerValue {
  canonicalId: string;
  name: string;
  aliasNormalized: string;
  /** De qué capa salió la resolución (instrumentación spec §6). */
  layer: "exact" | "fuzzy_confirmed" | "created";
}

interface Props {
  householdId: string;
  rawName: string;
  defaultCategoryId: string | null;
  value: ProductPickerValue | null;
  onChange: (next: ProductPickerValue | null) => void;
}

const DEBOUNCE_MS = 400;

export function ProductPicker({ householdId, rawName, defaultCategoryId, value, onChange }: Props) {
  const [result, setResult] = useState<MatchResult>({ exact: null, fuzzy: [] });
  const [normalized, setNormalized] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueried = useRef<string>("");

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!rawName.trim()) {
      setResult({ exact: null, fuzzy: [] });
      setNormalized("");
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { normalized: n, result: r } = await matchProduct(householdId, rawName);
        if (lastQueried.current !== rawName) lastQueried.current = rawName;
        setNormalized(n);
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error en match");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [rawName, householdId]);

  function pick(c: MatchCandidate, layer: "exact" | "fuzzy_confirmed") {
    onChange({ canonicalId: c.canonicalId, name: c.name, aliasNormalized: normalized, layer });
    // Instrumentación — Hito 7 lo conectará a Sentry/dashboard.
    console.info("[match_resolved]", { layer });
  }

  if (value) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: "#0a7f1a" }}>✓ {value.name}</Text>
        <Pressable onPress={() => onChange(null)}>
          <Text style={{ color: "#666" }}>cambiar</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) return <ActivityIndicator />;
  if (error) return <Text style={{ color: "red" }}>{error}</Text>;
  if (!rawName.trim()) return <Text style={{ color: "#999" }}>Escribe el nombre para sugerir un producto</Text>;

  return (
    <View style={{ gap: 6 }}>
      {result.exact ? (
        <Pressable onPress={() => pick(result.exact!, "exact")} style={chipStyle("#dcfce7")}>
          <Text style={{ color: "#166534" }}>✓ {result.exact.name}</Text>
        </Pressable>
      ) : result.fuzzy.length > 0 ? (
        result.fuzzy.map((c) => (
          <Pressable key={c.canonicalId} onPress={() => pick(c, "fuzzy_confirmed")} style={chipStyle("#fef9c3")}>
            <Text style={{ color: "#854d0e" }}>
              ≈ {c.name}
              {c.score ? `  (${Math.round(c.score * 100)}%)` : ""}
            </Text>
          </Pressable>
        ))
      ) : (
        <Text style={{ color: "#999" }}>Sin coincidencias</Text>
      )}
      <Pressable onPress={() => setShowCreate(true)} style={chipStyle("#e5e7eb")}>
        <Text style={{ color: "#111" }}>+ Crear producto nuevo</Text>
      </Pressable>

      {showCreate ? (
        <CreateCanonicalForm
          householdId={householdId}
          defaultName={rawName}
          defaultCategoryId={defaultCategoryId}
          onCancel={() => setShowCreate(false)}
          onCreated={(canon) => {
            setShowCreate(false);
            onChange({ canonicalId: canon.id, name: canon.name, aliasNormalized: normalized, layer: "created" });
            console.info("[match_resolved]", { layer: "created" });
          }}
        />
      ) : null}
    </View>
  );
}

function chipStyle(bg: string) {
  return { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: bg, borderRadius: 8 };
}

interface CreateFormProps {
  householdId: string;
  defaultName: string;
  defaultCategoryId: string | null;
  onCancel: () => void;
  onCreated: (c: { id: string; name: string }) => void;
}

function CreateCanonicalForm({ householdId, defaultName, defaultCategoryId, onCancel, onCreated }: CreateFormProps) {
  const [name, setName] = useState(defaultName);
  const [brand, setBrand] = useState("");
  const [presentation, setPresentation] = useState("");
  const [unit, setUnit] = useState<"lt" | "kg" | "un">("un");
  const [unitQuantity, setUnitQuantity] = useState("1");
  const [categoryId, setCategoryId] = useState<string | null>(defaultCategoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const input: CreateCanonicalInput = {
      name,
      brand: brand.trim() || null,
      presentation: presentation.trim() || null,
      unit,
      unitQuantity,
      categoryId,
    };
    const parsed = createCanonicalSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const canon = await createCanonical(householdId, parsed.data);
      onCreated(canon);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, gap: 8, marginTop: 6 }}>
      <Text style={{ fontWeight: "600" }}>Crear producto</Text>
      <TextInput placeholder="Nombre" value={name} onChangeText={setName} style={inputStyle} />
      <TextInput placeholder="Marca (opcional)" value={brand} onChangeText={setBrand} style={inputStyle} />
      <TextInput placeholder="Presentación (opcional)" value={presentation} onChangeText={setPresentation} style={inputStyle} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["lt", "kg", "un"] as const).map((u) => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: "center",
              backgroundColor: unit === u ? "#111" : "#eee",
            }}
          >
            <Text style={{ color: unit === u ? "#fff" : "#111" }}>{u}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        placeholder="Cantidad por unidad (ej. 1, 0.9, 0.5)"
        keyboardType="numeric"
        value={unitQuantity}
        onChangeText={setUnitQuantity}
        style={inputStyle}
      />
      <CategoryPicker householdId={householdId} value={categoryId} onChange={setCategoryId} />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable onPress={onCancel} style={{ flex: 1, padding: 10, alignItems: "center" }}>
          <Text>Cancelar</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={busy}
          style={{ flex: 1, padding: 10, alignItems: "center", backgroundColor: "#111", borderRadius: 8 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Crear</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @oraculo/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/components/ProductPicker.tsx
git commit -m "feat(mobile): ProductPicker con match en cascada y crear canonical inline"
```

---

### Task E2: Integrar `ProductPicker` en `receipt/new.tsx`

**Files:**
- Modify: `apps/mobile/app/(app)/receipt/new.tsx`

- [ ] **Step 1: Reemplazar contenido** — `apps/mobile/app/(app)/receipt/new.tsx`

```typescript
import { sumAmounts } from "@oraculo/core";
import { manualReceiptSchema } from "@oraculo/validations";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { ProductPicker, type ProductPickerValue } from "../../../components/ProductPicker";
import { getActiveHousehold } from "../../../services/household";
import { createManualReceipt } from "../../../services/receipts";

interface ItemDraft {
  rawName: string;
  quantity: string;
  totalPrice: string;
  categoryId: string | null;
  canonical: ProductPickerValue | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyItem: ItemDraft = { rawName: "", quantity: "1", totalPrice: "", categoryId: null, canonical: null };

export default function NewReceipt() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [purchasedAt] = useState(todayIso());
  const [items, setItems] = useState<ItemDraft[]>([{ ...emptyItem }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getActiveHousehold().then((h) => setHouseholdId(h?.id ?? null)).catch(() => setHouseholdId(null));
  }, []);

  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        // Si el rawName cambia, invalidar canonical (el alias no aplica al nuevo texto).
        if (patch.rawName !== undefined && patch.rawName !== it.rawName) {
          return { ...it, ...patch, canonical: null };
        }
        return { ...it, ...patch };
      }),
    );
  }
  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }
  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const total = sumAmounts(items.map((i) => (i.totalPrice.trim() === "" ? "0" : i.totalPrice)));

  async function onSave() {
    setError(null);
    if (!householdId) {
      setError("No hay hogar activo");
      return;
    }
    const payload = {
      storeId: null,
      purchasedAt,
      currency: "COP",
      items: items.map((i) => ({
        rawName: i.rawName,
        quantity: i.quantity,
        unitPrice: i.totalPrice,
        totalPrice: i.totalPrice,
        categoryId: i.categoryId,
        canonicalProductId: i.canonical?.canonicalId ?? null,
        aliasNormalized: i.canonical?.aliasNormalized ?? null,
      })),
    };
    const parsed = manualReceiptSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      // Instrumentación: emitir match_resolved 'manual' por items que se guardan sin canonical (spec §6).
      for (const it of items) {
        if (!it.canonical) console.info("[match_resolved]", { layer: "manual" });
      }
      await createManualReceipt(householdId, parsed.data);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar la factura");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Nueva factura</Text>
      <Text style={{ color: "#666" }}>Fecha: {purchasedAt}</Text>

      {items.map((item, index) => (
        <View key={index} style={{ borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "500" }}>Ítem {index + 1}</Text>
            {items.length > 1 ? (
              <Pressable onPress={() => removeItem(index)}>
                <Text style={{ color: "#b00" }}>Quitar</Text>
              </Pressable>
            ) : null}
          </View>
          <TextInput
            placeholder="Nombre"
            value={item.rawName}
            onChangeText={(t) => updateItem(index, { rawName: t })}
            style={inputStyle}
          />
          {householdId ? (
            <ProductPicker
              householdId={householdId}
              rawName={item.rawName}
              defaultCategoryId={item.categoryId}
              value={item.canonical}
              onChange={(c) => updateItem(index, { canonical: c })}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Cantidad"
              keyboardType="numeric"
              value={item.quantity}
              onChangeText={(t) => updateItem(index, { quantity: t })}
              style={{ flex: 1, ...inputStyle }}
            />
            <TextInput
              placeholder="Total (COP)"
              keyboardType="numeric"
              value={item.totalPrice}
              onChangeText={(t) => updateItem(index, { totalPrice: t })}
              style={{ flex: 1, ...inputStyle }}
            />
          </View>
          {householdId ? (
            <CategoryPicker householdId={householdId} value={item.categoryId} onChange={(c) => updateItem(index, { categoryId: c })} />
          ) : null}
        </View>
      ))}

      <Pressable onPress={addItem} style={{ borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, alignItems: "center" }}>
        <Text>+ Agregar ítem</Text>
      </Pressable>

      <Text style={{ fontSize: 16, fontWeight: "600" }}>Total: {total}</Text>
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
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

const inputStyle = { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 } as const;
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter @oraculo/mobile typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/\(app\)/receipt/new.tsx
git commit -m "feat(mobile): receipt/new integra ProductPicker por item"
```

---

## Task Group F — Verificación final

### Task F1: Suite completa

- [ ] **Step 1: Restaurar `expo-env.d.ts` si Expo lo borró**

Run: `git status`
Si aparece `deleted: apps/mobile/expo-env.d.ts` → `git checkout -- apps/mobile/expo-env.d.ts`.

- [ ] **Step 2: Suite completa**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm --filter @oraculo/core test
pnpm --filter @oraculo/validations test
pnpm --filter @oraculo/db test
```
Expected: todo verde. Conteos esperados aproximados:
- core: 21 anteriores + abbreviations(3) + normalize-name(7) + price-per-standard-unit(7) ≈ 38 tests.
- validations: 16 anteriores + canonical(5) + 3 nuevos en receipt ≈ 24 tests.
- db: 15 anteriores + hito2(7) = 22 tests.

- [ ] **Step 3: Bundle web compila**

Run:
```bash
cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec expo export --platform web
```
Expected: build exitoso. Limpiar después:
```bash
rm -rf apps/mobile/dist apps/mobile/.expo
```

- [ ] **Step 4: Push de la rama**

Run:
```bash
git push -u origin hito-2-diccionario-de-productos
```

- [ ] **Step 5: Abrir PR por la web**

Run: `powershell -Command "Start-Process 'https://github.com/JohanDGA/OracleShop/compare/master...hito-2-diccionario-de-productos?expand=1'"`

Título: `Hito 2: Diccionario de productos (Capa 1 + Capa 2)`

Body sugerido:

```markdown
## Resumen
Diccionario de productos sin IA: la captura manual de facturas enlaza cada ítem a un `canonical_product` del hogar, aprendiendo de cada confirmación.

- `@oraculo/core/dictionary` — `normalizeName` (con expansión de abreviaturas por token) + `pricePerStandardUnit` en BigInt escala 4 (TDD).
- Migraciones DB: `0009` agrega `pg_trgm` + `alias_normalized` con índices GIN y unique compuesto; `0010` define la RPC `match_product` con cascada Capa 1 (exact) → Capa 2 (`pg_trgm`, threshold default 0.6); `0011` extiende `create_receipt_with_items` para persistir alias atómicamente.
- `services/match.ts` + `services/canonicals.ts` + `ProductPicker` con 3 estados (verde exact / amarillo fuzzy / crear) + modal de creación inline.
- Instrumentación `match_resolved` (console.info) emitida por capa — Hito 7 la conectará a Sentry/dashboard.

## Anti-doble-conteo (no cambia)
El total mensual del dashboard sigue agregando vía `receipt_items.total_price` + `manual_expenses.amount`, nunca `receipts.total`.

## Tests
- `@oraculo/core`: ~38 (incluye 17 nuevos: abbreviations, normalize-name, price-per-standard-unit).
- `@oraculo/validations`: ~24 (incluye 5 nuevos en canonical y 3 en receipt).
- `@oraculo/db`: 22 (incluye 7 nuevos en `hito2.test.ts`: RPC + RLS + ON CONFLICT).
- Typecheck (4 paquetes) y lint verdes; bundle web compila.

## E2E manual
Validar en `localhost:8081`: primera factura con un raw_name nuevo → crear canonical inline; segunda factura con el mismo o similar raw_name → resuelve en verde (Capa 1) o amarillo (Capa 2) sin tocar el modal.
```

- [ ] **Step 6: Esperar CI verde, merge, cleanup**

Una vez mergeado:
```bash
git checkout master
git pull
git branch -d hito-2-diccionario-de-productos
git push origin --delete hito-2-diccionario-de-productos
```

---

## Notas operativas

- **Expo borra `expo-env.d.ts` y reescribe `tsconfig.json`** intermitentemente. Cada vez que se corra Expo (E2E) hay que `git checkout -- apps/mobile/expo-env.d.ts` antes de commitear el siguiente paso.
- Las migraciones se aplican manualmente vía `docker exec ... psql` durante el desarrollo. El CI las correrá vía `supabase db reset` o equivalente, y eso es lo que valida el job `db` en GitHub Actions.
- **No** hay reseed de aliases para receipts existentes — la migración no toca filas previas porque hoy `product_aliases` está vacío.
- Si el threshold 0.6 resulta laxo en E2E real, ajustar el `default` del RPC en una sub-migración (`0012`).
