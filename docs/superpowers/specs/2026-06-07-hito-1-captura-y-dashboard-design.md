# Hito 1 — Captura manual de gastos y dashboard mensual — Diseño

> Fecha: 2026-06-07
> Estado: Aprobado para planificación
> Sub-proyecto de: docs/superpowers/specs/2026-06-03-oraculo-de-compras-design.md

---

## 1. Alcance y arquitectura

Entrega la promesa de **"Control"** sin IA ni escaneo: el usuario registra gastos a mano, los ve en una lista y un **dashboard mensual** le muestra en qué gastó, por categoría.

### Alcance concreto
1. **Semilla de categorías de sistema** (migración) — ~9 categorías orientadas a Colombia.
2. **Gasto rápido** — monto, categoría, fecha, descripción → `manual_expenses`.
3. **Factura manual** — tienda (existente o nueva) + fecha + líneas de ítem (nombre, cantidad, precio, categoría) → `receipts` + `receipt_items` (vía RPC atómica). Total = Σ ítems.
4. **Lista de gastos del mes** — gastos manuales + facturas combinados, orden por fecha; eliminar = soft delete.
5. **Dashboard mensual** — selector de mes, total, desglose por categoría con barras de progreso.
6. **Crear categoría inline** (nombre + color) durante la asignación.

### Arquitectura (sobre lo existente de 0a/0b/0c)
- **`packages/core`** (NUEVO) — lógica pura TS (sin React/Supabase): aritmética monetaria con `dinero.js` y el motor de agregación mensual. Vitest + TDD.
- **`packages/validations`** — schemas Zod nuevos (gasto manual, factura, ítem, categoría).
- **`packages/db`** — migración de semilla de categorías + RPC `create_receipt_with_items`. La RLS de las tablas ya existe (0a).
- **`apps/mobile`** — navegación por tabs (Gastos / Dashboard / Perfil), servicios que leen/escriben Supabase directo (online), pantallas y componentes.

### Supuestos (decididos en brainstorming)
- **Moneda única**: la base del hogar (COP). Sin conversión FX (módulo "Divisas" es posterior). Los formularios asumen la moneda base.
- **Online-directo a Supabase**: sin capa SQLite/offline en este hito.
- **Tiendas inline**: elegir una `store` existente o crear una rápida (reusa `stores` del 0a).

### Regla anti-doble-conteo (crítica)
- Cada `manual_expense` aporta su `amount` a su categoría.
- Cada factura aporta vía sus `receipt_items` (cada ítem suma `total_price` a su categoría).
- **Total del mes = Σ(manual_expenses.amount) + Σ(receipt_items.total_price)**. NO se usa `receipts.total` para el agregado (solo es la cabecera).

---

## 2. Datos, semilla y flujo de agregación

### Semilla de categorías de sistema (migración `0006_seed_system_categories.sql`)
`household_id = NULL` (la RLS del 0a las hace legibles para todos los autenticados). Cada una con `name`, `color` (hex), `icon` (nombre de ícono). IDs fijos (UUID determinista por categoría) para idempotencia y referencia estable.

| name | color | icon |
|---|---|---|
| Mercado | #16a34a | shopping-cart |
| Transporte | #2563eb | car |
| Comida fuera | #f97316 | utensils |
| Hogar y servicios | #0891b2 | home |
| Salud | #dc2626 | heart-pulse |
| Tecnología | #7c3aed | cpu |
| Entretenimiento | #db2777 | gamepad-2 |
| Educación | #ca8a04 | book-open |
| Otros | #6b7280 | ellipsis |

Migración idempotente: `insert ... on conflict (id) do nothing` con UUIDs fijos.

### Categoría personalizada inline
`INSERT categories (household_id = hogar activo, name, color)`. La RLS del 0a permite leer (sistema + propias) e insertar las del hogar.

### Flujo de agregación

```
Mes seleccionado (rango [inicio, finExclusivo))
   ├── manual_expenses del hogar en el mes  → [{categoryId, amount}]
   └── receipts del mes + receipt_items     → [{categoryId, amount=total_price}]
                       │  (servicio mobile: 2 queries Supabase; RLS filtra por hogar)
                       ▼
            líneas normalizadas: SpendingLine[]
                       ▼
   packages/core: computeMonthlySummary(lines)   ← LÓGICA PURA (TDD)
                       ▼
   { total, byCategory: [{categoryId, total, percent}] }  → Dashboard
```

- El servicio solo trae y aplana; la matemática vive en `core`.
- Ítems/gastos sin categoría → bucket "Sin categoría" (`categoryId = null`).
- Filtro de mes sobre `occurred_at` (manual_expenses) y `purchased_at` (receipts), ambos `DATE`.

---

## 3. `packages/core` — lógica pura (TDD)

### `money.ts`
Envoltura sobre **dinero.js** para sumar montos `NUMERIC(15,4)` representados como strings, sin floats.
- `parseAmount(s: string): Dinero` — string decimal → dinero (escala 4).
- `addAmounts(a: string, b: string): string` y `sumAmounts(xs: string[]): string`.
- `formatAmount(s: string): string` — formato display (es-CO).

### `monthly-summary.ts`
```typescript
export interface SpendingLine { categoryId: string | null; amount: string }
export interface CategorySummary { categoryId: string | null; total: string; percent: number }
export interface MonthlySummary { total: string; byCategory: CategorySummary[] }
export function computeMonthlySummary(lines: SpendingLine[]): MonthlySummary
```
Reglas:
- Agrupa por `categoryId` (null → bucket "uncategorized" representado como `null`).
- `total` = suma de todas las líneas (vía `money`).
- `percent` = `categoryTotal / total * 100` redondeado a entero; **0 si total es 0** (sin división por cero).
- `byCategory` ordenado por monto descendente.

### Tests (Vitest, TDD)
- lista vacía → `{ total: "0.0000"(o "0"), byCategory: [] }`, sin throw.
- una categoría.
- varias categorías + orden descendente.
- líneas con `categoryId = null` agrupadas en el bucket null.
- montos con decimales sumados con exactitud (sin error de float).
- porcentajes que suman ~100 (tolerancia por redondeo).

---

## 4. Pantallas y flujos (mobile)

### Navegación (Expo Router tabs)
`(app)/_layout.tsx` pasa a `Tabs`. Pantallas:
- **`(app)/(tabs)/index.tsx`** — Gastos: lista del mes + botón "+".
- **`(app)/(tabs)/dashboard.tsx`** — Dashboard mensual.
- **`(app)/(tabs)/profile.tsx`** — email + hogar + cerrar sesión (contenido del home actual movido aquí).
- **`(app)/expense/new.tsx`** — form de gasto rápido (pushed).
- **`(app)/receipt/new.tsx`** — form de factura manual (pushed).

### Servicios (`apps/mobile/services/`)
- `expenses.ts` — `addManualExpense(input)`, `listMonthExpenses(monthRange)` (manual + receipts), `softDeleteManualExpense(id)`, `softDeleteReceipt(id)`.
- `receipts.ts` — `createManualReceipt(input)` → llama la RPC `create_receipt_with_items`.
- `categories.ts` — `listCategories()` (sistema + hogar), `createCategory(name, color)`.
- `stores.ts` — `listStores()`, `createStore(name)`.
- `summary.ts` — `getMonthlySpending(monthRange)` → líneas; el componente llama `computeMonthlySummary` de core.

### Flujos
1. **Gasto rápido**: validar con Zod → `INSERT manual_expenses` → volver a la lista.
2. **Factura manual**: tienda (picker/crear) + fecha + ítems dinámicos (nombre, cantidad, precio, categoría) → validar → **RPC** `create_receipt_with_items` (atómico) → volver.
3. **Picker de categoría**: lista sistema+hogar + "+ Nueva categoría" (modal: nombre + color) → inserta y selecciona.
4. **Lista de gastos**: filas unificadas (gasto manual o factura) con descripción/tienda, monto, categoría, fecha; eliminar (soft delete) con confirmación.
5. **Dashboard**: selector de mes (anterior/siguiente), total grande, barras por categoría (monto + % + barra de color de la categoría).

### Escritura atómica de factura — RPC
`create_receipt_with_items(p_household_id uuid, p_store_id uuid, p_purchased_at date, p_currency text, p_items jsonb)`:
- `SECURITY INVOKER` (respeta RLS; el usuario debe ser miembro del hogar — lo es). El `p_household_id` lo provee el cliente (hogar activo, vía `getActiveHousehold`); la RLS de `receipts` valida la membresía.
- Inserta `receipts` (`household_id = p_household_id`, `created_by = auth.uid()`, `total` = Σ ítems, `source = 'manual'`) y los `receipt_items` en **una transacción**; devuelve el `receipt.id`.
- Si algún ítem es inválido → la transacción hace rollback (sin receipt huérfano).
- Reemplaza el "patrón atómico" del spec que vivía en el Core API (aún inexistente).

---

## 5. Estrategia de testing

| Capa | Tool | Qué se prueba | Nivel |
|---|---|---|---|
| `packages/core` | Vitest (TDD) | `money` (suma exacta, decimales), `computeMonthlySummary` (vacío sin div/0, una/varias categorías, sin categoría, % ~100, orden) | Alto |
| `packages/validations` | Vitest (TDD) | gasto manual, ítem de factura, factura, categoría (monto > 0, fecha válida, nombre no vacío) | Alto |
| `packages/db` | Vitest + Supabase local | (a) las ~9 categorías de sistema existen tras migrar; (b) RPC crea receipt+items y es **atómica** (ítem inválido → 0 receipts huérfanos); (c) RPC respeta RLS (no crear en hogar ajeno) | Flujos críticos |
| `apps/mobile` | Manual (Expo Web) | gasto rápido + factura + lista + dashboard | Happy path |
| CI | GitHub Actions | job `quality` corre core + validations; job `db` corre semilla/RPC/RLS | Automático |

TDD estricto (rojo→verde) en `core` y `validations`. La RPC se prueba contra Supabase local con un caso adversarial de hogar ajeno (como en 0a).

---

## 6. Fuera de alcance (diferido)

- **Editar** gastos/facturas (Hito 1 = crear + soft-delete).
- **SQLite/offline** y sincronización.
- **Multi-moneda / FX** (módulo "Divisas").
- **Gráficas** con librería (barras nativas por ahora).
- **Gestión completa de categorías** (íconos personalizados, subcategorías, archivar).
- **Escaneo/IA, listas inteligentes, comparación, deudas, ahorros, presupuestos, grupos** — hitos siguientes.

---

## Definition of Done (Hito 1)

- [ ] Migración de semilla: ~9 categorías de sistema presentes (idempotente).
- [ ] RPC `create_receipt_with_items` atómica y RLS-segura; con tests (incl. caso adversarial).
- [ ] `packages/core` con `money` + `computeMonthlySummary` y tests TDD verdes.
- [ ] `packages/validations` con schemas nuevos y tests verdes.
- [ ] App: tabs Gastos/Dashboard/Perfil; gasto rápido y factura manual funcionan; lista del mes; dashboard por categoría con barras; crear categoría inline.
- [ ] `pnpm typecheck`, `pnpm lint`, todos los tests (core, validations, db) verdes; CI verde.
- [ ] E2E manual verificado (Expo Web).
