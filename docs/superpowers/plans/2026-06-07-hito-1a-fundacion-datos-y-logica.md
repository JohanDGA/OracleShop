# Hito 1a — Fundación de datos y lógica (categorías, agregación, RPC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la capa de datos y lógica del módulo de captura de gastos: `packages/core` (aritmética monetaria exacta + agregación mensual, TDD), schemas Zod nuevos en `packages/validations`, y en `packages/db` la semilla de categorías de sistema + una RPC atómica `create_receipt_with_items`. Sin UI (eso es el Plan 1b).

**Architecture:** Lógica pura en `packages/core` (sin React/Supabase) testeada con Vitest/TDD. Validación compartida en `packages/validations`. La base de datos gana 2 migraciones (semilla idempotente + función RPC `SECURITY INVOKER` que respeta RLS). Todo verificable con `pnpm test` + Supabase local; corre en el CI existente.

**Tech Stack:** TypeScript strict, BigInt punto-fijo (escala 4), Zod, Vitest, Postgres (Supabase local), pnpm workspaces.

**Prerequisitos:** Hitos 0a/0b/0c en `master`. Supabase local corriendo (`pnpm db:start`). Trabajar en una rama nueva.

**Out of scope (Plan 1b):** navegación por tabs, pantallas (gasto rápido, factura, lista, dashboard), servicios mobile, E2E. **Diferido (hitos posteriores):** edición, SQLite/offline, FX, gráficas, gestión completa de categorías.

---

## File Structure

```
packages/core/                              # NUEVO paquete
├── package.json                            # @oraculo/core
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                            # barrel
│   ├── money.ts                            # BigInt punto-fijo escala 4
│   └── monthly-summary.ts                  # computeMonthlySummary
└── tests/
    ├── money.test.ts
    └── monthly-summary.test.ts

packages/validations/
├── src/
│   ├── index.ts                            # MOD: re-export nuevos
│   ├── expense.ts                          # NUEVO: manualExpenseSchema
│   ├── category.ts                         # NUEVO: categoryCreateSchema
│   └── receipt.ts                          # NUEVO: receiptItemSchema, manualReceiptSchema
└── tests/
    ├── expense.test.ts                     # NUEVO
    ├── category.test.ts                    # NUEVO
    └── receipt.test.ts                     # NUEVO

packages/db/supabase/migrations/
├── 0006_seed_system_categories.sql         # NUEVO
└── 0007_create_receipt_with_items.sql      # NUEVO
packages/db/tests/
└── hito1.test.ts                           # NUEVO: semilla + RPC (atómica + RLS)
```

---

## Task Group A — `packages/core` (lógica pura, TDD)

### Task A1: Inicializar el paquete core

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`

- [ ] **Step 1: Crear `packages/core/package.json`**

```json
{
  "name": "@oraculo/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Crear `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tooling/typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "target": "ES2022",
    "lib": ["ES2022"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```
(Nota: `target`/`lib` ES2022 garantizan soporte de `BigInt`.)

- [ ] **Step 3: Crear `packages/core/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Instalar**

Run (desde la raíz): `pnpm install`. Expected: instala vitest/typescript en el paquete, sin error.

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(core): init pure-logic core package"
```

### Task A2: `money.ts` (BigInt punto-fijo) con TDD

**Files:**
- Create: `packages/core/tests/money.test.ts`
- Create: `packages/core/src/money.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/core/tests/money.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { toMinorUnits, fromMinorUnits, sumAmounts, formatCOP } from "../src/money";

describe("toMinorUnits / fromMinorUnits", () => {
  it("convierte enteros", () => {
    expect(toMinorUnits("1234")).toBe(12340000n);
    expect(fromMinorUnits(12340000n)).toBe("1234.0000");
  });
  it("convierte con decimales (rellena a escala 4)", () => {
    expect(toMinorUnits("1234.56")).toBe(12345600n);
    expect(toMinorUnits("0.1")).toBe(1000n);
  });
  it("trunca fracciones de más de 4 decimales", () => {
    expect(toMinorUnits("1.23456")).toBe(12345n);
  });
  it("maneja negativos", () => {
    expect(toMinorUnits("-5.00")).toBe(-50000n);
    expect(fromMinorUnits(-50000n)).toBe("-5.0000");
  });
  it("round-trip", () => {
    expect(fromMinorUnits(toMinorUnits("999.9999"))).toBe("999.9999");
  });
});

describe("sumAmounts", () => {
  it("suma exacta sin error de float", () => {
    expect(sumAmounts(["0.1", "0.2"])).toBe("0.3000");
  });
  it("lista vacía es 0", () => {
    expect(sumAmounts([])).toBe("0.0000");
  });
  it("suma varios", () => {
    expect(sumAmounts(["1000.00", "250.50", "0.50"])).toBe("1251.0000");
  });
});

describe("formatCOP", () => {
  it("formatea como peso colombiano sin decimales", () => {
    const out = formatCOP("1234567.00");
    expect(out).toContain("1.234.567"); // separador de miles es-CO
  });
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `pnpm --filter @oraculo/core test`. Expected: FALLA ("Cannot find module '../src/money'").

- [ ] **Step 3: Implementar `packages/core/src/money.ts`**

```typescript
const SCALE = 4n;
const SCALE_FACTOR = 10n ** SCALE; // 10000n

/** String decimal (p.ej. "1234.56") → unidades menores escala 4, sin floats. */
export function toMinorUnits(amount: string): bigint {
  const trimmed = amount.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ""] = unsigned.split(".");
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

/** Suma exacta de montos string. */
export function sumAmounts(amounts: string[]): string {
  let total = 0n;
  for (const a of amounts) total += toMinorUnits(a);
  return fromMinorUnits(total);
}

/** Formato display COP (es-CO, sin decimales). Number() solo para display. */
export function formatCOP(amount: string): string {
  const pesos = Number(fromMinorUnits(toMinorUnits(amount)));
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(pesos);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm --filter @oraculo/core test`. Expected: todos los tests de `money` PASAN.
(Si el assert de `formatCOP` falla por un caracter no-break-space en el símbolo, ajusta el test para verificar solo el grupo de miles `"1.234.567"` con `toContain`, como está escrito.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/money.ts packages/core/tests/money.test.ts
git commit -m "feat(core): exact fixed-point money helpers (BigInt scale 4)"
```

### Task A3: `monthly-summary.ts` con TDD

**Files:**
- Create: `packages/core/tests/monthly-summary.test.ts`
- Create: `packages/core/src/monthly-summary.ts`
- Create: `packages/core/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/core/tests/monthly-summary.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { computeMonthlySummary, type SpendingLine } from "../src/monthly-summary";

describe("computeMonthlySummary", () => {
  it("lista vacía: total 0 y sin categorías, sin dividir por cero", () => {
    const r = computeMonthlySummary([]);
    expect(r.total).toBe("0.0000");
    expect(r.byCategory).toEqual([]);
  });

  it("una categoría", () => {
    const lines: SpendingLine[] = [{ categoryId: "a", amount: "100.00" }];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("100.0000");
    expect(r.byCategory).toEqual([{ categoryId: "a", total: "100.0000", percent: 100 }]);
  });

  it("varias categorías ordenadas por monto desc", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "30.00" },
      { categoryId: "b", amount: "70.00" },
    ];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("100.0000");
    expect(r.byCategory[0]).toEqual({ categoryId: "b", total: "70.0000", percent: 70 });
    expect(r.byCategory[1]).toEqual({ categoryId: "a", total: "30.0000", percent: 30 });
  });

  it("agrupa líneas de la misma categoría y las sin categoría (null)", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "10.00" },
      { categoryId: "a", amount: "5.00" },
      { categoryId: null, amount: "5.00" },
    ];
    const r = computeMonthlySummary(lines);
    expect(r.total).toBe("20.0000");
    const a = r.byCategory.find((c) => c.categoryId === "a");
    const none = r.byCategory.find((c) => c.categoryId === null);
    expect(a?.total).toBe("15.0000");
    expect(none?.total).toBe("5.0000");
  });

  it("porcentajes redondeados suman aproximadamente 100", () => {
    const lines: SpendingLine[] = [
      { categoryId: "a", amount: "33.33" },
      { categoryId: "b", amount: "33.33" },
      { categoryId: "c", amount: "33.34" },
    ];
    const r = computeMonthlySummary(lines);
    const sum = r.byCategory.reduce((s, c) => s + c.percent, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run: `pnpm --filter @oraculo/core test`. Expected: FALLA (módulo `monthly-summary` no existe).

- [ ] **Step 3: Implementar `packages/core/src/monthly-summary.ts`**

```typescript
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

const UNCATEGORIZED_KEY = " uncategorized";

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
  const totalNum = Number(total); // solo para porcentaje/orden (display)

  const byCategory: CategorySummary[] = [...groups.values()]
    .map((g) => {
      const catTotal = sumAmounts(g.amounts);
      const percent = totalNum === 0 ? 0 : Math.round((Number(catTotal) / totalNum) * 100);
      return { categoryId: g.categoryId, total: catTotal, percent };
    })
    .sort((a, b) => Number(b.total) - Number(a.total));

  return { total, byCategory };
}
```

- [ ] **Step 4: Crear el barrel `packages/core/src/index.ts`**

```typescript
export * from "./money";
export * from "./monthly-summary";
```

- [ ] **Step 5: Correr tests + typecheck**

Run: `pnpm --filter @oraculo/core test` → todos PASAN.
Run: `pnpm --filter @oraculo/core typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/monthly-summary.ts packages/core/src/index.ts packages/core/tests/monthly-summary.test.ts
git commit -m "feat(core): monthly spending summary aggregation with tests"
```

---

## Task Group B — `packages/validations` (schemas nuevos, TDD)

### Task B1: Schemas de gasto, categoría y factura

**Files:**
- Create: `packages/validations/tests/expense.test.ts`
- Create: `packages/validations/src/expense.ts`
- Create: `packages/validations/src/category.ts`
- Create: `packages/validations/src/receipt.ts`
- Modify: `packages/validations/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/validations/tests/expense.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { manualExpenseSchema } from "../src/expense";
import { categoryCreateSchema } from "../src/category";
import { manualReceiptSchema, receiptItemSchema } from "../src/receipt";

describe("manualExpenseSchema", () => {
  it("acepta un gasto válido", () => {
    const r = manualExpenseSchema.safeParse({
      amount: "12500.00",
      categoryId: "11111111-1111-1111-1111-111111111111",
      description: "Almuerzo",
      occurredAt: "2026-06-07",
    });
    expect(r.success).toBe(true);
  });
  it("acepta categoryId null y descripción vacía/omitida", () => {
    const r = manualExpenseSchema.safeParse({ amount: "1000", categoryId: null, occurredAt: "2026-06-07" });
    expect(r.success).toBe(true);
  });
  it("rechaza monto <= 0 o no numérico", () => {
    expect(manualExpenseSchema.safeParse({ amount: "0", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
    expect(manualExpenseSchema.safeParse({ amount: "-5", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
    expect(manualExpenseSchema.safeParse({ amount: "abc", categoryId: null, occurredAt: "2026-06-07" }).success).toBe(false);
  });
  it("rechaza fecha inválida", () => {
    expect(manualExpenseSchema.safeParse({ amount: "10", categoryId: null, occurredAt: "07/06/2026" }).success).toBe(false);
  });
});

describe("categoryCreateSchema", () => {
  it("acepta nombre y color hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "Mascotas", color: "#22c55e" }).success).toBe(true);
  });
  it("rechaza nombre vacío y color no-hex", () => {
    expect(categoryCreateSchema.safeParse({ name: "", color: "#22c55e" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "X", color: "verde" }).success).toBe(false);
  });
});

describe("receiptItemSchema / manualReceiptSchema", () => {
  const item = { rawName: "Leche", quantity: "1", unitPrice: "5000", totalPrice: "5000", categoryId: null };
  it("acepta un ítem válido", () => {
    expect(receiptItemSchema.safeParse(item).success).toBe(true);
  });
  it("acepta una factura con al menos un ítem", () => {
    const r = manualReceiptSchema.safeParse({
      storeId: null,
      purchasedAt: "2026-06-07",
      currency: "COP",
      items: [item],
    });
    expect(r.success).toBe(true);
  });
  it("rechaza factura sin ítems", () => {
    expect(manualReceiptSchema.safeParse({ storeId: null, purchasedAt: "2026-06-07", currency: "COP", items: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `pnpm --filter @oraculo/validations test`. Expected: FALLA (módulos nuevos no existen).

- [ ] **Step 3: Implementar `packages/validations/src/expense.ts`**

```typescript
import { z } from "zod";

/** Monto monetario positivo como string NUMERIC(15,4): dígitos con hasta 4 decimales. */
export const positiveAmount = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Monto inválido")
  .refine((s) => Number(s) > 0, "El monto debe ser mayor que 0");

/** Fecha en formato ISO YYYY-MM-DD. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Fecha inválida");

export const manualExpenseSchema = z.object({
  amount: positiveAmount,
  categoryId: z.string().uuid().nullable(),
  description: z.string().max(200).optional(),
  occurredAt: isoDate,
});

export type ManualExpenseInput = z.infer<typeof manualExpenseSchema>;
```

- [ ] **Step 4: Implementar `packages/validations/src/category.ts`**

```typescript
import { z } from "zod";

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#RRGGBB)");

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(50),
  color: hexColor,
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
```

- [ ] **Step 5: Implementar `packages/validations/src/receipt.ts`**

```typescript
import { z } from "zod";
import { positiveAmount, isoDate } from "./expense";

/** Cantidad: string numérico > 0 (hasta 4 decimales para peso variable). */
const positiveQuantity = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Cantidad inválida")
  .refine((s) => Number(s) > 0, "La cantidad debe ser mayor que 0");

/** Precio no negativo (puede ser 0 en líneas promocionales). */
const nonNegativeAmount = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, "Precio inválido");

export const receiptItemSchema = z.object({
  rawName: z.string().trim().min(1, "El nombre del ítem es obligatorio").max(200),
  quantity: positiveQuantity,
  unitPrice: nonNegativeAmount,
  totalPrice: positiveAmount,
  categoryId: z.string().uuid().nullable(),
});

export const manualReceiptSchema = z.object({
  storeId: z.string().uuid().nullable(),
  purchasedAt: isoDate,
  currency: z.string().length(3),
  items: z.array(receiptItemSchema).min(1, "La factura necesita al menos un ítem"),
});

export type ReceiptItemInput = z.infer<typeof receiptItemSchema>;
export type ManualReceiptInput = z.infer<typeof manualReceiptSchema>;
```

- [ ] **Step 6: Actualizar el barrel `packages/validations/src/index.ts`**

Reemplaza el contenido por:
```typescript
export * from "./auth";
export * from "./expense";
export * from "./category";
export * from "./receipt";
```

- [ ] **Step 7: Correr tests + typecheck**

Run: `pnpm --filter @oraculo/validations test` → PASAN (los nuevos + los 7 de auth).
Run: `pnpm --filter @oraculo/validations typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/validations/src packages/validations/tests
git commit -m "feat(validations): manual expense, category and receipt schemas"
```

---

## Task Group C — Semilla de categorías de sistema

### Task C1: Migración de semilla

**Files:**
- Create: `packages/db/supabase/migrations/0006_seed_system_categories.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- Categorías de sistema (household_id = NULL). UUIDs fijos → idempotente.
-- La RLS del 0a (categories_select) ya las hace legibles para todos los autenticados.
insert into public.categories (id, household_id, name, color, icon) values
  ('00000000-0000-4000-8000-000000000001', null, 'Mercado',            '#16a34a', 'shopping-cart'),
  ('00000000-0000-4000-8000-000000000002', null, 'Transporte',         '#2563eb', 'car'),
  ('00000000-0000-4000-8000-000000000003', null, 'Comida fuera',       '#f97316', 'utensils'),
  ('00000000-0000-4000-8000-000000000004', null, 'Hogar y servicios',  '#0891b2', 'home'),
  ('00000000-0000-4000-8000-000000000005', null, 'Salud',              '#dc2626', 'heart-pulse'),
  ('00000000-0000-4000-8000-000000000006', null, 'Tecnología',         '#7c3aed', 'cpu'),
  ('00000000-0000-4000-8000-000000000007', null, 'Entretenimiento',    '#db2777', 'gamepad-2'),
  ('00000000-0000-4000-8000-000000000008', null, 'Educación',          '#ca8a04', 'book-open'),
  ('00000000-0000-4000-8000-000000000009', null, 'Otros',              '#6b7280', 'ellipsis')
on conflict (id) do nothing;
```

- [ ] **Step 2: Aplicar con reset y confirmar el conteo**

Run (desde `packages/db`):
```bash
cd packages/db
pnpm exec supabase db reset 2>&1 | grep -E "Applying|Finished"
```
Expected: aplica 0001–0006. Verifica el conteo con psql:
```bash
DBC=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)
docker exec "$DBC" psql -U postgres -d postgres -c "select count(*) from public.categories where household_id is null;"
```
Expected: `9`.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/arias/Downloads/oraculo de compras"
git add packages/db/supabase/migrations/0006_seed_system_categories.sql
git commit -m "feat(db): seed 9 system spending categories"
```

---

## Task Group D — RPC atómica `create_receipt_with_items`

### Task D1: Migración de la RPC

**Files:**
- Create: `packages/db/supabase/migrations/0007_create_receipt_with_items.sql`

- [ ] **Step 1: Crear la migración**

```sql
-- Crea una factura (receipt) y sus líneas (receipt_items) en UNA transacción.
-- SECURITY INVOKER → respeta RLS: el usuario debe ser miembro de p_household_id
-- (lo valida la policy receipts_insert). Si algo falla, rollback (sin huérfanos).
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
    (receipt_id, raw_name, quantity, unit, unit_price, total_price, category_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric,
      nullif(item->>'category_id', '')::uuid,
      (row_number() over ())::int
    from jsonb_array_elements(p_items) as item;

  return v_receipt_id;
end;
$$;
```

- [ ] **Step 2: Aplicar con reset**

Run (desde `packages/db`):
```bash
cd packages/db
pnpm exec supabase db reset 2>&1 | grep -E "Applying|Finished"
```
Expected: aplica 0001–0007 sin error.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/arias/Downloads/oraculo de compras"
git add packages/db/supabase/migrations/0007_create_receipt_with_items.sql
git commit -m "feat(db): atomic create_receipt_with_items RPC (security invoker)"
```

### Task D2: Tests de semilla + RPC (atómica + RLS)

**Files:**
- Create: `packages/db/tests/hito1.test.ts`

> Reusa el helper `tests/helpers/supabase-clients.ts` del 0a (getLocalKeys, makeServiceClient, makeUserClient).

- [ ] **Step 1: Escribir los tests**

Crear `packages/db/tests/hito1.test.ts`:
```typescript
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLocalKeys, makeServiceClient, makeUserClient } from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let userB: { userId: string; client: SupabaseClient };
let householdA: string;
let householdB: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `h1a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `h1b_${stamp}@test.local`, "password123");

  const { data: hA } = await service.from("households").insert({ name: "H A", created_by: userA.userId }).select("id").single();
  householdA = hA!.id;
  await service.from("household_members").insert({ household_id: householdA, user_id: userA.userId, role: "owner" });

  const { data: hB } = await service.from("households").insert({ name: "H B", created_by: userB.userId }).select("id").single();
  householdB = hB!.id;
  await service.from("household_members").insert({ household_id: householdB, user_id: userB.userId, role: "owner" });
});

afterAll(async () => {
  // borrar receipt_items -> receipts del hogar A, luego miembros/hogares/usuarios
  const { data: receipts } = await service.from("receipts").select("id").eq("household_id", householdA);
  for (const r of receipts ?? []) {
    await service.from("receipt_items").delete().eq("receipt_id", r.id);
  }
  await service.from("receipts").delete().eq("household_id", householdA);
  await service.from("household_members").delete().in("household_id", [householdA, householdB]);
  await service.from("households").delete().in("id", [householdA, householdB]);
  await service.auth.admin.deleteUser(userA.userId);
  await service.auth.admin.deleteUser(userB.userId);
});

describe("semilla de categorías de sistema", () => {
  it("hay 9 categorías de sistema (household_id null)", async () => {
    const { data, error } = await userA.client
      .from("categories")
      .select("id", { count: "exact" })
      .is("household_id", null);
    expect(error).toBeNull();
    expect(data?.length).toBe(9);
  });
});

describe("create_receipt_with_items RPC", () => {
  it("crea factura + ítems atómicamente para el hogar propio", async () => {
    const { data: receiptId, error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [
        { raw_name: "Leche", quantity: "1", unit: null, unit_price: "5000", total_price: "5000", category_id: null },
        { raw_name: "Pan", quantity: "2", unit: null, unit_price: "1500", total_price: "3000", category_id: null },
      ],
    });
    expect(error).toBeNull();
    expect(typeof receiptId).toBe("string");

    const { data: items } = await userA.client.from("receipt_items").select("id").eq("receipt_id", receiptId);
    expect(items?.length).toBe(2);
  });

  it("es atómica: un ítem con total_price inválido no deja receipt huérfano", async () => {
    const { count: before } = await userA.client
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdA);

    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdA,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [{ raw_name: "X", quantity: "1", unit: null, unit_price: "1", total_price: "no-numero", category_id: null }],
    });
    expect(error).not.toBeNull(); // el cast a numeric falla → rollback

    const { count: after } = await userA.client
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdA);
    expect(after).toBe(before); // sin receipt huérfano
  });

  it("RLS: A no puede crear factura en el hogar de B", async () => {
    const { error } = await userA.client.rpc("create_receipt_with_items", {
      p_household_id: householdB,
      p_store_id: null,
      p_purchased_at: "2026-06-07",
      p_currency: "COP",
      p_items: [{ raw_name: "X", quantity: "1", unit: null, unit_price: "1", total_price: "1", category_id: null }],
    });
    expect(error).not.toBeNull(); // receipts_insert with check is_household_member(B) → falla
  });
});
```

- [ ] **Step 2: Asegurar Supabase local + correr**

Run (desde la raíz, con el stack corriendo):
```bash
pnpm --filter @oraculo/db test
```
Expected: pasan los **8 tests RLS del 0a** + los **4 nuevos** de `hito1.test.ts` (1 semilla + 3 RPC: crear, atómica, RLS adversarial). Total **12**.
Si "A no puede crear factura en B" NO da error → revisa que la RPC sea `security invoker` (no definer).

- [ ] **Step 3: Commit**

```bash
git add packages/db/tests/hito1.test.ts
git commit -m "test(db): verify category seed + atomic RLS-safe receipt RPC"
```

---

## Task Group E — Verificación final y cierre

### Task E1: Verificación integral

**Files:** ninguno

- [ ] **Step 1: Typecheck + lint + todos los tests**

Run (desde la raíz, Supabase local arriba):
```bash
pnpm typecheck
pnpm lint
pnpm --filter @oraculo/core test
pnpm --filter @oraculo/validations test
pnpm --filter @oraculo/db test
```
Expected: typecheck pasa en los 4 packages (db, validations, mobile, core); lint limpio; core verde; validations verde; db **12** verde.

- [ ] **Step 2: Reset limpio + db test (DB fresca)**

Run (desde `packages/db`):
```bash
cd packages/db && pnpm exec supabase db reset 2>&1 | grep -E "Applying|Finished"
cd "C:/Users/arias/Downloads/oraculo de compras" && pnpm --filter @oraculo/db test 2>&1 | grep "Tests "
```
Expected: aplica 0001–0007; tests db verdes sobre DB fresca.

- [ ] **Step 3: git limpio**

Run: `git status --short`. Expected: vacío.

### Task E2: Cierre de rama

- [ ] **Step 1:** Usa `superpowers:finishing-a-development-branch` para fusionar a `master` (o PR), re-verificando tests, y pushear. El CI (job `quality` corre core+validations; job `db` corre los 13 tests) debe quedar verde.

---

## Definition of Done (Hito 1a)

- [ ] `packages/core` con `money` (BigInt escala 4) + `computeMonthlySummary`, tests TDD verdes.
- [ ] `packages/validations` con schemas de gasto/categoría/factura, tests verdes (+ los 7 de auth).
- [ ] Migración de semilla: 9 categorías de sistema (idempotente).
- [ ] RPC `create_receipt_with_items` atómica y RLS-segura; tests db (8 RLS del 0a + 4 nuevos = 12) verdes.
- [ ] `pnpm typecheck` (4 packages) + `pnpm lint` limpios; CI verde.
- [ ] Working tree limpio.

**Siguiente:** Plan 1b — UI mobile (tabs, pantallas de captura, lista, dashboard, servicios) + E2E.
