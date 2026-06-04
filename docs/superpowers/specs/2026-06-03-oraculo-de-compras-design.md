# Oráculo de Compras — Diseño v1

> Fecha: 2026-06-03
> Estado: Aprobado para planificación
> Autor: Jessica Duque + Claude Code (brainstorming)

---

## 1. Concepto y promesa de valor

**Oráculo de Compras** es una app móvil de inteligencia de compras y finanzas personales que promete dos cosas:

- **Previsibilidad** — saber cuánto vas a gastar antes de salir de casa, mediante listas de compras con estimación de costo basada en tu propio historial.
- **Control** — saber en qué gastaste sin esfuerzo, mediante escaneo de facturas con categorización automática.

Todo se alimenta de las facturas que el usuario escanea con el tiempo (o ingresa por factura electrónica DIAN o manualmente). El diferenciador es un **diccionario de productos personal** que aprende que `"LCH DESL"`, `"Leche Deslactosada"` y `"Leche caja azul"` son el mismo producto.

### Alcance: la tríada completa en v1

Se construye en un solo empuje (6-8 meses), sin releases públicos intermedios, las tres capacidades:

1. **Control** — escaneo + categorización automática + dashboard de gastos.
2. **Previsibilidad** — listas inteligentes con predicción de costo desde el historial.
3. **Ahorro/Decisión** — comparación de precios entre tiendas + alertas de cambio de precio.

### Lo que NO hace (límites deliberados)

- **No es red social / crowdsourcing** — ningún usuario ve precios escaneados por otro. Los datos son privados al hogar. Evita datos falsos y spam.
- **No es transaccional** — no compra, no paga, no pide domicilios. Es solo planificación e inteligencia.
- **No es software contable** — no calcula retenciones, IVA discriminado para renta de empresas, ni depreciación. Es finanzas personales del bolsillo común.
- **No obliga a escanear** — siempre hay entrada manual rápida para compras informales sin factura.

---

## 2. Decisiones de producto y restricciones

| Decisión | Valor | Razón |
|---|---|---|
| Persona primaria | Familia/persona con mercado semanal en Colombia | Alta repetición de productos → diccionario y predicciones funcionan en 2-3 semanas |
| Plataforma | Mobile-first (React Native + Expo) | El flujo de cámara lo exige; un código, dos plataformas |
| Mercado inicial | Colombia (COP, factura electrónica DIAN) | Contexto del caso de uso |
| Costo de construcción | **100% gratis** (hosting + herramientas) | Restricción dura del proyecto |
| Modelo de negocio | Gratis para el usuario; freemium futuro sin definir | BYOK elimina costos operativos del lado del proveedor |
| IA / OCR | **BYOK** (Bring Your Own Key) multi-proveedor | El usuario pone su API key → cero costo de IA del lado del proyecto |
| Proveedores IA v1 | Gemini (default) + Claude + OpenAI | Multi-proveedor desde día 1 |
| OCR fallback | **PaddleOCR on-device** (ONNX Runtime) | Sin servidor, sin costo, máxima privacidad; sin necesidad de API key |
| Almacenamiento de fotos | **No se guardan** | Foto procesada en memoria y descartada tras confirmación. Mejor privacidad, sin bucket de Storage |
| Unidad de propiedad de datos | **Hogar (`household`)** desde día 1 | Soporta compartir sin migrar el modelo después |
| Telemetría | Sentry free tier desde el inicio | 5K errores/mes gratis |

### Realidad de ejecución

El desarrollo es guiado por Claude Code sesión por sesión. El humano (Jessica) maneja: pruebas en dispositivos reales con facturas reales, decisiones de producto, despliegue a stores, obtención de cuentas/keys de terceros.

---

## 3. Arquitectura general

```
┌─────────────────────────────────────────────────────────────┐
│  APP MOBILE (React Native + Expo SDK 51)                    │
│                                                             │
│  Captura recibo · Listas inteligentes · Gastos/Reportes ·   │
│  Diccionario y confirmación                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ AIProvider abstraction                              │   │
│  │ (Gemini / Claude / OpenAI / PaddleOCR on-device)    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Almacén local: expo-secure-store (API keys)               │
│                 expo-sqlite + Drizzle (datos/cache)        │
└──────────────────────┬──────────────────────────────────────┘
                       │ Supabase SDK (HTTPS)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│  BACKEND (Supabase free tier — SIN Storage)                 │
│  Postgres + RLS · Auth (email/Google) · Realtime (hogar)    │
│  Edge Functions (Deno): parser DIAN, agregaciones nocturnas │
└─────────────────────────────────────────────────────────────┘

PaddleOCR corre 100% on-device (ONNX). No hay servicio OCR remoto.
Las fotos nunca tocan disco persistente ni el backend.
```

### Decisión: las APIs de IA se llaman directo desde mobile

- La API key del usuario se guarda en `expo-secure-store` (Keychain iOS / Keystore Android), cifrada por el OS.
- El backend **nunca** ve la key ni la imagen — solo recibe el JSON estructurado resultante.
- Consecuencia: los jobs nocturnos (proyecciones, alertas) NO usan IA; se resuelven con SQL puro sobre datos ya estructurados.

### Stack consolidado

| Capa | Tecnología |
|---|---|
| App mobile | React Native + Expo SDK 51+ |
| Navegación | Expo Router v3 (tab + stack, file-based) |
| State / queries | TanStack Query + Zustand |
| DB local | expo-sqlite + Drizzle ORM |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| ORM backend | Drizzle sobre Postgres |
| Validación | Zod (schemas compartidos mobile/backend) |
| Aritmética monetaria | dinero.js (nunca floats) |
| OCR on-device | ONNX Runtime React Native + modelo PaddleOCR exportado a ONNX |
| Proveedores IA | Gemini SDK + Anthropic SDK + OpenAI SDK tras interfaz `AIProvider` |
| Parser DIAN | Edge Function Deno |
| Sync hogar | Supabase Realtime (solo datos compartidos) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| Testing | Vitest (lógica pura) + Detox/Maestro (E2E) |
| CI/CD mobile | EAS Build (free tier) |
| Errores | Sentry free tier |

### Principios de diseño

1. **Lógica de negocio en módulos puros** (TypeScript sin dependencias de RN/Supabase) → testeable y compartible.
2. **`AIProvider` detrás de una interfaz única** → cambiar/añadir proveedor es una clase.
3. **Diccionario canónico por hogar** con cache local en mobile.
4. **Soft delete universal** (`deleted_at`); nunca DELETE en facturas, ítems, listas.
5. **Confirmación humana obligatoria** antes de persistir datos derivados de IA.

```typescript
interface AIProvider {
  parseReceipt(image: Blob, knownProducts: CanonicalProduct[]): Promise<ParseResult>
}
```

---

## 4. Modelo de datos

### Principios de modelado

1. Scope por `household_id`, no `user_id` — un usuario solo es un hogar de una persona.
2. Soft delete universal (`deleted_at`).
3. Toda entidad tiene `id`, `created_at`, `updated_at`.
4. Dinero como `NUMERIC(15,4)` + dinero.js.
5. Preservar `raw_*` (lo que devolvió IA/OCR) para mejorar el diccionario.
6. Sin crowdsourcing entre hogares.

### Entidades (texto)

```
households
   └── household_members (N:M con users)
   └── stores
   └── categories (sistema + personalizadas)
   └── canonical_products
         └── product_aliases
   └── receipts
         └── receipt_items
   └── manual_expenses
   └── shopping_lists
         └── shopping_list_items
   └── price_alerts

users (Supabase Auth)
   └── user_settings
```

### Tablas

```sql
households (
  id UUID PK, name TEXT, base_currency VARCHAR(3) DEFAULT 'COP',
  country VARCHAR(2) DEFAULT 'CO', created_by UUID FK users(id),
  created_at, updated_at, deleted_at
)

household_members (
  household_id UUID FK, user_id UUID FK, role TEXT, joined_at,
  PRIMARY KEY (household_id, user_id)
)

stores (
  id UUID PK, household_id UUID FK, name TEXT, brand TEXT,
  location_text TEXT, nit VARCHAR(20), created_at, updated_at, deleted_at
)

categories (
  id UUID PK, household_id UUID FK NULL,  -- NULL = sistema
  name TEXT, icon TEXT, color VARCHAR(7), parent_id UUID FK NULL,
  created_at, updated_at, deleted_at
)

canonical_products (
  id UUID PK, household_id UUID FK, name TEXT, brand TEXT,
  presentation TEXT, category_id UUID FK, unit TEXT,   -- 'lt','kg','un','g','ml'
  unit_quantity NUMERIC(10,4), barcode TEXT NULL, notes TEXT,
  created_at, updated_at, deleted_at
)

product_aliases (
  id UUID PK, canonical_product_id UUID FK, alias TEXT,
  source TEXT,        -- 'user_confirmed' | 'ai_inferred'
  confidence NUMERIC(3,2), created_at
)

receipts (
  id UUID PK, household_id UUID FK, created_by UUID FK,
  store_id UUID FK NULL, purchased_at DATE, total NUMERIC(15,4),
  currency VARCHAR(3), exchange_rate NUMERIC(10,6), total_base NUMERIC(15,4),
  source TEXT,         -- 'photo_ai' | 'photo_paddleocr' | 'dian_xml' | 'manual'
  raw_data JSONB,      -- salida del OCR/IA, para auditar/mejorar
  notes TEXT, created_at, updated_at, deleted_at
)

receipt_items (
  id UUID PK, receipt_id UUID FK,
  canonical_product_id UUID FK NULL,   -- NULL = no mapeado
  raw_name TEXT, quantity NUMERIC(10,4), unit TEXT,
  unit_price NUMERIC(15,4),            -- precio efectivamente pagado / unidad
  regular_price NUMERIC(15,4) NULL,    -- precio sin descuento si la factura lo muestra
  is_promo BOOLEAN DEFAULT false,
  total_price NUMERIC(15,4), category_id UUID FK, position INT,
  needs_review BOOLEAN DEFAULT false, created_at, updated_at, deleted_at
)

manual_expenses (
  id UUID PK, household_id UUID FK, created_by UUID FK, category_id UUID FK,
  description TEXT, amount NUMERIC(15,4), currency VARCHAR(3),
  occurred_at DATE, created_at, updated_at, deleted_at
)

shopping_lists (
  id UUID PK, household_id UUID FK, created_by UUID FK, name TEXT,
  status TEXT,         -- 'active' | 'completed' | 'archived'
  completed_at TIMESTAMPTZ NULL, estimated_total NUMERIC(15,4) NULL,
  estimated_at TIMESTAMPTZ NULL, created_at, updated_at, deleted_at
)

shopping_list_items (
  id UUID PK, shopping_list_id UUID FK,
  canonical_product_id UUID FK NULL, raw_name TEXT,
  quantity NUMERIC(10,4), unit TEXT,
  estimated_unit_price NUMERIC(15,4) NULL,
  estimated_source TEXT,   -- 'avg_last_3' | 'last_purchase' | 'no_history'
  checked BOOLEAN DEFAULT false, position INT, created_at, updated_at
)

price_alerts (
  id UUID PK, household_id UUID FK, canonical_product_id UUID FK,
  previous_price NUMERIC(15,4), current_price NUMERIC(15,4),
  change_percent NUMERIC(5,2), store_id UUID FK NULL,
  detected_at TIMESTAMPTZ, dismissed_at TIMESTAMPTZ NULL, created_at
)

user_settings (
  user_id UUID PK FK, active_household_id UUID FK,
  preferred_ai_provider TEXT,   -- 'gemini'|'claude'|'openai'|'paddleocr_local'
  price_alert_threshold NUMERIC(5,2) DEFAULT 10.00,  -- % configurable
  theme TEXT DEFAULT 'system', locale VARCHAR(5) DEFAULT 'es-CO', updated_at
)
```

### Fuera de la base de datos

- **API keys** → `expo-secure-store` (Keychain/Keystore).
- **Imágenes de recibos** → en memoria, descartadas tras confirmación.
- **Config por dispositivo** → AsyncStorage local.

### Índices (no exhaustivo)

```sql
CREATE INDEX idx_receipts_household_purchased ON receipts(household_id, purchased_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_receipt_items_canonical ON receipt_items(canonical_product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_canonical_products_household ON canonical_products(household_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_aliases_alias_trgm ON product_aliases USING gin (alias gin_trgm_ops);
CREATE INDEX idx_household_members_user ON household_members(user_id);
```

### RLS (patrón estándar, replicado a todas las tablas con `household_id`)

```sql
CREATE POLICY "members_see_household_receipts" ON receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM household_members
      WHERE household_members.household_id = receipts.household_id
        AND household_members.user_id = auth.uid()
    )
    AND deleted_at IS NULL
  );
```

---

## 5. Flujos críticos

### Flujo 1 — Escaneo de factura

```
1. Usuario tapea "Escanear" → expo-camera
2. Snapshot → foto EN MEMORIA (nunca disco persistente)
3. App elige proveedor (user_settings.preferred_ai_provider):
     Gemini / Claude / OpenAI Vision  ·  o  PaddleOCR on-device (ONNX)
4. Resultado → ParseResult { store, purchased_at, total, currency,
     items: [{raw_name, qty, unit, unit_price, regular_price, is_promo,
              total_price, inferred_category, suggested_canonical_match}] }
5. Pantalla de confirmación OBLIGATORIA, pre-llenada
6. Usuario revisa/edita: tienda (autocomplete + crear), por ítem el match de
   producto canónico (verde=OK / amarillo=sin match / rojo=baja confianza),
   categoría. Muestra precio unitario en grande para detectar errores.
7. "Guardar" requiere TODOS los ítems resueltos
8. Transacción atómica: INSERT receipt + receipt_items + UPSERT canonical_products
   + INSERT product_aliases
9. Foto descartada de memoria
10. Async post-save: calcular price_alerts; invalidar cache de listas activas
11. Toast de confirmación
```

Reglas de confirmación: si total del recibo ≠ suma de ítems → alertar, no bloquear (puede haber descuentos/impuestos no desglosados). Categorías de baja confianza → top-3 como botones.

Errores de IA → siempre hay vía manual (ver Sección 6).

### Flujo 2 — Lista inteligente con predicción

```
1. Crear lista
2. Agregar productos: autocomplete (trigram sobre nombre+aliases) o texto nuevo
3. Por ítem, estimar precio (regla de recencia ≤90 días):
     3+ compras → promedio ponderado por recencia
     1-2 compras → última conocida + flag baja confianza
     >90 días → última conocida + flag "precio antiguo"
     sin historial → null + flag "sin estimación"
4. UI: nombre, cantidad, precio estimado, confianza, indicador de cambio
   (↑ +12% rojo / ↓ -8% verde / = neutro). Total estimado con rango.
5. Ítems sin canonical → "sin estimación", no suman al total
6. Botón "Comparar tiendas" → Flujo 3
```

Cache de `estimated_unit_price` por ítem; se invalida al editar, al confirmar factura con ese producto, o tras 7 días.

### Flujo 3 — Comparación de precios entre tiendas

```
1. Por ítem con canonical: AVG(unit_price por unidad estándar) agrupado por store,
   últimos 90 días
2. Tabla por producto: precio por tienda + recencia + nº de compras. Sugerencia si
   diferencia >5% con confianza similar
3. Agregado de la lista:
     best-case (cada ítem en su tienda más barata, multi-tienda)
     one-shop (toda la lista en una sola tienda) → recomendar la más barata
     mostrar ahorro hipotético
4. Ítems sin datos en una tienda → excluidos de esa tienda
```

Casos límite: tienda sin historial → "no disponible"; producto en una sola tienda → sin comparación; <50% de ítems comparables → no mostrar recomendación agregada.

**Toda comparación y detección de cambio de precio opera sobre precio-por-unidad-estándar, nunca sobre precio absoluto del ítem.**

### Flujos secundarios

- **Flujo 4 — DIAN**: usuario comparte XML/PDF → Edge Function parsea → entra al flujo de confirmación desde el paso 5. Datos garantizados estructurados.
- **Flujo 5 — Gasto manual**: monto + categoría + descripción + fecha → `manual_expenses`. Cuenta en gastos del mes pero NO genera precios para predicción/comparación.
- **Flujo 6 — Alerta de cambio de precio**: al guardar factura, por ítem comparar contra promedio histórico (misma tienda, 30 días). Si difiere > umbral configurable → `price_alert` + push local + badge.

### Onboarding

```
1. Sign up (email/password o Google)
2. Crear household automáticamente
3. Wizard de IA:
     - explicación "100% gratis"
     - tarjetas: Gemini (recomendado) / Claude / OpenAI / Sin IA (PaddleOCR local)
     - instrucciones paso a paso + deep link al portal del proveedor
     - pegar key + "Probar" con factura demo
4. CTA: "Escanea tu primera factura"
```

---

## 6. Manejo de errores, edge cases y testing

### Errores de IA / OCR

| Error | Manejo |
|---|---|
| API key inválida | Detectar en "Probar"; en uso → banner + fallback manual |
| Rate limit (429) | Mensaje claro + opción de cambiar de proveedor |
| Timeout / sin red | Ofrecer PaddleOCR on-device; si no, reintentar o manual |
| JSON malformado | Reintentar 1 vez con prompt estricto; luego texto crudo + manual asistido |
| Total no cuadra | Alertar en confirmación, no bloquear |
| Factura ilegible | Reintentar foto o manual |

Principio: ningún error de IA deja al usuario sin salida; siempre hay vía manual.

### Errores de datos / sync

- Conflicto en hogar → last-write-wins por `updated_at`; Realtime notifica.
- Offline → cola local en SQLite; sincroniza al reconectar.
- Borrado de canonical en uso → soft delete + advertencia "está en X facturas / Y listas".
- Cambio de `base_currency` → NO reconvierte histórico; solo nuevos registros.

### Edge cases del dominio

1. Productos repetidos en un recibo → 2 items mismo canonical; cantidades se suman al historial.
2. **Ofertas/descuentos (detección automática, sin preguntar)**: la factura suele mostrar el descuento. Parser/IA detecta marcadores (`DESCUENTO`, `AHORRO`, `DTO`, precio tachado, ahorro al pie):
   - Item con precio regular + pagado → guardar ambos (`regular_price`, `unit_price`), `is_promo=true`.
   - Historial de precio **base** usa `regular_price`; gasto real usa `unit_price`.
   - Alertas de cambio comparan `regular_price` vs `regular_price` → sin falsas alarmas por oferta.
   - Si la factura solo muestra precio pagado → `regular_price=NULL`, se usa `unit_price` como base.
   - Descuento global al total → registrarlo como ajuste sin tocar precios unitarios base.
3. Multi-moneda → guardar `currency`, `exchange_rate`, `total_base`; historial normalizado a base del hogar.
4. Cantidad por peso variable → `unit=kg`, `unit_quantity` del recibo; precio-por-kg calculado.
5. **Detección de factura duplicada en hogar (v1)** → mismo store + total + fecha en ventana de minutos → advertir.
6. Lista con ítem nunca comprado → sin estimación, mostrado aparte.
7. Producto sin compras recientes → precio "antiguo"; no genera alertas.

### Testing

| Capa | Herramienta | Foco | Prioridad |
|---|---|---|---|
| Lógica de negocio pura | Vitest | precio estimado, normalización unidades, redondeo, promo, fuzzy | Alta (80%+) |
| Diccionario | Vitest | abreviaturas, precio-por-unidad, matching capas 1-2 | Alta |
| Parser DIAN | Vitest | XMLs reales → ParseResult | Alta |
| AIProvider | Vitest + mocks | shape esperado + errores (429/timeout/JSON malo) | Alta |
| RLS | Vitest + Supabase test | aislamiento entre hogares | 100% policies |
| Repositorios | Vitest + Postgres | historial de precios, agregación por tienda | Media |
| E2E mobile | Detox/Maestro | escanear→confirmar→guardar; lista→estimación | Happy paths |

Reglas: dominio en módulos puros TS; providers mockeados con fixtures de respuestas reales; **TDD** para toda la lógica de dominio (redondeo, recencia, precio-por-unidad, matching).

### Observabilidad

- Logging local estructurado (dev).
- Sentry free tier (5K/mes) desde el inicio.
- **Métrica clave: tasa de auto-resolución del diccionario** (% ítems resueltos en Capa 1 sin intervención) — indicador de salud del producto, instrumentado desde día 1.

---

## 7. Estrategia del diccionario de productos

### Problema

Un producto aparece distinto en cada recibo (`LCH DESLAC ALPINA 1100ML` / `Leche deslactosada bolsa` / `ALPINA DESLACTOSADA X1.1L`). El diccionario colapsa esas cadenas en un `canonical_product` para que predicción y comparación funcionen.

### 3 capas de matching (cascada al escanear)

```
raw_name
 → [Capa 1] Match exacto de alias (confianza 1.0, sin intervención)
 → [Capa 2] Fuzzy (pg_trgm + normalización: mayúsculas, sin tildes,
            expandir abreviaturas). Similitud >0.6 → sugerir, requiere confirmar
 → [Capa 3] Semántico con IA — en el MISMO llamado de parseo; el prompt incluye
            la lista de canonical_products del hogar. Requiere confirmar
 → [Sin match] proponer crear canonical (IA pre-llena name/brand/presentation/
            unit/unit_quantity/category)
```

La Capa 3 no es un llamado extra: un solo llamado a la IA hace OCR + estructura + matching semántico.

### Tabla de abreviaturas (seed curado, NO crowdsourced)

`seed_abbreviations.json` estático con la app (`LCH→LECHE`, `DESLAC→DESLACTOSADA`, `ACEIT→ACEITE`, etc.). Mantenido por el equipo, no por usuarios.

### Normalización de unidades (evita comparaciones engañosas)

Cada canonical tiene `unit` + `unit_quantity` → permite **precio por unidad estándar**:

```
Leche 1L $5.000 → $5.000/L
Leche 900ml $4.800 → $5.333/L  (en realidad más cara)
```

Líquidos→litros, sólidos→kg, unidades→por unidad. La IA sugiere `unit`/`unit_quantity` desde el nombre. Comparación y alertas SIEMPRE sobre precio-por-unidad.

### Ciclo de aprendizaje

Cada confirmación del usuario inserta un `product_alias` (`source='user_confirmed'`, confianza 1.0). La próxima aparición del mismo string se auto-resuelve en Capa 1. Con el tiempo, los recibos de tiendas habituales se auto-resuelven casi siempre.

### Cold start

Primeras 2-3 semanas casi todo requiere confirmación. Mitigaciones: onboarding con expectativa clara, batch confirmation por categoría, **no** precargar catálogo nacional (sería crowdsourcing con datos sucios). El diccionario crece orgánicamente.

### Misma marca, distinta presentación = distinto canonical

"Leche Alpina 1L" y "Leche Alpina 1.1L" son canónicos distintos, agrupados visualmente; el precio-por-unidad los hace comparables. Evita ambigüedad de "¿es la misma o no?".

### Límite de contexto en Capa 3

Si un hogar tiene muchos productos, limitar el contexto pasado a la IA a las categorías relevantes / más frecuentes para no inflar el prompt.

---

## 8. Roadmap de construcción (6-8 meses)

Un solo empuje, sin releases públicos intermedios; cada hito es entregable y testeable internamente.

### Hito 0 — Fundaciones (sem. 1-3)
Monorepo (Expo + `core`/`db`/`validations`); Supabase (Auth, schema, RLS, índices); Drizzle espejo mobile/backend; CI (typecheck+lint+test).
**Entregable:** app arranca, login, DB completa con RLS testeado.

### Hito 1 — Captura manual y gastos (sem. 4-5)
Gasto manual; factura manual completa (sin IA); dashboard mensual por categoría.
**Entregable:** registrar gastos a mano y ver el mes. Valida el modelo antes de IA. TDD de agregados.

### Hito 2 — Diccionario de productos (sem. 6-9)
Seed de abreviaturas; Capa 1 + Capa 2 de matching; normalización de unidades + precio-por-unidad; CRUD canonical/aliases; UI de confirmación/creación.
**Entregable:** corazón del producto, testeado sin IA. **TDD intensivo.**

### Hito 3 — AIProvider y escaneo (sem. 10-14)
Interfaz `AIProvider` + Gemini/Claude/OpenAI; prompt de parseo + matching semántico (Capa 3); detección de descuentos; flujo cámara→IA→confirmación→guardado; onboarding de API key; manejo de errores de IA.
**Entregable:** escaneo real con key propia ("momento mágico").

### Hito 4 — PaddleOCR on-device (sem. 15-19)
Exportar PaddleOCR a ONNX; integrar ONNX Runtime RN; pipeline on-device; modo "sin API key".
**Entregable:** escaneo offline sin proveedor externo. **El más riesgoso; candidato a recortar.**

### Hito 5 — Listas inteligentes y predicción (sem. 20-23)
CRUD listas; autocomplete; motor de estimación (recencia, confianza); indicadores de cambio (↑+12%/↓-8%).
**Entregable:** promesa de Previsibilidad. TDD del motor.

### Hito 6 — Comparación de tiendas y alertas (sem. 24-27)
Comparación por tienda (best-case + one-shop); recomendación; motor de alertas (umbral configurable); push locales.
**Entregable:** promesa de Ahorro. Tríada completa.

### Hito 7 — DIAN, hogar compartido, pulido (sem. 28-32)
Parser DIAN (Edge Function); invitación a hogar + Realtime; detección de duplicados; Sentry + telemetría de auto-resolución; pulido UX y errores end-to-end.
**Entregable:** v1 completa.

### Camino crítico y riesgos

```
Hitos 0→1→2→3 secuenciales.
Hito 4 (PaddleOCR) paralelizable/pospone — NO bloquea 5/6.
Hitos 5/6 dependen de 2/3. Hito 7 es pulido.
```

1. **Hito 4 (PaddleOCR on-device)** — el más incierto. Plan B: si excede 2 semanas sobre lo estimado, posponer a post-v1; v1 requeriría API key.
2. **Calidad del matching (Hito 2)** — si la auto-resolución no sube, el valor se erosiona. Mitigación: TDD + fixtures de recibos reales pronto.
3. **Free tier de Gemini** — si cambia, multi-proveedor + PaddleOCR cubren.

---

## 9. Resumen de decisiones abiertas (para fases futuras, fuera de v1)

- Modelo de monetización concreto (freemium, límites) — sin definir; BYOK lo hace innecesario para v1.
- Publicación en App Store / Play Store (costos $99/$25) — pospuesto; v1 es sideload/uso propio.
- Migración de hosting si crece la base de usuarios — solo cuando free tiers se queden cortos.
