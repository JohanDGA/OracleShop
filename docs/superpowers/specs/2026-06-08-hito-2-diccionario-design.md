# Hito 2 — Diccionario de productos — Diseño

> Fecha: 2026-06-08
> Estado: Aprobado para planificación
> Sub-proyecto de: docs/superpowers/specs/2026-06-03-oraculo-de-compras-design.md

---

## 1. Alcance y promesa

Entregar el **corazón del producto** sin IA: cuando el usuario captura una factura manualmente, cada ítem se enlaza a un `canonical_product` del hogar. Repetir el mismo string (`"LCH DESL"`, `"Leche Deslactosada"`) lo resuelve automáticamente en futuras facturas. Sin esto, ni la predicción de costo (Hito 5) ni la comparación entre tiendas (Hito 6) funcionan.

### Alcance concreto (lo que SÍ se construye)

1. **Normalización + abreviaturas** — módulo TS puro (`@oraculo/core/dictionary`) que mapea `raw_name` → `normalized_name`: mayúsculas, sin tildes, sin puntuación, espacios colapsados, expansión de un seed curado (`LCH→LECHE`, `DESLAC→DESLACTOSADA`, etc.).
2. **Matching Capa 1 (exacto)** — RPC `match_product(p_household_id, p_normalized_name)` que retorna `{ canonical_id, layer: 'exact', confidence: 1.0 }` si hay un `product_alias.alias_normalized` exacto en el hogar.
3. **Matching Capa 2 (fuzzy)** — el mismo RPC, en cascada: si Capa 1 vacío, usa `pg_trgm` sobre `alias_normalized` y devuelve top-3 candidatos con `score >= 0.6`.
4. **Precio por unidad estándar** — función pura `pricePerStandardUnit({ unit, unit_quantity, quantity, total_price })` para el set `lt / kg / un` (con conversión `ml→lt` y `g→kg`).
5. **ProductPicker inline** — componente RN que en `receipt/new.tsx`, por cada ítem, sugiere canonical existente (Capa 1 verde, Capa 2 amarillo) o permite **crear inline** un nuevo canonical con `name / brand / presentation / unit / unit_quantity / category_id`.
6. **Persistencia del aprendizaje** — al guardar el ítem confirmado, se inserta `product_alias { alias = raw_name, alias_normalized, source = 'user_confirmed', confidence = 1.0 }` para la próxima vez.
7. **`receipt_items.canonical_product_id`** — se llena en el INSERT atómico (extender RPC `create_receipt_with_items` para aceptar y persistir el match resuelto y, en paralelo, insertar el alias).

### Lo que NO está en este hito (deliberado)

- **Capa 3 semántica (IA)** → Hito 3.
- **CRUD completo del diccionario** (listado, edición, borrado) → diferido. En Hito 2 sólo se crea inline desde el picker; ver/editar canónicos vendrá cuando duela.
- **Cache local del diccionario** — mobile sigue online-directo a Supabase; sin SQLite todavía.
- **Reasignación masiva** (mover ítems de un canonical a otro) — manual y rara, fuera de scope.
- **Unidades extendidas** (docena, libra, onza, galón) — el ecosistema colombiano se cubre con `lt/kg/un`.

---

## 2. Modelo de datos y migraciones

El esquema ya existe (`0001_init_schema.sql`); este hito añade:

### Migración `0009_pg_trgm_and_alias_normalized.sql`
1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. `ALTER TABLE product_aliases ADD COLUMN alias_normalized TEXT NOT NULL DEFAULT '';`
   - Default vacío sólo para no romper si hubiera filas; en la práctica no hay aliases todavía.
3. Índice trigram:
   ```sql
   CREATE INDEX idx_product_aliases_normalized_trgm
     ON product_aliases USING gin (alias_normalized gin_trgm_ops);
   ```
4. Índice exacto auxiliar (Capa 1 rápida):
   ```sql
   CREATE INDEX idx_product_aliases_normalized_eq
     ON product_aliases (canonical_product_id, alias_normalized);
   ```

### Migración `0010_match_product_rpc.sql`
RPC `public.match_product(p_household_id uuid, p_normalized text, p_min_similarity numeric default 0.6)` con cascada:

- **Capa 1**: `WHERE pa.alias_normalized = p_normalized` join `canonical_products cp WHERE cp.household_id = p_household_id AND cp.deleted_at IS NULL` → si hay 1+ hit, retorna `{canonical_id, name, layer:'exact', confidence:1.0}` (limit 1).
- **Capa 2**: si Capa 1 vacío, `similarity(alias_normalized, p_normalized) >= p_min_similarity` y `ORDER BY similarity DESC LIMIT 3`. Retorna un array (puede ser vacío).
- **Resultado**: `RETURNS jsonb` con forma `{ exact: candidate | null, fuzzy: candidate[] }` — un solo objeto, un solo round-trip.

`SECURITY INVOKER` — RLS de `canonical_products` ya garantiza scope por hogar (`is_household_member(household_id)`).

### Migración `0011_create_receipt_with_items_v2.sql`
Reemplazar el RPC existente para aceptar `canonical_product_id` por ítem y persistir alias atómicamente:

```
create_receipt_with_items(
  p_household_id, p_store_id, p_purchased_at, p_currency,
  p_items jsonb -- [{ raw_name, quantity, unit, unit_price, total_price,
                  --   category_id, canonical_product_id, alias_normalized }]
)
```

- Inserta `receipts` y `receipt_items` como antes.
- Por cada ítem con `canonical_product_id` no nulo: `INSERT product_aliases (canonical_product_id, alias, alias_normalized, source, confidence)` **sólo si no existe ya un alias normalizado idéntico para ese canonical** (ON CONFLICT DO NOTHING vía partial unique index o `WHERE NOT EXISTS`).
- `SECURITY INVOKER`; sigue siendo atómico (rollback al fallar cualquier ítem).

Índice de unicidad para el ON CONFLICT:
```sql
CREATE UNIQUE INDEX idx_product_aliases_unique_per_canonical
  ON product_aliases (canonical_product_id, alias_normalized);
```

### Tabla `canonical_products` — sin cambios
El INSERT del canonical nuevo (cuando el usuario "crea inline") va por PostgREST directo desde mobile; ya tiene RLS por hogar. No requiere RPC adicional porque es un INSERT plano de una sola fila.

---

## 3. Algoritmo de normalización y abreviaturas

Módulo `packages/core/src/dictionary.ts` con dos funciones puras:

### `normalizeName(raw: string): string`
1. `raw.trim()` → `toLocaleUpperCase("es-CO")` (preserva ñ).
2. Quitar diacríticos: `normalize("NFD").replace(/[̀-ͯ]/g, "")`.
3. Reemplazar puntuación y símbolos por espacio (mantener letras/dígitos/ñ/espacio).
4. Expandir abreviaturas: por cada token, buscar en `ABBREVIATIONS` y reemplazar.
5. Colapsar espacios múltiples → uno solo, y trim final.

### `ABBREVIATIONS` seed (Colombia, mercado familiar)
Constante en `packages/core/src/abbreviations.ts`. Tabla inicial de ~25 entradas curadas:

```
LCH       → LECHE
DESLAC    → DESLACTOSADA
DESLACT   → DESLACTOSADA
ACEIT     → ACEITE
AZUC      → AZUCAR
ARRZ      → ARROZ
FRJL      → FRIJOL
HUEV      → HUEVOS
JABN      → JABON
JBN       → JABON
PAP       → PAPA
PAPL      → PAPEL
HIGN      → HIGIENICO
CHCL      → CHOCOLATE
GAS       → GASEOSA
AGU       → AGUA
PAN       → PAN
QUES      → QUESO
MANT      → MANTEQUILLA
YOGT      → YOGURT
HARN      → HARINA
SAL       → SAL
PIM       → PIMIENTA
DET       → DETERGENTE
SHAMP     → SHAMPOO
```

Curadas por el equipo (no crowdsourced, per spec de producto). Reemplazo es **exacto por token** (no substring) para evitar falsos positivos (`SAL` no debe expandir dentro de `SALSA`).

### `pricePerStandardUnit(input): bigint | null` (escala 4, BigInt fijo)
Inputs: `{ unit: 'lt'|'kg'|'un', unit_quantity: bigint, quantity: bigint, total_price: bigint }`. Todo en escala 4 ya (consistente con `@oraculo/core/money`).

- Si `unit_quantity = 0` o `quantity = 0` → `null`.
- Total cantidad estándar = `quantity * unit_quantity / 1_0000` (re-escala porque ambos están en 4 dec).
- Precio por unidad estándar = `total_price * 1_0000 / total_cantidad` (escala 4 preservada).

Conversiones: NO se hacen en esta función. La pantalla de "crear canonical inline" obliga a elegir `unit ∈ {lt,kg,un}` y `unit_quantity` ya expresado en esa unidad (ej. para `900ml`, el user pone `unit='lt'`, `unit_quantity=0.9`). Esto evita estado intermedio y simplifica TDD.

Helper aparte: `convertToStandard(value: bigint, fromUnit: 'ml'|'g'|'lt'|'kg'|'un'): { unit, value }` — utilidad opcional para pre-llenar el formulario si el OCR detecta `ml/g` (Hito 3); no usado en Hito 2.

---

## 4. Flujo UX (capture + match)

### En `receipt/new.tsx`
Por cada ítem, después del input "Nombre" se muestra el `ProductPicker`. Comportamiento:

1. Usuario escribe el `raw_name`. Al salir del campo (`onBlur`) o tras debounce 400ms, se dispara la consulta de match.
2. Mobile normaliza con `normalizeName` y llama `supabase.rpc('match_product', { p_household_id, p_normalized })`.
3. Resultado del RPC:
   - **`exact` no nulo** → pinta chip verde `"✓ Leche Alpina 1L"` con botón "cambiar".
   - **`fuzzy.length > 0`** → pinta chips amarillos con top-3 sugerencias + botón "Crear nuevo…".
   - **vacío** → solo botón `"+ Crear producto"`.
4. "Crear producto" abre modal con form: `name, brand?, presentation?, unit (radio: lt|kg|un), unit_quantity, category_id` (CategoryPicker reutilizado). Al confirmar → INSERT `canonical_products` → setea ese `canonical_id` para el ítem actual.
5. El ítem queda en estado `{ rawName, quantity, totalPrice, categoryId, canonicalProductId, aliasNormalized }`.
6. "Guardar factura" llama al RPC v2 con todos los campos; el alias se persiste atómicamente.

### Estados visuales del picker (por ítem)
| Estado | Color | Texto |
|---|---|---|
| Sin nombre aún | gris | placeholder "Buscar producto…" |
| Capa 1 hit | verde | "✓ {canonical.name}" |
| Capa 2 sugiere | amarillo | "≈ {top.name}" (más "ver alternativas") |
| Sin match | gris | "Sin coincidencias — Crear" |
| Resuelto manualmente (sin sugerencia) | verde tenue | "{canonical.name} (nuevo)" |

### Edge cases
- El usuario edita el `raw_name` después de haber resuelto el canonical → invalidar el match y disparar nuevo lookup. La asociación raw→canonical se rompe.
- Dos ítems en la misma factura con el mismo `raw_name` → ambos resuelven al mismo canonical, ambos producirían el mismo alias; el ON CONFLICT del índice de unicidad evita duplicado.
- "Crear inline" con un nombre que normaliza a un alias ya existente del hogar → mostrar warning "Existe '{canonical.name}' con un alias similar. ¿Usar ese?" antes de crear duplicado.

---

## 5. Estrategia de testing

### Lógica pura (`@oraculo/core`) — TDD primero
| Función | Casos mínimos |
|---|---|
| `normalizeName` | mayúsculas, tildes, ñ preservada, puntuación, espacios, abreviaturas por token, no-substring (`SAL` no toca `SALSA`), idempotencia |
| `pricePerStandardUnit` | lt/kg/un happy path, quantity=0 → null, unit_quantity=0 → null, precisión con BigInt (no pérdida de centavos), múltiples cantidades |
| `ABBREVIATIONS` | sin duplicados de clave; orden no importa |

### Validations (`@oraculo/validations`)
- Schema Zod para "crear canonical inline" — `unit ∈ enum`, `unit_quantity > 0`, `name` no vacío.
- Schema Zod para payload del RPC v2 (extender `manualReceiptSchema` con `canonicalProductId?`, `aliasNormalized?`).

### DB (`@oraculo/db`)
- **RPC `match_product`**: usuario A crea canonical "Leche Alpina 1L" con alias "LECHE ALPINA 1L". Buscar `"LECHE ALPINA 1L"` → exact hit. Buscar `"LECHE ALPINA"` → fuzzy con score < 1.0 ≥ 0.6. Buscar `"PAÑALES"` → vacío.
- **RPC v2 `create_receipt_with_items`**: persistir alias al crear factura; ON CONFLICT no duplica.
- **RLS**: usuario A no ve canónicos ni aliases del usuario B; `match_product(B_household, ...)` desde A devuelve vacío (o falla).
- **Limpieza**: extender `cleanupUser` para incluir `product_aliases` y `canonical_products`.

### Verificación de UI (export web)
`cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec expo export --platform web` debe compilar. E2E manual (Jessica) en `localhost:8081` valida los 5 estados del picker.

---

## 6. Métrica de salud (instrumentar desde día 1)

Sentry custom event o log estructurado en `services/match.ts`:
- Por cada item guardado: `match_resolved { layer: 'exact'|'fuzzy_confirmed'|'created'|'manual', household_id_hash }`.
- En Hito 7 se agrega un dashboard de "tasa de auto-resolución Capa 1" — primer KPI del producto.

Para Hito 2 sólo se emite el evento; el agregado se difiere.

---

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Trigram threshold 0.6 muy laxo/estricto | Hacerlo parámetro del RPC con default 0.6; ajustable sin migración |
| Abreviaturas seed insuficiente | Es un JSON; se amplía sin migración de DB |
| Usuario crea muchos canónicos casi-duplicados | Warning al crear si normalización colisiona con alias existente |
| RPC lento con 1000+ aliases | Índice GIN trigram + filtro previo por `household_id` (RLS); medir en E2E |

---

## 8. Entregable

Una factura manual donde el usuario, al teclear `"LCH DESLAC"` la primera vez, no tiene match, crea inline `"Leche Deslactosada 1L"`. La segunda factura con `"LCH DESL"` o `"Leche deslactosada"` resuelve en verde sin escribir nada. Auditable: `product_aliases` tiene 2 filas con `source='user_confirmed'` apuntando al mismo `canonical_product`.

Este es el primer pago real del producto: el diccionario empieza a aprender.
