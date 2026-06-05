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
