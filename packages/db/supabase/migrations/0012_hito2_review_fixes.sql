-- Fixes del review del Grupo C (Hito 2):
-- 1) CHECK que prohibe alias_normalized vacío (cierra el corruption vector del default '').
-- 2) Endurecer create_receipt_with_items v2: valida que todos los canonical_product_id
--    del payload pertenezcan al p_household_id (defiende del cross-household injection).
-- 3) Reescribir match_product con CTE para evitar evaluar similarity() dos veces por fila.

-- (1) CHECK constraint
alter table public.product_aliases
  add constraint product_aliases_normalized_non_empty
  check (length(alias_normalized) > 0)
  not valid;
-- not valid: no recheckea filas existentes (la tabla puede tener '' por el default que
-- pusimos en 0009 por seguridad de migración). En este punto la tabla está vacía en
-- entornos donde corrió 0009, así que validamos:
alter table public.product_aliases
  validate constraint product_aliases_normalized_non_empty;

-- (2) RPC create_receipt_with_items endurecida
create or replace function public.create_receipt_with_items(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at date,
  p_currency text,
  p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_receipt_id uuid;
  v_total numeric(15,4);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura necesita al menos un ítem';
  end if;

  -- Guard cross-household: cada canonical_product_id del payload (si no es null)
  -- debe pertenecer al p_household_id y no estar borrado.
  if exists (
    select 1
      from jsonb_array_elements(p_items) as item
      where nullif(item->>'canonical_product_id', '') is not null
        and not exists (
          select 1 from public.canonical_products cp
          where cp.id = (item->>'canonical_product_id')::uuid
            and cp.household_id = p_household_id
            and cp.deleted_at is null
        )
  ) then
    raise exception 'canonical_product_id no pertenece al hogar';
  end if;

  select coalesce(sum((item->>'total_price')::numeric), 0)
    into v_total
    from jsonb_array_elements(p_items) as item;

  insert into public.receipts
    (household_id, created_by, store_id, purchased_at, total, currency, source)
    values (p_household_id, auth.uid(), p_store_id, p_purchased_at, v_total, p_currency, 'manual')
    returning id into v_receipt_id;

  insert into public.receipt_items
    (receipt_id, raw_name, quantity, unit, unit_price, total_price, category_id,
     canonical_product_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric,
      nullif(item->>'category_id', '')::uuid,
      nullif(item->>'canonical_product_id', '')::uuid,
      (row_number() over ())::int
    from jsonb_array_elements(p_items) as item;

  insert into public.product_aliases
    (canonical_product_id, alias, alias_normalized, source, confidence)
  select
    (item->>'canonical_product_id')::uuid,
    item->>'raw_name',
    item->>'alias_normalized',
    'user_confirmed',
    1.0
  from jsonb_array_elements(p_items) as item
  where nullif(item->>'canonical_product_id', '') is not null
    and nullif(item->>'alias_normalized', '') is not null
  on conflict (canonical_product_id, alias_normalized) do nothing;

  return v_receipt_id;
end;
$$;

-- (3) match_product con CTE (similarity evaluada una vez por fila)
create or replace function public.match_product(
  p_household_id uuid,
  p_normalized text,
  p_min_similarity numeric default 0.6
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_exact jsonb;
  v_fuzzy jsonb;
begin
  if coalesce(trim(p_normalized), '') = '' then
    return jsonb_build_object('exact', null, 'fuzzy', '[]'::jsonb);
  end if;

  select jsonb_build_object('canonical_id', cp.id, 'name', cp.name, 'confidence', 1.0)
    into v_exact
    from public.product_aliases pa
    join public.canonical_products cp on cp.id = pa.canonical_product_id
    where pa.alias_normalized = p_normalized
      and cp.household_id = p_household_id
      and cp.deleted_at is null
    limit 1;

  if v_exact is not null then
    return jsonb_build_object('exact', v_exact, 'fuzzy', '[]'::jsonb);
  end if;

  with scored as (
    select cp.id as canonical_id,
           cp.name,
           similarity(pa.alias_normalized, p_normalized) as score
      from public.product_aliases pa
      join public.canonical_products cp on cp.id = pa.canonical_product_id
      where cp.household_id = p_household_id
        and cp.deleted_at is null
  ),
  hits as (
    select canonical_id, name, max(score) as score
      from scored
      where score >= p_min_similarity
      group by canonical_id, name
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('canonical_id', canonical_id, 'name', name, 'score', score)
              order by score desc),
    '[]'::jsonb
  )
  into v_fuzzy
  from (select * from hits order by score desc limit 3) t;

  return jsonb_build_object('exact', null, 'fuzzy', v_fuzzy);
end;
$$;
