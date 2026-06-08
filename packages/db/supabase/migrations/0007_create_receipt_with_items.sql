-- Crea una factura (receipt) y sus líneas (receipt_items) en UNA transacción.
-- SECURITY INVOKER → respeta RLS: el usuario debe ser miembro de p_household_id
-- (lo valida la policy receipts_insert). Si algo falla, rollback (sin huérfanos).
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
    (receipt_id, raw_name, quantity, unit, unit_price, total_price, category_id, position)
    select
      v_receipt_id,
      item->>'raw_name',
      (item->>'quantity')::numeric,
      item->>'unit',
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric,
      nullif(item->>'category_id', '')::uuid,
      (row_number() over ())::int
    from jsonb_array_elements(p_items) as item;

  return v_receipt_id;
end;
$$;
