-- v2: ahora acepta canonical_product_id + alias_normalized por ítem y persiste
-- el alias atómicamente. ON CONFLICT por (canonical, alias_normalized) evita duplicados.
-- Mantiene SECURITY INVOKER y la misma firma (jsonb p_items absorbe los nuevos campos).

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

  -- Persistir el alias para que la próxima factura con el mismo raw_name
  -- resuelva en Capa 1 sin intervención del usuario.
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
