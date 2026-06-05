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

-- Helper: ¿el usuario actual es el creador del hogar?
-- SECURITY DEFINER para poder consultar households sin que su propia RLS
-- esconda la fila (el creador aún no es miembro al hacer bootstrap).
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
-- INSERT: un miembro existente puede agregar a otros (flujo de invitación),
-- o el CREADOR del hogar puede auto-registrarse al crearlo (bootstrap).
-- NUNCA permitir que un usuario cualquiera se una a un hogar ajeno: el branch
-- "user_id = auth.uid()" sin restringir el hogar permitía escalación de privilegios.
-- Las invitaciones cross-hogar se median por el Core API con service_role.
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
