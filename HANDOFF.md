# HANDOFF — Continuar el roadmap, próximo Hito 3

> Documento de traspaso para sesión nueva (la anterior cerró el Hito 2 y se acercó al límite de contexto).
> **Primer mensaje sugerido:** "Lee HANDOFF.md y continúa."

## Estado actual

- **Rama:** `master` en `f216908` (Merge Hito 2). Working tree clean.
- **Hitos completos en master:** 0a, 0b, 0c, 1a, 1b, 2.
- **PRs cerrados en esta sesión:** #4 (Hito 2), #5 (chore tsconfig mobile noUncheckedIndexedAccess).

## Próximo hito según roadmap

**Hito 3 — AIProvider + escaneo** (spec sección 8 de `docs/superpowers/specs/2026-06-03-oraculo-de-compras-design.md`):
- Interfaz `AIProvider` (TS puro) + implementaciones: Gemini (default) / Claude / OpenAI Vision.
- BYOK: API keys en `expo-secure-store` (mobile). Onboarding wizard.
- Prompt de parseo de factura + matching semántico Capa 3 (en el mismo llamado: el prompt incluye los `canonical_products` del hogar).
- Detección de descuentos (`regular_price` vs `unit_price`, `is_promo=true`).
- Flujo cámara → IA → confirmación → guardado (reusa `ProductPicker` + `create_receipt_with_items` v2 del Hito 2).
- Manejo de errores IA (429, timeout, JSON malformado, key inválida — siempre vía manual disponible).
- **Entregable:** escaneo real con key propia ("momento mágico").

### Antes de codear, brainstormear el alcance del Hito 3
Hay decisiones de producto que pedir (2–4 preguntas concretas):
1. **Onboarding de API key:** wizard separado al primer login o difer-able hasta el primer "Escanear"?
2. **Modelo de captura de cámara:** `expo-camera` directo, o pegar/subir imagen desde galería en v1 (más simple para iterar)?
3. **Provider único o multi en v1 mobile:** solo Gemini default + estructura abstracta lista para más, o ya implementar los 3 (Gemini/Claude/OpenAI) y selector?
4. **Confirmación post-parse:** pantalla nueva tipo wizard, o reutilizar `receipt/new.tsx` pre-llenado por la IA?

## Metodología (NO cambiar)

Mismo flujo que Hitos 1b y 2:
1. **`superpowers:brainstorming`** — 2-4 preguntas de producto con tu recomendación. Escribe spec en `docs/superpowers/specs/AAAA-MM-DD-hito-3-aiprovider-design.md` y commitea.
2. **`superpowers:writing-plans`** — plan TDD task-by-task en `docs/superpowers/plans/`.
3. **`superpowers:subagent-driven-development`** — un implementer por Task Group + doble review (spec + calidad) por grupo. Aplica fixes del review antes de avanzar.
4. **`superpowers:finishing-a-development-branch`** — verifica, push, PR (compare URL via `Start-Process` en PowerShell; `gh` está instalado pero sin auth web — usa la URL), espera CI, merge, cleanup local+remoto.

**Trailer de commits:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Convenciones y gotchas críticos (NO re-descubrir)

- Node 20.20.2 (Volta), pnpm 10.34.1. TS strict + `noUncheckedIndexedAccess` (ahora también en mobile). `any` PROHIBIDO. ESLint flat.
- **Money**: BigInt punto-fijo escala 4 en `@oraculo/core/money.ts`. PostgREST devuelve NUMERIC como JSON number → helpers aceptan `string | number`.
- **Validación**: Zod en `@oraculo/validations`. Shared helpers en `packages/validations/src/shared.ts` (no exportar al barrel).
- **Diccionario (Hito 2 ya en master):**
  - `@oraculo/core` exporta `normalizeName(raw)`, `pricePerStandardUnit({unit, unitQuantity, quantity, totalPrice})`, `ABBREVIATIONS`, `StandardUnit = "lt"|"kg"|"un"`.
  - RPC `match_product(p_household_id, p_normalized, p_min_similarity=0.6)` returns `{exact: candidate|null, fuzzy: candidate[]}`.
  - RPC `create_receipt_with_items` v2 acepta `canonical_product_id` y `alias_normalized` por ítem; valida cross-household; persiste alias con `ON CONFLICT DO NOTHING`. CHECK `alias_normalized <> ''`.
  - Hito 3 debe normalizar `raw_name` con `normalizeName` antes de mandarlo al RPC (servicio mobile `services/match.ts` ya lo hace).
- **DB**: Supabase local (Docker Desktop). `pnpm db:start`. Estado: `cd packages/db && pnpm exec supabase status`. Migraciones append-only (próxima: `0013_...`). Aplicar localmente: `docker exec -i supabase_db_db psql -U postgres -d postgres < <file>`.
- **Mobile**:
  - Expo SDK 51 + Expo Router v3. `apps/mobile/.env.local` (gitignored) con `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` + `EXPO_PUBLIC_SUPABASE_ANON_KEY=<from supabase status>`.
  - Expo a veces borra `apps/mobile/expo-env.d.ts`. Si `git status` lo muestra deleted → `git checkout -- apps/mobile/expo-env.d.ts`.
  - `Alert.alert` no funciona con callbacks en RN-Web. Usar `window.confirm` si `Platform.OS === "web"`. Ver `apps/mobile/app/(app)/(tabs)/index.tsx` para el patrón.
  - El cliente Supabase mobile NO usa types generados (`createClient` sin generic `Database`). Si en Hito 3 hace falta tipo fuerte de RPCs, generar tipos es un side-task — no scope-creep.
- **Anti-doble-conteo**: total mensual = `Σ(receipt_items.total_price) + Σ(manual_expenses.amount)`. NUNCA `receipts.total`.
- **CI**: GitHub Actions jobs `quality` + `db`. `origin = git@github.com:JohanDGA/OracleShop.git`. PR por la web (gh instalado pero sin auth interactiva).

## Tareas que quedaron flagueadas (no urgentes)

- **Issue I-3 del review de Group D Hito 2:** `receipt_items.unit` se inserta como `null` aunque el ítem esté linkeado a un canonical con `unit ∈ {lt,kg,un}`. Para Hito 5 (predicción/precio por unidad) habrá que decidir si poblar este campo desde el canonical o JOIN siempre. No urgente todavía.
- **Issue I-4 del review de Group D:** servicios mobile castean response de Supabase con `as string` por falta de types generados. Para fortificar, ejecutar `supabase gen types typescript` y threadear `Database` generic. Side-task no bloqueante.

## Métricas actuales (master, post-Hito 2)

- `@oraculo/core`: 38 tests
- `@oraculo/validations`: 25 tests
- `@oraculo/db`: 23 tests
- Total: **86 tests**, typecheck 4/4 verde, lint verde, bundle web compila.

---

*Última actualización: cierre del Hito 2.*
