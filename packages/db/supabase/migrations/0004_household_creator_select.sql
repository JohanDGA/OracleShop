-- El creador de un hogar debe poder LEERLO aunque todavía no sea miembro.
-- Necesario para el bootstrap del primer hogar desde el cliente: el INSERT con
-- RETURNING (`.insert().select().single()`) aplica la policy de SELECT a la fila
-- devuelta, y en ese instante el creador aún no tiene fila en household_members
-- (se inserta en el paso siguiente). Sin esto, el RETURNING se filtra y el
-- registro de usuario falla dejando un hogar huérfano.
--
-- Reutiliza el helper is_household_creator (SECURITY DEFINER) ya definido en 0003,
-- simétrico con la policy household_members_insert.
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select using (
    (public.is_household_member(id) or public.is_household_creator(id))
    and deleted_at is null
  );
