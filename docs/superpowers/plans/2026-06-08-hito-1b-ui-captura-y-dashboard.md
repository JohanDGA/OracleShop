# Hito 1b — UI mobile de captura y dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar la UI mobile del módulo de captura: navegación por tabs (Gastos / Dashboard / Perfil), pantallas de gasto rápido y factura manual (vía la RPC del 1a), lista mensual de gastos con soft-delete, y dashboard mensual por categoría con barras — usando `@oraculo/core` (agregación) y `@oraculo/validations` (schemas) ya construidos.

**Architecture:** Expo Router con un Stack en `(app)` que contiene un grupo `(tabs)` + pantallas push de captura. Servicios delgados en `apps/mobile/services/` que hablan directo con Supabase (online) y mapean camelCase↔snake_case. La lógica pura (rango de mes, agregación) vive en `@oraculo/core` y se testea con Vitest; las pantallas se verifican con `expo export` (bundle) + E2E manual en Expo Web.

**Tech Stack:** Expo SDK 51, Expo Router v3 (Tabs + Stack), @expo/vector-icons (Ionicons, ya incluido con Expo), @oraculo/core, @oraculo/validations, @supabase/supabase-js.

**Prerequisitos:** Hito 1a en `master` (core, validations, semilla, RPC). Supabase local corriendo con `packages/db/.env` (para login). Rama nueva.

**Out of scope (hitos posteriores):** edición de gastos, SQLite/offline, FX, gráficas con librería, gestión completa de categorías, escaneo/IA.

---

## File Structure

```
packages/core/src/
├── month-range.ts                          # NUEVO: monthRange, shiftMonth (puras)
├── index.ts                                # MOD: export month-range
packages/core/tests/
└── month-range.test.ts                     # NUEVO (TDD)

apps/mobile/
├── lib/
│   └── dates.ts                            # NUEVO: currentYearMonth() (runtime)
├── services/
│   ├── categories.ts                       # NUEVO: list/create
│   ├── stores.ts                           # NUEVO: list/create
│   ├── expenses.ts                         # NUEVO: addManualExpense, listMonthEntries, softDelete*
│   ├── receipts.ts                         # NUEVO: createManualReceipt (RPC)
│   └── summary.ts                          # NUEVO: getMonthlySpending → SpendingLine[]
├── components/
│   └── CategoryPicker.tsx                  # NUEVO: selector + crear inline
└── app/(app)/
    ├── _layout.tsx                         # MOD: Stack (tabs + push de captura)
    ├── (tabs)/
    │   ├── _layout.tsx                     # NUEVO: Tabs (Gastos/Dashboard/Perfil)
    │   ├── index.tsx                       # NUEVO: Gastos (lista del mes + FAB)
    │   ├── dashboard.tsx                   # NUEVO: dashboard con barras
    │   └── profile.tsx                     # NUEVO: email + hogar + cerrar sesión
    ├── expense/new.tsx                     # NUEVO: gasto rápido
    ├── receipt/new.tsx                     # NUEVO: factura manual
    └── index.tsx                           # ELIMINAR (lo reemplazan los tabs)
```

---

## Task Group A — `@oraculo/core`: rango de mes (TDD)

### Task A1: `month-range.ts` con TDD

**Files:**
- Create: `packages/core/tests/month-range.test.ts`
- Create: `packages/core/src/month-range.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Escribir el test que falla** — `packages/core/tests/month-range.test.ts`
```typescript
import { describe, expect, it } from "vitest";
import { monthRange, shiftMonth } from "../src/month-range";

describe("monthRange", () => {
  it("devuelve inicio y fin exclusivo del mes", () => {
    expect(monthRange(2026, 6)).toEqual({ start: "2026-06-01", endExclusive: "2026-07-01" });
  });
  it("maneja el rollover de diciembre", () => {
    expect(monthRange(2026, 12)).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
  it("rellena meses de un dígito", () => {
    expect(monthRange(2026, 3)).toEqual({ start: "2026-03-01", endExclusive: "2026-04-01" });
  });
});

describe("shiftMonth", () => {
  it("avanza al siguiente mes", () => {
    expect(shiftMonth(2026, 6, 1)).toEqual({ year: 2026, month: 7 });
  });
  it("retrocede cruzando el año", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("avanza cruzando el año", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  });
});
```

- [ ] **Step 2: Correr para ver que falla** — `pnpm --filter @oraculo/core test` → FALLA (módulo ausente).

- [ ] **Step 3: Implementar** `packages/core/src/month-range.ts`
```typescript
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
  const zeroBased = (month - 1) + delta;
  const newYear = year + Math.floor(zeroBased / 12);
  const newMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return { year: newYear, month: newMonth };
}
```

- [ ] **Step 4: Exportar en el barrel** — añade a `packages/core/src/index.ts`:
```typescript
export * from "./month-range";
```
(Mantén las líneas existentes `export * from "./money";` y `export * from "./monthly-summary";`.)

- [ ] **Step 5: Tests + typecheck** — `pnpm --filter @oraculo/core test` (todos PASAN, incl. money/summary previos) y `pnpm --filter @oraculo/core typecheck` (PASS).

- [ ] **Step 6: Commit**
```bash
git add packages/core/src/month-range.ts packages/core/src/index.ts packages/core/tests/month-range.test.ts
git commit -m "feat(core): monthRange and shiftMonth date helpers (TDD)"
```

---

## Task Group B — Servicios mobile

### Task B1: `dates.ts` + servicios de categorías y tiendas

**Files:**
- Create: `apps/mobile/lib/dates.ts`
- Create: `apps/mobile/services/categories.ts`
- Create: `apps/mobile/services/stores.ts`

- [ ] **Step 1: Crear `apps/mobile/lib/dates.ts`**
```typescript
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
```

- [ ] **Step 2: Crear `apps/mobile/services/categories.ts`**
```typescript
import { supabase } from "../lib/supabase";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  householdId: string | null;
}

/** Categorías visibles: del sistema (household_id null) + del hogar. */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, color, icon, household_id")
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    color: c.color as string,
    icon: c.icon as string | null,
    householdId: c.household_id as string | null,
  }));
}

/** Crea una categoría personalizada del hogar y la devuelve. */
export async function createCategory(
  householdId: string,
  name: string,
  color: string,
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ household_id: householdId, name, color })
    .select("id, name, color, icon, household_id")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "No se pudo crear la categoría");
  }
  return {
    id: data.id as string,
    name: data.name as string,
    color: data.color as string,
    icon: data.icon as string | null,
    householdId: data.household_id as string | null,
  };
}
```

- [ ] **Step 3: Crear `apps/mobile/services/stores.ts`**
```typescript
import { supabase } from "../lib/supabase";

export interface Store {
  id: string;
  name: string;
}

export async function listStores(householdId: string): Promise<Store[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string }));
}

export async function createStore(householdId: string, name: string): Promise<Store> {
  const { data, error } = await supabase
    .from("stores")
    .insert({ household_id: householdId, name })
    .select("id, name")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la tienda");
  return { id: data.id as string, name: data.name as string };
}
```

- [ ] **Step 4: Typecheck + lint** — `pnpm --filter @oraculo/mobile typecheck` (PASS) y `pnpm lint` (limpio).

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/lib/dates.ts apps/mobile/services/categories.ts apps/mobile/services/stores.ts
git commit -m "feat(mobile): date helpers + category/store services"
```

### Task B2: servicios de gastos, facturas y resumen

**Files:**
- Modify: `apps/mobile/package.json` (añadir dep `@oraculo/core`)
- Create: `apps/mobile/services/expenses.ts`
- Create: `apps/mobile/services/receipts.ts`
- Create: `apps/mobile/services/summary.ts`

- [ ] **Step 0: Añadir `@oraculo/core` como dependencia del mobile**

En `apps/mobile/package.json`, dentro de `dependencies`, añade la línea `"@oraculo/core": "workspace:*",` (junto a `@oraculo/validations`, que ya está). Luego corre `pnpm install` desde la raíz. Expected: enlaza el workspace package sin error. (Esto permite que los servicios importen `@oraculo/core`.)

- [ ] **Step 1: Crear `apps/mobile/services/expenses.ts`**
```typescript
import type { MonthRange } from "@oraculo/core";
import { supabase } from "../lib/supabase";

export type EntryKind = "manual" | "receipt";

/** Fila unificada para la lista de gastos del mes. */
export interface ExpenseEntry {
  kind: EntryKind;
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // descripción o nombre de tienda
  amount: string; // NUMERIC string
  categoryId: string | null; // null para facturas multi-categoría
}

/** Inserta un gasto manual. created_by = usuario actual. */
export async function addManualExpense(input: {
  householdId: string;
  amount: string;
  categoryId: string | null;
  description?: string;
  occurredAt: string;
}): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sesión no disponible");
  const { error } = await supabase.from("manual_expenses").insert({
    household_id: input.householdId,
    created_by: userId,
    category_id: input.categoryId,
    description: input.description ?? null,
    amount: input.amount,
    currency: "COP",
    occurred_at: input.occurredAt,
  });
  if (error) throw new Error(error.message);
}

/** Lista combinada (gastos manuales + facturas) del mes, orden por fecha desc. */
export async function listMonthEntries(
  householdId: string,
  range: MonthRange,
): Promise<ExpenseEntry[]> {
  const { data: manual, error: mErr } = await supabase
    .from("manual_expenses")
    .select("id, occurred_at, description, amount, category_id")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("occurred_at", range.start)
    .lt("occurred_at", range.endExclusive);
  if (mErr) throw new Error(mErr.message);

  const { data: receipts, error: rErr } = await supabase
    .from("receipts")
    .select("id, purchased_at, total, stores(name)")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("purchased_at", range.start)
    .lt("purchased_at", range.endExclusive);
  if (rErr) throw new Error(rErr.message);

  const entries: ExpenseEntry[] = [];
  for (const m of manual ?? []) {
    entries.push({
      kind: "manual",
      id: m.id as string,
      date: m.occurred_at as string,
      title: (m.description as string | null) ?? "Gasto",
      amount: m.amount as string,
      categoryId: m.category_id as string | null,
    });
  }
  for (const r of receipts ?? []) {
    const store = (r.stores as { name: string } | null) ?? null;
    entries.push({
      kind: "receipt",
      id: r.id as string,
      date: r.purchased_at as string,
      title: store ? store.name : "Factura",
      amount: (r.total as string) ?? "0",
      categoryId: null,
    });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

export async function softDeleteManualExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from("manual_expenses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function softDeleteReceipt(id: string): Promise<void> {
  const { error } = await supabase
    .from("receipts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Crear `apps/mobile/services/receipts.ts`**
```typescript
import type { ManualReceiptInput } from "@oraculo/validations";
import { supabase } from "../lib/supabase";

/** Crea una factura manual vía la RPC atómica. Devuelve el id del receipt. */
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

- [ ] **Step 3: Crear `apps/mobile/services/summary.ts`**
```typescript
import type { MonthRange, SpendingLine } from "@oraculo/core";
import { supabase } from "../lib/supabase";

/** Aplana gastos manuales + ítems de factura del mes en líneas para core. */
export async function getMonthlySpending(
  householdId: string,
  range: MonthRange,
): Promise<SpendingLine[]> {
  const { data: manual, error: mErr } = await supabase
    .from("manual_expenses")
    .select("amount, category_id")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("occurred_at", range.start)
    .lt("occurred_at", range.endExclusive);
  if (mErr) throw new Error(mErr.message);

  const { data: receipts, error: rErr } = await supabase
    .from("receipts")
    .select("id, receipt_items(total_price, category_id, deleted_at)")
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .gte("purchased_at", range.start)
    .lt("purchased_at", range.endExclusive);
  if (rErr) throw new Error(rErr.message);

  const lines: SpendingLine[] = [];
  for (const m of manual ?? []) {
    lines.push({ categoryId: m.category_id as string | null, amount: m.amount as string });
  }
  for (const r of receipts ?? []) {
    const items = (r.receipt_items as { total_price: string; category_id: string | null; deleted_at: string | null }[]) ?? [];
    for (const it of items) {
      if (it.deleted_at) continue;
      lines.push({ categoryId: it.category_id, amount: it.total_price });
    }
  }
  return lines;
}
```

- [ ] **Step 4: Typecheck + lint** — `pnpm --filter @oraculo/mobile typecheck` (PASS); `pnpm lint` (limpio).
  (Si `@oraculo/core` no resuelve los tipos `MonthRange`/`SpendingLine` desde mobile, confirma que `apps/mobile/package.json` tiene `"@oraculo/core": "workspace:*"` en dependencies; si falta, añádelo y corre `pnpm install`.)

- [ ] **Step 5: Commit**
```bash
git add apps/mobile/services/expenses.ts apps/mobile/services/receipts.ts apps/mobile/services/summary.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): expense/receipt/summary services"
```

> NOTA para el implementador: antes de empezar B2, añade `"@oraculo/core": "workspace:*"` y `"@oraculo/validations": "workspace:*"` a `apps/mobile/package.json` dependencies si no están, y corre `pnpm install`. (`@oraculo/validations` ya está desde 0c/0b; `@oraculo/core` es nuevo.)

---

## Task Group C — Navegación por tabs + Perfil

### Task C1: reestructurar `(app)` en Stack + grupo `(tabs)`

**Files:**
- Modify: `apps/mobile/app/(app)/_layout.tsx`
- Create: `apps/mobile/app/(app)/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(app)/(tabs)/profile.tsx`
- Delete: `apps/mobile/app/(app)/index.tsx`

- [ ] **Step 1: Reemplazar `apps/mobile/app/(app)/_layout.tsx`** (Stack que contiene los tabs + pantallas push)
```tsx
import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="expense/new" options={{ title: "Nuevo gasto", presentation: "modal" }} />
      <Stack.Screen name="receipt/new" options={{ title: "Nueva factura", presentation: "modal" }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Crear `apps/mobile/app/(app)/(tabs)/_layout.tsx`**
```tsx
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#111" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Gastos",
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 3: Crear `apps/mobile/app/(app)/(tabs)/profile.tsx`** (contenido del home actual)
```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "../../../lib/auth-context";
import { supabase } from "../../../lib/supabase";
import { getActiveHousehold, type Household } from "../../../services/household";

export default function Profile() {
  const { session } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveHousehold()
      .then((h) => setHousehold(h))
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Perfil</Text>
      <Text>Sesión: {session?.user.email ?? "—"}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : (
        <Text>Hogar activo: {household?.name ?? "(sin hogar)"}</Text>
      )}
      <Pressable
        onPress={() => void supabase.auth.signOut()}
        style={{ backgroundColor: "#b00", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#fff" }}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Eliminar el home antiguo** — borra `apps/mobile/app/(app)/index.tsx`:
```bash
git rm "apps/mobile/app/(app)/index.tsx"
```
(La pestaña Gastos `(tabs)/index.tsx` se crea en el Grupo F; hasta entonces el typecheck de rutas no se rompe porque las rutas no están tipadas.)

- [ ] **Step 5: Crear placeholders temporales de las otras dos tabs** para que la navegación cargue (se reemplazan en F y H):
Crear `apps/mobile/app/(app)/(tabs)/index.tsx`:
```tsx
import { Text, View } from "react-native";
export default function Gastos() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Gastos (próximamente)</Text>
    </View>
  );
}
```
Crear `apps/mobile/app/(app)/(tabs)/dashboard.tsx`:
```tsx
import { Text, View } from "react-native";
export default function Dashboard() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Dashboard (próximamente)</Text>
    </View>
  );
}
```

- [ ] **Step 6: Typecheck + lint** — `pnpm --filter @oraculo/mobile typecheck` (PASS); `pnpm lint` (limpio).

- [ ] **Step 7: Commit**
```bash
git add "apps/mobile/app/(app)/_layout.tsx" "apps/mobile/app/(app)/(tabs)"
git commit -m "feat(mobile): tabs navigation (Gastos/Dashboard/Perfil) + profile"
```

---

## Task Group D — Componente CategoryPicker (con crear inline)

### Task D1: `CategoryPicker.tsx`

**Files:**
- Create: `apps/mobile/components/CategoryPicker.tsx`

- [ ] **Step 1: Crear `apps/mobile/components/CategoryPicker.tsx`**
```tsx
import { categoryCreateSchema } from "@oraculo/validations";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { createCategory, listCategories, type Category } from "../services/categories";

const SWATCHES = ["#16a34a", "#2563eb", "#f97316", "#dc2626", "#7c3aed", "#db2777", "#ca8a04", "#6b7280"];

interface Props {
  householdId: string;
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

/** Selector horizontal de categorías + "Nueva" (crea inline). */
export function CategoryPicker({ householdId, value, onChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0] ?? "#6b7280");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  async function onCreate() {
    const parsed = categoryCreateSchema.safeParse({ name, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    try {
      const created = await createCategory(householdId, parsed.data.name, parsed.data.color);
      setCategories((prev) => [...prev, created]);
      onChange(created.id);
      setModalOpen(false);
      setName("");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <Pressable
              key={c.id}
              onPress={() => onChange(selected ? null : c.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                marginRight: 8,
                backgroundColor: selected ? c.color : "#eee",
              }}
            >
              <Text style={{ color: selected ? "#fff" : "#333" }}>{c.name}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setModalOpen(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: "#999" }}
        >
          <Text>+ Nueva</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "600" }}>Nueva categoría</Text>
            <TextInput
              placeholder="Nombre"
              value={name}
              onChangeText={setName}
              style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {SWATCHES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setColor(s)}
                  style={{
                    width: 32, height: 32, borderRadius: 16, backgroundColor: s,
                    borderWidth: color === s ? 3 : 0, borderColor: "#111",
                  }}
                />
              ))}
            </View>
            {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
              <Pressable onPress={() => setModalOpen(false)}><Text>Cancelar</Text></Pressable>
              <Pressable onPress={onCreate}><Text style={{ fontWeight: "600" }}>Crear</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — `pnpm --filter @oraculo/mobile typecheck` (PASS); `pnpm lint` (limpio).

- [ ] **Step 3: Commit**
```bash
git add apps/mobile/components/CategoryPicker.tsx
git commit -m "feat(mobile): CategoryPicker with inline category creation"
```

---

## Task Group E — Pantalla de gasto rápido

### Task E1: `expense/new.tsx`

**Files:**
- Create: `apps/mobile/app/(app)/expense/new.tsx`

- [ ] **Step 1: Crear `apps/mobile/app/(app)/expense/new.tsx`**
```tsx
import { manualExpenseSchema } from "@oraculo/validations";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { addManualExpense } from "../../../services/expenses";
import { getActiveHousehold } from "../../../services/household";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewExpense() {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [occurredAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getActiveHousehold().then((h) => setHouseholdId(h?.id ?? null)).catch(() => setHouseholdId(null));
  }, []);

  async function onSave() {
    setError(null);
    const parsed = manualExpenseSchema.safeParse({ amount, categoryId, description: description || undefined, occurredAt });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    if (!householdId) {
      setError("No hay hogar activo");
      return;
    }
    setBusy(true);
    try {
      await addManualExpense({
        householdId,
        amount: parsed.data.amount,
        categoryId: parsed.data.categoryId,
        description: parsed.data.description,
        occurredAt: parsed.data.occurredAt,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Nuevo gasto</Text>
      <TextInput
        placeholder="Monto (COP)"
        keyboardType="numeric"
        value={amount}
        onChangeText={setAmount}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <Text>Categoría</Text>
      {householdId ? (
        <CategoryPicker householdId={householdId} value={categoryId} onChange={setCategoryId} />
      ) : (
        <ActivityIndicator />
      )}
      <TextInput
        placeholder="Descripción (opcional)"
        value={description}
        onChangeText={setDescription}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <Text style={{ color: "#666" }}>Fecha: {occurredAt}</Text>
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSave}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Guardar</Text>}
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — PASS / limpio.

- [ ] **Step 3: Commit**
```bash
git add "apps/mobile/app/(app)/expense/new.tsx"
git commit -m "feat(mobile): quick manual expense screen"
```

---

## Task Group F — Lista de gastos (pestaña Gastos)

### Task F1: `(tabs)/index.tsx` con lista + FAB + soft-delete

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/index.tsx`

- [ ] **Step 1: Reemplazar `apps/mobile/app/(app)/(tabs)/index.tsx`**
```tsx
import { formatCOP, monthRange } from "@oraculo/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from "react-native";
import { currentYearMonth, monthLabel } from "../../../lib/dates";
import {
  listMonthEntries,
  softDeleteManualExpense,
  softDeleteReceipt,
  type ExpenseEntry,
} from "../../../services/expenses";
import { getActiveHousehold } from "../../../services/household";

export default function Gastos() {
  const router = useRouter();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { year, month } = currentYearMonth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getActiveHousehold();
      if (!h) {
        setEntries([]);
        return;
      }
      setEntries(await listMonthEntries(h.id, monthRange(year, month)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function confirmDelete(entry: ExpenseEntry) {
    Alert.alert("Eliminar", `¿Eliminar "${entry.title}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            if (entry.kind === "manual") await softDeleteManualExpense(entry.id);
            else await softDeleteReceipt(entry.id);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Error al eliminar");
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
        Gastos — {monthLabel(year, month)}
      </Text>
      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => `${e.kind}:${e.id}`}
          ListEmptyComponent={<Text style={{ color: "#666" }}>Sin gastos este mes.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => confirmDelete(item)}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}
            >
              <View>
                <Text style={{ fontWeight: "500" }}>{item.title}</Text>
                <Text style={{ color: "#888", fontSize: 12 }}>
                  {item.date} · {item.kind === "receipt" ? "Factura" : "Gasto"}
                </Text>
              </View>
              <Text style={{ fontWeight: "600" }}>{formatCOP(item.amount)}</Text>
            </Pressable>
          )}
        />
      )}

      {/* Acciones de captura */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
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
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — PASS / limpio.

- [ ] **Step 3: Commit**
```bash
git add "apps/mobile/app/(app)/(tabs)/index.tsx"
git commit -m "feat(mobile): monthly expenses list with capture actions and soft-delete"
```

---

## Task Group G — Pantalla de factura manual

### Task G1: `receipt/new.tsx`

**Files:**
- Create: `apps/mobile/app/(app)/receipt/new.tsx`

- [ ] **Step 1: Crear `apps/mobile/app/(app)/receipt/new.tsx`**
```tsx
import { sumAmounts } from "@oraculo/core";
import { manualReceiptSchema } from "@oraculo/validations";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { CategoryPicker } from "../../../components/CategoryPicker";
import { getActiveHousehold } from "../../../services/household";
import { createManualReceipt } from "../../../services/receipts";

interface ItemDraft {
  rawName: string;
  quantity: string;
  totalPrice: string;
  categoryId: string | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const emptyItem: ItemDraft = { rawName: "", quantity: "1", totalPrice: "", categoryId: null };

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
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
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
        unitPrice: i.totalPrice, // sin desglose de unitario en captura simple: unit = total
        totalPrice: i.totalPrice,
        categoryId: i.categoryId,
      })),
    };
    const parsed = manualReceiptSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
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
              <Pressable onPress={() => removeItem(index)}><Text style={{ color: "#b00" }}>Quitar</Text></Pressable>
            ) : null}
          </View>
          <TextInput
            placeholder="Nombre"
            value={item.rawName}
            onChangeText={(t) => updateItem(index, { rawName: t })}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              placeholder="Cantidad"
              keyboardType="numeric"
              value={item.quantity}
              onChangeText={(t) => updateItem(index, { quantity: t })}
              style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
            />
            <TextInput
              placeholder="Total (COP)"
              keyboardType="numeric"
              value={item.totalPrice}
              onChangeText={(t) => updateItem(index, { totalPrice: t })}
              style={{ flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 }}
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
```

- [ ] **Step 2: Typecheck + lint** — PASS / limpio.

- [ ] **Step 3: Commit**
```bash
git add "apps/mobile/app/(app)/receipt/new.tsx"
git commit -m "feat(mobile): manual receipt screen (atomic RPC create)"
```

---

## Task Group H — Dashboard mensual

### Task H1: `(tabs)/dashboard.tsx` con barras por categoría

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/dashboard.tsx`

- [ ] **Step 1: Reemplazar `apps/mobile/app/(app)/(tabs)/dashboard.tsx`**
```tsx
import { computeMonthlySummary, formatCOP, monthRange, shiftMonth, type MonthlySummary } from "@oraculo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { currentYearMonth, monthLabel } from "../../../lib/dates";
import { getActiveHousehold } from "../../../services/household";
import { listCategories, type Category } from "../../../services/categories";
import { getMonthlySpending } from "../../../services/summary";

export default function Dashboard() {
  const initial = currentYearMonth();
  const [ym, setYm] = useState(initial);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [cats, setCats] = useState<Record<string, Category>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await getActiveHousehold();
      if (!h) {
        setSummary({ total: "0.0000", byCategory: [] });
        return;
      }
      const [lines, categories] = await Promise.all([
        getMonthlySpending(h.id, monthRange(ym.year, ym.month)),
        listCategories(),
      ]);
      const byId: Record<string, Category> = {};
      for (const c of categories) byId[c.id] = c;
      setCats(byId);
      setSummary(computeMonthlySummary(lines));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [ym]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  function changeMonth(delta: number) {
    setYm((prev) => shiftMonth(prev.year, prev.month, delta));
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={() => changeMonth(-1)}><Text style={{ fontSize: 22 }}>‹</Text></Pressable>
        <Text style={{ fontSize: 16, fontWeight: "600" }}>{monthLabel(ym.year, ym.month)}</Text>
        <Pressable onPress={() => changeMonth(1)}><Text style={{ fontSize: 22 }}>›</Text></Pressable>
      </View>

      {loading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text style={{ color: "red" }}>{error}</Text>
      ) : summary ? (
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: "#666" }}>Total del mes</Text>
            <Text style={{ fontSize: 30, fontWeight: "700" }}>{formatCOP(summary.total)}</Text>
          </View>
          {summary.byCategory.length === 0 ? (
            <Text style={{ color: "#666", textAlign: "center" }}>Sin gastos este mes.</Text>
          ) : (
            summary.byCategory.map((c) => {
              const cat = c.categoryId ? cats[c.categoryId] : undefined;
              const label = cat?.name ?? "Sin categoría";
              const color = cat?.color ?? "#9ca3af";
              return (
                <View key={c.categoryId ?? "none"} style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text>{label}</Text>
                    <Text style={{ color: "#444" }}>{formatCOP(c.total)} · {c.percent}%</Text>
                  </View>
                  <View style={{ height: 10, backgroundColor: "#eee", borderRadius: 5, overflow: "hidden" }}>
                    <View style={{ width: `${c.percent}%`, height: 10, backgroundColor: color }} />
                  </View>
                </View>
              );
            })
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Typecheck + lint** — PASS / limpio.

- [ ] **Step 3: Commit**
```bash
git add "apps/mobile/app/(app)/(tabs)/dashboard.tsx"
git commit -m "feat(mobile): monthly dashboard with per-category bars"
```

---

## Task Group I — Verificación y cierre

### Task I1: Bundle web + verificación automatizada

**Files:** ninguno

- [ ] **Step 1: Typecheck + lint de todo el workspace**

Run (desde la raíz):
```bash
pnpm typecheck
pnpm lint
```
Expected: typecheck 4 packages PASS; lint limpio.

- [ ] **Step 2: Bundle web one-shot (atrapa errores de Metro/imports)**

Run (desde `apps/mobile`):
```bash
cd apps/mobile
rm -rf dist .expo
EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" EXPO_PUBLIC_SUPABASE_ANON_KEY="dummy" pnpm exec expo export --platform web
```
Expected: "App exported to: dist" sin errores de resolución. Luego limpia: `rm -rf dist .expo`.
(Si Metro falla resolviendo `@oraculo/core` o `@oraculo/validations` desde la app, confirma que ambos están en `apps/mobile/package.json` dependencies como `workspace:*` y que `metro.config.js` observa la raíz del workspace — ya lo hace desde 0b.)

- [ ] **Step 3: Restaurar `expo-env.d.ts` si Expo lo borró**

Run (desde la raíz):
```bash
git checkout -- apps/mobile/expo-env.d.ts 2>/dev/null || true
git status --short
```
Expected: working tree limpio (o solo cambios intencionales ya commiteados).

### Task I2: Verificación E2E manual (Expo Web)

> Requiere acción humana + Supabase local con `packages/db/.env`. El controlador prepara `apps/mobile/.env.local` si no existe.

- [ ] **Step 1: Levantar la app**

Run (desde la raíz): `pnpm --filter @oraculo/mobile exec expo start --web -c`.

- [ ] **Step 2: Probar el flujo completo**

En el navegador (inicia sesión si hace falta):
1. Pestaña **Gastos** → "+ Gasto" → monto `25000`, elegir categoría "Mercado", descripción "Prueba", Guardar → vuelve a la lista y aparece el gasto.
2. "+ Factura" → agregar 2 ítems (nombre, cantidad, total, categoría), Guardar → aparece en la lista como "Factura".
3. Crear una **categoría inline** desde el picker (nombre + color) → queda seleccionada.
4. Pestaña **Dashboard** → muestra total del mes y barras por categoría con %; el selector de mes (‹ ›) cambia el mes.
5. **Mantener presionado** un gasto → Eliminar → desaparece de la lista y el total del dashboard baja.
6. Pestaña **Perfil** → email + hogar + Cerrar sesión funciona.

### Task I3: Cierre de rama

- [ ] **Step 1:** Usa `superpowers:finishing-a-development-branch` para fusionar a `master` (PR + CI verde, como en 1a), re-verificando tests.

---

## Definition of Done (Hito 1b)

- [ ] `@oraculo/core` con `monthRange`/`shiftMonth` y tests TDD verdes.
- [ ] Servicios mobile (categories, stores, expenses, receipts, summary) con typecheck/lint limpios.
- [ ] Navegación por tabs (Gastos/Dashboard/Perfil); el home antiguo movido a Perfil.
- [ ] Gasto rápido y factura manual (vía RPC) funcionan; lista del mes con soft-delete; crear categoría inline.
- [ ] Dashboard mensual con total + barras por categoría + selector de mes.
- [ ] `pnpm typecheck` (4 packages) + `pnpm lint` limpios; bundle web compila; CI verde.
- [ ] E2E manual verificado (Expo Web). Working tree limpio.

**Con esto el Hito 1 (1a + 1b) queda completo: el módulo de "Control" — captura manual + dashboard — funcionando de extremo a extremo.**
