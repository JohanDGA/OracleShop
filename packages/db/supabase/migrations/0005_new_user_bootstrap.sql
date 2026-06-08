-- Bootstrap del primer hogar al crear un usuario (email o OAuth).
-- Server-side y atómico: evita la condición de carrera y el estado huérfano del
-- bootstrap en cliente. SECURITY DEFINER para saltar RLS en las inserciones.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  local_part text := split_part(coalesce(new.email, 'usuario'), '@', 1);
begin
  insert into public.households (name, created_by)
    values ('Hogar de ' || local_part, new.id)
    returning id into new_household_id;

  insert into public.household_members (household_id, user_id, role)
    values (new_household_id, new.id, 'owner');

  insert into public.user_settings (user_id, active_household_id)
    values (new.id, new_household_id);

  return new;
end;
$$;

-- El trigger vive en auth.users (creado por GoTrue). Lo (re)creamos idempotente.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
