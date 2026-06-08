-- Categorías de sistema (household_id = NULL). UUIDs fijos → idempotente.
-- La RLS del 0a (categories_select) ya las hace legibles para todos los autenticados.
insert into public.categories (id, household_id, name, color, icon) values
  ('00000000-0000-4000-8000-000000000001', null, 'Mercado',            '#16a34a', 'shopping-cart'),
  ('00000000-0000-4000-8000-000000000002', null, 'Transporte',         '#2563eb', 'car'),
  ('00000000-0000-4000-8000-000000000003', null, 'Comida fuera',       '#f97316', 'utensils'),
  ('00000000-0000-4000-8000-000000000004', null, 'Hogar y servicios',  '#0891b2', 'home'),
  ('00000000-0000-4000-8000-000000000005', null, 'Salud',              '#dc2626', 'heart-pulse'),
  ('00000000-0000-4000-8000-000000000006', null, 'Tecnología',         '#7c3aed', 'cpu'),
  ('00000000-0000-4000-8000-000000000007', null, 'Entretenimiento',    '#db2777', 'gamepad-2'),
  ('00000000-0000-4000-8000-000000000008', null, 'Educación',          '#ca8a04', 'book-open'),
  ('00000000-0000-4000-8000-000000000009', null, 'Otros',              '#6b7280', 'ellipsis')
on conflict (id) do nothing;
