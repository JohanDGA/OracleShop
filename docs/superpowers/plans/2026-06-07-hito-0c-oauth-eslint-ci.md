# Hito 0c — Google OAuth, ESLint y CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir calidad y pipeline al monorepo (ESLint compartido + CI en GitHub Actions contra el remoto), mover el bootstrap de hogar a un trigger de base de datos (server-side, atómico, uniforme para email y OAuth), e implementar inicio de sesión con Google (OAuth) verificable en Expo Web.

**Architecture:** Sobre el monorepo de 0a/0b. ESLint flat config compartido en la raíz (`pnpm lint` = `eslint .`). CI con dos jobs: `quality` (install + typecheck + lint + tests de validations) y `db` (levanta Supabase local en el runner y corre los tests RLS). El bootstrap del primer hogar pasa de la pantalla de registro a un trigger `AFTER INSERT ON auth.users` (SECURITY DEFINER). Google OAuth usa `supabase.auth.signInWithOAuth` (flujo PKCE) + `expo-web-browser`/`expo-auth-session` para abrir y capturar el redirect; el proveedor Google se configura en `config.toml` con credenciales por variables de entorno.

**Tech Stack:** ESLint 9 (flat config) + typescript-eslint, GitHub Actions, Supabase Auth external provider (Google), expo-web-browser, expo-auth-session, PKCE.

**Prerequisitos del usuario (manuales):**
- Repo `git@github.com:JohanDGA/OracleShop.git` ya existe y SSH funciona. ✅ (confirmado)
- Credenciales de Google Cloud OAuth (Client ID + Secret de un "OAuth 2.0 Client ID" tipo Web). ✅ (confirmado) — se configuran en Task Group D.

**Out of scope (Hito 1+):** `packages/core`, `expo-sqlite`/Drizzle local, Core API (Express/tRPC), módulos de producto (escaneo, listas, etc.).

---

## File Structure

```
oraculo de compras/
├── eslint.config.js                         # NUEVO: flat config raíz (typescript-eslint)
├── package.json                             # MOD: script lint + devDeps eslint
├── .github/
│   └── workflows/
│       └── ci.yml                           # NUEVO: jobs quality + db
├── packages/db/
│   ├── .env.example                         # NUEVO: vars Google OAuth para supabase local
│   └── supabase/
│       ├── config.toml                      # MOD: [auth.external.google]
│       └── migrations/
│           └── 0005_new_user_bootstrap.sql  # NUEVO: trigger de hogar en auth.users
├── apps/mobile/
│   ├── package.json                         # MOD: expo-web-browser, expo-auth-session
│   ├── lib/
│   │   └── auth-google.ts                    # NUEVO: signInWithGoogle()
│   ├── services/household.ts                 # MOD: quitar bootstrap (lo hace el trigger)
│   └── app/(auth)/
│       ├── sign-in.tsx                       # MOD: botón Google
│       └── sign-up.tsx                        # MOD: botón Google + quitar bootstrap manual
```

---

## Task Group A — ESLint compartido

### Task A1: Crear rama y configurar ESLint

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (root)

- [ ] **Step 1: Crear rama**

Run (desde la raíz):
```bash
git checkout master
git checkout -b hito-0c-oauth-eslint-ci
```
Expected: "Switched to a new branch 'hito-0c-oauth-eslint-ci'".

- [ ] **Step 2: Instalar dependencias de ESLint en la raíz**

Run:
```bash
pnpm add -w -D eslint@^9.9.0 typescript-eslint@^8.0.0 @eslint/js@^9.9.0 globals@^15.9.0
```
Expected: añade esas devDeps al `package.json` raíz, sin error.

- [ ] **Step 3: Crear `eslint.config.js` (flat config)**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    // No lintar artefactos ni generados
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.turbo/**",
      "**/.expo/**",
      "**/web-build/**",
      "packages/db/supabase/**",
      "**/*.config.js",
      "**/babel.config.js",
      "**/metro.config.js",
      "**/expo-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // El proyecto prohíbe `any`
      "@typescript-eslint/no-explicit-any": "error",
      // Permitir variables sin usar con prefijo _
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // TypeScript ya valida símbolos no definidos; el core no-undef da
      // falsos positivos con tipos/JSX (recomendación de typescript-eslint).
      "no-undef": "off",
    },
  },
);
```

- [ ] **Step 4: Añadir el script `lint` a `package.json` raíz**

Cambia la línea del script `lint` (de 0a era `"lint": "turbo run lint"`) por:
```json
    "lint": "eslint .",
```
(Mantén el resto de scripts igual.)

- [ ] **Step 5: Correr lint y CORREGIR lo que aparezca**

Run:
```bash
pnpm lint
```
Expected (probable): ESLint reporta algunos errores. Corrígelos en el código fuente (NO desactives reglas salvo que sea claramente correcto). Violaciones esperadas y su arreglo:
- **`no-undef` para `process`/`module`/`require`** en archivos node: ya están cubiertos por `globals.node` y los `ignores` de `*.config.js`. Si aparece en `lib/env.ts` (usa `process.env`), está OK porque `globals.node` lo define.
- **`@typescript-eslint/no-unused-vars`**: elimina imports/variables no usados.
- Si una regla recommended es ruidosa y claramente no aplica (p.ej. `no-empty` en un catch intencional), desactívala puntualmente con un comentario `// eslint-disable-next-line` justificado, no globalmente.

Vuelve a correr `pnpm lint` hasta que salga limpio (exit 0, sin output de errores).

- [ ] **Step 6: Verificar que typecheck sigue OK**

Run:
```bash
pnpm typecheck
```
Expected: 3 packages PASS.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.js package.json pnpm-lock.yaml
git commit -m "chore: add shared eslint flat config and lint script"
```
(Si corregiste archivos de código por lint, inclúyelos en un commit aparte: `git add <archivos> && git commit -m "style: fix eslint violations"`.)

---

## Task Group B — Remoto Git + CI en GitHub Actions

### Task B1: Conectar el remoto y crear el workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Conectar el remoto (si no está)**

Run (desde la raíz):
```bash
git remote -v
```
Si no aparece `origin`, agrégalo:
```bash
git remote add origin git@github.com:JohanDGA/OracleShop.git
git remote -v
```
Expected: muestra `origin  git@github.com:JohanDGA/OracleShop.git (fetch/push)`.

- [ ] **Step 2: Crear `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  quality:
    name: Typecheck · Lint · Unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.34.1
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm --filter @oraculo/validations test

  db:
    name: Supabase RLS tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.34.1
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Start Supabase local
        # El proveedor Google en config.toml lee credenciales por env(). En CI no
        # se prueba OAuth, pero los valores deben existir para que `supabase start`
        # no falle al resolver las variables.
        env:
          SUPABASE_AUTH_GOOGLE_CLIENT_ID: ci-dummy
          SUPABASE_AUTH_GOOGLE_SECRET: ci-dummy
        run: pnpm --filter @oraculo/db exec supabase start
      - name: Run RLS tests
        run: pnpm --filter @oraculo/db test
      - name: Stop Supabase local
        if: always()
        run: pnpm --filter @oraculo/db exec supabase stop
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (quality + supabase RLS tests)"
```

- [ ] **Step 4: Publicar la rama y abrir PR para que CI corra**

Run:
```bash
git push -u origin hito-0c-oauth-eslint-ci
```
Expected: sube la rama. Luego abre un PR (o deja que el push dispare el workflow vía `pull_request`):
```bash
gh pr create --fill --base master --head hito-0c-oauth-eslint-ci
```
Si `gh` no está autenticado, créalo manualmente en GitHub. El push a la rama + el PR disparan el workflow.

- [ ] **Step 5: Verificar el run de CI**

Run (espera a que termine):
```bash
gh run watch --exit-status
```
o revisa la pestaña Actions del repo. Expected: ambos jobs (`quality` y `db`) en **verde**. Si `db` falla por el arranque de Supabase, lee el log: el problema más común es el pull de imágenes (reintentar) o el contenedor `analytics` (ya desactivado en `config.toml`). Si `quality` falla por lint/typecheck, corrige y vuelve a pushear.

> NOTA: este Task Group requiere acción del usuario (autenticación de `gh`/GitHub, revisar el run). El agente puede ejecutar los comandos git/gh pero el usuario debe tener credenciales listas.

---

## Task Group C — Trigger de bootstrap de hogar (server-side)

### Task C1: Migración del trigger en auth.users

**Files:**
- Create: `packages/db/supabase/migrations/0005_new_user_bootstrap.sql`

> Mueve la creación de hogar+membresía+settings al servidor, atómica y uniforme para email y OAuth. SECURITY DEFINER para insertar sin chocar con RLS.

- [ ] **Step 1: Crear `packages/db/supabase/migrations/0005_new_user_bootstrap.sql`**

```sql
-- Bootstrap del primer hogar al crear un usuario (email o OAuth).
-- Server-side y atómico: evita la condición de carrera y el estado huérfano del
-- bootstrap en cliente. SECURITY DEFINER para saltar RLS en las inserciones.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  local_part text := split_part(coalesce(new.email, 'usuario'), '@', 1);
begin
  insert into public.households (name, created_by)
    values ('Hogar de ' || local_part, new.id)
    returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
    values (new_household_id, new.id, 'owner');

  insert into public.user_settings (user_id, active_household_id)
    values (new.id, new_household_id);

  return new;
end;
$$;

-- El trigger vive en auth.users (creado por GoTrue). Lo (re)creamos idempotente.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Aplicar y verificar que email signUp crea el hogar SIN bootstrap del cliente**

Run (desde `packages/db`):
```bash
cd packages/db
pnpm exec supabase db reset
```
Expected: aplica 0001–0005 (incluido el trigger).

Verifica el bootstrap automático con un signup directo (reemplaza `<ANON>` por el ANON_KEY de `pnpm exec supabase status`):
```bash
cd packages/db
node --input-type=module -e "
import { execSync } from 'node:child_process';
const st = JSON.parse(execSync('pnpm exec supabase status -o json',{encoding:'utf8'}));
const email='trig_'+Date.now()+'@test.local';
const su = await (await fetch(st.API_URL+'/auth/v1/signup',{method:'POST',headers:{apikey:st.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password:'Password1'})})).json();
const h = await (await fetch(st.API_URL+'/rest/v1/households?select=id,name',{headers:{apikey:st.ANON_KEY,Authorization:'Bearer '+su.access_token}})).json();
console.log('hogar tras signup (sin bootstrap cliente):', JSON.stringify(h));
"
```
Expected: imprime un array con un hogar `"Hogar de trig_..."` — creado por el trigger, no por el cliente.

- [ ] **Step 3: Confirmar que los tests RLS del 0a siguen verdes**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/db test
```
Expected: **8 passed**. (El trigger no afecta el aislamiento; los tests siembran con service_role.)

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/arias/Downloads/oraculo de compras"
git add packages/db/supabase/migrations/0005_new_user_bootstrap.sql
git commit -m "feat(db): bootstrap household via trigger on auth.users insert"
```

### Task C2: Quitar el bootstrap del cliente

**Files:**
- Modify: `apps/mobile/services/household.ts`
- Modify: `apps/mobile/app/(auth)/sign-up.tsx`

- [ ] **Step 1: Eliminar `bootstrapHousehold` de `services/household.ts`**

Reemplaza TODO el contenido de `apps/mobile/services/household.ts` por (solo queda la lectura; el trigger crea el hogar):
```typescript
import { supabase } from "../lib/supabase";

export interface Household {
  id: string;
  name: string;
}

/**
 * Devuelve el primer hogar visible para el usuario (RLS solo muestra los suyos).
 * El hogar lo crea el trigger handle_new_user al registrarse (email u OAuth).
 */
export async function getActiveHousehold(): Promise<Household | null> {
  const { data, error } = await supabase
    .from("households")
    .select("id, name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer el hogar: ${error.message}`);
  }
  return data ?? null;
}
```

- [ ] **Step 2: Quitar la llamada a `bootstrapHousehold` en `sign-up.tsx`**

En `apps/mobile/app/(auth)/sign-up.tsx`, elimina el import de `bootstrapHousehold` y reemplaza el cuerpo del `try` del `onSubmit` por (ya no se crea el hogar en el cliente):
```typescript
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signUp(parsed.data);
      if (signErr) {
        setError(signErr.message);
        return;
      }
      // El trigger handle_new_user crea el hogar; el gate redirige a (app)
      // cuando onAuthStateChange detecta la sesión.
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
```
Elimina la línea `import { bootstrapHousehold } from "../../services/household";` (ya no se usa).

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS (sin imports sin usar).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/services/household.ts "apps/mobile/app/(auth)/sign-up.tsx"
git commit -m "refactor(mobile): drop client-side bootstrap; trigger owns it now"
```

---

## Task Group D — Google OAuth

### Task D1: Configurar el proveedor Google en Supabase local

**Files:**
- Create: `packages/db/.env.example`
- Modify: `packages/db/supabase/config.toml`

> PRERREQUISITO MANUAL (usuario): en Google Cloud Console → APIs & Services → Credentials → crea/usa un "OAuth 2.0 Client ID" tipo **Web application**. En "Authorized redirect URIs" agrega: `http://127.0.0.1:54321/auth/v1/callback`. Copia el Client ID y el Client Secret.

- [ ] **Step 1: Crear `packages/db/.env.example`**

```
# Credenciales de Google OAuth para Supabase LOCAL.
# Copia a packages/db/.env (gitignored) y rellena con tus valores de Google Cloud.
SUPABASE_AUTH_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_GOOGLE_SECRET=
```

- [ ] **Step 2: Añadir el proveedor Google a `config.toml`**

En `packages/db/supabase/config.toml`, agrega al final del archivo (o junto a otras secciones `[auth...]`):
```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
skip_nonce_check = true
```
(`skip_nonce_check = true` evita problemas de nonce en el flujo local de Expo Web.)

- [ ] **Step 3: Crear `packages/db/.env` con tus credenciales (usuario) y reiniciar**

> Acción del usuario: crea `packages/db/.env` (gitignored) copiando `.env.example` y pegando tu Client ID y Secret reales.

Run (desde `packages/db`):
```bash
cd packages/db
pnpm exec supabase stop
pnpm exec supabase start
```
Expected: arranca leyendo las variables del `.env`. Verifica que el proveedor está activo:
```bash
curl -s "http://127.0.0.1:54321/auth/v1/settings" -H "apikey: $(pnpm exec supabase status -o json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).ANON_KEY))")" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('google external?', j.external && j.external.google)})"
```
Expected: `google external? true`.

- [ ] **Step 4: Asegurar que `packages/db/.env` está gitignored**

Run (desde la raíz):
```bash
git check-ignore packages/db/.env && echo "ignored OK"
```
Expected: imprime la ruta + "ignored OK" (el `.gitignore` ya tiene `.env`). Si NO está ignorado, añade `packages/db/.env` al `.gitignore`.

- [ ] **Step 5: Commit (solo el ejemplo y la config, NUNCA el .env real)**

```bash
cd "C:/Users/arias/Downloads/oraculo de compras"
git add packages/db/.env.example packages/db/supabase/config.toml
git status --short  # confirma que packages/db/.env NO aparece
git commit -m "chore(db): configure google oauth provider for local supabase"
```

### Task D2: Botón de Google en la app

**Files:**
- Modify: `apps/mobile/package.json`
- Modify: `apps/mobile/lib/supabase.ts`
- Create: `apps/mobile/lib/auth-google.ts`
- Modify: `apps/mobile/app/(auth)/sign-in.tsx`
- Modify: `apps/mobile/app/(auth)/sign-up.tsx`

- [ ] **Step 1: Instalar dependencias de OAuth**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/mobile exec expo install expo-web-browser expo-auth-session
```
Expected: añade `expo-web-browser` y `expo-auth-session` con versiones compatibles con Expo SDK 51.

- [ ] **Step 1b: Activar el flujo PKCE en el cliente Supabase**

`exchangeCodeForSession` (que usa el helper de Google) requiere `flowType: "pkce"`.
En `apps/mobile/lib/supabase.ts`, dentro de las opciones `auth: { ... }`, añade `flowType: "pkce",` (junto a `storage`, `autoRefreshToken`, etc.). El bloque `auth` debe quedar:
```typescript
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
```

- [ ] **Step 2: Crear `apps/mobile/lib/auth-google.ts`**

```typescript
import { makeRedirectUri } from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

/**
 * Inicia sesión con Google vía Supabase (flujo PKCE). Funciona en Expo Web y
 * nativo: abre el navegador, captura el redirect y canjea el `code` por sesión.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  if (!data.url) throw new Error("No se obtuvo URL de autorización de Google");

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") {
    // El usuario canceló o cerró el navegador.
    return;
  }

  const url = new URL(result.url);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("Redirect de Google sin 'code'");

  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) throw new Error(exchangeErr.message);
  // El gate redirige a (app) cuando onAuthStateChange detecta la sesión.
}
```

- [ ] **Step 3: Añadir el botón en `sign-in.tsx`**

En `apps/mobile/app/(auth)/sign-in.tsx`, agrega el import y un botón "Continuar con Google" debajo del botón "Entrar". Import:
```typescript
import { signInWithGoogle } from "../../lib/auth-google";
```
Añade un handler dentro del componente:
```typescript
  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error con Google");
    } finally {
      setBusy(false);
    }
  }
```
Y el botón JSX justo después del `<Pressable>` de "Entrar":
```tsx
      <Pressable
        onPress={onGoogle}
        disabled={busy}
        style={{ borderWidth: 1, borderColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#111" }}>Continuar con Google</Text>
      </Pressable>
```

- [ ] **Step 4: Añadir el mismo botón en `sign-up.tsx`**

En `apps/mobile/app/(auth)/sign-up.tsx`, agrega el import `import { signInWithGoogle } from "../../lib/auth-google";`, el mismo handler `onGoogle` y el mismo `<Pressable>` "Continuar con Google" después del botón "Registrarme".

- [ ] **Step 5: Typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS.

- [ ] **Step 6: Lint**

Run:
```bash
pnpm lint
```
Expected: limpio (corrige si aparece algo).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/lib/supabase.ts apps/mobile/lib/auth-google.ts "apps/mobile/app/(auth)/sign-in.tsx" "apps/mobile/app/(auth)/sign-up.tsx" pnpm-lock.yaml
git commit -m "feat(mobile): sign in with Google via supabase OAuth (PKCE)"
```

---

## Task Group E — Verificación final y cierre

### Task E1: Verificación E2E (manual) de Google + email

**Files:** ninguno

> Requiere Supabase local corriendo (con tu `packages/db/.env` de Google) y acción humana.

- [ ] **Step 1: Levantar la app en web**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/mobile exec expo start --web -c
```

- [ ] **Step 2: Probar Google**

En el navegador: pulsa "Continuar con Google", completa el login de Google.
Expected: vuelve a la app autenticado y la Home muestra tu email de Google + "Hogar activo: Hogar de <tu-usuario>" (creado por el trigger).

- [ ] **Step 3: Probar que email/password sigue funcionando**

Cierra sesión, ve a "Regístrate", crea `demo0c@test.local` / `Password1`.
Expected: Home con "Hogar de demo0c" (creado por el trigger, ya sin bootstrap en cliente).

### Task E2: Verificación automatizada y cierre

**Files:** ninguno

- [ ] **Step 1: Suite completa**

Run (desde la raíz, Supabase local arriba):
```bash
pnpm typecheck
pnpm lint
pnpm --filter @oraculo/validations test
pnpm --filter @oraculo/db test
```
Expected: typecheck 3/3; lint limpio; validations 7/7; db 8/8.

- [ ] **Step 2: Confirmar git limpio y que ningún secreto se coló**

Run:
```bash
git status --short
git log --oneline master..HEAD
```
Expected: working tree limpio; `packages/db/.env` NO está trackeado.

- [ ] **Step 3: Confirmar CI verde en el PR**

Run:
```bash
gh run watch --exit-status
```
Expected: ambos jobs verdes en el último run.

- [ ] **Step 4: Cerrar la rama**

Usa `superpowers:finishing-a-development-branch` para fusionar a `master` (o mergear el PR), re-verificando tests sobre el resultado.

---

## Definition of Done (Hito 0c)

- [ ] `eslint.config.js` compartido; `pnpm lint` limpio en todo el monorepo.
- [ ] `.github/workflows/ci.yml` con jobs `quality` + `db`; CI **verde** en el PR contra el remoto.
- [ ] Trigger `handle_new_user` crea hogar+membresía+settings al registrarse (email y OAuth); bootstrap de cliente eliminado.
- [ ] Login con Google funciona en Expo Web (verificado E2E) y crea el hogar del usuario.
- [ ] Email/password sigue funcionando con el nuevo trigger.
- [ ] `pnpm typecheck` 3/3, `validations` 7/7, `db` RLS 8/8.
- [ ] Working tree limpio; `packages/db/.env` (secretos Google) NO commiteado.

**Diferido a Hito 1+:** `packages/core`, `expo-sqlite`/Drizzle local, Core API, módulos de producto.
