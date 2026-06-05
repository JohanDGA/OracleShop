# Hito 0b — App Mobile y Login (email/password) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tener una app Expo (React Native) que arranca, permite registro/inicio/cierre de sesión con email y contraseña contra Supabase, crea el hogar del usuario al registrarse (bootstrap) y muestra una pantalla "home" que lee el nombre del hogar a través de RLS — probando el stack mobile → Supabase de extremo a extremo.

**Architecture:** Monorepo pnpm (ya existente del Hito 0a). Se añade `packages/validations` (schemas Zod compartidos, con TDD) y `apps/mobile` (Expo Router v3). La app habla directamente con Supabase vía `@supabase/supabase-js` (aún no existe el Core API). La sesión se persiste con AsyncStorage; las API keys de IA NO se tocan aquí (van en `expo-secure-store` en un hito posterior). El registro crea `household` + `household_members` + `user_settings` usando exactamente la ruta RLS de bootstrap del creador implementada en 0a.

**Tech Stack:** Expo SDK 51, Expo Router v3, React Native 0.74, React 18.2, @supabase/supabase-js, @react-native-async-storage/async-storage, Zod, Vitest, TypeScript strict.

**Out of scope (van en planes posteriores):** Google OAuth + ESLint + CI → Plan 0c. `packages/core` (lógica pura) y `expo-sqlite`/Drizzle local → Hito 1 (sin uso todavía). Core API (Express/tRPC) → hito posterior.

---

## Prerrequisitos (estado al iniciar)
- Hito 0a está en `master`: monorepo pnpm + Turbo, `packages/db` con esquema + migraciones + RLS, Supabase local funcionando (`pnpm db:start`).
- Node 20.20.2 (Volta), pnpm 10.34.1, Docker, git disponibles. Trabaja en una rama nueva (no `master`).
- El stack Supabase local debe estar corriendo para las verificaciones: desde `packages/db`, `pnpm exec supabase start`.

---

## File Structure

Archivos creados/modificados (raíz: `C:\Users\arias\Downloads\oraculo de compras`):

```
oraculo de compras/
├── .npmrc                                  # NUEVO: node-linker=hoisted (requisito Expo+pnpm)
├── packages/
│   └── validations/
│       ├── package.json                    # @oraculo/validations
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── src/
│       │   ├── index.ts                    # re-exports
│       │   └── auth.ts                     # signUpSchema, signInSchema + tipos
│       └── tests/
│           └── auth.test.ts                # TDD de los schemas
├── apps/
│   └── mobile/
│       ├── package.json                    # expo app, name @oraculo/mobile
│       ├── app.json                        # config Expo (scheme, slug, plugins)
│       ├── babel.config.js                 # babel-preset-expo
│       ├── metro.config.js                 # monorepo watchFolders/nodeModulesPaths
│       ├── tsconfig.json                   # extiende expo/tsconfig.base + strict
│       ├── expo-env.d.ts                   # tipos generados por expo
│       ├── .env.example                    # EXPO_PUBLIC_SUPABASE_URL/ANON_KEY
│       ├── lib/
│       │   ├── env.ts                      # lee+valida EXPO_PUBLIC_* con zod
│       │   ├── supabase.ts                 # cliente supabase (AsyncStorage)
│       │   └── auth-context.tsx            # AuthProvider + useAuth (sesión)
│       ├── services/
│       │   └── household.ts                # bootstrapHousehold(), getActiveHousehold()
│       └── app/
│           ├── _layout.tsx                 # root: AuthProvider + gate de navegación
│           ├── (auth)/
│           │   ├── _layout.tsx             # stack de auth
│           │   ├── sign-in.tsx
│           │   └── sign-up.tsx
│           └── (app)/
│               ├── _layout.tsx             # stack autenticado
│               └── index.tsx               # home: email + hogar + cerrar sesión
└── packages/db/supabase/config.toml        # MOD: desactivar confirmación de email en local
```

Responsabilidad por archivo: `validations/src/auth.ts` solo define schemas; `lib/supabase.ts` solo construye el cliente; `lib/auth-context.tsx` solo gestiona estado de sesión; `services/household.ts` solo las operaciones de hogar; cada pantalla solo su UI.

---

## Task Group A — Requisito de monorepo para Expo

### Task A1: Crear rama y `.npmrc` con node-linker hoisted

**Files:**
- Create: `.npmrc`

> Por qué: Metro (el bundler de Expo) no resuelve bien los `node_modules` simbólicos de pnpm. Expo documenta que en monorepos pnpm se requiere `node-linker=hoisted` para aplanar `node_modules`. Sin esto, la app no compila.

- [ ] **Step 1: Crear rama de trabajo**

Run (desde la raíz):
```bash
git checkout master
git checkout -b hito-0b-app-mobile-y-login
```
Expected: "Switched to a new branch 'hito-0b-app-mobile-y-login'".

- [ ] **Step 2: Crear `.npmrc`**

Crear `.npmrc` en la raíz:
```
node-linker=hoisted
```

- [ ] **Step 3: Reinstalar con linker plano**

Run (desde la raíz):
```bash
pnpm install
```
Expected: reinstala con `node_modules` aplanado, sin error. Los postinstall de `supabase`/`esbuild` (allowlist del 0a) corren igual.

- [ ] **Step 4: Verificar que el binario de Supabase sigue usable**

Run:
```bash
pnpm --filter @oraculo/db exec supabase --version
```
Expected: imprime `1.226.4` (o la versión instalada). Si falla, re-ejecuta `pnpm install`.

- [ ] **Step 5: Verificar que los tests del 0a siguen verdes**

Asegúrate de que el stack Supabase esté corriendo (`cd packages/db && pnpm exec supabase start`), luego desde la raíz:
```bash
pnpm --filter @oraculo/db test
```
Expected: **8 passed**. (Confirma que `node-linker=hoisted` no rompió el paquete db.)

- [ ] **Step 6: Commit**

```bash
git add .npmrc pnpm-lock.yaml
git commit -m "chore: set pnpm node-linker=hoisted for Expo monorepo compatibility"
```

---

## Task Group B — `packages/validations` (Zod, TDD)

### Task B1: Inicializar el paquete validations

**Files:**
- Create: `packages/validations/package.json`
- Create: `packages/validations/tsconfig.json`
- Create: `packages/validations/vitest.config.ts`

- [ ] **Step 1: Crear `packages/validations/package.json`**

```json
{
  "name": "@oraculo/validations",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Crear `packages/validations/tsconfig.json`**

```json
{
  "extends": "../../tooling/typescript/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

- [ ] **Step 3: Crear `packages/validations/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Instalar**

Run (desde la raíz):
```bash
pnpm install
```
Expected: instala zod + vitest en el paquete, sin error.

- [ ] **Step 5: Commit**

```bash
git add packages/validations/package.json packages/validations/tsconfig.json packages/validations/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(validations): init shared zod validations package"
```

### Task B2: Schemas de autenticación (TDD)

**Files:**
- Create: `packages/validations/tests/auth.test.ts`
- Create: `packages/validations/src/auth.ts`
- Create: `packages/validations/src/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/validations/tests/auth.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import { signUpSchema, signInSchema } from "../src/auth";

describe("signUpSchema", () => {
  it("acepta email y password válidos", () => {
    const r = signUpSchema.safeParse({
      email: "jess@example.com",
      password: "Password1",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza email inválido", () => {
    const r = signUpSchema.safeParse({ email: "no-email", password: "Password1" });
    expect(r.success).toBe(false);
  });

  it("rechaza password de menos de 8 caracteres", () => {
    const r = signUpSchema.safeParse({ email: "a@b.com", password: "Pass1" });
    expect(r.success).toBe(false);
  });

  it("rechaza password sin al menos una letra y un número", () => {
    const r1 = signUpSchema.safeParse({ email: "a@b.com", password: "abcdefgh" });
    const r2 = signUpSchema.safeParse({ email: "a@b.com", password: "12345678" });
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
  });

  it("normaliza el email a minúsculas y recorta espacios", () => {
    const r = signUpSchema.parse({ email: "  JESS@EXAMPLE.COM ", password: "Password1" });
    expect(r.email).toBe("jess@example.com");
  });
});

describe("signInSchema", () => {
  it("acepta credenciales con formato válido", () => {
    const r = signInSchema.safeParse({ email: "a@b.com", password: "x" });
    expect(r.success).toBe(true);
  });

  it("exige una password no vacía", () => {
    const r = signInSchema.safeParse({ email: "a@b.com", password: "" });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para ver que falla**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/validations test
```
Expected: FALLA con "Cannot find module '../src/auth'" (aún no existe).

- [ ] **Step 3: Implementar los schemas**

Crear `packages/validations/src/auth.ts`:
```typescript
import { z } from "zod";

/**
 * Email normalizado (minúsculas + trim) y validado.
 */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email inválido");

/**
 * Password de registro: mínimo 8 caracteres, al menos una letra y un número.
 */
const strongPassword = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Za-z]/, "La contraseña debe incluir al menos una letra")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número");

export const signUpSchema = z.object({
  email,
  password: strongPassword,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
```

- [ ] **Step 4: Crear el barrel `packages/validations/src/index.ts`**

```typescript
export * from "./auth";
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run:
```bash
pnpm --filter @oraculo/validations test
```
Expected: **7 passed**.

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm --filter @oraculo/validations typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/validations/src packages/validations/tests
git commit -m "feat(validations): add sign-up/sign-in zod schemas with tests"
```

---

## Task Group C — Configurar Supabase local para registro sin confirmación

### Task C1: Desactivar confirmación de email en local

**Files:**
- Modify: `packages/db/supabase/config.toml`

> Por qué: con confirmación de email activada, `signUp` NO devuelve sesión hasta que el usuario confirma por correo (no hay servidor de correo real en local). Para que el registro devuelva sesión y el bootstrap del hogar corra como usuario autenticado, desactivamos la confirmación SOLO en local. En producción se maneja distinto.

- [ ] **Step 1: Encontrar la sección `[auth.email]` en `packages/db/supabase/config.toml`**

Run:
```bash
grep -n "enable_confirmations" packages/db/supabase/config.toml
```
Expected: muestra una línea como `enable_confirmations = true` bajo `[auth.email]`.

- [ ] **Step 2: Cambiar a `false`**

Edita esa línea en `packages/db/supabase/config.toml` para que quede:
```toml
enable_confirmations = false
```
(No cambies ninguna otra línea.)

- [ ] **Step 3: Reiniciar el stack para aplicar config**

Run (desde `packages/db`):
```bash
cd packages/db
pnpm exec supabase stop
pnpm exec supabase start
```
Expected: arranca sin error.

- [ ] **Step 4: Verificar que el registro devuelve sesión (smoke test con curl)**

Run (obtén la anon key y URL del status; reemplaza `<ANON>` por el ANON_KEY de `pnpm exec supabase status`):
```bash
cd packages/db
ANON=$(pnpm exec supabase status -o json | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.ANON_KEY)})")
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"smoke_0b@test.local","password":"Password1"}' | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log('access_token?', !!j.access_token)})"
```
Expected: imprime `access_token? true` (con confirmación activada imprimiría `false`). Limpieza opcional: el usuario smoke queda en auth; puede borrarse luego con `supabase db reset` o ignorarse.

- [ ] **Step 5: Commit (desde la raíz)**

```bash
cd "C:/Users/arias/Downloads/oraculo de compras"
git add packages/db/supabase/config.toml
git commit -m "chore(db): disable local email confirmation so signUp returns a session"
```

---

## Task Group D — Scaffold de la app Expo

### Task D1: Crear el paquete `apps/mobile` y su configuración

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/tsconfig.json`

- [ ] **Step 1: Crear `apps/mobile/package.json`**

```json
{
  "name": "@oraculo/mobile",
  "version": "0.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "web": "expo start --web",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@oraculo/validations": "workspace:*",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@supabase/supabase-js": "^2.45.0",
    "expo": "~51.0.0",
    "expo-constants": "~16.0.0",
    "expo-linking": "~6.3.0",
    "expo-router": "~3.5.0",
    "expo-status-bar": "~1.12.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-screens": "3.31.1",
    "react-native-web": "~0.19.10",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/react": "~18.2.79",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 2: Crear `apps/mobile/app.json`**

```json
{
  "expo": {
    "name": "Oraculo de Compras",
    "slug": "oraculo-de-compras",
    "scheme": "oraculo",
    "version": "0.0.1",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": false,
    "ios": { "supportsTablet": true, "bundleIdentifier": "com.oraculo.compras" },
    "android": { "package": "com.oraculo.compras" },
    "web": { "bundler": "metro", "output": "single" },
    "plugins": ["expo-router"],
    "experiments": { "typedRoutes": false }
  }
}
```

- [ ] **Step 3: Crear `apps/mobile/babel.config.js`**

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
```

- [ ] **Step 4: Crear `apps/mobile/metro.config.js` (monorepo)**

```javascript
// Metro configurado para monorepo pnpm: observa la raíz del workspace y
// resuelve módulos tanto desde la app como desde la raíz.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

- [ ] **Step 5: Crear `apps/mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 5b: Crear `apps/mobile/expo-env.d.ts`**

> Expo normalmente lo genera al correr `expo start`, pero lo creamos a mano para que `tsc --noEmit` funcione sin haber arrancado Metro. Da tipos a `process.env.EXPO_PUBLIC_*` y a imports de assets.

```typescript
/// <reference types="expo/types" />
```

- [ ] **Step 5c: Ignorar artefactos de Expo en git**

Edita el `.gitignore` de la raíz y añade estas líneas al final (no borres las existentes):
```
# Expo
.expo/
apps/*/.expo/
apps/*/web-build/
```

- [ ] **Step 6: Instalar dependencias**

Run (desde la raíz):
```bash
pnpm install
```
Expected: instala expo, react-native, expo-router, supabase-js, async-storage, etc. Puede tardar. Sin error.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/babel.config.js apps/mobile/metro.config.js apps/mobile/tsconfig.json apps/mobile/expo-env.d.ts .gitignore pnpm-lock.yaml
git commit -m "chore(mobile): scaffold expo app config for monorepo"
```

### Task D2: Layout raíz mínimo y arranque verificable

**Files:**
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(app)/_layout.tsx`
- Create: `apps/mobile/app/(app)/index.tsx` (placeholder temporal; se reemplaza en Task F3)
- Create: `apps/mobile/.env.example`

> En este paso la app solo debe ARRANCAR y mostrar una pantalla. La lógica de auth llega en los grupos E/F.

- [ ] **Step 1: Crear un layout raíz mínimo `apps/mobile/app/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Crear `apps/mobile/app/(app)/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: true }} />;
}
```

- [ ] **Step 3: Crear placeholder `apps/mobile/app/(app)/index.tsx`**

```tsx
import { Text, View } from "react-native";

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Oráculo de Compras — arranque OK</Text>
    </View>
  );
}
```

- [ ] **Step 4: Crear `apps/mobile/.env.example`**

```
# Copia a .env.local y rellena con los valores de `pnpm exec supabase status`
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

- [ ] **Step 5: Verificar typecheck**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS. (Las rutas tipadas están desactivadas en `app.json`, así que los `href` son strings y no dependen de tipos generados.)

- [ ] **Step 6: Verificación MANUAL de arranque (Expo Web)**

> Esto requiere acción humana. Expo Web permite verificar en el navegador del host (donde `127.0.0.1` es alcanzable). Asegúrate de que Supabase local esté corriendo.

Run (desde la raíz):
```bash
pnpm --filter @oraculo/mobile web
```
Expected: Metro compila y abre el navegador en `http://localhost:8081` mostrando "Oráculo de Compras — arranque OK". Detén con Ctrl+C tras verificar. (Si Metro se queja de versiones, corre `pnpm --filter @oraculo/mobile exec expo install --check` y acepta los ajustes.)

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app apps/mobile/.env.example
git commit -m "feat(mobile): minimal root layout that boots to a placeholder screen"
```

---

## Task Group E — Cliente Supabase, env tipado y contexto de sesión

### Task E1: Env tipado y cliente Supabase

**Files:**
- Create: `apps/mobile/lib/env.ts`
- Create: `apps/mobile/lib/supabase.ts`

- [ ] **Step 1: Crear `apps/mobile/lib/env.ts`**

```typescript
import { z } from "zod";

// Las variables EXPO_PUBLIC_* se inyectan en tiempo de build por Expo.
const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  throw new Error(
    "Variables de entorno EXPO_PUBLIC_SUPABASE_* faltantes o inválidas. " +
      "Copia apps/mobile/.env.example a apps/mobile/.env.local y rellénalas.",
  );
}

export const env = parsed.data;
```

- [ ] **Step 2: Crear `apps/mobile/lib/supabase.ts`**

```typescript
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { env } from "./env";

export const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL,
  env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Refresca el token automáticamente cuando la app está en primer plano
// (patrón recomendado por la guía Supabase + Expo).
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
```

- [ ] **Step 3: Verificar typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/lib/env.ts apps/mobile/lib/supabase.ts
git commit -m "feat(mobile): typed env and supabase client with session persistence"
```

### Task E2: Contexto de autenticación

**Files:**
- Create: `apps/mobile/lib/auth-context.tsx`

- [ ] **Step 1: Crear `apps/mobile/lib/auth-context.tsx`**

```tsx
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
```

- [ ] **Step 2: Verificar typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/auth-context.tsx
git commit -m "feat(mobile): auth context tracking the supabase session"
```

### Task E3: Servicio de hogar (bootstrap + lectura)

**Files:**
- Create: `apps/mobile/services/household.ts`

> `bootstrapHousehold` usa exactamente la ruta RLS de creador implementada en 0a: inserta el hogar (created_by = uid), se agrega como miembro owner (permitido por `is_household_creator`), y crea `user_settings` con el hogar activo.

- [ ] **Step 1: Crear `apps/mobile/services/household.ts`**

```typescript
import { supabase } from "../lib/supabase";

export interface Household {
  id: string;
  name: string;
}

/**
 * Crea el hogar inicial del usuario recién registrado y lo deja como owner.
 * Debe llamarse con una sesión activa (el usuario autenticado es el creador).
 */
export async function bootstrapHousehold(userId: string, householdName: string): Promise<Household> {
  const { data: household, error: hErr } = await supabase
    .from("households")
    .insert({ name: householdName, created_by: userId })
    .select("id, name")
    .single();
  if (hErr || !household) {
    throw new Error(`No se pudo crear el hogar: ${hErr?.message ?? "desconocido"}`);
  }

  const { error: mErr } = await supabase.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "owner",
  });
  if (mErr) {
    throw new Error(`No se pudo registrar la membresía: ${mErr.message}`);
  }

  const { error: sErr } = await supabase.from("user_settings").insert({
    user_id: userId,
    active_household_id: household.id,
  });
  if (sErr) {
    throw new Error(`No se pudo crear la configuración: ${sErr.message}`);
  }

  return household;
}

/**
 * Devuelve el primer hogar visible para el usuario (RLS solo muestra los suyos).
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

- [ ] **Step 2: Verificar typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/services/household.ts
git commit -m "feat(mobile): household bootstrap and read service"
```

---

## Task Group F — Pantallas de auth, gate de navegación y home

### Task F1: Gate de navegación en el layout raíz

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Reemplazar `apps/mobile/app/_layout.tsx` por la versión con gate**

```tsx
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "../lib/auth-context";

function NavigationGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthGroup) {
      router.replace("/(app)");
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NavigationGate />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Crear `apps/mobile/app/(auth)/_layout.tsx`**

```tsx
import { Stack } from "expo-router";

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Verificar typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS. (Con rutas tipadas desactivadas, `router.replace("/(auth)/sign-in")` y `"/(app)"` aceptan strings aunque las pantallas se creen en F2/F3.)

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx apps/mobile/app/(auth)/_layout.tsx
git commit -m "feat(mobile): auth-aware navigation gate"
```

### Task F2: Pantallas de registro e inicio de sesión

**Files:**
- Create: `apps/mobile/app/(auth)/sign-in.tsx`
- Create: `apps/mobile/app/(auth)/sign-up.tsx`

- [ ] **Step 1: Crear `apps/mobile/app/(auth)/sign-up.tsx`**

```tsx
import { signUpSchema } from "@oraculo/validations";
import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { bootstrapHousehold } from "../../services/household";
import { supabase } from "../../lib/supabase";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = signUpSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp(parsed.data);
      if (signErr || !data.user) {
        setError(signErr?.message ?? "No se pudo registrar");
        return;
      }
      // Con confirmación de email desactivada en local, hay sesión inmediata.
      const defaultName = `Hogar de ${parsed.data.email.split("@")[0]}`;
      await bootstrapHousehold(data.user.id, defaultName);
      // El onAuthStateChange + gate redirigen a (app).
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Crear cuenta</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Registrarme</Text>}
      </Pressable>
      <Link href="/(auth)/sign-in" style={{ textAlign: "center", marginTop: 8 }}>
        ¿Ya tienes cuenta? Inicia sesión
      </Link>
    </View>
  );
}
```

- [ ] **Step 2: Crear `apps/mobile/app/(auth)/sign-in.tsx`**

```tsx
import { signInSchema } from "@oraculo/validations";
import { Link } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword(parsed.data);
      if (signErr) {
        setError(signErr.message);
        return;
      }
      // El gate redirige a (app) al detectar la sesión.
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Iniciar sesión</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      <TextInput
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 }}
      />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={{ backgroundColor: "#111", borderRadius: 8, padding: 14, alignItems: "center" }}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff" }}>Entrar</Text>}
      </Pressable>
      <Link href="/(auth)/sign-up" style={{ textAlign: "center", marginTop: 8 }}>
        ¿No tienes cuenta? Regístrate
      </Link>
    </View>
  );
}
```

- [ ] **Step 3: Verificar typecheck**

Run:
```bash
pnpm --filter @oraculo/mobile typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/(auth)/sign-in.tsx" "apps/mobile/app/(auth)/sign-up.tsx"
git commit -m "feat(mobile): email/password sign-in and sign-up screens"
```

### Task F3: Pantalla home (lee el hogar vía RLS) y cerrar sesión

**Files:**
- Modify: `apps/mobile/app/(app)/index.tsx`

- [ ] **Step 1: Reemplazar `apps/mobile/app/(app)/index.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { getActiveHousehold, type Household } from "../../services/household";

export default function Home() {
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
      <Text style={{ fontSize: 22, fontWeight: "600" }}>Hola</Text>
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

- [ ] **Step 2: Verificar typecheck del workspace**

Run (desde la raíz):
```bash
pnpm typecheck
```
Expected: PASS en todos los paquetes (db, validations, mobile).

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/(app)/index.tsx"
git commit -m "feat(mobile): home screen reads active household via RLS and signs out"
```

---

## Task Group G — Verificación final y cierre

### Task G1: Verificación E2E manual del login (Expo Web)

**Files:** ninguno

> Requiere acción humana + Supabase local corriendo. Expo Web evita el problema de alcanzar `127.0.0.1` desde un dispositivo.

- [ ] **Step 1: Crear `apps/mobile/.env.local` con las claves locales**

Run (desde `packages/db`, copia los valores):
```bash
cd packages/db
pnpm exec supabase status
```
Crea `apps/mobile/.env.local` con (reemplaza `<ANON_KEY>` por el valor real de `ANON_KEY`):
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
```

- [ ] **Step 2: Levantar la app en web**

Run (desde la raíz):
```bash
pnpm --filter @oraculo/mobile web
```
Expected: abre el navegador. Como no hay sesión, el gate te lleva a la pantalla "Iniciar sesión".

- [ ] **Step 3: Probar el registro**

En el navegador: ve a "Regístrate", ingresa un email nuevo (p.ej. `demo1@test.local`) y una contraseña válida (p.ej. `Password1`), pulsa "Registrarme".
Expected: te redirige a la pantalla Home, muestra tu email y "Hogar activo: Hogar de demo1".

- [ ] **Step 4: Probar cerrar sesión e iniciar sesión**

Pulsa "Cerrar sesión" → vuelve a "Iniciar sesión". Inicia con las mismas credenciales.
Expected: vuelve a Home y muestra el mismo hogar (persistencia + lectura RLS correcta).

- [ ] **Step 5: Confirmar aislamiento (opcional pero recomendado)**

Regístrate con un segundo email (`demo2@test.local`). En su Home debe verse "Hogar de demo2" (NO el de demo1) — confirma que RLS aísla por hogar también desde mobile. Detén Metro con Ctrl+C.

### Task G2: Verificación automatizada y cierre de rama

**Files:** ninguno

- [ ] **Step 1: Typecheck + tests de todo el workspace**

Run (desde la raíz, con Supabase local corriendo):
```bash
pnpm typecheck
pnpm --filter @oraculo/validations test
pnpm --filter @oraculo/db test
```
Expected: typecheck PASS; validations **7 passed**; db **8 passed**.

- [ ] **Step 2: Confirmar git limpio**

Run:
```bash
git status --short
```
Expected: vacío (`.env.local` está ignorado por el `.gitignore` `.env.*`).

- [ ] **Step 3: Cerrar la rama**

Usa la skill `superpowers:finishing-a-development-branch` para fusionar `hito-0b-app-mobile-y-login` a `master` (o crear PR), re-verificando los tests sobre el resultado.

---

## Definition of Done (Hito 0b)

- [ ] `.npmrc` con `node-linker=hoisted`; `pnpm install` y los 8 tests del 0a siguen verdes.
- [ ] `packages/validations` con `signUpSchema`/`signInSchema` y 7 tests verdes.
- [ ] La app Expo arranca (Expo Web) sin errores de Metro.
- [ ] Registro con email/password crea usuario + hogar + membresía + settings (bootstrap vía RLS de creador).
- [ ] Inicio y cierre de sesión funcionan; la sesión persiste entre recargas.
- [ ] La Home lee el hogar activo vía RLS y muestra email + nombre del hogar.
- [ ] `pnpm typecheck` pasa en `db`, `validations` y `mobile`.
- [ ] Working tree de git limpio.

**Lo que NO incluye este plan (va en Plan 0c):** Google OAuth, ESLint compartido, workflow de CI (GitHub Actions contra `git@github.com:JohanDGA/OracleShop.git`). **Diferido a Hito 1:** `packages/core`, `expo-sqlite`/Drizzle local.
