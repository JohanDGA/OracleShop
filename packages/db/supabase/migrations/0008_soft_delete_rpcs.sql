-- RPCs para soft-delete de manual_expenses y receipts.
--
-- Por qué un RPC y no un UPDATE directo del cliente:
-- PostgreSQL 14+ aplica la USING de la SELECT policy también como check
-- post-UPDATE (la fila resultante debe seguir siendo visible). Como la SELECT
-- policy filtra `deleted_at IS NULL`, setear `deleted_at = now()` desde el
-- cliente falla con "new row violates row-level security policy".
-- SECURITY DEFINER permite bypass del check y centraliza la verificación
-- de pertenencia al hogar en un solo lugar.

create or replace function public.soft_delete_manual_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
    from public.manual_expenses
    where id = p_id and deleted_at is null;

  if v_household_id is null then
    raise exception 'Gasto no existe o ya fue eliminado';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception 'No autorizado';
  end if;

  update public.manual_expenses
    set deleted_at = now(), updated_at = now()
    where id = p_id;
end;
$$;

create or replace function public.soft_delete_receipt(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
    from public.receipts
    where id = p_id and deleted_at is null;

  if v_household_id is null then
    raise exception 'Factura no existe o ya fue eliminada';
  end if;

  if not public.is_household_member(v_household_id) then
    raise exception 'No autorizado';
  end if;

  update public.receipts
    set deleted_at = now(), updated_at = now()
    where id = p_id;
end;
$$;

-- security definer requiere revocar y otorgar GRANTS explícitos al rol de la app.
revoke all on function public.soft_delete_manual_expense(uuid) from public;
revoke all on function public.soft_delete_receipt(uuid) from public;
grant execute on function public.soft_delete_manual_expense(uuid) to authenticated;
grant execute on function public.soft_delete_receipt(uuid) to authenticated;
