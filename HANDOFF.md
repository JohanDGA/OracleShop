# HANDOFF — Hito 1b (UI captura + dashboard)

> Documento de traspaso para continuar en una sesión nueva (la anterior se acercó al límite de contexto).
> **Primer mensaje sugerido en la sesión nueva:** "Lee `HANDOFF.md` y continúa el Hito 1b."

## Dónde estamos

- **Proyecto:** Oráculo de Compras (monorepo pnpm). App de inteligencia de compras / finanzas personales, Colombia, mobile-first.
- **Rama activa:** `hito-1b-ui-captura-y-dashboard` (pusheada a `origin`). `master` tiene Hitos 0a/0b/0c/1a.
- **Plan en ejecución:** `docs/superpowers/plans/2026-06-08-hito-1b-ui-captura-y-dashboard.md`
- **Spec del módulo:** `docs/superpowers/specs/2026-06-07-hito-1-captura-y-dashboard-design.md`
- **Método:** subagent-driven-development (implementar → revisar spec → revisar calidad). Cerrar con `superpowers:finishing-a-development-branch`.

## Qué está HECHO (rama 1b, todo commiteado + revisado APPROVED)

Grupos A–H del plan 1b, todos verdes en typecheck (4 paquetes) · lint · tests (core 21, validations 16, db 12) · **bundle web compila**:
- **A** `@oraculo/core`: `monthRange`/`shiftMonth` (TDD).
- **B** servicios mobile: `lib/dates.ts`, `services/{categories,stores,expenses,receipts,summary}.ts` (+ dep `@oraculo/core`).
- **C** navegación: `app/(app)/_layout.tsx` (Stack) + `app/(app)/(tabs)/{_layout,index,dashboard,profile}.tsx`; el home viejo se movió a Perfil; `app/(app)/index.tsx` eliminado.
- **D** `components/CategoryPicker.tsx` (crear categoría inline).
- **E** `app/(app)/expense/new.tsx` (gasto rápido).
- **G** `app/(app)/receipt/new.tsx` (factura manual vía RPC).
- **F** `app/(app)/(tabs)/index.tsx` (lista del mes + soft-delete + botones captura).
- **H** `app/(app)/(tabs)/dashboard.tsx` (total + barras por categoría + selector de mes).

### Bug de E2E ya corregido
- **Crash `amount.trim is not a function`** al listar gastos → arreglado en `6df8240`: `money.ts` (`toMinorUnits`/`sumAmounts`/`formatCOP`) ahora acepta `string | number` y coerce con `String()`, porque **PostgREST devuelve columnas `NUMERIC` como JSON number**, no string. Test de regresión añadido.

## Qué FALTA (Grupo I del plan)

1. **Re-correr el E2E** (el crash bloqueante ya está arreglado; el usuario no pudo probar más allá). Levantar:
   ```bash
   pnpm --filter @oraculo/mobile exec expo start --web -c
   ```
   Probar en `localhost:8081`: + Gasto, + Factura (varios ítems), crear categoría inline, Dashboard (barras + selector mes), long-press para eliminar, Perfil/cerrar sesión.
   - **Ojo:** pueden aparecer MÁS bugs no vistos (la sesión anterior solo detectó el crash de `money`). Si un campo `NUMERIC` se compara/usa como string en alguna otra parte (p.ej. en una resta/orden), aplicar el mismo patrón de coerción.
2. **Cerrar la rama** (`superpowers:finishing-a-development-branch`):
   - Re-verificar: `pnpm typecheck && pnpm lint && pnpm --filter @oraculo/core test && pnpm --filter @oraculo/validations test && pnpm --filter @oraculo/db test`.
   - PR ya posible: `https://github.com/JohanDGA/OracleShop/compare/master...hito-1b-ui-captura-y-dashboard` → crear PR → esperar CI verde (jobs `quality` + `db`) → merge a `master` → borrar rama (local + remota).

## Gotchas críticos (no re-descubrir)

- **Entorno:** Node 20.20.2 (Volta), pnpm 10.34.1. `pnpm lint` = `eslint .` (flat config, prohíbe `any`; `no-undef` off). Strict TS con `noUncheckedIndexedAccess` (de ahí los `as` en servicios y el `?? ""` en destructuring).
- **Supabase local (Docker):** arrancar con `pnpm db:start` (Docker Desktop debe estar corriendo). Estado: `cd packages/db && pnpm exec supabase status`. Reset: `pnpm db:reset` (en este host el reset a veces termina con un **502 cosmético** DESPUÉS de aplicar las migraciones — juzgar por las líneas "Applying migration", no por el exit code). Requiere `packages/db/.env` con credenciales Google (ya existe, gitignored) por el provider `[auth.external.google]` en `config.toml`.
- **App mobile:** `apps/mobile/.env.local` (gitignored, ya existe) con `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY`. Al correr Expo a veces **borra `expo-env.d.ts` y reescribe `tsconfig.json`**: si typecheck falla por eso, recrear `apps/mobile/expo-env.d.ts` con `/// <reference types="expo/types" />`. Verificar con `git status` y restaurar (`git checkout -- apps/mobile/expo-env.d.ts`).
- **Monorepo + Expo:** `.npmrc` tiene `node-linker=hoisted` (requisito de Metro). `apps/mobile/metro.config.js` observa la raíz del workspace y stubea `@opentelemetry/api` (supabase-js).
- **Verificación de UI:** no hay tests unitarios de RN; el chequeo automático fuerte es `cd apps/mobile && EXPO_PUBLIC_SUPABASE_URL=... EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy pnpm exec expo export --platform web` (limpiar `dist`/`.expo` después). Lo demás es E2E manual.
- **DB / RPC:** la factura manual se crea con la RPC `create_receipt_with_items` (atómica, `security invoker`, migración `0007`). El bootstrap de hogar lo hace el trigger `handle_new_user` (migración `0005`). RLS por hogar en todas las tablas.
- **Git/remoto:** `origin = git@github.com:JohanDGA/OracleShop.git`, SSH ya configurado (llave en `~/.ssh/id_ed25519`). `master` es la rama default. `gh` NO está instalado → el PR se abre por la web.
- **Notas de calidad pendientes (menores, no bloqueantes; del review de UI):** en `receipt/new.tsx` se guarda `unit_price = total_price` por línea (aceptable: el form captura un total por línea); `key={index}` en la lista de ítems; el `stores` picker existe pero el form usa `storeId: null` (tienda diferida).

## Regla de negocio clave (no romper)
**Anti-doble-conteo del total mensual:** el dashboard agrega vía `receipt_items.total_price` + `manual_expenses.amount` (NUNCA `receipts.total`). La lista muestra `receipts.total` solo como fila de display. Mantener esa separación.
