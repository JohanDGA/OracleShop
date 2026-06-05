# Hito 0a — Monorepo y Fundación de Datos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar un monorepo pnpm con una base de datos Postgres (vía Supabase local en Docker) que contiene el esquema completo de Oráculo de Compras, sus índices y políticas RLS, demostrado por tests de integración que prueban el aislamiento entre hogares.

**Architecture:** Monorepo pnpm + Turbo. El paquete `packages/db` contiene el esquema Drizzle (espejo TypeScript) y las migraciones SQL versionadas que aplica Supabase CLI sobre un Postgres local en Docker. La verdad del esquema vive en las migraciones SQL; Drizzle es el espejo tipado para el código. Las políticas RLS se prueban con `@supabase/supabase-js` contra el stack local (GoTrue + Postgres), creando usuarios reales y verificando que un hogar no puede leer ni escribir datos de otro.

**Tech Stack:** pnpm workspaces, Turbo, TypeScript strict, Volta (pin Node 20 LTS), Docker Desktop, Supabase CLI (como dev-dependency), Drizzle ORM, Vitest, @supabase/supabase-js.

---

## File Structure

Archivos que este plan crea (todo bajo `C:\Users\arias\Downloads\oraculo de compras`):

```
oraculo de compras/
├── package.json                         # raíz: workspace scripts
├── pnpm-workspace.yaml                  # define packages/* y apps/*
├── turbo.json                           # pipeline de tareas
├── .nvmrc                               # "20"
├── .gitignore
├── tooling/
│   └── typescript/
│       └── base.json                    # tsconfig base strict
├── packages/
│   └── db/
│       ├── package.json                 # deps: drizzle-orm, supabase, vitest, pg, @supabase/supabase-js
│       ├── tsconfig.json
│       ├── drizzle.config.ts
│       ├── src/
│       │   └── schema.ts                # espejo Drizzle de todas las tablas
│       ├── supabase/
│       │   ├── config.toml              # generado por `supabase init`
│       │   └── migrations/
│       │       ├── 0001_init_schema.sql # 12 tablas + extensiones
│       │       ├── 0002_indexes.sql     # índices (incl. trigram)
│       │       └── 0003_rls.sql         # enable RLS + policies por tabla
│       └── tests/
│           ├── helpers/
│           │   └── supabase-clients.ts  # lee `supabase status`, crea clientes
│           └── rls.test.ts              # tests de aislamiento entre hogares
```

Cada archivo tiene una responsabilidad única: `schema.ts` solo describe tablas para el código; las migraciones SQL son la fuente de verdad del esquema; `rls.test.ts` solo verifica seguridad de acceso.

---

## Task Group A — Entorno de desarrollo

> Estos pasos son de instalación y verificación (no TDD). El platform es Windows + PowerShell. Ejecuta los comandos en una terminal PowerShell.

### Task A1: Instalar Volta y fijar Node 20 LTS

**Files:** ninguno (instalación global de herramientas)

- [ ] **Step 1: Instalar Volta vía winget**

Run (PowerShell):
```powershell
winget install Volta.Volta --accept-source-agreements --accept-package-agreements
```
Expected: "Successfully installed". Cierra y reabre la terminal para que el PATH tome efecto.

- [ ] **Step 2: Verificar Volta**

Run:
```powershell
volta --version
```
Expected: imprime una versión (ej. `2.x.x`). Si dice "no reconocido", reinicia la terminal.

- [ ] **Step 3: Instalar Node 20 LTS gestionado por Volta**

Run:
```powershell
volta install node@20
```
Expected: "installed and set node@20.x.x as default".

- [ ] **Step 4: Verificar que Node 20 está activo**

Run:
```powershell
node --version
```
Expected: `v20.x.x` (NO v26). Volta intercepta y sirve la versión 20.

- [ ] **Step 5: Habilitar pnpm vía corepack**

Run:
```powershell
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```
Expected: imprime una versión de pnpm (ej. `9.x.x`).

### Task A2: Instalar Docker Desktop

**Files:** ninguno

- [ ] **Step 1: Instalar Docker Desktop vía winget**

Run:
```powershell
winget install Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
```
Expected: "Successfully installed". Puede pedir reinicio de Windows — si lo pide, reinicia.

- [ ] **Step 2: Abrir Docker Desktop y aceptar términos**

Abre "Docker Desktop" desde el menú inicio. Acepta el acuerdo de servicio (uso personal). Espera a que el ícono de la ballena indique "Engine running".

- [ ] **Step 3: Verificar Docker desde la terminal**

Run:
```powershell
docker --version
docker ps
```
Expected: `docker --version` imprime una versión; `docker ps` imprime una tabla vacía con encabezados (CONTAINER ID, IMAGE, ...) sin error. Si `docker ps` da error "cannot connect", Docker Desktop aún no terminó de arrancar — espera 30s y reintenta.

---

## Task Group B — Scaffold del monorepo

### Task B1: Inicializar el workspace raíz

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`

- [ ] **Step 1: Crear `.nvmrc`**

Crear `C:\Users\arias\Downloads\oraculo de compras\.nvmrc` con contenido exacto:
```
20
```

- [ ] **Step 2: Crear `pnpm-workspace.yaml`**

Crear `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Crear `package.json` raíz**

Crear `package.json`:
```json
{
  "name": "oraculo-de-compras",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.12.0",
  "volta": {
    "node": "20.18.0"
  },
  "scripts": {
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "db:start": "pnpm --filter @oraculo/db supabase:start",
    "db:stop": "pnpm --filter @oraculo/db supabase:stop",
    "db:reset": "pnpm --filter @oraculo/db supabase:reset",
    "db:test": "pnpm --filter @oraculo/db test"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.5.4"
  }
}
```

- [ ] **Step 4: Crear `.gitignore`**

Crear `.gitignore`:
```
node_modules/
dist/
.turbo/
*.log
.env
.env.local
# Supabase local
packages/db/supabase/.temp/
packages/db/supabase/.branches/
```

- [ ] **Step 5: Verificar que pnpm reconoce el workspace**

Run (en la raíz del proyecto):
```powershell
pnpm install
```
Expected: instala turbo + typescript en la raíz sin error. Crea `node_modules/` y `pnpm-lock.yaml`.

- [ ] **Step 6: Commit**

```powershell
git add .nvmrc pnpm-workspace.yaml package.json .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm monorepo root"
```

### Task B2: Configuración base de TypeScript y Turbo

**Files:**
- Create: `tooling/typescript/base.json`
- Create: `turbo.json`

- [ ] **Step 1: Crear tsconfig base strict**

Crear `tooling/typescript/base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 2: Crear `turbo.json`**

Crear `turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 3: Verificar que turbo arranca**

Run:
```powershell
pnpm turbo run build --dry-run
```
Expected: turbo imprime un plan ("0 packages" o tareas en cero, sin error de parseo de `turbo.json`).

- [ ] **Step 4: Commit**

```powershell
git add tooling/typescript/base.json turbo.json
git commit -m "chore: add base tsconfig and turbo pipeline"
```

---

## Task Group C — Paquete `packages/db`: esquema Drizzle

### Task C1: Inicializar el paquete db

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`

- [ ] **Step 1: Crear `packages/db/package.json`**

Crear `packages/db/package.json`:
```json
{
  "name": "@oraculo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/schema.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset",
    "supabase:status": "supabase status"
  },
  "dependencies": {
    "drizzle-orm": "^0.33.0"
  },
  "devDependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "drizzle-kit": "^0.24.0",
    "supabase": "^1.200.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Crear `packages/db/tsconfig.json`**

Crear `packages/db/tsconfig.json`:
```json
{
  "extends": "../../tooling/typescript/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "drizzle.config.ts"]
}
```

- [ ] **Step 3: Instalar dependencias**

Run (en la raíz):
```powershell
pnpm install
```
Expected: instala drizzle-orm, supabase, vitest, etc. en `packages/db`. El paquete `supabase` descarga su binario en postinstall.

- [ ] **Step 4: Verificar el binario de Supabase**

Run:
```powershell
pnpm --filter @oraculo/db exec supabase --version
```
Expected: imprime una versión del CLI (ej. `1.200.x`).

- [ ] **Step 5: Commit**

```powershell
git add packages/db/package.json packages/db/tsconfig.json pnpm-lock.yaml
git commit -m "chore(db): init db package with drizzle and supabase cli"
```

### Task C2: Definir el esquema Drizzle (espejo tipado)

**Files:**
- Create: `packages/db/src/schema.ts`

> Nota: este archivo es el espejo TypeScript. La fuente de verdad del esquema en la base de datos son las migraciones SQL (Task Group D). Mantenemos ambos coherentes manualmente. Las columnas `created_at`/`updated_at`/`deleted_at` se modelan aquí para que el código tenga tipos correctos.

- [ ] **Step 1: Crear `packages/db/src/schema.ts`**

Crear `packages/db/src/schema.ts`:
```typescript
import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";

// Nota: auth.users es de Supabase. Referenciamos su id por UUID sin
// declarar la tabla aquí (vive en el schema `auth`).

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("COP"),
  country: varchar("country", { length: 2 }).notNull().default("CO"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id").notNull().references(() => households.id),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.householdId, t.userId] }) }),
);

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  brand: text("brand"),
  locationText: text("location_text"),
  nit: varchar("nit", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").references(() => households.id),
  name: text("name").notNull(),
  icon: text("icon"),
  color: varchar("color", { length: 7 }),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const canonicalProducts = pgTable("canonical_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  name: text("name").notNull(),
  brand: text("brand"),
  presentation: text("presentation"),
  categoryId: uuid("category_id").references(() => categories.id),
  unit: text("unit"),
  unitQuantity: numeric("unit_quantity", { precision: 10, scale: 4 }),
  barcode: text("barcode"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const productAliases = pgTable("product_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalProductId: uuid("canonical_product_id").notNull().references(() => canonicalProducts.id),
  alias: text("alias").notNull(),
  source: text("source").notNull(),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  storeId: uuid("store_id").references(() => stores.id),
  purchasedAt: date("purchased_at"),
  total: numeric("total", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }),
  exchangeRate: numeric("exchange_rate", { precision: 10, scale: 6 }),
  totalBase: numeric("total_base", { precision: 15, scale: 4 }),
  source: text("source").notNull(),
  rawData: jsonb("raw_data"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const receiptItems = pgTable("receipt_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  receiptId: uuid("receipt_id").notNull().references(() => receipts.id),
  canonicalProductId: uuid("canonical_product_id").references(() => canonicalProducts.id),
  rawName: text("raw_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 15, scale: 4 }),
  regularPrice: numeric("regular_price", { precision: 15, scale: 4 }),
  isPromo: boolean("is_promo").notNull().default(false),
  totalPrice: numeric("total_price", { precision: 15, scale: 4 }),
  categoryId: uuid("category_id").references(() => categories.id),
  position: integer("position"),
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const manualExpenses = pgTable("manual_expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  description: text("description"),
  amount: numeric("amount", { precision: 15, scale: 4 }),
  currency: varchar("currency", { length: 3 }),
  occurredAt: date("occurred_at"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  createdBy: uuid("created_by").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  estimatedTotal: numeric("estimated_total", { precision: 15, scale: 4 }),
  estimatedAt: timestamp("estimated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  shoppingListId: uuid("shopping_list_id").notNull().references(() => shoppingLists.id),
  canonicalProductId: uuid("canonical_product_id").references(() => canonicalProducts.id),
  rawName: text("raw_name"),
  quantity: numeric("quantity", { precision: 10, scale: 4 }),
  unit: text("unit"),
  estimatedUnitPrice: numeric("estimated_unit_price", { precision: 15, scale: 4 }),
  estimatedSource: text("estimated_source"),
  checked: boolean("checked").notNull().default(false),
  position: integer("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceAlerts = pgTable("price_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id").notNull().references(() => households.id),
  canonicalProductId: uuid("canonical_product_id").notNull().references(() => canonicalProducts.id),
  previousPrice: numeric("previous_price", { precision: 15, scale: 4 }),
  currentPrice: numeric("current_price", { precision: 15, scale: 4 }),
  changePercent: numeric("change_percent", { precision: 5, scale: 2 }),
  storeId: uuid("store_id").references(() => stores.id),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  activeHouseholdId: uuid("active_household_id").references(() => households.id),
  preferredAiProvider: text("preferred_ai_provider"),
  priceAlertThreshold: numeric("price_alert_threshold", { precision: 5, scale: 2 }).notNull().default("10.00"),
  theme: text("theme").notNull().default("system"),
  locale: varchar("locale", { length: 5 }).notNull().default("es-CO"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Crear `packages/db/drizzle.config.ts`**

Crear `packages/db/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    // URL de Postgres local de Supabase (puerto 54322 por defecto).
    url: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  },
});
```

- [ ] **Step 3: Verificar typecheck del esquema**

Run:
```powershell
pnpm --filter @oraculo/db typecheck
```
Expected: PASS sin errores de tipo.

- [ ] **Step 4: Commit**

```powershell
git add packages/db/src/schema.ts packages/db/drizzle.config.ts
git commit -m "feat(db): add drizzle schema mirror for all tables"
```

---

## Task Group D — Migraciones SQL y Supabase local

### Task D1: Inicializar Supabase local

**Files:**
- Create: `packages/db/supabase/config.toml` (generado)

- [ ] **Step 1: Inicializar el proyecto Supabase dentro de packages/db**

Run (desde `packages/db`):
```powershell
cd "C:\Users\arias\Downloads\oraculo de compras\packages\db"
pnpm exec supabase init
```
Expected: crea `supabase/config.toml` y la carpeta `supabase/`. Si pregunta por generar settings de VS Code, responde "N".

- [ ] **Step 2: Arrancar el stack local (descarga imágenes la primera vez)**

Run:
```powershell
pnpm exec supabase start
```
Expected: Docker descarga imágenes (tarda varios minutos la primera vez) y al final imprime un bloque con `API URL`, `DB URL`, `anon key`, `service_role key`. Déjalo corriendo.

- [ ] **Step 3: Verificar el estado**

Run:
```powershell
pnpm exec supabase status
```
Expected: lista los servicios con sus URLs y keys. Anota mentalmente que `DB URL` apunta a `127.0.0.1:54322`.

- [ ] **Step 4: Commit del config**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/supabase/config.toml
git commit -m "chore(db): init supabase local config"
```

### Task D2: Migración inicial del esquema

**Files:**
- Create: `packages/db/supabase/migrations/0001_init_schema.sql`

- [ ] **Step 1: Crear la migración del esquema**

Crear `packages/db/supabase/migrations/0001_init_schema.sql`:
```sql
-- Extensiones
create extension if not exists pg_trgm;

-- households
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_currency varchar(3) not null default 'COP',
  country varchar(2) not null default 'CO',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- household_members
create table public.household_members (
  household_id uuid not null references public.households(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- stores
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  name text not null,
  brand text,
  location_text text,
  nit varchar(20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id),
  name text not null,
  icon text,
  color varchar(7),
  parent_id uuid references public.categories(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- canonical_products
create table public.canonical_products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  name text not null,
  brand text,
  presentation text,
  category_id uuid references public.categories(id),
  unit text,
  unit_quantity numeric(10,4),
  barcode text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- product_aliases
create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid not null references public.canonical_products(id),
  alias text not null,
  source text not null,
  confidence numeric(3,2),
  created_at timestamptz not null default now()
);

-- receipts
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  created_by uuid not null references auth.users(id),
  store_id uuid references public.stores(id),
  purchased_at date,
  total numeric(15,4),
  currency varchar(3),
  exchange_rate numeric(10,6),
  total_base numeric(15,4),
  source text not null,
  raw_data jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- receipt_items
create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id),
  canonical_product_id uuid references public.canonical_products(id),
  raw_name text not null,
  quantity numeric(10,4),
  unit text,
  unit_price numeric(15,4),
  regular_price numeric(15,4),
  is_promo boolean not null default false,
  total_price numeric(15,4),
  category_id uuid references public.categories(id),
  position integer,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- manual_expenses
create table public.manual_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  created_by uuid not null references auth.users(id),
  category_id uuid references public.categories(id),
  description text,
  amount numeric(15,4),
  currency varchar(3),
  occurred_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- shopping_lists
create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  created_by uuid not null references auth.users(id),
  name text not null,
  status text not null default 'active',
  completed_at timestamptz,
  estimated_total numeric(15,4),
  estimated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- shopping_list_items
create table public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id),
  canonical_product_id uuid references public.canonical_products(id),
  raw_name text,
  quantity numeric(10,4),
  unit text,
  estimated_unit_price numeric(15,4),
  estimated_source text,
  checked boolean not null default false,
  position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- price_alerts
create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id),
  canonical_product_id uuid not null references public.canonical_products(id),
  previous_price numeric(15,4),
  current_price numeric(15,4),
  change_percent numeric(5,2),
  store_id uuid references public.stores(id),
  detected_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

-- user_settings
create table public.user_settings (
  user_id uuid primary key references auth.users(id),
  active_household_id uuid references public.households(id),
  preferred_ai_provider text,
  price_alert_threshold numeric(5,2) not null default 10.00,
  theme text not null default 'system',
  locale varchar(5) not null default 'es-CO',
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 2: Aplicar la migración con un reset**

Run (desde `packages/db`):
```powershell
pnpm exec supabase db reset
```
Expected: recrea la DB local y aplica `0001_init_schema.sql` sin error. Termina con "Finished supabase db reset".

- [ ] **Step 3: Verificar que las tablas existen**

Run:
```powershell
pnpm exec supabase db reset --debug 2>&1 | Select-String "households|receipts|canonical_products"
```
Expected: el reset corre sin error. (La verificación real de las tablas se hace en los tests del Group E; aquí basta con que el reset aplique la migración sin fallar.)

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/supabase/migrations/0001_init_schema.sql
git commit -m "feat(db): initial schema migration (12 tables)"
```

### Task D3: Migración de índices

**Files:**
- Create: `packages/db/supabase/migrations/0002_indexes.sql`

- [ ] **Step 1: Crear la migración de índices**

Crear `packages/db/supabase/migrations/0002_indexes.sql`:
```sql
create index idx_household_members_user
  on public.household_members (user_id);

create index idx_receipts_household_purchased
  on public.receipts (household_id, purchased_at desc)
  where deleted_at is null;

create index idx_receipt_items_canonical
  on public.receipt_items (canonical_product_id)
  where deleted_at is null;

create index idx_receipt_items_receipt
  on public.receipt_items (receipt_id)
  where deleted_at is null;

create index idx_canonical_products_household
  on public.canonical_products (household_id)
  where deleted_at is null;

create index idx_product_aliases_canonical
  on public.product_aliases (canonical_product_id);

create index idx_product_aliases_alias_trgm
  on public.product_aliases using gin (alias gin_trgm_ops);

create index idx_stores_household
  on public.stores (household_id)
  where deleted_at is null;

create index idx_shopping_lists_household
  on public.shopping_lists (household_id)
  where deleted_at is null;

create index idx_shopping_list_items_list
  on public.shopping_list_items (shopping_list_id);

create index idx_manual_expenses_household
  on public.manual_expenses (household_id)
  where deleted_at is null;

create index idx_price_alerts_household
  on public.price_alerts (household_id)
  where dismissed_at is null;
```

- [ ] **Step 2: Aplicar con reset**

Run (desde `packages/db`):
```powershell
pnpm exec supabase db reset
```
Expected: aplica 0001 y 0002 sin error.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/supabase/migrations/0002_indexes.sql
git commit -m "feat(db): add indexes incl. trigram on product aliases"
```

### Task D4: Migración de RLS

**Files:**
- Create: `packages/db/supabase/migrations/0003_rls.sql`

> Patrón: cada tabla con `household_id` solo es visible/escribible por miembros del hogar. `product_aliases`, `receipt_items` y `shopping_list_items` heredan el scope a través de su tabla padre. `categories` permite leer las del sistema (`household_id is null`) además de las propias. `user_settings` es privado por `user_id`.

- [ ] **Step 1: Crear la migración de RLS**

Crear `packages/db/supabase/migrations/0003_rls.sql`:
```sql
-- Helper: ¿el usuario actual es miembro del hogar?
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
  );
$$;

-- Helper: ¿el usuario actual es el creador del hogar? (SECURITY DEFINER para
-- saltar la RLS de households en el bootstrap del primer miembro)
create or replace function public.is_household_creator(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.households h
    where h.id = hid
      and h.created_by = auth.uid()
  );
$$;

-- Habilitar RLS en todas las tablas
alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.stores                enable row level security;
alter table public.categories            enable row level security;
alter table public.canonical_products    enable row level security;
alter table public.product_aliases       enable row level security;
alter table public.receipts              enable row level security;
alter table public.receipt_items         enable row level security;
alter table public.manual_expenses       enable row level security;
alter table public.shopping_lists        enable row level security;
alter table public.shopping_list_items   enable row level security;
alter table public.price_alerts          enable row level security;
alter table public.user_settings         enable row level security;

-- households: miembro puede ver; creador puede crear; miembro puede actualizar
create policy households_select on public.households
  for select using (public.is_household_member(id) and deleted_at is null);
create policy households_insert on public.households
  for insert with check (created_by = auth.uid());
create policy households_update on public.households
  for update using (public.is_household_member(id));

-- household_members: ves filas de hogares donde eres miembro
create policy household_members_select on public.household_members
  for select using (public.is_household_member(household_id));
-- INSERT: un miembro existente puede agregar a otros (invitación), o el CREADOR
-- del hogar puede auto-registrarse al crearlo (bootstrap). NUNCA permitir que un
-- usuario cualquiera se una a un hogar ajeno (escalación de privilegios).
create policy household_members_insert on public.household_members
  for insert with check (
    public.is_household_member(household_id)
    or (public.is_household_creator(household_id) and user_id = auth.uid())
  );

-- Patrón household-scoped: SELECT/INSERT/UPDATE para stores
create policy stores_select on public.stores
  for select using (public.is_household_member(household_id) and deleted_at is null);
create policy stores_insert on public.stores
  for insert with check (public.is_household_member(household_id));
create policy stores_update on public.stores
  for update using (public.is_household_member(household_id));

-- categories: del sistema (household_id null) o del hogar
create policy categories_select on public.categories
  for select using (
    (household_id is null or public.is_household_member(household_id))
    and deleted_at is null
  );
create policy categories_insert on public.categories
  for insert with check (public.is_household_member(household_id));
create policy categories_update on public.categories
  for update using (public.is_household_member(household_id));

-- canonical_products
create policy canonical_products_select on public.canonical_products
  for select using (public.is_household_member(household_id) and deleted_at is null);
create policy canonical_products_insert on public.canonical_products
  for insert with check (public.is_household_member(household_id));
create policy canonical_products_update on public.canonical_products
  for update using (public.is_household_member(household_id));

-- product_aliases: scope heredado del canonical
create policy product_aliases_select on public.product_aliases
  for select using (
    exists (
      select 1 from public.canonical_products cp
      where cp.id = product_aliases.canonical_product_id
        and public.is_household_member(cp.household_id)
    )
  );
create policy product_aliases_insert on public.product_aliases
  for insert with check (
    exists (
      select 1 from public.canonical_products cp
      where cp.id = product_aliases.canonical_product_id
        and public.is_household_member(cp.household_id)
    )
  );

-- receipts
create policy receipts_select on public.receipts
  for select using (public.is_household_member(household_id) and deleted_at is null);
create policy receipts_insert on public.receipts
  for insert with check (public.is_household_member(household_id));
create policy receipts_update on public.receipts
  for update using (public.is_household_member(household_id));

-- receipt_items: scope heredado del receipt
create policy receipt_items_select on public.receipt_items
  for select using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_household_member(r.household_id)
    )
    and deleted_at is null
  );
create policy receipt_items_insert on public.receipt_items
  for insert with check (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_household_member(r.household_id)
    )
  );
create policy receipt_items_update on public.receipt_items
  for update using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and public.is_household_member(r.household_id)
    )
  );

-- manual_expenses
create policy manual_expenses_select on public.manual_expenses
  for select using (public.is_household_member(household_id) and deleted_at is null);
create policy manual_expenses_insert on public.manual_expenses
  for insert with check (public.is_household_member(household_id));
create policy manual_expenses_update on public.manual_expenses
  for update using (public.is_household_member(household_id));

-- shopping_lists
create policy shopping_lists_select on public.shopping_lists
  for select using (public.is_household_member(household_id) and deleted_at is null);
create policy shopping_lists_insert on public.shopping_lists
  for insert with check (public.is_household_member(household_id));
create policy shopping_lists_update on public.shopping_lists
  for update using (public.is_household_member(household_id));

-- shopping_list_items: scope heredado de la lista
create policy shopping_list_items_select on public.shopping_list_items
  for select using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and public.is_household_member(sl.household_id)
    )
  );
create policy shopping_list_items_insert on public.shopping_list_items
  for insert with check (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and public.is_household_member(sl.household_id)
    )
  );
create policy shopping_list_items_update on public.shopping_list_items
  for update using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = shopping_list_items.shopping_list_id
        and public.is_household_member(sl.household_id)
    )
  );

-- price_alerts
create policy price_alerts_select on public.price_alerts
  for select using (public.is_household_member(household_id));
create policy price_alerts_insert on public.price_alerts
  for insert with check (public.is_household_member(household_id));
create policy price_alerts_update on public.price_alerts
  for update using (public.is_household_member(household_id));

-- user_settings: privado por user_id
create policy user_settings_select on public.user_settings
  for select using (user_id = auth.uid());
create policy user_settings_insert on public.user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update on public.user_settings
  for update using (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar con reset**

Run (desde `packages/db`):
```powershell
pnpm exec supabase db reset
```
Expected: aplica 0001, 0002 y 0003 sin error. Termina con "Finished supabase db reset".

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/supabase/migrations/0003_rls.sql
git commit -m "feat(db): enable RLS and add household-scoped policies"
```

---

## Task Group E — Tests de RLS (aislamiento entre hogares)

> Estos tests son el entregable que prueba la seguridad. Usan `@supabase/supabase-js` contra el stack local: crean dos usuarios reales (A y B), siembran datos con el service_role (que bypasea RLS) y verifican con clientes autenticados que A no ve ni escribe datos del hogar de B.

### Task E1: Helper de clientes Supabase para tests

**Files:**
- Create: `packages/db/tests/helpers/supabase-clients.ts`
- Create: `packages/db/vitest.config.ts`

- [ ] **Step 1: Crear `packages/db/vitest.config.ts`**

Crear `packages/db/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
```

- [ ] **Step 2: Crear el helper de clientes**

Crear `packages/db/tests/helpers/supabase-clients.ts`:
```typescript
import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface LocalKeys {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

/**
 * Lee las URLs y keys del stack Supabase local mediante `supabase status -o json`.
 * Requiere que `supabase start` esté corriendo.
 */
export function getLocalKeys(): LocalKeys {
  const raw = execSync("pnpm exec supabase status -o json", {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  const json = JSON.parse(raw) as Record<string, string>;
  return {
    apiUrl: json.API_URL,
    anonKey: json.ANON_KEY,
    serviceRoleKey: json.SERVICE_ROLE_KEY,
  };
}

/** Cliente con service_role: bypasea RLS. Úsalo solo para sembrar/limpiar. */
export function makeServiceClient(keys: LocalKeys): SupabaseClient {
  return createClient(keys.apiUrl, keys.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Crea un usuario confirmado y devuelve su id + un cliente autenticado como él. */
export async function makeUserClient(
  keys: LocalKeys,
  service: SupabaseClient,
  email: string,
  password: string,
): Promise<{ userId: string; client: SupabaseClient }> {
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    throw new Error(`No se pudo crear usuario ${email}: ${createErr?.message}`);
  }

  const client = createClient(keys.apiUrl, keys.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) {
    throw new Error(`No se pudo autenticar ${email}: ${signInErr.message}`);
  }

  return { userId: created.user.id, client };
}
```

- [ ] **Step 3: Verificar typecheck**

Run (desde `packages/db`):
```powershell
pnpm --filter @oraculo/db typecheck
```
Expected: PASS. (Si falla por tipos de `@supabase/supabase-js`, confirma que `pnpm install` lo instaló.)

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/vitest.config.ts packages/db/tests/helpers/supabase-clients.ts
git commit -m "test(db): add supabase local test client helpers"
```

### Task E2: Test de aislamiento — un hogar no ve datos de otro

**Files:**
- Create: `packages/db/tests/rls.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/db/tests/rls.test.ts`:
```typescript
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLocalKeys,
  makeServiceClient,
  makeUserClient,
} from "./helpers/supabase-clients";

const keys = getLocalKeys();
const service = makeServiceClient(keys);

let userA: { userId: string; client: SupabaseClient };
let userB: { userId: string; client: SupabaseClient };
let householdA: string;
let householdB: string;
let receiptA: string;

beforeAll(async () => {
  const stamp = Date.now();
  userA = await makeUserClient(keys, service, `a_${stamp}@test.local`, "password123");
  userB = await makeUserClient(keys, service, `b_${stamp}@test.local`, "password123");

  // Hogar A con su miembro y un recibo (sembrado con service_role)
  const { data: hA, error: hAErr } = await service
    .from("households")
    .insert({ name: "Hogar A", created_by: userA.userId })
    .select("id")
    .single();
  if (hAErr) throw hAErr;
  householdA = hA.id;
  await service.from("household_members").insert({
    household_id: householdA,
    user_id: userA.userId,
    role: "owner",
  });
  const { data: rA, error: rAErr } = await service
    .from("receipts")
    .insert({ household_id: householdA, created_by: userA.userId, source: "manual" })
    .select("id")
    .single();
  if (rAErr) throw rAErr;
  receiptA = rA.id;

  // Hogar B con su miembro
  const { data: hB, error: hBErr } = await service
    .from("households")
    .insert({ name: "Hogar B", created_by: userB.userId })
    .select("id")
    .single();
  if (hBErr) throw hBErr;
  householdB = hB.id;
  await service.from("household_members").insert({
    household_id: householdB,
    user_id: userB.userId,
    role: "owner",
  });
});

afterAll(async () => {
  // Limpieza con service_role
  await service.from("receipts").delete().eq("household_id", householdA);
  await service.from("household_members").delete().eq("household_id", householdA);
  await service.from("household_members").delete().eq("household_id", householdB);
  await service.from("households").delete().in("id", [householdA, householdB]);
  await service.auth.admin.deleteUser(userA.userId);
  await service.auth.admin.deleteUser(userB.userId);
});

describe("RLS: aislamiento entre hogares", () => {
  it("A ve su propio recibo", async () => {
    const { data, error } = await userA.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("B NO ve el recibo de A", async () => {
    const { data, error } = await userB.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0); // RLS filtra: 0 filas, no error
  });

  it("B NO puede insertar un recibo en el hogar de A", async () => {
    const { error } = await userB.client
      .from("receipts")
      .insert({ household_id: householdA, created_by: userB.userId, source: "manual" });
    expect(error).not.toBeNull(); // viola la policy de INSERT
  });

  it("A NO ve el hogar de B", async () => {
    const { data, error } = await userA.client
      .from("households")
      .select("id")
      .eq("id", householdB);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Asegurar que el stack local está corriendo y la DB está limpia**

Run (desde `packages/db`):
```powershell
cd "C:\Users\arias\Downloads\oraculo de compras\packages\db"
pnpm exec supabase status
```
Expected: muestra servicios corriendo. Si no, corre `pnpm exec supabase start` y luego `pnpm exec supabase db reset`.

- [ ] **Step 3: Correr el test**

Run (desde `packages/db`):
```powershell
pnpm --filter @oraculo/db test
```
Expected: los 4 tests PASAN. Si alguno falla:
- "A ve su propio recibo" falla → revisa policy `receipts_select` y `is_household_member`.
- "B NO ve el recibo de A" devuelve filas → la policy de SELECT está mal (revisa que use `is_household_member`).
- "B NO puede insertar..." no da error → revisa policy `receipts_insert` (`with check`).

- [ ] **Step 4: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/tests/rls.test.ts
git commit -m "test(db): verify household isolation via RLS (select + insert)"
```

### Task E3: Test de scope heredado — receipt_items vía receipt padre

**Files:**
- Modify: `packages/db/tests/rls.test.ts` (agregar un describe nuevo)

- [ ] **Step 1: Agregar el test de scope heredado**

En `packages/db/tests/rls.test.ts`, en el `beforeAll`, agregar la siembra de un `receipt_item` en el recibo de A — añadir estas líneas justo después de asignar `receiptA = rA.id;` y antes de crear el hogar B (`receipt_items` no tiene columna `household_id` ni `source`; su scope se hereda del recibo padre):

```typescript
  await service.from("receipt_items").insert({
    receipt_id: receiptA,
    raw_name: "LECHE DESLAC 1L",
    quantity: "1",
    unit_price: "5000",
    total_price: "5000",
  });
```

Y en el `afterAll`, agregar como PRIMERA línea de limpieza (antes de borrar receipts):

```typescript
  await service.from("receipt_items").delete().eq("receipt_id", receiptA);
```

Luego agregar el `describe` nuevo al final del archivo:

```typescript
describe("RLS: scope heredado en receipt_items", () => {
  it("A ve los items de su recibo", async () => {
    const { data, error } = await userA.client
      .from("receipt_items")
      .select("id")
      .eq("receipt_id", receiptA);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("B NO ve los items del recibo de A", async () => {
    const { data, error } = await userB.client
      .from("receipt_items")
      .select("id")
      .eq("receipt_id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr los tests**

Run (desde `packages/db`):
```powershell
pnpm --filter @oraculo/db test
```
Expected: ahora 6 tests PASAN. Si "B NO ve los items..." devuelve filas, revisa la policy `receipt_items_select` (el `exists` contra `receipts`).

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/tests/rls.test.ts
git commit -m "test(db): verify inherited RLS scope on receipt_items"
```

### Task E4: Test de hogar compartido — dos miembros ven los mismos datos

**Files:**
- Modify: `packages/db/tests/rls.test.ts`

- [ ] **Step 1: Agregar a B como miembro del hogar A y verificar acceso compartido**

En `packages/db/tests/rls.test.ts`, agregar este `describe` al final del archivo:

```typescript
describe("RLS: hogar compartido", () => {
  it("al unir B al hogar A, B ve el recibo de A", async () => {
    // Unir B al hogar A con service_role
    const { error: joinErr } = await service.from("household_members").insert({
      household_id: householdA,
      user_id: userB.userId,
      role: "member",
    });
    expect(joinErr).toBeNull();

    // Ahora B sí ve el recibo de A
    const { data, error } = await userB.client
      .from("receipts")
      .select("id")
      .eq("id", receiptA);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // Limpieza: sacar a B del hogar A para no afectar otros tests
    await service
      .from("household_members")
      .delete()
      .eq("household_id", householdA)
      .eq("user_id", userB.userId);
  });
});
```

- [ ] **Step 2: Correr todos los tests**

Run (desde `packages/db`):
```powershell
pnpm --filter @oraculo/db test
```
Expected: 7 tests PASAN.

- [ ] **Step 3: Commit**

```powershell
cd "C:\Users\arias\Downloads\oraculo de compras"
git add packages/db/tests/rls.test.ts
git commit -m "test(db): verify shared-household members see shared data"
```

---

## Task Group F — Verificación final del Hito 0a

### Task F1: Verificación integral

**Files:** ninguno

- [ ] **Step 1: Typecheck de todo el workspace**

Run (en la raíz):
```powershell
pnpm typecheck
```
Expected: PASS en todos los paquetes.

- [ ] **Step 2: Reset limpio + suite de tests completa**

Run (desde `packages/db`):
```powershell
cd "C:\Users\arias\Downloads\oraculo de compras\packages\db"
pnpm exec supabase db reset
pnpm --filter @oraculo/db test
```
Expected: reset aplica las 3 migraciones; los 7 tests RLS PASAN sobre una DB recién creada.

- [ ] **Step 2.5: Detener el stack (libera Docker)**

Run (opcional, cuando termines de trabajar):
```powershell
pnpm exec supabase stop
```
Expected: detiene los contenedores.

- [ ] **Step 3: Confirmar estado de git limpio**

Run (en la raíz):
```powershell
git status
```
Expected: "working tree clean". Todos los cambios commiteados.

---

## Definition of Done (Hito 0a)

- [ ] `pnpm install` funciona desde la raíz sin error.
- [ ] `pnpm exec supabase db reset` aplica las 3 migraciones (esquema, índices, RLS) sin error.
- [ ] `pnpm --filter @oraculo/db test` pasa los 7 tests de RLS sobre DB limpia.
- [ ] `pnpm typecheck` pasa.
- [ ] Node 20 LTS está fijado vía Volta/`.nvmrc` (listo para el plan de mobile).
- [ ] Working tree de git limpio.

**Lo que NO incluye este plan (va en Plan 0b):** paquete `validations` (Zod), paquete `core` (lógica pura), app mobile Expo, login con Supabase Auth, Drizzle local SQLite, workflow de CI.
