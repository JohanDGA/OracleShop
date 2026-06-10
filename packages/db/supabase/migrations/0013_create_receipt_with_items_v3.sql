-- v3: extiende la RPC para aceptar p_source (default 'manual') y persistir
-- regular_price + is_promo por item. Mantiene la cascada atómica del v2.
-- Primero eliminamos la firma anterior de 5 argumentos para evitar ambigüedad
-- de overload en PostgreSQL (la nueva firma de 6 args con DEFAULT la reemplaza).

drop function if exists public.create_receipt_with_items(
  uuid, uuid, date, text, jsonb
);

create or replace function public.create_receipt_with_items(
  p_household_id uuid,
  p_store_id uuid,
  p_purchased_at date,
  p_currency text,
  p_items jsonb,
  p_source text default 'manual'
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

  if p_source not in ('manual','photo_ai','photo_paddleocr','dian_xml') then
    raise exception 'source invalido: %', p_source;
  end if;

  -- Guard cross-household (heredado del v2)
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
    values (p_household_id, auth.uid(), p_store_id, p_purchased_at, v_total, p_currency, p_source)
    returning id into v_receipt_id;

  insert into public.receipt_items
    (receipt_id, raw_name, quantity, unit, unit_price, regular_price, is_promo,
     total_price, category_id, canonical_product_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      nullif(item->>'regular_price','')::numeric,
      coalesce((item->>'is_promo')::boolean, false),
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
